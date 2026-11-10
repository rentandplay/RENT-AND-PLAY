import { MOBILE_RENTAL_TERMS_VERSION, verifyTransactionQrCode } from './rental-flow.mjs';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { allocateRecordCodes } from './record-codes.mjs';
import { healthyUnit, unitHasMaintenance } from './maintenance-state.mjs';
import { returnMaintenanceRecord } from './maintenance.mjs';
import { asDate, docData, localDateTime } from './firebase.mjs';
import { DEFAULT_PRICING, equipmentRateOptions, quoteRental, validatePricing } from './pricing.mjs';
import { firebaseFailure, isQuotaError } from './firebase-errors.mjs';
import { isMobileRental } from './mobile.mjs';
import { queueRentalNotification } from './notifications.mjs';
import { scheduledStart, calendarConflict } from './rental-calendar.mjs';
import { planLedgerEntry } from './payment-ledger.mjs';
import { rentalPaymentSummary } from './rental-payment-state.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const rows = snapshot => snapshot.docs.map(docData);
const ref = (db, name, id) => db.collection(name).doc(String(id));
const idValue = value => {
  const id = String(value ?? '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) fail(400, 'A valid record ID is required.');
  return id;
};
const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${label} is required (maximum ${max} characters).`);
  return value.trim();
};
const optionalText = (value, max, label) => {
  if (value == null || typeof value === 'string' && !value.trim()) return '';
  if (typeof value !== 'string' || value.trim().length > max) fail(400, `${label} must be text (maximum ${max} characters).`);
  return value.trim();
};
const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 9999999999.99 && Math.abs(value * 100 - Math.round(value * 100)) < .0001;
const round = value => Math.round(value * 100) / 100;
const dateValue = (value, label) => {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(value)) fail(400, `${label} must include a timezone.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail(400, `Enter a valid ${label.toLowerCase()}.`);
  return date;
};
const isOpen = rental => ['ACTIVE', 'APPROVED', 'RETURN_PENDING_INSPECTION', 'PENDING_VERIFICATION', 'PENDING_ADMIN_APPROVAL', 'PENDING_ESP32_RENT'].includes(String(rental.status || '').toUpperCase());
export async function rentalsForItem(tx, db, itemId) {
  const statuses=['ACTIVE','APPROVED','RETURN_PENDING_INSPECTION','PENDING_VERIFICATION','PENDING_ADMIN_APPROVAL','PENDING_ESP32_RENT'];
  const snapshots = await Promise.all(['item_id', 'itemId'].map(field => tx.get(db.collection('rentals').where(field, '==', itemId).where('status','in',[...statuses,...statuses.map(status=>status.toLowerCase())]))));
  return { docs: [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(doc => [doc.id, doc])).values()] };
}
const requestType = request => String(request.transaction_type || request.type || '').toUpperCase();
const expired = (request, now) => { const deadline = asDate(request.expires_at); return deadline && Number.isFinite(deadline.getTime()) && deadline <= now; };

export function serializeTransaction(value) {
  if (value instanceof Date || typeof value?.toDate === 'function') return localDateTime(value);
  if (Array.isArray(value)) return value.map(serializeTransaction);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/deposit/i.test(key)).map(([key, entry]) => [key, serializeTransaction(entry)]));
  return value;
}

export function publicTerminal(terminal) {
  const { auth_token_hash, api_key, token, secret, ...record } = terminal;
  return { ...record, credentials_configured: /^[a-f0-9]{64}$/.test(auth_token_hash || '') };
}

export async function authenticateTerminal(db, terminalId, key) {
  if (typeof key !== 'string' || key.length < 32 || key.length > 256) fail(401, 'A terminal device credential is required.');
  const snapshot = await ref(db, 'terminals', idValue(terminalId)).get();
  const terminal = snapshot.exists ? docData(snapshot) : null;
  const expected = terminal?.auth_token_hash;
  const digest = createHash('sha256').update(key).digest();
  if (!terminal || terminal.is_active === false || !/^[a-f0-9]{64}$/.test(expected || '') || !timingSafeEqual(digest, Buffer.from(expected, 'hex'))) fail(401, 'Invalid or inactive terminal credential.');
  return terminal;
}

export function validateInspection(input, actor, type, now = new Date()) {
  if (!input || !['RENTAL', 'RETURN'].includes(type)) fail(400, 'Inspection details are required.');
  const condition = String(input.condition || '').toUpperCase();
  if (!['GOOD', 'FAIR', 'DAMAGED', 'NEEDS_INSPECTION'].includes(condition)) fail(400, 'Choose a valid equipment condition.');
  if (type === 'RENTAL' && !['GOOD', 'FAIR'].includes(condition)) fail(400, 'Release inspection must confirm good or fair condition.');
  const result = input.result || (['GOOD', 'FAIR'].includes(condition) ? 'AVAILABLE' : 'UNDER_MAINTENANCE');
  if (!['AVAILABLE', 'UNDER_MAINTENANCE'].includes(result) || (type === 'RENTAL' && result !== 'AVAILABLE') || (['DAMAGED', 'NEEDS_INSPECTION'].includes(condition) && result !== 'UNDER_MAINTENANCE')) fail(400, 'Damaged equipment must return to Under Maintenance.');
  const notesRequired = type === 'RETURN' && ['DAMAGED', 'NEEDS_INSPECTION'].includes(condition);
  return { condition, notes: notesRequired ? text(input.notes, 2000, 'Inspection notes') : optionalText(input.notes, 2000, 'Inspection notes'), inspected_by: String(actor.id || actor), inspected_by_name: String(actor.full_name || actor.name || actor.id || actor), inspected_at: now, result };
}

export function validatePenalty(input) {
  if (input.penaltyAmount === undefined || input.penaltyAmount === null || input.penaltyAmount === '') return { penalty_amount: null, penalty_reason: null };
  if (!amount(input.penaltyAmount)) fail(400, 'Penalty must be a nonnegative amount with at most two decimal places.');
  return { penalty_amount: input.penaltyAmount, penalty_reason: input.penaltyAmount > 0 ? text(input.penaltyReason, 1000, 'Penalty reason') : null };
}

export function finalCharges(rental, request) {
  const saved = rental.fee_breakdown || {};
  const actual = asDate(request.actual_return_at), due = asDate(saved.due_at || rental.due_at);
  const known = amount(saved.rental_fee) && amount(saved.overtime_rate) && Number.isFinite(saved.overtime_unit_minutes) && saved.overtime_unit_minutes > 0 && Number.isFinite(saved.grace_minutes) && actual && due && Number.isFinite(actual.getTime()) && Number.isFinite(due.getTime());
  const lateMinutes = known ? Math.max(0, Math.ceil((actual - due) / 60000) - saved.grace_minutes) : null;
  const units = known ? Math.ceil(lateMinutes / saved.overtime_unit_minutes) : null;
  const overtime = known ? round(units * saved.overtime_rate) : null;
  const penalty = request.penalty_amount ?? null;
  const total = known && amount(penalty) ? round(saved.rental_fee + overtime + penalty) : null;
  return { ...saved, snapshot_version: saved.snapshot_version || null, pricing_source: saved.pricing_source || 'LEGACY_INCOMPLETE', rental_fee: amount(saved.rental_fee) ? saved.rental_fee : amount(rental.rental_fee) ? rental.rental_fee : null, due_at: saved.due_at || rental.due_at || null, actual_return_at: request.actual_return_at, overtime_units: units, overtime_fee: overtime, penalty_amount: penalty, penalty_reason: request.penalty_reason || null, final_rental_charges: total, finalized_at: null };
}

