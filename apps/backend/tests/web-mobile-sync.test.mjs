import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { memoryFirestore } from './support/memory-firestore.mjs';
import { mobileBusinessSettings, mobileCustomerTrust, mobileProfile } from '../src/mobile.mjs';
import { createMobileRentalRequest } from '../src/transactions.mjs';
import { DEFAULT_PRICING } from '../src/pricing.mjs';
import { withinBusinessHours } from '../src/business-hours.mjs';
import { financeSummary } from '../src/payment-ledger.mjs';
import { createRentalEventHub } from '../src/rental-events.mjs';
import { createApi } from '../src/server.mjs';

const now = new Date('2026-11-07T02:00:00Z');
const customer = { id: 'customer', full_name: 'Test Customer', phone: '09123456789', role: 'CUSTOMER', is_active: true };
function fixture(settings = {}) {
  return memoryFirestore({
    users: { customer }, customers: { customer },
    settings: { business: settings, pricing: structuredClone(DEFAULT_PRICING) },
    items: { bike: { name: 'Bike', item_code: 'EQ-0001', pricing_product_id: 'bike', status: 'AVAILABLE', condition_status: 'GOOD', is_active: true } }
  });
}
const booking = { itemId: 'bike', durationMinutes: 60, paymentMethod: 'CASH', deliveryLocation: 'Test Resort', requestKey: 'a'.repeat(32), acceptedRentalTerms: true, rentalTermsVersion: 'test-current' };

test('public mobile settings expose live business details without exposing private settings', async () => {
  const result = await mobileBusinessSettings(fixture({ announcement_enabled: true, announcement_text: 'Rain advisory', opens_at: '09:00', secret: 'private', instapay_account_number: 'private' }));
  assert.equal(result.settings.announcement_text, 'Rain advisory');
  assert.equal(result.settings.opens_at, '09:00');
  assert.equal(result.settings.secret, undefined);
  assert.equal(result.settings.instapay_account_number, undefined);
});

test('cash policy is enforced on the server before stock is reserved', async () => {
  const db = fixture({ accept_cash: false });
  await assert.rejects(createMobileRentalRequest(db, customer, booking, now), error => error.status === 409 && /Cash payments/.test(error.message));
  assert.equal((await db.collection('items').doc('bike').get()).data().status, 'AVAILABLE');
  assert.equal((await db.collection('rentals').get()).docs.length, 0);
});

test('configured agreement versions cannot be bypassed by a stale checkout', async () => {
  await assert.rejects(createMobileRentalRequest(fixture({ terms_version: 'owner-v2' }), customer, booking, now), error => error.status === 409 && /terms changed/.test(error.message));
  assert.ok((await createMobileRentalRequest(fixture({ terms_version: 'owner-v2' }), customer, { ...booking, rentalTermsVersion: 'owner-v2' }, now)).rental.id);
});

test('closed store permits only prebookings inside opening hours and handles overnight boundaries', async () => {
  const closed = new Date('2026-11-07T13:00:00Z'); // 9 PM Manila
  await assert.rejects(createMobileRentalRequest(fixture(), customer, booking, closed), error => error.status === 409 && /closed/.test(error.message));
  const result = await createMobileRentalRequest(fixture(), customer, { ...booking, scheduledStartAt: '2026-11-08T01:00:00Z' }, closed);
  assert.equal(result.rental.scheduled_start_at, '2026-11-08T01:00:00.000Z');
  assert.equal(withinBusinessHours(new Date('2026-11-07T12:00:00Z')), false); // closing exclusive
  assert.equal(withinBusinessHours(new Date('2026-11-07T00:00:00Z')), true); // opening inclusive
  assert.equal(withinBusinessHours(new Date('2026-11-07T17:00:00Z'), { opens_at: '20:00', closes_at: '02:00' }), true);
  assert.equal(withinBusinessHours(new Date('2026-11-07T18:00:00Z'), { opens_at: '20:00', closes_at: '02:00' }), false);
});

