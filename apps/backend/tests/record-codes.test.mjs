import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { allocateRecordCodes, createRecordCodeService } from '../src/record-codes.mjs';
import { createFirebaseServices } from '../src/server.mjs';
import { createBooking, prepareRentalDelivery, verifyReleaseCodes, lookupRental } from '../src/rental-flow.mjs';
import { DEFAULT_PRICING } from '../src/pricing.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

test('concurrent references are unique across clients and failed transactions consume no code', async () => {
  const db = memoryFirestore({ rentals: { old: { rental_code: 'R-0042' } } });
  const codes = await Promise.all(Array.from({ length: 20 }, (_, index) => db.runTransaction(async tx => {
    const [rental, request] = await allocateRecordCodes(tx, db, ['rentals', 'verification_requests']);
    tx.create(db.collection('rentals').doc(String(index)), { rental_code: rental });
    return [rental, request];
  })));
  assert.equal(new Set(codes.map(row => row[0])).size, 20);
  assert.equal(new Set(codes.map(row => row[1])).size, 20);
  assert.equal(codes[0][0], 'R-0043');
  const before = db.data('counters', 'rental_codes_R');
  await assert.rejects(db.runTransaction(async tx => { await allocateRecordCodes(tx, db, ['rentals']); throw Error('Invalid handoff'); }));
  assert.deepEqual(db.data('counters', 'rental_codes_R'), before);
});

test('old references are saved once while document IDs, QR tokens, history and timestamps stay stable', async () => {
  const id = 'booking_175c005753c10d47420d248d68a8d3cb7c864d10';
  const original = { rental_code: 'R-CB7C864D10', booking_qr_token: 'rp-rental-preserve-this', item_id: 'item', customer_id: 'customer', status: 'ACTIVE', created_at: new Date(), updated_at: new Date() };
  const db = memoryFirestore({ rentals: { [id]: original } }), refs = createRecordCodeService(db);
  const first = await refs.ensure('rentals', { id, ...original });
  const second = await refs.ensure('rentals', { id, ...original });
  assert.equal(first.rental_code, 'R-0001');
  assert.equal(second.rental_code, first.rental_code);
  assert.equal(first.id, id);
  assert.equal(first.legacy_rental_code, original.rental_code);
  for (const field of ['booking_qr_token', 'item_id', 'customer_id', 'status', 'created_at', 'updated_at']) assert.deepEqual(db.data('rentals', id)[field], original[field]);
});

test('large lists and overlapping mobile/web reads share persisted codes without counter collisions', async () => {
  const db = memoryFirestore({ maintenance_records: Object.fromEntries(Array.from({ length: 115 }, (_, i) => ['repair-' + i, { status: 'COMPLETED', item_id: 'item' }])) });
  const web = createRecordCodeService(db), mobile = createRecordCodeService(db), rows = db.records('maintenance_records');
  const [a, b] = await Promise.all([web.ensureMany('maintenance_records', rows), mobile.ensureMany('maintenance_records', rows)]);
  assert.equal(new Set(a.map(row => row.maintenance_code)).size, 115);
  assert.deepEqual(a.map(row => row.maintenance_code), b.map(row => row.maintenance_code));
});

