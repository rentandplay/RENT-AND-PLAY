import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAnalyticsReport } from '../src/analytics-report.js';
import { reportSectionForPath, reportPathForSection } from '../src/workspace-navigation.js';
import { lineChart } from '../src/analytics-charts.js';
import { parseHTML } from 'linkedom';

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

test('performance surfaces four business KPIs and appropriate comparison charts with visible operational evidence', () => {
  const html = renderAnalyticsReport({}, selection, { section: 'performance' }, helpers);
  const { document } = parseHTML(html);
  const kpis = [...document.querySelectorAll('#analytics-panel-performance > .ana-kpis > .ana-kpi')];
  assert.deepEqual(kpis.map(card => card.querySelector('.ana-kpi-top').textContent), ['Recorded rental fees', 'Confirmed rentals', 'Equipment utilization', 'Overdue rentals now']);
  assert.ok(document.querySelector('.ana-combination-chart[aria-labelledby="performance-trend-title"]'));
  assert.ok(document.querySelector('[data-analytics-detail="equipment"]'));
  assert.equal(document.querySelector('[data-analytics-detail="equipment"]').hasAttribute('hidden'), false);
  assert.ok(document.querySelector('.ana-demand-panel'));
  assert.match(document.querySelector('#analytics-data-coverage').textContent, /missing records/);
  assert.doesNotMatch(html, /Counter confirmation speed|Repeat customer activity|analytics-audit/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('forecasting keeps insufficient data visible and never renders a zero estimate as a prediction', () => {
  const html = renderAnalyticsReport({}, selection, { section: 'forecast' }, helpers);
  const { document } = parseHTML(html);
  for (const value of ['More history needed', 'History required', 'Complete periods available', 'How this forecast works']) assert.ok(html.includes(value), value);
  const cards = document.querySelectorAll('.ana-forecast-kpis .ana-kpi > strong');
  assert.equal(cards[0].textContent, '—');
  assert.equal(cards[1].textContent, '—');
  assert.doesNotMatch(document.querySelector('.ana-outlook-panel').textContent, /Forecast estimate/);
  assert.equal(document.querySelectorAll('[data-forecast-model],[data-forecast-scenario]').length,0);
  assert.ok(!html.includes('<strong>₱0.00</strong>'));
});

test('recommendations connect outcome measure target and action to evidence and a review rule', () => {
  const html = renderAnalyticsReport({}, selection, { section: 'recommendations' }, helpers);
  const { document } = parseHTML(html);
  assert.deepEqual([...document.querySelectorAll('.ana-decision-flow strong')].map(row => row.textContent), ['Outcome', 'Measure', 'Target', 'Action']);
  const cards = [...document.querySelectorAll('[data-action-id]')];
  assert.ok(cards.length > 0);
  for (const card of cards) {
    assert.deepEqual([...card.querySelectorAll('dt')].map(row => row.textContent), ['Outcome', 'Measure', 'Target']);
    assert.ok(card.querySelector('.ana-evidence p').textContent.trim());
    assert.ok(card.querySelector('.ana-next-step p').textContent.trim());
    assert.ok(card.querySelector('.ana-rule-evidence p').textContent.trim());
    assert.equal(card.querySelector('details'), null);
  }
  assert.ok(document.querySelector('[data-recommendation-type="all"]'));
  assert.ok(document.querySelector('[data-analytics-go-section="forecast"]'));
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
  const { document } = parseHTML(html);
  const projection = document.querySelector('[data-analytics-detail="projection"]');
  assert.ok(projection);
  assert.equal(projection.hasAttribute('open'), false);
  assert.match(projection.textContent, /Forecast values & equipment mix/);
  assert.ok(html.includes('ana-forecast-mix'));
  assert.ok(html.includes('<footer>Pagination</footer>'));
});

test('only an authorized owner sees editable business targets and stored percentages retain precision', () => {
  const model = { settings: { analytics_targets: { monthly_fee_goal: 12000.5, monthly_rental_goal: 80, utilization_goal: .12345, overdue_rate_alert: 0 } } };
  const owner = parseHTML(renderAnalyticsReport(model, selection, {}, { ...helpers, canManageTargets: true })).document;
  const form = owner.querySelector('#analytics-targets-form');
  assert.ok(form);
  assert.equal(form.querySelector('[name="monthly_fee_goal"]').value, '12000.5');
  assert.equal(form.querySelector('[name="monthly_rental_goal"]').value, '80');
  assert.equal(form.querySelector('[name="utilization_goal"]').value, '12.345');
  assert.equal(form.querySelector('[name="overdue_rate_alert"]').value, '0');
  const operator = parseHTML(renderAnalyticsReport(model, selection, {}, { ...helpers, canManageTargets: false })).document;
  const readOnly = operator.querySelector('[data-analytics-detail="targets"]');
  assert.equal(readOnly.querySelector('form'), null);
  assert.match(readOnly.textContent, /workspace owner manages these values/);
  assert.match(readOnly.textContent, /0%/);
  assert.match(readOnly.textContent, /12,000\.50/);
});

test('business overview omits customer and audit identities while keeping meaningful zero and missing states', () => {
  const model = { customers: [{ id: 'c', full_name: 'Private Customer Name', email: 'private@example.test', phone: '09991234567' }],
    auditLogs: [{ id: 'a', actor_name: 'Private Staff Name', action: 'SENSITIVE_ACTION' }],
    items: [{ id: 'i', name: 'Bike', status: 'AVAILABLE', is_active: true, created_at: '2026-01-01' }],
    transactions: [{ id: 'r', item_id: 'i', customer_id: 'c', customer_name: 'Private Customer Name', status: 'PENDING', rental_fee: 500, confirmed_rental_at: '2026-10-12' }] };
  const html = renderAnalyticsReport(model, selection, {}, helpers), { document } = parseHTML(html);
  assert.doesNotMatch(html, /Private Customer Name|private@example\.test|09991234567|Private Staff Name|SENSITIVE_ACTION/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  const values = [...document.querySelectorAll('#analytics-panel-performance > .ana-kpis > .ana-kpi > strong')].map(row => row.textContent);
  assert.match(values[0], /0\.00/);
  assert.deepEqual(values.slice(1), ['0', '0%', '0']);
  assert.match(document.querySelector('[data-analytics-detail="targets"]').textContent, /Not set/);
});

test('default displayed filters and computed reporting dates describe the same annual monthly view', () => {
  const old = { items:[{id:'bike',name:'Bicycle',created_at:'2024-01-01',status:'AVAILABLE',is_active:true}], transactions:[{id:'older',item_id:'bike',status:'COMPLETED',confirmed_rental_at:'2026-04-01T02:00:00Z',confirmed_return_at:'2026-04-01T04:00:00Z',due_at:'2026-04-01T05:00:00Z',rental_fee:150}] };
  const {document}=parseHTML(renderAnalyticsReport(old,{}, {},helpers));
  assert.equal(document.querySelector('#analytics-period option[selected]').value,'365d');
  assert.equal(document.querySelector('#analytics-group option[selected]').value,'monthly');
  assert.equal(document.querySelectorAll('.ana-kpi')[1].querySelector('strong').textContent,'1');
  assert.match(document.querySelector('.ana-scope').textContent,/Oct 14, 2025.*Oct 13, 2026/);
});

test('forecast uses one explainable average with no benchmark picker or legacy scenario override',()=>{
 const model={items:[{id:'bike',name:'Bicycle',status:'AVAILABLE',is_active:true,created_at:'2026-07-01'}],transactions:Array.from({length:4},(_,i)=>({id:'r'+i,item_id:'bike',status:'COMPLETED',confirmed_rental_at:'2026-10-12 10:00:00',rental_fee:100}))};
 const html=renderAnalyticsReport(model,selection,{section:'forecast'},helpers);
 assert.match(html,/Same-weekday moving average/);
 assert.match(html,/last 4 Saturdays/);
 assert.doesNotMatch(html,/data-forecast-model|data-forecast-scenario|Historical model validation|Best fit|SES|Regression/);
 assert.equal(renderAnalyticsReport(model,selection,{section:'forecast',forecastModel:'linear',forecastScenario:'higher'},helpers),html);
});

test('all analytics sections expose their evidence without expand or collapse controls',()=>{
 for(const section of ['performance','forecast','recommendations']) {
  const {document}=parseHTML(renderAnalyticsReport({},selection,{section,details:{equipment:false,targets:false,definitions:false,'forecast-review':false}},helpers));
  assert.equal(document.querySelectorAll('details,summary,.ana-disclosure-label').length,0,section);
  assert.ok(document.querySelector('[data-analytics-detail="coverage"]'));
  for(const panel of document.querySelectorAll('[data-analytics-detail]')) assert.equal(panel.hasAttribute('hidden'),false);
 }
});