test('notification preference patches merge, persist and cannot grant staff access', async () => {
  const db = fixture();
  const claims = { uid: 'customer', email_verified: true };
  await mobileProfile(db, claims, { notification_preferences: { push_enabled: false }, role: 'OWNER' }, 'PATCH', now);
  const result = await mobileProfile(db, claims, { notification_preferences: { return_reminders: false } }, 'PATCH', now);
  assert.deepEqual(result.user.notification_preferences, { push_enabled: false, return_reminders: false });
  assert.equal(result.user.role, 'CUSTOMER');
  await assert.rejects(mobileProfile(db, claims, { notification_preferences: { push_enabled: 'false' } }, 'PATCH', now), error => error.status === 400);
});

test('trust counts unique linked rentals and never treats self acknowledgement as ID verification', async () => {
  const db = fixture();
  await db.collection('users').doc('customer').update({ hasAcknowledgedIdRequirement: true });
  await db.collection('rentals').doc('done').set({ customer_id: 'customer', customerId: 'customer', status: 'COMPLETED' });
  await db.collection('rentals').doc('late').set({ customer_id: 'customer', status: 'ACTIVE', due_at: new Date(now - 1000) });
  assert.deepEqual((await mobileCustomerTrust(db, 'customer', now)).trust, { completed_rentals: 1, active_overdue: 1, physical_id_verified: false });
  await db.collection('rentals').doc('done').update({ handoff_verification: { physical_id_verified: true } });
  assert.equal((await mobileCustomerTrust(db, 'customer', now)).trust.physical_id_verified, true);
});

test('counter summary combines actual daily collections with active units and current station heartbeat', async () => {
  const db = fixture();
  await db.collection('financial_daily').doc('2026-11-07').set({ business_day: '2026-11-07', cash_collections: 150, qr_collections: 250, collections: 400 });
  await db.collection('rentals').doc('late').set({ status: 'ACTIVE', due_at: new Date(now - 1000) });
  await db.collection('rentals').doc('received').set({ status: 'ACTIVE', due_at: new Date(now - 1000), received_at: now });
  await db.collection('terminals').doc('station').set({ status: 'ONLINE', last_seen_at: now, is_active: true });
  const result = await financeSummary(db, { from: '2026-11-07', to: '2026-11-07', counter: true }, now);
  assert.deepEqual(result.counter, { active_units: 1, due_today: 1, overdue: 1, station_status: 'ONLINE' });
  assert.equal(result.totals.cash_collections, 150);
  assert.equal(result.totals.qr_collections, 250);
});

test('guest discovery gets settings events and a server-clock handshake without customer rental data', () => {
  const hub = createRentalEventHub();
  const response = Object.assign(new EventEmitter(), { chunks: [], writeHead() {}, flushHeaders() {}, write(frame) { this.chunks.push(frame); }, end() { this.emit('close'); } });
  try {
    hub.subscribe(response, { guest: true });
    hub.publishDataChange('settings.changed', { collections: ['settings'] });
    hub.publishRental({ customerId: 'other-customer', rentalId: 'private-rental' });
    const frames = response.chunks.join('');
    assert.match(frames, /serverTime/);
    assert.match(frames, /event: settings.changed/);
    assert.doesNotMatch(frames, /private-rental/);
  } finally { hub.close(); }
});

test('public settings and staff payment instructions work while customer trust stays staff only', async () => {
  const server = createApi({ services: {
    mobileBusinessSettings: async () => ({ settings: { opens_at: '09:00' } }),
    verifyMobileToken: async token => ({ uid: token }),
    getUser: async id => ({ id, role: id === 'staff' ? 'OPERATOR' : 'CUSTOMER', is_active: true }),
    mobilePaymentInstructions: async () => ({ accept_cash: false }),
    mobileCustomerTrust: async () => ({ trust: { completed_rentals: 2 } })
  }, sessions: { verify: async () => null } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const publicResponse = await fetch(base + '/api/mobile/settings');
    assert.equal(publicResponse.status, 200);
    assert.ok(Date.parse(publicResponse.headers.get('x-server-time')));
    assert.equal((await publicResponse.json()).settings.opens_at, '09:00');
    assert.equal((await fetch(base + '/api/mobile/payment-instructions', { headers: { Authorization: 'Bearer staff' } })).status, 200);
    assert.equal((await fetch(base + '/api/customers/customer/trust', { headers: { Authorization: 'Bearer customer' } })).status, 401);
    assert.equal((await fetch(base + '/api/customers/customer/trust', { headers: { Authorization: 'Bearer staff' } })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
