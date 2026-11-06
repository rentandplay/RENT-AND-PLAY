import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomer, loadWorkspace, createWorkspaceUser, updateCustomer, saveTermsSettings, saveRulesSettings, saveReceiptSettings, saveSettings } from '../src/workspace.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

test('customer validation normalizes safe directory fields', () => {
  assert.deepEqual(validateCustomer({ fullName: '  Maria Santos ', code: ' cust-001 ', email: 'MARIA@EXAMPLE.COM', phone: ' 09171234567 ', address: ' Los Baños ' }), { full_name: 'Maria Santos', search_name: 'maria santos', customer_code: 'CUST-001', email: 'maria@example.com', phone: '09171234567', address: 'Los Baños' });
});

test('mobile staff workspace includes exact-unit open and closed maintenance history', async () => {
  const db = memoryFirestore({
    items: { bike: { name: 'Bicycle', item_code: 'EQUIP-001', status: 'UNDER_MAINTENANCE' } },
    maintenance_records: {
      open: { maintenance_code: 'M-0001', item_id: 'bike', status: 'IN_PROGRESS', workflow_stage: 'AWAITING_INSPECTION', revision: 3, started_at: new Date('2026-10-14T01:00:00Z') },
      closed: { maintenance_code: 'M-0002', item_id: 'bike', status: 'COMPLETED', revision: 4, started_at: new Date('2026-10-13T01:00:00Z') }
    }
  });
  const mobile = await loadWorkspace(db, 'OPERATOR', new Date('2026-10-14T02:00:00Z'), { mobile: true });
  const web = await loadWorkspace(db, 'OPERATOR');
  assert.deepEqual(mobile.maintenance, web.maintenance);
  assert.equal(mobile.maintenance.length, 2);
  assert.equal(mobile.maintenance[0].item_code, 'EQUIP-001');
  assert.equal(mobile.maintenance[0].revision, 3);
});

test('customer validation rejects unsafe or incomplete records', () => {
  for (const value of [{ fullName: '', code: 'C-1' }, { fullName: 'Customer', code: 'bad code' }, { fullName: 'Customer', code: 'CUST-1', email: 'invalid' }]) assert.throws(() => validateCustomer(value), error => error.status === 400);
});

test('workspace account creation stores canonical staff roles and rejects customer roles', async () => {
  const auth = { createUser: async input => ({ uid: 'admin-uid', ...input }), deleteUser: async () => { } };
  const db = memoryFirestore();
  const details = { fullName: 'Test Operator', email: 'admin@example.test', password: 'TestPassword9', confirmPassword: 'TestPassword9' }, options = { validateEmail: async value => value };
  for (const role of ['USER', 'CUSTOMER']) await assert.rejects(() => createWorkspaceUser(auth, db, 'actor-admin', { ...details, role }), error => error.status === 400);
  const result = await createWorkspaceUser(auth, db, 'actor-admin', { ...details, role: 'OPERATOR' }, new Date(), options);
  assert.equal(result.role, 'OPERATOR');
  assert.equal(db.data('users', 'admin-uid').role, 'OPERATOR');
  assert.equal(db.data('users', 'admin-uid').is_active, true);
  const ownerDb = memoryFirestore();
  const owner = await createWorkspaceUser(auth, ownerDb, 'actor-owner', { ...details, fullName: 'Test Owner', role: 'OWNER' }, new Date(), options);
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

test('saveTermsSettings saves dynamic terms and records audit trail', async () => {
  const db = memoryFirestore();
  const input = {
    termsAndConditions: 'Custom Terms: Play responsibly and return on time.',
    rentalTerms: 'Custom Rental Policy: Check accessories at handover.'
  };
  const result = await saveTermsSettings(db, 'owner-uid', input, new Date('2026-10-20T10:00:00Z'));
  assert.equal(result.terms_and_conditions, input.termsAndConditions);
  assert.equal(result.rental_terms, input.rentalTerms);
  assert.ok(result.terms_version.startsWith('v-20261020-'));

  const saved = db.data('settings', 'business');
  assert.equal(saved.terms_and_conditions, input.termsAndConditions);
  assert.equal(saved.rental_terms, input.rentalTerms);
  assert.equal(saved.terms_version, result.terms_version);

  // Load workspace should reflect saved terms
  const workspace = await loadWorkspace(db, 'OWNER', new Date('2026-10-20T10:05:00Z'));
  assert.equal(workspace.settings.terms_and_conditions, input.termsAndConditions);
  assert.equal(workspace.settings.rental_terms, input.rentalTerms);
});

test('saveTermsSettings rejects empty terms', async () => {
  const db = memoryFirestore();
  await assert.rejects(() => saveTermsSettings(db, 'owner-uid', { termsAndConditions: '' }), error => error.status === 400);
});


test('saveRulesSettings and saveReceiptSettings save and record audit trail', async () => {
  const db = memoryFirestore();
  const rules = await saveRulesSettings(db, 'owner-uid', {
    defaultOvertimeRate: 150,
    lostPieceFee: 75,
    securityDepositNote: 'Custom deposit note',
    damagePolicyNote: 'Custom damage policy'
  }, new Date('2026-10-20T10:00:00Z'));
  assert.equal(rules.default_overtime_rate, 150);
  assert.equal(rules.lost_piece_fee, 75);
  assert.equal(rules.security_deposit_note, 'Custom deposit note');

  const receipt = await saveReceiptSettings(db, 'owner-uid', {
    receiptHeaderTitle: 'MY STORE',
    receiptBranchLine: 'Branch 1',
    receiptCityLine: 'City 1',
    receiptContactLine: '09123456789',
    receiptFooterNote: 'Custom footer note'
  }, new Date('2026-10-20T10:00:00Z'));
  assert.equal(receipt.receipt_header_title, 'MY STORE');
  assert.equal(receipt.receipt_footer_note, 'Custom footer note');

  const saved = db.data('settings', 'business');
  assert.equal(saved.default_overtime_rate, 150);
  assert.equal(saved.lost_piece_fee, 75);
  assert.equal(saved.receipt_header_title, 'MY STORE');
});
