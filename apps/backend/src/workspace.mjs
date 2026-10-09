import { asDate, docData, localDateTime } from './firebase.mjs';
import { loadPricing, savePricing as persistPricing } from './pricing.mjs';
import { publicTerminal, serializeTransaction } from './transactions.mjs';
import { auditFields, stageAudit } from './audit.mjs';
import { isStaffRole, normalizeRole } from './roles.mjs';
import { allocateCustomerCode } from './customer-codes.mjs';
import { validateInstapayQr } from './payment-proof.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const rows = snapshot => snapshot.docs.map(docData);
const clean = (value, max = 255) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const serial = serializeTransaction;
const customerFields = ['full_name', 'customer_code', 'email', 'phone', 'address', 'auth_uid', 'is_active'];
const accountFields = ['full_name', 'email', 'phone', 'role', 'is_active'];
const businessFields = ['business_name', 'location', 'currency', 'timezone', 'default_late_grace_hours'];

export function validateCustomer(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Customer details are required.');
  const bounded = (field, max, label) => {
    const raw = input[field];
    if (raw == null) return '';
    if (typeof raw !== 'string') fail(400, `Enter a valid ${label}.`);
    const value = raw.trim();
    if (value.length > max) fail(400, `${label} must be ${max} characters or fewer.`);
    return value;
  };
  const full_name = bounded('fullName', 150, 'customer name'), customer_code = bounded('code', 50, 'customer code').toUpperCase(), email = bounded('email', 191, 'customer email').toLowerCase(), phone = bounded('phone', 40, 'phone number'), address = bounded('address', 500, 'customer address');
  if (full_name.length < 2) fail(400, 'Enter the customer’s full name.');
  if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(customer_code)) fail(400, 'Customer code must use letters, numbers, dashes, or underscores.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid customer email.');
  const phoneDigits = phone.replace(/\D/g, '').length;
  if (phone && (!/^\+?[0-9\s().-]+$/.test(phone) || phoneDigits < 7 || phoneDigits > 15)) fail(400, 'Enter a phone number with 7–15 digits.');
  return { full_name, customer_code, email: email || null, phone: phone || null, address: address || null };
}

