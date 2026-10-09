import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createApi, createFirebaseServices } from '../src/server.mjs';
import { createReadCache } from '../src/read-cache.mjs';
import { createQuotaBackoff } from '../src/firebase-errors.mjs';
import { startExpiryWorker, terminalPending } from '../src/transactions.mjs';
import { DEFAULT_PRICING } from '../src/pricing.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

function countedDatabase(initial = {}) {
  const raw = memoryFirestore(initial), reads = [];
  const wrap = (reference, label) => new Proxy(reference, {
    get(target, key) {
      if (key === 'get') return async () => { const result = await target.get(); reads.push({ label, documents: result.size ?? Number(result.exists) }); return result; };
      if (['doc', 'where', 'orderBy', 'limit'].includes(key)) return (...args) => wrap(target[key](...args), `${label}.${key}(${JSON.stringify(args)})`);
      return target[key];
    }
  });
  return { raw, reads, db: { ...raw, collection: name => wrap(raw.collection(name), name) } };
}

test('display models share collection reads, and saved equipment invalidates all affected models', async () => {
  const fixture = countedDatabase({ item_categories: { sports: { name: 'Sports equipment' } }, users: { admin: { full_name: 'Admin', role: 'ADMIN', is_active: true } } });
  const services = createFirebaseServices({ db: fixture.db });
  await Promise.all([services.dashboard(), services.workspace('ADMIN'), services.inventoryList()]);
  assert.equal(fixture.reads.length, 15); // Shared display reads plus two due-only expiry queries.
  for (const name of ['items', 'item_categories', 'item_rates', 'rentals', 'customers', 'verification_requests', 'terminals']) assert.equal(fixture.reads.filter(read => read.label === name).length, 1);
  await Promise.all([services.dashboard(), services.workspace('ADMIN'), services.inventoryList()]);
  assert.equal(fixture.reads.length, 15);
  const created = await services.createItem('admin', { categoryId: 'sports', name: 'Basketball', condition: 'GOOD', rateType: 'HOURLY', rentalRate: 50, deposit: 100, latePenalty: 10 });
  const [dashboard, workspace, inventory] = await Promise.all([services.dashboard(), services.workspace('ADMIN'), services.inventoryList()]);
  assert.equal(dashboard.items[0].id, created.id); assert.equal(workspace.items[0].id, created.id); assert.equal(inventory.items[0].id, created.id);
  assert.equal(dashboard.stats.available, 1);
  // A cached display never authorizes a quote or keeps a disabled user active.
  await fixture.raw.collection('items').doc(created.id).update({ status: 'RENTED', pricing_product_id: DEFAULT_PRICING.products[0].id });
  assert.equal((await services.inventoryList()).items[0].status, 'AVAILABLE');
  await assert.rejects(services.pricingQuote({ itemId: created.id, mode: 'HOURLY', hours: 1 }), error => error.status === 409);
  await fixture.raw.collection('users').doc('admin').update({ is_active: false });
  assert.equal((await services.getUser('admin')).is_active, false);
});

