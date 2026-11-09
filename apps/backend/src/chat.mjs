import { createHash } from 'node:crypto';
import { isCustomerRole, isStaffRole } from './roles.mjs';
import { queueChatNotification } from './notifications.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 40);
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const requiredId = value => { if (typeof value !== 'string' || !idPattern.test(value)) fail(400, 'Invalid conversation or rental reference.'); return value; };
const staff = actor => isStaffRole(actor?.role);
function checkActor(actor) {
  if (!actor?.id || actor.is_active === false || (!staff(actor) && !isCustomerRole(actor.role))) fail(403, 'This account cannot access rental support.');
}
function authorize(actor, row) {
  checkActor(actor);
  if (!row || (!staff(actor) && row.customer_id !== actor.id)) fail(404, 'Conversation not found.');
}
function view(row, actor) {
  const team = staff(actor);
  return { ...row, unread_count: Math.max(0, team ? row.customer_count - row.staff_read_count : row.staff_count - row.customer_read_count) };
}
const messageId = (threadId, sequence) => `${threadId}_${String(sequence).padStart(12, '0')}`;
function sequence(value, optional = false) {
  if (optional && (value == null || value === '')) return null;
  if (!/^\d{1,12}$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) fail(400, 'Invalid message cursor.');
  return Number(value);
}
// Stored in the database and committed with the message, so limits survive
// restarts and apply across API instances. A retry does not consume the limit.
function rate(tx, ref, snapshot, now, max) {
  const old = snapshot.exists ? snapshot.data() : {};
  const fresh = !old.window_at || now.getTime() - new Date(old.window_at).getTime() >= 60000;
  if (!fresh && old.count >= max) fail(429, 'Too many messages. Please wait a minute before trying again.');
  tx.set(ref, { window_at: fresh ? now.toISOString() : old.window_at, count: fresh ? 1 : old.count + 1 });
}

export async function openChat(db, actor, input = {}, now = new Date()) {
  checkActor(actor);
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Conversation details are required.');
  if (staff(actor)) fail(403, 'Customers start rental support conversations.');
  const rentalId = input.rentalId == null || input.rentalId === '' ? null : requiredId(input.rentalId);
  const id = `c_${hash(`${actor.id}:${rentalId || 'general'}`)}`;
  const ref = db.collection('chat_threads').doc(id);
  return db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) { authorize(actor, existing.data()); return { thread: view(existing.data(), actor) }; }
    const rental = rentalId ? await tx.get(db.collection('rentals').doc(rentalId)) : null;
    if (rental && (!rental.exists || (rental.data().customer_id || rental.data().customerId) !== actor.id)) fail(404, 'Rental not found.');
    const limitRef = db.collection('chat_limits').doc(`open_${hash(actor.id)}`);
    const limit = await tx.get(limitRef);
    const row = { id, customer_id: actor.id, customer_name: actor.full_name || actor.name || 'Customer',
      rental_id: rentalId, rental_code: rental?.data()?.rental_code || rentalId,
      subject: rental ? `${rental.data().item_name || rental.data().itemName || 'Rental'} inquiry` : 'General rental inquiry',
      status: 'OPEN', last_seq: 0, customer_count: 0, staff_count: 0,
      customer_read_seq: 0, staff_read_seq: 0, customer_read_count: 0, staff_read_count: 0,
      last_message: '', created_at: now.toISOString(), updated_at: now.toISOString(), sort_key: `${now.toISOString()}_${id}` };
    rate(tx, limitRef, limit, now, 5);
    tx.create(ref, row);
    return { thread: view(row, actor) };
  });
}

export async function listChats(db, actor, { before, status } = {}) {
  checkActor(actor);
  let query = db.collection('chat_threads');
  if (!staff(actor)) query = query.where('customer_id', '==', actor.id);
  if (status) { if (!['OPEN', 'RESOLVED'].includes(status)) fail(400, 'Invalid conversation status.'); query = query.where('status', '==', status); }
  if (before) { if (!/^.{24,180}$/.test(before)) fail(400, 'Invalid conversation cursor.'); query = query.where('sort_key', '<', before); }
  const result = await query.orderBy('sort_key', 'desc').limit(31).get();
  const rows = result.docs.slice(0, 30).map(doc => view(doc.data(), actor));
  return { threads: rows, next_cursor: result.docs.length > 30 ? rows.at(-1).sort_key : null };
}

export async function setTyping(db, actor, id, isTyping = true) {
  checkActor(actor);
  requiredId(id);
  const ref = db.collection('chat_threads').doc(id);
  const snapshot = await ref.get();
  const row = snapshot.exists ? snapshot.data() : null;
  authorize(actor, row);
  const team = staff(actor);
  const key = team ? 'staff' : 'customer';
  const raw = (actor.full_name || actor.name || (team ? 'Staff' : 'Customer')).trim();
  const name = team ? `${raw.split(/\s+/)[0]} (Staff)` : raw;
  await ref.update({ [`${key}_typing`]: isTyping ? { name, at: Date.now() } : null });
  return { ok: true };
}

export async function getTyping(db, actor, id) {
  checkActor(actor);
  requiredId(id);
  const snapshot = await db.collection('chat_threads').doc(id).get();
  const row = snapshot.exists ? snapshot.data() : null;
  authorize(actor, row);
  const now = Date.now();
  const team = staff(actor);
  const otherKey = team ? 'customer' : 'staff';
  const target = row[`${otherKey}_typing`];
  if (target && now - target.at < 5000) {
    return { is_typing: true, name: target.name, role: otherKey.toUpperCase() };
  }
  return null;
}

