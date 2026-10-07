import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nodePath from 'node:path';
import { FirebaseSessions, publicUser } from './auth.mjs';
import { firebaseAuth as defaultFirebaseAuth, firebaseMessaging as defaultMessaging, firestore as defaultFirestore, requireFirebaseConfig } from './firebase.mjs';
import { loadDashboard } from './dashboard.mjs';
import { inventoryList, inventoryDetail, inventoryQr, inventoryQrLabels, createItem, updateItem, itemAction, createItemCategory, deleteItemCategory, deleteArchivedItem } from './inventory.mjs';
import { updateProfile } from './profile.mjs';
import { loadWorkspace, createCustomer, createMobileCustomerAccount, updateCustomer, changeCustomerPassword, deleteArchivedCustomer, saveRate, savePricing, saveSettings, savePaymentSettings, createWorkspaceUser, updateWorkspaceUser } from './workspace.mjs';
import { loadPricing, quoteRental } from './pricing.mjs';
import { authenticateTerminal, createRentalRequest, createReturnRequest, createMobileRentalRequest, reviewMobileRental, cancelMobileRentalRequest, quoteEquipmentRental, requestMobileReturn, reviewMobileReturn, createExpirySweep, resolveTerminalRequest, saveRequestInspection, startExpiryWorker, terminalPending } from './transactions.mjs';
import { mobileCatalog, mobileRentalList, resolveMobileItem, mobileProfile, mobilePaymentInstructions } from './mobile.mjs';
import { createReadCache } from './read-cache.mjs';
import { createQuotaBackoff, firebaseFailure, isQuotaError } from './firebase-errors.mjs';
import { createBooking, verifyReleaseCodes, releaseBooking, recordRentalReceipt, completeRentalReturn, lookupRental, rentalTicket, changeAssignedUnit, settleRentalPayment, inspectionPhoto, submitRentalPaymentProof, rentalPaymentProof, reviewRentalPaymentProof, prepareRentalDelivery } from './rental-flow.mjs';
import { listNotifications, markNotificationsRead, registerNotificationDevice, unregisterNotificationDevice, createNotificationDispatcher } from './notifications.mjs';
import { isCustomerRole, isOwnerRole, isStaffRole, normalizeRole } from './roles.mjs';

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

