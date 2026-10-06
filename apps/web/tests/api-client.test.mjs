import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api-client.js';

const response = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });

test('database quota errors pause polling and repeated refreshes, then permit recovery', async () => {
  let clock = 0, requests = 0;
  const client = createApiClient({ now: () => clock, fetcher: async () => ++requests === 1 ? response(429, { code: 'FIRESTORE_QUOTA_EXCEEDED', error: 'Database usage limit reached.', retryAfterSeconds: 300 }) : response(200, { recovered: true }) });
  await assert.rejects(client.request('/dashboard'), error => error.status === 429 && error.code === 'FIRESTORE_QUOTA_EXCEEDED');
  assert.equal(client.canRefresh(), false);
  for (const path of ['/dashboard', '/workspace', '/inventory', '/rentals']) await assert.rejects(client.request(path), /usage limit/);
  assert.equal(requests, 1);
  clock = 300000; assert.equal(client.canRefresh(), true);
  assert.deepEqual(await client.request('/inventory'), { recovered: true }); assert.equal(requests, 2);
});

test('quota cooldown keeps logout and password reset usable without bypassing database protection', async () => {
  const requests = [];
  const client = createApiClient({ now: () => 0, fetcher: async path => { requests.push(path); return path === '/api/inventory' ? response(429, { code: 'FIRESTORE_QUOTA_EXCEEDED', error: 'Quota reached.' }) : response(200, { ok: true }); } });
  await assert.rejects(client.request('/inventory'));
  await client.request('/auth/logout', { method: 'POST' }); await client.request('/auth/password-reset', { method: 'POST' }); await client.request('/health');
  await assert.rejects(client.request('/pricing/quote', { method: 'POST' }));
  assert.deepEqual(requests, ['/api/inventory', '/api/auth/logout', '/api/auth/password-reset', '/api/health']);
});

test('a limited health response pauses database polling, while login rate limits do not', async () => {
  const health = createApiClient({ now: () => 0, fetcher: async () => response(200, { database: false, code: 'FIRESTORE_QUOTA_EXCEEDED', warning: 'Quota reached.', retryAfterSeconds: 120 }) });
  assert.equal((await health.request('/health')).database, false); assert.equal(health.canRefresh(), false);
  let reads = 0;
  const auth = createApiClient({ fetcher: async () => ++reads === 1 ? response(429, { error: 'Too many login attempts.' }) : response(200, { ok: true }) });
  await assert.rejects(auth.request('/auth/login'), error => error.status === 429);
  assert.equal(auth.canRefresh(), true); assert.equal((await auth.request('/dashboard')).ok, true);
});

test('requests preserve session cookies, explicit refresh headers, and server error status', async () => {
  let options;
  const client = createApiClient({ fetcher: async (_, value) => { options = value; return response(401, { error: 'Please sign in.' }); } });
  await assert.rejects(client.request('/workspace', { headers: { 'Cache-Control': 'no-cache' } }), error => error.status === 401);
  assert.equal(options.credentials, 'same-origin'); assert.equal(options.headers['Cache-Control'], 'no-cache'); assert.equal(options.headers['Content-Type'], 'application/json');
});
