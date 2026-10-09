import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomer, loadWorkspace, createWorkspaceUser, updateCustomer } from '../src/workspace.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

test('customer validation normalizes safe directory fields', () => {
  assert.deepEqual(validateCustomer({ fullName: '  Maria Santos ', code: ' cust-001 ', email: ' MARIA@EXAMPLE.COM ', phone: ' 09171234567 ', address: ' Los Baños ' }), { full_name: 'Maria Santos', customer_code: 'CUST-001', email: 'maria@example.com', phone: '09171234567', address: 'Los Baños' });
});

test('customer validation rejects unsafe or incomplete records', () => {
  for (const value of [{ fullName: '', code: 'C-1' }, { fullName: 'Customer', code: 'bad code' }, { fullName: 'Customer', code: 'CUST-1', email: 'invalid' }]) assert.throws(() => validateCustomer(value), error => error.status === 400);
});

test('workspace account creation permits staff roles and rejects customer or legacy roles', async () => {
  const auth = { createUser: async input => ({ uid: 'admin-uid', ...input }), deleteUser: async () => { } };
  const db = memoryFirestore();
  for (const role of ['OPERATOR', 'USER', 'CUSTOMER']) await assert.rejects(() => createWorkspaceUser(auth, db, 'actor-admin', { fullName: 'Test Admin', email: 'admin@example.test', password: 'test-password-with-length', role }), error => error.status === 400);
  const result = await createWorkspaceUser(auth, db, 'actor-admin', { fullName: 'Test Admin', email: 'admin@example.test', password: 'test-password-with-length', role: 'ADMIN' });
  assert.equal(result.role, 'ADMIN');
  assert.equal(db.data('users', 'admin-uid').role, 'ADMIN');
  assert.equal(db.data('users', 'admin-uid').is_active, true);
  const ownerDb = memoryFirestore();
  const owner = await createWorkspaceUser(auth, ownerDb, 'actor-owner', { fullName: 'Test Owner', email: 'owner@example.test', password: 'test-password-with-length', role: 'OWNER' });
  assert.equal(owner.role, 'OWNER');
  assert.equal(ownerDb.data('users', 'admin-uid').role, 'OWNER');
});

test('workspace analytics serializes terminal confirmations and collection history', async () => {
  const timestamp = { toDate: () => new Date('2026-09-20T02:00:00Z') };
  const collections = { verification_requests: [{ id: 'v1', status: 'CONFIRMED', requested_at: timestamp, confirmed_at: timestamp }], item_status_history: [{ id: 'h1', item_id: 'i1', old_status: 'AVAILABLE', new_status: 'INACTIVE', changed_at: timestamp, changed_by: 'staff-id' }] };
  const db = { collection: name => ({ get: async () => ({ docs: (collections[name] || []).map(({ id, ...data }) => ({ id, data: () => data })) }), doc: () => ({ get: async () => ({ exists: false }) }) }) };
  const result = await loadWorkspace(db, 'ADMIN', new Date('2026-09-25T00:00:00Z'));
  assert.equal(result.verification[0].confirmed_at, '2026-09-20 10:00:00.000');
  assert.equal(result.statusHistory[0].changed_at, '2026-09-20 10:00:00.000');
  assert.equal(result.statusHistory[0].changed_by, undefined);
  assert.equal(result.refreshedAt, '2026-09-25T00:00:00.000Z');
});

test('customer directory reads current name and contact details from the linked app account', async () => {
  const db = memoryFirestore({
    customers: { 'customer-uid': { full_name: 'Customer', email: 'old@example.test', phone: null, auth_uid: 'customer-uid', customer_code: 'CUST-001', is_active: true } },
    users: { 'customer-uid': { full_name: 'Reynold Pastor', email: 'reynold@gmail.com', phone: '09761180282', role: 'USER', is_active: true } },
  });
  const result = await loadWorkspace(db, 'ADMIN', new Date('2026-10-07T00:00:00Z'));
  assert.equal(result.customers[0].full_name, 'Reynold Pastor');
  assert.equal(result.customers[0].email, 'reynold@gmail.com');
  assert.equal(result.customers[0].phone, '09761180282');
});

test('admin customer edits preserve the linked app account name and login email', async () => {
  const authCalls = [];
  const auth = {
    getUser: async () => ({ email: 'reynold@gmail.com', displayName: 'Reynold Pastor' }),
    updateUser: async (uid, changes) => authCalls.push({ uid, changes }),
  };
  const db = memoryFirestore({
    customers: { 'customer-uid': { full_name: 'Customer', email: 'rentandplay@gmail.com', phone: null, auth_uid: 'customer-uid', customer_code: 'CUST-001', is_active: true } },
    users: { 'customer-uid': { full_name: 'Reynold Pastor', email: 'reynold@gmail.com', phone: '', role: 'USER', is_active: true } },
  });
  await updateCustomer(db, 'admin-uid', 'customer-uid', { fullName: 'Reynold Pastor', code: 'CUST-001', email: 'reynold@gmail.com', phone: '09761180282' }, new Date('2026-10-07T00:00:00Z'), auth);
  assert.equal(db.data('users', 'customer-uid').email, 'reynold@gmail.com');
  assert.equal(db.data('customers', 'customer-uid').email, 'reynold@gmail.com');
  assert.deepEqual(authCalls, []);
});

test('customer archive and restore update the linked app profile and Firebase login', async () => {
  let disabled = false;
  const auth = {
    getUser: async () => ({ uid: 'customer-uid', disabled }),
    updateUser: async (_uid, changes) => { disabled = changes.disabled; },
  };
  const db = memoryFirestore({
    customers: { 'customer-uid': { full_name: 'Reynold Pastor', email: 'reynold@gmail.com', auth_uid: 'customer-uid', customer_code: 'CUST-001', is_active: true } },
    users: { 'customer-uid': { full_name: 'Reynold Pastor', email: 'reynold@gmail.com', role: 'USER', is_active: true } },
  });
  await updateCustomer(db, 'admin-uid', 'customer-uid', { action: 'archive' }, new Date('2026-10-07T00:00:00Z'), auth);
  assert.equal(disabled, true);
  assert.equal(db.data('users', 'customer-uid').is_active, false);
  assert.equal(db.data('customers', 'customer-uid').is_active, false);

  await updateCustomer(db, 'admin-uid', 'customer-uid', { action: 'restore' }, new Date('2026-10-07T00:01:00Z'), auth);
  assert.equal(disabled, false);
  assert.equal(db.data('users', 'customer-uid').is_active, true);
  assert.equal(db.data('customers', 'customer-uid').is_active, true);
});
