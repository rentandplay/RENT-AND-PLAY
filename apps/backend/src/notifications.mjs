import { createHash, randomBytes } from 'node:crypto';
import { asDate } from './firebase.mjs';
import { isCustomerRole, isStaffRole } from './roles.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const hash = value => createHash('sha256').update(value).digest('hex');
const staff = actor => isStaffRole(actor.role);
const actorId = actor => String(actor.id || actor.uid);
const readRevisionField = actor => `read_revision_${hash(actorId(actor)).slice(0, 24)}`;
const inboxKey = actor => {
  if (staff(actor)) return 'staff';
  if (isCustomerRole(actor.role)) return `customer_${actorId(actor)}`;
  fail(403, 'This account role cannot access rental notifications.');
};
const messages = (db, key) => db.collection(`notification_inboxes/${key}/messages`);
const validId = id => typeof id === 'string' && /^n_[a-f0-9]{40}$/.test(id);
const iso = value => value && asDate(value)?.toISOString() || null;

function content(type, rental, reason) {
  const item = rental.item_name || rental.itemName || 'Equipment';
  const customer = rental.customer_name || rental.customerName || 'A customer';
  const location = rental.delivery_location ? ` Location: ${rental.delivery_location}.` : '';
  const extra = reason ? ` Reason: ${reason}` : '';
  return ({
    BOOKING_REQUESTED: ['New rental request', rental.payment_method === 'QR'
      ? `${customer} requested ${item} and uploaded an InstaPay screenshot.${location} Review the payment proof and rental request.`
      : `${customer} requested ${item}.${location} Review the rental request.`],
    BOOKING_APPROVED: ['Rental request approved', `Your rental request for ${item} is approved. Keep your rental handoff QR ready. The timer starts when the equipment reaches you.`],
    BOOKING_REJECTED: ['Rental request rejected', `Your rental request for ${item} was rejected.${extra} The equipment reservation has been released.`],
    BOOKING_CANCELLED: ['Customer cancelled a rental request', `${customer} cancelled the rental request for ${item}. The equipment reservation has been released.`],
    BOOKING_EXPIRED: ['Rental request expired', `The handoff hold for ${item} expired. Send a new rental request if you still need the equipment.`],
    PAYMENT_PROOF_SUBMITTED: ['Payment proof submitted', `${customer} uploaded QR payment proof for ${item}. Review the screenshot before approving the rental request.`],
    PAYMENT_PROOF_REJECTED: ['Payment proof needs attention', `The QR payment proof for ${item} could not be verified.${extra} Upload a clear, successful transfer screenshot or contact the owner.`],
    DELIVERY_PREPARED: ['Equipment ready for delivery', `${item} was verified at the shop and marked ready for delivery.${location}`],
    RENTAL_RELEASED: ['Rental started', `${item} has been handed over to you. Your rental timer is now running. Check your rental details for the return time.`],
    RETURN_REQUESTED: ['New return request', `${customer} requested to return ${item}. Arrange collection or receive the equipment at the desk. The timer stops at physical receipt.`],
    RETURN_REQUEST_REJECTED: ['Return request rejected', `Your return request for ${item} was rejected.${extra} The rental remains active until the admin physically receives the equipment.`],
    RETURN_RECEIVED: ['Equipment received', `The admin received ${item}. Your rental timer has stopped. Inspection is still pending.`],
    RETURN_COMPLETED: ['Return confirmed', `The return of ${item} is confirmed after inspection. Check your rental details for any balance or deposit refund.`],
  })[type];
}

