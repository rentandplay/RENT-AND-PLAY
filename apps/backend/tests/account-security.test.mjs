import test from 'node:test';
import assert from 'node:assert/strict';
import { emailError, nameError, passwordError, createEmailDomainValidator } from '../src/account-validation.mjs';
import { createWorkspaceUser, createMobileCustomerAccount } from '../src/workspace.mjs';
import { changeWorkspacePassword } from '../src/auth.mjs';
import { createApi } from '../src/server.mjs';
import { normalizeRole } from '../src/roles.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const validationOptions = { validateEmail: async value => value.toLowerCase() };
const password = 'SecurePass9';
const input = { fullName: 'Maria Santos', email: 'maria@school.edu.ph', password, confirmPassword: password, role: 'OPERATOR', passwordMode: 'manual' };

test('account rules reject the reported invalid inputs and keep legitimate names and custom domains', () => {
  for (const email of ['some one@gmail.com', ' test@gmail.com', 'test@gmail.com ', 'test..name@gmail.com', 'test@-domain.com', 'no-at-sign']) assert.ok(emailError(email));
  for (const email of ['MARIA@school.edu.ph', 'first.last+tag@company.com', 'juan@university.academy']) assert.equal(emailError(email), '');
  for (const name of ['A', 'A B', 'Juan123 Santos', 'Juan @ Santos', 'raveeeeeeNN hwidawgiodgawqqqqqqqqq']) assert.ok(nameError(name));
  for (const name of ['José Dela Cruz', "Anne-Marie O’Neill", 'Maria J. Santos', '李明 王伟']) assert.equal(nameError(name), '');
  for (const value of ['shortA1', 'alllowercase9', 'NoNumbersHere']) assert.ok(passwordError(value));
  assert.equal(passwordError('ABCDEF12'), '', 'lowercase and special characters are optional under the requested policy');
  assert.equal(normalizeRole('admin'), 'OPERATOR'); assert.equal(normalizeRole('user'), 'CUSTOMER'); assert.equal(normalizeRole('super_admin'), 'OWNER');
});

test('domain checks support custom MX, reject unknown/null-MX domains, and keep transient failures recoverable', async () => {
  let calls = 0;
  const check = createEmailDomainValidator({ allowedDomains: '', resolveMx: async domain => {
    calls++;
    if (domain === 'missing.example') throw Object.assign(new Error('missing'), { code: 'ENOTFOUND' });
    if (domain === 'nullmx.example') return [{ priority: 0, exchange: '' }];
    if (domain === 'offline.example') throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' });
    return [{ exchange: 'mail.' + domain }];
  } });
  assert.equal(await check('Maria@school.edu.ph'), 'maria@school.edu.ph');
  await check('staff@school.edu.ph'); assert.equal(calls, 1, 'cache the domain, not individual user addresses');
  for (let count = 0; count < 2; count++) await assert.rejects(check('a@missing.example'), error => error.status === 400 && error.code === 'INVALID_EMAIL_DOMAIN');
  await assert.rejects(check('a@nullmx.example'), error => error.status === 400);
  await assert.rejects(check('a@offline.example'), error => error.status === 503);
  await assert.rejects(check('a@offline.example'), error => error.status === 503);
  const fallback = createEmailDomainValidator({ allowedDomains: '', resolveMx: async () => { throw Object.assign(new Error('no MX'), { code: 'ENODATA' }); }, resolve4: async () => ['192.0.2.1'], resolve6: async () => [] });
  assert.equal(await fallback('user@custom.example'), 'user@custom.example');
});

