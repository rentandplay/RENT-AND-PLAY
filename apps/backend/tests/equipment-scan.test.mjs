import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEquipmentScan } from '../src/rental-flow.mjs';
import { createApi } from '../src/server.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const fixture = () => memoryFirestore({ items: {
  bike: { name: 'Bicycle', item_code: 'EQUIP-001', qr_token: 'EQUIP-001', status: 'AVAILABLE', is_active: true },
  old: { name: 'Cards', item_code: 'EQUIP-002', qr_token: 'rp-qr-old-cards', status: 'RENTED', is_active: true },
  archived: { name: 'Archived', item_code: 'EQUIP-003', qr_token: 'EQUIP-003', is_active: false },
} });

test('current printed labels and existing QR tokens validate against the assigned physical unit without writes', async () => {
  const db = fixture();
  for (const [code, id] of [['EQUIP-001', 'bike'], ['rp-qr-old-cards', 'old']]) {
    const before = structuredClone(db.records('items'));
    const result = await validateEquipmentScan(db, { code, expectedItemId: id });
    assert.equal(result.item.id, id); assert.equal(result.item.qr_token, undefined);
    assert.deepEqual(db.records('items'), before); assert.equal(db.records('audit_logs').length, 0);
  }
});

test('wrong units, customer QR, arbitrary content, duplicate labels and archived units are rejected', async () => {
  const db = fixture();
  await assert.rejects(validateEquipmentScan(db, { code: 'EQUIP-001', expectedItemId: 'old' }), /Wrong equipment label/);
  for (const code of ['rp-rental-customer.123.abcdef', 'rp-booking-customer', 'R-0042']) await assert.rejects(validateEquipmentScan(db, { code }), /customer rental QR/);
  for (const code of ['https://example.com', 'EQUIP-999', 'bike']) await assert.rejects(validateEquipmentScan(db, { code }));
  await assert.rejects(validateEquipmentScan(db, { code: 'EQUIP-003' }), /archived unit/);
  await db.collection('items').doc('duplicate').set({ item_code: 'EQUIP-001' });
  await assert.rejects(validateEquipmentScan(db, { code: 'EQUIP-001' }), /No unique inventory/);
  for (const input of [null, {}, { code: '' }, { code: 'a'.repeat(257) }, { code: 'rp-qr-old-cards', expectedItemId: '../old' }]) await assert.rejects(validateEquipmentScan(db, input), error => error.status === 400);
});

test('equipment scan HTTP route requires staff authentication and validates through the read-only service', async () => {
  const db = fixture(); let authenticated = false, calls = 0;
  const server = createApi({ expiryWorker: false, sessions: { verify: async () => authenticated ? { uid: 'operator' } : null }, services: {
    getUser: async () => ({ id: 'operator', role: 'ADMIN', is_active: true }),
    validateEquipmentScan: input => { calls++; return validateEquipmentScan(db, input); },
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/inventory/scan`;
  const scan = code => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, expectedItemId: 'bike' }) });
  try {
    assert.equal((await scan('EQUIP-001')).status, 401); assert.equal(calls, 0);
    authenticated = true;
    const response = await scan('EQUIP-001'); assert.equal(response.status, 200); assert.equal((await response.json()).item.id, 'bike');
    assert.equal((await scan('rp-qr-old-cards')).status, 409);
    assert.equal((await fetch(url)).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