export async function frozenQuote(tx, db, item, input, now, allowFutureStart = false) {
  const [pricingDoc, businessDoc, rateDocs] = await Promise.all([tx.get(ref(db, 'settings', 'pricing')), tx.get(ref(db, 'settings', 'business')), tx.get(db.collection('item_rates').where('item_id', '==', item.id))]);
  const grace = Number(businessDoc.exists ? businessDoc.data().default_late_grace_hours ?? 0 : 0);
  if (!Number.isFinite(grace) || grace < 0 || grace > 168) fail(400, 'Correct the business grace period before requesting a rental.');
  const start = input.startAt ? dateValue(input.startAt, 'Rental start time') : now;
  const activeRate = rows(rateDocs).filter(row => row.is_active !== false && asDate(row.effective_from) <= now && (!row.effective_to || asDate(row.effective_to) > now)).sort((a, b) => asDate(b.effective_from) - asDate(a.effective_from))[0];
  let saved;
  if (Array.isArray(item.custom_rate_options) && item.custom_rate_options.length) {
    if (!activeRate || !amount(activeRate.late_penalty_rate)) fail(400, 'Configure a valid late penalty for this equipment.');
    const pricing = pricingDoc.exists ? validatePricing(pricingDoc.data()) : structuredClone(DEFAULT_PRICING);
    const customProductId = `custom-${item.id}`;
    const customOptions = Array.isArray(activeRate.custom_rate_options) ? activeRate.custom_rate_options : item.custom_rate_options;
    const rateOptions = Number(activeRate.custom_rate_options_version ?? item.custom_rate_options_version) >= 2 ? equipmentRateOptions(activeRate.rate_type, activeRate.rental_rate, customOptions) : customOptions;
    pricing.products.push({ id: customProductId, name: item.name, group: 'Custom equipment', rate_options: rateOptions, overtime_rate_per_hour: activeRate.late_penalty_rate, included_items: [], sale_price: null });
    const checkout = input.mode === 'WHOLE_STAY' ? dateValue(input.resortCheckoutAt, 'Resort checkout time').toISOString() : undefined;
    const q = quoteRental(pricing, { ...input, ...(checkout ? { resortCheckoutAt: checkout } : {}), productId: customProductId, startAt: start.toISOString(), actualReturnAt: null }, now);
    saved = { pricing_source: 'ITEM_CUSTOM_RATES', product_id: null, product_name: item.name, rate_id: q.rate_id, rate_label: q.rate_label, rate_kind: q.rate_kind, rate_components: q.rate_components, mode: input.mode === 'WHOLE_STAY' ? 'WHOLE_STAY' : 'TIMED', requested_minutes: q.requested_minutes, billed_minutes: q.billed_minutes, rental_fee: q.rental_fee, start_at: start, due_at: new Date(q.due_at), overtime_rate: q.overtime_rate_per_hour, overtime_unit_minutes: 60, lost_piece_fee: q.lost_piece_fee, overtime_basis: q.overtime_basis, after_hours_return_note: q.after_hours_return_note };
  } else if (item.pricing_product_id) {
    const pricing = pricingDoc.exists ? validatePricing(pricingDoc.data()) : structuredClone(DEFAULT_PRICING);
    const checkout = input.mode === 'WHOLE_STAY' ? dateValue(input.resortCheckoutAt, 'Resort checkout time').toISOString() : undefined;
    const q = quoteRental(pricing, { ...input, ...(checkout ? { resortCheckoutAt: checkout } : {}), productId: item.pricing_product_id, startAt: start.toISOString(), actualReturnAt: null }, now);
    saved = { pricing_source: 'RATE_SHEET', product_id: q.product_id, product_name: q.product_name, rate_id: q.rate_id, rate_label: q.rate_label, rate_kind: q.rate_kind, rate_components: q.rate_components, mode: input.mode === 'WHOLE_STAY' ? 'WHOLE_STAY' : 'TIMED', requested_minutes: q.requested_minutes, billed_minutes: q.billed_minutes, rental_fee: q.rental_fee, start_at: start, due_at: new Date(q.due_at), overtime_rate: q.overtime_rate_per_hour, overtime_unit_minutes: 60, lost_piece_fee: q.lost_piece_fee, overtime_basis: q.overtime_basis, after_hours_return_note: q.after_hours_return_note };
  } else {
    const rate = activeRate;
    if (!rate || !['HOURLY', 'DAILY', 'FLAT'].includes(rate.rate_type) || ![rate.rental_rate, rate.late_penalty_rate].every(amount)) fail(400, 'Configure a valid equipment rate or link a rate sheet product.');
    const minutes = Number(input.durationMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080 || input.mode === 'WHOLE_STAY') fail(400, 'Choose a timed rental duration between 1 minute and 7 days.');
    const unitMinutes = rate.rate_type === 'DAILY' ? 1440 : rate.rate_type === 'HOURLY' ? 60 : minutes;
    const units = Math.ceil(minutes / unitMinutes), billed = units * unitMinutes;
    saved = { pricing_source: 'ITEM_RATE', product_id: null, product_name: item.name, rate_id: rate.id, rate_label: `${rate.rate_type} equipment rate`, rate_kind: rate.rate_type, rate_components: [{ rate_id: rate.id, label: rate.rate_type, kind: rate.rate_type, units, unit_amount: rate.rental_rate, duration_minutes: unitMinutes, total_amount: round(units * rate.rental_rate) }], mode: 'TIMED', requested_minutes: minutes, billed_minutes: billed, rental_fee: round(units * rate.rental_rate), start_at: start, due_at: new Date(start.getTime() + billed * 60000), overtime_rate: rate.late_penalty_rate, overtime_unit_minutes: rate.rate_type === 'DAILY' ? 1440 : 60, lost_piece_fee: null };
  }
  if (saved.due_at <= now || !allowFutureStart && (start > new Date(now.getTime() + 5 * 60000) || start < new Date(now.getTime() - 5 * 60000))) fail(400, 'Rental starts must be within five minutes of now and due after now.');
  return { ...saved, snapshot_version: 1, currency: 'PHP', saved_at: now, grace_minutes: grace * 60, actual_return_at: null, overtime_units: null, overtime_fee: null, penalty_amount: null, penalty_reason: null, final_rental_charges: null, finalized_at: null };
}

function requestRecord(rentalId, itemId, terminal, type, now, ttlSeconds) {
  const ttl = Number(ttlSeconds);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 1800) fail(500, 'Verification deadline must be between 60 and 1800 seconds.');
  return { rental_id: rentalId, item_id: itemId, terminal_id: terminal.id, terminal_code: terminal.terminal_code || terminal.id, transaction_type: type, verification_code: String(randomInt(100000, 1000000)), status: 'PENDING', requested_at: now, expires_at: new Date(now.getTime() + ttl * 1000), confirmed_at: null, rejected_at: null, expired_at: null, rejection_reason: null, final_reason: null, confirmed_terminal_id: null, confirmed_terminal_code: null, inspection: null, inspection_revision: 0 };
}
const actorId = actor => String(actor.id || actor);
const audit = (tx, db, actor, action, id, now, extra = {}) => tx.create(db.collection('audit_logs').doc(), { actor_type: extra.actor_type || 'USER', user_id: actor, action, entity_type: 'VERIFICATION_REQUEST', entity_id: id, created_at: now, ...extra });

