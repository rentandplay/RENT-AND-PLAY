// Public references are saved separately from Firestore document IDs and QR
// tokens. Every client receives the same reference; existing links stay valid.
export const recordTypes = Object.freeze({
  rentals: { field: 'rental_code', prefix: 'R', digits: 4, counter: 'rental_codes_R' },
  verification_requests: { field: 'request_code', prefix: 'V', digits: 4 },
  maintenance_records: { field: 'maintenance_code', prefix: 'M', digits: 4 },
  audit_logs: { field: 'audit_code', prefix: 'A', digits: 4 },
  item_rates: { field: 'rate_code', prefix: 'RATE', digits: 3 },
  item_categories: { field: 'category_code', prefix: 'CAT', digits: 3 },
  item_condition_records: { field: 'condition_code', prefix: 'COND', digits: 4 },
  item_status_history: { field: 'history_code', prefix: 'HIST', digits: 4 },
  users: { field: 'account_code', prefix: 'USER', digits: 3 },
  customers: { field: 'customer_code', prefix: 'CUST', digits: 3, counter: 'customer_codes_CUST', preserve: true },
  items: { field: 'item_code', prefix: 'EQUIP', digits: 3, counter: 'item_codes_EQUIP', preserve: true },
  terminals: { field: 'terminal_code', prefix: 'TERM', digits: 3, preserve: true }
});

const definition = collection => {
  const type = recordTypes[collection];
  if (!type) throw new Error('Unknown record reference type.');
  return type;
};
const sequenceOf = (value, type) => {
  const match = new RegExp(`^${type.prefix}-(\\d{1,9})$`, 'i').exec(String(value || ''));
  const sequence = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 0;
};
const usable = (value, type) => Boolean(sequenceOf(value, type)) || type.preserve && typeof value === 'string' && /^[A-Z0-9][A-Z0-9_-]{0,15}$/i.test(value) && !/^[a-f0-9]{10,}$/i.test(value) && !/^(booking|rental|record)_/i.test(value);

// Read every required counter before staging writes, including when a request
// needs both a rental reference and a verification reference in one transaction.
export async function allocateRecordCodes(tx, db, collections, now = new Date()) {
  const plans = [];
  for (const collection of new Set(collections)) {
    const type = definition(collection), ref = db.collection('counters').doc(type.counter || `record_codes_${type.prefix}`);
    const counter = await tx.get(ref);
    let highest = 0;
    if (!counter.exists) {
      const existing = await tx.get(db.collection(collection));
      highest = existing.docs.reduce((max, doc) => Math.max(max, sequenceOf(doc.data()?.[type.field], type), sequenceOf(doc.data()?.[`legacy_${type.field}`], type)), 0);
    }
    const stored = Number(counter.data()?.next_sequence);
    plans.push({ collection, type, ref, next: Math.max(Number.isSafeInteger(stored) && stored > 0 ? stored : 1, highest + 1) });
  }
  const result = collections.map(collection => {
    const plan = plans.find(row => row.collection === collection);
    if (!Number.isSafeInteger(plan.next) || plan.next > 999999999) throw new Error('Record reference sequence is exhausted.');
    return `${plan.type.prefix}-${String(plan.next++).padStart(plan.type.digits, '0')}`;
  });
  for (const plan of plans) tx.set(plan.ref, { next_sequence: plan.next, updated_at: now }, { merge: true });
  return result;
}

