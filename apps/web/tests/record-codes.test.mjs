import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceUI } from '../src/workspace-ui.js';
import { recordCode } from '../src/record-codes.js';

test('history shows a single saved rental reference while detail links retain the actual record ID', async () => {
  const id = 'booking_175c005753c10d47420d248d68a8d3cb7c864d10';
  const model = { transactions: [{ id, rental_code: 'R-0001', item_name: 'Bicycle', item_code: 'EQUIP-004', status: 'COMPLETED', rental_fee: 100, customer_name: 'Guest' }], verification: [], items: [], customers: [], categories: [], maintenance: [], rates: [], users: [], terminals: [], auditLogs: [], settings: {} };
  const ui = createWorkspaceUI({ api: async () => model, escape: value => String(value || ''), icon: () => '', money: value => String(value), formatDate: () => 'Oct 13, 2026' });
  await ui.load();
  const html = ui.render('Transaction History', {}), visible = html.replace(/<[^>]*>/g, '');
  assert.ok(visible.includes('R-0001'));
  assert.ok(!visible.includes('booking_'));
  assert.ok(html.includes(`data-record-id="${id}"`));
  assert.ok(!html.includes(`<small>${id}</small>`));
});

test('missing references are disclosed instead of constructing another ID in the browser', () => {
  assert.equal(recordCode({ id: 'booking_a_very_long_internal_identifier' }), 'Not assigned');
  assert.equal(recordCode({ request_code: 'V-0002' }, 'verification'), 'V-0002');
});