// Inbox entries and their push outbox are written in the same transaction as
// the rental change. Failed changes cannot notify; retry keys cannot duplicate.
export function queueRentalNotification(tx, db, rental, type, now, { audience = 'CUSTOMER', reason = '', revision = 0 } = {}) {
  const customerId = rental.customer_id || rental.customerId;
  if (audience === 'CUSTOMER' && !customerId) return;
  const key = audience === 'STAFF' ? 'staff' : `customer_${customerId}`;
  const id = `n_${hash(`${key}:${rental.id}:${type}:${revision}`).slice(0, 40)}`;
  const [title, message] = content(type, rental, reason);
  const notification = { type, title, message, rental_id: rental.id, rental_code: rental.rental_code || rental.id,
    item_name: rental.item_name || rental.itemName || 'Equipment', created_at: now, read_by: {},
    page: type.startsWith('RETURN_') ? 'Returns' : 'Rentals' };
  tx.create(messages(db, key).doc(id), notification);
  tx.set(db.collection('notification_inboxes').doc(key), { revision: randomBytes(16).toString('hex') }, { merge: true });
  tx.create(db.collection('notification_outbox').doc(id), { notification_id: id, inbox_key: key,
    audience, customer_id: audience === 'CUSTOMER' ? String(customerId) : null,
    title, message, rental_id: rental.id, type, status: 'PENDING', attempts: 0,
    created_at: now, next_attempt_at: now, lease_until: null });
}

export async function listNotifications(db, actor, { before, since } = {}) {
  const key = inboxKey(actor), collection = messages(db, key);
  const header = await db.collection('notification_inboxes').doc(key).get();
  const headerData = header.exists ? header.data() : {};
  const revision = hash(`${key}:${headerData.revision || 'empty'}:${headerData[readRevisionField(actor)] || 'unread'}`).slice(0, 32);
  if (!before && since === revision) return { unchanged: true, revision };
  let query = collection.orderBy('created_at', 'desc');
  if (before) {
    if (!validId(before)) fail(400, 'Choose a valid notification cursor.');
    const cursor = await collection.doc(before).get();
    if (!cursor.exists) fail(404, 'Notification not found.');
    query = query.startAfter(cursor);
  }
  const snapshot = await query.limit(61).get();
  const page = snapshot.docs.slice(0, 60).map(doc => {
    const row = doc.data();
    return { id: doc.id, type: row.type, title: row.title, message: row.message, rental_id: row.rental_id,
      rental_code: row.rental_code, item_name: row.item_name, page: row.page,
      created_at: iso(row.created_at), read_at: iso(row.read_by?.[actorId(actor)]), is_read: Boolean(row.read_by?.[actorId(actor)]) };
  });
  return { revision, notifications: page, unread_count: page.filter(row => !row.is_read).length,
    audience: staff(actor) ? 'STAFF' : 'CUSTOMER', next_cursor: snapshot.docs.length > 60 ? page.at(-1).id : null };
}

export async function markNotificationsRead(db, actor, input, now = new Date()) {
  if (!Array.isArray(input?.ids) || input.ids.length > 60 || !input.ids.every(validId)) fail(400, 'Choose up to 60 valid notifications.');
  const ids = [...new Set(input.ids)], collection = messages(db, inboxKey(actor));
  await db.runTransaction(async tx => {
    const docs = await Promise.all(ids.map(id => tx.get(collection.doc(id))));
    if (docs.some(doc => !doc.exists)) fail(404, 'Notification not found.');
    let changed = false;
    for (const doc of docs) {
      const read = doc.data().read_by || {};
      if (!read[actorId(actor)]) { tx.update(doc.ref, { read_by: { ...read, [actorId(actor)]: now } }); changed = true; }
    }
    if (changed) tx.set(db.collection('notification_inboxes').doc(inboxKey(actor)), {
      [readRevisionField(actor)]: randomBytes(16).toString('hex')
    }, { merge: true });
  });
  return { ok: true, ids };
}

function deviceToken(input) {
  const token = input?.token;
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || /\s/.test(token)) fail(400, 'Enter a valid notification device token.');
  return token;
}

export async function registerNotificationDevice(db, actor, input, now = new Date()) {
  if (!staff(actor) && !isCustomerRole(actor.role)) fail(403, 'This account role cannot register notification devices.');
  const token = deviceToken(input), ref = db.collection('notification_devices').doc(hash(token));
  await ref.set({ token, user_id: actorId(actor), audience: staff(actor) ? 'STAFF' : 'CUSTOMER', platform: 'ANDROID', updated_at: now });
  return { ok: true };
}

