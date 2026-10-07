import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFirestore } from './support/memory-firestore.mjs';
import { createBooking, reviewBooking, releaseBooking, recordRentalReceipt, completeRentalReturn, cancelBooking } from '../src/rental-flow.mjs';
import { requestMobileReturn } from '../src/transactions.mjs';
import { queueRentalNotification, listNotifications, markNotificationsRead, registerNotificationDevice, unregisterNotificationDevice, createNotificationDispatcher } from '../src/notifications.mjs';
import { createApi, createFirebaseServices } from '../src/server.mjs';
import { DEFAULT_PRICING } from '../src/pricing.mjs';

const now = new Date('2026-10-07T02:00:00Z'), later = minutes => new Date(now.getTime() + minutes * 60000);
const admin = { id: 'admin', role: 'ADMIN', full_name: 'Admin', is_active: true };
const customer = { id: 'customer', role: 'USER', full_name: 'Customer', is_active: true };
const key = letter => letter.repeat(32), input = { itemId: 'cards', durationMinutes: 60, requestKey: key('a') };
const inspection = { condition: 'GOOD', result: 'AVAILABLE', notes: 'All pieces checked.', accessoriesChecked: true };
const hasStatus = status => error => error.status === status;
function fixture() { return memoryFirestore({ users: { admin, customer, admin2: { ...admin, id: 'admin2' }, other: { ...customer, id: 'other' } }, customers: { customer },
  settings: { business: { default_late_grace_hours: 0 }, pricing: structuredClone(DEFAULT_PRICING) },
  item_categories: { cards: { name: 'Cards' } }, items: { cards: { name: 'Cards', item_code: 'TEST-001', qr_token: 'unit-qr', category_id: 'cards', status: 'AVAILABLE', is_active: true } },
  item_rates: { cards: { item_id: 'cards', rate_type: 'HOURLY', rental_rate: 50, deposit_amount: 20, late_penalty_rate: 10, is_active: true, effective_from: later(-60) } } }); }
async function active(db) {
  const { rental } = await createBooking(db, customer, input, now);
  await reviewBooking(db, admin, rental.id, { action: 'APPROVE' }, later(1));
  await releaseBooking(db, admin, rental.id, { requestKey: key('b'), transactionCode: rental.booking_qr_token, inventoryCode: 'unit-qr', customerVerified: true, paymentVerified: true, depositReceived: true, inspection }, later(2));
  return rental;
}

test('customer booking notifies staff once; decision notifies only its customer and failed decisions do not notify', async () => {
  const db = fixture(), { rental } = await createBooking(db, customer, input, now);
  await createBooking(db, customer, input, now);
  const staffInbox = await listNotifications(db, admin);
  assert.equal(staffInbox.notifications.length, 1);
  assert.equal(staffInbox.notifications[0].type, 'BOOKING_REQUESTED');
  assert.equal(staffInbox.notifications[0].rental_id, rental.id);
  await assert.rejects(reviewBooking(db, admin, rental.id, { action: 'REJECT', reason: false }, later(1)), hasStatus(400));
  assert.equal((await listNotifications(db, customer)).notifications.length, 0);
  await reviewBooking(db, admin, rental.id, { action: 'APPROVE' }, later(1));
  await reviewBooking(db, admin, rental.id, { action: 'APPROVE' }, later(1));
  assert.equal((await listNotifications(db, customer)).notifications.length, 1);
  assert.equal((await listNotifications(db, { ...customer, id: 'other' })).notifications.length, 0);
  assert.equal(db.records('notification_outbox').length, 2);
});

test('rejection includes a supplied reason and permits an omitted reason', async () => {
  for (const reason of [undefined, '  Equipment unavailable at the selected location.  ']) {
    const db = fixture(), { rental } = await createBooking(db, customer, input, now);
    await reviewBooking(db, admin, rental.id, { action: 'REJECT', reason }, later(1));
    const event = (await listNotifications(db, customer)).notifications[0];
    assert.equal(event.type, 'BOOKING_REJECTED');
    assert.equal(event.message.includes('Reason:'), Boolean(reason));
    if (reason) assert.ok(event.message.includes(reason.trim()));
  }
});