test('every public record type uses a saved reference and preserves existing equipment/customer/terminal codes', async () => {
  const fixture = { users: { owner: {} }, item_categories: { sports: {} }, item_rates: { hourly: {} }, verification_requests: { request: {} }, maintenance_records: { repair: {} }, audit_logs: { audit: {} }, items: { unit: { item_code: 'EQUIP-017', qr_token: 'private-qr-token' } }, customers: { guest: { customer_code: 'CUST-002' } }, terminals: { counter: { terminal_code: 'TERM-001' } } };
  const db = memoryFirestore(fixture), refs = createRecordCodeService(db);
  const payload = await refs.enrich({ users: db.records('users'), categories: db.records('item_categories'), rates: db.records('item_rates'), verification: db.records('verification_requests'), maintenance: db.records('maintenance_records'), auditLogs: db.records('audit_logs'), items: db.records('items'), customers: db.records('customers'), terminals: db.records('terminals') });
  for (const [key, field, expected] of [['users', 'account_code', 'USER-001'], ['categories', 'category_code', 'CAT-001'], ['rates', 'rate_code', 'RATE-001'], ['verification', 'request_code', 'V-0001'], ['maintenance', 'maintenance_code', 'M-0001'], ['auditLogs', 'audit_code', 'A-0001']]) assert.equal(payload[key][0][field], expected);
  assert.equal(payload.items[0].item_code, 'EQUIP-017');
  assert.equal(payload.items[0].qr_token, 'private-qr-token');
  assert.equal(payload.customers[0].customer_code, 'CUST-002');
  assert.equal(payload.terminals[0].terminal_code, 'TERM-001');
});

test('mobile, web, handoff QR, equipment QR and both old/new lookups identify the same rental and physical unit', async () => {
  const now = new Date(), admin = { id: 'admin', role: 'OWNER', full_name: 'Operator' }, customer = { id: 'customer', role: 'CUSTOMER', full_name: 'Guest' };
  const db = memoryFirestore({ users: { admin, customer }, customers: { customer: { ...customer, customer_code: 'CUST-001' } }, items: { unit: { name: 'Bicycle', item_code: 'EQUIP-001', qr_token: 'rp-qr-physical-unit', category_id: 'sports', is_active: true, status: 'AVAILABLE' } }, item_categories: { sports: { name: 'Sports' } }, item_rates: { rate: { item_id: 'unit', rate_type: 'HOURLY', rental_rate: 50, late_penalty_rate: 10, effective_from: new Date(now - 60000), is_active: true } }, settings: { pricing: structuredClone(DEFAULT_PRICING) } });
  const original = (await createBooking(db, admin, { itemId: 'unit', customerId: 'customer', durationMinutes: 60, requestKey: 'a'.repeat(32), deliveryLocation: 'Shop pickup' }, now, { staff: true })).rental;
  await prepareRentalDelivery(db, admin, original.id, { inventoryCode: 'rp-qr-physical-unit' }, now);
  await db.collection('rentals').doc(original.id).update({ rental_code: 'R-CB7C864D10' });
  const services = createFirebaseServices({ db, now: () => now });
  const web = await services.workspace('OPERATOR'), mobile = await services.mobileRentalList(customer), ticket = (await services.rentalTicket(customer, original.id)).ticket;
  const publicCode = web.transactions[0].rental_code;
  assert.match(publicCode, /^R-\d{4}$/);
  assert.equal(mobile.rentals[0].rental_code, publicCode);
  assert.equal(ticket.rental_code, publicCode);
  assert.equal(ticket.rental_id, original.id);
  assert.equal(ticket.value, original.booking_qr_token);
  assert.equal(ticket.image_data_url, await QRCode.toDataURL(original.booking_qr_token, { errorCorrectionLevel: 'M', margin: 4, width: 360 }));
  const label = await services.inventoryQr('unit');
  assert.equal(label.token, 'rp-qr-physical-unit');
  assert.equal(label.code, mobile.rentals[0].item_code);
  const verified = await verifyReleaseCodes(db, admin, original.id, { transactionCode: ticket.value }, now);
  assert.equal(verified.rental_verified, true);
  assert.equal(verified.rental.id, mobile.rentals[0].id);
  for (const code of [publicCode, 'R-CB7C864D10', ticket.value]) {
    const found = await lookupRental(db, { kind: 'RENTAL', code });
    assert.equal(found.rental.id, original.id);
    assert.equal(found.rental.rental_code, publicCode);
  }
  await assert.rejects(verifyReleaseCodes(db, admin, original.id, { transactionCode: 'another-rental-token' }, now), error => error.status === 409);
});
