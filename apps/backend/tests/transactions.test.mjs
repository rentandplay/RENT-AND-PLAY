import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { authenticateTerminal, createRentalRequest, createReturnRequest, expireVerificationRequests, finalCharges, publicTerminal, resolveTerminalRequest, saveRequestInspection, startExpiryWorker, terminalPending, validatePenalty } from '../src/transactions.mjs';
import { DEFAULT_PRICING, savePricing } from '../src/pricing.mjs';
import { itemAction } from '../src/inventory.mjs';
import { localDateTime } from '../src/firebase.mjs';
import { loadWorkspace } from '../src/workspace.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

export const requestTime = new Date('2026-10-03T01:00:00Z');
export const actor = { id: 'admin-1', full_name: 'Test Inspector', role: 'ADMIN', is_active: true };
export const deviceKey = 'test-device-key-123456789012345678901234567890';
const inspection = { condition: 'GOOD', notes: 'Frame, brakes, tires, and included parts checked.', result: 'AVAILABLE' };
export function fixture() {
  const pricing = structuredClone(DEFAULT_PRICING); pricing.products.find(product => product.id === 'bike').deposit_amount = 100;
  return memoryFirestore({
    users: { [actor.id]: actor }, settings: { pricing, business: { default_late_grace_hours: 0 } },
    items: { 'item-1': { name: 'Bike', item_code: 'BIKE-001', pricing_product_id: 'bike', condition_status: 'GOOD', status: 'AVAILABLE', is_active: true, updated_at: requestTime } },
    customers: { 'customer-1': { full_name: 'Test Customer', customer_code: 'CUST-01', is_active: true } },
    terminals: { 'terminal-1': { name: 'Counter', terminal_code: 'TERM-01', is_active: true, auth_token_hash: createHash('sha256').update(deviceKey).digest('hex') } }
  });
}
export const rentalInput = { itemId: 'item-1', customerId: 'customer-1', terminalId: 'terminal-1', durationMinutes: 180, inspection };
export async function confirm(db, request, time = new Date(requestTime.getTime() + 1000), overrides = {}) {
  const terminal = await authenticateTerminal(db, 'terminal-1', deviceKey);
  return resolveTerminalRequest(db, terminal, { requestId: request.id, verificationCode: request.verification_code, inspectionRevision: db.data('verification_requests', request.id).inspection_revision, button: 'OK', action: 'CONFIRM', ...overrides }, time);
}
async function released(db) { const response = await createRentalRequest(db, actor, rentalInput, requestTime); await confirm(db, response.request); return response; }

test('the saved package, deposit, and overtime survive subsequent pricing edits', async () => {
  const db = fixture(), response = await released(db), original = db.data('rentals', response.rental.id).fee_breakdown;
  assert.equal(original.rental_fee, 500); assert.equal(original.rate_id, 'three-hour-special'); assert.equal(original.billed_minutes, 180); assert.equal(original.deposit_amount, 100);
  const pricing = structuredClone(DEFAULT_PRICING), bike = pricing.products.find(product => product.id === 'bike');
  bike.rate_options.forEach(rate => rate.amount *= 10); bike.deposit_amount = 900; bike.overtime_rate_per_hour = 999;
  await savePricing(db, actor.id, pricing, requestTime);
  const actual = new Date(original.due_at.getTime() + 1);
  const returned = await createReturnRequest(db, actor, { rentalId: response.rental.id, terminalId: 'terminal-1', penaltyAmount: 50, penaltyReason: 'Missing accessory', inspection }, actual);
  await confirm(db, returned.request, new Date(actual.getTime() + 60000));
  const saved = db.data('rentals', response.rental.id).fee_breakdown;
  assert.equal(saved.rental_fee, 500); assert.equal(saved.overtime_rate, 200); assert.equal(saved.overtime_units, 1); assert.equal(saved.overtime_fee, 200); assert.equal(saved.penalty_amount, 50); assert.equal(saved.final_rental_charges, 750); assert.equal(saved.deposit_amount, 100);
  assert.equal(saved.actual_return_at.toISOString(), actual.toISOString()); assert.deepEqual(saved.rate_components, original.rate_components);
});

