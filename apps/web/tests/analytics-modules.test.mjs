import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  DURATION_BINS,
  buildParetoAnalysis,
  buildWaterfallAnalysis,
  buildChannelAndPaymentTrends,
  computeHistogramStats,
  buildCategoryChannelPivot,
  buildMaintenanceTextMining,
  buildForecastComparison,
  buildLateReturnDecisionTree,
  buildCustomerSegmentsAndChurn,
  buildOutlierAlerts,
  buildMarketBasketBundles,
  simulateWhatIfScenario
} from '../src/analytics-models.js';
import { paretoChart, waterfallChart, stackedColumnChart, histogramChart, inlineDataBar, statusIconBadge, bindAnalyticsCharts } from '../src/analytics-charts.js';
import { calculateDetailedAnalytics } from '../src/analytics-insights.js';
import { renderAnalyticsReport } from '../src/analytics-report.js';
import { analyticsCsv } from '../src/analytics.js';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const helpers = {
  escape,
  now: new Date('2026-11-10T04:00:00Z'),
  paged: rows => ({ rows: rows.slice(0, 10), footer: '' }),
  table: (heads, rows) => `<table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`
};

test('Pareto 80-20 ranks equipment descending, tags vital drivers cleanly and handles zero values', () => {
  const rows = [
    { id: 'a', name: 'E-Bike', fees: 8000, rentals: 10 },
    { id: 'b', name: 'Basketball', fees: 1500, rentals: 15 },
    { id: 'c', name: 'Chess Set', fees: 500, rentals: 5 },
    { id: 'd', name: 'Unused', fees: 0, rentals: 0 }
  ];
  const pareto = buildParetoAnalysis(rows, 'fees');
  assert.equal(pareto.available, true);
  assert.equal(pareto.total, 10000);
  assert.equal(pareto.vitalCount, 1);
  assert.equal(pareto.rows[0].name, 'E-Bike');
  assert.equal(pareto.rows[0].tier, 'Vital 80%');
  assert.equal(pareto.rows.length, 3);
  assert.equal(pareto.rows.at(-1).cumulative, 1);

  const empty = buildParetoAnalysis([{ id: 'x', name: 'Zero', fees: 0, rentals: 0 }], 'fees');
  assert.equal(empty.available, false);
});

test('Waterfall analysis builds ledger cash bridge and filtered rental fee bridge accurately', () => {
  const ledger = buildWaterfallAnalysis({
    financeSummary: {
      totals: { collections: 5000, cash_collections: 3200, qr_collections: 1800, refunds: 600, expenses: 900, net_collected: 4400, net_after_expenses: 3500 },
      rental_totals: { charges: 5200, balance_due: 200 }
    },
    confirmed: [],
    scopeFiltered: false
  });
  assert.equal(ledger.available, true);
  assert.equal(ledger.source, 'ledger');
  assert.equal(ledger.steps.at(-1).amount, 3500);
  assert.equal(ledger.steps[1].start, 5000);
  assert.equal(ledger.steps[1].end, 4400);

  const scoped = buildWaterfallAnalysis({
    financeSummary: { totals: { collections: 5000, refunds: 0, expenses: 0 } },
    confirmed: [
      { rental_fee: 400, fulfillment_mode: 'DELIVERY' },
      { rental_fee: 600, fulfillment_mode: 'WALK_IN' }
    ],
    scopeFiltered: true
  });
  assert.equal(scoped.source, 'rentals');
  assert.equal(scoped.steps.at(-1).amount, 1000);
});

test('Histogram computes exact Mean, Median, Mode bin and sample Std Dev', () => {
  const stats = computeHistogramStats([1, 1.5, 2.5, 3.0, 5.0], DURATION_BINS);
  assert.equal(stats.available, true);
  assert.equal(stats.count, 5);
  assert.equal(stats.mean, 2.6);
  assert.equal(stats.median, 2.5);
  assert.equal(stats.modeBin.label, '0–2 hrs');
  assert.ok(stats.stdDev > 1.5 && stats.stdDev < 1.6);

  const empty = computeHistogramStats([], DURATION_BINS);
  assert.equal(empty.available, false);
  assert.equal(empty.mean, null);
});

