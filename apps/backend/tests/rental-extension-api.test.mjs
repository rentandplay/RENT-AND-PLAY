import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFirestore } from './support/memory-firestore.mjs';
import { createBooking, reviewBooking, prepareRentalDelivery, releaseBooking } from '../src/rental-flow.mjs';
import { createApi, createFirebaseServices } from '../src/server.mjs';
import { asDate } from '../src/firebase.mjs';

test('app extension requests and website reviews share due time, charges and live updates without returning equipment', { timeout: 15000 }, async () => {
  const start = new Date('2026-11-13T08:31:00Z'), at = minutes => new Date(start.getTime() + minutes * 60000);
  const key = letter => letter.repeat(32);
  const staff = { id: 'operator', role: 'OPERATOR', full_name: 'Operator' }, customer = { id: 'customer', role: 'CUSTOMER' };
  const db = memoryFirestore({
    users: { operator: { role: 'OPERATOR', is_active: true }, customer: { role: 'CUSTOMER', is_active: true } },
    customers: { customer: { full_name: 'Sai', is_active: true } },
    items: { bike: { name: 'Bicycle', item_code: 'EQUIP-016', qr_token: 'bike-qr', status: 'AVAILABLE', is_active: true } },
    item_rates: { hourly: { item_id: 'bike', rate_type: 'HOURLY', rental_rate: 100, late_penalty_rate: 20, is_active: true, effective_from: at(-100) } }
  });
  const { rental } = await createBooking(db, customer, { itemId: 'bike', durationMinutes: 60, deliveryLocation: 'Lakewood resort', requestKey: key('a') }, start);
  await reviewBooking(db, staff, rental.id, { action: 'APPROVE' }, at(1));
  await prepareRentalDelivery(db, staff, rental.id, { inventoryCode: 'bike-qr' }, at(2));
  await releaseBooking(db, staff, rental.id, { requestKey: key('b'), transactionCode: rental.booking_qr_token, customerVerified: true, paymentVerified: true, inspection: { condition: 'GOOD', result: 'AVAILABLE', accessoriesChecked: true } }, at(3));
  const original = structuredClone(db.data('rentals', rental.id));
  const services = createFirebaseServices({ db, now: () => at(6), auth: { verifyIdToken: async uid => ({ uid }) } });
  const server = createApi({ services, hardwareEnabled: false, expiryWorker: false, notificationWorker: false, sessions: { verify: async () => ({ uid: staff.id }) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const web = { Cookie: 'rent_play_session=cookie', 'Content-Type': 'application/json' }, app = { Authorization: 'Bearer customer', 'Content-Type': 'application/json' };
  const readers = [];
  const get = async (path, headers = web) => {
    const response = await fetch(base + path, { headers });
    assert.equal(response.status, 200, path); return response.json();
  };
  const post = async (path, body, headers = web) => {
    const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const result = await response.json(); assert.equal(response.status, 200, `${path}: ${JSON.stringify(result)}`); return result;
  };
  async function expectLiveUpdate(reader) {
    let text = '';
    while (!text.includes('event: rental.changed')) text += new TextDecoder().decode((await reader.read()).value);
    assert.match(text, new RegExp(`"rentalId":"${rental.id}"`));
  }
  try {
    for (const headers of [web, app]) {
      const response = await fetch(base + '/rental-events', { headers });
      assert.equal(response.status, 200);
      const reader = response.body.getReader(); readers.push(reader); await reader.read();
    }
    const request = { requestKey: key('c'), additionalMinutes: 180 };
    const { quote } = await post(`/mobile/rentals/${rental.id}/extension-quote`, request, app);
    assert.equal(quote.additional_fee, 300);
    const payload = { ...request, expectedAdditionalFee: quote.additional_fee };
    const pending = await post(`/mobile/rentals/${rental.id}/extension`, payload, app);
    assert.equal(pending.rental.status, 'ACTIVE');
    assert.equal(new Date(pending.rental.due_at).getTime(), original.due_at.getTime());
    for (const reader of readers) await expectLiveUpdate(reader);
    assert.equal((await get('/notifications')).notifications[0].type, 'EXTENSION_REQUESTED');
    const review = { action: 'APPROVE', requestKey: request.requestKey };
    const approved = await post(`/rentals/${rental.id}/extension-review`, review);
    for (const reader of readers) await expectLiveUpdate(reader);
    assert.equal(approved.rental.status, 'ACTIVE');
    assert.equal(approved.rental.extension_request.status, 'APPROVED');
    assert.equal(new Date(approved.rental.due_at).getTime(), original.due_at.getTime() + 180 * 60000);
    assert.equal(approved.rental.rental_fee, 400);
    assert.equal(approved.rental.balance_due, 300);
    assert.equal(approved.rental.rental_paid_amount, 100);
    for (const result of [await get(`/mobile/rentals/${rental.id}`, app), { rental: (await get('/dashboard')).rentals.find(row => row.id === rental.id) }, { rental: (await get('/workspace?view=Rentals')).transactions.find(row => row.id === rental.id) }]) {
      assert.equal(result.rental.status, 'ACTIVE');
      assert.equal(asDate(result.rental.due_at).getTime(), asDate(approved.rental.due_at).getTime());
      assert.equal(result.rental.balance_due, 300);
      assert.equal(result.rental.extension_request.status, 'APPROVED');
      assert.ok(!result.rental.received_at);
      assert.ok(!result.rental.confirmed_return_at);
    }
    const item = db.data('items', 'bike');
    assert.equal(item.status, 'RENTED');
    assert.equal(item.current_rental_id, rental.id);
    assert.equal(db.records('payment_ledger').length, 1);
    assert.equal((await post(`/rentals/${rental.id}/extension-review`, review)).duplicate, true);
    assert.equal((await post(`/mobile/rentals/${rental.id}/extension`, payload, app)).duplicate, true);
    const next = { requestKey: key('d'), additionalMinutes: 60, expectedAdditionalFee: 100 };
    await post(`/mobile/rentals/${rental.id}/extension`, next, app);
    await post(`/rentals/${rental.id}/extension-review`, { action: 'REJECT', requestKey: next.requestKey, reason: 'Next reservation' });
    const rejected = (await get(`/mobile/rentals/${rental.id}`, app)).rental;
    assert.equal(rejected.due_at, approved.rental.due_at);
    assert.equal(rejected.balance_due, 300);
    assert.equal(rejected.status, 'ACTIVE');
    assert.equal(rejected.extension_request.status, 'REJECTED');
    const inbox = (await get('/notifications', app)).notifications;
    assert.equal(inbox.filter(row => row.type === 'EXTENSION_APPROVE').length, 1);
    assert.equal(inbox.filter(row => row.type === 'EXTENSION_REJECT').length, 1);
  } finally {
    for (const reader of readers) await reader.cancel();
    await new Promise(resolve => server.close(resolve));
  }
});
