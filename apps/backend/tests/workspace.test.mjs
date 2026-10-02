import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomer, loadWorkspace, createWorkspaceUser } from '../src/workspace.mjs';

test('customer validation normalizes safe directory fields', () => {
  assert.deepEqual(validateCustomer({ fullName: '  Maria Santos ', code: ' cust-001 ', email: ' MARIA@EXAMPLE.COM ', phone: ' 09171234567 ', address: ' Los Baños ' }), { full_name: 'Maria Santos', customer_code: 'CUST-001', email: 'maria@example.com', phone: '09171234567', address: 'Los Baños' });
});

test('customer validation rejects unsafe or incomplete records', () => {
  for (const value of [{ fullName: '', code: 'C-1' }, { fullName: 'Customer', code: 'bad code' }, { fullName: 'Customer', code: 'CUST-1', email: 'invalid' }]) assert.throws(() => validateCustomer(value), error => error.status === 400);
});

test('workspace account creation permits only ADMIN role', async () => {
  const created = [];
  const auth = { createUser: async input => ({ uid: 'admin-uid', ...input }), deleteUser: async () => { } };
  const db = { collection: name => ({ doc: id => ({ create: async value => created.push({ name, id, value }) }) }) };
  for (const role of ['OWNER', 'OPERATOR', 'USER']) await assert.rejects(() => createWorkspaceUser(auth, db, { fullName: 'Test Admin', email: 'admin@example.test', password: 'test-password-with-length', role }), error => error.status === 400);
  const result = await createWorkspaceUser(auth, db, { fullName: 'Test Admin', email: 'admin@example.test', password: 'test-password-with-length', role: 'ADMIN' });
  assert.equal(result.role, 'ADMIN');
  assert.equal(created[0].value.role, 'ADMIN');
  assert.equal(created[0].value.is_active, true);
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
