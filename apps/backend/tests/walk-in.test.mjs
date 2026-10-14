import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomer, createMobileCustomerAccount } from '../src/workspace.mjs';
import { createBooking, prepareRentalDelivery, verifyReleaseCodes, releaseBooking, recordRentalReceipt, completeRentalReturn } from '../src/rental-flow.mjs';
import { DEFAULT_PRICING } from '../src/pricing.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const now = new Date('2026-10-14T02:00:00Z');
const at = minutes => new Date(now.getTime() + minutes * 60000);
const staff = { id: 'operator', role: 'OPERATOR', full_name: 'Shop Operator', is_active: true };
const key = value => value.repeat(32);
const profile = { fullName: 'Juan Dela Cruz', phone: '09171234567', requestKey: key('a') };
const inspection = { condition: 'GOOD', result: 'AVAILABLE', notes: 'Unit and accessories checked.', accessoriesChecked: true };
const booking = customer => ({ itemId: 'unit', customerId: customer.id, rentalChannel: 'WALK_IN', fulfillmentMode: 'SHOP_HANDOVER', durationMinutes: 60, mode: 'TIMED', paymentMethod: 'CASH', requestKey: key('b') });
function fixture() {
  return memoryFirestore({ users: { operator: staff }, settings: { business: { default_late_grace_hours: 0 }, pricing: structuredClone(DEFAULT_PRICING) }, item_categories: { sports: { name: 'Sports' } },
    items: { unit: { name: 'Basketball', item_code: 'EQUIP-001', qr_token: 'unit-qr', category_id: 'sports', status: 'AVAILABLE', is_active: true } },
    item_rates: { rate: { item_id: 'unit', rate_type: 'HOURLY', rental_rate: 50, late_penalty_rate: 10, is_active: true, effective_from: at(-60) } } });
}

test('walk-in profile needs no email or auth account; retries and equivalent contact formats do not duplicate', async () => {
  const db = fixture();
  const customer = await createCustomer(db, staff.id, profile, now);
  assert.equal(customer.email, null);
  assert.equal(customer.auth_uid, null);
  assert.equal(db.records('users').length, 1);
  assert.match(customer.customer_code, /^CUST-\d+$/);
  assert.equal((await createCustomer(db, staff.id, profile, now)).id, customer.id);
  await assert.rejects(createCustomer(db, staff.id, { ...profile, phone: '+63 917 123 4567', requestKey: key('c') }, now), error => error.status === 409 && /already exists/.test(error.message));
  await assert.rejects(createCustomer(db, staff.id, { fullName: profile.fullName }, now), error => error.status === 400);
  assert.equal(db.records('customers').length, 1);
});

test('walk-in handover requires exact unit, identity, payment and agreement; timer starts and stops at physical possession changes', async () => {
  const db = fixture(), customer = await createCustomer(db, staff.id, profile, now);
  const { rental } = await createBooking(db, staff, booking(customer), now, { staff: true });
  assert.equal(rental.status, 'APPROVED');
  assert.equal(rental.start_at, null);
  assert.equal(rental.fulfillment_mode, 'SHOP_HANDOVER');
  assert.equal(rental.delivery_location, 'Rent & Play · Lakewoods, Los Baños');
  assert.equal(db.data('items', 'unit').status, 'AVAILABLE');
  assert.equal(db.data('items', 'unit').reserved_rental_id, rental.id);
  const handover = { transactionCode: rental.rental_code, manualLookup: true, manualReason: 'Customer verified in person at the shop.', requestKey: key('d'), customerVerified: true, customerTermsAcknowledged: true, paymentVerified: true, inspection };
  await assert.rejects(releaseBooking(db, staff, rental.id, handover, at(1)), error => error.status === 409);
  await assert.rejects(prepareRentalDelivery(db, staff, rental.id, { inventoryCode: 'other-unit-qr' }, at(1)), error => error.status === 409);
  await prepareRentalDelivery(db, staff, rental.id, { inventoryCode: 'unit-qr' }, at(1));
  const verified = await verifyReleaseCodes(db, staff, rental.id, handover, at(2));
  assert.equal(verified.rental_verified, true);
  await assert.rejects(releaseBooking(db, staff, rental.id, { ...handover, transactionCode: 'R-WRONG' }, at(2)), error => error.status === 409);
  for (const field of ['customerVerified', 'customerTermsAcknowledged', 'paymentVerified']) await assert.rejects(releaseBooking(db, staff, rental.id, { ...handover, [field]: false }, at(2)), error => error.status === 400);
  const released = await releaseBooking(db, staff, rental.id, handover, at(2));
  assert.equal(released.rental.start_at, at(2).toISOString());
  assert.equal(released.rental.rental_terms_acceptance.acceptance_method, 'STAFF_WITNESSED');
  assert.equal(db.data('items', 'unit').status, 'RENTED');
  const duplicate = await releaseBooking(db, staff, rental.id, handover, at(3));
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.rental.start_at, released.rental.start_at);
  await recordRentalReceipt(db, staff, rental.id, { inventoryCode: 'unit-qr', physicalReceiptConfirmed: true, requestKey: key('e') }, at(20));
  assert.equal(db.data('items', 'unit').status, 'UNDER_INSPECTION');
  const returned = await completeRentalReturn(db, staff, rental.id, { requestKey: key('f'), penaltyAmount: 0, inspection }, at(21));
  assert.equal(returned.rental.status, 'COMPLETED');
  assert.equal(db.data('items', 'unit').status, 'AVAILABLE');
});

test('walk-in delivery requires a resort address and cannot be submitted by a customer', async () => {
  const db = fixture(), customer = await createCustomer(db, staff.id, profile, now);
  await assert.rejects(createBooking(db, staff, { ...booking(customer), fulfillmentMode: 'DELIVERY' }, now, { staff: true }), error => error.status === 400);
  await assert.rejects(createBooking(db, { id: customer.id }, booking(customer), now), error => error.status === 400);
  const result = await createBooking(db, staff, { ...booking(customer), fulfillmentMode: 'DELIVERY', deliveryLocation: 'Customer resort, gate 2' }, now, { staff: true });
  assert.equal(result.rental.delivery_location, 'Customer resort, gate 2');
  await assert.rejects(createBooking(db, staff, { ...booking(customer), fulfillmentMode: 'SHOP_HANDOVER' }, now, { staff: true }), error => error.status === 409);
});

test('adding app access to a walk-in preserves customer ID, code and rental history', async () => {
  const db = fixture(), customer = await createCustomer(db, staff.id, profile, now);
  const { rental } = await createBooking(db, staff, booking(customer), now, { staff: true });
  const authCalls = [];
  const auth = { createUser: async input => { authCalls.push(input); return { uid: input.uid }; }, deleteUser: async () => {} };
  const upgraded = await createMobileCustomerAccount(auth, db, staff.id, { fullName: profile.fullName, phone: profile.phone, email: 'juan@example.com', password: 'Welcome123', confirmPassword: 'Welcome123', customerId: customer.id }, at(1), { validateEmail: async value => value });
  assert.equal(authCalls[0].uid, customer.id);
  assert.equal(upgraded.id, customer.id);
  assert.equal(upgraded.customer_code, customer.customer_code);
  assert.equal(db.records('customers').length, 1);
  assert.equal(db.data('rentals', rental.id).customer_id, upgraded.id);
  assert.equal(db.data('users', upgraded.id).role, 'CUSTOMER');
});