export async function quoteEquipmentRental(db, input, now = new Date()) {
  if (!input || typeof input !== 'object') fail(400, 'Rental details are required.');
  const start = scheduledStart(input, now);
  const itemId = idValue(input.itemId);
  const stockGroupId = input.stockGroupId == null || input.stockGroupId === '' ? null : idValue(input.stockGroupId);
  const fee = await db.runTransaction(async tx => {
    let docs=[];
    if(stockGroupId){
      const group=await tx.get(db.collection('items').where('stock_group_id','==',stockGroupId));
      docs=group.docs;
      if(!docs.length){const legacy=await tx.get(ref(db,'items',itemId));if(legacy.exists)docs=[legacy];}
      docs=docs.filter(doc=>String(doc.data().stock_group_id||doc.id)===stockGroupId);
    }else{
      const exact=await tx.get(ref(db,'items',itemId));if(exact.exists)docs=[exact];
    }
    if(!docs.length)fail(404,'Equipment not found.');
    docs.sort((a,b)=>(a.id===itemId?-1:b.id===itemId?1:a.id.localeCompare(b.id)));
    for(const itemDoc of docs){
      const item=docData(itemDoc);
      if(item.is_active===false||!healthyUnit(item)|| (start ? !['AVAILABLE','RESERVED_PENDING','RENTED'].includes(item.status) : String(item.status).toUpperCase()!=='AVAILABLE'||item.reserved_rental_id||item.current_rental_id))continue;
      if(await unitHasMaintenance(tx,db,itemDoc.id))continue;
      const openDocs=await rentalsForItem(tx,db,itemDoc.id);
      const quote = await frozenQuote(tx,db,item,{...input,startAt:(start||now).toISOString()},now,Boolean(start));
      if(calendarConflict(rows(openDocs),start||now,asDate(quote.due_at),now))continue;
      return quote;
    }
    fail(409,'This equipment is currently unavailable. Refresh the catalog to see the latest stock.');
  });
  return serializeTransaction({ quote: { ...fee, total_to_collect: fee.rental_fee, overtime_rate_per_hour: fee.overtime_rate, warnings: [] } });
}

export async function createRentalRequest(db, actor, input, now = new Date(), ttlSeconds = 600) {
  if (!input || typeof input !== 'object') fail(400, 'Rental details are required.');
  const itemId = idValue(input.itemId), customerId = idValue(input.customerId), terminalId = idValue(input.terminalId);
  const rentalRef = db.collection('rentals').doc(), requestRef = db.collection('verification_requests').doc();
  const result = await db.runTransaction(async tx => {
    const [itemDoc, customerDoc, terminalDoc, openDocs] = await Promise.all([tx.get(ref(db, 'items', itemId)), tx.get(ref(db, 'customers', customerId)), tx.get(ref(db, 'terminals', terminalId)), rentalsForItem(tx, db, itemId)]);
    if (!itemDoc.exists || !customerDoc.exists || !terminalDoc.exists) fail(404, 'Equipment, customer, or terminal not found.');
    const item = docData(itemDoc), terminal = docData(terminalDoc);
    if (!healthyUnit(item) || await unitHasMaintenance(tx, db, itemId)) fail(409, 'This unit is under maintenance or needs inspection. Choose another available unit.');
    if (item.is_active === false || String(item.status).toUpperCase() !== 'AVAILABLE' || item.reserved_rental_id || rows(openDocs).some(isOpen)) fail(409, 'This equipment already has an open rental or is unavailable.');
    if (customerDoc.data().is_active === false || terminal.is_active === false) fail(409, 'Select an active customer and terminal.');
    if (!/^[a-f0-9]{64}$/.test(terminal.auth_token_hash || '')) fail(409, 'Configure the terminal device credential before requesting a handoff.');
    const fee = await frozenQuote(tx, db, item, input, now);
    const inspection = input.inspection ? validateInspection(input.inspection, actor, 'RENTAL', now) : null;
    const [rentalCode, requestCode] = await allocateRecordCodes(tx, db, ['rentals', 'verification_requests'], now);
    const request = { ...requestRecord(rentalRef.id, itemId, terminal, 'RENTAL', now, ttlSeconds), request_code: requestCode, requested_by: actorId(actor), inspection, inspection_revision: inspection ? 1 : 0 };
    const rental = { rental_code: rentalCode, item_id: itemId, customer_id: customerId, status: 'PENDING_VERIFICATION', due_at: fee.due_at, rental_fee: fee.rental_fee, fee_breakdown: fee, rental_request_id: requestRef.id, release_condition: null, return_condition: null, confirmed_rental_at: null, confirmed_return_at: null, created_at: now, updated_at: now, created_by: actorId(actor) };
    tx.create(rentalRef, rental); tx.create(requestRef, request);
    tx.update(itemDoc.ref, { reserved_rental_id: rentalRef.id, updated_at: now });
    audit(tx, db, actorId(actor), 'RENTAL_REQUESTED', requestRef.id, now, { rental_id: rentalRef.id });
    return { rental: { id: rentalRef.id, ...rental }, request: { id: requestRef.id, ...request } };
  });
  return serializeTransaction(result);
}

export async function createMobileRentalRequest(db, actor, input, now = new Date()) {
  return (await import('./rental-flow.mjs')).createBooking(db, actor, input, now);
}

export async function reviewMobileRental(db, actor, rentalId, input, now = new Date()) {
  return (await import('./rental-flow.mjs')).reviewBooking(db, actor, rentalId, input, now);
}

export async function requestMobileReturn(db, actor, rentalId, input = {}, now = new Date()) {
  const id = idValue(rentalId), rentalRef = ref(db, 'rentals', id);
  const condition = String(input.condition || 'GOOD').toUpperCase();
  if (!['GOOD', 'FAIR', 'DAMAGED', 'NEEDS_INSPECTION'].includes(condition)) fail(400, 'Choose a valid equipment condition.');
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 2000) : '';
  const result = await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(rentalRef);
    if (!rentalDoc.exists) fail(404, 'Rental not found.');
    const rental = docData(rentalDoc);
    if (String(rental.customer_id ?? rental.customerId) !== actorId(actor)) fail(403, 'You can only return your own rental.');
    if (String(rental.status).toUpperCase() !== 'ACTIVE') fail(409, 'Only an approved active rental can be returned.');
    if (!isMobileRental(rental)) fail(409, 'Bring this equipment to the operator for its counter return.');
    const itemDoc = await tx.get(ref(db, 'items', idValue(rental.item_id ?? rental.itemId)));
    if (!itemDoc.exists || String(itemDoc.data().status).toUpperCase() !== 'RENTED') fail(409, 'The rental and equipment status must be reviewed by an administrator.');
    if (rental.latest_return_request_status === 'PENDING_ADMIN_APPROVAL') return { rental, duplicate: true };
    const request = { status: 'PENDING', requested_at: now, requested_by: actorId(actor), reported_condition: condition, notes };
    const changes = { mobile_return_request: request, latest_return_request_status: 'PENDING_ADMIN_APPROVAL', return_request_revision: (rental.return_request_revision || 0) + 1, updated_at: now };
    tx.update(rentalRef, changes);
    audit(tx, db, actorId(actor), 'MOBILE_RETURN_REQUESTED', id, now, { rental_id: id, actor_type: 'CUSTOMER' });
    queueRentalNotification(tx, db, { ...rental, ...changes }, 'RETURN_REQUESTED', now, { audience: 'STAFF', revision: changes.return_request_revision });
    return { rental: { ...rental, ...changes } };
  });
  return serializeTransaction(result);
}

export async function reviewMobileReturn(db, actor, rentalId, input, now = new Date()) {
  return (await import('./rental-flow.mjs')).completeRentalReturn(db, actor, rentalId, input, now);
}

export async function cancelMobileRentalRequest(db, actor, rentalId, now = new Date()) {
  return (await import('./rental-flow.mjs')).cancelBooking(db, actor, rentalId, now);
}

