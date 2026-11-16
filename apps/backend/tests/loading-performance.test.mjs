import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseServices } from '../src/server.mjs';
import { createRecordCodeService } from '../src/record-codes.mjs';
import { loadDashboard } from '../src/dashboard.mjs';
import { DEFAULT_PRICING } from '../src/pricing.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Interactive response waited for background work.')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

function observe(db, onRead) {
  const wrap = (reference, label, order = '') => new Proxy(reference, { get(target, property) {
    if (property === 'get') return async () => { await onRead(label, order); return target.get(); };
    if (['where', 'limit', 'startAfter'].includes(property)) return (...args) => wrap(target[property](...args), label, order);
    if (property === 'orderBy') return (...args) => wrap(target.orderBy(...args), label, args[0]);
    if (property === 'doc') return id => wrap(target.doc(id), `${label}/${id}`, order);
    return target[property];
  } });
  return { ...db, collection: name => wrap(db.collection(name), name) };
}

test('dashboard, inventory and web/mobile workspaces return while expiry discovery is stalled', async () => {
  const gate = deferred();
  let cleanupReads = 0;
  const db = observe(memoryFirestore(), async (_label, order) => {
    if (['expires_at', 'hold_expires_at'].includes(order)) { cleanupReads++; await gate.promise; }
  });
  const services = createFirebaseServices({ db });
  try {
    const values = await bounded(Promise.all([
      services.dashboard(), services.inventoryList(), services.workspace('OWNER', { view: 'Settings' }), services.mobileAdminWorkspace('OPERATOR')
    ]));
    assert.ok(values[0].stats);
    assert.deepEqual(values[1].items, []);
    assert.equal(values[2].view_meta.view, 'Settings');
    assert.ok(values[3]._dashboard);
    assert.equal(cleanupReads, 2, 'all readers share a single background sweep');
  } finally { gate.resolve(); await services.sweepVerificationRequests(); }
});

test('a committed rental returns success before slow report projection and the durable job completes later', async () => {
  const gate = deferred(), started = deferred();
  const now = new Date('2026-10-07T02:00:00Z');
  const customer = { id: 'customer', full_name: 'Customer', role: 'CUSTOMER', account_code: 'USER-001', is_active: true };
  const raw = memoryFirestore({
    users: { customer }, customers: { customer: { ...customer, customer_code: 'CUST-001' } },
    items: { bike: { name: 'Bike', item_code: 'EQUIP-001', pricing_product_id: 'bike', status: 'AVAILABLE', is_active: true } },
    settings: { pricing: structuredClone(DEFAULT_PRICING) }
  });
  const db = observe(raw, async label => {
    if (label.startsWith('rental_report_snapshots/')) { started.resolve(); await gate.promise; }
  });
  const services = createFirebaseServices({ db, now: () => now, summaryWaitMs: 25 });
  const input = { itemId: 'bike', durationMinutes: 180, deliveryLocation: 'Customer resort', requestKey: 'c'.repeat(32) };
  const pending = services.createMobileRentalRequest(customer, input);
  try {
    await bounded(started.promise);
    const result = await bounded(pending);
    assert.equal(result.summaryPending, true);
    assert.equal(result.rental.status, 'PENDING_ADMIN_APPROVAL');
    assert.equal(raw.records('rentals').length, 1);
    assert.equal(raw.data('items', 'bike').reserved_rental_id, result.rental.id);
    assert.equal(raw.records('report_jobs').length, 1, 'the committed rental has a durable retry job');
    gate.resolve();
    await services.processReportJobs();
    assert.equal(raw.records('report_jobs').length, 0);
    assert.equal((await services.createMobileRentalRequest(customer, input)).rental.id, result.rental.id);
    assert.equal(raw.records('rentals').length, 1, 'retrying the same operation cannot create a duplicate');
  } finally { gate.resolve(); await pending; }
});

test('saved related reference codes do not trigger a separate database lookup per rental field', async () => {
  const references = createRecordCodeService({ collection: () => { throw new Error('Unexpected reference lookup'); } });
  const value = {
    rental_id: 'r1', rental_code: 'R-0001', terminal_id: 't1', terminal_code: 'TERM-001',
    confirmed_terminal_id: 't1', confirmed_terminal_code: 'TERM-001',
    inspected_by: 'u1', inspected_by_account_code: 'USER-001',
    ticket: { rental_id: 'r1', rental_code: 'R-0001' },
    notifications: [{ rental_id: 'r1', rental_code: 'R-0001', title: 'Rental ready', message: 'Ready' }]
  };
  assert.deepEqual(await references.enrich(value), value);
});

test('dashboard starts its independent revenue query before inventory and customer lookups finish', async () => {
  const gate = deferred(), reads = [];
  const db = observe(memoryFirestore(), async label => { reads.push(label); await gate.promise; });
  const pending = loadDashboard(db);
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(reads.includes('rental_daily'));
    assert.ok(reads.includes('items'));
    assert.ok(reads.includes('financial_daily/' + new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())));
  } finally { gate.resolve(); await pending; }
});
