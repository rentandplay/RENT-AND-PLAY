import { createWorkspaceUI } from '../src/workspace-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCsvRecords, serializeCsv, csvNumber } from '../src/csv-export.js';
import { customerActivity, customersCsv, createCustomerUI } from '../src/customer-ui.js';

function parseCsv(csv) {
  const rows = []; let row = [], cell = '', quoted = false;
  csv = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === ',') { row.push(cell); cell = ''; }
    else if (!quoted && char === '\r' && csv[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += char;
  }
  row.push(cell); rows.push(row); return rows;
}

test('full export starts at the beginning, follows every cursor, and freezes filters', async () => {
  const calls = [], counts = [];
  const records = await collectCsvRecords(async (path, options) => {
    const query = new URL(path, 'https://local.test').searchParams;
    calls.push({ query, options });
    return query.get('cursor') === 'next' ? { records: [{ id: '2' }, { id: '3' }], nextCursor: null }
      : { records: [{ id: '1' }, { id: '2' }], nextCursor: 'next' };
  }, 'rentals', { view: 'Transaction History', cursor: 'current-page', status: 'COMPLETED', from: '2026-11-01' }, count => counts.push(count));
  assert.deepEqual(records.map(row => row.id), ['1', '2', '3']);
  assert.equal(calls[0].query.has('cursor'), false);
  assert.equal(calls[0].query.has('view'), false);
  for (const { query } of calls) { assert.equal(query.get('limit'), '100'); assert.equal(query.get('status'), 'COMPLETED'); assert.equal(query.get('from'), '2026-11-01'); }
  assert.deepEqual(counts, [2, 3]);
});

test('page failures, invalid responses and repeated cursors fail rather than download partial data', async () => {
  await assert.rejects(collectCsvRecords(async () => ({ records: [], nextCursor: 'loop' }), 'customers'), /advance/);
  await assert.rejects(collectCsvRecords(async () => ({}), 'customers'), /incomplete/);
  let pages = 0;
  await assert.rejects(collectCsvRecords(async () => {
    if (++pages > 1) throw Error('Connection lost');
    return { records: [{ id: '1' }], nextCursor: 'page2' };
  }, 'customers'), /Connection lost/);
});

test('CSV round trips accents, quotes, commas, multiline addresses, zero and missing values', () => {
  const csv = serializeCsv([['Name', 'Address', 'Amount'], ['Niño, "Jr"', 'Los Baños\nLaguna', 0], ['Missing', null]], { rectangular: true });
  assert.ok(csv.startsWith('\uFEFF'));
  assert.deepEqual(parseCsv(csv), [['Name', 'Address', 'Amount'], ['Niño, "Jr"', 'Los Baños\nLaguna', '0'], ['Missing', '', '']]);
  const protectedRows = parseCsv(serializeCsv([['\u0000=1+1', '+639171234567', '09171234567', '  @SUM(A1)', -25]]));
  assert.deepEqual(protectedRows[0], ["'=1+1", "'+639171234567", "'09171234567", "'  @SUM(A1)", '-25']);
  for (const value of [null, undefined, '', ' ', false, NaN, Infinity]) assert.equal(csvNumber(value), '');
  assert.equal(csvNumber(0), 0); assert.equal(csvNumber('25.50'), 25.5);
});

test('customer statistics join legacy IDs and auth UIDs without double counting', () => {
  const customers = [{ id: 'customer-doc', auth_uid: 'login-uid', customer_code: 'CUST-001', full_name: 'Ana' }];
  const rentals = [{ id: 'old', customer_id: 'customer-doc', status: 'COMPLETED', confirmed_return_at: '2026-11-01T00:00:00Z' }, { id: 'new', customer_id: 'login-uid', status: 'ACTIVE', due_at: '2026-11-02T00:00:00Z' }];
  const rows = customerActivity(customers, rentals, new Date('2026-11-09T00:00:00Z'));
  assert.equal(rows[0].total, 2); assert.equal(rows[0].returned, 1); assert.equal(rows[0].active, 1); assert.equal(rows[0].overdue, 1);
  assert.match(customersCsv(rows), /Asia\/Manila/);
});