test('a damaged return links one maintenance record and keeps both snapshots after repair', async () => {
  const db = fixture(), response = await released(db), actual = new Date(requestTime.getTime() + 3600000);
  const returned = await createReturnRequest(db, actor, { rentalId: response.rental.id, terminalId: 'terminal-1', penaltyAmount: 0, inspection: { condition: 'DAMAGED', result: 'UNDER_MAINTENANCE', notes: 'Rear brake cable snapped.' } }, actual);
  assert.equal(db.records('maintenance_records').length, 0); assert.equal(db.data('items', 'item-1').status, 'RENTED');
  await confirm(db, returned.request, actual);
  const rental = db.data('rentals', response.rental.id), record = db.data('maintenance_records', rental.maintenance_record_id);
  assert.equal(record.rental_id, response.rental.id); assert.equal(record.condition_record_id, rental.return_condition_record_id); assert.equal(record.inspection_notes, 'Rear brake cable snapped.');
  const duplicate = await confirm(db, returned.request, actual);
  assert.equal(duplicate.duplicate, true); assert.equal(db.records('maintenance_records').length, 1); assert.equal(db.records('item_condition_records').length, 2);
  await itemAction(db, actor.id, 'item-1', { action: 'complete-maintenance', version: localDateTime(db.data('items', 'item-1').updated_at), condition: 'GOOD', reason: 'Replaced brake cable and tested brakes.' });
  assert.equal(db.data('items', 'item-1').status, 'AVAILABLE');
  assert.deepEqual(db.data('rentals', response.rental.id).return_condition, rental.return_condition); assert.equal(rental.release_condition.condition, 'GOOD'); assert.equal(rental.return_condition.condition, 'DAMAGED');
  assert.equal(db.data('maintenance_records', rental.maintenance_record_id).status, 'COMPLETED');
});

test('inspection identity is server-owned and stale inspection or terminal revisions cannot overwrite it', async () => {
  const db = fixture(), response = await createRentalRequest(db, actor, { ...rentalInput, inspection: null }, requestTime);
  await assert.rejects(confirm(db, response.request), error => error.status === 409);
  const saved = await saveRequestInspection(db, actor, response.request.id, { ...inspection, revision: 0, inspected_by: 'spoofed-user' }, requestTime);
  assert.equal(saved.inspection.inspected_by, actor.id);
  await assert.rejects(saveRequestInspection(db, actor, response.request.id, { ...inspection, revision: 0 }), error => error.status === 409);
  await assert.rejects(confirm(db, response.request, requestTime, { inspectionRevision: 0 }), error => error.status === 409);
  await confirm(db, response.request);
  await assert.rejects(saveRequestInspection(db, actor, response.request.id, { ...inspection, revision: 1 }), error => error.status === 409);
  assert.equal(db.records('item_condition_records').length, 1);
});

test('invalid credentials, terminal, request code, and button never change rental state', async () => {
  const db = fixture(), response = await createRentalRequest(db, actor, rentalInput, requestTime);
  await assert.rejects(authenticateTerminal(db, 'terminal-1', 'wrong-key-123456789012345678901234567890'), error => error.status === 401);
  for (const overrides of [{ verificationCode: '000000' }, { button: 'WEB' }]) await assert.rejects(confirm(db, response.request, requestTime, overrides), error => [400, 409].includes(error.status));
  const terminal = await authenticateTerminal(db, 'terminal-1', deviceKey);
  await db.collection('terminals').doc('other').set({ ...terminal, id: 'other' });
  await assert.rejects(resolveTerminalRequest(db, { ...terminal, id: 'other' }, { requestId: response.request.id, verificationCode: response.request.verification_code, button: 'OK', inspectionRevision: 1 }, requestTime), error => error.status === 409);
  assert.equal(db.data('rentals', response.rental.id).status, 'PENDING_VERIFICATION'); assert.equal(db.data('items', 'item-1').status, 'AVAILABLE'); assert.equal(db.records('item_condition_records').length, 0);
});

