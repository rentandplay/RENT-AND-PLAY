import { asDate, docData } from './firebase.mjs';
import { loadPricing, savePricing as persistPricing } from './pricing.mjs';
import { publicTerminal, serializeTransaction } from './transactions.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const rows = snapshot => snapshot.docs.map(docData);
const clean = (value, max = 255) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const serial = serializeTransaction;

export function validateCustomer(input = {}) {
  const full_name = clean(input.fullName, 150), customer_code = clean(input.code, 50).toUpperCase(), email = clean(input.email, 191).toLowerCase(), phone = clean(input.phone, 40), address = clean(input.address, 500);
  if (full_name.length < 2) fail(400, 'Enter the customer’s full name.');
  if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(customer_code)) fail(400, 'Customer code must use letters, numbers, dashes, or underscores.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid customer email.');
  return { full_name, customer_code, email: email || null, phone: phone || null, address: address || null };
}

export async function loadWorkspace(db, role = 'ADMIN', now = new Date()) {
  const names = ['customers', 'rentals', 'items', 'item_categories', 'item_rates', 'maintenance_records', 'terminals', 'verification_requests', 'item_status_history', 'item_condition_records'];
  const snapshots = await Promise.all(names.map(name => db.collection(name).get()));
  const source = Object.fromEntries(names.map((name, index) => [name, rows(snapshots[index])]));
  const itemMap = new Map(source.items.map(item => [item.id, item]));
  const customerMap = new Map(source.customers.map(customer => [customer.id, customer]));
  const transactions = source.rentals.map(rental => ({ ...rental, item_name: itemMap.get(String(rental.item_id))?.name || 'Unknown equipment', item_code: itemMap.get(String(rental.item_id))?.item_code || '', customer_name: customerMap.get(String(rental.customer_id))?.full_name || 'Unknown customer' })).sort((a, b) => (asDate(b.created_at) || 0) - (asDate(a.created_at) || 0));
  const maintenance = source.maintenance_records.map(record => ({ ...record, item_name: itemMap.get(String(record.item_id))?.name || 'Unknown equipment', item_code: itemMap.get(String(record.item_id))?.item_code || '' })).sort((a, b) => (asDate(b.started_at) || 0) - (asDate(a.started_at) || 0));
  const rates = source.item_rates.map(rate => ({ ...rate, item_name: itemMap.get(String(rate.item_id))?.name || 'Unknown equipment', item_code: itemMap.get(String(rate.item_id))?.item_code || '' })).sort((a, b) => (asDate(b.effective_from) || 0) - (asDate(a.effective_from) || 0));
  const [settingsDoc, pricing] = await Promise.all([db.collection('settings').doc('business').get(), loadPricing(db, { allowInvalidFallback: true })]);
  const settings = settingsDoc.exists ? settingsDoc.data() : { business_name: 'Rent & Play', location: 'Los Baños, Laguna', currency: 'PHP', timezone: 'Asia/Manila', default_late_grace_hours: 0 };
  let users = [];
  if (role === 'ADMIN') users = rows(await db.collection('users').get()).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')).map(serial);
  const statusHistory = source.item_status_history.map(({ id, item_id, old_status, new_status, changed_at }) => serial({ id, item_id, old_status, new_status, changed_at }));
  return { customers: source.customers.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')).map(serial), transactions: transactions.map(serial), maintenance: maintenance.map(serial), rates: rates.map(serial), items: source.items.map(serial), categories: source.item_categories.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(serial), terminals: source.terminals.map(publicTerminal).map(serial), verification: source.verification_requests.map(serial), conditionRecords: source.item_condition_records.map(serial), statusHistory, settings: serial(settings), pricing, users, refreshedAt: now.toISOString() };
}

export async function createCustomer(db, actor, input, now = new Date()) {
  const value = validateCustomer(input);
  if (!(await db.collection('customers').where('customer_code', '==', value.customer_code).limit(1).get()).empty) fail(409, 'That customer code is already in use.');
  const ref = db.collection('customers').doc();
  await ref.create({ ...value, is_active: true, created_at: now, updated_at: now, created_by: String(actor) });
  return serial({ id: ref.id, ...value, is_active: true, created_at: now, updated_at: now });
}

export async function updateCustomer(db, id, input, now = new Date()) {
  const ref = db.collection('customers').doc(String(id)), current = await ref.get(); if (!current.exists) fail(404, 'Customer not found.');
  if (input.action === 'archive' || input.action === 'restore') {
    const is_active = input.action === 'restore'; await ref.update({ is_active, updated_at: now }); return { id: ref.id, is_active };
  }
  const value = validateCustomer(input);
  const duplicate = await db.collection('customers').where('customer_code', '==', value.customer_code).get();
  if (duplicate.docs.some(doc => doc.id !== ref.id)) fail(409, 'That customer code is already in use.');
  await ref.update({ ...value, updated_at: now }); return serial({ id: ref.id, ...current.data(), ...value, updated_at: now });
}

export async function saveRate(db, actor, input, now = new Date()) {
  const itemId = clean(input.itemId, 128), rateType = clean(input.rateType, 20).toUpperCase();
  const rentalRate = Number(input.rentalRate), deposit = Number(input.deposit || 0), late = Number(input.latePenalty || 0);
  if (!itemId || !['DAILY', 'HOURLY', 'FLAT'].includes(rateType) || ![rentalRate, deposit, late].every(Number.isFinite) || rentalRate < 0 || deposit < 0 || late < 0) fail(400, 'Enter valid non-negative rate values.');
  const item = await db.collection('items').doc(itemId).get(); if (!item.exists) fail(404, 'Equipment not found.');
  const active = await db.collection('item_rates').where('item_id', '==', itemId).get(), batch = db.batch();
  for (const doc of active.docs) if (doc.data().is_active !== false) batch.update(doc.ref, { is_active: false, effective_to: now });
  const ref = db.collection('item_rates').doc(); batch.create(ref, { item_id: itemId, rate_type: rateType, rental_rate: rentalRate, deposit_amount: deposit, late_penalty_rate: late, is_active: true, effective_from: now, effective_to: null, created_by: String(actor) }); await batch.commit();
  return { id: ref.id, item_id: itemId, rate_type: rateType, rental_rate: rentalRate, deposit_amount: deposit, late_penalty_rate: late, is_active: true };
}

export async function savePricing(db, actor, input, now = new Date()) {
  return persistPricing(db, actor, input, now);
}

export async function saveSettings(db, input, now = new Date()) {
  const value = { business_name: clean(input.businessName, 150), location: clean(input.location, 255), currency: clean(input.currency, 3).toUpperCase(), timezone: clean(input.timezone, 80), default_late_grace_hours: Number(input.defaultLateGraceHours || 0), updated_at: now };
  if (!value.business_name || !value.location || !/^[A-Z]{3}$/.test(value.currency) || !value.timezone || !Number.isFinite(value.default_late_grace_hours) || value.default_late_grace_hours < 0 || value.default_late_grace_hours > 168) fail(400, 'Enter valid business settings.');
  await db.collection('settings').doc('business').set(value, { merge: true }); return serial(value);
}

export async function createWorkspaceUser(auth, db, input, now = new Date()) {
  const full_name = clean(input.fullName, 150), email = clean(input.email, 191).toLowerCase(), password = String(input.password || ''), role = clean(input.role, 20).toUpperCase();
  if (full_name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || role !== 'ADMIN') fail(400, 'Enter a valid name, email, administrator role, and password of at least 12 characters.');
  let created; try { created = await auth.createUser({ displayName: full_name, email, password, emailVerified: false, disabled: false }); await db.collection('users').doc(created.uid).create({ full_name, email, role, is_active: true, created_at: now, last_login_at: null }); return { id: created.uid, name: full_name, email, role, is_active: true }; } catch (error) { if (created) await auth.deleteUser(created.uid).catch(() => { }); if (error.code === 'auth/email-already-exists') fail(409, 'That email is already in use.'); throw error; }
}

export async function updateWorkspaceUser(auth, db, actor, id, input, now = new Date()) {
  if (String(actor) === String(id) && input.isActive === false) fail(400, 'You cannot deactivate your own account.');
  const ref = db.collection('users').doc(String(id)), snap = await ref.get(); if (!snap.exists) fail(404, 'User not found.');
  const role = clean(input.role, 20).toUpperCase(), is_active = input.isActive !== false; if (role !== 'ADMIN') fail(400, 'Select the ADMIN role.');
  await auth.updateUser(String(id), { disabled: !is_active }); await ref.update({ role, is_active, updated_at: now }); return { id: String(id), role, is_active };
}
