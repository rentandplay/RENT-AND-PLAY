import test from 'node:test';
import assert from 'node:assert/strict';
import { decoratedRecordPage } from '../src/record-pages.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

test('rental export pages include all records, customer contacts and full verification outcomes', async () => {
  const rentals = Object.fromEntries(Array.from({ length: 131 }, (_, i) => [`r${String(i).padStart(3, '0')}`, { rental_code: `R-${i}`, item_id: 'item', customer_id: 'customer', status: 'COMPLETED', balance_due: 0, refund_due: 0 }]));
  const attempts = Object.fromEntries(Array.from({ length: 111 }, (_, i) => [`v${i}`, { rental_id: 'r000', status: i === 110 ? 'REJECTED' : 'CONFIRMED' }]));
  const db = memoryFirestore({ rentals, items: { item: { name: 'Cards', item_code: 'EQUIP-001' } }, customers: { customer: { full_name: 'Ana', phone: '09171234567', email: 'ana@example.test' } }, verification_requests: attempts });
  const first = await decoratedRecordPage(db, 'rentals', { limit: 100, includeVerification: 'true' });
  assert.equal(first.records.length, 100); assert.ok(first.nextCursor);
  const row = first.records[0];
  assert.equal(row.customer_name, 'Ana'); assert.equal(row.customer_phone, '09171234567');
  assert.equal(row.item_name, 'Cards'); assert.ok(row.verification_outcomes.includes('REJECTED'));
  const last = await decoratedRecordPage(db, 'rentals', { limit: 100, cursor: first.nextCursor, includeVerification: 'true' });
  assert.equal(last.records.length, 31); assert.equal(last.nextCursor, null);
  assert.equal(new Set([...first.records, ...last.records].map(row => row.id)).size, 131);
});