export function createFirebaseServices({ db = defaultFirestore, auth = defaultFirebaseAuth, messaging = defaultMessaging, now = () => new Date(), superAdminUid = process.env.SUPER_ADMIN_UID || '' } = {}) {
  const firestore = db, firebaseAuth = auth;
  const ownerUid = String(superAdminUid).trim();
  const readCache = createReadCache(firestore, { ttlMs: 15000 });
  const readDatabase = readCache.database;
  const verificationSweep = createExpirySweep(firestore, { now: () => now().getTime(), onExpired: () => readCache.invalidate() });
  const notificationDispatcher = createNotificationDispatcher(firestore, messaging, { now, ownerUid });
  const services = {
    listNotifications: (actor, options) => listNotifications(firestore, actor, options),
    markNotificationsRead: (actor, input) => markNotificationsRead(firestore, actor, input, now()),
    registerNotificationDevice: (actor, input) => registerNotificationDevice(firestore, actor, input, now()),
    unregisterNotificationDevice: (actor, input) => unregisterNotificationDevice(firestore, actor, input),
    dispatchNotifications: () => notificationDispatcher.run(),
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'rent-and-play',
    async health() { requireFirebaseConfig(); await firestore.collection('users').limit(1).get(); },
    async getUser(id) {
      const userId = String(id), profileRef = firestore.collection('users').doc(userId);
      let doc = await profileRef.get();
      if (!doc.exists && ownerUid && userId === ownerUid) {
        const account = await firebaseAuth.getUser(userId);
        if (account.disabled || !account.email) return null;
        try {
          await profileRef.create({
            full_name: String(account.displayName || account.email.split('@')[0]).slice(0, 150),
            email: account.email.toLowerCase(),
            phone: account.phoneNumber || '',
            role: 'OWNER',
            is_active: true,
            created_at: now(),
            last_login_at: null
          });
        } catch (error) {
          if (error.code !== 6 && error.code !== 'already-exists') throw error;
        }
        doc = await profileRef.get();
      }
      return doc.exists ? { id: doc.id, ...doc.data(), role: userId === ownerUid ? 'OWNER' : normalizeRole(doc.data().role) } : null;
    },
    async touchLogin(id) { await firestore.collection('users').doc(String(id)).update({ last_login_at: new Date() }); },
    updateProfile: (id, input) => updateProfile(firebaseAuth, firestore, id, input),
    dashboard: async () => { await verificationSweep.run(); return loadDashboard(readDatabase, now()); },
    inventoryList: async () => { await verificationSweep.run(); return inventoryList(readDatabase); }, inventoryDetail: id => inventoryDetail(firestore, id), inventoryQr: id => inventoryQr(firestore, id), inventoryQrLabels: () => inventoryQrLabels(firestore),
    createItem: (actor, input) => createItem(firestore, actor, input), updateItem: (actor, id, input) => updateItem(firestore, actor, id, input), itemAction: (actor, id, input) => itemAction(firestore, actor, id, input), createItemCategory: (actor, input) => createItemCategory(firestore, actor, input), deleteItemCategory: (actor, id) => deleteItemCategory(firestore, actor, id), deleteArchivedItem: (actor, id, input) => deleteArchivedItem(firestore, actor, id, input),
    workspace: async role => { await verificationSweep.run(); return loadWorkspace(readDatabase, role, now(), { ownerUid }); }, pricing: () => loadPricing(readDatabase, { allowInvalidFallback: true }), savePricing: (actor, input) => savePricing(firestore, actor, input),
    authenticateTerminal: (id, key) => authenticateTerminal(firestore, id, key),
    terminalPending: terminal => terminalPending(firestore, terminal, new Date(), { expire: () => verificationSweep.run() }),
    terminalConfirm: (terminal, input) => resolveTerminalRequest(firestore, terminal, input),
    createRentalRequest: async (actor, input) => { await verificationSweep.run({ force: true }); return createRentalRequest(firestore, actor, input, new Date(), Number(process.env.VERIFICATION_TTL_SECONDS || 600)); },
    createReturnRequest: async (actor, input) => { await verificationSweep.run({ force: true }); return createReturnRequest(firestore, actor, input, new Date(), Number(process.env.VERIFICATION_TTL_SECONDS || 600)); },
    createMobileRentalRequest: async (actor, input) => { await verificationSweep.run({ force: true }); return createMobileRentalRequest(firestore, actor, input, now()); },
    createCounterBooking: async (actor, input) => { await verificationSweep.run({ force: true }); return createBooking(firestore, actor, input, now(), { staff: true }); },
    releaseBooking: (actor, id, input) => releaseBooking(firestore, actor, id, input, now()),
    verifyReleaseCodes: (actor, id, input) => verifyReleaseCodes(firestore, actor, id, input, now()),
    prepareRentalDelivery: (actor, id, input) => prepareRentalDelivery(firestore, actor, id, input, now()),
    rentalPaymentProof: id => rentalPaymentProof(firestore, id),
    reviewRentalPaymentProof: (actor, id, input) => reviewRentalPaymentProof(firestore, actor, id, input, now()),
    savePaymentSettings: (actor, input) => savePaymentSettings(firestore, actor, input, now()),
    recordRentalReceipt: (actor, id, input) => recordRentalReceipt(firestore, actor, id, input, now()),
    completeRentalReturn: (actor, id, input) => completeRentalReturn(firestore, actor, id, input, now()),
    changeAssignedUnit: (actor, id, input) => changeAssignedUnit(firestore, actor, id, input, now()),
    settleRentalPayment: (actor, id, input) => settleRentalPayment(firestore, actor, id, input, now()),
    lookupRental: async input => { await verificationSweep.run({ force: true }); return lookupRental(firestore, input); },
    rentalTicket: async (actor, id) => { await verificationSweep.run({ force: true }); return rentalTicket(firestore, actor, id); },
    inspectionPhoto: id => inspectionPhoto(firestore, id),
    reviewMobileRental: async (actor, id, input) => reviewMobileRental(firestore, actor, id, input, now()),
    cancelMobileRentalRequest: async (actor, id) => cancelMobileRentalRequest(firestore, actor, id, now()),
    mobileCatalog: async () => { await verificationSweep.run(); return mobileCatalog(readDatabase); },
    mobileProfile: async (claims, input, method) => { const result = await mobileProfile(firestore, claims, input, method); if (String(claims.uid) === ownerUid) result.user.role = 'OWNER'; return result; },
    resolveMobileItem: input => resolveMobileItem(readDatabase, input),
    mobileRentalList: async (actor, id) => { await verificationSweep.run(); return mobileRentalList(firestore, actor, id); },
    mobilePaymentInstructions: () => mobilePaymentInstructions(readDatabase),
    submitRentalPaymentProof: (actor, id, input) => submitRentalPaymentProof(firestore, actor, id, input, now()),
    mobileQuote: async input => { await verificationSweep.run({ force: true }); return quoteEquipmentRental(firestore, { ...input, mode: 'TIMED' }, now()); },
    requestMobileReturn: (actor, id, input) => requestMobileReturn(firestore, actor, id, input, now()),
    reviewMobileReturn: (actor, id, input) => reviewMobileReturn(firestore, actor, id, input, now()),
    saveRequestInspection: async (actor, id, input) => { await verificationSweep.run({ force: true }); return saveRequestInspection(firestore, actor, id, input); },
    verifyMobileToken: async token => { try { return await firebaseAuth.verifyIdToken(token, true); } catch { return null; } },
    pricingQuote: async input => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Rental quote details are required.'), { status: 400 });
      if (input.itemId) {
        await verificationSweep.run({ force: true });
        return (await quoteEquipmentRental(firestore, input, now())).quote;
      }
      return quoteRental(await loadPricing(firestore), input);
    },
    createCustomer: (actor, input) => createCustomer(firestore, actor, input), createMobileCustomerAccount: (actor, input) => createMobileCustomerAccount(firebaseAuth, firestore, actor, input), updateCustomer: (actor, id, input) => updateCustomer(firestore, actor, id, input, new Date(), firebaseAuth), changeCustomerPassword: (actor, id, input) => changeCustomerPassword(firestore, actor, id, input, firebaseAuth), deleteArchivedCustomer: (actor, id, input) => deleteArchivedCustomer(firestore, actor, id, input, firebaseAuth), saveRate: (actor, input) => saveRate(firestore, actor, input), saveSettings: (actor, input) => saveSettings(firestore, actor, input), createUser: (actor, input) => createWorkspaceUser(firebaseAuth, firestore, actor, input), updateUser: (actor, id, input) => updateWorkspaceUser(firebaseAuth, actor, id, input)
  };
  services.updateUser = (actor, id, input) => updateWorkspaceUser(firebaseAuth, firestore, actor, id, input, now(), { ownerUid });

  for (const name of ['createCounterBooking', 'releaseBooking', 'verifyReleaseCodes', 'prepareRentalDelivery', 'reviewRentalPaymentProof', 'submitRentalPaymentProof', 'savePaymentSettings', 'recordRentalReceipt', 'completeRentalReturn', 'changeAssignedUnit', 'settleRentalPayment', 'touchLogin', 'updateProfile', 'createItem', 'updateItem', 'itemAction', 'createItemCategory', 'deleteItemCategory', 'deleteArchivedItem', 'inventoryQr', 'inventoryQrLabels', 'savePricing', 'terminalConfirm', 'createRentalRequest', 'createReturnRequest', 'createMobileRentalRequest', 'reviewMobileRental', 'cancelMobileRentalRequest', 'requestMobileReturn', 'reviewMobileReturn', 'saveRequestInspection', 'createCustomer', 'createMobileCustomerAccount', 'updateCustomer', 'changeCustomerPassword', 'deleteArchivedCustomer', 'saveRate', 'saveSettings', 'createUser', 'updateUser']) {
    const operation = services[name];
    services[name] = async (...args) => {
      try { return await operation(...args); }
      finally { readCache.invalidate(); }
    };
  }
  return Object.assign(services, { invalidateReadCache: () => readCache.invalidate(), sweepVerificationRequests: () => verificationSweep.run() });
}

