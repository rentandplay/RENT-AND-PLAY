import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api-client.js';
import { publicErrorMessage } from '../src/request-errors.js';

const response = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });

test('database quota errors pause polling and repeated refreshes, then permit recovery', async () => {
  let clock = 0, requests = 0;
  const client = createApiClient({ now: () => clock, fetcher: async () => ++requests === 1 ? response(429, { code: 'FIRESTORE_QUOTA_EXCEEDED', error: 'Database usage limit reached.', retryAfterSeconds: 300 }) : response(200, { recovered: true }) });
  await assert.rejects(client.request('/dashboard'), error => error.status === 429 && error.code === 'FIRESTORE_QUOTA_EXCEEDED');
  assert.equal(client.canRefresh(), false);
  for (const path of ['/dashboard', '/workspace', '/inventory', '/rentals']) await assert.rejects(client.request(path), /busy right now/);
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

test('service failures never show infrastructure details, while business validation stays useful', async () => {
  for (const message of ['Supabase SQL error: service_role at localhost:3000', 'TypeError: Cannot read properties of null', '<html>Bad gateway</html>']) {
    const client = createApiClient({ fetcher: async () => response(503, { error: message }) });
    await assert.rejects(client.request('/inventory'), error => /temporarily unavailable/.test(error.message) && !/Supabase|SQL|localhost|TypeError|<html>/.test(error.message));
  }
  assert.equal(publicErrorMessage({ status: 409, message: 'This unit has already been rented.' }), 'This unit has already been rented.');
  assert.equal(publicErrorMessage({ status: 401, message: 'Email or password is incorrect.' }), 'Email or password is incorrect.');
  assert.match(publicErrorMessage({ status: 401, message: 'Please sign in.' }), /sign in again/);
  assert.equal(publicErrorMessage({ status: 429, message: 'Too many attempts. Try again in 15 minutes.' }), 'Too many attempts. Try again in 15 minutes.');
  assert.match(publicErrorMessage({ status: 403 }), /permission/);
  assert.match(publicErrorMessage({ status: 401 }), /sign in again/);
});

test('HTML, null, arrays, and incomplete list responses are errors instead of successful empty lists', async () => {
  const values = [null, [], 'Bad Gateway'];
  for (const value of values) {
    const client = createApiClient({ fetcher: async () => response(200, value) });
    await assert.rejects(client.request('/inventory'), error => error.code === 'INVALID_RESPONSE');
  }
  for (const path of ['/auth/sessions', '/security/alerts?limit=15', '/chat/threads?status=OPEN', '/chat/threads/t1/messages']) {
    await assert.rejects(createApiClient({ fetcher: async () => response(200, {}) }).request(path), error => error.code === 'INVALID_RESPONSE');
  }
  await assert.rejects(createApiClient({ fetcher: async () => ({ ...response(502, {}), json: async () => { throw new SyntaxError('Unexpected token <'); } }) }).request('/dashboard'), error => error.status === 502 && !error.message.includes('Unexpected token'));
});

test('an uncertain save retains status and warns against blindly repeating, without automatic writes', async () => {
  let writes = 0;
  const client = createApiClient({ fetcher: async () => { writes++; throw new TypeError('Failed to fetch'); } });
  await assert.rejects(client.request('/rentals', { method: 'POST' }), error => error.code === 'NETWORK' && error.outcomeUnknown && /Check the record before trying again/.test(error.message));
  assert.equal(writes, 1);
  await assert.rejects(client.request('/rentals'), error => !error.outcomeUnknown && !/result could not be confirmed/.test(error.message));
});

test('the timeout covers a slow response body and releases the request for retry', async () => {
  const client = createApiClient({ timeoutMs: 10, fetcher: async (_, { signal }) => ({ ...response(200, {}), json: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }) });
  await assert.rejects(client.request('/dashboard'), error => error.code === 'TIMEOUT' && /longer than expected/.test(error.message));
});

test('offline and cancelled reads have actionable messages', async () => {
  assert.match(publicErrorMessage({ code: 'OFFLINE' }), /Reconnect/);
  const controller = new AbortController(); controller.abort();
  const client = createApiClient({ fetcher: async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); } });
  await assert.rejects(client.request('/inventory', { signal: controller.signal }), error => error.code === 'CANCELLED' && !error.outcomeUnknown);
});