export function createRecordCodeService(db, { now = () => new Date(), onWrite = () => {} } = {}) {
  const queues = new Map();
  async function ensureMany(collection, records) {
    if (!recordTypes[collection]) return records;
    const type = definition(collection), missing = records.filter(row => row?.id && !usable(row[type.field], type));
    if (!missing.length) return records;
    const task = (queues.get(collection) || Promise.resolve()).catch(() => {}).then(async () => {
      const patches = new Map();
      for (let start = 0; start < missing.length; start += 50) {
        const batch = [...new Map(missing.slice(start, start + 50).map(row => [String(row.id), row])).values()];
        const changed = await db.runTransaction(async tx => {
          const docs = await Promise.all(batch.map(row => tx.get(db.collection(collection).doc(String(row.id)))));
          const pending = docs.filter(doc => doc.exists && !usable(doc.data()[type.field], type));
          const codes = pending.length ? await allocateRecordCodes(tx, db, pending.map(() => collection), now()) : [];
          const updates = new Map();
          pending.forEach((doc, index) => {
            const saved = doc.data(), patch = { [type.field]: codes[index], ...(saved[type.field] && !saved[`legacy_${type.field}`] ? { [`legacy_${type.field}`]: saved[type.field] } : {}) };
            tx.update(doc.ref, patch); updates.set(doc.id, patch);
          });
          for (const doc of docs.filter(doc => doc.exists && usable(doc.data()[type.field], type))) updates.set(doc.id, { [type.field]: doc.data()[type.field] });
          return { updates, writes: pending.length };
        });
        for (const [id, patch] of changed.updates) patches.set(id, patch);
        if (changed.writes) onWrite(collection);
      }
      return records.map(row => ({ ...row, ...(patches.get(String(row?.id)) || {}) }));
    });
    queues.set(collection, task);
    try { return await task; } finally { if (queues.get(collection) === task) queues.delete(collection); }
  }
  const ensure = async (collection, row) => (await ensureMany(collection, [row]))[0];
  const kinds = { staff: 'users', items: 'items', item: 'items', customers: 'customers', customer: 'customers', users: 'users', user: 'users', transactions: 'rentals', rentals: 'rentals', rental: 'rentals', verification: 'verification_requests', request: 'verification_requests', pending: 'verification_requests', maintenance: 'maintenance_records', rates: 'item_rates', rate: 'item_rates', categories: 'item_categories', units: 'items', terminals: 'terminals', terminal: 'terminals', auditLogs: 'audit_logs', conditionRecords: 'item_condition_records', release_condition: 'item_condition_records', return_condition: 'item_condition_records', statusHistory: 'item_status_history', history: 'item_status_history' };
  async function enrich(value, collection = null, related = new Map()) {
    if (Array.isArray(value)) {
      const rows = collection ? await ensureMany(collection, value) : value;
      if (collection) for (const row of rows) if (row?.id) related.set(`${collection}/${row.id}`, Promise.resolve(row));
      return Promise.all(rows.map(row => enrich(row, collection, related)));
    }
    if (!value || typeof value !== 'object' || value instanceof Date || typeof value.toDate === 'function') return value;
    let result = collection ? await ensure(collection, value) : { ...value };
    if (collection && result.id) related.set(`${collection}/${result.id}`, Promise.resolve(result));
    const reference = async (type, id) => {
      if (!id) return null;
      const key = `${type}/${id}`;
      if (!related.has(key)) related.set(key, db.collection(type).doc(String(id)).get().then(doc => doc.exists ? ensure(type, { id: doc.id, ...doc.data() }) : null));
      return related.get(key);
    };
    for (const [key, type] of Object.entries(kinds)) if (result[key]) result[key] = await enrich(result[key], type, related);
    for (const key of ['inspection', 'delivery_preparation']) if (result[key]) result[key] = await enrich(result[key], null, related);
    for (const field of ['inspected_by', 'prepared_by', 'confirmed_rental_by', 'received_by', 'confirmed_return_by']) if (result[field]) {
      const account = await reference('users', result[field]);
      if (account) result[`${field}_account_code`] = account.account_code;
    }
    if (result.rental_id) {
      const rental = await reference('rentals', result.rental_id);
      if (rental) result.rental_code = rental.rental_code;
    }
    if (result.terminal_id || result.terminalId) {
      const terminal = await reference('terminals', result.terminal_id || result.terminalId);
      if (terminal) result.terminal_code = terminal.terminal_code;
    }
    if (result.confirmed_terminal_id) {
      const terminal = await reference('terminals', result.confirmed_terminal_id);
      if (terminal) result.confirmed_terminal_code = terminal.terminal_code;
    }
    // A ticket and a notification identify rentals through rental_id, not id.
    if (result.ticket?.rental_id) {
      const rental = await reference('rentals', result.ticket.rental_id);
      if (rental) result.ticket = { ...result.ticket, rental_code: rental.rental_code };
    }
    if (Array.isArray(result.notifications)) result.notifications = await Promise.all(result.notifications.map(async entry => {
      const rental = await reference('rentals', entry.rental_id);
      return { ...entry, ...(rental ? { rental_code: rental.rental_code } : {}), title: String(entry.title || '').replace(/\bbooking\b/gi, 'rental request'), message: String(entry.message || '').replace(/\bbooking\b/gi, 'rental request') };
    }));
    return result;
  }
  return { ensure, ensureMany, enrich };
}
