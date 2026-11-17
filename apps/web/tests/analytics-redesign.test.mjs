import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderAnalyticsReport } from '../src/analytics-report.js';
import { bindAnalyticsCharts, pairedComparisonChart } from '../src/analytics-charts.js';
import { animateAnalyticsKPIs } from '../src/analytics-chart-motion.js';
import { updateForecastWorkspace } from '../src/forecast-workspace.js';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const helpers = {
  escape,
  now: new Date('2026-11-10T04:00:00Z'),
  money: v => `₱${Number(v || 0).toFixed(2)}`,
  formatDate: v => String(v || ''),
  paged: rows => ({ rows: rows.slice(0, 6), footer: '<footer>Pagination</footer>' }),
  table: (heads, rows) => `<table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`
};

function buildRichModel({ overdueCount = 3, overdueLimitPct = 10, maintenanceRecords = 2 } = {}) {
  const categories = [
    { id: 'c-sports', name: 'Sports Gear' },
    { id: 'c-games', name: 'Board & Console' }
  ];
  const items = [
    { id: 'item-bike', name: 'Mountain Bike', category_id: 'c-sports', status: 'AVAILABLE', is_active: true, created_at: '2026-02-01' },
    { id: 'item-switch', name: 'Nintendo Switch', category_id: 'c-games', status: 'AVAILABLE', is_active: true, created_at: '2026-02-01' },
    { id: 'item-badminton', name: 'Badminton Set', category_id: 'c-sports', status: 'AVAILABLE', is_active: true, created_at: '2026-02-01' }
  ];
  const transactions = [];
  const start = Date.parse('2026-03-01T09:00:00Z');
  for (let day = 0; day < 245; day++) {
    const dt = new Date(start + day * 86400000);
    const iso = dt.toISOString().slice(0, 10);
    const item = day % 3 === 0 ? 'item-switch' : day % 2 === 0 ? 'item-bike' : 'item-badminton';
    const late = day % 5 === 0;
    const hr = 9 + (day % 4) * 2;
    const hh = String(hr).padStart(2, '0');
    const dueHh = String(hr + 3).padStart(2, '0');
    const recHh = String(hr + (late ? 5 : 2)).padStart(2, '0');
    transactions.push({
      id: `tx-${day}`,
      item_id: item,
      customer_id: `cust-${(day % 4) + 1}`,
      status: 'COMPLETED',
      confirmed_rental_at: `${iso} ${hh}:00:00`,
      due_at: `${iso} ${dueHh}:00:00`,
      received_at: `${iso} ${recHh}:30:00`,
      rental_fee: item === 'item-switch' ? 350 : 200,
      payment_method: day % 2 === 0 ? 'CASH' : 'QR',
      channel: day % 3 === 0 ? 'DELIVERY' : 'COUNTER',
      verification_seconds: day % 4 === 0 ? 75 : 22
    });
  }
  for (let k = 0; k < overdueCount; k++) {
    transactions.push({
      id: `tx-overdue-${k}`,
      item_id: k % 2 === 0 ? 'item-bike' : 'item-switch',
      customer_id: `cust-${(k % 4) + 1}`,
      status: 'RENTED',
      confirmed_rental_at: '2026-11-01 10:00:00',
      due_at: '2026-11-02 12:00:00',
      rental_fee: 300,
      payment_method: 'CASH'
    });
  }
  const maintenance = [];
  for (let m = 0; m < maintenanceRecords; m++) {
    maintenance.push({
      id: `m-${m}`,
      item_id: 'item-bike',
      issue_type: 'Brake pad wear',
      notes: 'Front brake inspection and tune-up',
      reported_at: `2026-10-0${m + 1} 11:00:00`,
      downtime_hours: 4,
      cost: 150
    });
  }
  return {
    customers: [
      { id: 'cust-1', name: 'Alex' },
      { id: 'cust-2', name: 'Bea' },
      { id: 'cust-3', name: 'Carlo' },
      { id: 'cust-4', name: 'Dina' }
    ],
    rates: [],
    users: [],
    terminals: [],
    verification: [],
    auditLogs: [],
    categories,
    items,
    maintenance,
    transactions,
    settings: {
      business_name: 'Rent & Play',
      analytics_targets: {
        monthly_fee_goal: 15000,
        monthly_rental_goal: 60,
        utilization_goal: 0.25,
        overdue_rate_alert: overdueLimitPct / 100
      }
    }
  };
}

