import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { firestore } from '../src/firebase.mjs';
import { authenticateTerminal, createRentalRequest, createReturnRequest, resolveTerminalRequest } from '../src/transactions.mjs';

test('Firestore commits rental/return snapshots and resists concurrent duplicate confirmations', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const prefix = 'handoff_qa_' + randomBytes(8).toString('hex'), now = new Date(), actor = 'emulator-inspector', key = randomBytes(32).toString('base64url');
  const itemRef = firestore.collection('items').doc(prefix), customerRef = firestore.collection('customers').doc(prefix), terminalRef = firestore.collection('terminals').doc(prefix), rateRef = firestore.collection('item_rates').doc(prefix);
  let rentalId;
  try {
    await Promise.all([
      itemRef.create({ name: 'Emulator equipment', item_code: prefix, status: 'AVAILABLE', is_active: true, condition_status: 'GOOD', updated_at: now }),
      customerRef.create({ full_name: 'Emulator customer', is_active: true }),
      terminalRef.create({ terminal_code: prefix, is_active: true, auth_token_hash: createHash('sha256').update(key).digest('hex') }),
      rateRef.create({ item_id: prefix, rate_type: 'HOURLY', rental_rate: 50.25, deposit_amount: 100, late_penalty_rate: 10, is_active: true, effective_from: new Date(now.getTime() - 1000) })
    ]);
    const inspection = { condition: 'GOOD', notes: 'Tested before release.', result: 'AVAILABLE' };
    const response = await createRentalRequest(firestore, actor, { itemId: prefix, customerId: prefix, terminalId: prefix, durationMinutes: 60, inspection }, now);
    rentalId = response.rental.id;
    const terminal = await authenticateTerminal(firestore, prefix, key);
    const input = request => ({ requestId: request.id, verificationCode: request.verification_code, inspectionRevision: 1, action: 'CONFIRM', button: 'OK' });
    const release = await Promise.all([resolveTerminalRequest(firestore, terminal, input(response.request), new Date(now.getTime() + 1000)), resolveTerminalRequest(firestore, terminal, input(response.request), new Date(now.getTime() + 1000))]);
    assert.equal(release.filter(result => !result.duplicate).length, 1);
    const returnTime = new Date(now.getTime() + 3600000);
    const returned = await createReturnRequest(firestore, actor, { rentalId, terminalId: prefix, penaltyAmount: 0, inspection: { condition: 'DAMAGED', result: 'UNDER_MAINTENANCE', notes: 'Cable broken.' } }, returnTime);
    const returns = await Promise.all([resolveTerminalRequest(firestore, terminal, input(returned.request), returnTime), resolveTerminalRequest(firestore, terminal, input(returned.request), returnTime)]);
    assert.equal(returns.filter(result => !result.duplicate).length, 1);
    const rental = (await firestore.collection('rentals').doc(rentalId).get()).data();
    assert.equal(rental.status, 'COMPLETED'); assert.equal(rental.fee_breakdown.final_rental_charges, 50.25); assert.equal(rental.deposit_amount, 100); assert.equal(rental.return_condition.condition, 'DAMAGED');
    assert.equal((await firestore.collection('item_condition_records').where('rental_id', '==', rentalId).get()).size, 2);
    assert.equal((await firestore.collection('maintenance_records').where('rental_id', '==', rentalId).get()).size, 1);
    assert.equal((await itemRef.get()).data().status, 'UNDER_MAINTENANCE');
  } finally {
    const batch = firestore.batch(); [itemRef, customerRef, terminalRef, rateRef].forEach(reference => batch.delete(reference));
    if (rentalId) {
      batch.delete(firestore.collection('rentals').doc(rentalId));
      for (const collection of ['verification_requests', 'item_condition_records', 'maintenance_records', 'item_status_history', 'audit_logs']) for (const doc of (await firestore.collection(collection).where('rental_id', '==', rentalId).get()).docs) batch.delete(doc.ref);
    }
    await batch.commit();
  }
});