export async function createReturnRequest(db, actor, input, now = new Date(), ttlSeconds = 600) {
  if (!input || typeof input !== 'object') fail(400, 'Return details are required.');
  const rentalId = idValue(input.rentalId), terminalId = idValue(input.terminalId), requestRef = db.collection('verification_requests').doc();
  const result = await db.runTransaction(async tx => {
    const [rentalDoc, terminalDoc, requests] = await Promise.all([tx.get(ref(db, 'rentals', rentalId)), tx.get(ref(db, 'terminals', terminalId)), tx.get(db.collection('verification_requests').where('rental_id', '==', rentalId))]);
    if (!rentalDoc.exists || !terminalDoc.exists) fail(404, 'Rental or terminal not found.');
    const rental = docData(rentalDoc), terminal = docData(terminalDoc), itemDoc = await tx.get(ref(db, 'items', rental.item_id));
    if (rental.status !== 'ACTIVE' || !itemDoc.exists || itemDoc.data().status !== 'RENTED') fail(409, 'Only an active rental with rented equipment can be returned.');
    if (terminal.is_active === false) fail(409, 'Choose an active terminal.');
    if (!/^[a-f0-9]{64}$/.test(terminal.auth_token_hash || '')) fail(409, 'Configure the terminal device credential before requesting a handoff.');
    if (rows(requests).some(row => row.status === 'PENDING' && requestType(row) === 'RETURN')) fail(409, 'This rental already has a pending return request.');
    const actual = input.returnedAt ? dateValue(input.returnedAt, 'Actual return time') : now;
    const started = asDate(rental.confirmed_rental_at || rental.created_at);
    if (actual > now || (started && actual < started)) fail(400, 'Actual return time must be between rental release and now.');
    const inspection = input.inspection ? validateInspection(input.inspection, actor, 'RETURN', now) : null;
    const [requestCode] = await allocateRecordCodes(tx, db, ['verification_requests'], now);
    const request = { ...requestRecord(rentalId, String(rental.item_id), terminal, 'RETURN', now, ttlSeconds), request_code: requestCode, requested_by: actorId(actor), inspection, inspection_revision: inspection ? 1 : 0, actual_return_at: actual, ...validatePenalty(input) };
    tx.create(requestRef, request); tx.update(rentalDoc.ref, { latest_return_request_id: requestRef.id, latest_return_request_status: 'PENDING', updated_at: now });
    audit(tx, db, actorId(actor), 'RETURN_REQUESTED', requestRef.id, now, { rental_id: rentalId });
    return { request: { id: requestRef.id, ...request }, fee_preview: finalCharges(rental, request) };
  });
  return serializeTransaction(result);
}

function closeUnconfirmed(tx, db, requestDoc, rentalDoc, itemDoc, status, reason, now, terminal = null) {
  const request = requestDoc.data(), rental = rentalDoc.exists ? rentalDoc.data() : null;
  tx.update(requestDoc.ref, { status, final_reason: reason, rejection_reason: status === 'REJECTED' ? reason : null, [status === 'EXPIRED' ? 'expired_at' : 'rejected_at']: now, resolved_terminal_id: terminal?.id || null, resolved_terminal_code: terminal?.terminal_code || null });
  if (rental && requestType(request) === 'RENTAL' && rental.status === 'PENDING_VERIFICATION') {
    tx.update(rentalDoc.ref, { status, final_reason: reason, updated_at: now });
    if (itemDoc?.exists) {
      const item = itemDoc.data();
      if (item.reserved_rental_id === rentalDoc.id || (item.status === 'RESERVED_PENDING' && !item.reserved_rental_id)) tx.update(itemDoc.ref, { reserved_rental_id: null, ...(item.status === 'RESERVED_PENDING' ? { status: 'AVAILABLE' } : {}), updated_at: now });
    }
  }
  if (rental && rental.latest_terminal_request_id === requestDoc.id) tx.update(rentalDoc.ref, { latest_terminal_request_status: status, latest_terminal_request_reason: reason, updated_at: now });
  if (rental && requestType(request) === 'RETURN' && rental.latest_return_request_id === requestDoc.id) tx.update(rentalDoc.ref, { latest_return_request_status: status, latest_return_request_reason: reason, updated_at: now });
  audit(tx, db, terminal?.id || 'expiry-worker', `VERIFICATION_${status}`, requestDoc.id, now, { actor_type: terminal ? 'TERMINAL' : 'SYSTEM', rental_id: request.rental_id, reason });
}

export async function expireVerificationRequests(db, now = new Date(), { onExpired = () => {} } = {}) {
  const pending = await db.collection('verification_requests').where('status', '==', 'PENDING').where('expires_at', '<=', now).get();
  let count = 0;
  for (const candidate of pending.docs.filter(doc => expired(doc.data(), now))) {
    const changed = await db.runTransaction(async tx => {
      const requestDoc = await tx.get(candidate.ref);
      if (!requestDoc.exists || requestDoc.data().status !== 'PENDING' || !expired(requestDoc.data(), now)) return false;
      const request = requestDoc.data(), rentalDoc = await tx.get(ref(db, 'rentals', request.rental_id));
      const itemId = request.item_id || (rentalDoc.exists ? rentalDoc.data().item_id : null);
      const itemDoc = itemId ? await tx.get(ref(db, 'items', itemId)) : null;
      closeUnconfirmed(tx, db, requestDoc, rentalDoc, itemDoc, 'EXPIRED', 'Confirmation deadline elapsed.', now);
      return { rentalId: rentalDoc.id, customerId: rentalDoc.exists ? rentalDoc.data().customer_id || rentalDoc.data().customerId : request.customer_id };
    });
    if (changed) { count++; onExpired(changed); }
  }
  return { expired: count };
}

export async function saveRequestInspection(db, actor, requestId, input, now = new Date()) {
  if (!input || !Number.isInteger(input.revision) || input.revision < 0) fail(400, 'The current inspection revision is required.');
  const result = await db.runTransaction(async tx => {
    const requestDoc = await tx.get(ref(db, 'verification_requests', idValue(requestId)));
    if (!requestDoc.exists) fail(404, 'Verification request not found.');
    const request = { ...requestDoc.data(), transaction_type: requestType(requestDoc.data()) };
    if (request.status !== 'PENDING' || expired(request, now)) fail(409, 'This request is closed. Refresh its final status.');
    if (input.revision !== (request.inspection_revision || 0)) fail(409, 'The inspection changed. Refresh before saving.');
    const inspection = validateInspection(input, actor, request.transaction_type, now);
    const changes = { inspection, inspection_revision: (request.inspection_revision || 0) + 1 };
    if (request.transaction_type === 'RETURN') Object.assign(changes, validatePenalty(input));
    tx.update(requestDoc.ref, changes);
    audit(tx, db, actorId(actor), 'INSPECTION_RECORDED', requestDoc.id, now, { rental_id: request.rental_id, inspection_revision: changes.inspection_revision });
    return { id: requestDoc.id, ...request, ...changes };
  });
  return serializeTransaction(result);
}

