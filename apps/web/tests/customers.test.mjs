import test from 'node:test';
import assert from 'node:assert/strict';
import { customerActivity, filterCustomerRows, nextCustomerCode, customersCsv } from '../src/customer-ui.js';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const customers = [
  { id: '1', customer_code: 'CUST-001', full_name: 'Ana Reyes', email: 'ana@example.test', address: 'Los Baños', is_active: true, created_at: '2026-10-01 10:00:00' },
  { id: '2', customer_code: 'CUST-012', full_name: 'Ben Santos', phone: '09171234567', is_active: false, created_at: '2026-10-04 10:00:00' },
  { id: '3', customer_code: 'WALK-IN', full_name: 'Cara Cruz', is_active: true }
];
const transactions = [
  { id: 'a', customer_id: 1, status: 'ACTIVE', created_at: '2026-10-01 09:00:00', confirmed_rental_at: '2026-10-01 10:00:00', due_at: '2026-10-05 11:00:00', item_name: 'Basketball' },
  { id: 'b', customer_id: '1', status: 'COMPLETED', confirmed_rental_at: '2026-09-01 10:00:00', confirmed_return_at: '2026-09-02 10:00:00', due_at: '2026-09-03 10:00:00', item_name: 'Bike' },
  { id: 'c', customer_id: '1', status: 'PENDING_VERIFICATION', created_at: '2026-10-05 10:00:00', due_at: '2026-10-05 11:00:00' },
  { id: 'd', customer_id: '2', status: 'CANCELLED', created_at: '2026-10-01 10:00:00' },
  { id: 'e', customer_id: '2', status: 'ACTIVE', confirmed_rental_at: '2026-10-01 10:00:00', confirmed_return_at: '2026-10-02 10:00:00', due_at: '2026-10-01 11:00:00' },
  { id: 'f', customer_id: 'missing', status: 'ACTIVE', due_at: '2026-01-01 11:00:00' }
];

test('customer activity counts confirmed rentals and overdue equipment at Philippine time boundaries', () => {
  const before = customerActivity(customers, transactions, new Date('2026-10-05T03:00:00Z'));
  const after = customerActivity(customers, transactions, new Date('2026-10-05T03:00:01Z'));
  assert.equal(before[0].overdue, 0, 'a rental is not overdue at the exact due time');
  assert.deepEqual({ total: after[0].total, active: after[0].active, overdue: after[0].overdue, returned: after[0].returned }, { total: 2, active: 1, overdue: 1, returned: 1 });
  assert.equal(after[0].history[0].id, 'c', 'pending requests appear in history but do not inflate rentals');
  assert.equal(after[1].active, 0, 'a recorded return wins over stale ACTIVE status');
  assert.equal(after[1].total, 1, 'cancelled attempts do not count as confirmed rentals');
  assert.equal(after[2].history.length, 0);
  assert.equal(after.length, customers.length, 'unlinked rentals do not invent customer profiles');
});

test('customer search, status, activity, and sort work together without dropping archived history', () => {
  const rows = customerActivity(customers, transactions, new Date('2026-10-06T00:00:00Z'));
  assert.deepEqual(filterCustomerRows(rows, { search: '  los baños  ', status: 'active', activity: 'overdue' }).map(r => r.customer.id), ['1']);
  assert.deepEqual(filterCustomerRows(rows, { search: '0917', status: 'archived' }).map(r => r.customer.id), ['2']);
  assert.deepEqual(filterCustomerRows(rows, { activity: 'new' }).map(r => r.customer.id), ['3']);
  assert.deepEqual(filterCustomerRows(rows, { sort: 'newest' }).map(r => r.customer.id), ['2', '1', '3']);
  assert.deepEqual(filterCustomerRows(rows, { sort: 'rentals' }).map(r => r.customer.id), ['1', '2', '3']);
  assert.equal(filterCustomerRows(rows, { status: 'archived', activity: 'overdue' }).length, 0);
  assert.equal(filterCustomerRows(rows, { search: 'CUST-001' })[0].total, 2);
});

test('customer codes skip codes used by archived customers', () => {
  assert.equal(nextCustomerCode(), 'CUST-001');
  assert.equal(nextCustomerCode(customers), 'CUST-013');
  assert.equal(nextCustomerCode([{ customer_code: 'cust-999' }]), 'CUST-1000');
});

test('customer CSV preserves contact details and neutralizes spreadsheet formulas', () => {
  const rows = customerActivity([{ id: '1', customer_code: 'CUST-001', full_name: '=HYPERLINK("https://example.test")', phone: '+639171234567', address: 'Street, City\nLine 2', email: '  @unsafe' }], []);
  const csv = customersCsv(rows);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.ok(csv.includes('"\'+639171234567"'));
  assert.ok(csv.includes('"\'  @unsafe"'));
  assert.ok(csv.includes('"Street, City\nLine 2"'));
  assert.ok(csv.includes('"0","0","0",""'));
});

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = { escape, money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded', icon: () => '<svg></svg>' };
const workspace = (customers = [], transactions = []) => ({ customers, transactions, items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [] });

test('customer page renders real records safely and offers useful empty states', async () => {
  const ui = createWorkspaceUI({ ...helpers, api: async () => workspace([{ ...customers[0], full_name: '<img src=x onerror=alert(1)>', email: '<script>x</script>' }], transactions) });
  await ui.load();
  const html = ui.render('Customers', {});
  for (const label of ['Total customers', 'Active customers', 'With equipment out', 'Overdue customers', 'Customer directory', 'Export CSV', 'All customers', 'Archived']) assert.ok(html.includes(label), label);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('2 rentals'));
  assert.ok(html.includes('data-customer-detail="1"'));
  const empty = createWorkspaceUI({ ...helpers, api: async () => workspace() }); await empty.load();
  const emptyHtml = empty.render('Customers', {});
  assert.ok(emptyHtml.includes('Add your first customer'));
  assert.ok(emptyHtml.includes('id="customer-export" disabled'));
  assert.ok(!emptyHtml.includes('Ana Reyes'));
});