export async function chatMessages(db, actor, id, options = {}) {
  const ref = db.collection('chat_threads').doc(requiredId(id));
  const snapshot = await ref.get(), row = snapshot.exists ? snapshot.data() : null;
  authorize(actor, row);
  const before = sequence(options.before, true), after = sequence(options.after, true);
  if (before && after) fail(400, 'Use one message cursor at a time.');
  let query = db.collection('chat_messages').where('thread_id', '==', id);
  if (before) query = query.where('seq', '<', before);
  if (after) query = query.where('seq', '>', after);
  const result = await query.orderBy('seq', after ? 'asc' : 'desc').limit(51).get();
  let rows = result.docs.slice(0, 50).map(doc => doc.data());
  if (!after) rows.reverse();
  return { thread: view(row, actor), messages: rows, has_more: result.docs.length > 50,
    next_cursor: result.docs.length > 50 ? String(after ? rows.at(-1).seq : rows[0].seq) : null,
    typing: await getTyping(db, actor, id) };
}

export async function sendChatMessage(db, actor, id, input, now = new Date()) {
  checkActor(actor); requiredId(id);
  if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.trim().length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.text)) fail(400, 'Enter a message between 1 and 2,000 characters.');
  if (typeof input.requestKey !== 'string' || !/^[a-f0-9]{32}$/.test(input.requestKey)) fail(400, 'A valid message retry key is required.');
  const text = input.text.trim(), team = staff(actor);
  const ref = db.collection('chat_threads').doc(id);
  const operation = db.collection('chat_operations').doc(hash(`${actor.id}:${input.requestKey}`));
  const result = await db.runTransaction(async tx => {
    const thread = await tx.get(ref), old = thread.exists ? thread.data() : null;
    authorize(actor, old);
    const previous = await tx.get(operation);
    if (previous.exists) {
      const value = previous.data();
      if (value.thread_id !== id || value.text_hash !== hash(text)) fail(409, 'This retry key was already used for another message.');
      const saved = await tx.get(db.collection('chat_messages').doc(value.message_id));
      return { message: saved.data(), thread: view(old, actor), duplicate: true };
    }
    const limitRef = db.collection('chat_limits').doc(`send_${hash(actor.id)}`);
    const limit = await tx.get(limitRef);
    if (team && old.status === 'RESOLVED') fail(409, 'Reopen this conversation before replying.');
    const seq = old.last_seq + 1, msgId = messageId(id, seq);
    const row = { ...old, [`${team ? 'staff' : 'customer'}_typing`]: null,
      last_seq: seq, customer_count: old.customer_count + (team ? 0 : 1), staff_count: old.staff_count + (team ? 1 : 0),
      status: 'OPEN', resolved_at: null, resolved_by: null, last_message: text, updated_at: now.toISOString(), sort_key: `${now.toISOString()}_${id}` };
    const message = { id: msgId, thread_id: id, seq, sender_id: actor.id,
      sender_role: team ? 'STAFF' : 'CUSTOMER', sender_name: team ? actor.full_name || actor.name || 'Rental support' : row.customer_name,
      text, created_at: now.toISOString(), customer_count: row.customer_count, staff_count: row.staff_count, request_key: input.requestKey };
    rate(tx, limitRef, limit, now, team ? 60 : 20);
    tx.create(db.collection('chat_messages').doc(msgId), message);
    tx.create(operation, { thread_id: id, message_id: msgId, text_hash: hash(text) });
    tx.update(ref, row);
    queueChatNotification(tx, db, row, message, now);
    return { message, thread: view(row, actor), duplicate: false };
  });
  return result;
}

export async function readChat(db, actor, id, input) {
  requiredId(id); const through = sequence(input?.through);
  const ref = db.collection('chat_threads').doc(id);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref), row = snapshot.exists ? snapshot.data() : null;
    authorize(actor, row);
    if (through > row.last_seq) fail(400, 'Cannot mark unseen messages as read.');
    const prefix = staff(actor) ? 'staff' : 'customer';
    if (through <= row[`${prefix}_read_seq`]) return { thread: view(row, actor) };
    const message = await tx.get(db.collection('chat_messages').doc(messageId(id, through)));
    if (!message.exists) fail(400, 'Message not found.');
    const next = { ...row, [`${prefix}_read_seq`]: through, [`${prefix}_read_count`]: message.data()[staff(actor) ? 'customer_count' : 'staff_count'] };
    tx.update(ref, next);
    return { thread: view(next, actor) };
  });
}

export async function setChatStatus(db, actor, id, input, now = new Date()) {
  requiredId(id); checkActor(actor);
  if (!staff(actor)) fail(403, 'Only staff can resolve or reopen a conversation.');
  if (!['OPEN', 'RESOLVED'].includes(input?.status)) fail(400, 'Choose open or resolved.');
  const ref = db.collection('chat_threads').doc(id);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref), row = snapshot.exists ? snapshot.data() : null;
    authorize(actor, row);
    const next = { ...row, status: input.status, resolved_at: input.status === 'RESOLVED' ? now.toISOString() : null, resolved_by: input.status === 'RESOLVED' ? actor.id : null };
    tx.update(ref, next);
    return { thread: view(next, actor) };
  });
}

export async function uploadChatAttachment(db, actor, id, dataUrl) {
  checkActor(actor);
  requiredId(id);
  const snapshot = await db.collection('chat_threads').doc(id).get();
  const row = snapshot.exists ? snapshot.data() : null;
  authorize(actor, row);
  return db.uploadChatAttachment(actor.id, id, dataUrl);
}