export async function resolveTerminalRequest(db, terminal, input, now = new Date()) {
  const requestId = idValue(input?.requestId), action = input?.action || 'CONFIRM';
  if (!['CONFIRM', 'REJECT'].includes(action) || (action === 'CONFIRM' && input.button !== 'OK')) fail(400, 'A valid terminal button action is required.');
  const reason = action === 'REJECT' ? text(input.reason, 1000, 'Rejection reason') : null;
  const result = await db.runTransaction(async tx => {
    const [requestDoc, terminalDoc] = await Promise.all([tx.get(ref(db, 'verification_requests', requestId)), tx.get(ref(db, 'terminals', terminal.id))]);
    if (!requestDoc.exists) fail(404, 'Verification request not found.');
    if (!terminalDoc.exists || terminalDoc.data().is_active === false || terminalDoc.data().auth_token_hash !== terminal.auth_token_hash) fail(401, 'Terminal credentials changed or were disabled.');
    const request = { ...requestDoc.data(), transaction_type: requestType(requestDoc.data()) };
    if (String(request.terminal_id) !== terminal.id || input.verificationCode !== request.verification_code) fail(409, 'Request code or assigned terminal does not match.');
    const targetStatus = action === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
    if (request.status !== 'PENDING') {
      if (request.status === targetStatus && String(request.confirmed_terminal_id || request.resolved_terminal_id) === terminal.id) return { id: requestId, status: request.status, duplicate: true };
      fail(409, 'This verification request is already closed.');
    }
    if (request.is_test || request.rental_id === 'test_rental') {
      tx.update(terminalDoc.ref, { last_seen_at: now, status: 'ONLINE' });
      tx.update(requestDoc.ref, {
        status: targetStatus,
        confirmed_at: now,
        confirmed_terminal_id: terminal.id,
        confirmed_terminal_code: terminal.terminal_code || terminal.id,
        final_reason: action === 'CONFIRM' ? 'Hardware test confirmed by physical button press.' : 'Hardware test rejected.'
      });
      return { id: requestId, status: targetStatus, is_test: true, duplicate: false };
    }
    const rentalDoc = await tx.get(ref(db, 'rentals', request.rental_id));
    const rental = rentalDoc.exists ? rentalDoc.data() : null;
    const itemId = request.item_id || rental?.item_id, itemDoc = itemId ? await tx.get(ref(db, 'items', itemId)) : null;
    if (expired(request, now)) {
      closeUnconfirmed(tx, db, requestDoc, rentalDoc, itemDoc, 'EXPIRED', 'Confirmation deadline elapsed.', now);
      return { error: 'This request has expired.', statusCode: 410 };
    }
    if (action === 'REJECT') {
      closeUnconfirmed(tx, db, requestDoc, rentalDoc, itemDoc, 'REJECTED', reason, now, terminal);
      return { id: requestId, status: 'REJECTED', duplicate: false };
    }
    if (!rental || !itemDoc?.exists || String(rental.item_id) !== String(itemId)) fail(409, 'Rental or equipment record is inconsistent.');
    if (!['RENTAL', 'RETURN'].includes(request.transaction_type)) fail(409, 'Unsupported verification request type.');
    if (!request.inspection || !Number.isInteger(input.inspectionRevision) || input.inspectionRevision !== request.inspection_revision) fail(409, 'Record the inspection and refresh the terminal before confirming.');
    const inspection = request.inspection, item = itemDoc.data();
    // Revalidate stored values without replacing the authenticated inspector or timestamp.
    validateInspection(inspection, { id: inspection.inspected_by }, request.transaction_type, now);
    if (!inspection.inspected_by || !asDate(inspection.inspected_at)) fail(409, 'Inspection identity or timestamp is missing.');
    const conditionRef = db.collection('item_condition_records').doc();
    const condition = { ...inspection, id: conditionRef.id, rental_id: rentalDoc.id, item_id: String(itemId), verification_request_id: requestId, phase: request.transaction_type === 'RENTAL' ? (request.terminal_mode === 'SHOP_DISPATCH' ? 'SHOP_DISPATCH' : 'RELEASE') : 'RETURN', terminal_id: terminal.id, terminal_code: terminal.terminal_code || terminal.id, confirmed_at: now };
    let changes, newStatus, itemChanges;
    if (request.transaction_type === 'RENTAL') {
      if (rental.status === 'APPROVED') {
        if (item.is_active === false || !['AVAILABLE', 'RESERVED_PENDING'].includes(String(item.status).toUpperCase()) || (item.reserved_rental_id && item.reserved_rental_id !== rentalDoc.id)) fail(409, 'Equipment is no longer reserved for this rental.');
        const fee = rental.fee_breakdown || {};
        if (request.terminal_mode === 'SHOP_DISPATCH') {
          newStatus = item.status || 'AVAILABLE';
          const deliveryHoldMs = Number(process.env.RENTAL_DELIVERY_HOLD_SECONDS || 7200) * 1000;
          changes = {
            delivery_status: 'OUT_FOR_DELIVERY',
            handoff_expires_at: new Date(now.getTime() + deliveryHoldMs),
            hold_expires_at: null,
            delivery_departure: {
              at: now,
              operator_id: request.requested_by || terminal.id,
              operator_name: inspection.inspected_by_name || terminal.id,
              terminal_id: terminal.id,
              terminal_code: terminal.terminal_code || terminal.id
            },
            shop_dispatch_condition: condition,
            shop_dispatch_terminal_id: terminal.id,
            latest_terminal_request_status: 'CONFIRMED'
          };
          itemChanges = { status: newStatus, condition_status: inspection.condition, reserved_rental_id: rentalDoc.id, updated_at: now };
          queueRentalNotification(tx, db, { id: rentalDoc.id, ...rental, ...changes }, 'DELIVERY_DEPART', now, { revision: requestId });
        } else {
          const due = fee.mode === 'WHOLE_STAY' ? asDate(fee.due_at || rental.estimated_due_at) : new Date(now.getTime() + Number(fee.billed_minutes || 60) * 60000);
          if (!due || due <= now) fail(409, 'The selected checkout deadline has passed. Cancel this rental request and prepare a new one.');
          const baseFee = Number(rental.rental_fee ?? fee.rental_fee ?? 0);
          const paidBefore = Number(rental.rental_paid_amount || 0);
          const paidAfter = request.payment_verified ? Math.max(paidBefore, baseFee) : paidBefore;
          if (paidAfter > paidBefore) {
            const savePayment = await planLedgerEntry(tx, db, { id: request.requested_by || terminal.id, full_name: inspection.inspected_by_name || terminal.id }, { id: rentalDoc.id, ...rental }, { key: `terminal-handoff:${rentalDoc.id}:${requestId}`, amount: round(paidAfter - paidBefore), method: rental.payment_method || 'CASH', source: 'IN_PERSON_HANDOFF' }, now);
            savePayment();
          }
          const verification = request.handoff_verification || { verification_method: 'TERMINAL', manual_reason: null };
          newStatus = 'RENTED';
          changes = {
            status: 'ACTIVE',
            delivery_status: 'HANDED_OFF',
            delivery_handoff: { handed_off_at: now, handed_off_by: request.requested_by || terminal.id, verification_method: verification.verification_method, manual_reason: verification.manual_reason, terminal_id: terminal.id },
            handoff_verification: verification,
            rental_paid_amount: paidAfter,
            rental_refunded_amount: Number(rental.rental_refunded_amount || 0),
            payment_confirmed_by_admin: true,
            start_at: now,
            due_at: due,
            confirmed_rental_at: now,
            confirmed_rental_by: request.requested_by || terminal.id,
            confirmed_rental_terminal_id: terminal.id,
            fee_breakdown: { ...fee, start_at: now, due_at: due },
            release_condition: condition,
            release_condition_record_id: conditionRef.id,
            latest_terminal_request_status: 'CONFIRMED'
          };
          Object.assign(changes, rentalPaymentSummary(rental, changes));
          if (rental.request_source === 'WALK_IN' && request.customer_terms_acknowledged === true && !rental.rental_terms_acceptance) {
            changes.rental_terms_acceptance = { version: MOBILE_RENTAL_TERMS_VERSION, acceptance_method: 'STAFF_WITNESSED', accepted_at: now, accepted_by: rental.customer_id, witnessed_by: request.requested_by || terminal.id, rental_fee: rental.rental_fee, billed_minutes: fee.billed_minutes, late_fee_rate: fee.overtime_rate, late_fee_unit_minutes: fee.overtime_unit_minutes, grace_minutes: fee.grace_minutes, due_at: due, fulfillment_mode: rental.fulfillment_mode, delivery_location: rental.delivery_location };
          }
          itemChanges = { status: 'RENTED', condition_status: inspection.condition, reserved_rental_id: null, current_rental_id: rentalDoc.id, updated_at: now };
          queueRentalNotification(tx, db, { id: rentalDoc.id, ...rental, ...changes }, 'RENTAL_RELEASED', now);
        }
      } else {
        if (rental.status !== 'PENDING_VERIFICATION' || item.is_active === false || String(item.status).toUpperCase() !== 'AVAILABLE' || (item.reserved_rental_id && item.reserved_rental_id !== rentalDoc.id)) fail(409, 'Equipment is no longer reserved for this rental.');
        if (!rental.fee_breakdown?.snapshot_version || asDate(rental.due_at) <= now) fail(409, 'A saved quote with a future due time is required. Submit a new rental request.');
        newStatus = 'RENTED';
        changes = { status: 'ACTIVE', confirmed_rental_at: now, release_condition: condition, release_condition_record_id: conditionRef.id, confirmed_rental_terminal_id: terminal.id };
        itemChanges = { status: newStatus, condition_status: inspection.condition, reserved_rental_id: null, updated_at: now };
      }
    } else {
      const validActiveReturn = rental.status === 'ACTIVE' && item.status === 'RENTED';
      const validReceivedReturn = rental.status === 'RETURN_PENDING_INSPECTION' && item.status === 'UNDER_INSPECTION';
      if (!validActiveReturn && !validReceivedReturn) fail(409, 'This rental has already been returned or is not active.');
      if (!amount(request.penalty_amount)) fail(409, 'Record the penalty amount, including an explicit zero when no penalty applies.');
      newStatus = inspection.result;
      const actualReturn = asDate(rental.received_at || request.actual_return_at || now);
      const fee = { ...finalCharges({ ...rental, rental_fee: rental.rental_fee ?? rental.rateFee, due_at: rental.due_at ?? rental.dueDate }, { ...request, actual_return_at: actualReturn }), finalized_at: now };
      changes = {
        status: 'COMPLETED',
        confirmed_return_at: now,
        ...(validReceivedReturn ? { confirmed_return_by: request.requested_by || terminal.id, returned_at: rental.received_at, returnedDate: rental.received_at } : {}),
        actual_return_at: actualReturn,
        return_condition: condition,
        return_condition_record_id: conditionRef.id,
        confirmed_return_terminal_id: terminal.id,
        fee_breakdown: fee,
        overtime_fee: fee.overtime_fee,
        penalty_amount: fee.penalty_amount,
        final_rental_charges: fee.final_rental_charges,
        latest_return_request_status: 'CONFIRMED',
        latest_terminal_request_status: 'CONFIRMED',
        ...(rental.mobile_return_request ? { mobile_return_request: { ...rental.mobile_return_request, status: 'APPROVED', reviewed_at: now, reviewed_by: request.requested_by || terminal.id } } : {})
      };
      if (Object.hasOwn(rental, 'rental_paid_amount')) Object.assign(changes, rentalPaymentSummary(rental, changes));
      if (newStatus === 'UNDER_MAINTENANCE') {
        const [maintenanceCode] = await allocateRecordCodes(tx, db, ['maintenance_records'], now);
        const maintenanceRef = db.collection('maintenance_records').doc();
        tx.create(maintenanceRef, { ...returnMaintenanceRecord({ id: String(itemId), ...item }, rentalDoc.id, condition, { id: terminal.id, name: 'Terminal' }, maintenanceCode, now), verification_request_id: requestId, inspected_by: inspection.inspected_by });
        changes.maintenance_record_id = maintenanceRef.id;
      }
      itemChanges = { status: newStatus, condition_status: inspection.condition, reserved_rental_id: null, ...(item.current_rental_id !== undefined ? { current_rental_id: null } : {}), updated_at: now };
      if (Object.hasOwn(rental, 'rental_paid_amount')) {
        queueRentalNotification(tx, db, { id: rentalDoc.id, ...rental, ...changes }, 'RETURN_COMPLETED', now, { condition: condition.condition, maintenance: newStatus === 'UNDER_MAINTENANCE' });
      }
    }
    tx.create(conditionRef, condition);
    tx.update(rentalDoc.ref, { ...changes, updated_at: now });
    tx.update(itemDoc.ref, itemChanges);
    tx.update(terminalDoc.ref, { last_seen_at: now, status: 'ONLINE' });
    tx.update(requestDoc.ref, { status: 'CONFIRMED', confirmed_at: now, confirmed_terminal_id: terminal.id, confirmed_terminal_code: terminal.terminal_code || terminal.id, condition_record_id: conditionRef.id, final_reason: null });
    tx.create(db.collection('item_status_history').doc(), { item_id: String(itemId), old_status: item.status, new_status: newStatus, changed_at: now, changed_by: terminal.id, source: 'TERMINAL', reference_type: request.transaction_type, rental_id: rentalDoc.id, verification_request_id: requestId });
    audit(tx, db, terminal.id, 'VERIFICATION_CONFIRMED', requestId, now, { actor_type: 'TERMINAL', rental_id: rentalDoc.id, transaction_type: request.transaction_type });
    return { id: requestId, status: 'CONFIRMED', rental_id: rentalDoc.id, item_status: newStatus, rental: { id: rentalDoc.id, ...rental, ...changes }, duplicate: false };
  });
  if (result.error) fail(result.statusCode, result.error);
  return result;
}

