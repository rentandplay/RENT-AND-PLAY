import test from 'node:test';
import assert from 'node:assert/strict';
import { actualReturnTime, chargeCell, enrichVerification, outcomeMatches, renderConditionSnapshots, renderFeeBreakdown, renderRequestHistory, verificationMatches } from '../src/transaction-records.js';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const h = { escape, money: value => `PHP ${value.toFixed(2)}`, formatDate: value => value || 'Not recorded', icon: () => '<svg></svg>' };
const row = { id: 'rental-1', rental_code: 'R-001', item_name: 'Bike', item_code: 'BIKE-1', customer_name: 'Customer', status: 'COMPLETED', due_at: '2026-10-03 12:00:00', confirmed_return_at: '2026-10-03 12:06:00', fee_breakdown: { snapshot_version: 1, rate_label: '3-hour special', billed_minutes: 180, rental_fee: 500.25, deposit_amount: 100, overtime_units: 1, overtime_rate: 200, overtime_fee: 200, overtime_unit_minutes: 60, penalty_amount: 50, penalty_reason: 'Missing part', final_rental_charges: 750.25, actual_return_at: '2026-10-03 12:01:00' } };

test('saved fees keep cents and missing penalty is disclosed instead of rendered as zero', () => {
  const saved = renderFeeBreakdown(row, h);
  assert.ok(saved.includes('3-hour special')); assert.ok(saved.includes('180 minutes')); assert.ok(saved.includes('PHP 750.25')); assert.ok(saved.includes('2026-10-03 12:01:00'));
  const legacy = renderFeeBreakdown({ rental_fee: 80 }, h);
  assert.ok(legacy.includes('Penalty not recorded')); assert.ok(legacy.includes('Final charges not recorded')); assert.ok(legacy.includes('Original pricing snapshot not recorded')); assert.ok(!legacy.includes('PHP 0.00'));
  assert.ok(chargeCell(row, h).includes('PHP 750.25')); assert.equal(actualReturnTime(row), '2026-10-03 12:01:00');
});

test('verification search covers rental IDs, terminal codes, request type, reasons, and all outcomes', () => {
  const model = { transactions: [row], terminals: [{ id: 'terminal-1', terminal_code: 'TERM-01' }] };
  const request = enrichVerification({ id: 'attempt-1', rental_id: row.id, terminal_id: 'terminal-1', status: 'REJECTED', transaction_type: 'RETURN', rejection_reason: 'Wrong equipment' }, model);
  for (const search of ['rental-1', 'TERM-01', 'return', 'wrong equipment', 'attempt-1']) assert.equal(verificationMatches(request, { search, status: 'REJECTED' }), true);
  assert.equal(verificationMatches(request, { status: 'EXPIRED' }), false); assert.equal(verificationMatches(request, { terminal: 'another-terminal' }), false);
  assert.equal(outcomeMatches({ ...row, status: 'ACTIVE' }, [request], 'REJECTED'), true);
});

test('the transaction modal shows every attempt and reports missing confirmation records', () => {
  const requests = Array.from({ length: 8 }, (_, i) => ({ id: `attempt-${i}`, request_code: `V-${String(i + 1).padStart(4, '0')}`, rental_id: row.id, transaction_type: 'RETURN', status: i === 7 ? 'CONFIRMED' : 'EXPIRED', expired_at: i < 7 ? '2026-10-03 12:00:00' : null, confirmed_at: i === 7 ? '2026-10-03 12:01:00' : null, confirmed_terminal_id: i === 7 ? 'terminal-1' : null, confirmed_terminal_code: i === 7 ? 'TERM-01' : null }));
  const html = renderRequestHistory(requests, h);
  assert.equal((html.match(/class="request-history-entry"/g) || []).length, 8); assert.ok(html.includes('TERM-01')); assert.ok(html.includes('V-0001')); assert.ok(html.includes('V-0008'));
  const visible = html.replace(/<[^>]*>/g, '');
  assert.ok(!visible.includes('terminal-1')); assert.ok(!visible.includes('attempt-0'));
  assert.ok(renderRequestHistory([], h).includes('No verification or terminal confirmation record'));
  assert.ok(renderRequestHistory(requests.slice(0, 2), h).includes('No terminal confirmation record'));
});