test('transaction CSV button exports all pages with aligned headings and zero refund values', async () => {
  const previousDocument = globalThis.document, previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
  let handler, exported, filename;
  const button = { innerHTML: 'Export CSV', disabled: false, addEventListener: (_event, callback) => { handler = callback; } };
  globalThis.document = { querySelector: selector => selector === '#transaction-export' ? button : null, querySelectorAll: () => [],
    createElement: () => ({ click() { filename = this.download; } }) };
  URL.createObjectURL = blob => { exported = blob; return 'blob:csv-export-test'; };
  URL.revokeObjectURL = () => {};
  const rental = id => ({ id, rental_code: `R-${id}`, item_name: 'Cards', status: 'COMPLETED', rental_fee: 0, balance_due: 0, refund_due: 0, created_at: '2026-11-01T00:00:00Z', confirmed_return_at: '2026-11-02T00:00:00Z' });
  const snapshot = { transactions: [rental('1')], customers: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [] };
  try {
    const ui = createWorkspaceUI({ escape: value => String(value ?? ''), icon: () => '', money: String, formatDate: String, toast() {},
      api: async path => {
        if (path.startsWith('/workspace')) return snapshot;
        const query = new URL(path, 'https://local.test').searchParams;
        assert.equal(query.get('includeVerification'), 'true');
        return query.has('cursor') ? { records: [rental('2')], nextCursor: null } : { records: [rental('1')], nextCursor: 'next' };
      }
    });
    await ui.load(); ui.render('Transaction History', {}); ui.bind('Transaction History', {}, () => {});
    await handler({ currentTarget: button });
    assert.ok(exported instanceof Blob);
    const rows = parseCsv(await exported.text());
    assert.equal(rows.length, 3);
    for (const row of rows) assert.equal(row.length, rows[0].length);
    assert.equal(rows[1][rows[0].indexOf('Refund due (PHP)')], '0');
    assert.equal(rows[1][rows[0].indexOf('Request created (Asia/Manila)')], '2026-11-01 08:00');
    assert.match(filename, /^rent-and-play-transactions-\d+\.csv$/);
    assert.equal(button.disabled, false);
  } finally { globalThis.document = previousDocument; URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke; }
});


test('customer export keeps advanced date filters and includes matching customers on later pages', async () => {
  const oldDocument = globalThis.document, oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  let handler, exported;
  const button = { innerHTML: 'Export CSV', addEventListener: (_event, callback) => { handler = callback; } };
  globalThis.document = { querySelector: selector => selector === '#customer-export' ? button : null, querySelectorAll: () => [], createElement: () => ({ click() {} }) };
  URL.createObjectURL = blob => { exported = blob; return 'blob:customer-csv'; }; URL.revokeObjectURL = () => {};
  const customer = id => ({ id, customer_code: `CUST-${id}`, full_name: `Customer ${id}`, is_active: true });
  const model = { customers: [customer('1')], transactions: [], page_meta: { kind: 'customers' } };
  try {
    const ui = createCustomerUI({ model: () => model, escape: String, icon: () => '', formatDate: String, toast() {},
      exportScope: () => ({ from: '2026-11-01', to: '2026-11-09', cursor: 'visible-page' }),
      api: async path => {
        if (path.startsWith('/records/rentals')) return { records: [], nextCursor: null };
        const query = new URL(path, 'https://local.test').searchParams;
        assert.equal(query.get('from'), '2026-11-01'); assert.equal(query.get('to'), '2026-11-09');
        return query.has('cursor') ? { records: [customer('2')], nextCursor: null } : { records: [customer('1')], nextCursor: 'second' };
      }
    });
    ui.render('', { paged: rows => ({ rows, footer: '' }), table: () => '', empty: () => '' }); ui.bind(() => {}, () => {});
    await handler({ currentTarget: button });
    const rows = parseCsv(await exported.text());
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.slice(1).map(row => row[0]), ['CUST-1', 'CUST-2']);
  } finally { globalThis.document = oldDocument; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; }
});