export async function terminalPending(db, terminal, now = new Date(), { expire = () => expireVerificationRequests(db, now) } = {}) {
  await expire();
  const snapshot = await db.collection('verification_requests').where('terminal_id', '==', terminal.id).where('status', '==', 'PENDING').get();
  const pending = [];
  for (const request of rows(snapshot).filter(row => row.status === 'PENDING').map(row => ({ ...row, transaction_type: requestType(row) })).sort((a, b) => asDate(a.requested_at) - asDate(b.requested_at))) {
    const rentalDoc = await ref(db, 'rentals', request.rental_id).get();
    const rental = rentalDoc.exists ? docData(rentalDoc) : null;
    const feeBreakdown = rental ? request.transaction_type === 'RETURN' ? finalCharges(rental, request) : rental.fee_breakdown || null : null;
    pending.push({
      ...request,
      rental_code: rental?.rental_code || request.rental_code || request.rental_id,
      item_name: request.item_name || rental?.item_name || rental?.fee_breakdown?.product_name || 'Equipment',
      item_code: request.item_code || rental?.item_code || '',
      customer_name: request.customer_name || rental?.customer_name || '',
      fulfillment_mode: request.fulfillment_mode || rental?.fulfillment_mode || 'SHOP_HANDOVER',
      terminal_mode: request.terminal_mode || (request.transaction_type === 'RETURN' ? 'RETURN' : 'HANDOVER'),
      rental_fee: request.transaction_type === 'RETURN'
        ? (feeBreakdown?.final_rental_charges ?? rental?.rental_fee ?? 0)
        : (rental?.rental_fee ?? feeBreakdown?.rental_fee ?? 0),
      due_at: rental?.due_at || rental?.estimated_due_at || null,
      fee_breakdown: feeBreakdown
    });
  }
  const lastSeen = asDate(terminal.last_seen_at);
  if (terminal.status !== 'ONLINE' || !lastSeen || now - lastSeen >= 10000) await ref(db, 'terminals', terminal.id).update({ last_seen_at: now, status: 'ONLINE' });
  return serializeTransaction({ terminal_id: terminal.id, requests: pending });
}