test('Pivot matrix totals and maintenance text mining match underlying confirmed records safely', () => {
  const items = [
    { id: 'b1', name: 'Bike', category_id: 'sports' },
    { id: 'g1', name: 'Uno', category_id: 'games' }
  ];
  const categories = [{ id: 'sports', name: 'Sports' }, { id: 'games', name: 'Cards' }];
  const confirmed = [
    { item_id: 'b1', rental_fee: 200, fulfillment_mode: 'DELIVERY', fee_breakdown: { package_kind: 'WHOLE_STAY' } },
    { item_id: 'b1', rental_fee: 100, fulfillment_mode: 'WALK_IN', fee_breakdown: { package_kind: 'HOURLY' } },
    { item_id: 'g1', rental_fee: 50, fulfillment_mode: 'WALK_IN' }
  ];
  const pivot = buildCategoryChannelPivot(confirmed, items, categories);
  assert.equal(pivot.available, true);
  assert.equal(pivot.totals.total.rentals, 3);
  assert.equal(pivot.totals.total.fees, 350);
  assert.equal(pivot.totals.delivery.fees, 200);
  assert.equal(pivot.totals.counter.fees, 150);

  const issues = buildMaintenanceTextMining([
    { started_at: '2026-10-05 10:00:00', details: 'Flat rear tire and loose screw' },
    { started_at: '2026-10-06 11:00:00', inspection_notes: '<script>alert(1)</script> controller battery drain' }
  ], { from: '2026-10-01', to: '2026-10-10' });
  assert.equal(issues.available, true);
  assert.ok(issues.rows.some(r => r.label.includes('Battery, controller')));
  assert.ok(issues.rows.some(r => r.label.includes('Missing or loose part')));
  assert.ok(!JSON.stringify(issues).includes('<script>'));
});

test('Forecast model comparison produces MA, SES, Linear Trend, MAE, and Model Drift alerts safely', () => {
  const now = new Date('2026-11-10T04:00:00Z');
  const txs = [];
  // 28 completed days with sharp upward shift in final 7 days to verify linear slope and drift watch.
  for (let d = 28; d >= 1; d--) {
    const count = d <= 7 ? 6 : 1;
    const dayStr = new Date(now.getTime() - d * 86400000).toISOString().slice(0, 10);
    for (let k = 0; k < count; k++) {
      txs.push({
        id: `t-${d}-${k}`,
        item_id: 'bike',
        customer_id: `cust-${(d + k) % 4}`,
        status: 'COMPLETED',
        confirmed_rental_at: `${dayStr} 10:00:00`,
        confirmed_return_at: `${dayStr} 12:00:00`,
        due_at: `${dayStr} 13:00:00`,
        rental_fee: 100
      });
    }
  }
  const result = calculateDetailedAnalytics({ items: [{ id: 'bike', name: 'Bike', category_id: 'c1', created_at: '2026-09-01', is_active: true, status: 'AVAILABLE' }], categories: [{ id: 'c1', name: 'Sports' }], transactions: txs }, { period: '90d', groupBy: 'daily' }, now);
  const comp = result.forecast.comparison;
  assert.equal(comp.ready, true);
  assert.deepEqual(comp.models.map(m => m.key), ['ma', 'ses', 'linear']);
  assert.ok(comp.slope.rentals > 0);
  assert.equal(comp.driftAlert.detected, true);
  assert.equal(comp.driftAlert.direction, 'upward');
  assert.ok(Number.isFinite(comp.models[0].maeRentals));
  assert.ok(Number.isFinite(comp.models[1].maeRentals));
  assert.ok(Number.isFinite(comp.models[2].maeRentals));
});

