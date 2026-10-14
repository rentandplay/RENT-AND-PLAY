import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { firestore } from '../src/firebase.mjs';
import { createApi, createFirebaseServices } from '../src/server.mjs';
import { createItem } from '../src/inventory.mjs';
import { MOBILE_RENTAL_TERMS_VERSION } from '../src/rental-flow.mjs';

test('Firestore customer request, mobile/web staff approval, handoff and return preserve shared IDs and stock', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const prefix = `customer_staff_${randomBytes(8).toString('hex')}`;
  const customerId = `${prefix}_customer`, staffId = `${prefix}_staff`, categoryId = `${prefix}_sports`;
  await Promise.all([
    firestore.collection('users').doc(customerId).set({ role: 'CUSTOMER', full_name: 'Emulator Customer', is_active: true, email: 'customer@example.test' }),
    firestore.collection('users').doc(staffId).set({ role: 'OPERATOR', full_name: 'Emulator Operator', is_active: true }),
    firestore.collection('item_categories').doc(categoryId).set({ name: 'Emulator sports', is_active: true })
  ]);
  const unit = await createItem(firestore, staffId, { name: 'Emulator Bicycle', condition: 'GOOD', categoryId, rentalRate: 100, rateType: 'HOURLY', latePenalty: 10, quantity: 2 });
  const services = createFirebaseServices({ db: firestore, auth: { verifyIdToken: async token => ({ uid: token === 'customer' ? customerId : staffId }) } });
  const server = createApi({ services, hardwareEnabled: false, expiryWorker: false, notificationWorker: false, sessions: { verify: async token => token === 'emulator-staff' ? { uid: staffId } : null } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  const customer = { Authorization: 'Bearer customer' }, mobileStaff = { Authorization: 'Bearer staff' }, webStaff = { Cookie: 'rent_play_session=emulator-staff' };
  const key = () => randomBytes(16).toString('hex');
  async function request(path, headers, body, expected = 200) {
    const response = await fetch(origin + path, { headers: { 'Content-Type': 'application/json', ...headers }, method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    assert.equal(response.status, expected, `${path}: ${result.error || response.status}`);
    return result;
  }
  try {
    const { rental } = await request('/mobile/rentals', customer, { itemId: unit.stock_group_id, stockGroupId: unit.stock_group_id, durationMinutes: 60, deliveryLocation: 'Shop pickup', paymentMethod: 'CASH', requestKey: key(), acceptedRentalTerms: true, rentalTermsVersion: MOBILE_RENTAL_TERMS_VERSION }, 201);
    assert.match(rental.rental_code, /^R-\d{4,}$/);
    await request(`/mobile/rentals/${rental.id}/review`, mobileStaff, { action: 'APPROVE' });
    const approved = (await request('/workspace', webStaff)).transactions.find(row => row.id === rental.id);
    assert.equal(approved.rental_code, rental.rental_code); assert.equal(approved.status, 'APPROVED'); assert.equal(approved.start_at, null);
    const item = (await request(`/inventory/${rental.item_id}`, webStaff)).item;
    await request(`/rentals/${rental.id}/prepare-delivery`, webStaff, { inventoryCode: item.qr_token });
    const inspection = { condition: 'GOOD', result: 'AVAILABLE', notes: 'Function, safety and accessories checked.', accessoriesChecked: true };
    await request(`/rentals/${rental.id}/release`, mobileStaff, { requestKey: key(), transactionCode: rental.booking_qr_token, customerVerified: true, paymentVerified: true, inspection });
    const active = (await request('/mobile/rentals', customer)).rentals.find(row => row.id === rental.id);
    assert.equal(active.status, 'ACTIVE'); assert.equal(active.rental_code, rental.rental_code); assert.ok(active.start_at);
    await request(`/mobile/rentals/${rental.id}/return`, customer, { condition: 'GOOD' });
    await request(`/rentals/${rental.id}/receipt`, webStaff, { requestKey: key(), inventoryCode: item.qr_token, physicalReceiptConfirmed: true });
    await request(`/rentals/${rental.id}/complete-return`, mobileStaff, { requestKey: key(), penaltyAmount: 0, inspection });
    const completed = (await request('/mobile/rentals', customer)).rentals.find(row => row.id === rental.id);
    assert.equal(completed.status, 'COMPLETED'); assert.equal(completed.rental_code, rental.rental_code); assert.ok(completed.received_at);
    assert.equal((await request(`/inventory/${rental.item_id}`, webStaff)).item.status, 'AVAILABLE');
    const terminal = await fetch(origin + '/terminals/emulator-standby/pending');
    assert.equal(terminal.status, 409);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await Promise.all([firestore.collection('users').doc(customerId).delete(), firestore.collection('users').doc(staffId).delete(), firestore.collection('item_categories').doc(categoryId).delete()]);
  }
});
