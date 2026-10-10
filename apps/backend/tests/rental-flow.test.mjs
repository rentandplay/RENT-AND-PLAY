import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, createFirebaseServices } from '../src/server.mjs';
import { DEFAULT_PRICING } from '../src/pricing.mjs';
import { mobileCatalog } from '../src/mobile.mjs';
import { createBooking, reviewBooking, prepareRentalDelivery, verifyReleaseCodes, releaseBooking, recordRentalReceipt, completeRentalReturn, cancelBooking, expireRentalHolds, rentalTicket, lookupRental, changeAssignedUnit, settleRentalPayment } from '../src/rental-flow.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const now = new Date('2026-10-06T02:00:00Z');
const admin = { id: 'admin', full_name: 'Inspector', role: 'ADMIN', is_active: true };
const customer = { id: 'customer', full_name: 'Customer', role: 'USER', is_active: true };
const after = minutes => new Date(now.getTime() + minutes * 60000);
const key = letter => letter.repeat(32);
const input = { itemId: 'cards', durationMinutes: 60, requestKey: key('a') };
const inspection = { condition: 'GOOD', result: 'AVAILABLE', notes: 'All pieces counted.', accessoriesChecked: true };
const status = expected => error => error.status === expected;
function fixture() {
  return memoryFirestore({
    users: { admin, customer },
    customers: { customer: { ...customer, auth_uid: customer.id } },
    settings: { business: { default_late_grace_hours: 0 }, pricing: structuredClone(DEFAULT_PRICING) },
    item_categories: { cards: { name: 'Cards' } },
    items: Object.fromEntries(['cards', 'spare'].map(id => [id, { name: 'Cards', item_code: id.toUpperCase(), qr_token: `rp-qr-${id}`, category_id: 'cards', status: 'AVAILABLE', is_active: true }])),
    item_rates: Object.fromEntries(['cards', 'spare'].map(id => [id, { item_id: id, rate_type: 'HOURLY', rental_rate: 50, late_penalty_rate: 10, is_active: true, effective_from: after(-60) }])),
  });
}
async function approved(db) {
  const { rental } = await createBooking(db, customer, input, now);
  await reviewBooking(db, admin, rental.id, { action: 'APPROVE' }, after(1));
  await prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-cards' }, after(1.5));
  return rental;
}
const releaseInput = rental => ({ requestKey: key('b'), transactionCode: rental.booking_qr_token, customerVerified: true, paymentVerified: true, inspection });
const receiptInput = { requestKey: key('c'), inventoryCode: 'rp-qr-cards', physicalReceiptConfirmed: true };
const returnInput = { requestKey: key('d'), penaltyAmount: 0, inspection };
async function active(db) {
  const rental = await approved(db);
  await releaseBooking(db, admin, rental.id, releaseInput(rental), after(2));
  return rental;
}

