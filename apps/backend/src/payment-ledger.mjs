import { createHash } from 'node:crypto';
import { asDate, docData } from './firebase.mjs';
import { allocateRecordCodes } from './record-codes.mjs';
import { dateRange, pageLimit, validDay, validDocumentId } from './query-validation.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const businessDay = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const round = value => Math.round(value * 100) / 100;
const amount = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 9999999999.99 && Math.abs(value * 100 - Math.round(value * 100)) < .0001;
const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const serializeLedger = value => value instanceof Date || typeof value?.toDate === 'function' ? asDate(value).toISOString() : Array.isArray(value) ? value.map(serializeLedger) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeLedger(child)])) : value;

// Read before domain writes, then commit alongside the rental transition.
// Deterministic keys make a lost HTTP response safe to retry.
export async function planLedgerEntry(tx, db, actor, rental, { key, type = 'COLLECTION', amount: value, method, reference = '', notes = '', category = '', source = '', occurredAt = null }, now) {
  if (!value) return () => {};
  if (!amount(value) || !['COLLECTION','REFUND','EXPENSE','EXPENSE_REVERSAL'].includes(type)) fail(400, 'Enter a positive amount with at most two decimal places.');
  method = String(method || rental?.payment_method || 'CASH').toUpperCase();
  if (!['CASH','QR'].includes(method)) fail(400, 'Choose cash received in person or QR payment.');
  const occurred = occurredAt || now;
  const id = createHash('sha256').update(key).digest('hex'), ledgerRef = db.collection('payment_ledger').doc(id), day = businessDay(occurred), dailyRef = db.collection('financial_daily').doc(day);
  const coverageRef = rental?.id ? db.collection('rental_payment_totals').doc(rental.id) : null;
  const [existing, daily, coverage] = await Promise.all([tx.get(ledgerRef), tx.get(dailyRef), coverageRef ? tx.get(coverageRef) : null]);
  const fingerprint = JSON.stringify([type,value,method,text(reference),text(notes),category,source,rental?.id || null,...(occurredAt ? [occurredAt.toISOString()] : [])]);
  if (existing.exists) { if (existing.data().fingerprint !== fingerprint) fail(409, 'This payment key already belongs to a different entry.'); return () => {}; }
  const [ledgerCode]=await allocateRecordCodes(tx,db,['payment_ledger'],now);
  const row = { ledger_code: ledgerCode, type, amount: value, payment_method: method, reference: text(reference, 150) || null, notes: text(notes) || null, category: category || null, source, rental_id: rental?.id || null, rental_code: rental?.rental_code || null, customer_name: rental?.customer_name || null, recorded_by: String(actor.id || actor), recorded_by_name: actor.full_name || actor.name || null, business_day: day, occurred_at: occurred, recorded_at: now, fingerprint };
  const totals = daily.exists ? daily.data() : { collections: 0, refunds: 0, expenses: 0, cash_collections: 0, qr_collections: 0, cash_refunds: 0, qr_refunds: 0, cash_expenses: 0, qr_expenses: 0, entry_count: 0 };
  const metric = type === 'COLLECTION' ? 'collections' : type === 'REFUND' ? 'refunds' : 'expenses', delta = type === 'EXPENSE_REVERSAL' ? -value : value;
  totals[metric] = round(Number(totals[metric] || 0) + delta);
  const methodMetric = `${method.toLowerCase()}_${metric}`;
  totals[methodMetric] = round(Number(totals[methodMetric] || 0) + delta);
  return () => {
    tx.create(ledgerRef, row); tx.set(dailyRef, { ...totals, business_day: day, entry_count: Number(totals.entry_count || 0) + 1, updated_at: now });
    if (coverageRef && ['COLLECTION','REFUND'].includes(type)) {
      const prior = coverage?.exists ? coverage.data() : {};
      tx.set(coverageRef, { ...prior, [metric]: round(Number(prior[metric] || 0) + value), updated_at: now });
    }
  };
}

export async function createExpense(db, actor, input, now = new Date()) {
  if (!input || !/^[a-f0-9]{32}$/.test(input.requestKey || '') || !amount(input.amount)) fail(400, 'A valid expense amount and request key are required.');
  const category = String(input.category || 'OTHER').toUpperCase(), notes = text(input.notes);
  if (!['DELIVERY','MAINTENANCE','SUPPLIES','UTILITIES','OTHER'].includes(category) || !notes) fail(400, 'Choose an expense category and describe the expense.');
  const method = String(input.paymentMethod || 'CASH').toUpperCase();
  if (method === 'QR' && !text(input.reference)) fail(400, 'Enter the transfer reference for a QR expense.');
  return db.runTransaction(async tx => {
    const commit = await planLedgerEntry(tx, db, actor, null, { key: `expense:${actor.id}:${input.requestKey}`, type: 'EXPENSE', amount: input.amount, method, category, reference: input.reference, notes, source: 'MANUAL_EXPENSE' }, now);
    commit(); return { ok: true };
  });
}

