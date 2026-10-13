import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaintenanceUI, maintenanceStage, maintenanceOverdue, maintenanceReportableUnits } from '../src/maintenance.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
test('maintenance displays physical-unit tickets, truthful unknown costs and open workflow stages', () => {
  const model = { maintenance: [
    { id: 'physical-internal-ticket', maintenance_code: 'M-0001', item_id: 'bicycle-2', item_name: 'Bicycle', item_code: 'EQUIP-002', status: 'IN_PROGRESS', workflow_stage: 'REPORTED', reason: '<script>tyre</script>', repair_cost: null },
    { id: 'inspection', maintenance_code: 'M-0002', item_id: 'ball', item_name: 'Basketball', item_code: 'EQUIP-003', status: 'IN_PROGRESS', workflow_stage: 'AWAITING_INSPECTION', reason: 'Valve replaced', repair_cost: 0 },
    { id: 'closed', maintenance_code: 'M-0003', item_id: 'bicycle-1', item_name: 'Bicycle', item_code: 'EQUIP-001', status: 'RETIRED', reason: 'Cracked frame', repair_cost: null }
  ] };
  const ui = createMaintenanceUI({ model: () => model, escape: e, money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded' });
  const html = ui.render('', { paged: rows => ({ rows, footer: '' }), table: (heads, rows) => `<table>${rows}</table>`, empty: () => 'Empty' });
  assert.ok(html.includes('M-0001') && html.includes('EQUIP-002'));
  assert.ok(html.includes('Reported') && html.includes('For inspection'));
  assert.ok(html.includes('Not recorded') && html.includes('PHP 0'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('M-0003'));
  assert.ok(html.includes('data-record-id="physical-internal-ticket"'));
  assert.ok(!html.replace(/<[^>]*>/g, '').includes('physical-internal-ticket'));
  assert.ok(html.includes('1 of 3 tickets have recorded costs'));
});

test('reports identify one available physical unit and exclude rentals, reservations and duplicate tickets', () => {
  const model = {
    items: ['healthy', 'rented', 'reserved', 'repair', 'retired', 'legacy-rented'].map(id => ({ id, item_code: id, status: 'AVAILABLE', is_active: id !== 'retired', ...(id === 'reserved' ? { reserved_rental_id: 'request' } : {}) })),
    transactions: [{ item_id: 'rented', status: 'ACTIVE' }, { itemId: 'legacy-rented', status: 'APPROVED' }],
    maintenance: [{ item_id: 'repair', status: 'OPEN' }]
  };
  assert.deepEqual(maintenanceReportableUnits(model).map(row => row.id), ['healthy']);
});

test('legacy service records have clear stages and target dates use Manila calendar boundaries', () => {
  assert.equal(maintenanceStage({ status: 'OPEN' }), 'REPORTED');
  assert.equal(maintenanceStage({ status: 'IN_PROGRESS' }), 'IN_REPAIR');
  assert.equal(maintenanceStage({ status: 'RETIRED' }), 'RETIRED');
  const row = { status: 'IN_PROGRESS', target_date: '2026-10-13' };
  assert.equal(maintenanceOverdue(row, new Date('2026-10-13T15:59:00Z')), false);
  assert.equal(maintenanceOverdue(row, new Date('2026-10-13T16:01:00Z')), true);
  assert.equal(maintenanceOverdue({ ...row, status: 'COMPLETED' }, new Date('2026-10-14T16:01:00Z')), false);
});
