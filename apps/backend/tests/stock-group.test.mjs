import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createItem, inventoryDetail, inventoryList, itemAction, setItemQuantity, updateItem } from '../src/inventory.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';
import { updateMaintenance } from '../src/maintenance.mjs';

const input = { categoryId: 'sports', name: 'Bicycle', description: 'Rental bicycle', condition: 'GOOD', rateType: 'HOURLY', rentalRate: 200, latePenalty: 100, quantity: 3 };
async function fixture(quantity = 3) {
  const db = memoryFirestore({ item_categories: { sports: { name: 'Sports' }, outdoor: { name: 'Outdoor' } } });
  const created = await createItem(db, 'admin', { ...input, quantity });
  const item = (await inventoryDetail(db, created.id)).item;
  return { db, created, item };
}
const values = (item, overrides = {}) => ({ ...input, scope: 'stock', version: item.updated_at, stockVersion: item.stock_version, ...overrides });

test('saving shared details and increasing stock keeps one group and every existing QR', async () => {
  const { db, created, item } = await fixture();
  await updateItem(db, 'admin', item.id, values(item, { name: 'Mountain bicycle', categoryId: 'outdoor', description: 'Updated notes', rentalRate: 250, quantity: 5 }));
  const detail = await inventoryDetail(db, item.id), units = detail.units;
  assert.equal(units.length, 5);
  assert.ok(units.every(unit => unit.stock_group_id === created.stock_group_id && unit.name === 'Mountain bicycle' && unit.category_id === 'outdoor' && unit.description === 'Updated notes' && unit.rental_rate === 250 && unit.total_quantity === 5));
  assert.deepEqual(units.filter(unit => created.ids.includes(unit.id)).map(unit => unit.item_code).sort(), [...created.codes].sort());
  assert.equal(new Set(units.map(unit => unit.qr_token)).size, 5);
  assert.equal(new Set(units.map(unit => unit.stock_version)).size, 1);
  assert.notEqual(detail.item.stock_version, item.stock_version);
  assert.equal(detail.rates.length, 2);
});

test('a protected reduction rolls back equipment details, prices, and stock together', async () => {
  const { db, created } = await fixture();
  await db.collection('items').doc(created.ids[1]).update({ status: 'RENTED' });
  await db.collection('rentals').doc('rental').set({ item_id: created.ids[1], status: 'ACTIVE' });
  const item = (await inventoryDetail(db, created.id)).item, before = db.records('audit_logs').length;
  await assert.rejects(updateItem(db, 'admin', item.id, values(item, { name: 'Must not save', rentalRate: 333, quantity: 0 })), error => error.status === 409);
  const units = (await inventoryDetail(db, item.id)).units;
  assert.ok(units.every(unit => unit.name === 'Bicycle' && unit.rental_rate === 200 && unit.total_quantity === 3));
  assert.equal(db.records('audit_logs').length, before);
});

test('a valid reduction keeps the group anchor and protects reserved and maintained units', async () => {
  const { db, created } = await fixture(4);
  await db.collection('rentals').doc('pending').set({ itemId: created.ids[1], status: 'pending_verification' });
  await db.collection('maintenance_records').doc('repair').set({ item_id: created.ids[2], status: 'IN_PROGRESS' });
  const item = (await inventoryDetail(db, created.id)).item;
  await updateItem(db, 'admin', item.id, values(item, { name: 'Shared bike', quantity: 3 }));
  const units = (await inventoryDetail(db, created.id)).units;
  assert.equal(units.find(unit => unit.id === created.id).is_active, true);
  assert.equal(units.find(unit => unit.id === created.ids[1]).effective_status, 'RESERVED_PENDING');
  assert.equal(units.find(unit => unit.id === created.ids[2]).effective_status, 'UNDER_MAINTENANCE');
  assert.equal(units.find(unit => unit.id === created.ids[3]).is_active, false);
  assert.equal(units[0].available_quantity, 1);
  assert.equal(units[0].total_quantity, 3);
});