test('read status survives refresh and is private to each admin; customer cannot read or mark another inbox', async () => {
  const db = fixture(), { rental } = await createBooking(db, customer, input, now);
  const id = (await listNotifications(db, admin)).notifications[0].id;
  await markNotificationsRead(db, admin, { ids: [id] }, later(1));
  assert.equal((await listNotifications(db, admin)).unread_count, 0);
  assert.equal((await listNotifications(db, { ...admin, id: 'admin2' })).unread_count, 1);
  await assert.rejects(markNotificationsRead(db, customer, { ids: [id] }), hasStatus(404));
  await reviewBooking(db, admin, rental.id, { action: 'APPROVE' }, later(1));
  const customerId = (await listNotifications(db, customer)).notifications[0].id;
  await assert.rejects(markNotificationsRead(db, { ...customer, id: 'other' }, { ids: [customerId] }), hasStatus(404));
});

test('return requests notify staff once per request and decisions and physical receipt notify the customer', async () => {
  const db = fixture(), rental = await active(db);
  await requestMobileReturn(db, customer, rental.id, {}, later(3));
  await requestMobileReturn(db, customer, rental.id, {}, later(3));
  await completeRentalReturn(db, admin, rental.id, { action: 'REJECT', reason: 'Arrange collection with the desk.' }, later(4));
  await requestMobileReturn(db, customer, rental.id, {}, later(5));
  assert.equal((await listNotifications(db, admin)).notifications.filter(row => row.type === 'RETURN_REQUESTED').length, 2);
  await recordRentalReceipt(db, admin, rental.id, { requestKey: key('c'), inventoryCode: 'unit-qr', physicalReceiptConfirmed: true }, later(6));
  await completeRentalReturn(db, admin, rental.id, { requestKey: key('d'), penaltyAmount: 0, inspection }, later(7));
  const customerTypes = (await listNotifications(db, customer)).notifications.map(row => row.type);
  assert.deepEqual(customerTypes, ['RETURN_COMPLETED', 'RETURN_RECEIVED', 'RETURN_REQUEST_REJECTED', 'RENTAL_RELEASED', 'BOOKING_APPROVED']);
});

test('customer cancellation notifies staff and cannot duplicate on retry', async () => {
  const db = fixture(), { rental } = await createBooking(db, customer, input, now);
  await cancelBooking(db, customer, rental.id, later(1)); await cancelBooking(db, customer, rental.id, later(1));
  assert.equal((await listNotifications(db, admin)).notifications.filter(row => row.type === 'BOOKING_CANCELLED').length, 1);
});

test('push retries do not roll back a rental, exclude inactive and changed-role accounts, and remove invalid devices', async () => {
  const db = fixture();
  await registerNotificationDevice(db, admin, { token: 'staff-device-token-123456789' }, now);
  await registerNotificationDevice(db, { ...admin, id: 'admin2' }, { token: 'second-staff-token-123456789' }, now);
  await db.collection('users').doc('admin2').update({ role: 'USER' });
  const { rental } = await createBooking(db, customer, input, now);
  let current = later(1), calls = 0;
  const dispatcher = createNotificationDispatcher(db, { async sendEachForMulticast(payload) {
    calls++; assert.deepEqual(payload.tokens, ['staff-device-token-123456789']);
    assert.equal(payload.data.rental_id, rental.id);
    if (calls === 1) throw Object.assign(Error('Unavailable'), { code: 'messaging/server-unavailable' });
    return { responses: [{ success: false, error: { code: 'messaging/registration-token-not-registered' } }] };
  } }, { now: () => current });
  await Promise.all([dispatcher.run(), dispatcher.run()]); assert.equal(calls, 1);
  assert.equal(db.data('rentals', rental.id).status, 'PENDING_ADMIN_APPROVAL');
  await dispatcher.run(); assert.equal(calls, 1);
  current = later(2); await dispatcher.run(); assert.equal(calls, 2);
  assert.equal(db.records('notification_outbox')[0].status, 'SENT');
  assert.equal(db.records('notification_devices').length, 1);
  await unregisterNotificationDevice(db, { ...customer, id: 'other' }, { token: 'second-staff-token-123456789' });
  assert.equal(db.records('notification_devices').length, 1);
});