test('Late-return decision tree builds pruned IF-THEN rules cleanly and enforces min sample guard', () => {
  const now = new Date('2026-11-10T04:00:00Z');
  const small = buildLateReturnDecisionTree([{ id: '1', item_id: 'b', status: 'COMPLETED', confirmed_rental_at: '2026-11-01 10:00:00', received_at: '2026-11-01 12:00:00', due_at: '2026-11-01 11:00:00' }], [], [], now);
  assert.equal(small.ready, false);

  const items = [{ id: 'b', name: 'Bike', category_id: 'sports' }];
  const cats = [{ id: 'sports', name: 'Sports' }];
  const txs = [];
  for (let i = 0; i < 8; i++) {
    txs.push({ id: `late-${i}`, item_id: 'b', customer_id: `u${i}`, status: 'COMPLETED', fulfillment_mode: 'DELIVERY', fee_breakdown: { package_kind: 'WHOLE_STAY' }, confirmed_rental_at: `2026-10-0${(i % 8) + 1} 10:00:00`, received_at: `2026-10-0${(i % 8) + 1} 15:00:00`, due_at: `2026-10-0${(i % 8) + 1} 12:00:00` });
    txs.push({ id: `ontime-${i}`, item_id: 'b', customer_id: `w${i}`, status: 'COMPLETED', fulfillment_mode: 'WALK_IN', fee_breakdown: { package_kind: 'HOURLY' }, confirmed_rental_at: `2026-10-0${(i % 8) + 1} 10:00:00`, received_at: `2026-10-0${(i % 8) + 1} 11:00:00`, due_at: `2026-10-0${(i % 8) + 1} 12:00:00` });
  }
  txs.push({ id: 'active-del', item_id: 'b', customer_id: 'act1', status: 'ACTIVE', fulfillment_mode: 'DELIVERY', fee_breakdown: { package_kind: 'WHOLE_STAY' }, confirmed_rental_at: '2026-11-10 09:00:00', due_at: '2026-11-10 18:00:00' });

  const tree = buildLateReturnDecisionTree(txs, items, cats, now);
  assert.equal(tree.ready, true);
  assert.ok(tree.rules.length >= 2);
  assert.ok(tree.rules[0].ruleText.startsWith('IF '));
  assert.equal(tree.rules[0].lateRate, 1);
  assert.equal(tree.activeSummary.activeCount, 1);
  assert.equal(tree.activeSummary.elevatedCount, 1);
});

test('K-Means customer segments, Market Basket bundles, and CSV preserve aggregate privacy (zero PII)', () => {
  const now = new Date('2026-11-10T04:00:00Z');
  const items = [
    { id: 'bike', name: 'Bicycle', category_id: 'c1', created_at: '2026-08-01', is_active: true, status: 'AVAILABLE' },
    { id: 'uno', name: 'Uno Cards', category_id: 'c2', created_at: '2026-08-01', is_active: true, status: 'AVAILABLE' }
  ];
  const categories = [{ id: 'c1', name: 'Sports' }, { id: 'c2', name: 'Cards' }];
  const txs = [];
  for (let i = 0; i < 8; i++) {
    const day = `2026-11-0${Math.min(9, i + 1)}`;
    txs.push({ id: `r1-${i}`, rental_code: `SECRET-CODE-${i}`, item_id: 'bike', customer_id: `SECRET-CUST-${i}`, customer_name: `Private Name ${i}`, status: 'COMPLETED', confirmed_rental_at: `${day} 10:00:00`, received_at: `${day} 12:00:00`, due_at: `${day} 13:00:00`, rental_fee: 100 + i * 50 });
    if (i < 4) {
      txs.push({ id: `r2-${i}`, rental_code: `SECRET-PAIR-${i}`, item_id: 'uno', customer_id: `SECRET-CUST-${i}`, status: 'COMPLETED', confirmed_rental_at: `${day} 10:15:00`, received_at: `${day} 12:00:00`, due_at: `${day} 13:00:00`, rental_fee: 50 });
    }
  }
  const detail = calculateDetailedAnalytics({ items, categories, transactions: txs }, { period: '30d', groupBy: 'daily' }, now);
  assert.equal(detail.customerSegments.available, true);
  assert.equal(detail.customerSegments.method, 'kmeans');
  assert.equal(detail.marketBasket.available, true);
  assert.equal(detail.marketBasket.bundles[0].coRentals, 4);

  const csv = analyticsCsv(detail, { items, categories, transactions: txs }, { period: '30d', groupBy: 'daily' });
  const htmlAll = ['performance', 'forecast', 'recommendations']
    .map(section => renderAnalyticsReport({ items, categories, transactions: txs }, { period: '30d', groupBy: 'daily' }, { section }, helpers))
    .join('\n');

  for (const text of [csv, htmlAll]) {
    assert.doesNotMatch(text, /SECRET-CUST-|SECRET-CODE-|SECRET-PAIR-|Private Name|NaN|Infinity|undefined/);
  }
  assert.ok(csv.includes('PARETO 80-20'));
  assert.ok(csv.includes('CUSTOMER GROUPS SUMMARY'));
  assert.ok(csv.includes('SUGGESTED EQUIPMENT BUNDLES'));
});

