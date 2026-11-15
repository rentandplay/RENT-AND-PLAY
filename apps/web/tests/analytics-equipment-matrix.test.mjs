import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildMonthlyEquipmentMatrix, buildCustomerSegmentsAndChurn } from '../src/analytics-models.js';
import { calculateDetailedAnalytics } from '../src/analytics-insights.js';
import { monthlyEquipmentHeatmap, bindMonthlyEquipmentHeatmaps } from '../src/analytics-equipment-matrix.js';

const now = new Date('2026-03-15T04:00:00Z');
const rental = (id, item_id, at, fee) => ({ id, item_id, confirmed_rental_at: at, rental_fee: fee, status: 'COMPLETED', customer_id: id });

test('monthly matrix uses Philippine months, exact cents, zero months and partial boundaries', () => {
  const matrix = buildMonthlyEquipmentMatrix([
    rental('1', 'a', '2026-01-31T16:00:00Z', '0.10'), // February 1 in Manila
    rental('2', 'a', '2026-02-01T02:00:00Z', '0.20'),
    rental('3', 'a', '2026-01-01T00:00:00Z', 900), // outside selected range
    { ...rental('4', 'a', '2026-02-01', 900), status: 'CANCELLED' }
  ], [{ id: 'a', stock_group_id: 'g' }], [{ stockGroupId: 'g', name: 'Ball' }], { from: '2026-01-15', to: '2026-03-15' });
  assert.deepEqual(matrix.months.map(m => m.partial), [true, false, true]);
  assert.deepEqual(matrix.months.map(m => m.cells[0]), [{ rentals: 0, fees: 0 }, { rentals: 2, fees: .3 }, { rentals: 0, fees: 0 }]);
  assert.equal(matrix.totalFees, .3);
  assert.equal(matrix.totalRentals, 2);
});

test('monthly matrix reconciles every filtered core total including grouped remainder and orphan equipment', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ id: String(i), name: `Equipment ${i}`, category_id: i < 5 ? 'sports' : 'games', created_at: '2025-01-01', is_active: true }));
  items.push({ ...items[0], id: 'unit2', stock_group_id: '0' });
  const transactions = Array.from({ length: 120 }, (_, i) => rental(String(i), [...items, { id: 'orphan' }][i % 11].id, `2026-02-${String(i % 28 + 1).padStart(2, '0')}T03:00:00Z`, String((i * 37 % 10000) / 100)));
  const data = { items, transactions };
  for (const filter of [{}, { itemId: 'unit2' }, { categoryId: 'sports' }]) {
    const result = calculateDetailedAnalytics(data, { period: 'custom', from: '2026-01-15', to: '2026-03-15', groupBy: 'weekly', ...filter }, now);
    const matrix = result.monthlyEquipment;
    const ids = !filter.itemId && !filter.categoryId ? null : filter.itemId ? new Set(['0', 'unit2']) : new Set(['0', '1', '2', '3', '4', 'unit2']);
    const expected = transactions.filter(t => !ids || ids.has(t.item_id));
    assert.equal(matrix.totalRentals, expected.length);
    assert.equal(matrix.totalFees, expected.reduce((s, r) => s + Math.round(Number(r.rental_fee) * 100), 0) / 100);
    assert.equal(matrix.totalRentals, result.totals.rentals);
    assert.equal(matrix.totalFees, result.totals.fees);
    assert.equal(matrix.months.flatMap(m => m.cells).reduce((s, c) => s + c.rentals, 0), expected.length);
    assert.ok(matrix.columns.length <= 6);
    if (!ids) assert.match(matrix.columns.at(-1).name, /Other equipment/);
  }
});

test('matrix metric controls preserve counts and exact fees, escape names and honor reduced motion', () => {
  const matrix = buildMonthlyEquipmentMatrix([rental('1', 'a', '2026-02-02', 1234.56)], [{ id: 'a' }], [{ stockGroupId: 'a', name: '<img src=x onerror=alert(1)>' }], { from: '2026-02-01', to: '2026-02-28' });
  const { document, window } = parseHTML(`<main>${monthlyEquipmentHeatmap(matrix)}</main>`);
  window.matchMedia = () => ({ matches: true });
  bindMonthlyEquipmentHeatmaps(document);
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('[data-matrix-replay]').disabled, true);
  document.querySelector('[data-matrix-metric-button="fees"]').click();
  const cell = document.querySelector('[data-matrix-cell]');
  assert.match(cell.textContent, /1.2K/);
  cell.click();
  assert.match(document.querySelector('[data-matrix-readout]').textContent, /1,234.56/);
  assert.equal(cell.getAttribute('aria-pressed'), 'true');
  document.querySelector('[data-matrix-metric-button="rentals"]').click();
  assert.equal(document.querySelector('[data-matrix-cell]').textContent, '1');
});

test('matrix distinguishes no activity from confirmed zero-fee handoffs', () => {
  assert.match(monthlyEquipmentHeatmap({ columns: [], totalRentals: 0 }), /No monthly equipment activity/);
  const matrix = buildMonthlyEquipmentMatrix([rental('1', 'a', '2026-02-02', 0)], [], [], { from: '2026-02-01', to: '2026-02-28' });
  const { document } = parseHTML(monthlyEquipmentHeatmap(matrix, 'fees'));
  assert.ok(document.querySelector('.ana-matrix-level-0'));
  assert.match(document.querySelector('[data-matrix-cell]').getAttribute('aria-label'), /1 confirmed handoffs/);
});

test('silhouette includes singleton groups as zero rather than perfect separation', () => {
  const transactions = [10, 10, 20, 20, 100, 200].map((fee, i) => rental(String(i), 'a', '2026-03-01', fee));
  const result = buildCustomerSegmentsAndChurn(transactions, now);
  // Four points form a group, two are singletons. Independently calculated Euclidean silhouette.
  const expected = ((1 - (20 / 3) / 90) * 2 + (1 - (20 / 3) / 80) * 2 + 0 + 0) / 6;
  assert.equal(result.silhouette, Math.round(expected * 100) / 100);
  assert.equal(result.segments.reduce((s, row) => s + row.customers, 0), 6);
});

test('identical single-booking customers do not imply repeat behavior or distinct clusters', () => {
  const result = buildCustomerSegmentsAndChurn(Array.from({ length: 6 }, (_, i) => rental(String(i), 'a', '2026-03-01', 10)), now);
  assert.equal(result.segments.length, 1);
  assert.equal(result.silhouette, null);
  assert.equal(result.segments[0].label, 'Single-booking renters');
});