test('expiry releases a rental reservation, preserves history, and allows another request', async () => {
  const db = fixture(), response = await createRentalRequest(db, actor, rentalInput, requestTime, 60), deadline = new Date(requestTime.getTime() + 60000);
  assert.deepEqual(await expireVerificationRequests(db, deadline), { expired: 1 }); assert.deepEqual(await expireVerificationRequests(db, deadline), { expired: 0 });
  assert.equal(db.data('items', 'item-1').reserved_rental_id, null); assert.equal(db.data('rentals', response.rental.id).status, 'EXPIRED');
  assert.equal(db.data('verification_requests', response.request.id).final_reason, 'Confirmation deadline elapsed.');
  const terminal = await authenticateTerminal(db, 'terminal-1', deviceKey);
  assert.equal((await terminalPending(db, terminal, deadline)).requests.length, 0);
  const next = await createRentalRequest(db, actor, rentalInput, deadline); assert.notEqual(next.rental.id, response.rental.id); assert.equal(db.records('verification_requests').length, 2);
});

test('a confirmation at the deadline commits expiry without releasing the item as rented', async () => {
  const db = fixture(), response = await createRentalRequest(db, actor, rentalInput, requestTime, 60);
  await assert.rejects(confirm(db, response.request, new Date(requestTime.getTime() + 60000)), error => error.status === 410);
  assert.equal(db.data('verification_requests', response.request.id).status, 'EXPIRED'); assert.equal(db.data('items', 'item-1').reserved_rental_id, null); assert.equal(db.data('rentals', response.rental.id).status, 'EXPIRED');
});

test('rejected rental releases its reservation and records the terminal and reason', async () => {
  const db = fixture(), response = await createRentalRequest(db, actor, rentalInput, requestTime);
  const result = await confirm(db, response.request, requestTime, { action: 'REJECT', reason: 'Customer ID could not be verified.' });
  assert.equal(result.status, 'REJECTED'); assert.equal(db.data('items', 'item-1').reserved_rental_id, null); assert.equal(db.data('rentals', response.rental.id).status, 'REJECTED');
  const saved = db.data('verification_requests', response.request.id); assert.equal(saved.rejection_reason, 'Customer ID could not be verified.'); assert.equal(saved.resolved_terminal_id, 'terminal-1');
  assert.equal((await confirm(db, response.request, requestTime, { action: 'REJECT', reason: 'Repeated message' })).duplicate, true);
});

test('rejected and expired returns keep equipment rented and allow a fresh return attempt', async () => {
  const db = fixture(), response = await released(db), actual = new Date(requestTime.getTime() + 5000);
  const input = { rentalId: response.rental.id, terminalId: 'terminal-1', penaltyAmount: 0, inspection };
  const first = await createReturnRequest(db, actor, input, actual, 60);
  await confirm(db, first.request, actual, { action: 'REJECT', reason: 'Wrong equipment presented.' });
  const second = await createReturnRequest(db, actor, input, actual, 60);
  await expireVerificationRequests(db, new Date(actual.getTime() + 60000));
  assert.equal(db.data('items', 'item-1').status, 'RENTED'); assert.equal(db.data('rentals', response.rental.id).status, 'ACTIVE'); assert.equal(db.data('rentals', response.rental.id).latest_return_request_status, 'EXPIRED');
  assert.equal(db.records('maintenance_records').length, 0); assert.equal(db.records('item_condition_records').length, 1);
  const third = await createReturnRequest(db, actor, input, new Date(actual.getTime() + 61000)); await confirm(db, third.request, new Date(actual.getTime() + 62000));
  assert.equal(db.records('verification_requests').length, 4); assert.equal(db.data('verification_requests', second.request.id).status, 'EXPIRED');
});