test('a sibling change rejects a stale stock editor even when its selected unit did not change', async () => {
  const { db, created, item } = await fixture();
  const sibling = (await inventoryDetail(db, created.ids[1])).item;
  await itemAction(db, 'admin', sibling.id, { action: 'maintenance', reason: 'Inspect tyre', condition: 'NEEDS_INSPECTION', version: sibling.updated_at });
  await assert.rejects(updateItem(db, 'admin', item.id, values(item, { name: 'Stale save' })), error => error.status === 409 && /stock changed/.test(error.message));
  assert.equal((await inventoryDetail(db, created.id)).item.name, 'Bicycle');
});

test('shared editing preserves individual conditions and maintenance history', async () => {
  const { db, created } = await fixture();
  const sibling = (await inventoryDetail(db, created.ids[1])).item;
  await itemAction(db, 'admin', sibling.id, { action: 'maintenance', reason: 'Repair tyre', condition: 'DAMAGED', version: sibling.updated_at });
  const item = (await inventoryDetail(db, created.id)).item;
  await updateItem(db, 'admin', item.id, values(item, { name: 'Touring bicycle', rentalRate: 225 }));
  const maintained = (await inventoryDetail(db, sibling.id));
  assert.equal(maintained.item.condition_status, 'DAMAGED');
  assert.equal(maintained.item.status, 'UNDER_MAINTENANCE');
  assert.equal(maintained.maintenance[0].reason, 'Repair tyre');
  assert.ok(maintained.units.every(unit => unit.name === 'Touring bicycle' && unit.stock_group_id === created.stock_group_id));
});

test('a product change is blocked by a rental on any sibling', async () => {
  const { db, created } = await fixture();
  await db.collection('rentals').doc('pending').set({ item_id: created.ids[2], status: 'PENDING_VERIFICATION' });
  const item = (await inventoryDetail(db, created.id)).item;
  await assert.rejects(updateItem(db, 'admin', item.id, values(item, { pricingProductId: 'bike', quantity: 4 })), error => error.status === 409);
  assert.equal((await inventoryDetail(db, item.id)).units.length, 3);
});

test('zero stock remains one restorable group with its original unit history', async () => {
  const { db, created, item } = await fixture();
  await updateItem(db, 'admin', item.id, values(item, { quantity: 0 }));
  let detail = await inventoryDetail(db, created.id);
  assert.ok(detail.units.every(unit => unit.is_active === false));
  await updateItem(db, 'admin', detail.item.id, values(detail.item, { name: 'Restocked bicycle', quantity: 2 }));
  detail = await inventoryDetail(db, created.id);
  assert.equal(detail.units.filter(unit => unit.is_active).length, 2);
  assert.equal(detail.units.length, 5);
  assert.ok(detail.units.every(unit => unit.stock_group_id === created.stock_group_id));
  assert.ok(detail.units.filter(unit => unit.is_active).every(unit => unit.name === 'Restocked bicycle'));
});

test('adding units to equipment in maintenance creates healthy available units', async () => {
  const { db, item } = await fixture(1);
  await itemAction(db, 'admin', item.id, { action: 'maintenance', reason: 'Repair', condition: 'DAMAGED', version: item.updated_at });
  const maintained = (await inventoryDetail(db, item.id)).item;
  await updateItem(db, 'admin', item.id, values(maintained, { condition: 'DAMAGED', quantity: 2 }));
  const units = (await inventoryDetail(db, item.id)).units;
  assert.equal(units.find(unit => unit.id !== item.id).condition_status, 'GOOD');
  assert.equal(units.find(unit => unit.id !== item.id).status, 'AVAILABLE');
});