test('staff creation requires matching strong passwords, preserves selected roles, and hides credentials from records', async () => {
  const created = [], auth = { createUser: async value => { created.push(value); return { uid: 'staff' }; }, deleteUser: async () => {} };
  for (const invalid of [{ ...input, password: 'lowercase9', confirmPassword: 'lowercase9' }, { ...input, confirmPassword: 'DifferentPass9' }, { ...input, role: 'CUSTOMER' }, { ...input, fullName: 'raveeeeeeNN' }]) {
    await assert.rejects(createWorkspaceUser(auth, memoryFirestore(), 'owner', invalid, new Date(), validationOptions), error => error.status === 400);
  }
  assert.equal(created.length, 0);
  for (const role of ['OWNER', 'OPERATOR', 'ADMIN']) {
    const db = memoryFirestore(), result = await createWorkspaceUser(auth, db, 'owner', { ...input, role }, new Date(), validationOptions);
    assert.equal(result.role, role === 'ADMIN' ? 'OPERATOR' : role);
    assert.equal(db.data('users', 'staff').must_change_password, true);
    assert.equal(result.mustChangePassword, true);
    assert.ok(!JSON.stringify({ result, records: db.records('users'), audit: db.records('audit_logs') }).includes(password));
  }
});

test('generated staff passwords are secure, emailed once, and account creation rolls back if delivery fails', async () => {
  const db = memoryFirestore(), mails = [], identities = [], deleted = [];
  const auth = { createUser: async value => { identities.push(value); return { uid: 'staff' }; }, deleteUser: async uid => deleted.push(uid) };
  const generated = { ...input, passwordMode: 'generated', password: undefined, confirmPassword: undefined };
  const result = await createWorkspaceUser(auth, db, 'owner', generated, new Date(), { ...validationOptions, sendCredentials: async value => mails.push(value) });
  assert.equal(mails.length, 1); assert.equal(mails[0].email, input.email);
  assert.equal(mails[0].password, identities[0].password); assert.ok(mails[0].password.length >= 24); assert.equal(passwordError(mails[0].password), '');
  assert.equal(result.credentialsEmailSent, true); assert.ok(!JSON.stringify(result).includes(mails[0].password));
  const failedDb = memoryFirestore();
  await assert.rejects(createWorkspaceUser(auth, failedDb, 'owner', generated, new Date(), { ...validationOptions, sendCredentials: async () => { throw Error('mail unavailable'); } }), /mail unavailable/);
  assert.deepEqual(deleted, ['staff']); assert.equal(failedDb.records('users').length, 0); assert.equal(failedDb.records('audit_logs').length, 0);
});

test('customer accounts receive the same name, PH phone, password, and confirmation checks', async () => {
  const db = memoryFirestore(), auth = { createUser: async () => ({ uid: 'customer' }), deleteUser: async () => {} };
  const customer = { ...input, code: 'CUST-001', phone: '09171234567' };
  await assert.rejects(createMobileCustomerAccount(auth, db, 'operator', { ...customer, phone: '1234' }, new Date(), validationOptions), error => error.status === 400);
  await assert.rejects(createMobileCustomerAccount(auth, db, 'operator', { ...customer, password: 'onlylowercase' }, new Date(), validationOptions), error => error.status === 400);
  const result = await createMobileCustomerAccount(auth, db, 'operator', customer, new Date(), validationOptions);
  assert.equal(result.role, 'CUSTOMER'); assert.equal(db.data('users', 'customer').role, 'CUSTOMER');
});

test('first-login change verifies the current password and UID before clearing the server restriction', async () => {
  const staff = { id: 'staff', email: input.email, full_name: input.fullName, role: 'OPERATOR', is_active: true, must_change_password: true };
  const db = memoryFirestore({ users: { staff } }), changes = [];
  const auth = { updateUser: async (...args) => changes.push(args), revokeRefreshTokens: async uid => changes.push(['revoke', uid]) };
  const request = { currentPassword: password, newPassword: 'MyNewPass8', confirmPassword: 'MyNewPass8' };
  for (const credential of [null, { localId: 'different-user' }]) {
    await assert.rejects(changeWorkspacePassword(auth, db, staff, request, { verifyPassword: async () => credential }), error => error.status === 400);
    assert.equal(db.data('users', 'staff').must_change_password, true); assert.equal(changes.length, 0);
  }
  await assert.rejects(changeWorkspacePassword(auth, db, staff, { ...request, newPassword: password, confirmPassword: password }, {}), error => error.status === 400);
  const result = await changeWorkspacePassword(auth, db, staff, request, { verifyPassword: async () => ({ localId: 'staff' }) });
  assert.equal(result.must_change_password, false); assert.equal(db.data('users', 'staff').must_change_password, false);
  assert.equal(changes[1][0], 'revoke'); assert.ok(!JSON.stringify(db.records('audit_logs')).includes(request.newPassword));
});