test('condition snapshots keep historical damage separate from repaired inventory and escape notes', () => {
  const damaged = { ...row, release_condition: { condition: 'GOOD', notes: 'All parts present', result: 'AVAILABLE' }, return_condition: { condition: 'DAMAGED', notes: '<script>damage</script>', result: 'UNDER_MAINTENANCE', inspected_by_name: 'Inspector' }, maintenance_record_id: 'maintenance-1' };
  const html = renderConditionSnapshots(damaged, { items: [{ condition_status: 'GOOD' }], maintenance: [{ id: 'maintenance-1', rental_id: row.id, status: 'COMPLETED', inspection_notes: 'Cable broken' }] }, h);
  assert.ok(html.includes('Before release')); assert.ok(html.includes('On return')); assert.ok(html.includes('DAMAGED')); assert.ok(html.includes('COMPLETED')); assert.ok(html.includes('&lt;script&gt;damage&lt;/script&gt;')); assert.ok(!html.includes('<script>'));
});

test('Rentals, Returns, and History render the same saved charges and verification includes all attempts', async () => {
  const data = { transactions: [{ ...row, status: 'ACTIVE' }, { ...row, id: 'rental-2', rental_code: 'R-002' }], customers: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: Array.from({ length: 8 }, (_, i) => ({ id: `attempt-${i}`, rental_id: row.id, status: i % 2 ? 'EXPIRED' : 'REJECTED', transaction_type: 'RETURN' })) };
  const ui = createWorkspaceUI({ ...h, api: async () => data }); await ui.load();
  for (const page of ['Rentals', 'Returns', 'Transaction History']) assert.ok(ui.render(page, {}).includes('PHP 750.25'), page);
  const history = ui.render('Transaction History', {}); assert.ok(history.includes('Rejected')); assert.ok(history.includes('Expired'));
  const verification = ui.render('ESP32 terminal', {}); assert.ok(verification.includes('Full verification history')); assert.ok(verification.includes('of 8')); assert.ok(verification.includes('No confirming terminal recorded'));
});

test('due return requests stay marked overdue until physical receipt and inspection shows the stopped clock', async () => {
  const now = Date.now(), due = new Date(now - 2 * 3600000).toISOString();
  const data = {
    transactions: [
      { id: 'late-request', rental_code: 'R-LATE', item_name: 'Basketball', item_code: 'BALL-1', customer_name: 'Customer A', status: 'ACTIVE', latest_return_request_status: 'PENDING_ADMIN_APPROVAL', due_at: due },
      { id: 'received-late', rental_code: 'R-RECEIVED', item_name: 'Volleyball', item_code: 'BALL-2', customer_name: 'Customer B', status: 'RETURN_PENDING_INSPECTION', due_at: due, received_at: new Date(now - 3600000).toISOString() }
    ],
    customers: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: []
  };
  const ui = createWorkspaceUI({ ...h, api: async () => data }); await ui.load();
  assert.ok(ui.render('Rentals', {}).includes('Return requested · overdue by'));
  const returns = ui.render('Returns', {});
  assert.ok(returns.includes('Return requested · overdue by'));
  assert.ok(returns.includes('Received late · timer stopped · inspection pending'));
});

test('openTransaction immediately displays modal and does not make unnecessary workspace refreshes', async () => {
  let modalTitle = '', modalBody = '', workspaceReads = 0, lookupCalls = 0;
  const loadingPanel = {};
  const modalMock = {
    open: true,
    querySelector: selector => selector === '.transaction-record-modal' ? loadingPanel : ({ addEventListener() {}, onclick: null }),
    querySelectorAll: () => []
  };
  const showModal = (title, body) => {
    modalTitle = title;
    modalBody = body;
  };
  const testRental = { ...row, id: 'rental-cached', rental_code: 'R-CACHED', status: 'ACTIVE' };
  const uncachedRental = { ...row, id: 'rental-uncached', rental_code: 'R-UNCACHED', status: 'CANCELLED' };
  
  const ui = createWorkspaceUI({
    ...h,
    showModal,
    modal: modalMock,
    api: async (url, opts) => {
      if (url.startsWith('/workspace')) {
        workspaceReads++;
        return { transactions: [testRental], customers: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [] };
      }
      if (url === '/rentals/lookup') {
        lookupCalls++;
        const parsed = JSON.parse(opts?.body || '{}');
        return { rental: parsed.code === 'rental-cached' ? testRental : uncachedRental };
      }
      return {};
    }
  });

  await ui.load();
  assert.equal(workspaceReads, 1);

  // 1. Opening cached rental
  await ui.openTransaction('rental-cached');
  assert.equal(modalTitle, 'Rental details');
  assert.ok(modalBody.includes('R-CACHED'));
  assert.equal(workspaceReads, 1);

  // 2. Opening uncached rental (like from notification for cancelled rental)
  const openPromise = ui.openTransaction('rental-uncached', { rentalCode: 'R-UNCACHED' });
  assert.equal(modalTitle, 'Rental details');
  assert.ok(modalBody.includes('Loading rental details'));
  assert.ok(modalBody.includes('R-UNCACHED'));
  
  await openPromise;
  assert.equal(lookupCalls, 1);
  assert.equal(workspaceReads, 1);
  assert.ok(modalBody.includes('Cancelled'));
});


