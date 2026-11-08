import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, createFirebaseServices } from '../src/server.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';
import { createSupabaseFirestore } from '../src/supabase.mjs';

const now = new Date('2026-11-09T00:00:00Z');
const claims = { uid: 'customer', email: 'customer@example.test', email_verified: true, name: 'Test Customer' };

test('existing customer profile POST can repeat without out-of-scope changes or duplicate events', async () => {
  const db = memoryFirestore({
    users: { customer: { full_name: 'Test Customer', email: claims.email, role: 'CUSTOMER', is_active: true } },
    customers: { customer: { full_name: 'Test Customer', email: claims.email, auth_uid: 'customer', customer_code: 'CUST-001' } }
  });
  const services = createFirebaseServices({ db, now: () => now });
  const events = [];
  const unsubscribe = services.subscribeCustomerChanges(change => events.push(change));
  for (let i = 0; i < 3; i++) {
    const result = await services.mobileProfile(claims, {}, 'POST');
    assert.equal(result.user.id, 'customer');
    assert.equal(result.created, false);
  }
  assert.equal(events.length, 0);
  const result = await services.mobileProfile(claims, { name: 'Updated Customer' }, 'PATCH');
  assert.equal(result.user.full_name, 'Updated Customer');
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'updated');
  unsubscribe();
  await services.mobileProfile(claims, { name: 'Another Name' }, 'PATCH');
  assert.equal(events.length, 1);
});

test('new customer profile creation publishes through the service subscription without a global event hub', async () => {
  const services = createFirebaseServices({ db: memoryFirestore({}), now: () => now });
  const events = [];
  services.subscribeCustomerChanges(change => events.push(change));
  const result = await services.mobileProfile(claims, { name: 'Test Customer' }, 'POST');
  assert.equal(result.created, true);
  assert.equal(result.customerCreated, true);
  assert.deepEqual(events, [{ customerId: 'customer', customerName: 'Test Customer', action: 'registered' }]);
});

test('readiness reports failure and times out, then recovers without a process restart', async () => {
  let state = 'hang';
  const server = createApi({ healthTimeoutMs: 25, services: { health: async () => {
    if (state === 'hang') return new Promise(() => {});
    if (state === 'fail') throw Error('Upstream unavailable');
  } }, sessions: { verify: async () => null } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(base + '/api/ready');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).ready, false);
    state = 'fail';
    response = await fetch(base + '/api/ready'); assert.equal(response.status, 503);
    response = await fetch(base + '/api/health'); assert.equal(response.status, 200);
    assert.equal((await response.json()).database, false);
    state = 'healthy';
    response = await fetch(base + '/api/ready'); assert.equal(response.status, 200);
    assert.equal((await response.json()).ready, true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('a stalled Supabase read is aborted and a later read can recover', async () => {
  let calls = 0;
  const db = createSupabaseFirestore({ url: 'https://example.supabase.co', serviceRoleKey: 'test-key', requestTimeoutMs: 20,
    fetcher: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      if (++calls === 1) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
      return { ok: true, json: async () => ({ id: 'missing', exists: false, data: null, version: 0 }) };
    }
  });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(db.collection('users').doc('missing').get(), error => error.name === 'TimeoutError');
    assert.equal((await db.collection('users').doc('missing').get()).exists, false);
  } finally { clearTimeout(keepAlive); }
});