const defaultServices = createFirebaseServices();

export function createApi({ services = defaultServices, sessions = new FirebaseSessions(), expiryWorker = services === defaultServices, notificationWorker = services === defaultServices, hardwareEnabled = process.env.ENABLE_ESP32 === 'true' } = {}) {
  const attempts = new Map();
  const quotaBackoff = createQuotaBackoff();
  const origins = new Set([
    process.env.WEB_ORIGIN || 'http://127.0.0.1:5173',
    'http://localhost:5173',
    ...String(process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean)
  ]);
  const allowedOrigin = origin => {
    if (!origin) return false;
    if (origins.has(origin)) return true;
    try {
      const url = new URL(origin);
      return url.protocol === 'http:' && Boolean(url.port) && ['localhost', '127.0.0.1'].includes(url.hostname) && url.origin === origin;
    } catch { return false; }
  };
  function send(res, status, value, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(value)); }
  function cookie(value, seconds, persistent = false) { return `rent_play_session=${value}; HttpOnly; SameSite=Strict; Path=/${persistent ? `; Max-Age=${seconds}` : ''}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`; }
  async function body(req, maxBytes = 8192) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON body required.'), { status: 415 });
    let value = ''; for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value) > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 }); }
    try { return JSON.parse(value); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
  }
  const server = http.createServer(async (req, res) => {
    const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
    if (!requestPath.startsWith('/api/')) return serveWeb(req, res, requestPath);
    const path = requestPath;
    const origin = req.headers.origin;
    const corsAllowed = allowedOrigin(origin);
    if (corsAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      if (!corsAllowed) return send(res, 403, { error: 'Request origin is not allowed.' });
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store'
      });
      return res.end();
    }
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('rent_play_session='))?.slice('rent_play_session='.length);
    try {
      const mutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
      if (mutation && ((origin && !allowedOrigin(origin)) || (!origin && req.headers['sec-fetch-site'] === 'cross-site'))) return send(res, 403, { error: 'Request origin is not allowed.' });
      if (path === '/api/auth/logout' && req.method === 'POST') { if (await sessions.verify(token)) sessions.revoke?.(token); return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0, true) }); }
      if (path === '/api/health' && req.method === 'GET') {
        try {
          quotaBackoff.assertAvailable();
          await services.health();
          return send(res, 200, { database: true, provider: 'firebase', firebaseProjectId: services.firebaseProjectId });
        } catch (error) {
          quotaBackoff.record(error);
          const failure = firebaseFailure(error);
          if (!error.quotaCooldown) console.warn(`Firebase health check failed (${error.code || 'FIREBASE_ERROR'}): ${error.message}`);
          return send(res, 200, { database: false, provider: 'firebase', warning: failure.error, code: failure.code, retryAfterSeconds: failure.retryAfterSeconds }, { 'Retry-After': String(failure.retryAfterSeconds) });
        }
      }
      if (path === '/api/auth/password-reset' && req.method === 'POST') {
        const input = await body(req), email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email address.' });
        await sessions.sendPasswordReset(email).catch(() => { }); return send(res, 200, { ok: true });
      }
      quotaBackoff.assertAvailable();
      if (req.method === 'GET' && req.headers['cache-control'] === 'no-cache') services.invalidateReadCache?.();
      if (['/api/notifications', '/api/notifications/read', '/api/notifications/device'].includes(path)) {
        const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
        const claims = bearer ? await services.verifyMobileToken?.(bearer) : await sessions.verify(token);
        if (!claims) return send(res, 401, { error: 'Please sign in to view notifications.' });
        const profile = await services.getUser(claims.uid);
        if (!profile || profile.is_active === false) return send(res, 403, { error: 'Your account is inactive or missing.' });
        const actor = { ...profile, id: claims.uid };
        if (path === '/api/notifications' && req.method === 'GET') {
          const params = new URL(req.url, 'http://localhost').searchParams;
          return send(res, 200, await services.listNotifications(actor, { before: params.get('before'), since: params.get('since') }));
        }
        if (path === '/api/notifications/read' && req.method === 'POST') return send(res, 200, await services.markNotificationsRead(actor, await body(req)));
        if (path === '/api/notifications/device' && req.method === 'POST') return send(res, 200, await services.registerNotificationDevice(actor, await body(req)));
        if (path === '/api/notifications/device' && req.method === 'DELETE') return send(res, 200, await services.unregisterNotificationDevice(actor, await body(req)));
        return send(res, 405, { error: 'Method not allowed.' });
      }
      if (path === '/api/mobile/catalog' && req.method === 'GET') return send(res, 200, { ...await services.mobileCatalog(), firebaseProjectId: services.firebaseProjectId });
      if (path === '/api/mobile/catalog/resolve' && req.method === 'POST') return send(res, 200, { ...await services.resolveMobileItem(await body(req)), firebaseProjectId: services.firebaseProjectId });
      if (path === '/api/mobile/profile') {
        const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
        const claims = bearer ? await services.verifyMobileToken?.(bearer) : null;
        if (!claims) return send(res, 401, { error: 'Please sign in to access your profile.' });
        if (!['GET', 'POST', 'PATCH'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
        const result = await services.mobileProfile(claims, req.method === 'GET' ? {} : await body(req), req.method);
        if (req.method !== 'GET') services.invalidateReadCache?.();
        return send(res, 200, { ...result, firebaseProjectId: services.firebaseProjectId });
      }
      const mobileRentalRoute = path.match(/^\/api\/mobile\/rentals(?:\/([A-Za-z0-9_-]{1,128})(?:\/(cancel|return|ticket|payment-proof))?)?$/);
      if (mobileRentalRoute || path === '/api/mobile/quote' || path === '/api/mobile/payment-instructions') {
        const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
        const claims = bearer ? await services.verifyMobileToken?.(bearer) : null;
        if (!claims) return send(res, 401, { error: 'Please sign in again to access your rentals.' });
        const profile = await services.getUser(claims.uid);
        if (!profile || profile.is_active === false) return send(res, 403, { error: 'Your customer profile is inactive or missing.' });
        if (!isCustomerRole(profile.role)) return send(res, 403, { error: 'Rental requests and customer rental records are available only to customer accounts.' });
        const actor = { id: claims.uid, full_name: profile.full_name || profile.name || claims.name, email: profile.email || claims.email, phone: profile.phone };
        if (path === '/api/mobile/payment-instructions' && req.method === 'GET') return send(res, 200, await services.mobilePaymentInstructions());
        if (path === '/api/mobile/quote' && req.method === 'POST') return send(res, 200, await services.mobileQuote(await body(req)));
        const [, id, action] = mobileRentalRoute || [];
        if (id && action === 'ticket' && req.method === 'GET') return send(res, 200, await services.rentalTicket(actor, id));
        if (mobileRentalRoute && req.method === 'GET' && !action) return send(res, 200, await services.mobileRentalList(actor, id));
        if (id && action === 'payment-proof' && req.method === 'POST') return send(res, 200, await services.submitRentalPaymentProof(actor, id, await body(req, 550000)));
        if (mobileRentalRoute && req.method === 'POST') {
          if (!id) return send(res, 201, await services.createMobileRentalRequest(actor, await body(req, 550000)));
          if (action === 'cancel') return send(res, 200, await services.cancelMobileRentalRequest(actor, id));
          if (action === 'return') return send(res, 200, await services.requestMobileReturn(actor, id, await body(req)));
        }
        return send(res, 405, { error: 'Method not allowed.' });
      }
      if (path === '/api/auth/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress, now = Date.now(); for (const [key, value] of attempts) if (now - value.since > 900000) attempts.delete(key);
        const entry = attempts.get(ip) || { since: now, count: 0 }; if (entry.count >= 10) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }); attempts.set(ip, { ...entry, count: entry.count + 1 });
        const input = await body(req); if (typeof input?.email !== 'string' || typeof input?.password !== 'string' || input.email.length > 191 || input.password.length > 1024 || !input.password) return send(res, 400, { error: 'Enter your email and password.' });
        const session = await sessions.signIn(input.email.trim().toLowerCase(), input.password, input.remember === true);
        if (!session) return send(res, 401, { error: 'Email or password is incorrect.' });
        const user = await services.getUser(session.uid);
        if (!user) return send(res, 403, { error: 'Your account has no workspace profile. Ask the owner to set up your access.' });
        if (!user.is_active) return send(res, 403, { error: 'Your workspace account is inactive. Ask the owner to restore your access.' });
        user.role = normalizeRole(user.role);
        if (!isStaffRole(user.role)) return send(res, 403, { error: 'Only operator or owner accounts can access the staff workspace. Customer accounts use the mobile app.' });
        await services.touchLogin(user.id); attempts.delete(ip);
        return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': cookie(session.cookie, session.seconds, input.remember === true) });
      }
      const terminalRoute = path.match(/^\/api\/terminals\/([A-Za-z0-9_-]{1,128})\/(pending|confirm)$/);
      const mobileReviewRoute = path.match(/^\/api\/mobile\/rentals\/([A-Za-z0-9_-]{1,128})\/review$/);
      const mobileReturnReviewRoute = path.match(/^\/api\/mobile\/rentals\/([A-Za-z0-9_-]{1,128})\/return\/review$/);
      if (terminalRoute) {
        if (!hardwareEnabled) return send(res, 409, { error: 'ESP32 is on standby. Use the admin rental and return desk.' });
        const [, terminalId, action] = terminalRoute;
        const key = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
        const terminal = await services.authenticateTerminal(terminalId, key);
        if (action === 'pending' && req.method === 'GET') return send(res, 200, await services.terminalPending(terminal));
        if (action === 'confirm' && req.method === 'POST') return send(res, 200, await services.terminalConfirm(terminal, await body(req)));
        return send(res, 405, { error: 'Method not allowed.' });
      }
      const inspectionRoute = path.match(/^\/api\/verification-requests\/([A-Za-z0-9_-]{1,128})\/inspection$/);
      const transactionRoute = path === '/api/rentals' || path === '/api/returns' || inspectionRoute;
      const rentalFlowRoute = path.match(/^\/api\/rentals\/([A-Za-z0-9_-]{1,128})\/(release-verification|release|prepare-delivery|payment-proof|payment-review|receipt|complete-return|assignment|settlement)$/);
      const rentalLookupRoute = path === '/api/rentals/lookup';
      const counterBookingRoute = path === '/api/rental-bookings';
      const inspectionPhotoRoute = path.match(/^\/api\/rental-inspection-photos\/([A-Za-z0-9_-]{1,128})$/);
      const inventoryRoute = path.match(/^\/api\/inventory(?:\/([A-Za-z0-9_-]{1,128})(?:\/(qr|actions))?)?$/);
      const inventoryQrLabelsRoute = path === '/api/inventory/qr-labels';
      const itemCategoriesRoute = path.match(/^\/api\/item-categories(?:\/([A-Za-z0-9_-]{1,128}))?$/);
      const customerRoute = path.match(/^\/api\/customers(?:\/([A-Za-z0-9_-]{1,128}))?$/), customerPasswordRoute = path.match(/^\/api\/customers\/([A-Za-z0-9_-]{1,128})\/password$/), customerAccountRoute = path === '/api/customer-accounts', userRoute = path.match(/^\/api\/users(?:\/([A-Za-z0-9_-]{1,128}))?$/);
      const workspaceRoute = path === '/api/workspace' || path === '/api/rates' || path === '/api/pricing' || path === '/api/pricing/quote' || path === '/api/settings' || path === '/api/settings/payment' || customerRoute || customerPasswordRoute || customerAccountRoute || userRoute || itemCategoriesRoute || mobileReviewRoute || mobileReturnReviewRoute;
      if ((['/api/auth/me', '/api/dashboard'].includes(path) && req.method === 'GET') || (path === '/api/profile' && req.method === 'PATCH') || inventoryRoute || inventoryQrLabelsRoute || workspaceRoute || transactionRoute || rentalFlowRoute || rentalLookupRoute || counterBookingRoute || inspectionPhotoRoute) {
        const mobileToken = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
        const claims = mobileToken ? await services.verifyMobileToken?.(mobileToken) : await sessions.verify(token); if (!claims) return send(res, 401, { error: 'Please sign in.' });
        const user = await services.getUser(claims.uid); if (!user?.is_active || !isStaffRole(user.role)) return send(res, 401, { error: 'Please sign in with an active operator or owner account.' });
        user.role = normalizeRole(user.role);
        if (counterBookingRoute && req.method === 'POST') return send(res, 201, await services.createCounterBooking(user, await body(req)));
        if (rentalLookupRoute && req.method === 'POST') return send(res, 200, await services.lookupRental(await body(req)));
        if (inspectionPhotoRoute && req.method === 'GET') return send(res, 200, await services.inspectionPhoto(inspectionPhotoRoute[1]));
        if (rentalFlowRoute && req.method === 'GET' && rentalFlowRoute[2] === 'payment-proof') return send(res, 200, await services.rentalPaymentProof(rentalFlowRoute[1]));
        if (rentalFlowRoute && req.method === 'POST') {
          const [, id, action] = rentalFlowRoute;
          const operations = { 'release-verification': 'verifyReleaseCodes', release: 'releaseBooking', 'prepare-delivery': 'prepareRentalDelivery', 'payment-review': 'reviewRentalPaymentProof', receipt: 'recordRentalReceipt', 'complete-return': 'completeRentalReturn', assignment: 'changeAssignedUnit', settlement: 'settleRentalPayment' };
          return send(res, 200, await services[operations[action]](user, id, await body(req, 550000)));
        }
        if (rentalFlowRoute || rentalLookupRoute || counterBookingRoute || inspectionPhotoRoute) return send(res, 405, { error: 'Method not allowed.' });
        if (path === '/api/auth/me') return send(res, 200, { user: publicUser(user), firebaseProjectId: services.firebaseProjectId });
        if (path === '/api/profile') return send(res, 200, { user: publicUser(await services.updateProfile(user.id, await body(req))) });
        if (path === '/api/workspace' && req.method === 'GET') return send(res, 200, await services.workspace(user.role));
        if (path === '/api/rentals' && req.method === 'POST') return hardwareEnabled ? send(res, 201, await services.createRentalRequest(user, await body(req))) : send(res, 409, { error: 'ESP32 is on standby. Prepare a booking in the rental desk.' });
        if (path === '/api/returns' && req.method === 'POST') return hardwareEnabled ? send(res, 201, await services.createReturnRequest(user, await body(req))) : send(res, 409, { error: 'ESP32 is on standby. Record physical receipt in the return desk.' });
        if (mobileReviewRoute && req.method === 'POST') return send(res, 200, await services.reviewMobileRental({ id: user.id, full_name: user.full_name || user.name }, mobileReviewRoute[1], await body(req)));
        if (mobileReturnReviewRoute && req.method === 'POST') return send(res, 200, await services.reviewMobileReturn({ id: user.id, full_name: user.full_name || user.name }, mobileReturnReviewRoute[1], await body(req)));
        if (inspectionRoute && req.method === 'PUT') return send(res, 200, { request: await services.saveRequestInspection(user, inspectionRoute[1], await body(req)) });
        if (transactionRoute) return send(res, 405, { error: 'Method not allowed.' });
        if (itemCategoriesRoute) { const [, id] = itemCategoriesRoute; if (req.method === 'POST' && !id) return send(res, 201, { category: await services.createItemCategory(user.id, await body(req)) }); if (req.method === 'DELETE' && id) return send(res, 200, { category: await services.deleteItemCategory(user.id, id) }); return send(res, 405, { error: 'Method not allowed.' }); }
        if (inventoryQrLabelsRoute && req.method === 'GET') return send(res, 200, await services.inventoryQrLabels());
        if (path === '/api/pricing' && req.method === 'GET') return send(res, 200, await services.pricing());
        if (path === '/api/pricing' && req.method === 'PUT') return send(res, 200, { pricing: await services.savePricing(user.id, await body(req)) });
        if (path === '/api/pricing/quote' && req.method === 'POST') return send(res, 200, { quote: await services.pricingQuote(await body(req)) });
        if (customerPasswordRoute) { if (req.method === 'PATCH') return send(res, 200, { customer: await services.changeCustomerPassword(user.id, customerPasswordRoute[1], await body(req)) }); return send(res, 405, { error: 'Method not allowed.' }); }
        if (customerAccountRoute) { if (req.method === 'POST') return send(res, 201, { customer: await services.createMobileCustomerAccount(user.id, await body(req)) }); return send(res, 405, { error: 'Method not allowed.' }); }
        if (customerRoute) { const [, id] = customerRoute; if (req.method === 'POST' && !id) return send(res, 201, { customer: await services.createCustomer(user.id, await body(req)) }); if (req.method === 'PATCH' && id) return send(res, 200, { customer: await services.updateCustomer(user.id, id, await body(req)) }); if (req.method === 'DELETE' && id) return send(res, 200, { customer: await services.deleteArchivedCustomer(user.id, id, await body(req)) }); return send(res, 405, { error: 'Method not allowed.' }); }
        if (path === '/api/rates' && req.method === 'POST') return send(res, 201, { rate: await services.saveRate(user.id, await body(req)) });
        if (path === '/api/settings' && req.method === 'PATCH') { if (!isOwnerRole(user.role)) return send(res, 403, { error: 'Only the super admin owner can change business settings.' }); return send(res, 200, { settings: await services.saveSettings(user.id, await body(req)) }); }
        if (path === '/api/settings/payment' && req.method === 'PATCH') { if (!isOwnerRole(user.role)) return send(res, 403, { error: 'Only the workspace owner can change InstaPay payment instructions.' }); return send(res, 200, { settings: await services.savePaymentSettings(user.id, await body(req, 350000)) }); }
        if (userRoute) { if (!isOwnerRole(user.role)) return send(res, 403, { error: 'Only the super admin owner can manage workspace accounts.' }); const [, id] = userRoute; if (req.method === 'POST' && !id) return send(res, 201, { user: await services.createUser(user.id, await body(req)) }); if (req.method === 'PATCH' && id) return send(res, 200, { user: await services.updateUser(user.id, id, await body(req)) }); return send(res, 405, { error: 'Method not allowed.' }); }
        if (inventoryRoute) {
          const [, id, action] = inventoryRoute;
          if (req.method === 'GET' && !id) return send(res, 200, await services.inventoryList());
          if (req.method === 'GET' && id && action === 'qr') return send(res, 200, await services.inventoryQr(id));
          if (req.method === 'GET' && id && !action) return send(res, 200, await services.inventoryDetail(id));
          if (req.method === 'POST' && !id) return send(res, 201, await services.createItem(user.id, await body(req, 300000)));
          if (req.method === 'PATCH' && id && !action) return send(res, 200, await services.updateItem(user.id, id, await body(req, 300000)));
          if (req.method === 'DELETE' && id && !action) return send(res, 200, await services.deleteArchivedItem(user.id, id, await body(req)));
          if (req.method === 'POST' && id && action === 'actions') return send(res, 200, await services.itemAction(user.id, id, await body(req)));
          return send(res, 405, { error: 'Method not allowed.' });
        }
        return send(res, 200, await services.dashboard());
      }
      send(res, 404, { error: 'API endpoint not found.' });
    } catch (error) {
      if (Number.isInteger(error.status) && error.status >= 400 && error.status < 600 && !isQuotaError(error)) send(res, error.status, { error: error.message });
      else {
        quotaBackoff.record(error);
        const { status, ...failure } = firebaseFailure(error);
        if (!error.quotaCooldown) console.error(`Backend request failed (${error.code || 'FIREBASE_ERROR'}): ${error.message} ${failure.error}`);
        send(res, status, failure, { 'Retry-After': String(failure.retryAfterSeconds) });
      }
    }
  });
  if (expiryWorker) {
    const stop = startExpiryWorker(defaultFirestore, {
      sweep: async () => {
        quotaBackoff.assertAvailable();
        try { return await services.sweepVerificationRequests(); } catch (error) { quotaBackoff.record(error); throw error; }
      }
    });
    server.once('close', stop);
  }
  if (notificationWorker && services.dispatchNotifications) {
    let busy = false;
    const dispatch = async () => {
      if (busy) return;
      busy = true;
      try { quotaBackoff.assertAvailable(); await services.dispatchNotifications(); }
      catch (error) { quotaBackoff.record(error); }
      finally { busy = false; }
    };
    const timer = setInterval(dispatch, 10000); timer.unref?.();
    server.once('listening', dispatch);
    server.once('close', () => clearInterval(timer));
  }
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) createApi().listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Rent & Play backend: listening on port ' + (process.env.PORT || 3000)));
