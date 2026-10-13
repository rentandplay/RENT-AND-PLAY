import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaintenance, updateMaintenance, maintenanceDetail, maintenancePhoto } from '../src/maintenance.mjs';
import { maintenanceStage } from '../src/maintenance-state.mjs';
import { createItem, inventoryDetail, inventoryList, itemAction, setItemQuantity } from '../src/inventory.mjs';
import { quoteEquipmentRental } from '../src/transactions.mjs';
import { createBooking, prepareRentalDelivery, releaseBooking, recordRentalReceipt, completeRentalReturn } from '../src/rental-flow.mjs';
import { DEFAULT_PRICING } from '../src/pricing.mjs';
import { createApi, createFirebaseServices } from '../src/server.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const now = new Date('2026-10-13T04:00:00Z'), later = minutes => new Date(+now + minutes * 60000);
const actor = { id: 'admin', full_name: 'Operator', role: 'OWNER', is_active: true };
const checks = { functional: true, safe: true, complete: true };
const photo = { imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', caption: 'Broken tyre' };
async function fixture(quantity = 5) {
  const db = memoryFirestore({ users: { admin: actor, operator: { full_name: 'Technician', role: 'OPERATOR', is_active: true }, customer: { role: 'CUSTOMER', is_active: true }, inactive: { role: 'OPERATOR', is_active: false } }, customers: { customer: { full_name: 'Guest', is_active: true } }, item_categories: { sports: { name: 'Sports' } }, settings: { pricing: structuredClone(DEFAULT_PRICING) } });
  const group = await createItem(db, 'admin', { name: 'Bicycle', categoryId: 'sports', condition: 'GOOD', quantity, rateType: 'HOURLY', rentalRate: 200, latePenalty: 200 });
  for (const rate of db.records('item_rates')) await db.collection('item_rates').doc(rate.id).update({ effective_from: later(-1) });
  const item = (await inventoryDetail(db, group.id)).item;
  return { db, group, item };
}
const report = (db, item, extra = {}) => createMaintenance(db, actor, { itemId: item.id, version: item.updated_at, condition: 'DAMAGED', reason: 'Flat tyre', ...extra }, now);
async function step(db, row, action, extra = {}) {
  return (await updateMaintenance(db, actor, row.id, { action, revision: Number(row.revision || 0), note: 'Work recorded', ...extra }, later(Number(row.revision || 0) + 1))).maintenance;
}
async function ready(db, ticket) {
  return step(db, await step(db, ticket, 'start-repair'), 'send-inspection', { repairCost: 150.50, note: 'Tyre replaced and checked.' });
}

test('one damaged unit removes only its availability and keeps grouped stock, QR and history', async () => {
  const { db, group, item } = await fixture();
  const token = db.data('items', item.id).qr_token;
  const { maintenance } = await report(db, item, { assignedTo: 'operator', targetDate: '2026-10-15', photos: [photo] });
  const detail = await inventoryDetail(db, group.id);
  assert.equal(detail.item.total_quantity, 5);
  assert.equal(detail.item.available_quantity, 4);
  assert.equal(detail.item.maintenance_quantity, 1);
  assert.equal(db.data('items', item.id).qr_token, token);
  assert.equal(maintenance.maintenance_code, 'M-0001');
  assert.equal(maintenance.workflow_stage, 'REPORTED');
  assert.equal(maintenance.assigned_name, 'Technician');
  assert.equal(maintenance.photos.length, 1);
  assert.ok(!JSON.stringify(maintenance).includes(photo.imageData));
  assert.equal((await maintenancePhoto(db, maintenance.id, maintenance.photos[0].id)).image_data, photo.imageData);
  await assert.rejects(maintenancePhoto(db, 'other-ticket', maintenance.photos[0].id), error => error.status === 404);
});

test('simultaneous reports create one ticket and stale updates cannot overwrite a newer repair', async () => {
  const { db, item } = await fixture();
  const results = await Promise.allSettled([report(db, item), report(db, item)]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(db.records('maintenance_records').length, 1);
  assert.equal(db.data('counters', 'record_codes_M').next_sequence, 2);
  const ticket = results.find(row => row.status === 'fulfilled').value.maintenance;
  await step(db, ticket, 'start-repair');
  await assert.rejects(step(db, ticket, 'update', { repairCost: 900 }), error => error.status === 409);
  assert.equal(db.data('maintenance_records', ticket.id).repair_cost, null);
});

test('rented and reserved units must go through Returns rather than manual maintenance', async () => {
  for (const rental of [{ item_id: 'unit', status: 'ACTIVE' }, { itemId: 'unit', status: 'PENDING_ADMIN_APPROVAL' }]) {
    const { db, item } = await fixture();
    await db.collection('rentals').doc('busy').set({ ...rental, ...(rental.item_id ? { item_id: item.id } : { itemId: item.id }) });
    await assert.rejects(report(db, item), error => error.status === 409 && /Returns/.test(error.message));
    assert.equal(db.records('maintenance_records').length, 0);
  }
});

test('inspection is a required separate step and failed inspection keeps the unit unavailable', async () => {
  const { db, item } = await fixture();
  let row = (await report(db, item)).maintenance;
  await assert.rejects(step(db, row, 'complete', { condition: 'GOOD', checks }), error => error.status === 409);
  row = await ready(db, row);
  await assert.rejects(step(db, row, 'complete', { condition: 'GOOD', checks: { ...checks, safe: false } }), error => error.status === 400);
  assert.equal((await inventoryDetail(db, item.id)).item.available_quantity, 4);
  row = await step(db, row, 'inspection-failed', { note: 'Brake still loose.' });
  assert.equal(row.workflow_stage, 'IN_REPAIR');
  row = await step(db, row, 'send-inspection', { note: 'Brake fixed.' });
  row = await step(db, row, 'complete', { condition: 'GOOD', checks, note: 'Function, brake and accessories passed.' });
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.final_inspection.inspected_by, 'admin');
  assert.equal((await inventoryDetail(db, item.id)).item.available_quantity, 5);
  assert.equal(row.repair_cost, 150.50);
  await assert.rejects(step(db, row, 'retire'), error => error.status === 409);
});

test('retirement closes maintenance, preserves damaged history and cannot be undone through stock editing', async () => {
  const { db, item, group } = await fixture(3);
  const token = db.data('items', item.id).qr_token;
  let row = (await report(db, item)).maintenance;
  row = await step(db, row, 'retire', { note: 'Frame cracked; replacement required.' });
  let units = (await inventoryDetail(db, group.id)).units;
  assert.equal(units.find(unit => unit.id === item.id).is_active, false);
  assert.equal(units.find(unit => unit.id === item.id).condition_status, 'DAMAGED');
  assert.equal(units[0].total_quantity, 2);
  assert.equal(db.data('items', item.id).qr_token, token);
  await assert.rejects(itemAction(db, 'admin', item.id, { action: 'restore', version: (await inventoryDetail(db, item.id)).item.updated_at }), error => error.status === 409);
  await setItemQuantity(db, 'admin', group.id, { quantity: 3 });
  units = (await inventoryDetail(db, group.id)).units;
  assert.equal(units.find(unit => unit.id === item.id).status, 'RETIRED');
  assert.equal(units.filter(unit => unit.is_active !== false).length, 3);
  assert.equal((await maintenanceDetail(db, row.id)).maintenance.retirement_reason, 'Frame cracked; replacement required.');
});

test('legacy repair records block quotes even if their raw unit status was incorrectly available', async () => {
  const { db, group, item } = await fixture(2);
  await db.collection('maintenance_records').doc('legacy').set({ item_id: item.id, status: 'OPEN', reason: 'Repair from older client', started_at: now });
  assert.equal(maintenanceStage(db.data('maintenance_records', 'legacy')), 'REPORTED');
  await assert.rejects(quoteEquipmentRental(db, { itemId: item.id, durationMinutes: 60 }, now), error => error.status === 409);
  assert.equal((await quoteEquipmentRental(db, { itemId: item.id, stockGroupId: group.stock_group_id, durationMinutes: 60 }, now)).quote.rental_fee, 200);
  assert.equal((await inventoryList(db)).items[0].available_quantity, 1);
});

test('invalid assignments, dates, costs and photo contents cannot partially change a ticket', async () => {
  const { db, item } = await fixture();
  for (const assignedTo of ['customer', 'inactive', 'missing']) await assert.rejects(report(db, item, { assignedTo }), error => error.status === 400);
  await assert.rejects(report(db, item, { targetDate: '2026-02-30' }), error => error.status === 400);
  await assert.rejects(report(db, item, { photos: [{ imageData: 'data:image/png;base64,aGVsbG8=' }] }), error => error.status === 400);
  assert.equal(db.records('maintenance_records').length, 0);
  const row = (await report(db, item)).maintenance;
  for (const repairCost of [-1, 1.111, '150', true]) await assert.rejects(step(db, row, 'update', { repairCost }), error => error.status === 400);
  assert.equal(db.data('maintenance_records', row.id).revision, 1);
});

test('closed-ticket expense corrections do not change an equipment unit in a subsequent rental', async () => {
  const { db, item } = await fixture();
  let row = await ready(db, (await report(db, item)).maintenance);
  row = await step(db, row, 'complete', { condition: 'GOOD', checks });
  await db.collection('items').doc(item.id).update({ status: 'RENTED', current_rental_id: 'new-rental' });
  await db.collection('rentals').doc('new-rental').set({ item_id: item.id, status: 'ACTIVE' });
  const before = db.data('items', item.id);
  row = await step(db, row, 'update', { repairCost: 180, note: 'Final invoice received.' });
  assert.equal(row.repair_cost, 180);
  assert.deepEqual(db.data('items', item.id), before);
});

test('damaged returns automatically create one reported ticket linked to the rental and inspection', async () => {
  const { db, item } = await fixture(1);
  const rental = (await createBooking(db, actor, { itemId: item.id, customerId: 'customer', durationMinutes: 60, requestKey: 'a'.repeat(32) }, now, { staff: true })).rental;
  const token = db.data('items', item.id).qr_token;
  await prepareRentalDelivery(db, actor, rental.id, { inventoryCode: token }, later(1));
  await releaseBooking(db, actor, rental.id, { requestKey: 'b'.repeat(32), transactionCode: rental.booking_qr_token, customerVerified: true, paymentVerified: true, inspection: { condition: 'GOOD', result: 'AVAILABLE', accessoriesChecked: true, notes: 'Checked before rental.' } }, later(2));
  await recordRentalReceipt(db, actor, rental.id, { requestKey: 'c'.repeat(32), inventoryCode: token, physicalReceiptConfirmed: true }, later(40));
  const input = { requestKey: 'd'.repeat(32), penaltyAmount: 0, inspection: { condition: 'DAMAGED', result: 'UNDER_MAINTENANCE', accessoriesChecked: true, notes: 'Rear tyre punctured.' } };
  await completeRentalReturn(db, actor, rental.id, input, later(41));
  await completeRentalReturn(db, actor, rental.id, input, later(42));
  const records = db.records('maintenance_records');
  assert.equal(records.length, 1);
  assert.equal(records[0].rental_id, rental.id);
  assert.equal(records[0].workflow_stage, 'REPORTED');
  assert.equal(records[0].maintenance_code, 'M-0001');
  assert.equal(records[0].inspection_notes, 'Rear tyre punctured.');
  assert.equal(db.data('items', item.id).status, 'UNDER_MAINTENANCE');
});

test('maintenance API requires staff authentication and supports web and mobile auth on the same ticket', async t => {
  const { db, item } = await fixture();
  const services = createFirebaseServices({ db, auth: { verifyIdToken: async token => ({ uid: token }) }, now: () => now });
  const server = createApi({ services, sessions: { verify: async token => token ? { uid: token } : null }, expiryWorker: false, notificationWorker: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, options = {}) => fetch(origin + path, { headers: { Cookie: 'rent_play_session=admin', 'Content-Type': 'application/json' }, ...options });
  assert.equal((await request('/maintenance-staff', { headers: { Cookie: 'rent_play_session=customer' } })).status, 401);
  const created = await request('/maintenance', { method: 'POST', body: JSON.stringify({ itemId: item.id, version: item.updated_at, reason: 'Loose brake', condition: 'DAMAGED' }) });
  assert.equal(created.status, 201);
  const row = (await created.json()).maintenance;
  const mobile = await request('/maintenance/' + row.id, { headers: { Authorization: 'Bearer admin' } });
  assert.equal(mobile.status, 200);
  assert.equal((await mobile.json()).maintenance.maintenance_code, row.maintenance_code);
  const staff = (await (await request('/maintenance-staff')).json()).staff;
  assert.equal(staff.length, 2);
  assert.ok(staff.every(row => row.account_code && !row.email));
});

test('web and mobile share ticket IDs and availability throughout repair and retirement', async () => {
  const { db, item } = await fixture(3), services = createFirebaseServices({ db, now: () => now });
  let row = (await services.createMaintenance(actor.id, { itemId: item.id, version: item.updated_at, reason: 'Brake damaged', condition: 'DAMAGED' })).maintenance;
  const compare = async expectedAvailable => {
    const web = await services.workspace('OWNER'), mobile = await services.mobileAdminWorkspace('OWNER'), catalog = await services.mobileCatalog();
    const webTicket = web.maintenance.find(ticket => ticket.id === row.id), mobileDetail = await services.inventoryDetail(item.id);
    assert.equal(webTicket.maintenance_code, mobileDetail.maintenance[0].maintenance_code);
    assert.equal(webTicket.workflow_stage, mobileDetail.maintenance[0].workflow_stage);
    assert.equal(mobile._inventory.items[0].available_quantity, expectedAvailable);
    assert.equal(catalog.items[0].available_quantity, expectedAvailable);
  };
  await compare(2);
  for (const action of ['start-repair', 'send-inspection']) row = (await services.updateMaintenance(actor.id, row.id, { action, revision: row.revision, note: 'Repair and function checks recorded.' })).maintenance;
  await compare(2);
  row = (await services.updateMaintenance(actor.id, row.id, { action: 'retire', revision: row.revision, note: 'Frame unsafe for rental.' })).maintenance;
  await compare(2);
  assert.equal((await services.mobileCatalog()).items[0].total_quantity, 2);
});

test('closing one legacy duplicate ticket does not release a unit with another unresolved issue', async () => {
  const { db, item } = await fixture(1);
  let row = await ready(db, (await report(db, item)).maintenance);
  await db.collection('maintenance_records').doc('older-issue').set({ item_id: item.id, status: 'OPEN', reason: 'Unresolved second issue', started_at: now });
  const result = await updateMaintenance(db, actor, row.id, { action: 'complete', revision: row.revision, note: 'Tyre passed inspection; second issue remains.', condition: 'GOOD', checks }, later(5));
  assert.equal(result.remaining_open_tickets, 1);
  assert.equal(db.data('items', item.id).status, 'UNDER_MAINTENANCE');
  assert.equal(db.data('items', item.id).condition_status, 'DAMAGED');
  assert.equal((await inventoryDetail(db, item.id)).item.available_quantity, 0);
});

test('an unsafe legacy unit cannot appear available, be quoted, or be silently removed through a stock reduction', async () => {
  const { db, item } = await fixture(1);
  await db.collection('items').doc(item.id).update({ condition_status: 'DAMAGED' });
  assert.equal((await inventoryDetail(db, item.id)).item.available_quantity, 0);
  await assert.rejects(quoteEquipmentRental(db, { itemId: item.id, durationMinutes: 60 }, now), error => error.status === 409);
  await assert.rejects(setItemQuantity(db, 'admin', item.id, { quantity: 0 }), error => error.status === 409);
  assert.equal(db.data('items', item.id).is_active, true);
});

test('older units without an update timestamp can be reported while later stale reports stay blocked', async () => {
  const db = memoryFirestore({ items: { old: { name: 'Legacy bicycle', item_code: 'EQUIP-001', status: 'AVAILABLE', is_active: true, condition_status: 'GOOD' } } });
  const ticket = (await createMaintenance(db, 'admin', { itemId: 'old', reason: 'Brake needs inspection', condition: 'NEEDS_INSPECTION' }, now)).maintenance;
  assert.equal(ticket.maintenance_code, 'M-0001');
  await assert.rejects(createMaintenance(db, 'admin', { itemId: 'old', reason: 'Repeated report' }, later(1)), error => error.status === 409);
});

test('closed-ticket expenses and saved unit references survive later deletion of the inventory record', async () => {
  const { db, item } = await fixture(1);
  let row = await ready(db, (await report(db, item)).maintenance);
  row = await step(db, row, 'complete', { condition: 'GOOD', checks });
  await db.runTransaction(async tx => tx.delete(db.collection('items').doc(item.id)));
  const updated = await step(db, row, 'update', { repairCost: 170, note: 'Final invoice recorded after inventory cleanup.' });
  const detail = await maintenanceDetail(db, row.id);
  assert.equal(updated.repair_cost, 170);
  assert.equal(detail.item, null);
  assert.equal(detail.maintenance.item_code, item.item_code);
  assert.equal(detail.maintenance.item_name, 'Bicycle');
  assert.equal(db.data('items', item.id), undefined);
});