test('HTTP access gates Owner/Operator accounts until password change and protects account management by role', async () => {
  const db = memoryFirestore({ users: { staff: { full_name: input.fullName, email: input.email, role: 'OPERATOR', is_active: true, must_change_password: true } } });
  const profiles = () => ({ id: 'staff', ...db.data('users', 'staff') });
  let current = password, changes = 0, creates = 0;
  const sessions = { verify: async cookie => cookie === 'session' ? { uid: 'staff' } : null, verifyPassword: async (email, value) => value === current ? { localId: 'staff' } : null, signIn: async (email, value) => value === current ? { uid: 'staff', cookie: 'session', seconds: 28800 } : null };
  const auth = { updateUser: async (uid, value) => { current = value.password; }, revokeRefreshTokens: async () => {} };
  const services = { getUser: async () => profiles(), verifyMobileToken: async () => ({ uid: 'staff' }), validateEmail: validationOptions.validateEmail, touchLogin: async () => {}, dashboard: async () => ({ allowed: true }), createUser: async () => { creates++; return {}; }, changeStaffPassword: async (user, value) => { changes++; return changeWorkspacePassword(auth, db, user, value, sessions); } };
  const server = createApi({ services, sessions });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`, headers = { 'Content-Type': 'application/json', Cookie: 'rent_play_session=session' };
  const request = (path, value, extra = {}) => fetch(base + path, { headers: { ...headers, ...extra }, ...(value ? { method: 'POST', body: JSON.stringify(value) } : {}) });
  try {
    assert.equal((await (await request('/auth/login', { email: input.email, password })).json()).user.mustChangePassword, true);
    assert.equal((await (await request('/auth/me')).json()).user.mustChangePassword, true);
    for (const extra of [{}, { Authorization: 'Bearer mobile-token' }]) {
      const response = await request('/dashboard', undefined, extra); assert.equal(response.status, 403); assert.equal((await response.json()).code, 'PASSWORD_CHANGE_REQUIRED');
    }
    assert.equal((await request('/users', input)).status, 403); assert.equal(creates, 0);
    const changed = await request('/auth/change-password', { currentPassword: password, newPassword: 'NewPass88', confirmPassword: 'NewPass88' });
    assert.equal(changed.status, 200); assert.equal((await changed.json()).user.mustChangePassword, false); assert.equal(changes, 1);
    assert.equal((await request('/dashboard')).status, 200);
    assert.equal((await request('/users', input)).status, 403, 'Operators cannot create privileged accounts');
    await db.collection('users').doc('staff').update({ role: 'OWNER' });
    assert.equal((await request('/users', input)).status, 201); assert.equal(creates, 1);
    await db.collection('users').doc('staff').update({ role: 'CUSTOMER' });
    assert.equal((await request('/dashboard')).status, 401); assert.equal((await request('/auth/change-password', {})).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('reset requests validate the chosen recipient and report delivery failures instead of fake success', async () => {
  const recipients = [], server = createApi({ services: { validateEmail: validationOptions.validateEmail }, sessions: { sendPasswordReset: async email => { if (email === 'offline@school.edu.ph') throw Object.assign(new Error('Mail unavailable'), { status: 503 }); recipients.push(email); } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = async email => fetch(base + '/auth/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  try {
    assert.equal((await fetch(base + '/auth/password-reset')).status, 404); assert.equal(recipients.length, 0);
    const response = await post(input.email); assert.equal(response.status, 200); assert.equal((await response.json()).email, input.email); assert.deepEqual(recipients, [input.email]);
    assert.equal((await post('offline@school.edu.ph')).status, 503);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