test('notification API authenticates web and Android roles and never accepts a recipient from request input', async t => {
  const db = fixture(); await createBooking(db, customer, input, now);
  const services = createFirebaseServices({ db, now: () => now, auth: { verifyIdToken: async token => ({ uid: token }) } });
  const server = createApi({ services, expiryWorker: false, notificationWorker: false, sessions: { verify: async token => token === 'admin-cookie' ? { uid: 'admin' } : null } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/notifications`;
  assert.equal((await fetch(url)).status, 401);
  const staffResponse = await fetch(url, { headers: { Cookie: 'rent_play_session=admin-cookie' } });
  assert.equal((await staffResponse.json()).notifications.length, 1);
  const customerResponse = await fetch(url + '?recipient=admin', { headers: { Authorization: 'Bearer customer' } });
  assert.equal((await customerResponse.json()).notifications.length, 0);
  await db.collection('users').doc('customer').update({ is_active: false });
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer customer' } })).status, 403);
});

test('inbox revisions skip unchanged polls, distinguish accounts, and change when read status changes', async () => {
  const db = fixture(), empty = await listNotifications(db, customer);
  assert.notEqual(empty.revision, (await listNotifications(db, admin)).revision);
  assert.notEqual(empty.revision, (await listNotifications(db, { ...customer, id: 'other' })).revision);
  assert.equal((await listNotifications(db, customer, { since: empty.revision })).unchanged, true);
  const { rental } = await createBooking(db, customer, input, now);
  await reviewBooking(db, admin, rental.id, { action: 'APPROVE' }, later(1));
  const page = await listNotifications(db, customer, { since: empty.revision });
  assert.equal(page.notifications.length, 1);
  assert.equal((await listNotifications(db, customer, { since: page.revision })).unchanged, true);
  await markNotificationsRead(db, customer, { ids: [page.notifications[0].id] }, later(2));
  const read = await listNotifications(db, customer, { since: page.revision });
  assert.notEqual(read.revision, page.revision);
  assert.equal(read.unread_count, 0);
  await markNotificationsRead(db, customer, { ids: [page.notifications[0].id] }, later(3));
  assert.equal((await listNotifications(db, customer)).revision, read.revision);
});

test('older notifications paginate without losing equal-time entries or allowing another inbox cursor', async () => {
  const db = fixture();
  for (let index = 0; index < 65; index++) {
    await db.runTransaction(async tx => queueRentalNotification(tx, db, { id: `history-${index}`, customer_id: customer.id, item_name: 'Cards' }, 'BOOKING_APPROVED', now));
  }
  const first = await listNotifications(db, customer);
  assert.equal(first.notifications.length, 60);
  const second = await listNotifications(db, customer, { before: first.next_cursor, since: first.revision });
  assert.equal(second.notifications.length, 5);
  assert.equal(second.next_cursor, null);
  assert.equal(new Set([...first.notifications, ...second.notifications].map(row => row.id)).size, 65);
  await assert.rejects(listNotifications(db, { ...customer, id: 'other' }, { before: first.next_cursor }), hasStatus(404));
});

test('a device moves to the new signed-in owner and an old owner cannot unregister it', async () => {
  const db = fixture(), token = 'shared-android-phone-token-123456789';
  await registerNotificationDevice(db, customer, { token }, now);
  await registerNotificationDevice(db, admin, { token }, later(1));
  assert.equal(db.records('notification_devices').length, 1);
  assert.equal(db.records('notification_devices')[0].user_id, admin.id);
  await unregisterNotificationDevice(db, customer, { token });
  assert.equal(db.records('notification_devices').length, 1);
  await unregisterNotificationDevice(db, admin, { token });
  assert.equal(db.records('notification_devices').length, 0);
});

test('waiting push retries cannot block new request alerts', async () => {
  const db = fixture();
  for (let index = 0; index < 40; index++) {
    await db.collection('notification_outbox').doc(`waiting-${index}`).set({ status: 'RETRY', next_attempt_at: later(60), lease_until: null, attempts: 1 });
  }
  await registerNotificationDevice(db, admin, { token: 'staff-device-token-123456789' }, now);
  await createBooking(db, customer, input, now);
  let sent = 0;
  await createNotificationDispatcher(db, { async sendEachForMulticast() { sent++; return { responses: [{ success: true }] }; } }, { now: () => later(1) }).run();
  assert.equal(sent, 1);
  assert.equal(db.records('notification_outbox').filter(row => row.status === 'RETRY').length, 40);
});
