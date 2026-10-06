import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/server.mjs';
import * as inventory from '../src/inventory.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const input = { categoryId: 'sports', name: 'QA Basketball', condition: 'GOOD', rateType: 'HOURLY', rentalRate: 50.25, deposit: 100, latePenalty: 10.50 };
async function fixture(callback) {
  const db = memoryFirestore({ users: { admin: { full_name: 'Test Admin', email: 'admin@example.test', role: 'ADMIN', is_active: true } }, item_categories: { sports: { name: 'Sports equipment' }, board: { name: 'Board games' } } });
  const server = createApi({ sessions: { verify: async token => token === 'test-cookie' ? { uid: 'admin' } : null }, services: {
    getUser: async id => ({ id, ...db.data('users', id) }), inventoryList: () => inventory.inventoryList(db), inventoryDetail: id => inventory.inventoryDetail(db, id), inventoryQr: id => inventory.inventoryQr(db, id), inventoryQrLabels: () => inventory.inventoryQrLabels(db),
    createItem: (actor, values) => inventory.createItem(db, actor, values), updateItem: (actor, id, values) => inventory.updateItem(db, actor, id, values), itemAction: (actor, id, values) => inventory.itemAction(db, actor, id, values), deleteArchivedItem: (actor, id, values) => inventory.deleteArchivedItem(db, actor, id, values),
    createItemCategory: (actor, values) => inventory.createItemCategory(db, actor, values), deleteItemCategory: (actor, id) => inventory.deleteItemCategory(db, actor, id)
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(origin + '/api' + path, { method, headers: { Cookie: 'rent_play_session=test-cookie', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try { await callback({ db, request }); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('equipment API creates stable QR labels, edits prices with history, and rejects stale writes', () => fixture(async ({ db, request }) => {
  const created = await request('/inventory', 'POST', input); assert.equal(created.status, 201);
  const id = created.data.id, path = '/inventory/' + id;
  const original = await request(path), firstQr = await request(path + '/qr');
  assert.equal(original.status, 200); assert.equal(firstQr.status, 200); assert.ok(firstQr.data.matrix.size > 0);
  const saved = await request(path, 'PATCH', { ...input, name: 'Updated basketball', rentalRate: 60.75, version: original.data.item.updated_at });
  assert.equal(saved.status, 200);
  const updated = await request(path), secondQr = await request(path + '/qr');
  assert.equal(updated.data.item.rental_rate, 60.75); assert.equal(updated.data.rates.length, 2);
  assert.equal(updated.data.rates.filter(rate => rate.is_active).length, 1); assert.equal(secondQr.data.token, firstQr.data.token);
  assert.equal(updated.data.item.item_code, original.data.item.item_code);
  assert.equal((await request(path, 'PATCH', { ...input, version: 'stale timestamp' })).status, 409);
  assert.equal((await request('/inventory/qr-labels')).data.items.length, 1);
  assert.deepEqual(db.records('audit_logs').map(row => row.user_id), ['admin', 'admin']);
}));

test('maintenance, archive, restore, and delete preserve history and enforce availability guards', () => fixture(async ({ db, request }) => {
  const created = await request('/inventory', 'POST', input), id = created.data.id, path = '/inventory/' + id;
  const action = async (name, extra = {}) => {
    const current = (await request(path)).data.item;
    return request(path + '/actions', 'POST', { action: name, version: current.updated_at, ...extra });
  };
  assert.equal((await action('maintenance', { reason: 'Inspect the valve', condition: 'NEEDS_INSPECTION' })).status, 200);
  assert.equal((await request(path)).data.item.status, 'UNDER_MAINTENANCE');
  assert.equal((await action('archive')).status, 409);
  assert.equal((await action('complete-maintenance', { reason: 'Valve tested and repaired', condition: 'GOOD' })).status, 200);
  const maintained = (await request(path)).data;
  assert.equal(maintained.item.status, 'AVAILABLE'); assert.equal(maintained.maintenance[0].status, 'COMPLETED'); assert.equal(maintained.maintenance[0].details, 'Valve tested and repaired');
  assert.equal((await request(path, 'DELETE', { version: maintained.item.updated_at })).status, 409);
  assert.equal((await action('archive')).status, 200); assert.equal((await request(path)).data.item.is_active, false);
  assert.equal((await action('restore')).status, 200); assert.equal((await request(path)).data.item.is_active, true);
  await db.collection('rentals').doc('pending').set({ item_id: id, status: 'PENDING_VERIFICATION' });
  assert.equal((await action('archive')).status, 409); assert.equal((await action('maintenance', { reason: 'Inspection', condition: 'GOOD' })).status, 409);
  await db.collection('rentals').doc('pending').update({ status: 'CANCELLED' });
  assert.equal((await action('archive')).status, 200);
  const archived = (await request(path)).data.item;
  assert.equal((await request(path, 'DELETE', { version: 'stale' })).status, 409);
  assert.equal((await request(path, 'DELETE', { version: archived.updated_at })).status, 200);
  assert.equal((await request(path)).status, 404);
  assert.equal(db.records('maintenance_records').length, 1); assert.equal(db.records('item_rates').length, 1); assert.equal(db.records('rentals').length, 1);
  assert.equal(db.records('audit_logs').at(-1).action, 'ITEM_DELETED');
}));

test('category API rejects duplicates and in-use categories, removes empty categories, and keeps one category', () => fixture(async ({ db, request }) => {
  await request('/inventory', 'POST', input);
  assert.equal((await request('/item-categories', 'POST', { name: '  sports   equipment ' })).status, 409);
  assert.equal((await request('/item-categories/sports', 'DELETE')).status, 409);
  const added = await request('/item-categories', 'POST', { name: 'Outdoor games' }); assert.equal(added.status, 201);
  assert.equal((await request('/item-categories/' + added.data.category.id, 'DELETE')).status, 200);
  assert.equal((await request('/item-categories/board', 'DELETE')).status, 200);
  assert.equal((await request('/item-categories/sports', 'DELETE')).status, 409);
  assert.equal(db.records('item_categories').length, 1);
}));
