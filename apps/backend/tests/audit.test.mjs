import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/server.mjs';
import { createItem } from '../src/inventory.mjs';
import { createCustomer, updateCustomer, saveRate, saveSettings, createWorkspaceUser, updateWorkspaceUser, loadWorkspace } from '../src/workspace.mjs';
import { DEFAULT_PRICING, savePricing } from '../src/pricing.mjs';
import { updateProfile } from '../src/profile.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const admin = { full_name: 'Test Admin', email: 'admin@example.test', role: 'ADMIN', is_active: true };
const customerInput = { fullName: 'Ana Reyes', code: 'CUST-001', email: 'ana@example.test' };
const equipmentInput = { categoryId: 'sports', name: 'New basketball', condition: 'GOOD', rateType: 'DAILY', rentalRate: 50, deposit: 0, latePenalty: 5 };
const businessInput = { businessName: 'Rent & Play', location: 'Los Baños', currency: 'PHP', timezone: 'Asia/Manila', defaultLateGraceHours: 0 };
const fixture = () => memoryFirestore({ users: { admin }, item_categories: { sports: { name: 'Sports equipment' } }, items: { bike: { name: 'Bike', item_code: 'BIKE-001' } } });

test('authenticated equipment creation and workspace changes appear in the Reports audit feed', async () => {
  const db = fixture(), auth = { createUser: async () => ({ uid: 'new-admin' }), deleteUser: async () => {} };
  const server = createApi({ sessions: { verify: async token => token === 'admin-cookie' ? { uid: 'admin' } : null }, services: {
    getUser: async id => ({ id, ...db.data('users', id) }), workspace: role => loadWorkspace(db, role),
    createItem: (actor, input) => createItem(db, actor, input), createCustomer: (actor, input) => createCustomer(db, actor, input),
    updateCustomer: (actor, id, input) => updateCustomer(db, actor, id, input), saveSettings: (actor, input) => saveSettings(db, actor, input),
    createUser: (actor, input) => createWorkspaceUser(auth, db, actor, input)
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', input) => fetch(origin + '/api' + path, { method, headers: { Cookie: 'rent_play_session=admin-cookie', 'Content-Type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}) });
  try {
    const created = await request('/inventory', 'POST', equipmentInput);
    assert.equal(created.status, 201); const equipment = await created.json();
    const workspace = await request('/workspace'); assert.equal(workspace.status, 200);
    const log = (await workspace.json()).auditLogs.find(row => row.action === 'ITEM_CREATED');
    assert.equal(log.entity_id, equipment.id); assert.equal(log.entity_label, equipmentInput.name);
    assert.equal(log.actor_name, admin.full_name); assert.ok(log.created_at);
    assert.equal(log.old_values, undefined); assert.equal(log.new_values, undefined);
    const customer = await request('/customers', 'POST', customerInput); assert.equal(customer.status, 201);
    const customerId = (await customer.json()).customer.id;
    assert.equal((await request('/customers/' + customerId, 'PATCH', { ...customerInput, fullName: 'Ana Updated', user_id: 'spoofed' })).status, 200);
    assert.equal((await request('/settings', 'PATCH', { ...businessInput, user_id: 'spoofed' })).status, 200);
    assert.equal((await request('/users', 'POST', { fullName: 'Another Admin', email: 'other@example.test', password: 'SECRET-password-long', role: 'ADMIN', user_id: 'spoofed' })).status, 201);
    assert.deepEqual(db.records('audit_logs').map(row => row.user_id), Array(5).fill('admin'));
    assert.ok(!JSON.stringify(db.records('audit_logs')).includes('SECRET-password-long'));
    const count = db.records('audit_logs').length;
    assert.equal((await request('/inventory', 'POST', { ...equipmentInput, categoryId: 'missing' })).status, 400);
    assert.equal(db.records('audit_logs').length, count, 'failed additions must not appear as successful activity');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('customer edits, archive, restore, rates, pricing, and business settings record the authenticated actor', async () => {
  const db = fixture();
  const customer = await createCustomer(db, 'admin', customerInput);
  await updateCustomer(db, 'admin', customer.id, { ...customerInput, fullName: 'Ana Updated' });
  await updateCustomer(db, 'admin', customer.id, { action: 'archive' });
  await updateCustomer(db, 'admin', customer.id, { action: 'restore' });
  const rate = await saveRate(db, 'admin', { itemId: 'bike', rateType: 'HOURLY', rentalRate: 0, deposit: 0, latePenalty: 0 });
  const pricing = structuredClone(DEFAULT_PRICING); pricing.rules.password = 'SECRET-UNRECOGNIZED-RULE';
  await savePricing(db, 'admin', pricing); await saveSettings(db, 'admin', businessInput);
  const logs = db.records('audit_logs');
  assert.deepEqual(logs.map(row => row.action), ['CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'CUSTOMER_ARCHIVED', 'CUSTOMER_RESTORED', 'RATE_UPDATED', 'PRICING_UPDATED', 'BUSINESS_SETTINGS_UPDATED']);
  assert.ok(logs.every(row => row.user_id === 'admin' && row.created_at instanceof Date));
  assert.equal(logs[1].old_values.full_name, 'Ana Reyes'); assert.equal(logs[1].new_values.full_name, 'Ana Updated');
  assert.equal(logs[4].entity_id, rate.id); assert.equal(logs[4].new_values.rental_rate, 0);
  assert.ok(!JSON.stringify(logs).includes('SECRET-UNRECOGNIZED-RULE'));
});

test('account and profile activities exclude passwords, hashes, and other credential fields', async () => {
  const db = fixture(), auth = { createUser: async () => ({ uid: 'another-admin' }), deleteUser: async () => {},
    updateUser: async () => {}, getUser: async () => ({ displayName: admin.full_name, email: admin.email }) };
  await createWorkspaceUser(auth, db, 'admin', { fullName: 'Another Admin', email: 'other@example.test', password: 'SECRET-PASSWORD', role: 'ADMIN' });
  await db.collection('users').doc('another-admin').update({ password_hash: 'SECRET-HASH', token: 'SECRET-TOKEN' });
  await updateWorkspaceUser(auth, db, 'admin', 'another-admin', { role: 'ADMIN', isActive: false });
  await updateProfile(auth, db, 'admin', { fullName: 'Updated Admin', email: admin.email });
  const logs = db.records('audit_logs');
  assert.deepEqual(logs.map(row => row.action), ['USER_CREATED', 'USER_DEACTIVATED', 'PROFILE_UPDATED']);
  assert.ok(!JSON.stringify(logs).includes('SECRET'));
  assert.equal(logs[1].new_values.is_active, false);
});

test('a rejected audit commit rolls back the saved record and any new Firebase Auth account', async () => {
  const db = fixture(), batch = db.batch.bind(db), deleted = [];
  db.batch = () => ({ ...batch(), commit: async () => { throw Error('Commit rejected'); } });
  await assert.rejects(saveSettings(db, 'admin', businessInput), /Commit rejected/);
  assert.equal(db.data('settings', 'business'), undefined); assert.equal(db.records('audit_logs').length, 0);
  const auth = { createUser: async () => ({ uid: 'new-admin' }), deleteUser: async id => deleted.push(id) };
  await assert.rejects(createWorkspaceUser(auth, db, 'admin', { fullName: 'New Admin', email: 'new@example.test', password: 'secret-password-long', role: 'ADMIN' }), /Commit rejected/);
  assert.deepEqual(deleted, ['new-admin']); assert.equal(db.data('users', 'new-admin'), undefined);
  assert.equal(db.records('audit_logs').length, 0);
});

test('workspace delivers the latest 200 persisted activities with safe labels and preserves deleted-record names', async () => {
  const logs = Object.fromEntries(Array.from({ length: 210 }, (_, index) => ['log-' + index, { user_id: 'admin', actor_type: 'USER', action: 'ITEM_CREATED', entity_type: 'ITEM', entity_id: 'deleted-item',
    old_values: { name: 'Old basketball', token: 'SECRET-TOKEN' }, created_at: new Date(Date.UTC(2026, 9, 5, 0, 0, index)) }]));
  const db = memoryFirestore({ users: { admin }, audit_logs: logs });
  const workspace = await loadWorkspace(db, 'ADMIN');
  assert.equal(workspace.auditLogs.length, 200); assert.equal(workspace.auditLogs[0].id, 'log-209'); assert.equal(workspace.auditLogs[199].id, 'log-10');
  assert.equal(workspace.auditLogs[0].entity_label, 'Old basketball'); assert.equal(workspace.auditLogs[0].actor_name, admin.full_name);
  assert.ok(!JSON.stringify(workspace.auditLogs).includes('SECRET'));
  assert.deepEqual((await loadWorkspace(db, 'USER')).auditLogs, []);
});