export function createExpirySweep(db, { intervalMs = 60000, idleIntervalMs = intervalMs, now = Date.now, onExpired = () => {} } = {}) {
  let pending = null, nextRunAt = -Infinity, scheduleVersion = 0, pendingDeadline = Infinity;
  const holdStatuses = ['PENDING_ADMIN_APPROVAL', 'PENDING_ESP32_RENT', 'APPROVED'];
  const deadlines = async () => {
    const snapshots = await Promise.all([
      db.collection('verification_requests').where('status', '==', 'PENDING').orderBy('expires_at').limit(1).get(),
      db.collection('rentals').where('status', 'in', holdStatuses).orderBy('hold_expires_at').limit(1).get()
    ]);
    return snapshots.map((snapshot, index) => asDate(snapshot.docs[0]?.data()[index ? 'hold_expires_at' : 'expires_at'])?.getTime() ?? Infinity);
  };
  return {
    schedule(result = {}) {
      const rental = result?.rental || result?.data?.rental, request = result?.request;
      const dates = [holdStatuses.includes(rental?.status) ? rental.hold_expires_at : null, request?.status === 'PENDING' ? request.expires_at : null];
      for (const value of dates) {
        const deadline = asDate(value)?.getTime();
        if (Number.isFinite(deadline)) {
          pendingDeadline = Math.min(pendingDeadline, deadline);
          nextRunAt = Math.min(nextRunAt, deadline);
          scheduleVersion++;
        }
      }
    },
    run({ force = false } = {}) {
      if (pending) return pending;
      if (!force && now() < nextRunAt) return Promise.resolve({ expired: 0, nextRunAt });
      const sweepAt = new Date(now());
      const version = scheduleVersion;
      pendingDeadline = Infinity;
      const changes = [];
      const onChanged = change => changes.push(change);
      pending = deadlines().then(async due => {
        const results = await Promise.all([
          due[0] <= sweepAt.getTime() ? expireVerificationRequests(db, sweepAt, { onExpired: onChanged }) : { expired: 0 },
          due[1] <= sweepAt.getTime() ? import('./rental-flow.mjs').then(flow => flow.expireRentalHolds(db, sweepAt, { onExpired: onChanged })) : { expired: 0 }
        ]);
        const upcoming = due.some(value => value <= sweepAt.getTime()) ? await deadlines() : due;
        const next = Math.min(now() + idleIntervalMs, ...upcoming.map(value => value <= now() ? now() + intervalMs : value));
        nextRunAt = version === scheduleVersion ? next : Math.min(pendingDeadline, next);
        const result = {
          expired: results.reduce((total, entry) => total + entry.expired, 0),
          expiredRentals: results[1].expired, nextRunAt, changes
        };
        if (result.expired) onExpired(result);
        return result;
      }).finally(() => { pending = null; });
      return pending;
    }
  };
}

export function startExpiryWorker(db, { intervalMs = 60000, now = Date.now, sweep = () => expireVerificationRequests(db), onError = error => console.warn(`Verification expiry sweep failed (${error.code || 'FIREBASE_ERROR'}): ${error.message} ${firebaseFailure(error).error}`) } = {}) {
  let running = false, stopped = false, failures = 0, retryAt = 0;
  const tick = async () => {
    if (running || stopped || now() < retryAt) return;
    running = true;
    try { await sweep(); failures = 0; retryAt = 0; }
    catch (error) {
      failures++;
      retryAt = now() + (isQuotaError(error) ? firebaseFailure(error).retryAfterSeconds * 1000 : Math.min(300000, intervalMs * 2 ** Math.min(failures, 10)));
      onError(error);
    } finally { running = false; }
  };
  const timer = setInterval(tick, intervalMs); timer.unref?.();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}

export async function testTerminalPing(db, actor, terminalId, now = new Date()) {
  const terminalDoc = await ref(db, 'terminals', terminalId).get();
  if (!terminalDoc.exists) fail(404, 'Terminal not found.');
  const terminal = terminalDoc.data();
  if (terminal.is_active === false) fail(409, 'Terminal is inactive.');

  const oldTests = await db.collection('verification_requests')
    .where('terminal_id', '==', terminalId)
    .where('status', '==', 'PENDING')
    .get();
  for (const doc of oldTests.docs) {
    if (doc.data().is_test) {
      await doc.ref.update({ status: 'EXPIRED', expired_at: now, final_reason: 'Superseded by fresh test.' });
    }
  }

  const requestRef = db.collection('verification_requests').doc();
  const testRequest = {
    id: requestRef.id,
    request_code: 'V-9999',
    rental_id: 'test_rental',
    terminal_id: terminalId,
    terminal_code: terminal.terminal_code || terminalId,
    transaction_type: 'RENTAL',
    terminal_mode: 'HANDOVER',
    status: 'PENDING',
    rental_code: 'R-9999',
    item_name: 'Hardware Test Ping',
    item_code: 'TEST-01',
    customer_name: 'Admin Verification',
    rental_fee: 0,
    verification_code: 'TEST',
    requested_at: now,
    expires_at: new Date(now.getTime() + 180000),
    inspection: { condition: 'GOOD', result: 'AVAILABLE', inspected_by: actorId(actor) },
    inspection_revision: 0,
    is_test: true,
    requested_by: actorId(actor)
  };
  await requestRef.set(testRequest);
  return { success: true, message: 'Test verification sent to terminal!', request: testRequest };
}

