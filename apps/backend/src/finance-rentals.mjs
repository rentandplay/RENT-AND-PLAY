import { asDate, docData } from './firebase.mjs';
import { decoratedRecordPage } from './record-pages.mjs';
import { rentalFinanceState } from './rental-payment-state.mjs';
import { planLedgerEntry, serializeLedger } from './payment-ledger.mjs';
import { validDocumentId } from './query-validation.mjs';
import { createHash } from 'node:crypto';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

export async function financeRentalPage(db, options = {}) {
  const page = await decoratedRecordPage(db, 'rentals', options);
  page.records = await Promise.all(page.records.map(async rental => {
    const coverage = await db.collection('rental_payment_totals').doc(rental.id).get();
    return { id: rental.id, rental_code: rental.rental_code, customer_name: rental.customer_name || 'Customer', item_name: rental.item_name,
      created_at: rental.created_at, status: rental.status, payment_method: String(rental.payment_method || '').toUpperCase(),
      finance: rentalFinanceState(rental, coverage.exists ? coverage.data() : {}) };
  }));
  return serializeLedger(page);
}

// Journal money already saved on a rental. It must never increase its paid amount.
export async function confirmHistoricalReceipt(db, actor, id, input, now = new Date()) {
  if (!validDocumentId(id) || !/^[a-f0-9]{32}$/.test(input?.requestKey || '')) fail(400, 'Refresh the receipt form and try again.');
  const method = String(input.paymentMethod || '').toUpperCase();
  const reference = typeof input.reference === 'string' ? input.reference.trim() : '', notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  const occurred = typeof input.occurredAt === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(input.occurredAt) ? new Date(input.occurredAt) : null;
  if (!occurred || !Number.isFinite(occurred.getTime()) || occurred > now) fail(400, 'Enter the original receipt date and time, up to now.');
  if (!['CASH','QR'].includes(method) || method === 'QR' && !reference) fail(400, 'Choose cash or QR and supply the QR transfer reference.');
  if (!notes || notes.length > 500 || reference.length > 150) fail(400, 'Describe the evidence for this historical receipt (up to 500 characters).');
  if (input.confirmed !== true) fail(400, 'Confirm the original receipt details before saving.');
  const ledgerKey = `historical-receipt:${id}:${input.requestKey}`;
  return serializeLedger(await db.runTransaction(async tx => {
    const rentalRef = db.collection('rentals').doc(id);
    const ledgerRef = db.collection('payment_ledger').doc(createHash('sha256').update(ledgerKey).digest('hex'));
    const [rentalDoc, coverage, existing] = await Promise.all([tx.get(rentalRef),tx.get(db.collection('rental_payment_totals').doc(id)),tx.get(ledgerRef)]);
    if (!rentalDoc.exists) fail(404, 'Rental not found.');
    const rental = docData(rentalDoc);
    if (existing.exists) {
      const saved = existing.data();
      if (saved.amount !== input.amount || saved.payment_method !== method || (saved.reference || '') !== reference || saved.notes !== notes || asDate(saved.occurred_at).getTime() !== occurred.getTime()) fail(409, 'This receipt request has different details.');
      return { rental, duplicate: true };
    }
    const state = rentalFinanceState(rental,coverage.exists?coverage.data():{});
    if (!(state.unposted_paid > 0)) fail(409, 'No saved payment is waiting for a receipt. Refresh the rental.');
    if (input.amount !== state.unposted_paid) fail(409, 'The saved payment changed. Refresh and review its receipt again.');
    const created = asDate(rental.created_at || rental.startDate);
    if (created && Number.isFinite(created.getTime()) && occurred < created) fail(400, 'The receipt cannot be earlier than this rental request.');
    const commit = await planLedgerEntry(tx,db,actor,rental,{key:ledgerKey,amount:state.unposted_paid,method,reference,notes,source:'HISTORICAL_RECEIPT_CONFIRMED',occurredAt:occurred},now);
    commit();
    tx.create(db.collection('audit_logs').doc(),{actor_type:'USER',user_id:actor.id,action:'HISTORICAL_RECEIPT_CONFIRMED',entity_type:'RENTAL',entity_id:id,rental_id:id,amount:state.unposted_paid,occurred_at:occurred,created_at:now});
    tx.set(db.collection('report_jobs').doc(id),{rental_id:id,queued_at:now});
    return { rental };
  }));
}
