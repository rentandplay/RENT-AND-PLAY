import test from 'node:test';
import assert from 'node:assert/strict';
import { actualReturnTime, chargeCell, enrichVerification, outcomeMatches, renderConditionSnapshots, renderFeeBreakdown, renderRequestHistory, verificationMatches } from '../src/transaction-records.js';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const h = { escape, money: value => `PHP ${value.toFixed(2)}`, formatDate: value => value || 'Not recorded', icon: () => '<svg></svg>' };
const row = { id: 'rental-1', rental_code: 'R-001', item_name: 'Bike', item_code: 'BIKE-1', customer_name: 'Customer', status: 'COMPLETED', due_at: '2026-10-03 12:00:00', confirmed_return_at: '2026-10-03 12:06:00', fee_breakdown: { snapshot_version: 1, rate_label: '3-hour special', billed_minutes: 180, rental_fee: 500.25, deposit_amount: 100, overtime_units: 1, overtime_rate: 200, overtime_fee: 200, overtime_unit_minutes: 60, penalty_amount: 50, penalty_reason: 'Missing part', final_rental_charges: 750.25, actual_return_at: '2026-10-03 12:01:00' } };

test('saved fees keep cents and missing penalty is disclosed instead of rendered as zero', () => {
  const saved = renderFeeBreakdown(row, h);
  assert.ok(saved.includes('3-hour special')); assert.ok(saved.includes('180 minutes')); assert.ok(saved.includes('PHP 750.25')); assert.ok(saved.includes('PHP 100.00')); assert.ok(saved.includes('2026-10-03 12:01:00'));
  const legacy = renderFeeBreakdown({ rental_fee: 80, deposit_amount: 50 }, h);
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
  const requests = Array.from({ length: 8 }, (_, i) => ({ id: `attempt-${i}`, rental_id: row.id, transaction_type: 'RETURN', status: i === 7 ? 'CONFIRMED' : 'EXPIRED', expired_at: i < 7 ? '2026-10-03 12:00:00' : null, confirmed_at: i === 7 ? '2026-10-03 12:01:00' : null, confirmed_terminal_id: i === 7 ? 'terminal-1' : null, confirmed_terminal_code: i === 7 ? 'TERM-01' : null }));
  const html = renderRequestHistory(requests, h);
  assert.equal((html.match(/class="request-history-entry"/g) || []).length, 8); assert.ok(html.includes('TERM-01 (terminal-1)')); assert.ok(html.includes('attempt-0')); assert.ok(html.includes('attempt-7'));
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
