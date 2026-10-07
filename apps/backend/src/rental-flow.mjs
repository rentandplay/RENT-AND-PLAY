import { createHash, randomBytes } from 'node:crypto';
import { allocateCustomerCode } from './customer-codes.mjs';
import QRCode from 'qrcode';
import { asDate, docData } from './firebase.mjs';
import { frozenQuote, rentalsForItem, validateInspection, validatePenalty, finalCharges } from './transactions.mjs';
import { queueRentalNotification } from './notifications.mjs';
import { validatePaymentProof } from './payment-proof.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const details = input => { if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Rental details are required.'); return input; };
// Preserve the instant across Android devices and browsers in different time zones.
function serializeFlow(value) {
  if (value instanceof Date || value?.toDate instanceof Function) return asDate(value).toISOString();
  if (Array.isArray(value)) return value.map(serializeFlow);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeFlow(child)]));
  return value;
}
const rows = snap => snap.docs.map(docData);
const record = (db, collection, id) => db.collection(collection).doc(String(id));
const idValue = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail(400, 'A valid record ID is required.'); return value; };
const requiredText = (value, label, max = 1000) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${label} is required (maximum ${max} characters).`); return value.trim(); };
const optionalText = (value, label, max = 1000) => { if (value == null) return ''; if (typeof value !== 'string' || value.trim().length > max) fail(400, `${label} must be text (maximum ${max} characters).`); return value.trim(); };
const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 9999999999.99 && Math.abs(value * 100 - Math.round(value * 100)) < .0001;
const round = value => Math.round(value * 100) / 100;
const state = rental => String(rental.status || '').toUpperCase();
export const openRentalStatuses = ['PENDING_ADMIN_APPROVAL', 'PENDING_ESP32_RENT', 'PENDING_VERIFICATION', 'APPROVED', 'ACTIVE', 'RETURN_PENDING_INSPECTION'];
const pendingStatuses = ['PENDING_ADMIN_APPROVAL', 'PENDING_ESP32_RENT', 'APPROVED'];
const open = rental => openRentalStatuses.includes(state(rental));
const holdElapsed = (rental, now) => pendingStatuses.includes(state(rental)) && asDate(rental.hold_expires_at) && asDate(rental.hold_expires_at) <= now;
const actorId = actor => String(actor.id || actor);
const audit = (tx, db, actor, action, id, now, extra = {}) => tx.create(db.collection('audit_logs').doc(), { actor_type: 'USER', user_id: actorId(actor), action, entity_type: 'RENTAL', entity_id: id, rental_id: id, created_at: now, ...extra });
const operationKey = value => { if (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value)) fail(400, 'A valid operation key is required. Refresh the form and try again.'); return value; };
const ttl = (setting, fallback) => { const seconds = Number(process.env[setting] || fallback); if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400) fail(500, 'Rental hold duration must be between one minute and one day.'); return seconds * 1000; };

function paymentSummary(rental, extra = {}) {
  const value = { ...rental, ...extra };
  if (!Object.hasOwn(value, 'rental_paid_amount')) return { balance_due: null, refund_due: null, deposit_remaining: null, payment_status: 'UNKNOWN' };
  const paid = round(Number(value.rental_paid_amount || 0)), applied = round(Number(value.deposit_applied_amount || 0));
  const base = Number(value.rental_fee ?? value.rateFee ?? 0), final = value.fee_breakdown?.final_rental_charges;
  const closedWithoutRelease = ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(state(value));
  const charges = closedWithoutRelease ? 0 : money(final) ? final : base;
  const balance = round(Math.max(0, charges - paid - applied));
  const depositRemaining = round(Math.max(0, Number(value.deposit_collected_amount || 0) - applied - Number(value.deposit_refunded_amount || 0)));
  const rentalRefund = closedWithoutRelease ? round(Math.max(0, paid - Number(value.rental_refunded_amount || 0))) : 0;
  const refundDue = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(state(value)) ? round(depositRemaining + rentalRefund) : 0;
  return { balance_due: balance, refund_due: refundDue, deposit_remaining: depositRemaining, payment_status: refundDue > 0 ? 'REFUND_PENDING' : balance > 0 ? (paid > 0 ? 'BALANCE_DUE' : 'UNPAID') : 'PAID' };
}

function collectPayment(rental, input, requirePayment = false) {
  const base = Number(rental.rental_fee ?? rental.rateFee), deposit = Number(rental.deposit_amount ?? rental.deposit ?? 0);
  if (!money(base) || !money(deposit)) fail(409, 'Review the saved rental fee and deposit before release.');
  const paid = Number(rental.rental_paid_amount || 0), collected = Number(rental.deposit_collected_amount || 0);
  if (requirePayment && paid < base && input.paymentVerified !== true) fail(400, 'Confirm receipt of the rental payment before release.');
  if (requirePayment && deposit > collected && input.depositReceived !== true) fail(400, 'Confirm receipt of the required refundable deposit before release.');
  return { rental_paid_amount: input.paymentVerified === true ? base : paid, deposit_collected_amount: input.depositReceived === true ? deposit : collected, deposit_applied_amount: Number(rental.deposit_applied_amount || 0), deposit_refunded_amount: Number(rental.deposit_refunded_amount || 0), rental_refunded_amount: Number(rental.rental_refunded_amount || 0) };
}

function transactionScanCheck(input, rental) {
  if (input.manualReason != null && typeof input.manualReason !== 'string') fail(400, 'Enter a valid manual lookup reason.');
  const manual = Boolean(input.manualReason?.trim());
  if (manual) requiredText(input.manualReason, 'Manual lookup reason');
  const code = requiredText(input.transactionCode, 'Customer transaction QR', 256);
  if (!(code === rental.booking_qr_token || manual && [rental.id, rental.rental_code].includes(code))) fail(409, 'This QR does not match this customer rental request. Scan the rental QR shown in My Rentals.');
}

function scanCheck(input, item, rental = null) {
  if (rental) transactionScanCheck(input, rental);
  if (input.manualReason != null && typeof input.manualReason !== 'string') fail(400, 'Enter a valid manual lookup reason.');
  const manual = Boolean(input.manualReason?.trim());
  if (manual) requiredText(input.manualReason, 'Manual lookup reason');
  const inventory = requiredText(input.inventoryCode, 'Inventory QR or item code', 256);
  if (!(inventory === item.qr_token || manual && [item.id, item.item_code, item.qrCode].filter(Boolean).includes(inventory))) fail(409, `Equipment mismatch. This rental request requires ${item.name || 'the assigned equipment'} (${item.item_code || item.id}). Scan the QR sticker on that exact unit.`);
  return { verification_method: manual ? 'MANUAL' : 'QR', manual_reason: manual ? input.manualReason.trim() : null };
}

function inspectionRecord(tx, db, actor, rentalId, itemId, input, phase, now) {
  const inspection = validateInspection(input, actor, phase === 'RELEASE' ? 'RENTAL' : 'RETURN', now);
  if (input.accessoriesChecked !== true) fail(400, 'Confirm that the equipment and included accessories were checked.');
  const photos = input.photos || [];
  if (!Array.isArray(photos) || photos.length > 2) fail(400, 'Attach at most two inspection photos.');
  const photoIds = photos.map(data => {
    if (typeof data !== 'string' || data.length > 150000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) fail(400, 'Inspection photos must be JPG images smaller than 150 KB.');
    const bytes = Buffer.from(data.split(',')[1], 'base64');
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes.toString('base64') !== data.split(',')[1]) fail(400, 'Choose a valid JPG inspection photo.');
    const photo = db.collection('item_condition_photos').doc();
    tx.create(photo, { rental_id: rentalId, item_id: itemId, phase, data_url: data, created_by: actorId(actor), created_at: now });
    return photo.id;
  });
  const conditionRef = db.collection('item_condition_records').doc();
  const condition = { ...inspection, accessories_checked: true, photo_ids: photoIds, id: conditionRef.id, item_id: itemId, rental_id: rentalId, phase, confirmed_at: now, source: 'ADMIN' };
  tx.create(conditionRef, condition);
  return condition;
}

function closeHold(tx, db, rentalDoc, itemDoc, status, reason, now, actor) {
  const rental = docData(rentalDoc), changes = { status, final_reason: reason, updated_at: now, [status === 'EXPIRED' ? 'expired_at' : 'cancelled_at']: now };
  Object.assign(changes, paymentSummary(rental, changes));
  tx.update(rentalDoc.ref, changes);
  if (itemDoc?.exists && itemDoc.data().reserved_rental_id === rental.id) {
    const item = itemDoc.data();
    tx.update(itemDoc.ref, { reserved_rental_id: null, ...(item.status === 'RESERVED_PENDING' ? { status: 'AVAILABLE' } : {}), updated_at: now });
  }
  audit(tx, db, actor, `RENTAL_${status}`, rental.id, now, { reason, actor_type: status === 'EXPIRED' ? 'SYSTEM' : 'USER' });
  queueRentalNotification(tx, db, { ...rental, ...changes }, `BOOKING_${status}`, now,
    { audience: status === 'CANCELLED' ? 'STAFF' : 'CUSTOMER', reason });
  return { id: rental.id, ...rental, ...changes };
}

export async function createBooking(db, actor, input, now = new Date(), { staff = false } = {}) {
  details(input);
  const itemId = idValue(input.itemId), customerId = staff ? idValue(input.customerId) : actorId(actor);
  const key = operationKey(input.requestKey), requestSource = staff ? 'COUNTER_ADMIN' : 'MOBILE_APP';
  const rentalRef = record(db, 'rentals', `booking_${createHash('sha256').update(`${customerId}:${actorId(actor)}:${key}`).digest('hex').slice(0, 40)}`);
  const customerRef = record(db, 'customers', customerId);
  const customerBeforeBooking = await customerRef.get();
  const generatedCustomerCode = customerBeforeBooking.exists ? null : await allocateCustomerCode(db, now);
  const paymentMethod = String(input.paymentMethod || 'CASH').toUpperCase();
  if (!['QR', 'CASH'].includes(paymentMethod)) fail(400, 'Choose QR or cash as the payment method.');
  const location = requiredText(input.deliveryLocation || 'Shop pickup', 'Pickup location', 255);
  const paymentProof = !staff && paymentMethod === 'QR' ? validatePaymentProof(input.paymentProof || {}) : null;
  if (paymentProof) {
    const settings = await db.collection('settings').doc('business').get();
    if (!settings.exists || !settings.data().instapay_qr_data_url) fail(409, 'QR payment is not available yet. Choose cash or contact the owner.');
  }
  const proofRef = paymentProof ? record(db, 'rental_payment_proofs', rentalRef.id) : null;
  const result = await db.runTransaction(async tx => {
    const [existing, itemDoc, customerDoc, related] = await Promise.all([tx.get(rentalRef), tx.get(record(db, 'items', itemId)), tx.get(record(db, 'customers', customerId)), rentalsForItem(tx, db, itemId)]);
    if (existing.exists) {
      const saved = docData(existing);
      if (saved.item_id !== itemId || saved.customer_id !== customerId || saved.delivery_location !== location || saved.payment_method !== paymentMethod || saved.booking_mode !== (input.mode || 'TIMED') || saved.fee_breakdown?.requested_minutes !== Number(input.durationMinutes) && saved.booking_mode === 'TIMED' || saved.resort_checkout_input !== (input.resortCheckoutAt || null)) fail(409, 'This operation key belongs to different rental details.');
      return { rental: saved, duplicate: true };
    }
    if (!itemDoc.exists) fail(404, 'Equipment not found.');
    const item = docData(itemDoc);
    if (item.is_active === false || item.status !== 'AVAILABLE' || item.reserved_rental_id || rows(related).some(open)) fail(409, 'This equipment already has an open rental or is unavailable.');
    if (staff && !customerDoc.exists) fail(404, 'Choose an existing active customer.');
    if (customerDoc.exists && customerDoc.data().is_active === false) fail(403, 'The customer account is inactive.');
    const customer = customerDoc.exists ? customerDoc.data() : actor;
    const fee = await frozenQuote(tx, db, item, { ...input, mode: input.mode || 'TIMED' }, now);
    if (input.expectedQuote && (input.expectedQuote.rentalFee !== fee.rental_fee || input.expectedQuote.depositAmount !== fee.deposit_amount || input.expectedQuote.billedMinutes !== fee.billed_minutes)) fail(409, 'The rates changed. Refresh the quote and review the new total.');
    const rental = { rental_code: `R-${rentalRef.id.slice(-10).toUpperCase()}`, item_id: itemId, item_name: item.name, item_code: item.item_code || item.qrCode || '', customer_id: customerId, customer_name: customer.full_name || customer.name || customer.email || 'Customer', customer_email: customer.email || null, customer_phone: customer.phone || null,
      status: staff ? 'APPROVED' : 'PENDING_ADMIN_APPROVAL', booking_mode: input.mode || 'TIMED', resort_checkout_input: input.resortCheckoutAt || null, booking_qr_token: `rp-rental-${randomBytes(24).toString('hex')}`, hold_expires_at: new Date(now.getTime() + ttl(staff ? 'RENTAL_PICKUP_HOLD_SECONDS' : 'RENTAL_REQUEST_HOLD_SECONDS', staff ? 1800 : 900)),
      rental_fee: fee.rental_fee, deposit_amount: fee.deposit_amount, fee_breakdown: fee, estimated_due_at: fee.due_at, start_at: null, due_at: null, confirmed_rental_at: null, confirmed_return_at: null, received_at: null, delivery_location: location, payment_method: paymentMethod, payment_confirmed_by_admin: false, payment_proof_status: paymentProof ? 'PENDING_REVIEW' : 'NOT_REQUIRED', payment_proof_reference: paymentProof?.reference || null, payment_proof_note: null, payment_proof_revision: 0, rental_paid_amount: 0, deposit_collected_amount: 0, deposit_applied_amount: 0, deposit_refunded_amount: 0, rental_refunded_amount: 0, delivery_status: 'NOT_PREPARED', delivery_preparation: null, request_source: requestSource, release_condition: null, return_condition: null, created_at: now, updated_at: now, created_by: actorId(actor), ...(staff ? { admin_review: { action: 'APPROVED', reviewed_by: actorId(actor), reviewed_at: now } } : {}) };
    Object.assign(rental, paymentSummary(rental));
    if (!customerDoc.exists) tx.create(record(db, 'customers', customerId), { full_name: rental.customer_name, customer_code: generatedCustomerCode, email: rental.customer_email, phone: rental.customer_phone, auth_uid: customerId, is_active: true, created_at: now, updated_at: now });
    tx.create(rentalRef, rental);
    if (proofRef) tx.create(proofRef, { rental_id: rentalRef.id, customer_id: customerId, image_data_url: paymentProof.image_data_url, reference: paymentProof.reference, status: 'PENDING_REVIEW', submitted_at: now, updated_at: now });
    // Physical availability and the reservation are separate. The catalog derives Reserved from this pointer.
    tx.update(itemDoc.ref, { reserved_rental_id: rentalRef.id, updated_at: now });
    audit(tx, db, actor, 'RENTAL_BOOKED', rentalRef.id, now, { actor_type: staff ? 'USER' : 'CUSTOMER' });
    queueRentalNotification(tx, db, { id: rentalRef.id, ...rental }, staff ? 'BOOKING_APPROVED' : 'BOOKING_REQUESTED', now, { audience: staff ? 'CUSTOMER' : 'STAFF' });
    return { rental: { id: rentalRef.id, ...rental } };
  });
  return serializeFlow(result);
}

export async function reviewBooking(db, actor, id, input, now = new Date()) {
  details(input);
  const action = String(input?.action || '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(action)) fail(400, 'Choose approve or reject.');
  const result = await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(record(db, 'rentals', idValue(id)));
    if (!rentalDoc.exists) fail(404, 'Rental request not found.');
    const rental = docData(rentalDoc), itemDoc = await tx.get(record(db, 'items', rental.item_id || rental.itemId));
    if (!pendingStatuses.includes(state(rental))) fail(409, 'This rental request is already handed off or closed.');
    if (holdElapsed(rental, now)) return { rental: closeHold(tx, db, rentalDoc, itemDoc, 'EXPIRED', 'Rental request expired before handoff.', now, 'expiry-worker'), expired: true };
    if (action === 'REJECT') return { rental: closeHold(tx, db, rentalDoc, itemDoc, 'REJECTED', optionalText(input.reason, 'Rejection reason'), now, actor) };
    if (state(rental) === 'APPROVED') return { rental, duplicate: true };
    if (rental.payment_method === 'QR' && rental.request_source === 'MOBILE_APP' && rental.payment_proof_status !== 'VERIFIED') fail(409, 'Review and verify the customer’s QR payment proof before approving this rental request.');
    if (!itemDoc.exists || itemDoc.data().is_active === false || !['AVAILABLE', 'RESERVED_PENDING'].includes(itemDoc.data().status) || itemDoc.data().reserved_rental_id !== id) fail(409, 'This unit is no longer reserved for the rental request.');
    const payment = collectPayment(rental, input);
    const changes = { status: 'APPROVED', ...payment, booking_qr_token: rental.booking_qr_token || `rp-rental-${randomBytes(24).toString('hex')}`, hold_expires_at: new Date(now.getTime() + ttl('RENTAL_PICKUP_HOLD_SECONDS', 1800)), admin_review: { action: 'APPROVED', reviewed_by: actorId(actor), reviewed_by_name: actor.full_name || actor.name || actorId(actor), reviewed_at: now, notes: String(input.notes || '').trim().slice(0, 1000) }, updated_at: now };
    Object.assign(changes, paymentSummary(rental, changes));
    tx.update(rentalDoc.ref, changes); audit(tx, db, actor, 'BOOKING_APPROVED', id, now);
    queueRentalNotification(tx, db, { ...rental, ...changes }, 'BOOKING_APPROVED', now);
    return { rental: { ...rental, ...changes } };
  });
  if (result.expired) fail(409, 'This reservation expired. Ask the customer to submit a new request.');
  return serializeFlow(result);
}

export async function submitRentalPaymentProof(db, actor, id, input, now = new Date()) {
  details(input);
  const proof = validatePaymentProof(input), rentalId = idValue(id);
  const rentalRef = record(db, 'rentals', rentalId), proofRef = record(db, 'rental_payment_proofs', rentalId);
  const result = await db.runTransaction(async tx => {
    const [rentalDoc, proofDoc] = await Promise.all([tx.get(rentalRef), tx.get(proofRef)]);
    if (!rentalDoc.exists) fail(404, 'Rental request not found.');
    const rental = docData(rentalDoc);
    if (String(rental.customer_id || rental.customerId) !== actorId(actor)) fail(403, 'You can only upload proof for your own rental request.');
    if (rental.payment_method !== 'QR' || state(rental) !== 'PENDING_ADMIN_APPROVAL') fail(409, 'Payment proof can only be uploaded for a QR rental request awaiting review.');
    if (rental.payment_proof_status !== 'REJECTED') fail(409, 'Payment proof can only be replaced after the owner rejects the previous screenshot.');
    if (holdElapsed(rental, now)) fail(409, 'This rental request expired. Send a new request before uploading payment proof.');
    const proofRecord = { rental_id: rentalId, customer_id: actorId(actor), image_data_url: proof.image_data_url, reference: proof.reference, status: 'PENDING_REVIEW', submitted_at: now, updated_at: now };
    if (proofDoc.exists) tx.set(proofRef, proofRecord); else tx.create(proofRef, proofRecord);
    const revision = Number(rental.payment_proof_revision || 0) + 1;
    const changes = { payment_proof_status: 'PENDING_REVIEW', payment_proof_reference: proof.reference || null, payment_proof_note: null, payment_proof_revision: revision, updated_at: now };
    tx.update(rentalRef, changes);
    queueRentalNotification(tx, db, { ...rental, ...changes }, 'PAYMENT_PROOF_SUBMITTED', now, { audience: 'STAFF', revision });
    audit(tx, db, actor, 'RENTAL_PAYMENT_PROOF_SUBMITTED', rentalId, now, { reference: proof.reference || null });
    return { rental: { ...rental, ...changes } };
  });
  return serializeFlow(result);
}

export async function rentalPaymentProof(db, id) {
  const rentalId = idValue(id), [rentalDoc, proofDoc] = await Promise.all([
    record(db, 'rentals', rentalId).get(), record(db, 'rental_payment_proofs', rentalId).get()
  ]);
  if (!rentalDoc.exists) fail(404, 'Rental request not found.');
  if (!proofDoc.exists) fail(404, 'This customer has not uploaded payment proof.');
  const proof = proofDoc.data();
  return { proof: { rental_id: rentalId, image_data_url: proof.image_data_url, reference: proof.reference || null, status: proof.status, submitted_at: serializeFlow(proof.submitted_at), review_note: proof.review_note || null } };
}

export async function reviewRentalPaymentProof(db, actor, id, input, now = new Date()) {
  details(input);
  const action = String(input.action || '').toUpperCase();
  if (!['VERIFY', 'REJECT'].includes(action)) fail(400, 'Choose verify or reject for the payment proof.');
  const note = action === 'REJECT' ? requiredText(input.reason, 'Reason for rejecting payment proof', 1000) : optionalText(input.notes, 'Review note', 1000);
  const rentalId = idValue(id), rentalRef = record(db, 'rentals', rentalId), proofRef = record(db, 'rental_payment_proofs', rentalId);
  const result = await db.runTransaction(async tx => {
    const [rentalDoc, proofDoc] = await Promise.all([tx.get(rentalRef), tx.get(proofRef)]);
    if (!rentalDoc.exists) fail(404, 'Rental request not found.');
    if (!proofDoc.exists) fail(404, 'This customer has not uploaded payment proof.');
    const rental = docData(rentalDoc), proof = proofDoc.data();
    if (state(rental) !== 'PENDING_ADMIN_APPROVAL' || rental.payment_method !== 'QR') fail(409, 'Only an open QR rental request can be reviewed.');
    if (proof.status !== 'PENDING_REVIEW') fail(409, 'This payment proof has already been reviewed.');
    const itemDoc = await tx.get(record(db, 'items', rental.item_id || rental.itemId));
    if (holdElapsed(rental, now)) {
      const closed = closeHold(tx, db, rentalDoc, itemDoc, 'EXPIRED', 'Rental request expired before payment review.', now, 'expiry-worker');
      tx.update(proofRef, { status: 'EXPIRED', reviewed_at: now, updated_at: now });
      return { rental: closed, expired: true };
    }
    if (action === 'REJECT') {
      tx.update(proofRef, { status: 'REJECTED', review_note: note, reviewed_by: actorId(actor), reviewed_at: now, updated_at: now });
      const changes = { payment_proof_status: 'REJECTED', payment_proof_note: note, updated_at: now };
      tx.update(rentalRef, changes);
      audit(tx, db, actor, 'RENTAL_PAYMENT_PROOF_REJECTED', rentalId, now, { reason: note });
      queueRentalNotification(tx, db, { ...rental, ...changes }, 'PAYMENT_PROOF_REJECTED', now, { audience: 'CUSTOMER', reason: note, revision: Number(rental.payment_proof_revision || 0) });
      return { rental: { ...rental, ...changes } };
    }
    if (!itemDoc.exists || itemDoc.data().is_active === false || !['AVAILABLE', 'RESERVED_PENDING'].includes(itemDoc.data().status) || itemDoc.data().reserved_rental_id !== rentalId) fail(409, 'This equipment is no longer reserved for this rental request.');
    const expectedAmount = round(Number(rental.rental_fee || 0) + Number(rental.deposit_amount || 0));
    if (!money(expectedAmount)) fail(409, 'The saved rental total is invalid. Review the price before approving payment.');
    const changes = {
      status: 'APPROVED', payment_proof_status: 'VERIFIED', payment_proof_note: note || null,
      payment_confirmed_by_admin: true, rental_paid_amount: Number(rental.rental_fee || 0),
      deposit_collected_amount: Number(rental.deposit_amount || 0),
      hold_expires_at: new Date(now.getTime() + ttl('RENTAL_PICKUP_HOLD_SECONDS', 1800)),
      booking_qr_token: rental.booking_qr_token || `rp-rental-${randomBytes(24).toString('hex')}`,
      admin_review: { action: 'APPROVED', reviewed_by: actorId(actor), reviewed_by_name: actor.full_name || actor.name || actorId(actor), reviewed_at: now, notes: note || 'QR payment proof verified.' }, updated_at: now
    };
    Object.assign(changes, paymentSummary(rental, changes));
    tx.update(rentalRef, changes);
    tx.update(proofRef, { status: 'VERIFIED', review_note: note || null, reviewed_by: actorId(actor), reviewed_at: now, verified_amount: expectedAmount, updated_at: now });
    audit(tx, db, actor, 'RENTAL_PAYMENT_PROOF_VERIFIED', rentalId, now, { verified_amount: expectedAmount });
    queueRentalNotification(tx, db, { ...rental, ...changes }, 'BOOKING_APPROVED', now);
    return { rental: { ...rental, ...changes } };
  });
  if (result.expired) fail(409, 'This rental request expired before its payment proof was reviewed.');
  return serializeFlow(result);
}

export async function prepareRentalDelivery(db, actor, id, input, now = new Date()) {
  details(input);
  const code = requiredText(input.inventoryCode, 'Equipment QR', 256), manualReason = optionalText(input.manualReason, 'Manual lookup reason');
  const manual = Boolean(manualReason);
  const rentalId = idValue(id);
  return serializeFlow(await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(record(db, 'rentals', rentalId));
    if (!rentalDoc.exists) fail(404, 'Rental request not found.');
    const rental = docData(rentalDoc), itemId = rental.item_id || rental.itemId;
    const [itemDoc, related] = await Promise.all([tx.get(record(db, 'items', itemId)), rentalsForItem(tx, db, itemId)]);
    if (state(rental) !== 'APPROVED' || holdElapsed(rental, now)) fail(409, 'Only an approved rental request within its handoff hold can be prepared for delivery.');
    if (!itemDoc.exists) fail(404, 'Assigned equipment not found.');
    const item = docData(itemDoc);
    if (item.is_active === false || !['AVAILABLE', 'RESERVED_PENDING'].includes(item.status) || item.reserved_rental_id !== rentalId || rows(related).some(row => row.id !== rentalId && open(row))) fail(409, 'The assigned equipment is no longer reserved for this rental request.');
    if (manual) requiredText(manualReason, 'Manual lookup reason');
    if (!(code === item.qr_token || manual && [item.id, item.item_code, item.qrCode].filter(Boolean).includes(code))) fail(409, `Equipment mismatch. This rental requires ${item.name || 'the assigned equipment'} (${item.item_code || item.id}). Scan that unit’s printed QR at the shop.`);
    const prepared = { status: 'PREPARED', prepared_at: now, prepared_by: actorId(actor), item_id: itemId, item_code: item.item_code || item.qrCode || '', verification_method: manual ? 'MANUAL' : 'QR', manual_reason: manual ? manualReason : null };
    const changes = { delivery_status: 'PREPARED', delivery_preparation: prepared, hold_expires_at: new Date(now.getTime() + ttl('RENTAL_DELIVERY_HOLD_SECONDS', 7200)), updated_at: now };
    tx.update(rentalDoc.ref, changes);
    audit(tx, db, actor, 'RENTAL_PREPARED_FOR_DELIVERY', rentalId, now, { item_id: itemId, verification_method: prepared.verification_method });
    queueRentalNotification(tx, db, { ...rental, ...changes }, 'DELIVERY_PREPARED', now);
    return { rental: { ...rental, ...changes }, item: { id: itemId, name: item.name, item_code: item.item_code || item.qrCode || '' } };
  }));
}

// Read-only handoff preflight. Equipment is scanned and marked prepared at the
// shop; the customer scans their rental QR at the resort to start the timer.
export async function verifyReleaseCodes(db, actor, id, input, now = new Date()) {
  details(input);
  return serializeFlow(await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(record(db, 'rentals', idValue(id)));
    if (!rentalDoc.exists) fail(404, 'Rental request not found.');
    const rental = docData(rentalDoc), itemId = rental.item_id || rental.itemId;
    if (state(rental) !== 'APPROVED') fail(409, 'Only an approved rental request can be handed off.');
    if (rental.delivery_status !== 'PREPARED' || rental.delivery_preparation?.item_id !== itemId) fail(409, 'Scan and prepare the assigned equipment at the shop before delivery.');
    if (holdElapsed(rental, now)) fail(409, 'The handoff deadline expired. Ask the customer to send a new rental request.');
    transactionScanCheck(input, rental);
    const [itemDoc, related] = await Promise.all([tx.get(record(db, 'items', itemId)), rentalsForItem(tx, db, itemId)]);
    if (!itemDoc.exists) fail(404, 'Assigned equipment not found.');
    const item = docData(itemDoc);
    if (item.is_active === false || !['AVAILABLE', 'RESERVED_PENDING'].includes(item.status) || item.reserved_rental_id !== id || rows(related).some(row => row.id !== id && open(row))) fail(409, 'The assigned equipment is no longer reserved for handoff. Refresh this rental request.');
    return { booking_verified: true, inventory_verified: true, delivery_prepared: true, rental: { id: rental.id, status: rental.status, rental_code: rental.rental_code, item_id: itemId, customer_id: rental.customer_id || rental.customerId }, item: { id: item.id, name: item.name, item_code: item.item_code || item.qrCode || '' } };
  }));
}

export async function releaseBooking(db, actor, id, input, now = new Date()) {
  details(input);
  const key = operationKey(input.requestKey);
  const result = await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(record(db, 'rentals', idValue(id)));
    if (!rentalDoc.exists) fail(404, 'Rental request not found.');
    const rental = docData(rentalDoc), itemId = rental.item_id || rental.itemId;
    const [itemDoc, related] = await Promise.all([tx.get(record(db, 'items', itemId)), rentalsForItem(tx, db, itemId)]);
    if (state(rental) === 'ACTIVE' && rental.release_operation_key === key) return { rental, duplicate: true };
    if (state(rental) !== 'APPROVED') fail(409, 'Approve this rental request before confirming the handoff.');
    if (rental.delivery_status !== 'PREPARED' || rental.delivery_preparation?.item_id !== itemId) fail(409, 'Prepare the assigned equipment at the shop before the customer handoff.');
    if (holdElapsed(rental, now)) return { rental: closeHold(tx, db, rentalDoc, itemDoc, 'EXPIRED', 'Handoff deadline elapsed.', now, 'expiry-worker'), expired: true };
    if (!itemDoc.exists) fail(404, 'Assigned equipment not found.');
    const item = docData(itemDoc);
    transactionScanCheck(input, rental);
    const manualHandoff = Boolean(input.manualReason?.trim());
    const verification = { verification_method: manualHandoff ? 'MANUAL' : 'QR', manual_reason: manualHandoff ? input.manualReason.trim() : null };
    if (input.customerVerified !== true) fail(400, 'Verify that the person receiving the equipment matches the rental customer.');
    if (item.is_active === false || !['AVAILABLE', 'RESERVED_PENDING'].includes(item.status) || item.reserved_rental_id !== id || rows(related).some(row => row.id !== id && open(row))) fail(409, 'The assigned equipment is no longer available for release.');
    const payment = collectPayment(rental, input, true), fee = rental.fee_breakdown;
    if (!fee || !Number.isInteger(fee.billed_minutes) || fee.billed_minutes <= 0) fail(409, 'Review the saved duration before release.');
    const due = fee.mode === 'WHOLE_STAY' ? asDate(fee.due_at) : new Date(now.getTime() + fee.billed_minutes * 60000);
    if (!due || due <= now) fail(409, 'The selected checkout deadline has passed. Cancel this rental request and prepare a new one.');
    const condition = inspectionRecord(tx, db, actor, id, itemId, input.inspection, 'RELEASE', now);
    const changes = { status: 'ACTIVE', delivery_status: 'HANDED_OFF', delivery_handoff: { handed_off_at: now, handed_off_by: actorId(actor), verification_method: verification.verification_method, manual_reason: verification.manual_reason }, ...payment, handoff_verification: verification, release_operation_key: key, start_at: now, due_at: due, confirmed_rental_at: now, confirmed_rental_by: actorId(actor), payment_confirmed_by_admin: true, fee_breakdown: { ...fee, start_at: now, due_at: due }, release_condition: condition, release_condition_record_id: condition.id, updated_at: now };
    Object.assign(changes, paymentSummary(rental, changes));
    tx.update(rentalDoc.ref, changes); tx.update(itemDoc.ref, { status: 'RENTED', condition_status: condition.condition, reserved_rental_id: null, current_rental_id: id, updated_at: now });
    tx.create(db.collection('item_status_history').doc(), { item_id: itemId, old_status: item.status, new_status: 'RENTED', changed_at: now, changed_by: actorId(actor), source: 'ADMIN', reference_type: 'RENTAL', rental_id: id });
    audit(tx, db, actor, 'RENTAL_RELEASED', id, now, verification);
    queueRentalNotification(tx, db, { ...rental, ...changes }, 'RENTAL_RELEASED', now);
    return { rental: { ...rental, ...changes } };
  });
  if (result.expired) fail(409, 'The handoff deadline expired. Ask the customer to send a new rental request.');
  return serializeFlow(result);
}

export async function recordRentalReceipt(db, actor, id, input, now = new Date()) {
  details(input);
  const key = operationKey(input.requestKey);
  return serializeFlow(await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(record(db, 'rentals', idValue(id)));
    if (!rentalDoc.exists) fail(404, 'Rental not found.');
    const rental = docData(rentalDoc), itemId = rental.item_id || rental.itemId;
    const [itemDoc, related] = await Promise.all([tx.get(record(db, 'items', itemId)), rentalsForItem(tx, db, itemId)]);
    if (state(rental) === 'RETURN_PENDING_INSPECTION' && rental.receipt_operation_key === key) return { rental, duplicate: true };
    if (state(rental) !== 'ACTIVE' || !itemDoc.exists || itemDoc.data().status !== 'RENTED' || itemDoc.data().current_rental_id && itemDoc.data().current_rental_id !== id || rows(related).some(row => row.id !== id && ['ACTIVE', 'RETURN_PENDING_INSPECTION'].includes(state(row)))) fail(409, 'Only the active rental for this physical unit can be received.');
    const verification = scanCheck(input, docData(itemDoc));
    if (input.physicalReceiptConfirmed !== true) fail(400, 'Confirm that the equipment is physically back in your possession.');
    const changes = { status: 'RETURN_PENDING_INSPECTION', received_at: now, received_by: actorId(actor), receipt_operation_key: key, receipt_verification: verification, latest_return_request_status: 'RECEIVED', updated_at: now };
    tx.update(rentalDoc.ref, changes); tx.update(itemDoc.ref, { status: 'UNDER_INSPECTION', updated_at: now });
    tx.create(db.collection('item_status_history').doc(), { item_id: itemId, old_status: 'RENTED', new_status: 'UNDER_INSPECTION', changed_at: now, changed_by: actorId(actor), source: 'ADMIN', reference_type: 'RETURN', rental_id: id });
    audit(tx, db, actor, 'RENTAL_PHYSICALLY_RECEIVED', id, now, verification);
    queueRentalNotification(tx, db, { ...rental, ...changes }, 'RETURN_RECEIVED', now);
    return { rental: { ...rental, ...changes } };
  }));
}

export async function completeRentalReturn(db, actor, id, input, now = new Date()) {
  details(input);
  if (input.action === 'REJECT') return rejectReturnRequest(db, actor, id, input, now);
  const key = operationKey(input.requestKey);
  return serializeFlow(await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(record(db, 'rentals', idValue(id)));
    if (!rentalDoc.exists) fail(404, 'Rental not found.');
    const rental = docData(rentalDoc), itemId = rental.item_id || rental.itemId, itemDoc = await tx.get(record(db, 'items', itemId));
    if (state(rental) === 'COMPLETED' && rental.return_operation_key === key) return { rental, duplicate: true };
    if (state(rental) !== 'RETURN_PENDING_INSPECTION' || !asDate(rental.received_at) || !itemDoc.exists || itemDoc.data().status !== 'UNDER_INSPECTION' || itemDoc.data().current_rental_id && itemDoc.data().current_rental_id !== id) fail(409, 'Record physical receipt of this unit before completing the inspection.');
    const penalty = validatePenalty(input);
    if (penalty.penalty_amount === null) fail(400, 'Enter a penalty amount, including 0 when none applies.');
    const fee = { ...finalCharges({ ...rental, rental_fee: rental.rental_fee ?? rental.rateFee, deposit_amount: rental.deposit_amount ?? rental.deposit, due_at: rental.due_at ?? rental.dueDate }, { actual_return_at: asDate(rental.received_at), ...penalty }), finalized_at: now };
    if (fee.final_rental_charges === null && Object.hasOwn(rental, 'rental_paid_amount')) fail(409, 'The original rental rate is incomplete. Review its pricing snapshot.');
    const condition = inspectionRecord(tx, db, actor, id, itemId, input.inspection, 'RETURN', now);
    const maintenanceRef = condition.result === 'UNDER_MAINTENANCE' ? db.collection('maintenance_records').doc() : null;
    if (maintenanceRef) tx.create(maintenanceRef, { item_id: itemId, rental_id: id, condition_record_id: condition.id, status: 'IN_PROGRESS', reason: condition.condition, inspection_notes: condition.notes, started_at: now, completed_at: null, created_by: actorId(actor) });
    const changes = { status: 'COMPLETED', return_operation_key: key, confirmed_return_at: now, confirmed_return_by: actorId(actor), returned_at: rental.received_at, returnedDate: rental.received_at, return_condition: condition, return_condition_record_id: condition.id, maintenance_record_id: maintenanceRef?.id || null, fee_breakdown: fee, latest_return_request_status: 'CONFIRMED', mobile_return_request: { ...rental.mobile_return_request, status: 'APPROVED', reviewed_at: now, reviewed_by: actorId(actor) }, updated_at: now };
    Object.assign(changes, paymentSummary(rental, changes));
    tx.update(rentalDoc.ref, changes); tx.update(itemDoc.ref, { status: condition.result, condition_status: condition.condition, reserved_rental_id: null, current_rental_id: null, updated_at: now });
    tx.create(db.collection('item_status_history').doc(), { item_id: itemId, old_status: 'UNDER_INSPECTION', new_status: condition.result, changed_at: now, changed_by: actorId(actor), source: 'ADMIN', reference_type: 'RETURN', rental_id: id });
    audit(tx, db, actor, 'RENTAL_RETURN_COMPLETED', id, now);
    queueRentalNotification(tx, db, { ...rental, ...changes }, 'RETURN_COMPLETED', now);
    return { rental: { ...rental, ...changes } };
  }));
}

async function rejectReturnRequest(db, actor, id, input, now) {
  return serializeFlow(await db.runTransaction(async tx => {
    const doc = await tx.get(record(db, 'rentals', idValue(id)));
    if (!doc.exists) fail(404, 'Rental not found.');
    const rental = docData(doc);
    if (state(rental) !== 'ACTIVE' || rental.latest_return_request_status !== 'PENDING_ADMIN_APPROVAL') fail(409, 'There is no pending customer return request to reject.');
    const reason = requiredText(input.reason, 'Rejection reason');
    const changes = { latest_return_request_status: 'REJECTED', mobile_return_request: { ...rental.mobile_return_request, status: 'REJECTED', reason, reviewed_at: now, reviewed_by: actorId(actor) }, updated_at: now };
    tx.update(doc.ref, changes); audit(tx, db, actor, 'RETURN_REQUEST_REJECTED', id, now, { reason });
    queueRentalNotification(tx, db, { ...rental, ...changes }, 'RETURN_REQUEST_REJECTED', now, { reason, revision: rental.return_request_revision || 0 });
    return { rental: { ...rental, ...changes } };
  }));
}

export async function cancelBooking(db, actor, id, now = new Date()) {
  return serializeFlow(await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(record(db, 'rentals', idValue(id)));
    if (!rentalDoc.exists) fail(404, 'Rental request not found.');
    const rental = docData(rentalDoc);
    if (String(rental.customer_id || rental.customerId) !== actorId(actor)) fail(403, 'You can only cancel your own rental request.');
    if (state(rental) === 'CANCELLED') return { rental, duplicate: true };
    if (!pendingStatuses.includes(state(rental))) fail(409, 'Only a rental request waiting for approval or handoff can be cancelled.');
    const itemDoc = await tx.get(record(db, 'items', rental.item_id || rental.itemId));
    return { rental: closeHold(tx, db, rentalDoc, itemDoc, 'CANCELLED', 'Cancelled by customer before release.', now, actor) };
  }));
}

export async function expireRentalHolds(db, now = new Date()) {
  const snapshots = await Promise.all(pendingStatuses.map(status => db.collection('rentals').where('status', '==', status).get()));
  let expired = 0;
  for (const candidate of snapshots.flatMap(snap => snap.docs).filter(doc => holdElapsed(doc.data(), now))) {
    const changed = await db.runTransaction(async tx => {
      const rentalDoc = await tx.get(candidate.ref);
      if (!rentalDoc.exists || !holdElapsed(rentalDoc.data(), now)) return false;
      const rental = docData(rentalDoc), itemDoc = await tx.get(record(db, 'items', rental.item_id || rental.itemId));
      closeHold(tx, db, rentalDoc, itemDoc, 'EXPIRED', 'Rental request expired before handoff.', now, 'expiry-worker');
      return true;
    });
    if (changed) expired++;
  }
  return { expired };
}

export async function rentalTicket(db, actor, id) {
  const doc = await record(db, 'rentals', idValue(id)).get();
  if (!doc.exists) fail(404, 'Rental request not found.');
  const rental = docData(doc);
  if (String(rental.customer_id || rental.customerId) !== actorId(actor)) fail(403, 'You can only view your own rental handoff QR.');
  if (!rental.booking_qr_token) fail(409, 'This older rental does not have a handoff QR. Ask the operator to find it by rental code.');
  return { ticket: { rental_id: id, rental_code: rental.rental_code, status: state(rental), value: rental.booking_qr_token, image_data_url: await QRCode.toDataURL(rental.booking_qr_token, { errorCorrectionLevel: 'M', margin: 4, width: 360 }), hold_expires_at: serializeFlow(rental.hold_expires_at || null) } };
}

export async function lookupRental(db, input) {
  details(input);
  const code = requiredText(input.code, 'QR or lookup code', 256), kind = input.kind || 'BOOKING';
  let rental;
  if (kind === 'BOOKING') {
    const fields = ['booking_qr_token', 'rental_code'];
    const matches = (await Promise.all(fields.map(field => db.collection('rentals').where(field, '==', code).get()))).flatMap(snap => rows(snap));
    if (/^[A-Za-z0-9_-]{1,128}$/.test(code)) { const doc = await record(db, 'rentals', code).get(); if (doc.exists) matches.push(docData(doc)); }
    const unique = [...new Map(matches.map(row => [row.id, row])).values()];
    if (unique.length !== 1) fail(404, 'No unique rental request matches that QR or rental code.');
    rental = unique[0];
  } else if (kind === 'INVENTORY') {
    const item = await lookupInventory(db, code);
    const matches = rows(await rentalsForItem({ get: query => query.get() }, db, item.id)).filter(row => ['ACTIVE', 'RETURN_PENDING_INSPECTION'].includes(state(row)));
    if (matches.length !== 1) fail(409, 'This unit has no unique active rental to receive.');
    rental = matches[0];
  } else fail(400, 'Choose a transaction or inventory lookup.');
  const [itemDoc, customerDoc] = await Promise.all([record(db, 'items', rental.item_id || rental.itemId).get(), record(db, 'customers', rental.customer_id || rental.customerId).get()]);
  const item = itemDoc.exists ? docData(itemDoc) : null, customer = customerDoc.exists ? customerDoc.data() : null;
  return serializeFlow({ rental: { ...rental, item_id: rental.item_id || rental.itemId, item_name: item?.name || rental.item_name || rental.itemName, item_code: item?.item_code || '', customer_name: customer?.full_name || rental.customer_name || rental.customerName }, item: item ? { id: item.id, name: item.name, item_code: item.item_code, status: item.status } : null });
}

async function lookupInventory(db, code) {
  const matches = (await Promise.all(['qr_token', 'item_code', 'qrCode'].map(field => db.collection('items').where(field, '==', code).get()))).flatMap(snap => rows(snap));
  if (/^[A-Za-z0-9_-]{1,128}$/.test(code)) { const doc = await record(db, 'items', code).get(); if (doc.exists) matches.push(docData(doc)); }
  const unique = [...new Map(matches.map(row => [row.id, row])).values()];
  if (unique.length !== 1) fail(404, 'No unique inventory unit matches that QR or item code.');
  return unique[0];
}

export async function changeAssignedUnit(db, actor, id, input, now = new Date()) {
  details(input);
  const reason = requiredText(input.reason, 'Unit change reason'), target = await lookupInventory(db, requiredText(input.inventoryCode, 'Replacement inventory QR', 256));
  return serializeFlow(await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(record(db, 'rentals', idValue(id)));
    if (!rentalDoc.exists) fail(404, 'Rental request not found.');
    const rental = docData(rentalDoc), oldId = rental.item_id || rental.itemId;
    const [oldDoc, newDoc, related] = await Promise.all([tx.get(record(db, 'items', oldId)), tx.get(record(db, 'items', target.id)), rentalsForItem(tx, db, target.id)]);
    if (state(rental) !== 'APPROVED' || holdElapsed(rental, now)) fail(409, 'Only an approved rental request within its handoff hold can change units.');
    if (oldId === target.id) return { rental, duplicate: true };
    if (!oldDoc.exists || oldDoc.data().reserved_rental_id !== id || !newDoc.exists) fail(409, 'Refresh the assigned equipment before changing units.');
    const before = oldDoc.data(), after = newDoc.data();
    const sameProduct = before.pricing_product_id ? after.pricing_product_id === before.pricing_product_id : after.name === before.name && after.category_id === before.category_id;
    if (!sameProduct || after.is_active === false || after.status !== 'AVAILABLE' || after.reserved_rental_id || rows(related).some(open)) fail(409, 'Choose an available unit of the same equipment product.');
    const quote = await frozenQuote(tx, db, docData(newDoc), { durationMinutes: rental.fee_breakdown?.requested_minutes, mode: rental.booking_mode || 'TIMED', ...(rental.resort_checkout_input ? { resortCheckoutAt: rental.resort_checkout_input } : {}) }, now);
    if (quote.rental_fee !== rental.rental_fee || quote.deposit_amount !== rental.deposit_amount || quote.overtime_rate !== rental.fee_breakdown?.overtime_rate) fail(409, 'This unit has different pricing. Cancel and prepare a new rental request so the customer can review the price.');
    const changes = { item_id: target.id, item_name: after.name, item_code: after.item_code || after.qrCode || '', delivery_status: 'NOT_PREPARED', delivery_preparation: null, updated_at: now };
    tx.update(oldDoc.ref, { reserved_rental_id: null, ...(before.status === 'RESERVED_PENDING' ? { status: 'AVAILABLE' } : {}), updated_at: now });
    tx.update(newDoc.ref, { reserved_rental_id: id, updated_at: now }); tx.update(rentalDoc.ref, changes);
    audit(tx, db, actor, 'BOOKING_UNIT_CHANGED', id, now, { reason, previous_item_id: oldId, item_id: target.id });
    return { rental: { ...rental, ...changes } };
  }));
}

export async function settleRentalPayment(db, actor, id, input, now = new Date()) {
  details(input);
  const key = operationKey(input.requestKey), received = input.paymentAmount ?? 0, depositApplied = input.depositAppliedAmount ?? 0, refunded = input.depositRefundAmount ?? 0, rentalRefund = input.rentalRefundAmount ?? 0;
  if (![received, depositApplied, refunded, rentalRefund].every(money) || received + depositApplied + refunded + rentalRefund === 0) fail(400, 'Enter a valid payment, deposit deduction, or refund amount.');
  const note = requiredText(input.notes, 'Settlement notes');
  return serializeFlow(await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(record(db, 'rentals', idValue(id))), settlementRef = record(db, 'rental_settlements', `${id}_${key}`), existing = await tx.get(settlementRef);
    if (!rentalDoc.exists) fail(404, 'Rental not found.');
    const rental = docData(rentalDoc);
    if (existing.exists) {
      const saved = existing.data();
      if (saved.payment_amount !== received || saved.deposit_applied_amount !== depositApplied || saved.deposit_refund_amount !== refunded || saved.rental_refund_amount !== rentalRefund || saved.notes !== note) fail(409, 'This settlement key belongs to different amounts.');
      return { rental, duplicate: true };
    }
    if (!['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(state(rental))) fail(409, 'Complete the physical return or close the rental request before settling its final balance.');
    if (!Object.hasOwn(rental, 'rental_paid_amount')) fail(409, 'Legacy payment receipts were not recorded. Review them before using settlement.');
    const current = paymentSummary(rental), closed = state(rental) !== 'COMPLETED';
    if (received + depositApplied > current.balance_due || depositApplied + refunded > current.deposit_remaining || rentalRefund > Number(rental.rental_paid_amount || 0) - Number(rental.rental_refunded_amount || 0) || !closed && rentalRefund > 0 || closed && received + depositApplied > 0) fail(400, 'The entered amounts exceed the outstanding balance or refundable payments.');
    const changes = { rental_paid_amount: round(Number(rental.rental_paid_amount || 0) + received), deposit_applied_amount: round(Number(rental.deposit_applied_amount || 0) + depositApplied), deposit_refunded_amount: round(Number(rental.deposit_refunded_amount || 0) + refunded), rental_refunded_amount: round(Number(rental.rental_refunded_amount || 0) + rentalRefund), updated_at: now };
    Object.assign(changes, paymentSummary(rental, changes)); tx.update(rentalDoc.ref, changes);
    tx.create(settlementRef, { rental_id: id, payment_amount: received, deposit_applied_amount: depositApplied, deposit_refund_amount: refunded, rental_refund_amount: rentalRefund, notes: note, recorded_by: actorId(actor), recorded_at: now });
    audit(tx, db, actor, 'RENTAL_PAYMENT_SETTLED', id, now, { payment_amount: received, deposit_applied_amount: depositApplied, deposit_refund_amount: refunded, rental_refund_amount: rentalRefund });
    return { rental: { ...rental, ...changes } };
  }));
}

export async function inspectionPhoto(db, id) {
  const doc = await record(db, 'item_condition_photos', idValue(id)).get();
  if (!doc.exists) fail(404, 'Inspection photo not found.');
  return { photo: { id: doc.id, data_url: doc.data().data_url } };
}