export async function dispatchRentalToTerminal(db, actor, rentalId, input = {}, now = new Date(), ttlSeconds = 600) {
  if (!input || typeof input !== 'object') fail(400, 'Terminal dispatch details are required.');
  const id = idValue(rentalId);
  const dispatchKey = input.requestKey == null ? null : String(input.requestKey);
  if (dispatchKey && !/^[a-f0-9]{32}$/.test(dispatchKey)) fail(400, 'A valid terminal operation key is required.');
  const requestRef = db.collection('verification_requests').doc();
  const result = await db.runTransaction(async tx => {
    const rentalDoc = await tx.get(ref(db, 'rentals', id));
    if (!rentalDoc.exists) fail(404, 'Rental not found.');
    const rental = docData(rentalDoc);
    const itemId = idValue(rental.item_id || rental.itemId);
    const itemDoc = await tx.get(ref(db, 'items', itemId));
    if (!itemDoc.exists) fail(404, 'Assigned equipment not found.');
    const item = docData(itemDoc);

    let terminal = null;
    if (input.terminalId) {
      const tDoc = await tx.get(ref(db, 'terminals', idValue(input.terminalId)));
      if (tDoc.exists) terminal = docData(tDoc);
    } else {
      const tSnap = await tx.get(db.collection('terminals'));
      const activeTerminals = rows(tSnap).filter(row => row.is_active !== false);
      terminal = activeTerminals.find(row => row.id === 'TERM-01' || row.terminal_code === 'TERM-01') || activeTerminals[0] || null;
    }
    if (!terminal || terminal.is_active === false) fail(409, 'Select an active ESP32 terminal.');
    if (!/^[a-f0-9]{64}$/.test(terminal.auth_token_hash || '')) fail(409, 'Configure the terminal device credential before requesting a handoff.');

    const existingSnap = await tx.get(db.collection('verification_requests').where('rental_id', '==', id));
    const previous = dispatchKey && existingSnap.docs.find(doc => doc.data().dispatch_operation_key === dispatchKey);
    if (previous) return { rental, request: { id: previous.id, ...previous.data() } };
    for (const oldDoc of existingSnap.docs) {
      if (oldDoc.data().status === 'PENDING') {
        tx.update(oldDoc.ref, { status: 'EXPIRED', expired_at: now, final_reason: 'Superseded by a new terminal dispatch.' });
      }
    }

    const rentalStatus = String(rental.status || '').toUpperCase();
    const requestedMode = String(input.mode || input.terminalMode || (['RETURN_PENDING_INSPECTION', 'ACTIVE'].includes(rentalStatus) ? 'RETURN' : rental.fulfillment_mode === 'DELIVERY' && input.dispatchOnly ? 'SHOP_DISPATCH' : 'HANDOVER')).toUpperCase();
    if (!['HANDOVER', 'SHOP_DISPATCH', 'RETURN'].includes(requestedMode)) fail(400, 'Choose a valid terminal verification mode.');

    const [requestCode] = await allocateRecordCodes(tx, db, ['verification_requests'], now);
    const rentalUpdates = { updated_at: now, latest_terminal_request_id: requestRef.id, latest_terminal_request_status: 'PENDING' };

    if (requestedMode === 'RETURN') {
      if (!['ACTIVE', 'RETURN_PENDING_INSPECTION'].includes(rentalStatus)) fail(409, 'Only an active or received rental can be verified for return on the terminal.');
      const penalty = validatePenalty({ penaltyAmount: input.penaltyAmount ?? 0, penaltyReason: input.penaltyReason });
      if (penalty.penalty_amount === null) fail(400, 'Enter a penalty amount, including 0 when none applies.');
      const inspectionInput = input.inspection || { condition: 'GOOD', notes: 'Inspected at counter terminal.', result: 'AVAILABLE' };
      const inspection = validateInspection(inspectionInput, actor, 'RETURN', now);
      const actualReturn = asDate(rental.received_at || (input.returnedAt ? dateValue(input.returnedAt, 'Actual return time') : now));
      const request = {
        ...requestRecord(id, String(itemId), terminal, 'RETURN', now, ttlSeconds),
        request_code: requestCode,
        dispatch_operation_key: dispatchKey,
        terminal_mode: 'RETURN',
        rental_code: rental.rental_code || id,
        item_name: item.name || rental.item_name || 'Equipment',
        item_code: item.item_code || rental.item_code || '',
        customer_name: rental.customer_name || '',
        fulfillment_mode: rental.fulfillment_mode || 'SHOP_HANDOVER',
        rental_fee: rental.rental_fee ?? 0,
        requested_by: actorId(actor),
        inspection,
        inspection_revision: 1,
        actual_return_at: actualReturn,
        ...penalty
      };
      rentalUpdates.latest_return_request_id = requestRef.id;
      rentalUpdates.latest_return_request_status = 'PENDING';
      tx.create(requestRef, request);
      tx.update(rentalDoc.ref, rentalUpdates);
      audit(tx, db, actorId(actor), 'RETURN_REQUESTED', requestRef.id, now, { rental_id: id, terminal_mode: 'RETURN' });
      return { rental: { ...rental, ...rentalUpdates }, request: { id: requestRef.id, ...request }, fee_preview: finalCharges(rental, request) };
    }

    if (rentalStatus !== 'APPROVED') fail(409, 'Approve this rental request before sending it to the ESP32 terminal.');
    const manual = input.manualLookup === true || Boolean(typeof input.manualReason === 'string' && input.manualReason.trim());
    const manualReason = optionalText(input.manualReason, 1000, 'Manual lookup reason');

    if (!['PREPARED', 'OUT_FOR_DELIVERY'].includes(rental.delivery_status)) {
      const invCode = text(input.inventoryCode, 256, 'Equipment QR');
      if (![item.qr_token, item.item_code, item.qrCode, item.legacy_item_code, item.id].filter(Boolean).includes(invCode)) {
        fail(409, `Equipment mismatch. Scan the QR sticker on ${item.name || 'the assigned equipment'} (${item.item_code || item.id}).`);
      }
      const prepRevision = (Number(rental.delivery_preparation_revision) || 0) + 1;
      rentalUpdates.delivery_status = 'PREPARED';
      rentalUpdates.delivery_preparation_revision = prepRevision;
      rentalUpdates.delivery_preparation = {
        status: 'PREPARED',
        prepared_at: now,
        prepared_by: actorId(actor),
        item_id: String(itemId),
        item_code: item.item_code || item.qrCode || '',
        verification_method: manual ? 'MANUAL' : 'QR',
        manual_reason: manualReason || null,
        revision: prepRevision
      };
      tx.update(itemDoc.ref, { reserved_rental_id: id, updated_at: now });
    }

    if (requestedMode === 'HANDOVER') {
      const txCode = text(input.transactionCode, 256, 'Customer transaction QR');
      const ticketCheck = verifyTransactionQrCode(txCode, { id, ...rental }, now, { manual });
      if (!ticketCheck.valid) fail(409, ticketCheck.message);
      if (input.customerVerified !== true) fail(400, 'Verify that the person receiving the equipment matches the rental customer.');
      if (rental.request_source === 'WALK_IN' && input.customerTermsAcknowledged !== true) fail(400, 'Confirm that the customer agreed to the duration, total, late fees, and return terms before handover.');
      const baseFee = Number(rental.rental_fee ?? 0);
      const paid = Number(rental.rental_paid_amount || 0);
      if (paid < baseFee && input.paymentVerified !== true) fail(400, 'Confirm receipt of the rental payment before release.');
      if (input.inspection?.accessoriesChecked !== true) fail(400, 'Confirm that the equipment and included accessories were checked.');
    }

    const inspectionInput = input.inspection || { condition: item.condition_status === 'FAIR' ? 'FAIR' : 'GOOD', notes: requestedMode === 'SHOP_DISPATCH' ? 'Prepared at shop and verified on ESP32 terminal for resort delivery.' : 'Verified at counter terminal.', result: 'AVAILABLE' };
    const inspection = validateInspection(inspectionInput, actor, 'RENTAL', now);
    const request = {
      ...requestRecord(id, String(itemId), terminal, 'RENTAL', now, ttlSeconds),
      request_code: requestCode,
      dispatch_operation_key: dispatchKey,
      terminal_mode: requestedMode,
      rental_code: rental.rental_code || id,
      item_name: item.name || rental.item_name || 'Equipment',
      item_code: item.item_code || rental.item_code || '',
      customer_name: rental.customer_name || '',
      fulfillment_mode: rental.fulfillment_mode || 'SHOP_HANDOVER',
      rental_fee: rental.rental_fee ?? 0,
      payment_verified: input.paymentVerified === true || Number(rental.rental_paid_amount || 0) >= Number(rental.rental_fee || 0),
      customer_verified: input.customerVerified === true,
      customer_terms_acknowledged: input.customerTermsAcknowledged === true,
      handoff_verification: { verification_method: manual ? 'MANUAL' : 'QR', manual_reason: manualReason || null },
      requested_by: actorId(actor),
      inspection,
      inspection_revision: 1
    };
    tx.create(requestRef, request);
    tx.update(rentalDoc.ref, rentalUpdates);
    audit(tx, db, actorId(actor), requestedMode === 'SHOP_DISPATCH' ? 'SHOP_DISPATCH_TERMINAL_REQUESTED' : 'RENTAL_REQUESTED', requestRef.id, now, { rental_id: id, terminal_mode: requestedMode });
    return { rental: { ...rental, ...rentalUpdates }, request: { id: requestRef.id, ...request } };
  });
  return serializeTransaction(result);
}


export async function getVerificationRequestStatus(db, requestId, now = new Date(), { expire = () => expireVerificationRequests(db, now) } = {}) {
  const id = idValue(requestId);
  let requestDoc = await ref(db, 'verification_requests', id).get();
  if (!requestDoc.exists) fail(404, 'Verification request not found.');
  let request = { ...docData(requestDoc), transaction_type: requestType(requestDoc.data()) };
  if (request.status === 'PENDING' && expired(request, now)) {
    await expire();
    requestDoc = await ref(db, 'verification_requests', id).get();
    if (requestDoc.exists) request = { ...docData(requestDoc), transaction_type: requestType(requestDoc.data()) };
  }
  const rentalId = request.rental_id && request.rental_id !== 'test_rental' ? String(request.rental_id) : '';
  const rentalDoc = rentalId ? await ref(db, 'rentals', rentalId).get() : null;
  const rental = rentalDoc?.exists ? docData(rentalDoc) : null;
  return serializeTransaction({ request, rental });
}
