import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupInventory, stockMatchesSearch, stockMatchesStatus, inventoryStockCounts } from '../src/inventory-stock.js';

const unit = (id, changes = {}) => ({ id, stock_group_id: 'bike-1', item_code: `EQUIP-00${id}`, name: 'Bicycle', category_id: 'sports', category: 'Sports', description: 'Rental bike', is_active: true, status: 'AVAILABLE', effective_status: 'AVAILABLE', condition_status: 'GOOD', available_quantity: 3, total_quantity: 3, ...changes });

test('physical stock becomes one row without multiplying the repeated totals', () => {
  const rows = groupInventory([unit('1'), unit('2'), unit('3')]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total_quantity, 3);
  assert.equal(rows[0].available_quantity, 3);
  assert.equal(rows[0].visible_units.length, 3);
  assert.deepEqual(rows[0].units.map(item => item.item_code), ['EQUIP-001', 'EQUIP-002', 'EQUIP-003']);
});

test('mixed groups show unit counts and match every applicable status filter', () => {
  const items = [unit('1'), unit('2', { effective_status: 'RENTED', status: 'RENTED', condition_status: 'FAIR' }), unit('3', { effective_status: 'UNDER_MAINTENANCE', status: 'UNDER_MAINTENANCE', condition_status: 'DAMAGED' })];
  const [group] = groupInventory(items);
  assert.equal(group.effective_status, 'MIXED');
  assert.equal(group.condition_status, 'MIXED');
  assert.equal(group.available_quantity, 1);
  assert.equal(group.rented_quantity, 1);
  assert.equal(group.maintenance_quantity, 1);
  for (const status of ['AVAILABLE', 'RENTED', 'UNDER_MAINTENANCE']) assert.equal(stockMatchesStatus(group, status), true);
  assert.equal(stockMatchesStatus(group, 'RESERVED_PENDING'), false);
  assert.deepEqual(inventoryStockCounts(items), [3, 1, 1, 1]);
});

test('searching a sibling QR code finds its whole equipment group', () => {
  const [group] = groupInventory([unit('1'), unit('2'), unit('3')]);
  assert.equal(stockMatchesSearch(group, '  equip-003  '), true);
  assert.equal(stockMatchesSearch(group, 'rental bike'), true);
  assert.equal(stockMatchesSearch(group, 'unknown'), false);
});

test('stock reductions hide archived units from active rows and show one archive row', () => {
  const items = [unit('1'), unit('2', { is_active: false, status: 'INACTIVE', effective_status: 'INACTIVE' }), unit('3', { is_active: false, status: 'INACTIVE', effective_status: 'INACTIVE' })];
  const [live] = groupInventory(items), [archived] = groupInventory(items, 'archived');
  assert.equal(live.total_quantity, 1);
  assert.equal(live.available_quantity, 1);
  assert.equal(live.archived_quantity, 2);
  assert.equal(archived.visible_units.length, 2);
  assert.equal(archived.total_quantity, 1);
  assert.equal(stockMatchesSearch(live, 'EQUIP-003'), false);
  assert.equal(stockMatchesSearch(archived, 'EQUIP-003'), true);
  assert.deepEqual(inventoryStockCounts(items), [1, 1, 0, 0]);
});

test('fully archived stock leaves the active list and remains grouped in archive', () => {
  const items = [unit('1'), unit('2')].map(item => ({ ...item, is_active: false, status: 'INACTIVE', effective_status: 'INACTIVE' }));
  assert.equal(groupInventory(items).length, 0);
  assert.equal(groupInventory(items, 'archived').length, 1);
  assert.equal(groupInventory(items, 'archived')[0].total_quantity, 0);
});

test('same-named equipment in distinct stock groups is kept separate', () => {
  const items = [unit('1'), unit('2', { stock_group_id: 'other-bike' }), unit('legacy', { stock_group_id: undefined })];
  assert.equal(groupInventory(items).length, 3);
});

test('inspection units count as out and remain filterable', () => {
  const items = [unit('1', { status: 'UNDER_INSPECTION', effective_status: 'UNDER_INSPECTION' }), unit('2', { status: 'AVAILABLE', effective_status: 'RESERVED_PENDING' })];
  const [group] = groupInventory(items);
  assert.deepEqual(inventoryStockCounts(items), [2, 0, 2, 0]);
  assert.equal(group.rented_quantity, 1);
  assert.equal(group.reserved_quantity, 1);
  assert.equal(stockMatchesStatus(group, 'UNDER_INSPECTION'), true);
});

test('archive rows use the current shared catalog without losing archived unit identities', () => {
  const items = [unit('1', { name: 'Updated bicycle', rental_rate: 250 }), unit('2', { name: 'Old bicycle name', rental_rate: 200, is_active: false, status: 'INACTIVE', effective_status: 'INACTIVE' })];
  const [archived] = groupInventory(items, 'archived');
  assert.equal(archived.name, 'Updated bicycle');
  assert.equal(archived.rental_rate, 250);
  assert.equal(archived.id, '2');
  assert.equal(archived.is_active, false);
  assert.equal(archived.visible_units[0].item_code, 'EQUIP-002');
  assert.equal(archived.visible_units[0].name, 'Old bicycle name');
  assert.equal(stockMatchesSearch(archived, 'updated bicycle'), true);
});