test('concurrent rentals and returns create only one open reservation or return request', async () => {
  const db = fixture();
  const rentalResults = await Promise.allSettled([createRentalRequest(db, actor, rentalInput, requestTime), createRentalRequest(db, actor, rentalInput, requestTime)]);
  assert.equal(rentalResults.filter(result => result.status === 'fulfilled').length, 1);
  const response = rentalResults.find(result => result.status === 'fulfilled').value; await confirm(db, response.request);
  const input = { rentalId: response.rental.id, terminalId: 'terminal-1', penaltyAmount: 0, inspection }, now = new Date(requestTime.getTime() + 5000);
  const returnResults = await Promise.allSettled([createReturnRequest(db, actor, input, now), createReturnRequest(db, actor, input, now)]);
  assert.equal(returnResults.filter(result => result.status === 'fulfilled').length, 1);
  const returned = returnResults.find(result => result.status === 'fulfilled').value;
  const confirmations = await Promise.all([confirm(db, returned.request, now), confirm(db, returned.request, now)]);
  assert.equal(confirmations.filter(result => !result.duplicate).length, 1); assert.equal(db.records('item_condition_records').length, 2);
});

test('missing penalty remains unknown and prevents final confirmation until explicitly recorded', async () => {
  for (const value of [undefined, null, '']) assert.equal(validatePenalty({ penaltyAmount: value }).penalty_amount, null);
  for (const value of [-1, '0', .001, NaN]) assert.throws(() => validatePenalty({ penaltyAmount: value }), error => error.status === 400);
  const db = fixture(), response = await released(db), now = new Date(requestTime.getTime() + 5000);
  const returned = await createReturnRequest(db, actor, { rentalId: response.rental.id, terminalId: 'terminal-1', inspection }, now);
  assert.equal(returned.fee_preview.penalty_amount, null); assert.equal(returned.fee_preview.final_rental_charges, null);
  await assert.rejects(confirm(db, returned.request, now), error => error.status === 409);
  await saveRequestInspection(db, actor, returned.request.id, { ...inspection, revision: 1, penaltyAmount: 0 }, now);
  await confirm(db, returned.request, now); assert.equal(db.data('rentals', response.rental.id).fee_breakdown.final_rental_charges, 500);
});

test('legacy returns do not invent overtime or historical prices from the current rate sheet', () => {
  const result = finalCharges({ rental_fee: 75, deposit_amount: 200, due_at: requestTime }, { actual_return_at: new Date(requestTime.getTime() + 3600000), penalty_amount: 0 });
  assert.equal(result.rental_fee, 75); assert.equal(result.penalty_amount, 0); assert.equal(result.overtime_fee, null); assert.equal(result.final_rental_charges, null); assert.equal(result.pricing_source, 'LEGACY_INCOMPLETE');
});

test('per-item rate snapshots save duration, daily overtime units, and the grace period', async () => {
  const db = fixture();
  await db.collection('items').doc('item-1').update({ pricing_product_id: null });
  await db.collection('settings').doc('business').update({ default_late_grace_hours: 1 });
  await db.collection('item_rates').doc('daily-rate').create({ item_id: 'item-1', rate_type: 'DAILY', rental_rate: 100.25, deposit_amount: 50, late_penalty_rate: 20, is_active: true, effective_from: new Date(requestTime.getTime() - 1000) });
  const response = await createRentalRequest(db, actor, { ...rentalInput, durationMinutes: 1500 }, requestTime);
  const fee = db.data('rentals', response.rental.id).fee_breakdown;
  assert.equal(fee.rate_id, 'daily-rate'); assert.equal(fee.rental_fee, 200.50); assert.equal(fee.billed_minutes, 2880); assert.equal(fee.overtime_unit_minutes, 1440); assert.equal(fee.grace_minutes, 60);
  const actual = new Date(fee.due_at.getTime() + 60 * 60000);
  assert.equal(finalCharges({ fee_breakdown: fee }, { actual_return_at: actual, penalty_amount: 0 }).overtime_fee, 0);
});