test('a delayed notification lookup cannot replace a newer dialog', async () => {
  let finish, panel = {}, body = '';
  const modal = { open: true, querySelector: selector => selector === '.transaction-record-modal' ? panel : null, querySelectorAll: () => [] };
  const ui = createWorkspaceUI({ ...h, modal,
    showModal: (_title, html) => { body = html; panel = {}; },
    api: () => new Promise(resolve => { finish = resolve; })
  });
  const opening = ui.openTransaction('missing');
  assert.match(body, /Loading rental details/);
  panel = {}; body = 'New inspection draft';
  finish({ rental: row }); await opening;
  assert.equal(body, 'New inspection draft');
});


test('active rentals on Rentals stay out of return intake until viewed in Returns or requested for return', async () => {
  let modalBody = '', closed = 0;
  const closeListeners = [];
  const modal = {
    open: true,
    close() { closed++; this.open = false; },
    querySelector: () => null,
    querySelectorAll: selector => selector === '[data-close]'
      ? [{ addEventListener: (_evt, cb) => closeListeners.push(cb) }]
      : []
  };
  const activeWalkIn = { ...row, id: 'active-walkin', rental_code: 'R-0321', status: 'ACTIVE', request_source: 'WALK_IN', confirmed_rental_at: '2026-10-03T04:00:00Z' };
  const returnRequested = { ...row, id: 'return-requested', rental_code: 'R-REQ', status: 'ACTIVE', latest_return_request_status: 'PENDING_ADMIN_APPROVAL' };
  const awaitingInspection = { ...row, id: 'awaiting-inspection', rental_code: 'R-INSP', status: 'RETURN_PENDING_INSPECTION' };
  const data = {
    transactions: [activeWalkIn, returnRequested, awaitingInspection],
    customers: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: []
  };
  const ui = createWorkspaceUI({
    ...h,
    modal,
    showModal: (_title, body) => { modalBody = body; closeListeners.length = 0; },
    api: async () => data
  });
  await ui.load();

  // 1. On Rentals module: released active rental must not prompt to receive equipment back
  ui.render('Rentals', {});
  await ui.openTransaction('active-walkin');
  assert.ok(!modalBody.includes('Receive returned equipment'));
  assert.ok(!modalBody.includes('data-mobile-return-confirm'));
  assert.ok(modalBody.includes('Active rental in progress'));
  assert.ok(modalBody.includes('Rental in progress · Handover complete'));
  assert.ok(modalBody.includes('Done'));
  assert.equal(closeListeners.length, 1);
  closeListeners[0]();
  assert.equal(closed, 1);

  // 2. Customer return request still surfaces return intake even outside Returns
  await ui.openTransaction('return-requested');
  assert.ok(modalBody.includes('Receive returned equipment'));
  assert.ok(modalBody.includes('data-mobile-return-confirm'));

  // 3. Physically received unit awaiting inspection surfaces Complete inspection
  await ui.openTransaction('awaiting-inspection');
  assert.ok(modalBody.includes('Complete inspection'));
  assert.ok(modalBody.includes('data-mobile-return-confirm'));

  // 4. On Returns module: active rentals show Receive returned equipment
  ui.render('Returns', {});
  await ui.openTransaction('active-walkin');
  assert.ok(modalBody.includes('Receive returned equipment'));
  assert.ok(modalBody.includes('data-mobile-return-confirm'));
});
