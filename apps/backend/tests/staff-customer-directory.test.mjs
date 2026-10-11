import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspace } from '../src/workspace.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

for (const [label, role, mobile] of [['owner web', 'OWNER', false], ['operator web', 'OPERATOR', false], ['mobile staff', 'OPERATOR', true]]) {
  test(`${label} customer directory excludes staff and preserves their historical records`, async () => {
    const staffRoles = { operator: 'OPERATOR', legacyOperator: 'admin', owner: 'OWNER', legacyOwner: 'SUPER_ADMIN', inactiveOperator: 'OPERATOR', protectedOwner: 'USER' };
    const customers = {
      customer: { full_name: 'Current Customer', auth_uid: 'customer', is_active: true },
      archivedCustomer: { full_name: 'Archived Customer', auth_uid: 'archivedCustomer', is_active: false },
      walkIn: { full_name: 'Walk In Customer', is_active: true },
      orphan: { full_name: 'Historical Customer', auth_uid: 'missing-profile', is_active: false },
      ...Object.fromEntries(Object.keys(staffRoles).map(id => [id, { full_name: `Historical ${id}`, auth_uid: id, is_active: true }])),
    };
    const users = {
      customer: { full_name: 'Current Customer', role: 'CUSTOMER', is_active: true },
      archivedCustomer: { full_name: 'Archived Customer', role: 'USER', is_active: false },
      ...Object.fromEntries(Object.entries(staffRoles).map(([id, staffRole]) => [id, { full_name: `Staff ${id}`, role: staffRole, is_active: id !== 'inactiveOperator' }])),
    };
    const db = memoryFirestore({ customers, users, rentals: { oldRental: { rental_code: 'R-OLD', customer_id: 'operator', status: 'COMPLETED' } } });
    const result = await loadWorkspace(db, role, new Date('2026-10-11T05:00:00Z'), { ownerUid: 'protectedOwner', mobile });

    assert.deepEqual(result.customers.map(customer => customer.id).sort(), ['archivedCustomer', 'customer', 'orphan', 'walkIn']);
    assert.equal(result.transactions[0].customer_id, 'operator');
    assert.equal(result.transactions[0].customer_name, 'Historical operator');
    assert.deepEqual(db.data('customers', 'operator'), customers.operator);
    assert.deepEqual(db.data('users', 'operator'), users.operator);
    if (role === 'OWNER') assert.equal(result.users.find(user => user.id === 'operator').role, 'OPERATOR');
  });
}