export async function financeSummary(db, { from, to } = {}, now = new Date()) {
  from ||= businessDay(new Date(now.getTime() - 29 * 86400000)); to ||= businessDay(now);
  dateRange(from,to);
  const days = []; for (let at = Date.parse(from); at <= Date.parse(to); at += 86400000) days.push(new Date(at).toISOString().slice(0,10));
  const snapshot=await db.collection('financial_daily').where('business_day','>=',from).where('business_day','<=',to).get();
  const byDay=new Map(snapshot.docs.map(doc=>[doc.id,doc.data()]));
  const daily = days.map(day=>({business_day:day,...(byDay.get(day)||{})}));
  const keys = ['collections','refunds','expenses','cash_collections','qr_collections','cash_refunds','qr_refunds','cash_expenses','qr_expenses'];
  const totals = Object.fromEntries(keys.map(key => [key, round(daily.reduce((sum, row) => sum + Number(row[key] || 0),0))]));
  totals.net_collected = round(totals.collections - totals.refunds); totals.net_after_expenses = round(totals.net_collected - totals.expenses);
  totals.cash_net_movement = round(totals.cash_collections - totals.cash_refunds - totals.cash_expenses);
  const rentalDays = await db.collection('rental_financial_daily').where('business_day','>=',from).where('business_day','<=',to).get();
  const rentalKeys = ['rentals','charges','saved_paid','saved_refunded','balance_due','refund_due','unposted_paid','unposted_count','unknown_payments','unknown_charges'];
  const rentalTotals = Object.fromEntries(rentalKeys.map(key => [key, round(rentalDays.docs.reduce((sum, doc) => sum + Number(doc.data()[key] || 0), 0))]));
  return serializeLedger({ from, to, daily, totals, rental_totals: rentalTotals, basis: 'Receipt totals use the date money was received. Rental balances and saved payments use rentals created in the selected period. Saved payments without a receipt date appear in rental payments until their original receipt is confirmed.' });
}

export async function ledgerPage(db, options = {}) {
  const limit = pageLimit(options.limit);
  dateRange(options.from,options.to);
  if(options.day && !validDay(options.day))fail(400,'Choose a valid receipt day.');
  if(options.type && !['COLLECTION','REFUND','EXPENSE','EXPENSE_REVERSAL'].includes(options.type))fail(400,'Choose a valid ledger entry type.');
  if(options.method && !['CASH','QR'].includes(options.method))fail(400,'Choose a valid payment method.');
  if(options.rentalId && !validDocumentId(options.rentalId))fail(400,'Choose a valid rental.');
  let query = db.collection('payment_ledger');
  for (const [param, field] of [['type','type'],['method','payment_method'],['rentalId','rental_id'],['day','business_day']]) if (options[param]) query = query.where(field, '==', String(options[param]));
  if(options.from)query=query.where('occurred_at','>=',new Date(options.from+'T00:00:00+08:00'));
  if(options.to)query=query.where('occurred_at','<',new Date(Date.parse(options.to+'T00:00:00+08:00')+86400000));
  query = query.orderBy('occurred_at','desc');
  if (options.cursor) {
    if(!validDocumentId(options.cursor))fail(400,'Invalid ledger cursor.');
    const doc = await db.collection('payment_ledger').doc(options.cursor).get();
    if (!doc.exists) fail(400, 'Invalid ledger cursor.');
    const row=doc.data(),day=businessDay(asDate(row.occurred_at));
    if(options.type && row.type!==options.type || options.method && row.payment_method!==options.method || options.rentalId && row.rental_id!==options.rentalId || options.day && row.business_day!==options.day || options.from && day<options.from || options.to && day>options.to)fail(400,'Refresh the ledger after changing its filters.');
    query = query.startAfter(doc);
  }
  const result = await query.limit(limit + 1).get();
  const selected = result.docs.slice(0,limit);
  return serializeLedger({ entries: selected.map(doc => { const { fingerprint, ...row } = docData(doc); return row; }), nextCursor: result.size > limit ? selected.at(-1).id : null });
}