test('What-If simulator never mutates source model and responds to live DOM input changes', async () => {
  const source = {
    groups: [{ id: 'bike', name: 'Bicycle', units: 2, rentals: 10, fees: 2000, utilization: 0.4 }],
    totals: { rentals: 10, fees: 2000, utilization: 0.4 }
  };
  const beforeSnap = structuredClone(source);
  const sim = simulateWhatIfScenario(source, { targetGroupId: 'bike', extraUnits: 2, rateChangePct: 10, demandShiftPct: 20 });
  assert.deepEqual(source, beforeSnap);
  assert.ok(sim.projectedRentals > 10);
  assert.ok(sim.projectedFees > 2000);

  const originals = new Map(['document', 'window'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const { document, window } = parseHTML('<html><body><main></main></body></html>');
  globalThis.document = document;
  globalThis.window = window;
  try {
    const model = {
      customers: [], maintenance: [], rates: [], users: [], terminals: [], verification: [], auditLogs: [],
      settings: { business_name: 'Rent & Play' },
      categories: [{ id: 'c1', name: 'Sports' }],
      items: [{ id: 'bike', name: 'Bicycle', category_id: 'c1', created_at: '2026-08-01', is_active: true, status: 'AVAILABLE' }],
      transactions: [{ id: 'r1', item_id: 'bike', customer_id: 'c1', status: 'COMPLETED', confirmed_rental_at: '2026-10-15 10:00:00', received_at: '2026-10-15 12:00:00', due_at: '2026-10-15 13:00:00', rental_fee: 500 }]
    };
    const ui = createWorkspaceUI({ escape, icon: () => '', money: v => `₱${v}`, formatDate: v => String(v || ''), toast: () => {}, api: async () => structuredClone(model) });
    ui.setReportSection('recommendations');
    ui.render('Reports', { id: 'owner', role: 'OWNER' });
    await ui.load();
    const main = document.querySelector('main');
    main.innerHTML = ui.render('Reports', { id: 'owner', role: 'OWNER' });
    ui.bind('Reports', { id: 'owner', role: 'OWNER' }, () => {});
    const beforeOut = main.querySelector('#analytics-whatif-output').textContent;
    main.querySelector('[name="extraUnits"]').value = '3';
    main.querySelector('#analytics-whatif-form').dispatchEvent(new window.Event('input', { bubbles: true }));
    const afterOut = main.querySelector('#analytics-whatif-output').textContent;
    assert.notEqual(afterOut, beforeOut);
  } finally {
    for (const [k, d] of originals) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});

test('New SVG chart builders escape untrusted text, preserve interactive bindings and resize cleanly', () => {
  const p = paretoChart([{ name: '<img src=x onerror=1>', value: 100, cumulative: 1, share: 1, tier: 'Vital 80%' }], { escape });
  const w = waterfallChart([{ label: '<b>Net</b>', kind: 'total', amount: 100, start: 0, end: 100 }], { escape });
  const s = stackedColumnChart(
    ['W1', 'W2'],
    [
      { name: 'Counter', color: '#337db5', values: [1, 2] },
      { name: 'Delivery', color: '#2b8a57', values: [3, 4] },
    ],
    { escape },
  );
  const hi = histogramChart([{ label: '0–2 hrs', count: 2, share: 1 }], { escape, stats: { available: true, mean: 1, median: 1, modeBin: { label: '0–2 hrs' }, stdDev: 0 } });
  for (const [index, markup] of [p, w, s, hi].entries()) {
    const { document, window } = parseHTML(`<html><body>${markup}</body></html>`);
    bindAnalyticsCharts(document);
    assert.equal(document.querySelectorAll('img').length, 0);
    assert.doesNotMatch(markup, /NaN|Infinity|undefined/);
    const tooltip = document.querySelector('.ana-plot [data-ana-tooltip]');
    assert.ok(tooltip, `expected tooltip inside .ana-plot for chart ${index}`);
    const point = document.querySelector('[data-ana-point="0"]');
    point.dispatchEvent(new window.Event('pointerenter'));
    assert.equal(tooltip.hidden, false);
    const readoutText = document.querySelector('[data-ana-readout]').textContent.trim();
    assert.ok(readoutText.length > 0);
    assert.doesNotMatch(readoutText, /NaN|Infinity|undefined/);
    assert.match(readoutText, index === 0 ? /100/ : index === 1 ? /100/ : index === 2 ? /Counter.*1/ : /2 records/);

    // Verify non-zero layout bounds trigger responsiveChart + rebind without throwing (e.g. missing .ana-chart-tools).
    const resizedDom = parseHTML(`<html><body><div class="host">${markup}</div></body></html>`);
    resizedDom.window.Element.prototype.getBoundingClientRect = () => ({ width: 615, height: 295 });
    assert.doesNotThrow(() => bindAnalyticsCharts(resizedDom.document));
    const resizedChart = resizedDom.document.querySelector('[data-ana-chart]');
    assert.equal(resizedChart.dataset.anaBound, 'true');
    assert.equal(Number(resizedChart.querySelector('[data-ana-plot] svg').getAttribute('viewBox').split(' ')[2]), 615);
    const resizedPoint = resizedDom.document.querySelector('[data-ana-point="0"]');
    resizedPoint.dispatchEvent(new resizedDom.window.Event('pointerenter'));
    assert.equal(resizedDom.document.querySelector('.ana-plot [data-ana-tooltip]').hidden, false);
    assert.ok(resizedDom.document.querySelector('[data-ana-readout]').textContent.trim().length > 0);
  }

  // Verify legend toggle on stackedColumnChart hides toggled series from tooltip readout.
  const stackedDom = parseHTML(`<html><body>${s}</body></html>`);
  bindAnalyticsCharts(stackedDom.document);
  const counterToggle = stackedDom.document.querySelector('[data-ana-toggle="0"]');
  assert.ok(counterToggle);
  counterToggle.click();
  stackedDom.document.querySelector('[data-ana-point="0"]').dispatchEvent(new stackedDom.window.Event('pointerenter'));
  const toggledReadout = stackedDom.document.querySelector('[data-ana-readout]').textContent;
  assert.doesNotMatch(toggledReadout, /Counter/);
  assert.match(toggledReadout, /Delivery/);

  assert.match(inlineDataBar(45, 100, '45%', 'teal'), /45\.0%/);
  assert.match(statusIconBadge('Vital 80%', 'high'), /Vital 80%/);
});