test('workspace exposes every attempt and nested inspection dates without leaking device credentials', async () => {
  const db = fixture(), response = await released(db), now = new Date(requestTime.getTime() + 5000);
  for (let i = 0; i < 4; i++) { const returned = await createReturnRequest(db, actor, { rentalId: response.rental.id, terminalId: 'terminal-1' }, now); await confirm(db, returned.request, now, { action: 'REJECT', reason: 'Inspection failed.' }); }
  const model = await loadWorkspace(db, 'ADMIN', now);
  assert.equal(model.verification.length, 5); assert.equal(model.transactions[0].release_condition.inspected_at, localDateTime(requestTime)); assert.equal(model.transactions[0].fee_breakdown.due_at, '2026-10-03 12:00:00.000');
  assert.equal(model.terminals[0].auth_token_hash, undefined); assert.equal(model.terminals[0].credentials_configured, true); assert.equal(publicTerminal({ auth_token_hash: 'secret', token: 'secret' }).token, undefined);
});

test('disabled terminals and revoked credentials cannot finalize an already inspected request', async () => {
  const db = fixture(), response = await createRentalRequest(db, actor, rentalInput, requestTime), terminal = await authenticateTerminal(db, 'terminal-1', deviceKey);
  await db.collection('terminals').doc('terminal-1').update({ auth_token_hash: createHash('sha256').update('new-key').digest('hex') });
  await assert.rejects(resolveTerminalRequest(db, terminal, { requestId: response.request.id, verificationCode: response.request.verification_code, inspectionRevision: 1, button: 'OK' }, requestTime), error => error.status === 401);
  assert.equal(db.data('rentals', response.rental.id).status, 'PENDING_VERIFICATION');
});

test('the expiry worker closes old requests on startup and on subsequent scheduled sweeps', async () => {
  const db = fixture(), first = await createRentalRequest(db, actor, rentalInput, requestTime, 60);
  const run = db.runTransaction.bind(db); let expected = first.request.id, completed;
  db.runTransaction = async callback => { const result = await run(callback); if (db.data('verification_requests', expected)?.status === 'EXPIRED') completed?.(); return result; };
  const initial = new Promise(resolve => { completed = resolve; });
  const errors = [];
  const stop = startExpiryWorker(db, { intervalMs: 20, onError: error => { errors.push(error); completed?.(); } });
  try {
    await initial;
    const next = await createRentalRequest(db, actor, rentalInput, requestTime, 60); expected = next.request.id;
    await new Promise(resolve => { completed = resolve; });
    assert.equal(db.data('verification_requests', next.request.id).status, 'EXPIRED'); assert.deepEqual(errors, []);
  } finally { stop(); }
});

test('whole-stay pricing freezes checkout and rejects timestamps without a timezone', async () => {
  const db = fixture(), product = DEFAULT_PRICING.products.find(row => row.rate_options.some(rate => rate.kind === 'WHOLE_STAY'));
  await db.collection('items').doc('item-1').update({ pricing_product_id: product.id });
  const input = { ...rentalInput, mode: 'WHOLE_STAY', resortCheckoutAt: '2026-10-03T15:00:00' };
  await assert.rejects(createRentalRequest(db, actor, input, requestTime), error => error.status === 400);
  const response = await createRentalRequest(db, actor, { ...input, resortCheckoutAt: '2026-10-03T15:00:00+08:00' }, requestTime);
  const fee = db.data('rentals', response.rental.id).fee_breakdown;
  assert.equal(fee.mode, 'WHOLE_STAY'); assert.equal(fee.billed_minutes, 360); assert.equal(fee.due_at.toISOString(), '2026-10-03T07:00:00.000Z');
});