async function withDomGlobals(document, window, fn) {
  const keys = ['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = new Map(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  globalThis.document = document;
  globalThis.window = window;
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
  try {
    return await fn();
  } finally {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
}

test('categoryDonut and demandHeatmap support interactive slice selection, legend readout, and non-overlapping status', () => {
  const html = renderAnalyticsReport(buildRichModel(), { period: '365d', groupBy: 'monthly' }, { section: 'performance' }, helpers);
  const { document, window } = parseHTML(`<html><body>${html}</body></html>`);
  const frames = [];
  window.matchMedia = () => ({ matches: true });
  window.requestAnimationFrame = cb => { frames.push(cb); return frames.length; };

  withDomGlobals(document, window, () => {
    bindAnalyticsCharts(document);
  });

  const donut = document.querySelector('[data-ana-donut]');
  assert.ok(donut);
  const donutKeys = [...donut.querySelectorAll('.ana-donut-key')];
  assert.ok(donutKeys.length >= 2);
  const defaultTotal = donut.querySelector('[data-ana-donut-total]').textContent;
  const defaultLabel = donut.querySelector('[data-ana-donut-label]').textContent;

  donutKeys[0].click();
  assert.notEqual(donut.querySelector('[data-ana-donut-label]').textContent, defaultLabel);
  assert.ok(donut.querySelector('[data-ana-donut-sub]').textContent.trim().length > 0);
  donutKeys[0].click();
  assert.equal(donut.querySelector('[data-ana-donut-total]').textContent, defaultTotal);
  assert.equal(donut.querySelector('[data-ana-donut-label]').textContent, defaultLabel);

  const heatmap = document.querySelector('[data-ana-heatmap]');
  assert.ok(heatmap);
  assert.ok(heatmap.querySelector('.ana-heat-scale'));
  const readout = heatmap.querySelector('[data-ana-heat-readout]');
  assert.ok(readout);
  const cell = heatmap.querySelectorAll('[data-ana-heat-cell]')[2];
  assert.ok(cell);
  const beforeReadout = readout.textContent;
  cell.dispatchEvent(new window.Event('focus'));
  assert.notEqual(readout.textContent, beforeReadout);
});

test('animateAnalyticsKPIs skips requestAnimationFrame under reduced motion and animates to final text when allowed', () => {
  const html = renderAnalyticsReport(buildRichModel(), { period: '90d', groupBy: 'monthly' }, { section: 'performance' }, helpers);
  const { document, window } = parseHTML(`<html><body>${html}</body></html>`);
  const calls = [];
  window.requestAnimationFrame = cb => { calls.push(cb); return calls.length; };

  window.matchMedia = () => ({ matches: true });
  withDomGlobals(document, window, () => {
    animateAnalyticsKPIs(document);
  });
  assert.equal(calls.length, 0);

  const strong = document.querySelector('.ana-kpi > strong[data-ana-count-text]');
  assert.ok(strong);
  const expectedText = strong.getAttribute('data-ana-count-text');
  assert.ok(expectedText);

  let nowMs = 1000;
  window.matchMedia = () => ({ matches: false });
  window.performance = { now: () => nowMs };
  withDomGlobals(document, window, () => {
    animateAnalyticsKPIs(document);
  });
  assert.ok(calls.length > 0);
  for (let guard = 0; calls.length && guard < 20; guard++) {
    nowMs += 400;
    calls.shift()(nowMs);
  }
  assert.equal(calls.length, 0);
  assert.equal(strong.textContent, expectedText);
});

test('Performance renders KPI icons, sparklines, weekday peak highlight, and searchable definitions in an info dialog', () => {
  const html = renderAnalyticsReport(buildRichModel(), { period: '90d', groupBy: 'monthly' }, { section: 'performance' }, helpers);
  const { document, window } = parseHTML(`<html><body><main>${html}</main></body></html>`);

  const kpis = [...document.querySelectorAll('#analytics-panel-performance > .ana-kpis > .ana-kpi')];
  assert.deepEqual(
    kpis.map(k => k.querySelector('.ana-kpi-top').textContent),
    ['Recorded rental fees', 'Confirmed rentals', 'Equipment utilization', 'Overdue rentals now']
  );
  assert.equal(kpis.filter(k => k.querySelector('.ana-kpi-icon svg')).length, 4);
  assert.ok(document.querySelector('#analytics-panel-performance .ana-kpi-spark svg'));
  assert.equal(document.querySelectorAll('#analytics-panel-performance details[open]').length, 0);
  assert.equal(document.querySelector('[data-analytics-detail="definitions"]').hasAttribute('hidden'), false);

  const searchInput = document.querySelector('[data-analytics-info-content="metrics"]').content.querySelector('#ana-glossary-search');
  assert.ok(searchInput);
  const items = [...document.querySelector('[data-analytics-info-content="metrics"]').content.querySelectorAll('[data-ana-glossary-item]')];
  assert.ok(items.length > 3);
  searchInput.value = 'Overdue';
  searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  // Verify filtering via workspace-ui bind
});

test('Performance glossary search filters items cleanly via workspace-ui bindings', async () => {
  const model = buildRichModel();
  const { document, window } = parseHTML('<html><body><main></main><dialog id="modal"></dialog></body></html>');
  window.matchMedia = () => ({ matches: true });
  await withDomGlobals(document, window, async () => {
    const modal=document.querySelector('#modal');
    const ui = createWorkspaceUI({ escape, icon: () => '', money: helpers.money, formatDate: helpers.formatDate, toast: () => {},modal,showModal:(title,html)=>{modal.innerHTML=html;}, api: async () => structuredClone(model) });
    ui.setReportSection('performance');
    ui.render('Reports', { id: 'owner', role: 'OWNER' });
    await ui.load();
    const main = document.querySelector('main');
    main.innerHTML = ui.render('Reports', { id: 'owner', role: 'OWNER' });
    ui.bind('Reports', { id: 'owner', role: 'OWNER' }, () => {});

    main.querySelector('[data-analytics-info="metrics"]').click();
    const search = modal.querySelector('#ana-glossary-search');
    const items = [...modal.querySelectorAll('[data-ana-glossary-item]')];
    assert.ok(search && items.length > 2);
    search.value = 'utilization';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    const visible = items.filter(el => !el.hidden);
    const hidden = items.filter(el => el.hidden);
    assert.ok(visible.length >= 1 && visible.some(el => el.textContent.toLowerCase().includes('utilization')));
    assert.ok(hidden.length >= 1);
  });
});

test('Forecasting preserves the Module 9 palette, equipment order, model focus and accessible evidence across updates', () => {
  const model = buildRichModel();
  const html = renderAnalyticsReport(model, { period: '365d', groupBy: 'monthly' }, { section: 'forecast' }, helpers);
  const { document } = parseHTML(`<html><body>${html}</body></html>`);

  for (const hex of ['#3b82f6', '#f97316', '#0d9488', '#8b5cf6']) {
    assert.ok(html.includes(hex), `Expected Module 9 color ${hex} in Forecast HTML`);
  }
  assert.ok(document.querySelector('.ana-model-comparison-visual'));
  assert.ok(document.querySelector('.ana-equipment-demand-visual'));

  const projection = document.querySelector('.ana-equipment-demand-visual');
  const lateRisk = document.querySelector('[data-analytics-detail="late-risk"]');
  assert.ok(projection && lateRisk);
  assert.ok(html.indexOf('ana-equipment-demand-visual') < html.indexOf('data-analytics-detail="late-risk"'), 'Equipment demand mix must appear BEFORE Late-return risk');

  const focusedHtml = renderAnalyticsReport(model, { period: '365d', groupBy: 'monthly' }, { section: 'forecast', forecastModel: 'ses' }, helpers);
  assert.ok(focusedHtml.includes('is-focused') && focusedHtml.includes('is-dimmed'));
  assert.ok(focusedHtml.includes('is-selected-model'));

  // Method notes and operational insights remain visible after a model update.
  const root = parseHTML(`<div id="root">${html}</div>`).document.querySelector('#root');
  updateForecastWorkspace(root, focusedHtml);
  assert.ok(root.querySelector('[data-analytics-info-content="forecast-method"]').content.querySelector('.ana-method-guide'));
  assert.equal(root.querySelector('[data-analytics-info="forecast-method"]').hidden,false);
  assert.equal(root.querySelector('[data-analytics-detail="late-risk"]').closest('[hidden]'),null);
  assert.equal(root.querySelector('[data-analytics-detail="customer-segments"]').closest('[hidden]'),null);
  assert.ok(root.querySelector('.is-selected-model'));
});

test('Recommendations shows 4 KPIs, interactive priority filter + Clear filters, Showing X of Y count, rule collapse, clamped What-If with % diff, and Before/After CHANGE column', async () => {
  const highOverdueModel = buildRichModel({ overdueCount: 15, overdueLimitPct: 2 });
  const { document, window } = parseHTML('<html><body><main></main></body></html>');
  window.matchMedia = () => ({ matches: true });

  await withDomGlobals(document, window, async () => {
    const ui = createWorkspaceUI({ escape, icon: () => '', money: helpers.money, formatDate: helpers.formatDate, toast: () => {}, api: async () => structuredClone(highOverdueModel) });
    ui.setReportSection('recommendations');
    ui.render('Reports', { id: 'owner', role: 'OWNER' });
    await ui.load();
    const main = document.querySelector('main');
    const redraw = () => {
      main.innerHTML = ui.render('Reports', { id: 'owner', role: 'OWNER' });
      ui.bind('Reports', { id: 'owner', role: 'OWNER' }, redraw);
    };
    redraw();

    const kpis = [...main.querySelectorAll('#analytics-panel-recommendations > .ana-kpis > .ana-kpi .ana-kpi-top')].map(el => el.textContent);
    assert.deepEqual(kpis, ['Suggested actions', 'High priority actions', 'Operations actions', 'Equipment & reliability']);
    assert.equal(main.querySelectorAll('#analytics-panel-recommendations > .ana-kpis [data-analytics-kpi-action]').length, 4);
    assert.equal(document.querySelector('#analytics-filter-dock').parentNode, document.body);
    assert.equal(document.querySelector('#analytics-filter-fab').textContent.trim(), '');
    const filterButton = document.querySelector('#analytics-filter-fab');
    const filterPanel = document.querySelector('#analytics-filter-panel');
    assert.equal(document.querySelector('#analytics-filter-dialog'), null);
    assert.equal(filterPanel.getAttribute('role'), 'dialog');
    assert.equal(filterPanel.getAttribute('aria-modal'), 'false');
    assert.equal(filterPanel.getAttribute('aria-hidden'), 'true');
    assert.equal(filterPanel.hasAttribute('inert'), true);
    assert.equal(filterButton.getAttribute('aria-expanded'), 'false');
    assert.ok(filterPanel.querySelector('#analytics-floating-period'));

    main.querySelector('[data-analytics-kpi-action="recommendation-operations"]').click();
    assert.equal(main.querySelector('#analytics-focus-Operations').getAttribute('aria-pressed'), 'true');
    assert.match(main.querySelector('[data-recommendation-count]').textContent, /^Showing \d+ of \d+ recommendation/);
    main.querySelector('[data-recommendation-step="measure"]').click();
    assert.equal(main.querySelector('[data-recommendation-step="measure"]').getAttribute('aria-pressed'), 'true');
    assert.ok(main.querySelector('[data-action-field="measure"].is-highlighted'));
    main.querySelector('[data-recommendation-step="measure"]').click();
    assert.equal(main.querySelector('[data-recommendation-step="measure"]').getAttribute('aria-pressed'), 'false');
    main.querySelector('#analytics-focus-all').click();

    const countEl = main.querySelector('[data-recommendation-count]');
    assert.ok(countEl);
    assert.match(countEl.textContent, /^Showing all \d+ of \d+ recommendation/);

    assert.ok(main.querySelector('.ana-priority-visual'));
    const highBtn = main.querySelector('[data-recommendation-priority="high"]');
    assert.ok(highBtn);
    highBtn.click();
    assert.equal(main.querySelector('[data-recommendation-priority="high"]').getAttribute('aria-pressed'), 'true');
    assert.match(main.querySelector('[data-recommendation-count]').textContent, /^Showing \d+ of \d+ recommendation/);
    const clearBtn = main.querySelector('[data-recommendation-clear]');
    assert.ok(clearBtn);
    clearBtn.click();
    assert.equal(main.querySelector('[data-recommendation-priority="all"]').getAttribute('aria-pressed'), 'true');
    assert.equal(main.querySelector('#analytics-rec-clear'), null);

    // Inline rule trigger accordion ("Why this appeared")
    const ruleBtn = main.querySelector('[data-ana-collapse^="rule-"]');
    assert.ok(ruleBtn);
    const ruleBody = main.querySelector('#' + ruleBtn.getAttribute('aria-controls'));
    assert.equal(ruleBody.hasAttribute('hidden'), true);
    ruleBtn.click();
    assert.equal(ruleBtn.getAttribute('aria-expanded'), 'true');
    assert.equal(ruleBody.hasAttribute('hidden'), false);
    assert.equal(ruleBtn.querySelector('.ana-collapse-hint').textContent, 'Hide notes');

    // What-If simulator live visual, clamping on change, percentage/baseline display & Reset button
    assert.ok(main.querySelector('.ana-whatif-visual'));
    const unitsInput = main.querySelector('#analytics-whatif-form [name="extraUnits"]');
    const beforeOut = main.querySelector('#analytics-whatif-output').textContent;
    unitsInput.value = '4';
    main.querySelector('#analytics-whatif-form').dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.notEqual(main.querySelector('#analytics-whatif-output').textContent, beforeOut);
    assert.match(main.querySelector('#analytics-whatif-output').textContent, /baseline/i);

    unitsInput.value = '99';
    unitsInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(unitsInput.value, '5');

    // Unified Action Queue console & growth layout classes + Quick scenario presets
    assert.ok(main.querySelector('.ana-queue-console > .ana-priority-visual'));
    assert.ok(main.querySelector('.ana-queue-console > .ana-actions-toolbar'));
    assert.ok(main.querySelector('.ana-module-grid.is-growth'));

    const resetBtn = main.querySelector('[data-whatif-reset]');
    assert.ok(resetBtn);
    resetBtn.click();
    assert.equal(main.querySelector('#analytics-whatif-form [name="extraUnits"]').value, '0');
    assert.equal(main.querySelector('#analytics-whatif-output').textContent, beforeOut);

    const unitsPreset = main.querySelector('[data-whatif-preset="units"]');
    const promoPreset = main.querySelector('[data-whatif-preset="promo"]');
    const peakPreset = main.querySelector('[data-whatif-preset="peak"]');
    assert.ok(unitsPreset && promoPreset && peakPreset);
    unitsPreset.click();
    assert.equal(main.querySelector('#analytics-whatif-form [name="extraUnits"]').value, '1');
    promoPreset.click();
    assert.equal(main.querySelector('#analytics-whatif-form [name="rateChangePct"]').value, '-10');
    assert.equal(main.querySelector('#analytics-whatif-form [name="demandShiftPct"]').value, '15');
    peakPreset.click();
    assert.equal(main.querySelector('#analytics-whatif-form [name="demandShiftPct"]').value, '20');
    assert.notEqual(main.querySelector('#analytics-whatif-output').textContent, beforeOut);

    resetBtn.click();
    assert.equal(main.querySelector('#analytics-whatif-form [name="extraUnits"]').value, '0');
    assert.equal(main.querySelector('#analytics-whatif-form [name="rateChangePct"]').value, '0');
    assert.equal(main.querySelector('#analytics-whatif-form [name="demandShiftPct"]').value, '0');
    assert.equal(main.querySelector('#analytics-whatif-output').textContent, beforeOut);

    // Before/After visual diff, lower-is-better hint, CHANGE table column & non-causation note
    const ba = main.querySelector('.ana-ba-visual');
    assert.ok(ba);
    assert.ok(ba.querySelector('.ana-ba-diff'));
    assert.match(ba.textContent, /lower is better/i);
    assert.ok(main.querySelector('[data-analytics-detail="before-after"] th:nth-child(4)')?.textContent.includes('CHANGE'));
    assert.match(main.textContent, /does not establish causation|does not prove causation/i);

    // Lower-is-better alert target progress
    const progress = main.querySelector('.ana-targets-progress');
    assert.ok(progress);
    assert.match(progress.textContent, /Exceeds alert limit/);
  });
});

test('Adaptive pairedComparisonChart renders for <=2 periods while multi-period trend renders lineChart, and Top-N equipment / Mix toggles work', async () => {
  const pairedHtml = pairedComparisonChart(['Oct 2026', 'Nov 2026'], [
    { name: 'Actual', values: [42, 48], color: '#3b82f6' },
    { name: 'Historical estimate', values: [39, 44], color: '#f97316', dashed: true }
  ], { escape, id: 'test-paired', title: 'Paired review' });
  assert.ok(pairedHtml.includes('ana-paired-chart') && pairedHtml.includes('<rect'));

  // Build model with 7 equipment items spanning >=10 complete months (backtest holdout=2 -> paired chart, daily holdout=7 -> line chart)
  const model = buildRichModel();
  model.items.forEach(item => { item.created_at = '2025-12-01'; });
  for (let day = 0; day < 92; day++) {
    const dt = new Date(Date.parse('2025-12-01T09:00:00Z') + day * 86400000);
    const iso = dt.toISOString().slice(0, 10);
    const item = day % 3 === 0 ? 'item-switch' : day % 2 === 0 ? 'item-bike' : 'item-badminton';
    model.transactions.push({
      id: `tx-early-${day}`,
      item_id: item,
      customer_id: `cust-${(day % 4) + 1}`,
      status: 'COMPLETED',
      confirmed_rental_at: `${iso} 10:00:00`,
      due_at: `${iso} 13:00:00`,
      received_at: `${iso} 12:30:00`,
      rental_fee: item === 'item-switch' ? 350 : 200,
      payment_method: 'CASH',
      channel: 'COUNTER'
    });
  }
  const extraNames = ['Chess Set', 'Volleyball', 'Bingo Set', 'Kayak Paddle'];
  extraNames.forEach((name, idx) => {
    const id = `item-extra-${idx}`;
    model.items.push({ id, name, category_id: 'c-sports', status: 'AVAILABLE', is_active: true, created_at: '2025-12-01' });
    model.transactions.push(
      { id: `tx-ex-${idx}-a`, item_id: id, customer_id: 'cust-1', status: 'COMPLETED', confirmed_rental_at: '2026-08-15 10:00:00', due_at: '2026-08-15 12:00:00', received_at: '2026-08-15 11:30:00', rental_fee: 150, payment_method: 'CASH', channel: 'COUNTER' },
      { id: `tx-ex-${idx}-b`, item_id: id, customer_id: 'cust-2', status: 'COMPLETED', confirmed_rental_at: '2026-09-15 10:00:00', due_at: '2026-09-15 12:00:00', received_at: '2026-09-15 11:30:00', rental_fee: 150, payment_method: 'QR', channel: 'DELIVERY' },
      { id: `tx-ex-${idx}-c`, item_id: id, customer_id: 'cust-3', status: 'COMPLETED', confirmed_rental_at: '2026-10-15 10:00:00', due_at: '2026-10-15 12:00:00', received_at: '2026-10-15 11:30:00', rental_fee: 150, payment_method: 'CASH', channel: 'COUNTER' }
    );
  });

  const { document, window } = parseHTML('<html><body><main></main></body></html>');
  window.matchMedia = () => ({ matches: true });
  await withDomGlobals(document, window, async () => {
    const ui = createWorkspaceUI({ escape, icon: () => '', money: helpers.money, formatDate: helpers.formatDate, toast: () => {}, api: async () => structuredClone(model) });
    ui.setReportSection('performance');
    ui.render('Reports', { id: 'owner', role: 'OWNER' });
    await ui.load();
    const main = document.querySelector('main');
    const redraw = () => {
      main.innerHTML = ui.render('Reports', { id: 'owner', role: 'OWNER' });
      ui.bind('Reports', { id: 'owner', role: 'OWNER' }, redraw);
    };
    redraw();

    // Equipment limit defaults to Top 5 out of 7
    assert.equal(main.querySelectorAll('#analytics-panel-performance [aria-labelledby="equipment-comparison-title"] [data-ana-point]').length, 5);
    const allEquipBtn = main.querySelector('[data-equipment-limit="all"]');
    assert.ok(allEquipBtn);
    allEquipBtn.click();
    assert.equal(main.querySelector('[data-equipment-limit="all"]').getAttribute('aria-pressed'), 'true');
    assert.equal(main.querySelectorAll('#analytics-panel-performance [aria-labelledby="equipment-comparison-title"] [data-ana-point]').length, 7);

    // Verify Forecast vs. actual review uses pairedComparisonChart for <=2 periods and lineChart for >=3 periods
    const monthlyReviewHtml = renderAnalyticsReport(model, { period: '365d', groupBy: 'monthly' }, { section: 'forecast' }, helpers);
    const monthlyDoc = parseHTML(`<html><body>${monthlyReviewHtml}</body></html>`).document;
    assert.ok(monthlyDoc.querySelector('[data-analytics-detail="forecast-review"] .ana-line-stroke'),'Use all eligible held-out months when more than two are available');
    const dailyReviewHtml = renderAnalyticsReport(model, { period: '90d', groupBy: 'daily' }, { section: 'forecast' }, helpers);
    const dailyDoc = parseHTML(`<html><body>${dailyReviewHtml}</body></html>`).document;
    assert.equal(dailyDoc.querySelector('[data-analytics-detail="forecast-review"] .ana-paired-chart'), null);
    assert.ok(dailyDoc.querySelector('[data-analytics-detail="forecast-review"] .ana-line-stroke'));

    // Switch to Forecasting & test Forecast Mix Top-5 / Show All 7 and visible insights.
    ui.setReportSection('forecast');
    redraw();
    const mixToggle = main.querySelector('[data-forecast-mix-toggle]');
    assert.ok(mixToggle);
    assert.equal(mixToggle.getAttribute('aria-pressed'), 'false');
    assert.equal(main.querySelectorAll('.ana-equipment-demand-visual [data-ana-point]').length, 5);
    mixToggle.click();
    assert.equal(main.querySelector('[data-forecast-mix-toggle]').getAttribute('aria-pressed'), 'true');
    assert.equal(main.querySelectorAll('.ana-equipment-demand-visual [data-ana-point]').length, 7);

    assert.ok(main.querySelector('.ana-insights-body'));
    assert.equal(main.querySelector('.ana-insights-body').closest('[hidden]'),null);
    assert.equal(main.querySelector('[data-analytics-detail="late-risk"]').closest('[hidden]'),null);
  });
});
