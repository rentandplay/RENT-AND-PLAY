import { asDate, docData, localDateTime, dateFields } from './firebase.mjs';
import { allocateRecordCodes } from './record-codes.mjs';
import { isStaffRole } from './roles.mjs';
import { stageAudit } from './audit.mjs';
import { isOpenMaintenance, maintenanceStage } from './maintenance-state.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const idValue = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail(400, 'Choose a valid unit or maintenance ticket.'); return value; };
const text = (value, label, max = 2000, required = false) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) fail(400, `${label}${required ? ' is required and' : ''} must be ${max} characters or fewer.`);
  return value.trim();
};
const serial = row => dateFields(row, ['created_at', 'updated_at', 'reported_at', 'started_at', 'repair_started_at', 'inspection_requested_at', 'completed_at', 'retired_at']);
const inputObject = input => { if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Maintenance details are required.'); };
const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const conditions = ['GOOD', 'FAIR', 'DAMAGED', 'NEEDS_INSPECTION'];
const openRental = rental => ['ACTIVE', 'APPROVED', 'RETURN_PENDING_INSPECTION', 'PENDING_VERIFICATION', 'PENDING_ADMIN_APPROVAL', 'PENDING_ESP32_RENT'].includes(String(rental.status || '').toUpperCase());
const actorId = actor => idValue(String(actor?.id || actor || ''));
const targetDate = value => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, 'Choose a valid target completion date.');
  return value;
};
const repairCost = value => {
  if (value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 9999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > .0001) fail(400, 'Repair cost must be a nonnegative PHP amount with at most two decimal places.');
  return value;
};
function validatePhotos(value = []) {
  if (!Array.isArray(value) || value.length > 3) fail(400, 'Add up to three photos per update.');
  return value.map(photo => {
    if (!photo || typeof photo !== 'object') fail(400, 'Choose a valid damage or repair photo.');
    const data = photo.imageData;
    if (typeof data !== 'string' || data.length > 200000) fail(400, 'Each photo must be a resized JPG, PNG, or WebP under 150 KB.');
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
    if (!match) fail(400, 'Choose a JPG, PNG, or WebP photo.');
    const bytes = Buffer.from(match[2], 'base64');
    const valid = bytes.toString('base64') === match[2] && (match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
    if (!valid) fail(400, 'The photo content does not match its file type.');
    return { image_data: data, caption: text(photo.caption, 'Photo caption', 120) };
  });
}
async function readUnit(tx, db, id) {
  const itemDoc = await tx.get(db.collection('items').doc(id));
  if (!itemDoc.exists) fail(404, 'This physical unit is no longer available.');
  const [maintenance, rentals, legacyRentals] = await Promise.all([
    tx.get(db.collection('maintenance_records').where('item_id', '==', id)),
    tx.get(db.collection('rentals').where('item_id', '==', id)),
    tx.get(db.collection('rentals').where('itemId', '==', id))
  ]);
  const item = docData(itemDoc);
  if (item.reserved_rental_id || item.current_rental_id || ['RENTED', 'RESERVED_PENDING', 'UNDER_INSPECTION'].includes(String(item.status).toUpperCase()) || [...rentals.docs, ...legacyRentals.docs].some(doc => openRental(doc.data()))) fail(409, 'This unit has an active or pending rental. Resolve a pending assignment in Rentals, or receive and inspect a rented unit in Returns, before maintenance.');
  return { itemDoc, item, open: maintenance.docs.filter(doc => isOpenMaintenance(doc.data())) };
}
async function assignment(tx, db, value) {
  if (value == null || value === '') return { assigned_to: null, assigned_name: null };
  const id = idValue(value), doc = await tx.get(db.collection('users').doc(id));
  if (!doc.exists || doc.data().is_active === false || !isStaffRole(doc.data().role)) fail(400, 'Assign an active operator or owner, or leave the ticket unassigned.');
  return { assigned_to: id, assigned_name: doc.data().full_name || doc.data().name || 'Staff' };
}
async function actorName(tx, db, actor) {
  const doc = await tx.get(db.collection('users').doc(actorId(actor)));
  return doc.exists ? doc.data().full_name || doc.data().name || 'Staff' : 'Staff';
}
const activity = (actor, name, kind, note, stage, now) => ({ actor_id: actorId(actor), actor_name: name, kind, note, stage, at: now.toISOString() });
function savePhotos(tx, db, ticketId, photos, actor, now) {
  return photos.map(photo => {
    const ref = db.collection('maintenance_photos').doc();
    tx.create(ref, { ...photo, maintenance_id: ticketId, created_by: actorId(actor), created_at: now });
    return { id: ref.id, caption: photo.caption, added_at: now.toISOString() };
  });
}
function statusHistory(tx, db, actor, item, next, maintenanceId, now) {
  if (String(item.status).toUpperCase() === next) return;
  tx.create(db.collection('item_status_history').doc(), { item_id: item.id, old_status: item.status, new_status: next, changed_at: now, changed_by: actorId(actor), source: 'MAINTENANCE', reference_type: 'MAINTENANCE', maintenance_id: maintenanceId });
}
const auditSummary = row => Object.fromEntries(['item_id', 'maintenance_code', 'status', 'workflow_stage', 'priority', 'assigned_to', 'target_date', 'repair_cost', 'reason', 'revision'].filter(key => row[key] !== undefined).map(key => [key, row[key]]));

export function returnMaintenanceRecord(item, rentalId, condition, actor, code, now) {
  const reason = condition.condition === 'DAMAGED' ? 'Damaged return' : 'Return inspection requires maintenance';
  return { item_id: String(item.id), item_name: item.name, item_code: item.item_code || item.qrCode || '', rental_id: rentalId, condition_record_id: condition.id, maintenance_code: code, status: 'IN_PROGRESS', workflow_stage: 'REPORTED', workflow_version: 1, revision: 1, priority: 'NORMAL', assigned_to: null, assigned_name: null, target_date: null, repair_cost: null, reason, inspection_notes: condition.notes || '', initial_condition: condition.condition, details: null, photos: [], activity: [activity(actor, actor.full_name || actor.name || 'Staff', 'REPORTED', condition.notes || reason, 'REPORTED', now)], reported_at: now, started_at: now, created_at: now, updated_at: now, completed_at: null, created_by: actorId(actor) };
}

export async function createMaintenance(db, actor, input, now = new Date()) {
  inputObject(input);
  const itemId = idValue(input.itemId), reason = text(input.reason, 'Issue summary', 255, true), notes = text(input.notes, 'Issue details'), photos = validatePhotos(input.photos);
  const priority = input.priority || 'NORMAL', condition = input.condition || 'NEEDS_INSPECTION', date = targetDate(input.targetDate);
  if (!priorities.includes(priority) || !conditions.includes(condition)) fail(400, 'Choose a valid priority and unit condition.');
  return db.runTransaction(async tx => {
    const { itemDoc, item, open } = await readUnit(tx, db, itemId);
    if ((input.version ?? null) !== (localDateTime(item.updated_at) || null)) fail(409, 'This unit changed since you opened it. Refresh and try again.');
    if (item.is_active === false || !['AVAILABLE', 'UNDER_MAINTENANCE'].includes(String(item.status).toUpperCase())) fail(409, 'Choose an active available unit. Retired and archived units cannot be sent to repair.');
    if (open.length) fail(409, 'This unit already has an open maintenance ticket. Open that ticket to add updates.');
    const assigned = await assignment(tx, db, input.assignedTo), name = await actorName(tx, db, actor);
    const [code] = await allocateRecordCodes(tx, db, ['maintenance_records'], now);
    const ref = db.collection('maintenance_records').doc();
    const row = { item_id: itemId, maintenance_code: code, status: 'IN_PROGRESS', workflow_stage: 'REPORTED', workflow_version: 1, revision: 1, reason, description: notes, priority, ...assigned, target_date: date, repair_cost: null, initial_condition: condition, photos: savePhotos(tx, db, ref.id, photos, actor, now), activity: [activity(actor, name, 'REPORTED', notes || reason, 'REPORTED', now)], created_by: actorId(actor), created_at: now, updated_at: now, reported_at: now, started_at: now, completed_at: null };
    row.item_name = item.name; row.item_code = item.item_code;
    tx.create(ref, row);
    tx.update(itemDoc.ref, { status: 'UNDER_MAINTENANCE', condition_status: condition, updated_at: now });
    statusHistory(tx, db, actor, item, 'UNDER_MAINTENANCE', ref.id, now);
    stageAudit(tx, db, actorId(actor), 'MAINTENANCE_REPORTED', 'MAINTENANCE', ref.id, { after: auditSummary(row), now });
    return { maintenance: serial({ id: ref.id, ...row }), item: serial({ ...item, status: 'UNDER_MAINTENANCE', condition_status: condition, updated_at: now }) };
  });
}

export async function updateMaintenance(db, actor, id, input, now = new Date()) {
  inputObject(input); id = idValue(id);
  const action = input.action;
  if (!['update', 'start-repair', 'send-inspection', 'inspection-failed', 'complete', 'retire'].includes(action)) fail(400, 'Choose a valid maintenance action.');
  const note = text(input.note, 'Work or inspection notes', 2000, action !== 'update' && action !== 'start-repair');
  const photos = validatePhotos(input.photos);
  return db.runTransaction(async tx => {
    const ref = db.collection('maintenance_records').doc(id), doc = await tx.get(ref);
    if (!doc.exists) fail(404, 'Maintenance ticket not found.');
    const saved = docData(doc), revision = Number(saved.revision || 0);
    if (typeof input.revision !== 'number' || !Number.isInteger(input.revision) || input.revision !== revision) fail(409, 'This ticket changed since you opened it. Reopen it to see the latest update.');
    const stage = maintenanceStage(saved), closed = !isOpenMaintenance(saved);
    if (closed && action !== 'update') fail(409, 'This maintenance ticket is already closed.');
    let unit;
    if (closed) {
      const itemDoc = await tx.get(db.collection('items').doc(idValue(saved.item_id)));
      unit = { itemDoc, item: itemDoc.exists ? docData(itemDoc) : null, open: [] };
    } else unit = await readUnit(tx, db, idValue(saved.item_id));
    const { itemDoc, item, open } = unit;
    if (!closed && (item.is_active === false || !['AVAILABLE', 'UNDER_MAINTENANCE'].includes(String(item.status).toUpperCase()))) fail(409, 'The unit is no longer in an editable maintenance state. Refresh equipment details.');
    const name = await actorName(tx, db, actor);
    const patch = { revision: revision + 1, updated_at: now, workflow_version: 1 };
    if (action === 'update') {
      if (input.repairCost !== undefined) patch.repair_cost = repairCost(input.repairCost);
      if (!closed) {
        if (input.priority !== undefined) { if (!priorities.includes(input.priority)) fail(400, 'Choose a valid priority.'); patch.priority = input.priority; }
        if (input.targetDate !== undefined) patch.target_date = targetDate(input.targetDate);
        if (input.assignedTo !== undefined) Object.assign(patch, await assignment(tx, db, input.assignedTo));
      } else if (['priority', 'targetDate', 'assignedTo'].some(field => input[field] !== undefined)) fail(400, 'Closed tickets accept expense corrections, photos and notes only.');
      if (!note && !photos.length && !Object.entries(patch).some(([key, value]) => !['revision', 'updated_at', 'workflow_version'].includes(key) && JSON.stringify(value) !== JSON.stringify(saved[key] ?? null))) fail(400, 'Enter a work update, add a photo, or change a ticket field.');
    }
    if (action === 'start-repair') {
      if (stage !== 'REPORTED') fail(409, 'Only reported issues can start assessment or repair.');
      patch.workflow_stage = 'IN_REPAIR'; patch.repair_started_at = now;
    }
    if (action === 'send-inspection') {
      if (stage !== 'IN_REPAIR') fail(409, 'Start assessment or repair before sending the unit for inspection.');
      patch.workflow_stage = 'AWAITING_INSPECTION'; patch.inspection_requested_at = now; patch.repair_notes = note;
      if (input.repairCost !== undefined) patch.repair_cost = repairCost(input.repairCost);
    }
    if (action === 'inspection-failed') {
      if (stage !== 'AWAITING_INSPECTION') fail(409, 'Only units awaiting inspection can be returned to repair.');
      patch.workflow_stage = 'IN_REPAIR';
      patch.last_failed_inspection = { notes: note, inspected_by: actorId(actor), at: now.toISOString() };
    }
    if (action === 'complete') {
      if (stage !== 'AWAITING_INSPECTION') fail(409, 'Send the repaired unit for inspection before completing maintenance.');
      if (!['GOOD', 'FAIR'].includes(input.condition) || !input.checks || ['functional', 'safe', 'complete'].some(check => input.checks[check] !== true)) fail(400, 'Confirm the function test, safety check and required parts/accessories. Final condition must be Good or Fair.');
      patch.status = 'COMPLETED'; patch.workflow_stage = 'COMPLETED'; patch.completed_at = now; patch.details = note;
      patch.final_inspection = { condition: input.condition, checks: { functional: true, safe: true, complete: true }, notes: note, inspected_by: actorId(actor), inspected_by_name: name, at: now.toISOString() };
    }
    if (action === 'retire') {
      patch.status = 'RETIRED'; patch.workflow_stage = 'RETIRED'; patch.completed_at = now; patch.retired_at = now; patch.retirement_reason = note;
    }
    if ((saved.photos || []).length + photos.length > 6) fail(400, 'This ticket can hold up to six photos.');
    patch.photos = [...saved.photos || [], ...savePhotos(tx, db, id, photos, actor, now)];
    patch.activity = [...saved.activity || [], activity(actor, name, action.toUpperCase().replaceAll('-', '_'), note || (action === 'start-repair' ? 'Assessment or repair started.' : 'Ticket fields updated.'), patch.workflow_stage || stage, now)];
    if (patch.activity.length > 250) fail(400, 'This ticket has reached its update limit. Contact the owner to review the service history.');
    tx.update(ref, patch);
    let itemChanges = null;
    if (!closed) {
      const remaining = open.filter(record => record.id !== id);
      const status = action === 'retire' ? 'RETIRED' : action === 'complete' && !remaining.length ? 'AVAILABLE' : 'UNDER_MAINTENANCE';
      itemChanges = { status, updated_at: now, ...(action === 'complete' && !remaining.length ? { condition_status: input.condition } : {}), ...(action === 'retire' ? { is_active: false, retired_at: now, retirement_reason: note, retired_maintenance_id: id } : {}) };
      tx.update(itemDoc.ref, itemChanges);
      statusHistory(tx, db, actor, item, status, id, now);
      if (action === 'retire') for (const other of remaining) {
        const row = other.data();
        tx.update(other.ref, { status: 'RETIRED', workflow_stage: 'RETIRED', retirement_reason: note, completed_at: now, retired_at: now, updated_at: now, revision: Number(row.revision || 0) + 1, activity: [...row.activity || [], activity(actor, name, 'RETIRED', 'Unit retired through the linked maintenance ticket.', 'RETIRED', now)] });
      }
    }
    stageAudit(tx, db, actorId(actor), `MAINTENANCE_${action.toUpperCase().replaceAll('-', '_')}`, 'MAINTENANCE', id, { before: auditSummary(saved), after: auditSummary({ ...saved, ...patch }), now });
    return { maintenance: serial({ ...saved, ...patch }), item: item ? serial({ ...item, ...itemChanges }) : null, remaining_open_tickets: action === 'complete' ? open.filter(record => record.id !== id).length : 0 };
  });
}

export async function maintenanceDetail(db, id) {
  const doc = await db.collection('maintenance_records').doc(idValue(id)).get();
  if (!doc.exists) fail(404, 'Maintenance ticket not found.');
  const row = docData(doc), itemDoc = await db.collection('items').doc(idValue(row.item_id)).get();
  return { maintenance: serial({ ...row, workflow_stage: maintenanceStage(row), item_name: itemDoc.data()?.name || row.item_name || 'Equipment history', item_code: itemDoc.data()?.item_code || row.item_code || '' }), item: itemDoc.exists ? serial(docData(itemDoc)) : null };
}
export async function maintenanceStaff(db) {
  const snapshot = await db.collection('users').get();
  return { staff: snapshot.docs.filter(doc => doc.data().is_active !== false && isStaffRole(doc.data().role)).map(doc => ({ id: doc.id, full_name: doc.data().full_name || doc.data().name || 'Staff', account_code: doc.data().account_code, role: doc.data().role })).sort((a, b) => a.full_name.localeCompare(b.full_name)) };
}
export async function maintenancePhoto(db, maintenanceId, photoId) {
  idValue(maintenanceId); idValue(photoId);
  const [ticket, photo] = await Promise.all([db.collection('maintenance_records').doc(maintenanceId).get(), db.collection('maintenance_photos').doc(photoId).get()]);
  if (!ticket.exists || !photo.exists || photo.data().maintenance_id !== maintenanceId || !(ticket.data().photos || []).some(row => row.id === photoId)) fail(404, 'This maintenance photo is unavailable.');
  return { image_data: photo.data().image_data, caption: photo.data().caption || '' };
}