export async function loadWorkspace(db, role = 'ADMIN', now = new Date(), { ownerUid = '' } = {}) {
  role = normalizeRole(role);
  const names = ['customers', 'rentals', 'items', 'item_categories', 'item_rates', 'maintenance_records', 'terminals', 'verification_requests', 'item_status_history', 'item_condition_records'];
  const auditCollection = db.collection('audit_logs');
  const auditQuery = typeof auditCollection.orderBy === 'function' ? auditCollection.orderBy('created_at', 'desc').limit(200) : auditCollection;
  const [snapshots, auditSnapshot] = await Promise.all([Promise.all(names.map(name => db.collection(name).get())), isStaffRole(role) ? auditQuery.get() : Promise.resolve({ docs: [] })]);
  const source = Object.fromEntries(names.map((name, index) => [name, rows(snapshots[index])]));
  source.audit_logs = auditSnapshot.docs.map(docData);
  const itemMap = new Map(source.items.map(item => [item.id, item]));
  const customerMap = new Map(source.customers.map(customer => [customer.id, customer]));
  const transactions = source.rentals.map(record => {
    const rawStatus = String(record.status || '').toUpperCase();
    const status = rawStatus === 'PENDING_ESP32_RENT' ? 'PENDING_ADMIN_APPROVAL' : rawStatus === 'ACTIVE' ? 'ACTIVE' : rawStatus === 'COMPLETED' ? 'COMPLETED' : rawStatus;
    const rental = {
      ...record,
      item_id: record.item_id ?? record.itemId,
      customer_id: record.customer_id ?? record.customerId,
      due_at: record.due_at ?? record.dueDate,
      created_at: record.created_at ?? record.startDate,
      rental_fee: record.rental_fee ?? record.rateFee,
      deposit_amount: record.deposit_amount ?? record.deposit,
      delivery_location: record.delivery_location ?? record.deliveryLocation,
      payment_method: record.payment_method ?? record.paymentMethod,
      payment_confirmed_by_admin: record.payment_confirmed_by_admin ?? record.paymentConfirmedByAdmin,
      customer_name: record.customer_name ?? record.customerName,
      customer_email: record.customer_email ?? record.customerEmail,
      customer_phone: record.customer_phone ?? record.customerPhone,
      status
    };
    const item = itemMap.get(String(rental.item_id)), customer = customerMap.get(String(rental.customer_id));
    return {
      ...rental,
      item_name: item?.name || record.item_name || record.itemName || 'Unknown equipment',
      item_code: item?.item_code || '',
      customer_name: customer?.full_name || rental.customer_name || 'Unknown customer'
    };
  }).sort((a, b) => (asDate(b.created_at) || 0) - (asDate(a.created_at) || 0));
  const maintenance = source.maintenance_records.map(record => ({ ...record, item_name: itemMap.get(String(record.item_id))?.name || 'Unknown equipment', item_code: itemMap.get(String(record.item_id))?.item_code || '' })).sort((a, b) => (asDate(b.started_at) || 0) - (asDate(a.started_at) || 0));
  const rates = source.item_rates.map(rate => ({ ...rate, item_name: itemMap.get(String(rate.item_id))?.name || 'Unknown equipment', item_code: itemMap.get(String(rate.item_id))?.item_code || '' })).sort((a, b) => (asDate(b.effective_from) || 0) - (asDate(a.effective_from) || 0));
  const [settingsDoc, pricing] = await Promise.all([db.collection('settings').doc('business').get(), loadPricing(db, { allowInvalidFallback: true })]);
  const settings = settingsDoc.exists ? settingsDoc.data() : { business_name: 'Rent & Play', location: 'Los Baños, Laguna', currency: 'PHP', timezone: 'Asia/Manila', default_late_grace_hours: 0 };
  let users = [];
  const userProfiles = new Map();
  if (role === 'OWNER') {
    users = rows(await db.collection('users').get()).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')).map(user => serial({ ...user, role: String(user.id) === String(ownerUid) ? 'OWNER' : normalizeRole(user.role) || user.role }));
    for (const user of users) userProfiles.set(String(user.id), user);
  }
  // Keep legacy customer/profile records and audit actor labels current. These
  // document reads go through the shared read cache in production, so repeated
  // workspace refreshes reuse them instead of rereading each profile.
  const neededProfileIds = new Set([
    ...source.customers.map(customer => customer.auth_uid).filter(Boolean).map(String),
    ...source.audit_logs.map(log => log.user_id).filter(Boolean).map(String)
  ]);
  await Promise.all([...neededProfileIds].filter(id => !userProfiles.has(id)).map(async id => {
    const profile = await db.collection('users').doc(id).get();
    if (profile.exists) userProfiles.set(id, { id, ...profile.data() });
  }));
  const userNames = new Map([...userProfiles].map(([id, user]) => [String(id), user.full_name || user.name || '']));
  const terminalNames = new Map(source.terminals.map(terminal => [String(terminal.id), terminal.name || terminal.terminal_code]));
  const auditLabel = log => {
    const before = log.old_values || {}, after = log.new_values || {}, id = String(log.entity_id);
    const recorded = after.name || before.name || after.full_name || before.full_name || after.item_name || before.item_name || after.business_name || before.business_name;
    if (recorded) return String(recorded);
    if (log.entity_type === 'RENTAL') return transactions.find(row => String(row.id) === id)?.rental_code || '';
    if (log.entity_type === 'ITEM') return itemMap.get(id)?.name || '';
    if (log.entity_type === 'CUSTOMER') return customerMap.get(id)?.full_name || '';
    if (log.entity_type === 'USER') return userNames.get(id) || '';
    if (log.entity_type === 'ITEM_CATEGORY') return source.item_categories.find(row => String(row.id) === id)?.name || '';
    if (log.entity_type === 'ITEM_RATE') return rates.find(row => String(row.id) === id)?.item_name || '';
    if (log.entity_type === 'SETTINGS') return id === 'pricing' ? 'Rental pricing' : 'Business settings';
    if (log.entity_type === 'VERIFICATION_REQUEST') return transactions.find(row => String(row.id) === String(log.rental_id))?.rental_code || '';
    return '';
  };
  const auditLogs = isStaffRole(role) ? source.audit_logs.map(log => serial({
    id: log.id, actor_type: log.actor_type || 'USER',
    actor_name: log.actor_name || (log.actor_type === 'SYSTEM' ? 'System' : log.actor_type === 'TERMINAL' ? terminalNames.get(String(log.user_id)) || 'Terminal' : userNames.get(String(log.user_id)) || 'Unknown user'),
    action: log.action || 'UNKNOWN_ACTION', entity_type: log.entity_type || '', entity_id: log.entity_id || '', entity_label: auditLabel(log), created_at: log.created_at || null
  })).sort((a, b) => (asDate(b.created_at) || 0) - (asDate(a.created_at) || 0)).slice(0, 200) : [];
  const statusHistory = source.item_status_history.map(({ id, item_id, old_status, new_status, changed_at }) => serial({ id, item_id, old_status, new_status, changed_at }));
  const customers = source.customers.map(customer => {
    const linkedProfile = customer.auth_uid ? userProfiles.get(String(customer.auth_uid)) : null;
    return linkedProfile && normalizeRole(linkedProfile.role) === 'USER'
      ? { ...customer, full_name: linkedProfile.full_name || linkedProfile.name || customer.full_name, email: linkedProfile.email || customer.email, phone: linkedProfile.phone || customer.phone }
      : customer;
  });
  return { customers: customers.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')).map(serial), transactions: transactions.map(serial), maintenance: maintenance.map(serial), rates: rates.map(serial), items: source.items.map(serial), categories: source.item_categories.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(serial), terminals: source.terminals.map(publicTerminal).map(serial), verification: source.verification_requests.map(serial), conditionRecords: source.item_condition_records.map(serial), statusHistory, auditLogs, settings: serial(settings), pricing, users, refreshedAt: now.toISOString() };
}

export async function createCustomer(db, actor, input, now = new Date()) {
  const value = { ...validateCustomer(input), customer_code: await allocateCustomerCode(db, now) };
  const ref = db.collection('customers').doc(), batch = db.batch();
  batch.create(ref, { ...value, is_active: true, created_at: now, updated_at: now, created_by: String(actor) });
  stageAudit(batch, db, actor, 'CUSTOMER_CREATED', 'CUSTOMER', ref.id, { after: { ...value, is_active: true }, now });
  await batch.commit();
  return serial({ id: ref.id, ...value, is_active: true, created_at: now, updated_at: now });
}

export async function createMobileCustomerAccount(auth, db, actor, input, now = new Date()) {
  const validated = validateCustomer(input), password = typeof input?.password === 'string' ? input.password : '', confirmPassword = typeof input?.confirmPassword === 'string' ? input.confirmPassword : '';
  if (!actor) fail(401, 'An authenticated administrator is required.');
  if (!validated.email) fail(400, 'An email address is required for mobile app sign-in.');
  if (password.length < 12 || password.length > 128 || !password.trim()) fail(400, 'Password must be 12–128 characters.');
  if (confirmPassword !== password) fail(400, 'Passwords do not match.');
  if (!(await db.collection('users').where('email', '==', validated.email).limit(1).get()).empty) fail(409, 'An account with that email already exists. Activate or recover the existing account instead.');
  if (!(await db.collection('customers').where('email', '==', validated.email).limit(1).get()).empty) fail(409, 'A customer with that email already exists. Edit the existing customer or use another email.');

  const value = { ...validated, customer_code: await allocateCustomerCode(db, now) };
  let created;
  try {
    created = await auth.createUser({ displayName: value.full_name, email: value.email, password, emailVerified: false, disabled: false });
    const uid = String(created.uid), userRef = db.collection('users').doc(uid), customerRef = db.collection('customers').doc(uid), batch = db.batch();
    const profile = { full_name: value.full_name, email: value.email, phone: value.phone, role: 'USER', is_active: true, hasAcceptedTerms: false, created_at: now, updated_at: now, last_login_at: null };
    const customer = { ...value, auth_uid: uid, is_active: true, created_at: now, updated_at: now, created_by: String(actor) };
    batch.create(userRef, profile);
    batch.create(customerRef, customer);
    stageAudit(batch, db, actor, 'USER_CREATED', 'USER', uid, { after: { ...profile, hasAcceptedTerms: false }, now });
    stageAudit(batch, db, actor, 'CUSTOMER_CREATED', 'CUSTOMER', uid, { after: customer, now });
    await batch.commit();
    return serial({ id: uid, ...customer, role: 'USER' });
  } catch (error) {
    if (created?.uid) await auth.deleteUser(String(created.uid)).catch(() => { });
    if (error.code === 'auth/email-already-exists') fail(409, 'That email already has a sign-in account. Use the existing account or another email.');
    if (error.code === 'auth/invalid-email') fail(400, 'Enter a valid email address.');
    if (error.code === 'auth/invalid-password') fail(400, 'Password must be at least 12 characters.');
    throw error;
  }
}

export async function updateCustomer(db, actor, id, input, now = new Date(), auth = null) {
  const ref = db.collection('customers').doc(String(id)), current = await ref.get(); if (!current.exists) fail(404, 'Customer not found.');
  const currentCustomer = current.data(), before = auditFields(currentCustomer, customerFields), batch = db.batch();
  if (input.action === 'archive' || input.action === 'restore') {
    const is_active = input.action === 'restore';
    const authUid = typeof currentCustomer.auth_uid === 'string' ? currentCustomer.auth_uid : '';
    let userRef = null, userProfile = null, authUser = null;
    if (authUid) {
      if (!auth) fail(503, 'Mobile account status updates are unavailable.');
      userRef = db.collection('users').doc(authUid);
      const userSnap = await userRef.get();
      if (!userSnap.exists || String(userSnap.data().role || '').toUpperCase() !== 'USER') fail(409, 'The linked mobile account is missing or has an unexpected role.');
      userProfile = userSnap.data();
      try { authUser = await auth.getUser(authUid); }
      catch (error) { if (error.code === 'auth/user-not-found') fail(409, 'The linked Firebase sign-in account could not be found.'); throw error; }
      if (!is_active && authUid === String(actor)) fail(400, 'You cannot archive the customer account you are currently using.');
      batch.update(userRef, { is_active, updated_at: now });
      stageAudit(batch, db, actor, is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'USER', authUid, { before: auditFields(userProfile, accountFields), after: { ...auditFields(userProfile, accountFields), is_active }, now });
    }
    batch.update(ref, { is_active, updated_at: now });
    stageAudit(batch, db, actor, is_active ? 'CUSTOMER_RESTORED' : 'CUSTOMER_ARCHIVED', 'CUSTOMER', ref.id, { before, after: { ...before, is_active }, now });
    let authUpdated = false;
    try {
      if (authUid && authUser.disabled === is_active) { await auth.updateUser(authUid, { disabled: !is_active }); authUpdated = true; }
      await batch.commit();
    } catch (error) {
      if (authUpdated) await auth.updateUser(authUid, { disabled: authUser.disabled }).catch(() => {});
      throw error;
    }
    return { id: ref.id, is_active };
  }
  const value = validateCustomer(input);
  const authUid = typeof currentCustomer.auth_uid === 'string' ? currentCustomer.auth_uid : '';
  if (authUid && !value.email) fail(400, 'An email address is required for mobile app sign-in.');
  const duplicate = await db.collection('customers').where('customer_code', '==', value.customer_code).get();
  if (duplicate.docs.some(doc => doc.id !== ref.id)) fail(409, 'That customer code is already in use.');
  let linkedAuthUser = null, authChanges = {}, userRef = null, userProfile = null;
  if (authUid) {
    if (!auth) fail(503, 'Mobile account updates are unavailable.');
    userRef = db.collection('users').doc(authUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists || String(userSnap.data().role || '').toUpperCase() !== 'USER') fail(409, 'The linked mobile account is missing or has an unexpected role.');
    userProfile = userSnap.data();
    try { linkedAuthUser = await auth.getUser(authUid); }
    catch (error) { if (error.code === 'auth/user-not-found') fail(409, 'The linked Firebase sign-in account could not be found.'); throw error; }
    if (String(linkedAuthUser.email || '').toLowerCase() !== value.email) authChanges.email = value.email;
    if ((linkedAuthUser.displayName || '') !== value.full_name) authChanges.displayName = value.full_name;
    batch.update(userRef, { full_name: value.full_name, email: value.email, phone: value.phone, updated_at: now });
    stageAudit(batch, db, actor, 'USER_UPDATED', 'USER', authUid, { before: auditFields(userProfile, accountFields), after: { ...auditFields(userProfile, accountFields), full_name: value.full_name, email: value.email, phone: value.phone }, now });
  }
  batch.update(ref, { ...value, updated_at: now });
  stageAudit(batch, db, actor, 'CUSTOMER_UPDATED', 'CUSTOMER', ref.id, { before, after: { ...before, ...value }, now });
  let authUpdated = false;
  try {
    if (Object.keys(authChanges).length) { await auth.updateUser(authUid, authChanges); authUpdated = true; }
    await batch.commit();
  } catch (error) {
    if (authUpdated) {
      const rollback = {};
      if (Object.hasOwn(authChanges, 'email')) rollback.email = linkedAuthUser.email;
      if (Object.hasOwn(authChanges, 'displayName')) rollback.displayName = linkedAuthUser.displayName || null;
      await auth.updateUser(authUid, rollback).catch(() => { });
    }
    if (error.code === 'auth/email-already-exists') fail(409, 'That email is already used by another sign-in account.');
    if (error.code === 'auth/invalid-email') fail(400, 'Enter a valid email address.');
    throw error;
  }
  return serial({ id: ref.id, ...currentCustomer, ...value, updated_at: now });
}

export async function changeCustomerPassword(db, actor, id, input, auth = null, now = new Date()) {
  id = String(id ?? '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) fail(400, 'A valid customer ID is required.');
  if (!input || typeof input.newPassword !== 'string' || typeof input.confirmNewPassword !== 'string') fail(400, 'Enter and confirm the new password.');
  const password = input.newPassword;
  if (password.length < 12 || password.length > 128 || !password.trim()) fail(400, 'Password must be 12–128 characters.');
  if (input.confirmNewPassword !== password) fail(400, 'Passwords do not match.');
  if (!auth) fail(503, 'Mobile account password changes are unavailable.');

  const customerRef = db.collection('customers').doc(id), customerDoc = await customerRef.get();
  if (!customerDoc.exists) fail(404, 'Customer not found.');
  const customer = customerDoc.data(), authUid = typeof customer.auth_uid === 'string' ? customer.auth_uid : '';
  if (!authUid) fail(409, 'This customer does not have a linked mobile app login.');
  const userDoc = await db.collection('users').doc(authUid).get();
  if (!userDoc.exists || String(userDoc.data().role || '').toUpperCase() !== 'USER') fail(409, 'The linked mobile account is missing or has an unexpected role.');
  try { await auth.getUser(authUid); }
  catch (error) { if (error.code === 'auth/user-not-found') fail(409, 'The linked Firebase sign-in account could not be found.'); throw error; }
  try { await auth.updateUser(authUid, { password }); }
  catch (error) {
    if (error.code === 'auth/invalid-password') fail(400, 'Password must be 12–128 characters.');
    throw error;
  }

  const batch = db.batch();
  stageAudit(batch, db, actor, 'CUSTOMER_PASSWORD_CHANGED', 'CUSTOMER', id, { after: { password_changed: true }, now });
  try { await batch.commit(); }
  catch (error) {
    console.error(`Customer password changed but its audit log could not be saved (${id}): ${error.message}`);
    return { id, passwordChanged: true, auditRecorded: false };
  }
  return { id, passwordChanged: true, auditRecorded: true };
}

const customerVersion = customer => localDateTime(customer.updated_at || customer.created_at) || '';

export async function deleteArchivedCustomer(db, actor, id, input, auth = null, now = new Date()) {
  id = String(id ?? '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) fail(400, 'A valid customer ID is required.');
  if (!input || typeof input.version !== 'string') fail(400, 'Refresh the customer details before deleting this customer.');
  const customerRef = db.collection('customers').doc(id), initial = await customerRef.get();
  if (!initial.exists) fail(404, 'Customer not found.');
  const initialCustomer = initial.data();
  if (initialCustomer.is_active !== false) fail(409, 'Archive this customer before permanently deleting them.');
  if (input.version !== customerVersion(initialCustomer)) fail(409, 'This customer changed since you opened the directory. Refresh and try again.');

  const authUid = typeof initialCustomer.auth_uid === 'string' ? initialCustomer.auth_uid : '';
  let authAccount = null, disabledForDelete = false;
  if (authUid) {
    if (!auth) fail(503, 'Mobile account deletion is unavailable.');
    try { authAccount = await auth.getUser(authUid); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    if (authAccount && !authAccount.disabled) {
      await auth.updateUser(authUid, { disabled: true });
      disabledForDelete = true;
    }
  }

  let result;
  try {
    result = await db.runTransaction(async tx => {
      const customerDoc = await tx.get(customerRef);
      if (!customerDoc.exists) fail(404, 'Customer not found.');
      const customer = customerDoc.data();
      if (customer.is_active !== false) fail(409, 'Archive this customer before permanently deleting them.');
      if (input.version !== customerVersion(customer) || (customer.auth_uid || '') !== authUid) fail(409, 'This customer changed since you opened the directory. Refresh and try again.');

      const rentalSnapshots = await Promise.all(['customer_id', 'customerId'].map(field => tx.get(db.collection('rentals').where(field, '==', id))));
      const rentals = [...new Map(rentalSnapshots.flatMap(snapshot => snapshot.docs).map(doc => [doc.id, doc])).values()].map(docData);
      const openStatuses = new Set(['ACTIVE', 'APPROVED', 'RETURN_PENDING_INSPECTION', 'PENDING_VERIFICATION', 'PENDING_ADMIN_APPROVAL', 'PENDING_ESP32_RENT']);
      const openRentals = rentals.filter(rental => openStatuses.has(String(rental.status || '').toUpperCase()) && !rental.confirmed_return_at);
      if (openRentals.length) fail(409, `This customer has ${openRentals.length} active or pending rental${openRentals.length === 1 ? '' : 's'}. Finish or cancel them before deleting the customer.`);

      let userDoc = null, user = null;
      if (authUid) {
        userDoc = await tx.get(db.collection('users').doc(authUid));
        if (userDoc.exists) {
          user = userDoc.data();
          if (String(user.role || '').toUpperCase() !== 'USER') fail(409, 'The linked mobile account has an unexpected role and cannot be deleted with this customer.');
        }
      }
      tx.delete(customerRef);
      if (userDoc?.exists) tx.delete(userDoc.ref);
      stageAudit(tx, db, actor, 'CUSTOMER_DELETED', 'CUSTOMER', id, { before: auditFields(customer, customerFields), after: { deleted: true, full_name: customer.full_name, customer_code: customer.customer_code }, now });
      if (userDoc?.exists) stageAudit(tx, db, actor, 'USER_DELETED', 'USER', authUid, { before: auditFields(user, accountFields), after: { deleted: true }, now });
      return { id, deleted: true, deletedMobileAccount: Boolean(authUid) };
    });
  } catch (error) {
    if (disabledForDelete) await auth.updateUser(authUid, { disabled: false }).catch(() => {});
    throw error;
  }

  if (authUid && authAccount) {
    try { await auth.deleteUser(authUid); }
    catch (error) {
      if (error.code !== 'auth/user-not-found') return { ...result, mobileAccountDeletionPending: true };
    }
  }
  return result;
}

export async function saveRate(db, actor, input, now = new Date()) {
  const itemId = clean(input.itemId, 128), rateType = clean(input.rateType, 20).toUpperCase();
  const rentalRate = Number(input.rentalRate), deposit = Number(input.deposit || 0), late = Number(input.latePenalty || 0);
  if (!itemId || !['DAILY', 'HOURLY', 'FLAT'].includes(rateType) || ![rentalRate, deposit, late].every(Number.isFinite) || rentalRate < 0 || deposit < 0 || late < 0) fail(400, 'Enter valid non-negative rate values.');
  const item = await db.collection('items').doc(itemId).get(); if (!item.exists) fail(404, 'Equipment not found.');
  const active = await db.collection('item_rates').where('item_id', '==', itemId).get(), batch = db.batch();
  for (const doc of active.docs) if (doc.data().is_active !== false) batch.update(doc.ref, { is_active: false, effective_to: now });
  const ref = db.collection('item_rates').doc(), value = { item_id: itemId, rate_type: rateType, rental_rate: rentalRate, deposit_amount: deposit, late_penalty_rate: late, is_active: true };
  batch.create(ref, { ...value, effective_from: now, effective_to: null, created_by: String(actor) });
  stageAudit(batch, db, actor, 'RATE_UPDATED', 'ITEM_RATE', ref.id, { after: { ...value, item_name: item.data().name || null }, now });
  await batch.commit();
  return { id: ref.id, item_id: itemId, rate_type: rateType, rental_rate: rentalRate, deposit_amount: deposit, late_penalty_rate: late, is_active: true };
}

export async function savePricing(db, actor, input, now = new Date()) {
  return persistPricing(db, actor, input, now);
}

export async function saveSettings(db, actor, input, now = new Date()) {
  const value = { business_name: clean(input.businessName, 150), location: clean(input.location, 255), currency: clean(input.currency, 3).toUpperCase(), timezone: clean(input.timezone, 80), default_late_grace_hours: Number(input.defaultLateGraceHours || 0), updated_at: now };
  if (!value.business_name || !value.location || !/^[A-Z]{3}$/.test(value.currency) || !value.timezone || !Number.isFinite(value.default_late_grace_hours) || value.default_late_grace_hours < 0 || value.default_late_grace_hours > 168) fail(400, 'Enter valid business settings.');
  const ref = db.collection('settings').doc('business'), current = await ref.get(), batch = db.batch();
  batch.set(ref, value, { merge: true });
  stageAudit(batch, db, actor, 'BUSINESS_SETTINGS_UPDATED', 'SETTINGS', 'business', { before: current.exists ? auditFields(current.data(), businessFields) : null, after: auditFields(value, businessFields), now });
  await batch.commit(); return serial(value);
}

export async function savePaymentSettings(db, actor, input, now = new Date()) {
  const value = validateInstapayQr(input);
  const ref = db.collection('settings').doc('business'), current = await ref.get();
  const before = current.exists ? current.data() : {};
  const safeAudit = fields => ({
    qr_configured: Boolean(fields.instapay_qr_data_url),
    account_name: fields.instapay_account_name || null,
    account_number_last_four: fields.instapay_account_number ? fields.instapay_account_number.slice(-4) : null,
    instructions: fields.instapay_instructions || null
  });
  const batch = db.batch();
  batch.set(ref, { ...value, updated_at: now }, { merge: true });
  stageAudit(batch, db, actor, 'PAYMENT_INSTRUCTIONS_UPDATED', 'SETTINGS', 'business', { before: safeAudit(before), after: safeAudit(value), now });
  await batch.commit();
  return { ...value };
}

export async function createWorkspaceUser(auth, db, actor, input, now = new Date()) {
  const full_name = clean(input.fullName, 150), email = clean(input.email, 191).toLowerCase(), password = String(input.password || ''), role = clean(input.role, 20).toUpperCase();
  if (full_name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || !['ADMIN', 'OWNER'].includes(role)) fail(400, 'Enter a valid name, email, operator or owner role, and password of at least 12 characters.');
  let created;
  try {
    created = await auth.createUser({ displayName: full_name, email, password, emailVerified: false, disabled: false });
    const value = { full_name, email, role, is_active: true }, batch = db.batch();
    batch.create(db.collection('users').doc(created.uid), { ...value, created_at: now, last_login_at: null });
    stageAudit(batch, db, actor, 'USER_CREATED', 'USER', created.uid, { after: value, now });
    await batch.commit(); return { id: created.uid, name: full_name, email, role, is_active: true };
  } catch (error) { if (created) await auth.deleteUser(created.uid).catch(() => { }); if (error.code === 'auth/email-already-exists') fail(409, 'That email is already in use.'); throw error; }
}

export async function updateWorkspaceUser(auth, db, actor, id, input, now = new Date(), { ownerUid = process.env.SUPER_ADMIN_UID || '' } = {}) {
  if (String(actor) === String(id) && input.isActive === false) fail(400, 'You cannot deactivate your own account.');
  const ref = db.collection('users').doc(String(id)), snap = await ref.get(); if (!snap.exists) fail(404, 'User not found.');
  const account = snap.data(), currentRole = String(account.role || '').toUpperCase();
  const role = clean(input.role ?? currentRole, 20).toUpperCase(), is_active = input.isActive !== false;
  if (!['ADMIN', 'USER', 'OWNER'].includes(currentRole) || role !== currentRole) fail(400, 'Account roles cannot be changed here.');
  if ((currentRole === 'OWNER' || String(id) === String(ownerUid).trim()) && !is_active) fail(400, 'Owner accounts cannot be deactivated from the account list.');
  const before = auditFields(account, accountFields), batch = db.batch();
  await auth.updateUser(String(id), { disabled: !is_active });
  try {
    batch.update(ref, { is_active, updated_at: now });
    const action = before.is_active !== is_active ? is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED' : 'USER_UPDATED';
    stageAudit(batch, db, actor, action, 'USER', id, { before, after: { ...before, is_active }, now });

    if (currentRole === 'USER' && is_active) {
      const customerRef = db.collection('customers').doc(String(id)), customerSnap = await customerRef.get();
      const currentCustomer = customerSnap.exists ? customerSnap.data() : {};
      const full_name = clean(account.full_name, 150) || 'Customer';
      const email = clean(account.email, 191).toLowerCase();
      const phone = clean(account.phone, 40);
      const customer_code = /^CUST-\d+$/i.test(currentCustomer.customer_code || '')
        ? currentCustomer.customer_code
        : await allocateCustomerCode(db, now);
      const customerPatch = customerSnap.exists
        ? { ...(currentCustomer.auth_uid !== String(id) ? { auth_uid: String(id) } : {}),
            ...(currentCustomer.is_active !== true ? { is_active: true } : {}),
            ...(!currentCustomer.full_name ? { full_name } : {}),
            ...(!/^CUST-\d+$/i.test(currentCustomer.customer_code || '') ? { customer_code } : {}),
            ...(!currentCustomer.email && email ? { email } : {}),
            ...(!currentCustomer.phone && phone ? { phone } : {}) }
        : { full_name, customer_code, email: email || null, phone: phone || null, address: null, auth_uid: String(id), is_active: true, created_at: now, updated_at: now };
      const customerChanged = !customerSnap.exists || Object.keys(customerPatch).length > 0;
      if (customerSnap.exists && customerChanged) customerPatch.updated_at = now;
      const customerAfter = { ...currentCustomer, ...customerPatch };
      if (!customerSnap.exists) batch.create(customerRef, customerPatch);
      else if (customerChanged) batch.update(customerRef, customerPatch);
      if (customerChanged) {
        const customerAction = !customerSnap.exists ? 'CUSTOMER_CREATED' : currentCustomer.is_active === false ? 'CUSTOMER_RESTORED' : 'CUSTOMER_UPDATED';
        stageAudit(batch, db, actor, customerAction, 'CUSTOMER', customerRef.id, { before: customerSnap.exists ? auditFields(currentCustomer, customerFields) : null, after: auditFields(customerAfter, customerFields), now });
      }
    }
    await batch.commit();
  } catch (error) { await auth.updateUser(String(id), { disabled: before.is_active === false }).catch(() => {}); throw error; }
  return { id: String(id), role, is_active };
}
