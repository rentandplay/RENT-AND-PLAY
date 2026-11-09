import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAnalyticsReport } from '../src/analytics-report.js';
import { reportSectionForPath, reportPathForSection } from '../src/workspace-navigation.js';
import { lineChart } from '../src/analytics-charts.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const helpers = { escape, now: new Date('2026-10-13T03:00:00Z'), paged: rows => ({ rows: rows.slice(0, 5), footer: '<footer>Pagination</footer>' }), table: (headers, rows) => `<table><thead>${headers.join('|')}</thead><tbody>${rows}</tbody></table>` };
const selection = { period: '30d', groupBy: 'daily' };

test('analytics exposes exactly three accessible top-level sections and maintains old routes', () => {
  const html = renderAnalyticsReport({}, selection, {}, helpers);
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  for (const name of ['Performance', 'Forecasting', 'Recommendations']) assert.ok(html.includes(`aria-label="${name}"`));
  for (const route of ['/reports', '/reports/equipment', '/reports/operations', '/reports/audit']) assert.equal(reportSectionForPath(route), 'performance');
  assert.equal(reportPathForSection('performance'), '/reports');
  assert.equal(reportPathForSection('equipment'), '/reports');
  assert.equal(reportSectionForPath('/reports/forecast'), 'forecast');
});

test('performance includes trend graphs, grouped equipment, customers and service metrics', () => {
  const html = renderAnalyticsReport({}, selection, { section: 'performance' }, helpers);
  for (const value of ['Rental fee trend', 'When rentals happen', 'Equipment utilization &amp; performance', 'Repeat customer activity', 'On-time returns', 'Counter confirmation speed', 'Data coverage &amp; missing records']) assert.ok(html.includes(value), value);
  assert.ok(html.includes('role="img"'));
  assert.ok(!html.includes('NaN'));
});

test('forecasting keeps insufficient data visible and never renders a zero estimate as a prediction', () => {
  const html = renderAnalyticsReport({}, selection, { section: 'forecast' }, helpers);
  for (const value of ['More history needed', 'History readiness', 'No estimate yet', 'Recent forecast fit', 'Forecast method &amp; assumptions']) assert.ok(html.includes(value), value);
  assert.ok(html.includes('data-forecast-scenario="higher" aria-pressed="false" disabled'));
  assert.ok(!html.includes('<strong>₱0.00</strong>'));
});

test('recommendations show practical actions with rules and a focus filter', () => {
  const html = renderAnalyticsReport({}, selection, { section: 'recommendations' }, helpers);
  for (const value of ['Suggested actions', 'Evidence', 'Suggested next step', 'Rule behind this suggestion', 'data-recommendation-type="all"', 'data-analytics-go-section="forecast"']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('No recommendation rules matched'));
});

test('equipment picker has one choice per stock group and escapes names', () => {
  const model = { items: [{ id: 'one', stock_group_id: 'stock', name: '<unsafe>', status: 'AVAILABLE', is_active: true }, { id: 'two', stock_group_id: 'stock', name: '<unsafe>', status: 'AVAILABLE', is_active: true }] };
  const html = renderAnalyticsReport(model, selection, {}, helpers), picker = html.match(/<select id="analytics-item"[\s\S]*?<\/select>/)[0];
  assert.equal((picker.match(/<option/g) || []).length, 2);
  assert.ok(picker.includes('&lt;unsafe&gt;'));
  assert.ok(!html.includes('<unsafe>'));
});

test('SVG charts handle missing and nonfinite points without duplicate date ticks', () => {
  const html = lineChart(['Jan', 'Feb'], [{ name: '<Historical>', values: [0, 2], low: [NaN, 1], high: [NaN, 3], color: '#ee8534' }, { name: 'Missing', values: [null, Infinity], color: '#709aca' }], { escape, id: 'test-chart', title: 'History chart' });
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('Infinity'));
  assert.equal((html.match(/class="ana-axis-label">Jan<\/text>/g) || []).length, 1);
  assert.equal((html.match(/class="ana-axis-label">Feb<\/text>/g) || []).length, 1);
  assert.ok(html.includes('&lt;Historical&gt;'));
});

test('observed count axes use unique whole counts and comparisons expose their real dates', () => {
  const html = lineChart(['Oct 1', 'Oct 2'], [{ name: 'Prior period', values: [1, 3], labels: ['Sep 1', 'Sep 2'], color: '#709aca' }], { escape, id: 'comparison-chart', title: 'Rental counts', integerTicks: true });
  const counts = [...html.matchAll(/text-anchor="end" class="ana-axis-label">(\d+)<\/text>/g)].map(match => Number(match[1]));
  assert.deepEqual(counts, [0, 1, 2, 3]);
  assert.ok(html.includes('Prior period · Sep 1: 1'));
  assert.ok(!html.includes('Prior period · Oct 1: 1'));
});

test('a preliminary forecast never presents candidate order as evaluated performance', () => {
  const model = { items:[{ id:'bike', name:'Bicycle', status:'AVAILABLE', is_active:true, created_at:'2026-07-01' }], transactions:Array.from({length:4}, (_, i)=>({ id:'r-'+i, item_id:'bike', status:'COMPLETED', confirmed_rental_at:'2026-10-12 10:00:00', rental_fee:100 })) };
  const html = renderAnalyticsReport(model, selection, { section:'forecast' }, helpers);
  assert.ok(html.includes('Preliminary · not yet validated'));
  assert.ok(html.includes('Not yet validated'));
  assert.ok(!html.includes('#1'));
  assert.ok(!html.includes('>Evaluated<'));
  assert.ok(!html.includes('Confidence:'));
  assert.ok(html.includes('data-forecast-model="auto" aria-pressed="false" disabled'));
  const ses = renderAnalyticsReport(model, selection, { section:'forecast', forecastModel:'ses' }, helpers);
  assert.ok(!ses.includes('class="ana-variation-band"'));
  assert.ok(ses.includes('SES (Exponential) estimates'));
});

test('forecasting paginates projected equipment mix', () => {
  const stock = { items: [
    { id: 'bike', name: 'Bicycle', category_id: 'sports', is_active: true, status: 'AVAILABLE', created_at: '2026-07-01' }
  ], categories: [{ id: 'sports', name: 'Sports' }] };
  const transactions = [];
  for (let index = 90; index >= 1; index--) {
    const date = new Date(Date.parse('2026-10-13T00:00:00Z') - index * 86400000), key = date.toISOString().slice(0, 10);
    transactions.push({ id: 'r-' + index, item_id: 'bike', status: 'COMPLETED', confirmed_rental_at: `${key} 10:00:00`, due_at: `${key} 12:00:00`, rental_fee: 100 });
  }
  const html = renderAnalyticsReport({ ...stock, transactions }, { period: '90d', groupBy: 'daily' }, { section: 'forecast' }, helpers);
  assert.ok(html.includes('Projected equipment mix'));
  assert.ok(html.includes('ana-forecast-mix'));
  assert.ok(html.includes('<footer>Pagination</footer>'));
});