test('two customers racing for a unit get one booking and one hold', async () => {
  const db = fixture();
  const results = await Promise.allSettled([createBooking(db, customer, input, now), createBooking(db, { ...customer, id: 'other' }, { ...input, requestKey: key('e') }, now)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(db.records('rentals').length, 1);
  assert.equal(db.records('verification_requests').length, 0);
  assert.equal((await mobileCatalog(db)).items.find(row => row.id === 'cards').status, 'RESERVED_PENDING');
});

test('approval and pickup holds expire, refund recorded money, and permit a fresh booking', async () => {
  const db = fixture(), { rental } = await createBooking(db, customer, input, now);
  assert.equal((await expireRentalHolds(db, after(15))).expired, 1);
  assert.equal(db.data('rentals', rental.id).status, 'EXPIRED');
  assert.equal(db.data('items', 'cards').reserved_rental_id, null);
  const next = await createBooking(db, customer, { ...input, requestKey: key('f') }, after(15));
  await reviewBooking(db, admin, next.rental.id, { action: 'APPROVE', paymentVerified: true }, after(16));
  await assert.rejects(releaseBooking(db, admin, next.rental.id, releaseInput(next.rental), after(46)), status(409));
  assert.equal(db.data('rentals', next.rental.id).status, 'EXPIRED');
  assert.equal(db.data('rentals', next.rental.id).refund_due, 50);
  assert.equal(db.data('items', 'cards').reserved_rental_id, null);
});

test('an expiry sweep cannot clear a newer reservation pointer', async () => {
  const db = fixture(), { rental } = await createBooking(db, customer, input, now);
  await db.collection('items').doc('cards').update({ reserved_rental_id: 'newer' });
  await expireRentalHolds(db, after(16));
  assert.equal(db.data('rentals', rental.id).status, 'EXPIRED');
  assert.equal(db.data('items', 'cards').reserved_rental_id, 'newer');
});

test('booking rejection accepts an omitted or blank reason, releases the hold, and retains refunds and audit records', async () => {
  for (const reason of [undefined, '', '   ', '  Customer requested cancellation.  ']) {
    const db = fixture(), { rental } = await createBooking(db, customer, input, now);
    await reviewBooking(db, admin, rental.id, { action: 'APPROVE', paymentVerified: true }, after(1));
    const result = await reviewBooking(db, admin, rental.id, { action: 'REJECT', ...(reason === undefined ? {} : { reason }) }, after(2));
    assert.equal(result.rental.status, 'REJECTED');
    assert.equal(result.rental.final_reason, reason?.trim() || '');
    assert.equal(result.rental.refund_due, 50);
    assert.equal(db.data('items', 'cards').reserved_rental_id, null);
    assert.equal(db.data('items', 'cards').status, 'AVAILABLE');
    const audit = db.records('audit_logs').find(row => row.action === 'RENTAL_REJECTED');
    assert.equal(audit.user_id, admin.id);
    assert.equal(audit.reason, reason?.trim() || '');
  }
});

test('booking rejection still validates supplied reasons before changing records', async () => {
  const db = fixture(), { rental } = await createBooking(db, customer, input, now);
  for (const reason of [false, 123, {}, 'x'.repeat(1001)]) {
    await assert.rejects(reviewBooking(db, admin, rental.id, { action: 'REJECT', reason }, after(1)), status(400));
    assert.equal(db.data('rentals', rental.id).status, 'PENDING_ADMIN_APPROVAL');
    assert.equal(db.data('items', 'cards').reserved_rental_id, rental.id);
  }
  assert.equal(db.records('audit_logs').filter(row => row.action === 'RENTAL_REJECTED').length, 0);
});

test('release rejects wrong rental QR, missing identity, payment or accessory checks without changing inventory', async () => {
  const db = fixture(), rental = await approved(db), good = releaseInput(rental);
  for (const override of [{ transactionCode: 'wrong' }, { customerVerified: false }, { paymentVerified: false }, { inspection: { ...inspection, accessoriesChecked: false } }, { inspection: { ...inspection, photos: ['data:image/png;base64,AAAA'] } }]) {
    await assert.rejects(releaseBooking(db, admin, rental.id, { ...good, ...override }, after(2)));
    assert.equal(db.data('rentals', rental.id).status, 'APPROVED');
    assert.equal(db.data('items', 'cards').status, 'AVAILABLE');
    assert.equal(db.records('item_condition_records').length, 0);
  }
  const results = await Promise.all([releaseBooking(db, admin, rental.id, good, after(2)), releaseBooking(db, admin, rental.id, good, after(3))]);
  assert.equal(results[1].duplicate, true);
  assert.equal(db.data('rentals', rental.id).start_at.getTime(), after(2).getTime());
  assert.equal(db.records('item_condition_records').length, 1);
  assert.equal(db.records('item_status_history').length, 1);
});

test('manual lookup needs a matching rental code and records its reason', async () => {
  const db = fixture(), rental = await approved(db);
  const manual = { ...releaseInput(rental), transactionCode: rental.rental_code };
  await assert.rejects(releaseBooking(db, admin, rental.id, manual, after(2)), status(409));
  await releaseBooking(db, admin, rental.id, { ...manual, manualLookup: true, manualReason: 'Camera unavailable; matched printed codes.' }, after(2));
  assert.equal(db.data('rentals', rental.id).handoff_verification.verification_method, 'MANUAL');
  assert.match(db.records('audit_logs').find(row => row.action === 'RENTAL_RELEASED').manual_reason, /Camera/);
});

test('delivery preparation verifies the assigned unit and release preflight verifies the customer rental QR', async () => {
  const db = fixture(), rental = await approved(db);
  await db.collection('items').doc('cards').update({ name: 'Bingo Set' });
  await db.collection('items').doc('bicycle').set({ name: 'Bicycle', item_code: 'BIKE-001', qr_token: 'rp-qr-bike', status: 'AVAILABLE' });
  const before = structuredClone(db.records('rentals'));
  await assert.rejects(prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-bike' }, after(2)), status(409));
  await assert.rejects(verifyReleaseCodes(db, admin, rental.id, {}, after(2)), status(400));
  await assert.rejects(verifyReleaseCodes(db, admin, rental.id, { transactionCode: 'wrong-booking' }, after(2)), status(409));
  const booking = await verifyReleaseCodes(db, admin, rental.id, { transactionCode: rental.booking_qr_token }, after(2));
  assert.equal(booking.booking_verified, true); assert.equal(booking.inventory_verified, true); assert.equal(booking.delivery_prepared, true);
  assert.equal(booking.item.name, 'Bingo Set'); assert.equal(booking.item.item_code, 'CARDS');
  assert.deepEqual(db.records('rentals'), before); assert.equal(db.data('items', 'cards').status, 'AVAILABLE');
  assert.equal(db.records('item_condition_records').length, 0);
  const manual = await verifyReleaseCodes(db, admin, rental.id, { transactionCode: rental.rental_code, manualLookup: true, manualReason: 'Camera unavailable' }, after(2));
  assert.equal(manual.booking_verified, true);
});

test('preparing the same assigned unit twice is idempotent and changing units permits a new preparation alert', async () => {
  const db = fixture(), rental = await approved(db);
  const first = await prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-cards' }, after(2));
  assert.equal(first.duplicate, true);
  assert.equal(db.records('notification_outbox').filter(row => row.type === 'DELIVERY_PREPARED').length, 1);

  await changeAssignedUnit(db, admin, rental.id, { inventoryCode: 'rp-qr-spare', reason: 'Use inspected spare.' }, after(3));
  await prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-spare' }, after(4));
  assert.equal(db.data('rentals', rental.id).delivery_preparation.item_id, 'spare');
  assert.equal(db.records('notification_outbox').filter(row => row.type === 'DELIVERY_PREPARED').length, 2);
});

test('preflight rejects expired bookings and rechecks assignment changes before the final release', async () => {
  const expiredDb = fixture(), { rental: expiredRental } = await createBooking(expiredDb, customer, input, now);
  await reviewBooking(expiredDb, admin, expiredRental.id, { action: 'APPROVE' }, after(1));
  await assert.rejects(verifyReleaseCodes(expiredDb, admin, expiredRental.id, { transactionCode: expiredRental.booking_qr_token }, after(31)), status(409));

  const db = fixture(), rental = await approved(db), codes = { transactionCode: rental.booking_qr_token };
  await verifyReleaseCodes(db, admin, rental.id, codes, after(2));
  await changeAssignedUnit(db, admin, rental.id, { inventoryCode: 'rp-qr-spare', reason: 'Use inspected spare' }, after(3));
  await assert.rejects(verifyReleaseCodes(db, admin, rental.id, codes, after(4)), status(409));
  await assert.rejects(releaseBooking(db, admin, rental.id, releaseInput(rental), after(4)), status(409));
  await prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-spare' }, after(4));
  const updated = await verifyReleaseCodes(db, admin, rental.id, codes, after(4));
  assert.equal(updated.item.id, 'spare'); assert.equal(updated.inventory_verified, true);
});

test('transaction tickets belong to their owner and both QR lookups select the exact rental', async () => {
  const db = fixture(), rental = await active(db);
  await assert.rejects(rentalTicket(db, { id: 'other' }, rental.id), status(403));
  const { ticket } = await rentalTicket(db, customer, rental.id);
  assert.match(ticket.image_data_url, /^data:image\/png;base64,/);
  assert.match(ticket.hold_expires_at, /Z$/);
  assert.equal((await lookupRental(db, { code: ticket.value, kind: 'BOOKING' })).rental.id, rental.id);
  assert.equal((await lookupRental(db, { code: 'rp-qr-cards', kind: 'INVENTORY' })).rental.id, rental.id);
  await assert.rejects(lookupRental(db, { code: 'rp-qr-spare', kind: 'INVENTORY' }), status(409));
});

test('changing the assigned unit transfers only the hold and checks pricing', async () => {
  const db = fixture(), rental = await approved(db);
  await db.collection('item_rates').doc('spare').update({ rental_rate: 51 });
  await assert.rejects(changeAssignedUnit(db, admin, rental.id, { inventoryCode: 'SPARE', reason: 'Use inspected spare.' }, after(2)), status(409));
  assert.equal(db.data('items', 'cards').reserved_rental_id, rental.id);
  await db.collection('item_rates').doc('spare').update({ rental_rate: 50 });
  await changeAssignedUnit(db, admin, rental.id, { inventoryCode: 'rp-qr-spare', reason: 'Use inspected spare.' }, after(2));
  assert.equal(db.data('items', 'cards').reserved_rental_id, null);
  assert.equal(db.data('items', 'spare').reserved_rental_id, rental.id);
  await assert.rejects(releaseBooking(db, admin, rental.id, releaseInput(rental), after(3)), status(409));
  await prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-spare' }, after(2.5));
  await releaseBooking(db, admin, rental.id, releaseInput(rental), after(3));
  assert.equal(db.data('items', 'spare').status, 'RENTED');
});

test('physical receipt stops overtime before inspection, remains unavailable, and repeated confirmations are harmless', async () => {
  const db = fixture(), rental = await active(db);
  await assert.rejects(completeRentalReturn(db, admin, rental.id, returnInput, after(63)), status(409));
  await assert.rejects(recordRentalReceipt(db, admin, rental.id, { ...receiptInput, physicalReceiptConfirmed: false }, after(63)), status(400));
  await recordRentalReceipt(db, admin, rental.id, receiptInput, after(63));
  assert.equal((await recordRentalReceipt(db, admin, rental.id, receiptInput, after(80))).duplicate, true);
  assert.equal(db.data('items', 'cards').status, 'UNDER_INSPECTION');
  assert.equal((await mobileCatalog(db)).items.find(row => row.id === 'cards').can_rent, false);
  await assert.rejects(createBooking(db, customer, { ...input, requestKey: key('e') }, after(70)), status(409));
  await completeRentalReturn(db, admin, rental.id, returnInput, after(180));
  assert.equal((await completeRentalReturn(db, admin, rental.id, returnInput, after(190))).duplicate, true);
  const saved = db.data('rentals', rental.id);
  assert.equal(saved.received_at.getTime(), after(63).getTime());
  assert.equal(saved.fee_breakdown.overtime_fee, 10);
  assert.equal(saved.fee_breakdown.final_rental_charges, 60);
  assert.equal(saved.balance_due, 10); assert.equal(saved.refund_due, 0);
  assert.equal(db.data('items', 'cards').status, 'AVAILABLE');
});

test('damage forces maintenance and settlement changes money separately from equipment availability', async () => {
  const db = fixture(), rental = await active(db);
  await recordRentalReceipt(db, admin, rental.id, receiptInput, after(30));
  const damaged = { ...inspection, condition: 'DAMAGED', result: 'AVAILABLE' };
  await assert.rejects(completeRentalReturn(db, admin, rental.id, { ...returnInput, inspection: damaged }, after(40)), status(400));
  await completeRentalReturn(db, admin, rental.id, { ...returnInput, penaltyAmount: 30, penaltyReason: 'Missing game pieces.', inspection: { ...damaged, result: 'UNDER_MAINTENANCE' } }, after(40));
  const saved = db.data('rentals', rental.id);
  assert.equal(db.data('items', 'cards').status, 'UNDER_MAINTENANCE');
  assert.equal(db.data('maintenance_records', saved.maintenance_record_id).rental_id, rental.id);
  const payment = { requestKey: key('e'), paymentAmount: 30, notes: 'Customer paid the remaining rental charges.' };
  await settleRentalPayment(db, admin, rental.id, payment, after(41));
  assert.equal((await settleRentalPayment(db, admin, rental.id, payment, after(42))).duplicate, true);
  assert.equal(db.data('rentals', rental.id).balance_due, 0); assert.equal(db.data('rentals', rental.id).refund_due, 0);
  assert.equal(db.data('items', 'cards').status, 'UNDER_MAINTENANCE');
  await assert.rejects(settleRentalPayment(db, admin, rental.id, { ...payment, requestKey: key('f') }, after(43)), status(400));
  await assert.rejects(settleRentalPayment(db, admin, rental.id, { ...payment, paymentAmount: 21 }, after(43)), status(409));
  assert.equal(db.records('rental_settlements').length, 1);
});

test('cancelled prepaid bookings track and refund actual payments without fabricating a paid rental', async () => {
  const db = fixture(), rental = await approved(db);
  // Repeated approval does not recollect payments; collection happens at release or initial approval.
  await db.collection('rentals').doc(rental.id).update({ rental_paid_amount: 50 });
  await cancelBooking(db, customer, rental.id, after(2));
  assert.equal((await cancelBooking(db, customer, rental.id, after(3))).duplicate, true);
  const saved = db.data('rentals', rental.id);
  assert.equal(saved.balance_due, 0); assert.equal(saved.refund_due, 50);
  await assert.rejects(settleRentalPayment(db, admin, rental.id, { requestKey: key('e'), rentalRefundAmount: 51, notes: 'Refund' }, after(3)), status(400));
  await settleRentalPayment(db, admin, rental.id, { requestKey: key('e'), rentalRefundAmount: 50, notes: 'Rental payment refunded.' }, after(3));
  assert.equal(db.data('rentals', rental.id).refund_due, 0);
  assert.equal(db.data('rentals', rental.id).confirmed_rental_at, null);
});

test('whole-stay bookings keep a fixed checkout deadline when physically released later', async () => {
  const db = fixture();
  await db.collection('items').doc('cards').update({ pricing_product_id: 'jenga' });
  const { rental } = await createBooking(db, admin, { ...input, customerId: customer.id, mode: 'WHOLE_STAY', resortCheckoutAt: after(600).toISOString() }, now, { staff: true });
  await prepareRentalDelivery(db, admin, rental.id, { inventoryCode: 'rp-qr-cards' }, after(1));
  await releaseBooking(db, admin, rental.id, releaseInput(rental), after(20));
  assert.equal(db.data('rentals', rental.id).due_at.getTime(), after(600).getTime());
  assert.equal(db.data('rentals', rental.id).rental_fee, 250);
});

test('malformed API inputs return validation errors', async () => {
  const db = fixture();
  for (const action of [releaseBooking, recordRentalReceipt, completeRentalReturn, changeAssignedUnit, settleRentalPayment]) await assert.rejects(action(db, admin, 'rental', null, now), status(400));
  await assert.rejects(lookupRental(db, null), status(400));
  await assert.rejects(createBooking(db, customer, [], now), status(400));
});

test('legacy physical returns can clear equipment without inventing original rates or payment receipts', async () => {
  const db = fixture();
  await db.collection('rentals').doc('legacy').set({ itemId: 'cards', customerId: customer.id, status: 'ACTIVE', rateFee: 50, deposit: 20, dueDate: after(60), confirmed_rental_at: now });
  await db.collection('items').doc('cards').update({ status: 'RENTED' });
  await recordRentalReceipt(db, admin, 'legacy', receiptInput, after(70));
  const { rental } = await completeRentalReturn(db, admin, 'legacy', returnInput, after(120));
  assert.equal(rental.status, 'COMPLETED');
  assert.equal(rental.fee_breakdown.rental_fee, 50);
  assert.equal(rental.fee_breakdown.penalty_amount, 0);
  assert.equal(rental.fee_breakdown.overtime_fee, null);
  assert.equal(rental.fee_breakdown.final_rental_charges, null);
  assert.equal(rental.payment_status, 'UNKNOWN');
  assert.equal(rental.balance_due, null); assert.equal(rental.refund_due, null);
  assert.equal(db.data('items', 'cards').status, 'AVAILABLE');
  assert.equal(rental.return_condition.notes, inspection.notes);
  await assert.rejects(settleRentalPayment(db, admin, 'legacy', { requestKey: key('e'), depositRefundAmount: 20, notes: 'Unproven refund' }, after(121)), status(409));
});

test('ESP32 stays visible as historical configuration while hardware endpoints cannot finalize rentals by default', async () => {
  const db = fixture(), services = createFirebaseServices({ db, now: () => now });
  const server = createApi({ services, expiryWorker: false, hardwareEnabled: false, sessions: { verify: async () => ({ uid: admin.id }) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    assert.equal((await fetch(base + '/terminals/device/pending')).status, 409);
    assert.equal((await fetch(base + '/terminals/device/confirm', { method: 'POST' })).status, 409);
    const legacy = await fetch(base + '/rentals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(legacy.status, 409);
    assert.equal(db.records('rentals').length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