export async function unregisterNotificationDevice(db, actor, input) {
  const token = deviceToken(input), ref = db.collection('notification_devices').doc(hash(token));
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (doc.exists && doc.data().user_id === actorId(actor)) tx.delete(ref);
  });
  return { ok: true };
}

// A short lease prevents overlapping workers from sending the same event.
// Push delivery is best effort; the durable inbox is always the source of truth.
export function createNotificationDispatcher(db, messaging, { now = () => new Date(), ownerUid = '', deviceDb = db, profileDb = db, onDevicesChanged = () => {} } = {}) {
  let running = null;
  async function drain() {
    const pending = await db.collection('notification_outbox').where('status', '==', 'PENDING').limit(40).get();
    const candidates = [...pending.docs];
    if (candidates.length < 40) {
      const retries = await db.collection('notification_outbox').where('status', '==', 'RETRY').limit(40 - candidates.length).get();
      candidates.push(...retries.docs);
    }
    for (const candidate of candidates) {
      const leasedAt = now();
      const event = await db.runTransaction(async tx => {
        const doc = await tx.get(candidate.ref), row = doc.exists && doc.data();
        if (!row || !['PENDING', 'RETRY'].includes(row.status) || asDate(row.next_attempt_at) > leasedAt || asDate(row.lease_until) > leasedAt) return null;
        tx.update(doc.ref, { lease_until: new Date(leasedAt.getTime() + 120000), attempts: row.attempts + 1 });
        return { ...row, attempts: row.attempts + 1 };
      });
      if (!event) continue;
      try {
        const devices = await deviceDb.collection('notification_devices').where(event.audience === 'STAFF' ? 'audience' : 'user_id', '==', event.audience === 'STAFF' ? 'STAFF' : event.customer_id).get();
        const profiles = new Map(await Promise.all([...new Set(devices.docs.map(doc => doc.data().user_id))].map(async id => [id, await profileDb.collection('users').doc(id).get()])));
        const allowed = devices.docs.filter(doc => {
          const device = doc.data(), profile = profiles.get(device.user_id), role = profile?.exists && profile.data().role;
          return profile?.exists && profile.data().is_active !== false && (event.audience === 'STAFF'
            ? device.audience === 'STAFF' && (isStaffRole(role) || String(device.user_id) === String(ownerUid))
            : device.audience === 'CUSTOMER' && device.user_id === event.customer_id && isCustomerRole(role));
        });
        for (let offset = 0; offset < allowed.length; offset += 500) {
          const batch = allowed.slice(offset, offset + 500);
          const response = await messaging.sendEachForMulticast({ tokens: batch.map(doc => doc.data().token),
            notification: { title: event.title, body: event.message.slice(0, 240) },
            data: { notification_id: event.notification_id, rental_id: event.rental_id, type: event.type, audience: event.audience, recipient_id: event.customer_id || '' },
            android: { priority: 'high', notification: { channelId: 'rental_updates', icon: 'ic_notification', sound: 'default', tag: event.notification_id } } });
          const invalid = response.responses.flatMap((result, index) => ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(result.error?.code) ? [batch[index]] : []);
          if (invalid.length) { const writer = db.batch(); invalid.forEach(doc => writer.delete(doc.ref)); await writer.commit(); onDevicesChanged(); }
          const retryable = response.responses.find(result => !result.success && !['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(result.error?.code));
          if (retryable) throw retryable.error;
        }
        await candidate.ref.update({ status: 'SENT', delivered_at: now(), lease_until: null, last_error: null });
      } catch (error) {
        await candidate.ref.update({ status: event.attempts >= 6 ? 'FAILED' : 'RETRY', lease_until: null,
          next_attempt_at: new Date(now().getTime() + Math.min(900000, 15000 * 2 ** (event.attempts - 1))), last_error: String(error.code || 'PUSH_UNAVAILABLE').slice(0, 100) });
      }
    }
  }
  return { run() { if (!running) running = drain().finally(() => { running = null; }); return running; } };
}
