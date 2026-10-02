import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nodePath from 'node:path';
import { FirebaseSessions, publicUser } from './auth.mjs';
import { firebaseAuth, firestore, requireFirebaseConfig } from './firebase.mjs';
import { loadDashboard } from './dashboard.mjs';
import { inventoryList, inventoryDetail, inventoryQr, inventoryQrLabels, createItem, updateItem, itemAction } from './inventory.mjs';
import { updateProfile } from './profile.mjs';
import { loadWorkspace, createCustomer, updateCustomer, saveRate, savePricing, saveSettings, createWorkspaceUser, updateWorkspaceUser } from './workspace.mjs';
import { loadPricing, quoteRental } from './pricing.mjs';

const webRoot = nodePath.resolve(fileURLToPath(new URL('../../web/dist/', import.meta.url)));
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function serveWeb(req, res, requestPath) {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(requestPath); } catch { res.writeHead(400).end(); return; }
  let target = nodePath.resolve(webRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(webRoot + nodePath.sep)) { res.writeHead(403).end(); return; }
  try {
    let content;
    try { content = await readFile(target); }
    catch (error) {
      if (error.code !== 'ENOENT' || nodePath.extname(pathname)) throw error;
      target = nodePath.join(webRoot, 'index.html'); content = await readFile(target);
    }
    res.writeHead(200, { 'Content-Type': contentTypes[nodePath.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') res.end(); else res.end(content);
  } catch { res.writeHead(404).end('Not found'); }
}

const defaultServices = {
  async health() { requireFirebaseConfig(); await firestore.collection('users').limit(1).get(); },
  async getUser(id) { const doc = await firestore.collection('users').doc(String(id)).get(); return doc.exists ? { id: doc.id, ...doc.data() } : null; },
  async touchLogin(id) { await firestore.collection('users').doc(String(id)).update({ last_login_at: new Date() }); },
  updateProfile: (id, input) => updateProfile(firebaseAuth, firestore, id, input),
  dashboard: () => loadDashboard(firestore),
  inventoryList: () => inventoryList(firestore), inventoryDetail: id => inventoryDetail(firestore, id), inventoryQr: id => inventoryQr(firestore, id), inventoryQrLabels: () => inventoryQrLabels(firestore),
  createItem: (actor, input) => createItem(firestore, actor, input), updateItem: (actor, id, input) => updateItem(firestore, actor, id, input), itemAction: (actor, id, input) => itemAction(firestore, actor, id, input),
  workspace: role => loadWorkspace(firestore, role), pricing: () => loadPricing(firestore, { allowInvalidFallback: true }), savePricing: (actor, input) => savePricing(firestore, actor, input),
  pricingQuote: async input => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Rental quote details are required.'), { status: 400 });
    const pricing = await loadPricing(firestore); let productId = input.productId;
    if (input.itemId) {
      const itemId = String(input.itemId);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(itemId)) throw Object.assign(new Error('Invalid equipment ID.'), { status: 400 });
      const item = await firestore.collection('items').doc(itemId).get();
      if (!item.exists) throw Object.assign(new Error('Equipment not found.'), { status: 404 });
      const record = item.data();
      if (record.is_active === false || record.status !== 'AVAILABLE') throw Object.assign(new Error('This equipment is not available for rental.'), { status: 409 });
      const openRentals = await firestore.collection('rentals').where('item_id', '==', itemId).get();
      if (openRentals.docs.some(doc => ['ACTIVE', 'PENDING_VERIFICATION'].includes(doc.data().status))) throw Object.assign(new Error('This equipment already has an open rental.'), { status: 409 });
      productId = record.pricing_product_id;
      if (!productId) throw Object.assign(new Error('Link this equipment to a client rate sheet product before quoting.'), { status: 400 });
    }
    return quoteRental(pricing, { ...input, productId });
  },
  createCustomer: (actor, input) => createCustomer(firestore, actor, input), updateCustomer: (id, input) => updateCustomer(firestore, id, input), saveRate: (actor, input) => saveRate(firestore, actor, input), saveSettings: input => saveSettings(firestore, input), createUser: input => createWorkspaceUser(firebaseAuth, firestore, input), updateUser: (actor, id, input) => updateWorkspaceUser(firebaseAuth, firestore, actor, id, input)
};