test('manual dashboard refresh clears every display snapshot, including workspace-only data', async () => {
  const invalidations = [];
  const server = createApi({
    sessions: { verify: async token => token === 'admin-session' ? { uid: 'admin' } : null },
    services: {
      getUser: async id => ({ id, role: 'ADMIN', is_active: true }),
      dashboard: async () => ({ stats: {} }),
      invalidateReadCache: (...args) => invalidations.push(args)
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/dashboard`, {
      headers: { Cookie: 'rent_play_session=admin-session', 'Cache-Control': 'no-cache' }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(invalidations, [[]]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('invalidating an in-flight read cannot repopulate stale data, and expired entries refresh', async () => {
  let finishOld, reads = 0, clock = 1000;
  const db = { collection: () => ({ get: () => ++reads === 1 ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ revision: reads }) }) };
  const cache = createReadCache(db, { ttlMs: 100, now: () => clock });
  const old = cache.database.collection('items').get(); await Promise.resolve();
  cache.invalidate();
  assert.equal((await cache.database.collection('items').get()).revision, 2);
  finishOld({ revision: 1 }); await old;
  assert.equal((await cache.database.collection('items').get()).revision, 2);
  clock += 101;
  assert.equal((await cache.database.collection('items').get()).revision, 3);
});

test('failed collection reads remain retryable and concurrent readers share one failure', async () => {
  let reads = 0;
  const cache = createReadCache({ collection: () => ({ get: async () => { if (++reads === 1) throw Object.assign(new Error('Quota exceeded.'), { code: 8 }); return { recovered: true }; } }) });
  const results = await Promise.allSettled([cache.database.collection('items').get(), cache.database.collection('items').get()]);
  assert.ok(results.every(result => result.status === 'rejected')); assert.equal(reads, 1);
  assert.equal((await cache.database.collection('items').get()).recovered, true); assert.equal(reads, 2);
});

test('quota errors identify the limit, suppress more database reads, and allow logout and password reset', async () => {
  let reads = 0, healthReads = 0, resets = 0;
  const services = { getUser: async () => { reads++; throw Object.assign(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.'), { code: 8, status: 'RESOURCE_EXHAUSTED' }); }, health: async () => { healthReads++; } };
  const sessions = { verify: async token => token === 'test-cookie' ? { uid: 'admin' } : null, revoke() {}, sendPasswordReset: async () => { resets++; } };
  const server = createApi({ services, sessions });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`, headers = { Cookie: 'rent_play_session=test-cookie', 'Content-Type': 'application/json' };
  try {
    const inventory = await fetch(base + '/inventory', { headers });
    assert.equal(inventory.status, 429); assert.equal(inventory.headers.get('retry-after'), '300');
    const body = await inventory.json(); assert.equal(body.code, 'FIRESTORE_QUOTA_EXCEEDED'); assert.match(body.error, /usage limit/); assert.ok(!body.error.includes('configuration'));
    assert.equal((await fetch(base + '/dashboard', { headers })).status, 429); assert.equal(reads, 1);
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.database, false); assert.equal(health.code, 'FIRESTORE_QUOTA_EXCEEDED'); assert.equal(healthReads, 0);
    const logout = await fetch(base + '/auth/logout', { method: 'POST', headers });
    assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await fetch(base + '/auth/password-reset', { method: 'POST', headers, body: JSON.stringify({ email: 'admin@example.test' }) })).status, 200); assert.equal(resets, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('quota cooldown ends on schedule and repeated requests cannot extend it', () => {
  let clock = 1000;
  const backoff = createQuotaBackoff({ now: () => clock, cooldownMs: 300000 });
  backoff.record({ code: 'RESOURCE_EXHAUSTED' });
  assert.throws(() => backoff.assertAvailable(), error => error.retryAfterSeconds === 300);
  clock += 299000; backoff.record({ code: 8 });
  assert.throws(() => backoff.assertAvailable(), error => error.retryAfterSeconds === 1);
  clock += 1000; assert.doesNotThrow(() => backoff.assertAvailable());
});

test('health and protected endpoints distinguish missing configuration from a temporary database outage', async () => {
  for (const [code, expected] of [['FIREBASE_CONFIG', 'FIREBASE_CONFIGURATION_ERROR'], [14, 'FIREBASE_UNAVAILABLE']]) {
    const fail = async () => { throw Object.assign(new Error(code === 14 ? 'Connection unavailable.' : 'FIREBASE_PROJECT_ID is not configured.'), { code }); };
    const server = createApi({ services: { health: fail, getUser: fail }, sessions: { verify: async () => ({ uid: 'admin' }) } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    try {
      const health = await (await fetch(base + '/health')).json();
      assert.equal(health.database, false); assert.equal(health.code, expected);
      const inventory = await fetch(base + '/inventory');
      assert.equal(inventory.status, 503); assert.equal((await inventory.json()).code, expected);
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
});

test('expiry worker backs off on quota exhaustion and resumes when the cooldown ends', async () => {
  let clock = 1000, attempts = 0, reportError, reportRecovery;
  const first = new Promise(resolve => { reportError = resolve; }), recovered = new Promise(resolve => { reportRecovery = resolve; });
  const stop = startExpiryWorker({}, { intervalMs: 5, now: () => clock,
    sweep: async () => { attempts++; if (attempts === 1) throw Object.assign(new Error('Quota exceeded.'), { code: 8 }); reportRecovery(); }, onError: reportError });
  try {
    await first; await delay(25); assert.equal(attempts, 1);
    clock += 300000; await recovered; assert.equal(attempts, 2);
  } finally { stop(); }
});

test('device polling reads only pending requests and throttles healthy terminal heartbeat writes', async () => {
  const now = new Date('2026-10-06T02:00:00Z'), lastSeen = new Date(now.getTime() - 1000);
  const terminal = { id: 'counter', status: 'ONLINE', last_seen_at: lastSeen };
  const fixture = countedDatabase({ terminals: { counter: terminal }, rentals: { rental: { rental_code: 'R-1', due_at: now } }, verification_requests: {
    old: { terminal_id: 'counter', status: 'CONFIRMED' }, other: { terminal_id: 'another', status: 'PENDING' },
    pending: { terminal_id: 'counter', status: 'PENDING', rental_id: 'rental', transaction_type: 'RENTAL', requested_at: now }
  } });
  const result = await terminalPending(fixture.db, terminal, now, { expire: async () => {} });
  assert.equal(result.requests.length, 1); assert.equal(result.requests[0].id, 'pending');
  assert.equal(fixture.reads[0].documents, 1); assert.equal(fixture.raw.data('terminals', 'counter').last_seen_at.getTime(), lastSeen.getTime());
  const later = new Date(now.getTime() + 30000);
  await terminalPending(fixture.db, terminal, later, { expire: async () => {} });
  assert.equal(fixture.raw.data('terminals', 'counter').last_seen_at.getTime(), later.getTime());
});
