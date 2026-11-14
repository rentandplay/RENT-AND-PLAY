import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/server.mjs';

test('API protects dashboard, uses Firebase session cookies, checks profiles, and clears logout', async () => {
  const row = { id: 'firebase-uid', full_name: 'Test Admin', email: 'admin@example.test', role: 'ADMIN', is_active: true };
  const signedIn = [];
  const revoked = new Set();
  const sessions = { signIn: async (email, password) => { signedIn.push({ email, password }); return password === 'test-password-with-length' ? { uid: row.id, cookie: 'signed-cookie', seconds: 28800 } : null; }, verify: async token => token === 'signed-cookie' && !revoked.has(token) ? { uid: row.id } : null, revoke: token => revoked.add(token) };
  const services = { health: async () => { }, getUser: async id => id === row.id ? row : null, touchLogin: async () => { }, dashboard: async () => ({ stats: { active: 0 } }), inventoryList: async () => ({ items: [], categories: [] }), workspace: async role => ({ role, customers: [] }), createCustomer: async (actor, input) => ({ id: 'customer-1', actor, ...input }), saveSettings: async (actor, input) => input };
  const server = createApi({ services, sessions });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/dashboard')).status, 401);
    assert.equal((await fetch(base + '/api/rental-events')).status, 204);
    assert.equal((await fetch(base + '/api/inventory')).status, 401);
    assert.equal((await fetch(base + '/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    const login = async (password, headers = {}) => fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ email: row.email, password }) });
    assert.equal((await login('incorrect')).status, 401);
    assert.equal((await login('test-password-with-length', { Origin: 'https://untrusted.example' })).status, 403);
    const response = await login('test-password-with-length');
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    assert.equal((await fetch(base + '/api/inventory/1', { method: 'PATCH', headers: { Cookie: cookie, Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await response.json()).user.password_hash, undefined);
    const dashboard = await fetch(base + '/api/dashboard', { headers: { Cookie: cookie } });
    assert.equal(dashboard.status, 200);
    const eventStream = await fetch(base + '/api/rental-events', { headers: { Cookie: cookie } });
    assert.equal(eventStream.status, 200);
    assert.match(eventStream.headers.get('content-type'), /text\/event-stream/);
    const eventReader = eventStream.body.getReader();
    const readyFrame = await eventReader.read();
    assert.match(new TextDecoder().decode(readyFrame.value), /event: ready/);
    await eventReader.cancel();
    const workspace = await fetch(base + '/api/workspace', { headers: { Cookie: cookie } }); assert.equal(workspace.status, 200); assert.equal((await workspace.json()).role, 'OPERATOR');
    const customer = await fetch(base + '/api/customers', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: 'Customer' }) }); assert.equal(customer.status, 201);
    row.role = 'user';
    assert.equal((await fetch(base + '/api/dashboard', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await login('test-password-with-length')).status, 403);
    row.role = 'OWNER';
    const ownerLogin = await login('test-password-with-length');
    assert.equal(ownerLogin.status, 200);
    assert.equal((await ownerLogin.json()).user.role, 'OWNER');
    row.role = 'admin';
    const lowercaseLogin = await login('test-password-with-length');
    assert.equal(lowercaseLogin.status, 200);
    assert.equal((await lowercaseLogin.json()).user.role, 'OPERATOR');
    row.role = 'admin';
    const lowercaseWorkspace = await fetch(base + '/api/workspace', { headers: { Cookie: cookie } });
    assert.equal(lowercaseWorkspace.status, 200);
    assert.equal((await lowercaseWorkspace.json()).role, 'OPERATOR');
    row.is_active = 0;
    assert.equal((await fetch(base + '/api/dashboard', { headers: { Cookie: cookie } })).status, 401);
    row.is_active = 1;
    const next = await login('test-password-with-length');
    const nextCookie = next.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: nextCookie } })).status, 200);
    assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: nextCookie } })).status, 401);
    assert.ok(signedIn.some(entry => entry.email === row.email));
    for (const [pagePath, marker] of [
      ['/privacy-policy', /Privacy Policy/],
      ['/delete-account', /Delete Account/]
    ]) {
      const pageRes = await fetch(base + pagePath);
      assert.equal(pageRes.status, 200);
      assert.match(pageRes.headers.get('content-type') || '', /text\/html/);
      assert.match(await pageRes.text(), marker);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Remember me on this device sets persistent 14-day cookie, restores rememberSession across restarts, and respects COOKIE_SECURE', async () => {
  const row = { id: 'owner-1', full_name: 'Owner', email: 'owner@example.test', role: 'OWNER', is_active: true };
  const iat = Math.floor(Date.now() / 1000);
  const auth = {
    createSessionCookie: async (_idToken, { expiresIn }) => expiresIn > 8 * 3600 * 1000 ? 'remembered-cookie' : 'standard-cookie',
    verifySessionCookie: async token => token === 'remembered-cookie'
      ? { uid: row.id, iat, exp: iat + 14 * 86400 }
      : token === 'standard-cookie'
        ? { uid: row.id, iat, exp: iat + 8 * 3600 }
        : Promise.reject(new Error('invalid'))
  };
  const { FirebaseSessions } = await import('../src/auth.mjs');
  const beforeEnv = { project: process.env.FIREBASE_PROJECT_ID, key: process.env.FIREBASE_WEB_API_KEY, nodeEnv: process.env.NODE_ENV, cookieSecure: process.env.COOKIE_SECURE };
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  process.env.FIREBASE_WEB_API_KEY = 'test-key';

  const makeSessions = () => new FirebaseSessions(auth, async () => ({ ok: true, json: async () => ({ idToken: 'id-token', localId: row.id }) }));
  const services = { health: async () => {}, getUser: async id => id === row.id ? row : null, touchLogin: async () => {} };

  try {
    // 1. Login without remember => browser-session cookie (no Max-Age/Expires)
    const server1 = createApi({ services, sessions: makeSessions() });
    await new Promise(resolve => server1.listen(0, '127.0.0.1', resolve));
    const base1 = `http://127.0.0.1:${server1.address().port}`;
    let rememberedPair;
    try {
      const standardLogin = await fetch(base1 + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: row.email, password: 'password123', remember: false })
      });
      assert.equal(standardLogin.status, 200);
      const standardCookieHeader = standardLogin.headers.get('set-cookie');
      assert.doesNotMatch(standardCookieHeader, /Max-Age=/i);
      assert.doesNotMatch(standardCookieHeader, /Expires=/i);
      assert.equal((await standardLogin.json()).rememberSession, false);

      // 2. Login with remember: true => persistent 14-day cookie with Max-Age=1209600 & Expires
      const rememberedLogin = await fetch(base1 + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: row.email, password: 'password123', remember: true })
      });
      assert.equal(rememberedLogin.status, 200);
      const rememberedCookieHeader = rememberedLogin.headers.get('set-cookie');
      assert.match(rememberedCookieHeader, /Max-Age=1209600/);
      assert.match(rememberedCookieHeader, /Expires=/);
      assert.equal((await rememberedLogin.json()).rememberSession, true);
      rememberedPair = rememberedCookieHeader.split(';')[0];

      // 3. Explicit COOKIE_SECURE=false overrides NODE_ENV=production on plain HTTP; x-forwarded-proto=https still forces Secure
      process.env.NODE_ENV = 'production';
      process.env.COOKIE_SECURE = 'false';
      const httpProdLogin = await fetch(base1 + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: row.email, password: 'password123', remember: true })
      });
      assert.doesNotMatch(httpProdLogin.headers.get('set-cookie'), /;\s*Secure/i);

      const httpsProxyLogin = await fetch(base1 + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
        body: JSON.stringify({ email: row.email, password: 'password123', remember: true })
      });
      assert.match(httpsProxyLogin.headers.get('set-cookie'), /;\s*Secure/i);
    } finally {
      await new Promise(resolve => server1.close(resolve));
    }

    // 4. Simulate server restart (fresh FirebaseSessions instance with empty activeSessions)
    const server2 = createApi({ services, sessions: makeSessions() });
    await new Promise(resolve => server2.listen(0, '127.0.0.1', resolve));
    const base2 = `http://127.0.0.1:${server2.address().port}`;
    try {
      const me = await fetch(base2 + '/api/auth/me', { headers: { Cookie: rememberedPair } });
      assert.equal(me.status, 200);
      const meBody = await me.json();
      assert.equal(meBody.rememberSession, true);

      const listResp = await fetch(base2 + '/api/auth/sessions', { headers: { Cookie: rememberedPair } });
      assert.equal(listResp.status, 200);
      const { sessions: list } = await listResp.json();
      assert.equal(list.length, 1);
      assert.equal(list[0].remember, true);
      assert.equal(list[0].is_current, true);
    } finally {
      await new Promise(resolve => server2.close(resolve));
    }
  } finally {
    beforeEnv.project === undefined ? delete process.env.FIREBASE_PROJECT_ID : process.env.FIREBASE_PROJECT_ID = beforeEnv.project;
    beforeEnv.key === undefined ? delete process.env.FIREBASE_WEB_API_KEY : process.env.FIREBASE_WEB_API_KEY = beforeEnv.key;
    beforeEnv.nodeEnv === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = beforeEnv.nodeEnv;
    beforeEnv.cookieSecure === undefined ? delete process.env.COOKIE_SECURE : process.env.COOKIE_SECURE = beforeEnv.cookieSecure;
  }
});