export function createApi({ services = defaultServices, sessions = new FirebaseSessions() } = {}) {
  const attempts = new Map();
  const origins = new Set([process.env.WEB_ORIGIN || 'http://127.0.0.1:5173', 'http://localhost:5173']);
  function send(res, status, value, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(value)); }
  function cookie(value, seconds, persistent = false) { return `rent_play_session=${value}; HttpOnly; SameSite=Strict; Path=/${persistent ? `; Max-Age=${seconds}` : ''}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`; }
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON body required.'), { status: 415 });
    let value = ''; for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value) > 8192) throw Object.assign(new Error('Request is too large.'), { status: 413 }); }
    try { return JSON.parse(value); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
  }
  return http.createServer(async (req, res) => {
    const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
    if (!requestPath.startsWith('/api/')) return serveWeb(req, res, requestPath);
    const path = requestPath;
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('rent_play_session='))?.slice('rent_play_session='.length);
    try {
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && ((req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site')) return send(res, 403, { error: 'Request origin is not allowed.' });
      if (path === '/api/auth/logout' && req.method === 'POST') { if (await sessions.verify(token)) sessions.revoke?.(token); return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0, true) }); }
      if (path === '/api/health' && req.method === 'GET') { await services.health(); return send(res, 200, { database: true, provider: 'firebase' }); }
      if (path === '/api/auth/password-reset' && req.method === 'POST') {
        const input = await body(req), email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email address.' });
        await sessions.sendPasswordReset(email).catch(() => { }); return send(res, 200, { ok: true });
      }
      if (path === '/api/auth/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress, now = Date.now(); for (const [key, value] of attempts) if (now - value.since > 900000) attempts.delete(key);
        const entry = attempts.get(ip) || { since: now, count: 0 }; if (entry.count >= 10) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }); attempts.set(ip, { ...entry, count: entry.count + 1 });
        const input = await body(req); if (typeof input?.email !== 'string' || typeof input?.password !== 'string' || input.email.length > 191 || input.password.length > 1024 || !input.password) return send(res, 400, { error: 'Enter your email and password.' });
        const session = await sessions.signIn(input.email.trim().toLowerCase(), input.password, input.remember === true);
        if (!session) return send(res, 401, { error: 'Email or password is incorrect.' });
        const user = await services.getUser(session.uid);
        if (!user?.is_active || user.role !== 'ADMIN') return send(res, 401, { error: 'Email or password is incorrect.' });
        await services.touchLogin(user.id); attempts.delete(ip);
        return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': cookie(session.cookie, session.seconds, input.remember === true) });
      }
      const inventoryRoute = path.match(/^\/api\/inventory(?:\/([A-Za-z0-9_-]{1,128})(?:\/(qr|actions))?)?$/);
      const inventoryQrLabelsRoute = path === '/api/inventory/qr-labels';
      const customerRoute = path.match(/^\/api\/customers(?:\/([A-Za-z0-9_-]{1,128}))?$/), userRoute = path.match(/^\/api\/users(?:\/([A-Za-z0-9_-]{1,128}))?$/);
      const workspaceRoute = path === '/api/workspace' || path === '/api/rates' || path === '/api/pricing' || path === '/api/pricing/quote' || path === '/api/settings' || customerRoute || userRoute;
      if ((['/api/auth/me', '/api/dashboard'].includes(path) && req.method === 'GET') || (path === '/api/profile' && req.method === 'PATCH') || inventoryRoute || inventoryQrLabelsRoute || workspaceRoute) {
        const claims = await sessions.verify(token); if (!claims) return send(res, 401, { error: 'Please sign in.' });
        const user = await services.getUser(claims.uid); if (!user?.is_active || user.role !== 'ADMIN') return send(res, 401, { error: 'Please sign in.' });
        if (path === '/api/auth/me') return send(res, 200, { user: publicUser(user) });
        if (path === '/api/profile') return send(res, 200, { user: publicUser(await services.updateProfile(user.id, await body(req))) });
        if (path === '/api/workspace' && req.method === 'GET') return send(res, 200, await services.workspace(user.role));
        if (inventoryQrLabelsRoute && req.method === 'GET') return send(res, 200, await services.inventoryQrLabels());
        if (path === '/api/pricing' && req.method === 'GET') return send(res, 200, await services.pricing());
        if (path === '/api/pricing' && req.method === 'PUT') return send(res, 200, { pricing: await services.savePricing(user.id, await body(req)) });
        if (path === '/api/pricing/quote' && req.method === 'POST') return send(res, 200, { quote: await services.pricingQuote(await body(req)) });
        if (customerRoute) { const [, id] = customerRoute; if (req.method === 'POST' && !id) return send(res, 201, { customer: await services.createCustomer(user.id, await body(req)) }); if (req.method === 'PATCH' && id) return send(res, 200, { customer: await services.updateCustomer(id, await body(req)) }); return send(res, 405, { error: 'Method not allowed.' }); }
        if (path === '/api/rates' && req.method === 'POST') return send(res, 201, { rate: await services.saveRate(user.id, await body(req)) });
        if (path === '/api/settings' && req.method === 'PATCH') { if (user.role !== 'ADMIN') return send(res, 403, { error: 'Administrator access is required.' }); return send(res, 200, { settings: await services.saveSettings(await body(req)) }); }
        if (userRoute) { if (user.role !== 'ADMIN') return send(res, 403, { error: 'Administrator access is required.' }); const [, id] = userRoute; if (req.method === 'POST' && !id) return send(res, 201, { user: await services.createUser(await body(req)) }); if (req.method === 'PATCH' && id) return send(res, 200, { user: await services.updateUser(user.id, id, await body(req)) }); return send(res, 405, { error: 'Method not allowed.' }); }
        if (inventoryRoute) {
          const [, id, action] = inventoryRoute;
          if (req.method === 'GET' && !id) return send(res, 200, await services.inventoryList());
          if (req.method === 'GET' && id && action === 'qr') return send(res, 200, await services.inventoryQr(id));
          if (req.method === 'GET' && id && !action) return send(res, 200, await services.inventoryDetail(id));
          if (req.method === 'POST' && !id) return send(res, 201, await services.createItem(user.id, await body(req)));
          if (req.method === 'PATCH' && id && !action) return send(res, 200, await services.updateItem(user.id, id, await body(req)));
          if (req.method === 'POST' && id && action === 'actions') return send(res, 200, await services.itemAction(user.id, id, await body(req)));
          return send(res, 405, { error: 'Method not allowed.' });
        }
        return send(res, 200, await services.dashboard());
      }
      send(res, 404, { error: 'API endpoint not found.' });
    } catch (error) {
      if (error.status) send(res, error.status, { error: error.message });
      else { console.error(`Backend request failed (${error.code || 'FIREBASE_ERROR'}).`); send(res, 503, { error: 'Firebase is unavailable. Check the backend Firebase configuration.' }); }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) createApi().listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Rent & Play backend: listening on port ' + (process.env.PORT || 3000)));