test('legacy units can save shared details and stock without splitting', async () => {
  const db = memoryFirestore({ item_categories: { sports: { name: 'Sports' } }, items: { legacy: { name: 'Legacy bicycle', category_id: 'sports', item_code: 'EQUIP-010', status: 'AVAILABLE', condition_status: 'GOOD', is_active: true } } });
  const item = (await inventoryDetail(db, 'legacy')).item;
  await updateItem(db, 'admin', item.id, values(item, { quantity: 3 }));
  const units = (await inventoryList(db)).items;
  assert.equal(units.length, 3);
  assert.ok(units.every(unit => unit.stock_group_id === 'legacy' && unit.rental_rate === 200));
  const original = units.find(unit => unit.id === 'legacy');
  assert.equal(original.item_code, 'EQUIP-010');
});

test('archiving a group rejects a stale group version', async () => {
  const { db, item } = await fixture();
  await setItemQuantity(db, 'admin', item.id, { quantity: 4 });
  await assert.rejects(setItemQuantity(db, 'admin', item.id, { quantity: 0, stockVersion: item.stock_version }), error => error.status === 409);
});

test('blank and nonnumeric stock values cannot accidentally archive a group', async () => {
  const { db, item } = await fixture();
  for (const quantity of [null, '', ' ', true, false, undefined, 1.5, -1, 51]) await assert.rejects(setItemQuantity(db, 'admin', item.id, { quantity }), error => error.status === 400);
  assert.equal((await inventoryDetail(db, item.id)).item.total_quantity, 3);
});

test('legacy lowercase statuses share a consistent stock version during editing', async () => {
  const { db, created } = await fixture(1);
  await db.collection('items').doc(created.id).update({ status: 'available' });
  const item = (await inventoryDetail(db, created.id)).item;
  await updateItem(db, 'admin', item.id, values(item, { quantity: 2 }));
  assert.equal((await inventoryDetail(db, created.id)).item.total_quantity, 2);
});

test('open repair records hide availability and can be completed despite a stale raw status', async () => {
  const { db, item } = await fixture(1);
  await db.collection('items').doc(item.id).update({ condition_status: 'DAMAGED' });
  await db.collection('maintenance_records').doc('repair').set({ item_id: item.id, status: 'OPEN', reason: 'Repair frame' });
  let current = (await inventoryDetail(db, item.id)).item;
  assert.equal(current.effective_status, 'UNDER_MAINTENANCE');
  assert.equal(current.available_quantity, 0);
  await updateItem(db, 'admin', item.id, values(current, { condition: 'DAMAGED', quantity: 1, name: 'Repairing bike' }));
  current = (await inventoryDetail(db, item.id)).item;
  await assert.rejects(itemAction(db, 'admin', item.id, { action: 'complete-maintenance', condition: 'GOOD', reason: 'Frame checked', version: current.updated_at }), error => error.status === 409);
  let ticket = { id: 'repair', ...db.data('maintenance_records', 'repair') };
  for (const action of ['start-repair', 'send-inspection', 'complete']) ticket = (await updateMaintenance(db, 'admin', ticket.id, { action, revision: Number(ticket.revision || 0), note: 'Frame checked', condition: 'GOOD', checks: { functional: true, safe: true, complete: true } })).maintenance;
  const completed = await inventoryDetail(db, item.id);
  assert.equal(completed.item.available_quantity, 1);
  assert.equal(completed.maintenance[0].status, 'COMPLETED');
});

test('units awaiting inspection cannot be archived even when legacy rental links are missing', async () => {
  const { db, item } = await fixture(1);
  await db.collection('items').doc(item.id).update({ status: 'UNDER_INSPECTION' });
  const current = (await inventoryDetail(db, item.id)).item;
  await assert.rejects(itemAction(db, 'admin', item.id, { action: 'archive', version: current.updated_at }), error => error.status === 409);
  await assert.rejects(setItemQuantity(db, 'admin', item.id, { quantity: 0 }), error => error.status === 409);
  assert.equal((await inventoryDetail(db, item.id)).item.is_active, true);
});
