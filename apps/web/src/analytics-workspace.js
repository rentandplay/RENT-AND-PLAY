import { calculateDetailedAnalytics, analyticsEquipmentOptions, forecastEquipmentMix } from './analytics-insights.js';
import { simulateWhatIfScenario } from './analytics-models.js';
import { lineChart, barChart, combinationChart, horizontalBarChart, pairedComparisonChart, categoryDonut, demandHeatmap, paretoChart, waterfallChart, stackedColumnChart, histogramChart, sparklineSvg, inlineDataBar, statusIconBadge } from './analytics-charts.js';
import { monthlyEquipmentHeatmap } from './analytics-equipment-matrix.js';
import { manilaDateKey } from './analytics.js';
import { recordAttrs } from './record-links.js';
import { normalizeReportSection } from './workspace-navigation.js';

const analyticsDetailCache = new WeakMap();
const analyticsDetailCacheMs = 12000;
const selectionCacheKey = selection => JSON.stringify([selection.period, selection.from || '', selection.to || '', selection.categoryId || '', selection.itemId || '', selection.groupBy || '']);
const financeCacheKey = model => {
  const value = model?.financeSummary;
  return value ? JSON.stringify([value.from, value.to, value.totals, value.rental_totals]) : '';
};

function cachedAnalyticsDetail(source, model, selection, section, now) {
  const key = `${section}:${selectionCacheKey(selection)}:${financeCacheKey(model)}`;
  let cache = analyticsDetailCache.get(source);
  if (!cache) { cache = new Map(); analyticsDetailCache.set(source, cache); }
  const cached = cache.get(key), timestamp = Date.now();
  if (cached?.model === model && timestamp - cached.timestamp < analyticsDetailCacheMs) return cached.result;
  const result = calculateDetailedAnalytics(model, selection, now, { section });
  cache.set(key, { model, result, timestamp });
  while (cache.size > 6) cache.delete(cache.keys().next().value);
  return result;
}

export function getCachedAnalyticsDetail(source, selection, section) {
  if (!source || typeof source !== 'object') return null;
  const prefix = `${section}:${selectionCacheKey(selection)}:`;
  const cache = analyticsDetailCache.get(source);
  const entry = cache && [...cache].find(([key, value]) => key.startsWith(prefix) && value.timestamp + analyticsDetailCacheMs > Date.now());
  return entry?.[1].result || null;
}

const number = value => value == null ? '—' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value);
const cash = value => value == null ? '—' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value);
const percent = value => value == null ? '—' : `${number(value * 100)}%`;
const count = (value, noun) => `${number(value)} ${noun}${value === 1 ? '' : 's'}`;
const hours = value => value == null ? '—' : `${number(value)} h`;
const date = key => {
  if (!key) return '—';
  const parsed = new Date(key + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) ? String(key) : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parsed);
};
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

export function renderWhatIfContent(sim, escapeHtml) {
  const e = escapeHtml;
  const maxR = Math.max(1, sim.currentRentals, sim.projectedRentals);
  const maxF = Math.max(1, sim.currentFees, sim.projectedFees);
  const rDiff = sim.projectedRentals - sim.currentRentals;
  const rPct = sim.currentRentals > 0 ? rDiff / sim.currentRentals : null;
  const fPct = sim.currentFees > 0 ? sim.feeDelta / sim.currentFees : null;
  const sign = v => (v > 0 ? '+' : '');
  const rSub = rDiff === 0
    ? `vs. ${number(sim.currentRentals)} baseline (no change)`
    : `${sign(rDiff)}${number(rDiff)}${rPct == null ? '' : ` (${sign(rPct)}${number(rPct * 100)}%)`} vs. ${number(sim.currentRentals)}`;
  const fSub = Math.abs(sim.feeDelta) < 0.005
    ? `vs. ${cash(sim.currentFees)} baseline (no change)`
    : `${sign(sim.feeDelta)}${cash(sim.feeDelta)}${fPct == null ? '' : ` (${sign(fPct)}${number(fPct * 100)}%)`}`;
  const uBase = sim.currentUtilization == null ? '' : ` · baseline ${percent(sim.currentUtilization)}`;
  const outputHtml = `<div><span>Projected rentals</span><strong>${e(number(sim.projectedRentals))}</strong><small>${e(rSub)}</small></div><div><span>Projected fees</span><strong>${e(cash(sim.projectedFees))}</strong><small>${e(fSub)}</small></div><div><span>Est. utilization</span><strong>${e(sim.projectedUtilization == null ? '—' : percent(sim.projectedUtilization))}</strong><small>${sim.projectedUtilization == null ? 'Capacity cannot be estimated' : sim.capacityLimited ? 'Scenario capped by calendar-hour capacity' : sim.capacityWarning ? 'High calendar-hour load (85%+); review timing' : 'Below 85% calendar-hour load'}${e(uBase)}</small></div>`;
  const visualHtml = `<div class="ana-whatif-vis-head"><span>Scenario visual · Baseline vs. Simulated</span><small>Hypothetical estimate only</small></div><div class="ana-pair-bars"><div class="ana-pair-row"><div class="ana-pair-labels"><span>Rentals</span><strong>${e(number(sim.currentRentals))} → ${e(number(sim.projectedRentals))}</strong></div><div class="ana-pair-track"><span class="ana-bar-base" style="width:${Math.min(100, sim.currentRentals / maxR * 100).toFixed(1)}%" title="Current"></span></div><div class="ana-pair-track"><span class="ana-bar-sim is-blue" style="width:${Math.min(100, sim.projectedRentals / maxR * 100).toFixed(1)}%" title="Simulated"></span></div></div><div class="ana-pair-row"><div class="ana-pair-labels"><span>Rental fees (PHP)</span><strong>${e(cash(sim.currentFees))} → ${e(cash(sim.projectedFees))}</strong></div><div class="ana-pair-track"><span class="ana-bar-base" style="width:${Math.min(100, sim.currentFees / maxF * 100).toFixed(1)}%" title="Current"></span></div><div class="ana-pair-track"><span class="ana-bar-sim ${sim.feeDelta >= 0 ? 'is-green' : 'is-red'}" style="width:${Math.min(100, sim.projectedFees / maxF * 100).toFixed(1)}%" title="Simulated"></span></div></div><div class="ana-pair-row"><div class="ana-pair-labels"><span>Est. utilization</span><strong>${e(sim.projectedUtilization == null ? '—' : percent(sim.projectedUtilization))}</strong></div><div class="ana-pair-track"><span class="ana-bar-sim ${sim.capacityWarning ? 'is-red' : 'is-teal'}" style="width:${sim.projectedUtilization == null ? 0 : Math.min(100, sim.projectedUtilization * 100).toFixed(1)}%"></span></div></div></div><div class="ana-pair-legend"><span><i style="background:#94a3b8"></i>Current baseline</span><span><i style="background:#3b82f6"></i>Simulated volume</span><span><i style="background:#16a34a"></i>Simulated fee impact</span></div>`;
  return { outputHtml, visualHtml };
}

export function renderAnalyticsWorkspace(model = {}, selection = {}, view = {}, h) {
  selection = { ...selection, period: selection.period || '365d', groupBy: selection.groupBy || 'monthly' };
  const { escape: e, table, paged, definitions = [] } = h, now = h.now || new Date();
  const section = normalizeReportSection(view.section);
  // Recalculate live overdue status at render time, including within the same day.
  const result = cachedAnalyticsDetail(h.cacheIdentity || model, model, selection, section, now), today = manilaDateKey(now);
  const empty = (title, note) => `<div class="ana-empty"><strong>${e(title)}</strong><p>${e(note)}</p></div>`;
  const head = (title, note, controls = '') => `<header class="ana-panel-head"><div><h3>${e(title)}</h3><p>${e(note)}</p></div>${controls}</header>`;
  const sectionBlock = (num, title, subtitle) => `<div class="ana-section-divider" role="heading" aria-level="3"><span class="ana-section-num">${e(num)}</span><div class="ana-section-meta"><strong>${e(title)}</strong><span>${e(subtitle)}</span></div></div>`;
  const choices = (rows, selected) => rows.map(([id, label]) => `<option value="${e(id)}" ${String(id) === String(selected) ? 'selected' : ''}>${e(label)}</option>`).join('');
  const tabs = `<div class="ana-tabs" role="tablist" aria-label="Analytics sections">${[
    ['performance', 'Performance', 'Descriptive', 'What happened?'],
    ['forecast', 'Forecasting', 'Predictive', 'What may happen next?'],
    ['recommendations', 'Recommendations', 'Prescriptive', 'What should we review?']
  ].map(([id, title, kind, question], i) => `<button type="button" role="tab" id="analytics-tab-${id}" aria-label="${title}" aria-controls="analytics-panel-${id}" aria-selected="${section === id}" tabindex="${section === id ? 0 : -1}" data-analytics-tab="${id}"><span class="ana-tab-body"><span class="ana-tab-pill">${kind}</span><span class="ana-tab-name">${title}</span></span></button>`).join('')}</div>`;
  const equipment = analyticsEquipmentOptions(model.items).filter(item => !selection.categoryId || item.categoryId === String(selection.categoryId));
  const filters = `<section class="panel analytics-filters ana-filters" aria-label="Analytics filters"><label>Date range<select id="analytics-period" aria-label="Reporting period">${choices([['7d','Last 7 days'],['30d','Last 30 days'],['90d','Last 90 days'],['365d','Last 365 days'],['custom','Custom dates']], selection.period || '365d')}</select></label>${selection.period === 'custom' ? `<label>From<input id="analytics-from" aria-label="From date" type="date" max="${today}" value="${e(selection.from)}"/></label><label>To<input id="analytics-to" aria-label="To date" type="date" max="${today}" value="${e(selection.to)}"/></label>` : ''}<label>Trend interval<select id="analytics-group" aria-label="Analytics interval">${choices([['auto','Automatic'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']], selection.groupBy || 'monthly')}</select></label><label>Category<select id="analytics-category" aria-label="Analytics category"><option value="">All categories</option>${choices((model.categories || []).map(row => [String(row.id),row.name]),selection.categoryId)}</select></label><label>Equipment<select id="analytics-item" aria-label="Analytics equipment"><option value="">All equipment</option>${choices(equipment.map(row => [row.id,`${row.name} · ${count(row.units,'active unit')}`]),selection.itemId)}</select></label><div class="ana-filter-actions"><button class="secondary" type="button" id="analytics-reset">Reset</button><button class="primary" type="button" id="report-export" ${result.error ? 'disabled' : ''}>Export analytics CSV</button></div></section>`;
  if (result.error) return `<div class="analytics-workspace ana-business">${tabs}${filters}<p class="info-box" role="alert">${e(result.error)}</p></div>`;
  const { totals: t, comparison: c, forecast: f, targets } = result;
  const visiblePanel = (key, title, note, content, controls = '') => `<section class="panel ana-visible-panel" data-analytics-detail="${key}" aria-label="${e(title)}">${head(title, note, controls)}<div class="ana-disclosure-content">${content}</div></section>`;
  const delta = (change, points = false, invert = false) => {
    if (!change || change.difference == null) return '<span class="ana-delta is-neutral">No prior comparison</span>';
    if (change.newActivity) return '<span class="ana-delta is-neutral">New activity · previous: 0</span>';
    if (!change.difference) return '<span class="ana-delta is-neutral">No change vs. previous</span>';
    const amount = points ? `${number(Math.abs(change.difference) * 100)} pts` : `${number(Math.abs(change.percent) * 100)}%`;
    const favorable = invert ? change.difference < 0 : change.difference > 0;
    return `<span class="ana-delta ${favorable ? 'is-up' : 'is-down'}">${change.difference > 0 ? '↗' : '↘'} ${amount} vs. previous</span>`;
  };
  const kpiSvgMap = {
    fees: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="4.5" width="15" height="11" rx="2"/><circle cx="10" cy="10" r="2.5"/><path d="M5.5 10h.01M14.5 10h.01"/></svg>',
    rentals: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 15V9M9 15V5M14 15v-4M18 15H2"/></svg>',
    utilization: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 3a7 7 0 1 0 7 7"/><path d="M10 10l4.5-4.5"/><circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none"/></svg>',
    overdue: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="7.5"/><path d="M10 6.5v4l2.5 1.5"/></svg>',
    forecast: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><polyline points="17 6 11 12 7.5 8.5 3 13"/><polyline points="13 6 17 6 17 10"/></svg>',
    actions: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 2.5L4.5 11H10l-1 6.5L15.5 9H10l1-6.5Z"/></svg>',
    alert: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 3L2.5 16.5h15L10 3Z"/><path d="M10 8.5v3.5M10 14h.01"/></svg>',
    equipment: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 6.5 7-3.5 7 3.5v7L10 17l-7-3.5v-7Zm0 0 7 3.5 7-3.5M10 10v7"/></svg>'
  };
  const kpi = (name, value, note, change = '', attainment = null, opts = {}) => {
    const iconSvg = opts.icon && kpiSvgMap[opts.icon] ? `<span class="ana-kpi-icon is-${e(opts.tone || 'neutral')}" aria-hidden="true">${kpiSvgMap[opts.icon]}</span>` : '';
    const countAttrs = opts.raw != null && Number.isFinite(opts.raw) ? ` data-ana-count-target="${opts.raw}" data-ana-count-fmt="${e(opts.fmt || 'number')}" data-ana-count-text="${e(value)}" data-ana-count-key="${e(opts.countKey || name)}"` : '';
    const spark = opts.sparkline?.length >= 2 ? `<div class="ana-kpi-spark">${sparklineSvg(opts.sparkline, opts.sparkColor || '#3b82f6')}</div>` : '';
    return `<article class="panel ana-kpi${opts.tone === 'danger' ? ' is-alert' : ''}${opts.tone === 'warn' ? ' is-warn' : ''}${opts.tone === 'good' ? ' is-good' : ''}"><div class="ana-kpi-top"><span>${e(name)}</span>${iconSvg}</div><strong${countAttrs}>${value}</strong>${change}${spark}${attainment == null ? '' : `<meter class="ana-goal-meter" aria-label="Goal attainment" min="0" max="100" value="${Math.min(100,Math.max(0,attainment*100))}">${percent(attainment)}</meter>`}<small>${e(note)}</small></article>`;
  };
  const rowAttrs = row => recordAttrs('equipment', row.known ? row.id : null, row.name);
  const metricButtons = (chart, value) => `<div class="ana-segment" role="group" aria-label="${chart === 'forecast' ? 'Forecast chart metric' : 'Performance chart metric'}">${[['fees','Rental fees'],['rentals','Rentals']].map(([id,label]) => `<button type="button" id="analytics-metric-${chart}-${id}" data-analytics-chart="${chart}" data-analytics-metric="${id}" aria-pressed="${value === id}">${label}</button>`).join('')}</div>`;
  const coverage = `<section id="analytics-data-coverage" class="panel ana-panel ana-coverage-panel" data-analytics-detail="coverage">${head('Data coverage & missing records',result.quality.length ? count(result.quality.length,'note') : 'No issues detected')}${result.quality.length ? `<ul>${result.quality.map(row => `<li><b>${row.count}</b> ${e(row.text)}</li>`).join('')}</ul>` : '<p class="ana-note">No missing-data conditions were detected for the selected records. This does not independently verify the source records.</p>'}</section>`;
  const glossarySearch = `<label class="ana-glossary-search"><span class="sr-only">Filter metric definitions</span><input type="search" id="ana-glossary-search" data-ana-glossary-search placeholder="Filter metrics or formulas…"/></label>`;
  const glossary = visiblePanel('definitions','How the metrics are calculated','Sources, formulas and measurement limits',`<div class="ana-dictionary-scroll"><dl class="ana-dictionary">${definitions.map(([name,note]) => `<div data-ana-glossary-item data-search-text="${e((name + ' ' + note).toLowerCase())}"><dt>${e(name)}</dt><dd>${e(note)}</dd></div>`).join('')}</dl></div>`, glossarySearch);
  const demo = model.demo_data?.active || result.confirmed.some(row => row.is_demo) ? '<aside class="ana-demo-banner" role="note"><strong>Demo dataset</strong><span>Simulated rental records and fees are included. These are not actual business earnings.</span></aside>' : '';
  const targetValue = key => targets.config[key] ?? '';
  const buildTargetProgress = () => {
    if (targets.scoped) return `<p class="ana-note">${e(targets.scopeReason)}</p>`;
    const rows = [];
    if (targets.config.monthly_fee_goal != null) {
      const ratio = targets.fees.attainment ?? 0;
      const goalVal = targets.fees.goal ?? targets.config.monthly_fee_goal;
      rows.push({ label: 'Rental-fee goal attainment', actual: cash(t.fees), target: cash(goalVal), pct: Math.round(ratio * 100), fillPct: Math.min(100, ratio * 100), tone: ratio >= 1 ? 'good' : ratio >= 0.75 ? 'blue' : 'amber', status: ratio >= 1 ? 'Goal reached' : `${number(ratio * 100)}% of allocated target` });
    }
    if (targets.config.monthly_rental_goal != null) {
      const ratio = targets.rentals.attainment ?? 0;
      const goalVal = targets.rentals.goal ?? targets.config.monthly_rental_goal;
      rows.push({ label: 'Confirmed-rental goal attainment', actual: number(t.rentals), target: number(goalVal), pct: Math.round(ratio * 100), fillPct: Math.min(100, ratio * 100), tone: ratio >= 1 ? 'good' : ratio >= 0.75 ? 'teal' : 'amber', status: ratio >= 1 ? 'Goal reached' : `${number(ratio * 100)}% of allocated target` });
    }
    if (targets.config.utilization_goal != null && t.utilization != null) {
      const goalRate = targets.config.utilization_goal;
      const ratio = goalRate > 0 ? t.utilization / goalRate : 0;
      rows.push({ label: 'Calendar-hour utilization goal', actual: percent(t.utilization), target: percent(goalRate), pct: Math.round(ratio * 100), fillPct: Math.min(100, ratio * 100), tone: ratio >= 1 ? 'good' : ratio >= 0.75 ? 'teal' : 'amber', status: ratio >= 1 ? 'At or above target' : `${number(ratio * 100)}% of goal` });
    }
    if (targets.config.overdue_rate_alert != null) {
      const limit = targets.config.overdue_rate_alert;
      const currentRate = t.overdueRate;
      const ok = !targets.overdue.breached;
      const usedRatio = limit > 0 ? Math.min(1.5, currentRate / limit) : (currentRate > 0 ? 1.5 : 0);
      rows.push({ label: 'Late-return alert threshold (lower is better)', actual: percent(currentRate), target: `${percent(limit)} alert threshold`, pct: Math.round(usedRatio * 100), fillPct: Math.min(100, usedRatio * 100), tone: t.dueRentals < 5 ? 'amber' : ok ? 'good' : 'danger', status: t.dueRentals < 5 ? `Monitoring (${t.dueRentals}/5 due sample)` : ok ? 'Below alert threshold' : 'Exceeds alert limit (at or above threshold)' });
    }
    if (!rows.length) return '';
    return `<div class="ana-targets-progress" aria-label="Target progress tracking"><div class="ana-targets-progress-head"><strong>Target Progress & Threshold Status</strong><span>Compare actual performance against active workspace limits</span></div><div class="ana-targets-bars">${rows.map(r => `<div class="ana-target-row"><div class="ana-target-row-top"><span>${e(r.label)}</span><strong>${e(r.actual)} <em>vs. ${e(r.target)}</em></strong></div><div class="ana-target-track" aria-hidden="true"><span class="ana-target-fill is-${e(r.tone)}" style="width:${r.fillPct.toFixed(1)}%"></span></div><small class="ana-target-status is-${e(r.tone)}">${e(r.status)}</small></div>`).join('')}</div></div>`;
  };
  const targetSettings = visiblePanel('targets','Business targets & alert rules','Owner-defined goals shared across the workspace',`<p class="ana-note">Goals are planning values approved by the owner. Review triggers identify records to inspect. A historical average is not a business target.</p>${buildTargetProgress()}${h.canManageTargets ? `<form id="analytics-targets-form" class="admin-form"><div class="ana-target-fields"><label>Monthly rental-fee goal (PHP)<input name="monthly_fee_goal" type="number" min="0.01" max="1000000000" step="0.01" value="${targetValue('monthly_fee_goal')}" placeholder="Not set"/></label><label>Monthly confirmed-rental goal<input name="monthly_rental_goal" type="number" min="1" max="10000000" step="1" value="${targetValue('monthly_rental_goal')}" placeholder="Not set"/></label><label>Calendar-hour utilization goal (%)<input name="utilization_goal" type="number" min="0.01" max="100" step="any" value="${targets.config.utilization_goal == null ? '' : Number((targets.config.utilization_goal * 100).toPrecision(12))}" placeholder="Not set"/></label><label>Late-return alert rate (%)<input name="overdue_rate_alert" type="number" min="0" max="100" step="any" value="${targets.config.overdue_rate_alert == null ? '' : Number((targets.config.overdue_rate_alert * 100).toPrecision(12))}" placeholder="Not set"/></label></div><p class="ana-note">Leave a field blank to clear it. Set targets using the owner's budget, rental history and available capacity. The late-rate alert requires at least 5 due rentals; current overdue rentals always need follow-up.</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="primary" type="submit">Save business targets</button></div></form>` : `<dl class="ana-facts"><div><dt>Monthly fee goal</dt><dd>${targets.config.monthly_fee_goal == null ? 'Not set' : cash(targets.config.monthly_fee_goal)}</dd></div><div><dt>Monthly rental goal</dt><dd>${targetValue('monthly_rental_goal') || 'Not set'}</dd></div><div><dt>Utilization goal</dt><dd>${targets.config.utilization_goal == null ? 'Not set' : percent(targets.config.utilization_goal)}</dd></div><div><dt>Late-return alert</dt><dd>${targets.config.overdue_rate_alert == null ? 'Not set' : percent(targets.config.overdue_rate_alert)}</dd></div></dl><p class="ana-note">The workspace owner manages these values.</p>`}<p class="ana-note">${e(targets.basis)} ${targets.scoped ? e(targets.scopeReason) : 'Store-wide targets are hidden when a category or equipment filter is applied.'}</p>`);

  function actionButton(row) {
    if (row.itemId) return `<button type="button" class="secondary" ${recordAttrs('equipment',row.itemId,row.itemName || 'equipment')}>View equipment</button>`;
    if (row.page) return `<button type="button" class="secondary" data-analytics-go-page="${e(row.page)}">Open ${e(row.page.toLowerCase())}</button>`;
    return `<button type="button" class="secondary" data-analytics-go-section="${e(row.section || 'performance')}" ${row.coverage ? 'data-analytics-coverage="true"' : ''}>${row.coverage ? 'Review data coverage' : row.section === 'forecast' ? 'View forecasting' : 'View performance'}</button>`;
  }
  function priorities(rows, compact = false) {
    return `<div class="${compact ? 'ana-priority-list' : 'ana-action-grid'}">${rows.map((row,i) => compact ? `<article class="ana-priority-item"><span class="ana-priority-index">${i+1}</span><div><span class="ana-action-type">${e(row.review || 'Review next')}</span><h3>${e(row.title)}</h3><p>${e(row.basis)}</p></div>${actionButton(row)}</article>` : `<article class="panel ana-action-card is-${e(row.priority)}" data-action-id="${e(row.id)}"><header><span class="ana-priority-index">${i+1}</span><span class="ana-priority ana-priority-${e(row.priority)}">${row.priority === 'high' ? 'High priority' : row.priority === 'medium' ? 'Review next' : 'Monitor'}</span><span class="ana-review-tag">${e(row.review || '')}</span></header><h3>${e(row.title)}</h3><dl class="ana-action-framework"><div><dt>Outcome</dt><dd>${e(row.outcome)}</dd></div><div><dt>Measure</dt><dd>${e(row.measure)}</dd></div><div><dt>Target</dt><dd>${e(row.target)}</dd></div></dl><div class="ana-evidence"><span class="ana-box-label">Evidence from records</span><p>${e(row.basis)}</p></div><div class="ana-next-step"><span class="ana-box-label">Action to review</span><p>${e(row.action)}</p></div><footer><button type="button" class="ana-collapse-toggle is-inline" data-ana-collapse="rule-${e(row.id)}" aria-expanded="false" aria-controls="ana-rule-body-${e(row.id)}"><span>Why this appeared</span><span class="ana-collapse-hint">Show notes</span></button>${actionButton(row)}</footer><div id="ana-rule-body-${e(row.id)}" class="ana-rule-expand-body" data-ana-collapse-body hidden><div class="ana-rule-evidence"><strong>Review trigger</strong><p>${e(row.threshold)}</p><small>${e(row.ruleKind)}</small></div></div></article>`).join('')}</div>`;
  }
  function performance() {
    const metric = view.performanceMetric === 'rentals' ? 'rentals' : 'fees', isFees = metric === 'fees';
    const format = isFees ? cash : number;
    const ranking = ['fees','least'].includes(view.rankingMetric) ? view.rankingMetric : 'rentals', rankMetric = ranking === 'fees' ? 'fees' : 'rentals';
    const rankedAll = [...result.groups].filter(row => ranking !== 'least' || row.active).sort((a,b) => ranking === 'least' ? a.rentals-b.rentals || a.name.localeCompare(b.name) : b[rankMetric]-a[rankMetric] || a.name.localeCompare(b.name));
    const equipLimit = view.equipmentLimit === 'all' ? 'all' : view.equipmentLimit === '10' ? '10' : '5';
    const ranked = rankedAll.slice(0, equipLimit === 'all' ? rankedAll.length : Number(equipLimit));
    const equipControls = `<div class="ana-control-stack"><div class="ana-segment" role="group" aria-label="Equipment comparison metric">${[['rentals','Most rented'],['least','Least rented'],['fees','Highest fees']].map(([id,label])=>`<button type="button" id="analytics-ranking-${id}" data-analytics-ranking="${id}" aria-pressed="${ranking===id}">${label}</button>`).join('')}</div>${rankedAll.length > 5 ? `<div class="ana-segment" role="group" aria-label="Equipment limit">${[['5','Top 5'],...(rankedAll.length > 5 ? [['10','Top 10']] : []),['all',`All (${rankedAll.length})`]].map(([id,label])=>`<button type="button" id="analytics-equip-limit-${id}" data-equipment-limit="${id}" aria-pressed="${equipLimit===id}">${label}</button>`).join('')}</div>` : ''}</div>`;

    const goal = targets[metric];
    const peak = result.trend.reduce((best,row) => !best || row[metric] > best[metric] ? row : best,null);
    const interpretation = !t.rentals ? 'No confirmed rentals were found. Check the date and equipment filters before interpreting this as no demand.' : c[metric].newActivity ? 'The preceding matched period had zero recorded activity. A percentage increase cannot be calculated from zero.' : c[metric].percent == null ? 'Use the recorded totals and equipment breakdown; a prior percentage comparison is unavailable.' : `${isFees ? 'Recorded rental fees' : 'Confirmed rentals'} ${c[metric].difference >= 0 ? 'increased' : 'decreased'} ${number(Math.abs(c[metric].percent)*100)}% versus the preceding matched period. Check equipment contribution and availability before changing rates or stock.`;
    const compareTable = table(['EQUIPMENT','THIS PERIOD','PREVIOUS','CHANGE','UTILIZATION'], ranked.map(row => `<tr><td><strong ${rowAttrs(row)}>${e(row.name)}</strong><small>${e(row.category)} · ${count(row.unitCount,'active unit')}${row.active ? '' : ' · Archived'}</small></td><td>${ranking === 'fees' ? cash(row.fees) : row.rentals}</td><td>${ranking === 'fees' ? cash(row.comparison.fees.previous) : row.comparison.rentals.previous}</td><td>${delta(row.comparison[rankMetric])}</td><td>${percent(row.utilization)}</td></tr>`).join(''));
    const categoryRows = [...result.categoryComparison].sort((a,b)=>b[metric]-a[metric] || a.name.localeCompare(b.name));
    const maxCatFee = Math.max(1, ...categoryRows.map(r => r.fees || 0));
    const sort = view.sort || 'rentals', sorted = [...result.groups].sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'least' ? a.rentals-b.rentals : (b[sort] ?? -1)-(a[sort] ?? -1));
    const equipmentPage = paged(sorted,'analytics-equipment');

    const paretoKey = view.paretoMetric === 'rentals' ? 'rentals' : 'fees';
    const paretoData = result.pareto?.[paretoKey] || { available: false, rows: [] };
    const paretoTierKind = tier => tier === 'Vital 80%' ? 'high' : tier === 'Next 15%' ? 'medium' : 'neutral';
    const paretoBody = paretoData.available
      ? `${paretoChart(paretoData.rows,{escape:e,currency:paretoKey==='fees',id:'performance-pareto',title:paretoKey==='fees'?'Pareto 80–20 equipment revenue ranking':'Pareto 80–20 equipment rental ranking'})}<p class="ana-interpretation"><strong>80–20 summary:</strong> ${count(paretoData.vitalCount,'equipment type')} generate ${percent(paretoData.vitalShare)} of total ${paretoKey==='fees'?'recorded fees':'confirmed rentals'}.</p>${table(['RANK','EQUIPMENT','VALUE','CUMULATIVE %','GROUP'],paretoData.rows.slice(0,8).map(r=>`<tr><td>#${r.rank}</td><td>${e(r.name)}</td><td>${paretoKey==='fees'?cash(r.value):number(r.value)}</td><td>${inlineDataBar(r.cumulative*100,100,percent(r.cumulative),r.tier==='Vital 80%'?'amber':'blue')}</td><td>${statusIconBadge(r.tier,paretoTierKind(r.tier))}</td></tr>`).join(''))}`
      : empty('No 80–20 breakdown yet','Confirmed rentals with positive values are needed to rank equipment contributions.');

    const wf = result.waterfall || { available: false, steps: [] };
    const financeNote = h.financeState?.error
      ? `<p class="ana-note" role="alert">${e(h.financeState.error)}</p>`
      : h.financeState?.loading
        ? '<p class="ana-note" role="status">Loading verified store collections, refunds, and expenses…</p>'
        : wf.source !== 'ledger' && h.hasFinanceLoader && !selection.categoryId && !selection.itemId
          ? '<div class="ana-inline-action"><button type="button" class="secondary" data-report-money-load>Include store refunds &amp; expenses</button><span class="ana-note">Loads live ledger collections, refunds, and shop expenses for this period.</span></div>'
          : '';
    const waterfallBody = wf.available
      ? `${waterfallChart(wf.steps,{escape:e,id:'performance-waterfall',title:wf.title})}${financeNote}<p class="ana-note">${wf.source==='ledger'?'Based on verified finance ledger collections minus refunds and recorded shop expenses.':'Based on confirmed rental fees in this filter; reflects recorded charges before refunds or shop expenses.'}</p>`
      : `${empty('No financial bridge yet','Confirmed fees or recorded collections are needed for the waterfall breakdown.')}${financeNote}`;

    const stackedMode = view.stackedMode === 'payment' ? 'payment' : 'channel';
    const ct = result.channelTrends || { buckets: [], totals: { total: 0 }, hasPaymentMethodSplit: false };
    const channelSeries = stackedMode === 'payment'
      ? [
          { name: 'Cash', color: '#16a34a', values: ct.buckets.map(b => b.cash) },
          { name: 'QR / E-wallet', color: '#3b82f6', values: ct.buckets.map(b => b.qr) },
          ...(ct.totals.other > 0 ? [{ name: 'Other / Unrecorded', color: '#64748b', values: ct.buckets.map(b => b.other) }] : [])
        ]
      : [
          { name: 'Shop counter', color: '#3b82f6', values: ct.buckets.map(b => b.counter) },
          { name: 'Resort delivery', color: '#f97316', values: ct.buckets.map(b => b.delivery) }
        ];
    const channelFacts = stackedMode === 'payment'
      ? `<div class="ana-chart-facts"><span>Cash rentals<b>${number(ct.totals.cash || 0)}</b></span><span>QR / E-wallet rentals<b>${number(ct.totals.qr || 0)}</b></span><span>Other / unrecorded<b>${number(ct.totals.other || 0)}</b></span></div>`
      : `<div class="ana-chart-facts"><span>Shop counter<b>${number(ct.totals.counter || 0)} (${ct.totals.total ? percent(ct.totals.counter / ct.totals.total) : '0%'})</b></span><span>Resort delivery<b>${number(ct.totals.delivery || 0)} (${ct.totals.total ? percent(ct.totals.delivery / ct.totals.total) : '0%'})</b></span></div>`;
    const channelBody = ct.totals.total > 0
      ? (stackedMode === 'payment' && !ct.hasPaymentMethodSplit
          ? empty('No Cash or QR payment tags yet','Recorded rentals in this period do not carry CASH or QR payment method tags.')
          : `${stackedColumnChart(ct.buckets.map(b=>b.label),channelSeries,{escape:e,id:'performance-stacked',title:stackedMode==='payment'?'Rentals by payment method':'Rentals by booking channel'})}${channelFacts}`)
      : empty('No trend activity yet','Confirmed rentals are needed to compare channels over time.');

    const histKind = view.histogramKind === 'speed' ? 'speed' : 'duration';
    const histData = histKind === 'speed' ? result.speedHistogram : result.durationHistogram;
    const histBody = histData?.available
      ? histogramChart(histData.bins,{escape:e,id:'performance-histogram',title:histKind==='speed'?'Counter verification counts by range':'Rental duration counts by range',unit:histKind==='speed'?'sec':'hrs',stats:histData})
      : empty(histKind==='speed'?'No counter confirmation speed samples':'No completed duration samples',histKind==='speed'?'Confirmed ESP32 terminal requests with valid request and completion times are required.':'Completed returns with valid start and return timestamps are required.');

    const pivotMetric = ['rentals','avg','share'].includes(view.pivotMetric) ? view.pivotMetric : 'fees';
    const pv = result.pivot || { available: false, rows: [] };
    const formatPivotCell = cell => !cell ? '—' : pivotMetric === 'rentals' ? number(cell.rentals) : pivotMetric === 'avg' ? cash(cell.avgFee) : pivotMetric === 'share' ? percent(cell.feeShare) : cash(cell.fees);
    const pivotBody = pv.available
      ? `${table(['CATEGORY','SHOP COUNTER','RESORT DELIVERY','TOTAL'],[...pv.rows.map(r=>`<tr><td><strong>${e(r.category)}</strong></td><td>${formatPivotCell(r.counter)}</td><td>${formatPivotCell(r.delivery)}</td><td><strong>${formatPivotCell(r.total)}</strong></td></tr>`),`<tr class="ana-total-row"><td><strong>All categories</strong></td><td><strong>${formatPivotCell(pv.totals.counter)}</strong></td><td><strong>${formatPivotCell(pv.totals.delivery)}</strong></td><td><strong>${formatPivotCell(pv.totals.total)}</strong></td></tr>`].join(''))}${pv.hasExplicitBilling?`<div class="ana-billing-pills" aria-label="Booking type breakdown">${pv.billingBreakdown.map(b=>`<span class="ana-pill">${e(b.label)}: <b>${number(b.rentals)}</b> (${percent(b.share)})</span>`).join('')}</div>`:''}`
      : empty('No matrix entries yet','Confirmed rentals in this period will fill the Category × Channel summary.');

    const issues = result.maintenanceIssues || { available: false, rows: [], totalLogs: 0 };
    const maintenanceBody = issues.available
      ? `${horizontalBarChart(issues.rows,{escape:e,id:'performance-maintenance-issues',title:'Frequent maintenance log topics',color:'#f97316',valueLabel:'Logs matching theme',compact:true})}<p class="ana-note">Grouped by keyword frequency across ${count(issues.recordsWithNotes,'maintenance note')} in ${count(issues.totalLogs,'service record')}.</p>`
      : empty('No maintenance issue keywords found',issues.totalLogs ? 'Service records exist in this period without written inspection notes.' : 'No maintenance records were started in this period.');

    return `<section class="panel ana-summary"><div><span class="ana-eyebrow">Performance at a glance</span><h2>Rental performance</h2><p>Recorded charges and confirmed handoffs; excludes cash collections and profit unless ledger cash flow is shown.</p></div><aside><span>Compared with</span><strong>${date(c.from)} – ${date(c.to)}</strong><small>${c.partial ? 'Today is still in progress.' : 'Equal-length reporting period.'}</small></aside></section>
      <div class="ana-kpis">${kpi('Recorded rental fees',cash(t.fees),targets.scoped ? targets.scopeReason : targets.fees.goal == null ? 'Monthly goal not set' : `${percent(targets.fees.attainment)} of allocated goal ${cash(targets.fees.goal)}`,delta(c.fees),targets.fees.attainment,{icon:'fees',tone:'good',raw:t.fees,fmt:'currency',sparkline:result.trend.map(r=>r.fees),sparkColor:'#3b82f6'})}${kpi('Confirmed rentals',number(t.rentals),targets.rentals.goal == null ? 'Confirmed equipment handoffs' : `${percent(targets.rentals.attainment)} of allocated goal ${number(targets.rentals.goal)}`,delta(c.rentals),null,{icon:'rentals',raw:t.rentals,fmt:'number',sparkline:result.trend.map(r=>r.rentals),sparkColor:'#0d9488'})}${kpi('Equipment utilization',percent(t.utilization),`${targets.utilization.goal == null ? '' : 'Owner goal: ' + percent(targets.utilization.goal) + '. '}${hours(t.rentedHours)} rented · calendar-hour basis`,delta(c.utilization,true),null,{icon:'utilization',raw:Number((t.utilization*100).toFixed(1)),fmt:'percent'})}${kpi('Overdue rentals now',number(t.overdueNow),'Current equipment follow-ups · live count',`<span class="ana-delta ${t.overdueNow ? 'is-down' : 'is-up'}">${t.overdueNow ? 'Follow up today' : 'No overdue rentals'}</span>`,null,{icon:'overdue',tone:t.overdueNow?'danger':'good',raw:t.overdueNow,fmt:'number'})}</div>
      <div class="ana-overview-grid"><section class="panel ana-panel ana-trend-panel">${head(isFees ? 'Rental fees: actual vs goal' : 'Confirmed rentals: actual vs goal',`${result.groupBy} totals · actual and goal share the same ${isFees ? 'peso' : 'rental-count'} scale`,metricButtons('performance',metric))}${combinationChart(result.trend.map(row=>row.label),result.trend.map(row=>row[metric]),targets.trend.map(row=>row[metric]),{escape:e,id:'performance-trend',title:isFees?'Recorded rental fees against the allocated goal':'Confirmed rentals against the allocated goal',currency:isFees,integerTicks:!isFees,caption:goal.goal == null ? (targets.scopeReason || 'No owner goal is set. Only recorded activity is plotted.') : 'Goal allocated by calendar days. Current-day actuals are partial; this is not a forecast.'})}<div class="ana-chart-facts"><span>Recorded total<b>${format(t[metric])}</b></span><span>Allocated goal<b>${goal.goal == null ? 'Not set for this view' : format(goal.goal)}</b></span><span>Highest period<b>${peak && t.rentals ? `${format(peak[metric])} · ${e(peak.label)}` : '—'}</b></span></div><p class="ana-interpretation">${e(interpretation)}</p></section><section class="panel ana-panel ana-priorities-panel">${head('Action priorities','What needs attention next','<button type="button" class="text-button" data-analytics-go-section="recommendations">View action plan →</button>')}${priorities(result.recommendations.slice(0,4),true)}</section></div>
      ${sectionBlock('01', 'Equipment & Revenue Drivers', 'Equipment rankings, category mix, Pareto concentration, and cash flow')}
      <div class="ana-comparison-grid"><section class="panel ana-panel ana-equipment-panel">${head('Equipment performance',`Showing ${ranked.length} of ${rankedAll.length} equipment group${rankedAll.length===1?'':'s'}`,equipControls)}${ranked.length ? horizontalBarChart(ranked.map(row=>({label:row.name,value:row[rankMetric],previous:row.comparison[rankMetric].previous})),{escape:e,id:'equipment-comparison',title:'Equipment performance compared with the previous period',currency:ranking==='fees',compact:true})+visiblePanel('equipment-comparison-values','Exact values & changes','Current period, previous period and utilization',compareTable) : empty('No matching equipment','Choose another filter.')}<p class="ana-interpretation">${result.idleEquipment.length ? `${count(result.idleEquipment.length,'active equipment type')} had no rentals. Review availability and listing details.` : t.rentals ? 'Compare count, fees and utilization before expanding stock.' : 'Record confirmed handoffs to see equipment demand.'}</p></section>
      <section class="panel ana-panel ana-category-panel">${head('Category contribution',isFees?'Recorded rental fees by category':'Confirmed rentals by category')}${categoryDonut(categoryRows.map(row=>({label:row.name,value:row[metric]})),{escape:e,currency:isFees})}${visiblePanel('category','Category values & changes',`${count(categoryRows.length,'category')} in this view`,table(['CATEGORY','RENTALS','RECORDED FEES','CHANGE'],categoryRows.map(row=>`<tr><td>${e(row.name)}</td><td>${row.rentals}</td><td>${inlineDataBar(row.fees,maxCatFee,cash(row.fees),'blue')}</td><td>${delta(row.comparison[metric])}</td></tr>`).join('')))}<p class="ana-interpretation">${categoryRows.length && t.rentals ? `${e(categoryRows[0].name)} ${isFees ? 'contributes the most recorded fees' : 'has the most confirmed rentals'} in this period. Use equipment filters to inspect the detail.` : 'Category contributions appear after confirmed rental activity.'}</p></section></div>
      <div class="ana-module-grid"><section class="panel ana-panel" data-analytics-detail="pareto">${head('Equipment concentration (80–20 Pareto)','Focus attention on the vital equipment driving most activity',`<div class="ana-segment" role="group" aria-label="Pareto ranking metric">${[['fees','By fees'],['rentals','By rentals']].map(([id,label])=>`<button type="button" id="analytics-pareto-${id}" data-pareto-metric="${id}" aria-pressed="${paretoKey===id}">${label}</button>`).join('')}</div>`)}${paretoBody}</section>
      <section class="panel ana-panel" data-analytics-detail="waterfall">${head(wf.title || 'Recorded fees & cash flow',wf.source==='ledger'?'Collections minus refunds and expenses; this is not profit':'Recorded charges by booking channel; this is not collected cash')}${waterfallBody}</section></div>
      ${sectionBlock('02', 'Booking Behavior & Channel Mix', 'Channel/payment trends, duration & counter speed distributions, and category matrix')}
      <div class="ana-module-grid"><section class="panel ana-panel" data-analytics-detail="channel-mix">${head('Booking channel & payment mix','Stacked volume across the selected trend periods',`<div class="ana-segment" role="group" aria-label="Stacked breakdown dimension">${[['channel','Delivery vs. Counter'],['payment','Cash vs. QR']].map(([id,label])=>`<button type="button" id="analytics-stacked-${id}" data-stacked-mode="${id}" aria-pressed="${stackedMode===id}">${label}</button>`).join('')}</div>`)}${channelBody}</section>
      <section class="panel ana-panel" data-analytics-detail="distributions">${head('Rental & counter timing by range','Record counts by range, with mean, median and sample standard deviation',`<div class="ana-segment" role="group" aria-label="Distribution view">${[['duration','Rental duration'],['speed','Counter speed']].map(([id,label])=>`<button type="button" id="analytics-hist-${id}" data-histogram-kind="${id}" aria-pressed="${histKind===id}">${label}</button>`).join('')}</div>`)}${histBody}</section></div>
      <section class="panel ana-panel" data-analytics-detail="pivot">${head('Category × Channel breakdown (Matrix)','Switch metrics with quick slicers to compare counter vs. delivery',`<div class="ana-segment" role="group" aria-label="Matrix metric slicer">${[['fees','Fees'],['rentals','Rentals'],['avg','Avg fee'],['share','% share']].map(([id,label])=>`<button type="button" id="analytics-pivot-${id}" data-pivot-metric="${id}" aria-pressed="${pivotMetric===id}">${label}</button>`).join('')}</div>`)}${pivotBody}</section>
      <section class="panel ana-panel" data-analytics-detail="monthly-equipment">${head('Which equipment is busy each month?','Month × Equipment color-scale heatmap · selected dates and equipment filters')}${monthlyEquipmentHeatmap(result.monthlyEquipment)}</section>
      ${sectionBlock('03', 'Operating Hours & Equipment Health', 'Weekly rush patterns, time-band heatmap, capacity utilization, and maintenance issues')}
      <div class="ana-operations-grid"><section class="panel ana-panel ana-demand-panel">${head('Which days are busiest?','Confirmed handoffs by weekday · peak day highlighted')}${barChart(result.weekdays.map(row=>({label:row.label,value:row.rentals})),{escape:e,id:'performance-demand',title:'Confirmed rentals by weekday',highlightPeak:true})}<p class="ana-interpretation">${t.rentals ? 'Prepare inspected units and counter coverage for recurring busy periods. Compare the weekday totals with the time-band pattern beside this chart.' : 'No recorded handoffs in this period. Check filters and record coverage before drawing conclusions.'}</p><p class="ana-note">Philippine confirmation time. Totals are not daily averages or unmet demand; weekdays may occur different numbers of times in the selected dates.</p></section>
      <section class="panel ana-panel ana-demand-pattern">${head('What time should the team prepare?','Recorded handoffs by weekday and time band')}${demandHeatmap(result.weekdays.map(row=>row.label),result.hours.map(row=>row.label),result.demandMatrix,{escape:e})}</section></div>
      <div class="ana-module-grid"><section class="panel ana-panel ana-utilization-panel">${head('How much is equipment used?','Top 5 by calendar-hour utilization')}${horizontalBarChart([...result.groups].filter(row=>row.observedHours>0 && row.utilization!=null).sort((a,b)=>b.utilization-a.utilization || a.name.localeCompare(b.name)).slice(0,5).map(row=>({label:row.name,value:row.utilization*100})),{escape:e,id:'equipment-utilization',title:'Calendar-hour utilization by equipment type',percentage:true,color:'#0d9488',valueLabel:'Calendar-hour utilization',compact:true})}<p class="ana-interpretation">Rented unit-hours ÷ observed calendar unit-hours. Nights and maintenance hours are included; this is not business-hours occupancy. Compare rental count and service history before changing stock.</p></section>
      <section class="panel ana-panel" data-analytics-detail="maintenance-issues">${head('Common maintenance & inspection issues','Most frequent keywords in written service & inspection notes')}${maintenanceBody}</section></div>
      ${sectionBlock('04', 'Full Equipment Ledger', 'Sortable item-by-item trends, utilization bars, return reliability, and live availability')}
      <div class="ana-support-grid">
      ${visiblePanel('equipment','Equipment details & return performance','Exact values, mini trends and supporting operational measures',`<label class="ana-sort">Sort equipment<select id="analytics-sort" aria-label="Sort equipment performance">${choices([['rentals','Most rentals'],['least','Least rentals'],['fees','Highest fees'],['utilization','Highest utilization'],['name','Name A–Z']],sort)}</select></label><div class="ana-equipment-table">${table(['EQUIPMENT','TREND','RENTALS','FEES','UTILIZATION','SERVICE RECORDS'],equipmentPage.rows.map(row=>`<tr><td><strong ${rowAttrs(row)}>${e(row.name)}</strong></td><td>${sparklineSvg(row.sparkline,'#3b82f6') || '<span class="ana-note">—</span>'}</td><td>${row.rentals}</td><td>${cash(row.fees)}</td><td>${row.utilization == null ? '—' : inlineDataBar(row.utilization * 100, 100, percent(row.utilization), 'teal')}</td><td>${row.maintenanceCount}</td></tr>`).join(''))}</div>${equipmentPage.footer}<div class="ana-kpis is-compact">${kpi('Late-return rate',percent(t.overdueRate),`${t.overdueRentals} / ${count(t.dueRentals,'rental')} due in the period`,'',null,{icon:'overdue',tone:t.overdueRate>0.2?'warn':'good'})}${kpi('On-time returns',percent(t.onTimeRate),`${t.onTimeReturns} / ${count(t.onTimeSamples,'completed return')} with valid dates`,'',null,{icon:'rentals',tone:'good'})}${kpi('Average rental duration',hours(t.averageDurationHours),`${count(t.durationSamples,'completed return')}`,'',null,{icon:'utilization'})}${kpi('Available units now',number(result.equipmentStatus.Available||0),`${count(result.fleetUnits,'active unit')} in the catalog; live snapshot`,'',null,{icon:'equipment',tone:'good'})}</div>`)}
      </div>
      ${sectionBlock('05', 'Targets, Governance & Metric Reference', 'Owner goal thresholds, data completeness audit, and searchable metric definitions')}
      <div class="ana-governance-grid">${targetSettings}${coverage}</div>
      ${glossary}`;
  }

  function forecasting() {
    const unit = result.groupBy === 'daily' ? 'day' : result.groupBy === 'weekly' ? 'week' : 'month';
    const metric = view.forecastMetric === 'fees' ? 'fees' : 'rentals', isFees = metric === 'fees';
    const modelChoice = ['ma','ses','linear'].includes(view.forecastModel) ? view.forecastModel : 'all';
    const points = f.points, history = f.history.slice(-(result.groupBy === 'daily' ? 14 : result.groupBy === 'weekly' ? 8 : 6));
    const gap = result.groupBy === 'daily' && history.length && history.at(-1).to < result.range.to ? [date(result.range.to)] : [];
    const prefix = [...history,...gap].map(()=>null), labels = [...history.map(row=>row.label),...gap,...points.map(row=>row.label)];
    const fcComp = f.comparison || { ready: false, models: [], driftAlert: { detected: false } };
    const findModel = key => fcComp.models?.find(m => m.key === key);
    const maModel = findModel('ma'), sesModel = findModel('ses'), linModel = findModel('linear');

    const candidateModels = [
      maModel && { key: 'ma', name: 'Moving average', values: [...prefix, ...maModel[metric]], color: '#f97316', dashed: true },
      sesModel && { key: 'ses', name: 'Exponential smoothing', values: [...prefix, ...sesModel[metric]], color: '#0d9488', dashed: true },
      linModel && { key: 'linear', name: 'Linear trend', values: [...prefix, ...linModel[metric]], color: '#8b5cf6', dashed: true }
    ].filter(Boolean);
    if (!candidateModels.length && f.available) {
      candidateModels.push({ key: 'ma', name: 'Moving average', values: [...prefix, ...points.map(row => row[metric])], color: '#f97316', dashed: true });
    }
    const orderedModels = modelChoice === 'all'
      ? candidateModels
      : [...candidateModels.filter(m => m.key === modelChoice), ...candidateModels.filter(m => m.key !== modelChoice)];
    const modelSeries = f.available ? orderedModels.map(m => ({ ...m, focused: modelChoice !== 'all' && m.key === modelChoice, dimmed: modelChoice !== 'all' && m.key !== modelChoice })) : [];
    const series = [{ name: 'Recorded complete periods', values: [...history.map(row => row[metric]), ...gap.map(() => null), ...points.map(() => null)], color: '#3b82f6' }, ...modelSeries];

    const selectedModel = modelChoice === 'all' ? (findModel(isFees ? fcComp.lowestErrorFeeKey : fcComp.lowestErrorRentalKey) || maModel) : findModel(modelChoice);
    const projRentalsTotal = selectedModel ? selectedModel.totalRentals : sum(points, 'rentals');
    const projFeesTotal = selectedModel ? selectedModel.totalFees : sum(points, 'fees');
    const methodLabel = modelChoice === 'all' ? 'Compare 3 plain-language methods' : (selectedModel?.name || (result.groupBy === 'daily' ? 'Same-weekday moving average' : 'Moving average'));
    const status = f.available ? 'Planning estimate' : 'More history needed';
    const explanation = result.groupBy === 'daily'
      ? 'Moving average repeats matching past weekdays (last 4 weeks); Exponential smoothing gives recent days more weight (α = 0.35); Linear trend tracks your overall upward or downward pace.'
      : `Moving average averages recent complete ${unit}s; Exponential smoothing weighs the latest ${unit}s higher; Linear trend measures your steady direction across completed ${unit}s.`;

    const driftBanner = fcComp.driftAlert?.detected
      ? `<aside class="ana-demo-banner ana-drift-alert" role="note"><strong>Pattern change detected</strong><span>${e(fcComp.driftAlert.message)}</span></aside>`
      : '';
    const modelButtons = f.available
      ? `<div class="ana-segment" role="group" aria-label="Forecasting method">${[['all','Compare all'],['ma','Moving avg'],['ses','Exp. smoothing'],['linear','Linear trend']].map(([id,label])=>`<button type="button" id="analytics-forecast-model-${id}" data-forecast-model="${id}" aria-pressed="${modelChoice===id}">${label}</button>`).join('')}</div>`
      : '';

    const mix = forecastEquipmentMix(result.demandMix, points), mixPage = paged(mix,'analytics-forecast-mix');
    const positiveMix = mix.filter(r => r.expectedRentals > 0);
    const mixExpanded = Boolean(view.forecastMixExpanded);
    const shownMix = mixExpanded ? positiveMix : positiveMix.slice(0, 5);
    const mixVisualRows = shownMix.map(r => ({
      label: r.name,
      value: r.expectedRentals,
      color: '#0d9488',
      suffix: `(${percent(r.share)})`,
      detail: `${percent(r.share)} historical share`
    }));
    const mixToggle = positiveMix.length > 5
      ? `<button type="button" class="secondary is-compact" id="analytics-forecast-mix-toggle" data-forecast-mix-toggle aria-pressed="${mixExpanded}">${mixExpanded ? 'Show top 5' : `Show all ${positiveMix.length}`}</button>`
      : '';
    const equipmentDemandChart = mixVisualRows.length
      ? `<div class="ana-equipment-demand-visual">${horizontalBarChart(mixVisualRows, { escape: e, id: 'forecast-equipment-demand', title: 'Top projected equipment demand', color: '#0d9488', valueLabel: 'Est. rentals across horizon', compact: true })}</div>`
      : '';
    const mixSubtitle = positiveMix.length > 5
      ? `Showing ${shownMix.length} of ${positiveMix.length} active equipment groups in chart · full paginated mix below`
      : 'Estimated rental volume allocated using historical equipment shares';
    const equipment = `<section class="ana-forecast-mix">${head('Projected equipment mix', mixSubtitle, mixToggle)}${equipmentDemandChart}${table(['EQUIPMENT','PAST DEMAND SHARE','EST. RENTALS'],mixPage.rows.map(row=>`<tr><td><strong ${rowAttrs(row)}>${e(row.name)}</strong></td><td>${percent(row.share)}</td><td>${number(row.expectedRentals)}</td></tr>`).join(''))}${mixPage.footer}<p class="ana-note">Based on ${number(sum(points,'rentals'))} baseline moving-average rentals. Fractional values represent expected average demand, not split physical units or stockout timing.</p></section>`;
    const bt = f.backtest;
    const btSeries = [
      { name: 'Actual', values: bt.rows?.map(row => isFees ? row.actualFees : row.actualRentals) || [], color: '#3b82f6' },
      { name: 'Historical estimate', values: bt.rows?.map(row => isFees ? row.estimatedFees : row.estimatedRentals) || [], color: '#f97316', dashed: true }
    ];
    const btChart = bt.available
      ? (bt.rows.length <= 2
          ? pairedComparisonChart(bt.rows.map(row => row.label), btSeries, { escape: e, id: 'forecast-review', title: 'Historical estimates compared with actual results', currency: isFees, integerTicks: !isFees })
          : lineChart(bt.rows.map(row => row.label), btSeries, { escape: e, id: 'forecast-review', title: 'Historical estimates compared with actual results', currency: isFees, straight: true, integerTicks: !isFees }))
      : '';
    const review = visiblePanel('forecast-review','Forecast vs. actual review',bt.available ? `${bt.periods} completed ${unit}s checked · ${bt.rows.length <= 2 ? 'grouped side-by-side comparison (≤2 periods)' : 'one-period-ahead trend estimates'}` : 'More complete history is needed for a historical check',bt.available ? `<div class="ana-review-summary"><div><span>Average rental error</span><strong>${number(bt.rentalError)} rentals / ${unit}</strong></div><div><span>Average fee error</span><strong>${cash(bt.feeError)} / ${unit}</strong></div><div><span>Evaluated dates</span><strong>${date(bt.rows[0].from)} – ${date(bt.rows.at(-1).to)}</strong></div></div>${btChart}<p class="ana-note">Rolling historical check: each estimate uses only earlier complete periods.${bt.rows.length <= 2 ? ' Side-by-side bars are shown instead of a trend line because only 1–2 completed periods were evaluated.' : ''} This evaluates one ${unit} ahead, not the entire displayed forecast horizon, and does not prove future accuracy. Estimates are reconstructed, not saved forecasts issued at the time.</p>${table(['PERIOD','ACTUAL RENTALS','EST. RENTALS','ACTUAL FEES','EST. FEES'],bt.rows.map(row=>`<tr><td>${e(row.label)}</td><td>${number(row.actualRentals)}</td><td>${number(row.estimatedRentals)}</td><td>${cash(row.actualFees)}</td><td>${cash(row.estimatedFees)}</td></tr>`).join(''))}` : `<div class="ana-empty"><strong>Historical review unavailable</strong><p>${e(bt.reason || `Need ${bt.required} complete ${result.groupBy} periods; found ${bt.found}.`)} No error score is shown until there is enough earlier rental history.</p></div>`);

    const winnerKey = isFees ? fcComp.lowestErrorFeeKey : fcComp.lowestErrorRentalKey;
    const modelColorMap = { ma: '#f97316', ses: '#0d9488', linear: '#8b5cf6' };
    const modelCompRows = f.available && fcComp.models?.length
      ? fcComp.models.map(m => ({
          label: m.shortName || m.name,
          value: isFees ? m.totalFees : m.totalRentals,
          color: modelColorMap[m.key] || '#3b82f6',
          suffix: winnerKey === m.key ? '· Lowest recent error' : '',
          detail: m.maeRentals != null ? `MAE: ${count(m.maeRentals,'rental')} · ${cash(m.maeFees)}` : 'Need more history for MAE'
        }))
      : [];
    const modelComparisonChart = modelCompRows.length
      ? `<div class="ana-model-comparison-visual">${horizontalBarChart(modelCompRows, { escape: e, id: 'forecast-model-compare', title: isFees ? 'Projected rental fees by model' : 'Projected rentals by model', currency: isFees, color: '#3b82f6', valueLabel: `Next ${f.horizon} ${unit}s (${isFees ? 'PHP' : 'rentals'})`, compact: true })}</div>`
      : '';
    const modelTablePanel = f.available && fcComp.models?.length
      ? visiblePanel('model-comparison','Model comparison & recent error check',fcComp.evalSamples ? `Tested on your last ${fcComp.evalSamples} completed ${unit}s using Average Error (MAE)` : 'Comparing simple forecasting methods side-by-side',`${modelComparisonChart}<div class="ana-model-comparison-table">${table(['METHOD','HOW IT THINKS',`NEXT ${f.horizon} ${unit.toUpperCase()}S (RENTALS)`,`NEXT ${f.horizon} ${unit.toUpperCase()}S (FEES)`,'AVG ERROR (MAE)'],fcComp.models.map(m=>`<tr class="${modelChoice===m.key?'is-selected-model':''}"><td><strong>${e(m.name)}</strong>${winnerKey===m.key?`<div>${statusIconBadge('Lowest recent error','good')}</div>`:''}</td><td>${e(m.description)}${m.key==='linear'?`<small class="ana-note">Pace: ${m.slopeRentals >= 0 ? '+' : ''}${count(m.slopeRentals,'rental')} / ${unit}</small>`:''}</td><td>${number(m.totalRentals)}</td><td>${cash(m.totalFees)}</td><td>${m.maeRentals != null ? `${count(m.maeRentals,'rental')} · ${cash(m.maeFees)}` : 'Need more history'}</td></tr>`).join(''))}</div><p class="ana-note">${e(fcComp.driftAlert?.message || '')}</p>`)
      : '';

    const tree = result.lateRiskTree || { ready: false, rules: [], activeSummary: { activeCount: 0, elevatedCount: 0 } };
    const lateRiskPanel = visiblePanel('late-risk','Late-return risk watch (IF–THEN rules)',`Selected equipment/category history through ${date(result.range.to)}; operational features and prior booking counts`,tree.ready
      ? `<div class="ana-kpis is-compact">${kpi('Historical late rate',percent(tree.baseLateRate),`${tree.samples} due/returned bookings analyzed`,'',null,{icon:'overdue',tone:tree.baseLateRate>0.2?'warn':'good'})}${kpi('Active rentals in higher-risk groups',number(tree.activeSummary.elevatedCount),`Out of ${number(tree.activeSummary.activeCount)} active rentals at the reporting cutoff`,'',null,{icon:'alert',tone:tree.activeSummary.elevatedCount?'danger':'good'})}</div>${table(['IF CONDITION','SAMPLE','LATE RATE','SUGGESTED CHECK'],tree.rules.map(r=>`<tr><td><strong>${e(r.ruleText)}</strong></td><td>${count(r.samples,'booking')}</td><td>${inlineDataBar(r.lateRate*100,100,percent(r.lateRate),r.risk==='Higher risk'?'amber':'blue')}<div>${statusIconBadge(r.risk,r.risk==='Higher risk'?'high':r.risk==='Moderate risk'?'medium':'good')}</div></td><td>${e(r.advice)}</td></tr>`).join(''))}<p class="ana-note">Rules use operational timing, booking channel, package type and prior booking counts. Names and contact details are not displayed.${tree.validation ? ` Chronological validation of the same depth-2 learning method (earlier known outcomes only): ${number(tree.validation.accuracy * 100)}% accuracy on ${tree.validation.holdoutCount} held-out bookings; recall ${tree.validation.recall == null ? 'not estimable' : percent(tree.validation.recall)}, precision ${tree.validation.precision == null ? 'not estimable' : percent(tree.validation.precision)}. This limited check does not establish future accuracy.` : ''}</p>`
      : empty('Need more due & returned history',`At least ${tree.minRequired || 12} bookings with valid due times are needed to summarize IF–THEN late-return patterns (currently ${tree.samples || 0}).`));

    const seg = result.customerSegments || { available: false, segments: [] };
    const segmentPanel = visiblePanel('customer-segments','Customer groups & churn watch',`Selected equipment/category history through ${date(result.range.to)}; inactivity measured at that cutoff`,seg.available
      ? `<div class="ana-kpis is-compact">${kpi('Active & past customers grouped',number(seg.totalCustomers),'Aggregate groups; customer identities are not displayed','',null,{icon:'rentals'})}${kpi('Inactive customers (>21 days)',number(seg.churnWatchCount),'No booking for over 21 days at the cutoff; not a churn prediction','',null,{icon:'overdue',tone:seg.churnWatchCount?'warn':'good'})}</div>${table(['GROUP','CUSTOMERS','AVG RENTALS','AVG SPEND','REVENUE SHARE','SUGGESTED FOCUS'],seg.segments.map(s=>`<tr><td><strong>${e(s.label)}</strong></td><td>${number(s.customers)} (${percent(s.customerShare)})</td><td>${number(s.avgRentals)}</td><td>${cash(s.avgSpend)}</td><td>${inlineDataBar(s.revenueShare*100,100,percent(s.revenueShare),'teal')}</td><td>${e(s.note)}</td></tr>`).join(''))}<p class="ana-note">${seg.method === 'kmeans' ? `Exploratory k-means grouping of normalized booking count, recorded fees and days since last booking. ${seg.segments.length} nonempty groups; silhouette ${seg.silhouette == null ? 'not estimable' : number(seg.silhouette)} (−1 to 1; higher means better separation).${seg.silhouetteApproximate ? ` Deterministic sample of ${seg.silhouetteSamples} from ${seg.totalCustomers} customers.` : ''}` : 'Rule-based activity tiers are used for this small sample; clustering has not been fitted.'} Group separation does not measure churn prediction accuracy. The 21-day inactivity threshold is a review heuristic.</p>`
      : empty('Need a few more customers',seg.reason || 'Aggregate customer groups appear once at least 3 unique customers have confirmed rentals.'));

    const outliers = result.outlierAlerts || [];
    const outlierPanel = visiblePanel('outliers','Unusual records check (Outlier watch)','Selected-period returns, fees and counter events; overdue status at the reporting cutoff',outliers.length
      ? `<div class="ana-alert-list">${outliers.map(a=>`<article class="ana-outlier-item is-${e(a.severity)}"><div>${statusIconBadge(a.severity === 'high' ? 'Action needed' : a.severity === 'medium' ? 'Review' : 'Check', a.severity === 'high' ? 'high' : 'medium')}<strong>${e(a.title)}</strong></div><p>${e(a.detail)}</p></article>`).join('')}</div>`
      : '<div class="ana-empty"><strong>No review rules triggered</strong><p>No flags were found among eligible records. Missing samples and these simple rules cannot establish that every record is correct.</p></div>');

    const methodCollapse = `<div class="ana-collapse-card"><button type="button" class="ana-collapse-toggle" data-ana-collapse="forecast-method" aria-expanded="false" aria-controls="ana-forecast-method-body"><span>Method &amp; limitations guide</span><span class="ana-collapse-hint">Show notes</span></button><div id="ana-forecast-method-body" class="ana-collapse-body" data-ana-collapse-body hidden><p>${e(explanation)}</p><p>Weather, special events, price changes, and cancelled bookings are not included. Fractional forecasts represent expected averages, not split physical units.</p></div></div>`;
    const insightsSummaryBits = [
      tree.ready ? `Late rate ${percent(tree.baseLateRate)}` : 'Late rules learning',
      seg.available ? `${number(seg.totalCustomers)} customers grouped` : 'Segments learning',
      `${outliers.length} anomaly alert${outliers.length === 1 ? '' : 's'}`
    ].join(' · ');
    const insightsSection = `<section class="panel ana-insights-accordion" aria-label="Additional Operational Insights"><button type="button" class="ana-collapse-toggle is-section" data-ana-collapse="forecast-insights" aria-expanded="false" aria-controls="ana-forecast-insights-body"><span><strong>Additional Operational Insights</strong><small>${e(insightsSummaryBits)}</small></span><span class="ana-collapse-hint">Show insights</span></button><div id="ana-forecast-insights-body" class="ana-collapse-body ana-insights-body" data-ana-collapse-body hidden><div class="ana-module-grid">${lateRiskPanel}${segmentPanel}</div>${outlierPanel}</div></section>`;

    return `<section class="panel ana-summary"><div><span class="ana-eyebrow">Demand planning · predictive analytics</span><h2>${f.retrospective?'Projection from the selected cutoff':`Outlook for the next ${count(f.horizon,unit)}`}</h2><p>${f.available && points.length ? `${date(points[0].from)} – ${date(points.at(-1).to)} · ${methodLabel}` : e(f.reason)}</p></div><aside><span class="ana-status ${f.available?'is-ready':'is-learning'}">${status}</span></aside></section>
      ${driftBanner}
      <div class="ana-kpis ana-forecast-kpis">${kpi('Estimated rentals',f.available?number(projRentalsTotal):'—',`Across the next ${count(f.horizon,unit)}`,'',null,{icon:'forecast',tone:'good',raw:f.available?projRentalsTotal:null,fmt:'number',sparkline:history.map(r=>r.rentals),sparkColor:'#3b82f6'})}${kpi('Estimated rental fees',f.available?cash(projFeesTotal):'—','Estimated charges; not collected cash or profit','',null,{icon:'fees',raw:f.available?projFeesTotal:null,fmt:'currency',sparkline:history.map(r=>r.fees),sparkColor:'#0d9488'})}${kpi('Complete history used',number(f.trainingPeriods),`${unit}s · ${count(sum(f.history,'rentals'),'confirmed rental')}`,'',null,{icon:'rentals',raw:f.trainingPeriods,fmt:'number'})}</div>
      <div class="ana-forecast-grid"><section class="panel ana-panel ana-outlook-panel">${head(isFees?'Recorded fees & forecast':'Recorded rentals & demand forecast','Solid blue = recorded history · dashed lines = forecast models',`<div class="ana-control-stack">${metricButtons('forecast',metric)}${modelButtons}</div>`)}<p class="ana-model-behavior"><span>${e(methodLabel)}</span>${fcComp.lowestErrorFeeKey || fcComp.lowestErrorRentalKey ? `Lowest recent error: ${e(findModel(isFees ? fcComp.lowestErrorFeeKey : fcComp.lowestErrorRentalKey)?.shortName || 'Moving average')}.` : 'Based on complete rental history.'}</p>${lineChart(labels,series,{escape:e,id:'forecast-trend',straight:true,title:isFees?'Recorded and projected rental fees':'Recorded and projected rental demand',currency:isFees,integerTicks:!isFees,forecastStart:prefix.length,handoff:points.length&&history.length?{from:history.length-1,to:prefix.length,excludedIndex:gap.length?history.length:null,label:result.range.to===today?'Today incomplete':'Incomplete period'}:null})}<p class="ana-interpretation">${!f.available?e(f.reason):`Use these plain estimates to prepare equipment and staffing. Compare how Moving average, Exponential smoothing, and Linear trend respond to recent days. ${f.retrospective?'These are retrospective projection dates after the selected cutoff.':''}`}</p></section>
      <section class="panel ana-panel ana-forecast-evidence">${head('How this forecast works','Simple, transparent methods')}<dl class="ana-facts"><div><dt>Method</dt><dd>${e(methodLabel)}</dd></div><div><dt>History required</dt><dd>${f.requiredPeriods} complete ${unit}s and at least 4 rentals</dd></div><div><dt>Complete periods available</dt><dd>${f.completedPeriods}</dd></div><div><dt>Trend pace</dt><dd>${fcComp.ready ? `${fcComp.slope.rentals >= 0 ? '+' : ''}${count(fcComp.slope.rentals,'rental')} / ${unit}` : '—'}</dd></div><div><dt>Pattern stability</dt><dd>${!fcComp.ready ? 'Not evaluated' : fcComp.driftAlert?.detected ? 'Shift detected' : 'No shift rule triggered'}</dd></div></dl><div class="ana-method-block">${methodCollapse}</div><button type="button" class="secondary" data-analytics-history="daily">Use 90 days of daily history</button></section></div>
      ${sectionBlock('01', 'Model Comparison & Historical Validation', 'Compare 3 transparent models side-by-side and audit past one-period-ahead errors')}
      ${modelTablePanel}
      ${review}
      ${sectionBlock('02', 'Projected Equipment Demand & Period Breakdown', 'Forecast allocation across equipment types and exact values per future period')}
      ${f.available?visiblePanel('projection','Forecast values & equipment mix','Exact estimates by period; fractional estimates are expected averages',table(['PERIOD','MOVING AVG RENTALS','MOVING AVG FEES',...(sesModel&&linModel?['EXP. SMOOTHING','LINEAR TREND']:[])],points.map((row,idx)=>`<tr><td>${e(row.label)}<small>${row.from} – ${row.to}</small></td><td>${number(row.rentals)}</td><td>${cash(row.fees)}</td>${sesModel&&linModel?`<td>${isFees?cash(sesModel.fees[idx]):number(sesModel.rentals[idx])}</td><td>${isFees?cash(linModel.fees[idx]):number(linModel.rentals[idx])}</td>`:''}</tr>`).join(''))+equipment):''}
      ${sectionBlock('03', 'Additional Operational Insights & Data Audit', 'Expandable supporting risk rules, customer groups, anomaly alerts, and source coverage')}
      ${insightsSection}
      ${coverage}`;
  }
  function recommendations() {
    const actions=result.recommendations, types=[...new Set(actions.map(row=>row.type))], filter=types.includes(view.recommendationType)?view.recommendationType:'all';
    const prioFilter=['high','medium','low'].includes(view.recommendationPriority)?view.recommendationPriority:'all';
    const highCount = actions.filter(row=>row.priority==='high').length;
    const medCount = actions.filter(row=>row.priority==='medium').length;
    const lowCount = actions.filter(row=>row.priority!=='high'&&row.priority!=='medium').length;
    const opsCount = actions.filter(row=>row.type==='Operations').length;
    const equipRelCount = actions.filter(row=>row.type==='Equipment'||row.type==='Reliability').length;
    const shown=actions.filter(row=>(filter==='all'||row.type===filter)&&(prioFilter==='all'||(prioFilter==='low'?row.priority!=='high'&&row.priority!=='medium':row.priority===prioFilter)));

    const totalActions = Math.max(1, actions.length);
    const priorityVisual = actions.length ? `<section class="panel ana-priority-visual" aria-label="Recommendation priority breakdown"><div class="ana-priority-visual-head"><div><h3>Priority breakdown</h3><p>Click a priority level to filter the action queue below</p></div><div class="ana-action-filters" role="group" aria-label="Recommendation priority filter">${[['all',`All priorities (${actions.length})`],['high',`High (${highCount})`],['medium',`Review next (${medCount})`],...(lowCount?[['low',`Monitor (${lowCount})`]]:[])].map(([id,label])=>`<button type="button" id="analytics-prio-${id}" data-recommendation-priority="${id}" aria-pressed="${prioFilter===id}">${e(label)}</button>`).join('')}</div></div><div class="ana-priority-seg-bar" role="presentation">${highCount?`<button type="button" class="ana-prio-seg is-high${prioFilter==='high'?' is-active':''}" style="width:${(highCount/totalActions*100).toFixed(1)}%" data-recommendation-priority="${prioFilter==='high'?'all':'high'}" title="High priority: ${highCount}"><span>${highCount} High</span></button>`:''}${medCount?`<button type="button" class="ana-prio-seg is-medium${prioFilter==='medium'?' is-active':''}" style="width:${(medCount/totalActions*100).toFixed(1)}%" data-recommendation-priority="${prioFilter==='medium'?'all':'medium'}" title="Review next: ${medCount}"><span>${medCount} Review next</span></button>`:''}${lowCount?`<button type="button" class="ana-prio-seg is-low${prioFilter==='low'?' is-active':''}" style="width:${(lowCount/totalActions*100).toFixed(1)}%" data-recommendation-priority="${prioFilter==='low'?'all':'low'}" title="Monitor: ${lowCount}"><span>${lowCount} Monitor</span></button>`:''}</div></section>` : '';

    const basket = result.marketBasket || { available: false, bundles: [] };
    const bundlesPanel = visiblePanel('bundles','Suggested equipment bundles (Market basket)','Same-customer, same-day pairs; these may span separate bookings',basket.available
      ? `<div class="ana-bundle-list">${basket.bundles.map(b=>`<article class="ana-bundle-card"><div class="ana-bundle-head"><strong>${e(b.itemA)} + ${e(b.itemB)}</strong><span class="ana-pill">Rented together ${b.coRentals} times</span></div>${inlineDataBar(b.confidence*100,100,`${percent(b.confidence)} larger directional pairing share`,'teal')}<p>${e(b.suggestion)}</p></article>`).join('')}</div>`
      : empty('Need more multi-item bookings',basket.reason || 'Equipment bundle ideas appear once customers rent pairs of equipment together repeatedly.'));

    const whatIfInput = view.whatIf || { targetGroupId: 'ALL', extraUnits: 0, rateChangePct: 0, demandShiftPct: 0 };
    const sim = simulateWhatIfScenario(result, whatIfInput);
    const { outputHtml: whatIfOutHtml, visualHtml: whatIfVisHtml } = renderWhatIfContent(sim, e);
    const whatIfVisual = `<div class="ana-whatif-visual" aria-label="Baseline versus simulated comparison">${whatIfVisHtml}</div>`;
    const whatIfHtml = `<aside class="ana-sim-banner" role="note"><strong>What-if estimate only</strong><span>Testing scenarios here never alters your live inventory or pricing rates.</span></aside>
      <form id="analytics-whatif-form" class="ana-whatif-form" onsubmit="return false">
        <div class="ana-whatif-grid">
          <div class="ana-whatif-controls">
            <label>Equipment scope<select id="analytics-whatif-item" name="targetGroupId"><option value="ALL">Whole fleet</option>${result.groups.map(g=>`<option value="${e(g.id)}" ${sim.targetId===g.id?'selected':''}>${e(g.name)}</option>`).join('')}</select></label>
            <label>Add extra units (0–5)<input id="analytics-whatif-units" name="extraUnits" type="number" min="0" max="5" step="1" value="${sim.extraUnits}"/></label>
            <label>Price / rate shift (%)<input id="analytics-whatif-rate" name="rateChangePct" type="number" min="-30" max="30" step="5" value="${sim.rateChangePct}"/></label>
            <label>Expected demand shift (%)<input id="analytics-whatif-demand" name="demandShiftPct" type="number" min="-25" max="50" step="5" value="${sim.demandShiftPct}"/></label>
            <div class="ana-whatif-actions">
              <div class="ana-whatif-presets" role="group" aria-label="Quick scenario presets">
                <span>Quick test:</span>
                <button type="button" class="ana-preset-chip" data-whatif-preset="units">+1 unit</button>
                <button type="button" class="ana-preset-chip" data-whatif-preset="promo">Promo −10%</button>
                <button type="button" class="ana-preset-chip" data-whatif-preset="peak">Peak +20%</button>
              </div>
              <button type="button" class="secondary is-compact" id="analytics-whatif-reset" data-whatif-reset>Reset scenario</button>
            </div>
          </div>
          <div class="ana-whatif-results">
            <div id="analytics-whatif-output" class="ana-whatif-output" aria-live="polite">${whatIfOutHtml}</div>
            ${whatIfVisual}
          </div>
        </div>
        <p class="ana-note">${e(sim.formulaNote)}</p>
      </form>`;
    const whatIfPanel = visiblePanel('what-if','Owner What-If simulator','Test adding units or adjusting rental rates before making changes',whatIfHtml);

    const ba = result.beforeAfter || [];
    const formatBa = (val, fmt) => val == null ? '—' : fmt === 'currency' ? cash(val) : fmt === 'percent' ? percent(val) : fmt === 'seconds' ? `${number(val)} s` : number(val);
    const formatBaDiff = r => {
      if (r.previous == null || r.current == null) return 'Insufficient baseline';
      const diff = r.current - r.previous;
      if (Math.abs(diff) < 1e-6) return 'No change';
      const sign = diff > 0 ? '+' : '−';
      const absDiff = r.format === 'currency' ? cash(Math.abs(diff)) : r.format === 'percent' ? `${number(Math.abs(diff) * 100)} pts` : r.format === 'seconds' ? `${number(Math.abs(diff))} s` : number(Math.abs(diff));
      const pct = r.previous > 0 ? ` (${diff > 0 ? '+' : '−'}${number(Math.abs(diff / r.previous) * 100)}%)` : '';
      return `${sign}${absDiff}${pct}`;
    };
    const baVisual = ba.length ? `<div class="ana-ba-visual" aria-label="Before and after visual comparison">${ba.map(r => {
      const prev = typeof r.previous === 'number' && Number.isFinite(r.previous) ? Math.max(0, r.previous) : 0;
      const curr = typeof r.current === 'number' && Number.isFinite(r.current) ? Math.max(0, r.current) : 0;
      const maxVal = Math.max(1, prev, curr);
      const toneClass = r.tone === 'good' || r.tone === 'up' ? 'is-green' : r.tone === 'down' || r.tone === 'high' ? 'is-red' : 'is-blue';
      return `<div class="ana-ba-row"><div class="ana-ba-top"><span>${e(r.label)}${r.key==='speed'?' <em class="ana-lower-hint">(lower is better)</em>':''}</span>${statusIconBadge(r.status,r.tone)}</div><div class="ana-ba-diff">${e(formatBaDiff(r))}</div><div class="ana-ba-bars"><div><small>Prev: ${formatBa(r.previous,r.format)}</small><div class="ana-pair-track"><span class="ana-bar-base" style="width:${(prev/maxVal*100).toFixed(1)}%"></span></div></div><div><small>Curr: ${formatBa(r.current,r.format)}</small><div class="ana-pair-track"><span class="ana-bar-sim ${toneClass}" style="width:${(curr/maxVal*100).toFixed(1)}%"></span></div></div></div></div>`;
    }).join('')}</div><p class="ana-note">Observed period-to-period comparison only; each card uses its own unit scale and does not establish causation.</p>` : '';
    const beforeAfterPanel = visiblePanel('before-after','Action outcome check (Before vs. After)','Compare the current window with the preceding equal-length period',`${baVisual}${table(['MEASURE','PREVIOUS PERIOD','CURRENT PERIOD','CHANGE','RESULT'],ba.map(r=>`<tr><td><strong>${e(r.label)}</strong></td><td>${formatBa(r.previous,r.format)}</td><td>${formatBa(r.current,r.format)}</td><td>${e(formatBaDiff(r))}</td><td>${statusIconBadge(r.status,r.tone)}</td></tr>`).join(''))}`);

    const recFiltered = filter !== 'all' || prioFilter !== 'all';
    const recSummaryText = recFiltered
      ? `Showing ${shown.length} of ${actions.length} recommendation${actions.length === 1 ? '' : 's'}`
      : `Showing all ${actions.length} of ${actions.length} recommendation${actions.length === 1 ? '' : 's'}`;
    const recClearButton = recFiltered ? `<button type="button" class="secondary is-compact" id="analytics-rec-clear" data-recommendation-clear>Clear filters</button>` : '';
    const recEmptyBlock = `<div class="ana-empty"><strong>No matching recommendations in this filter</strong><p>Your active focus (${e(filter)}) and priority (${e(prioFilter === 'all' ? 'All' : prioFilter)}) combination returned 0 items.</p><button type="button" class="secondary" data-recommendation-clear>Clear recommendation filters</button></div>`;

    return `<section class="panel ana-summary"><div><span class="ana-eyebrow">Management action plan · prescriptive analytics</span><h2>Turn the evidence into a next step</h2><p>Prioritized review suggestions, bundle ideas, and what-if tests. The owner decides what action to take and verifies outcomes next period.</p></div><aside><strong>${count(actions.length,'suggested action')}</strong><small>${highCount} high priority · ${medCount} review next</small></aside></section>
      <div class="ana-kpis">${kpi('Suggested actions',number(actions.length),'Active management action items','',null,{icon:'actions',raw:actions.length,fmt:'number'})}${kpi('High priority actions',number(highCount),'Immediate review recommended','',null,{icon:'alert',tone:highCount?'danger':'good',raw:highCount,fmt:'number'})}${kpi('Operations actions',number(opsCount),'Overdue follow-ups & service workflows','',null,{icon:'overdue',raw:opsCount,fmt:'number'})}${kpi('Equipment & reliability',number(equipRelCount),'Utilization, capacity & counter speed','',null,{icon:'equipment',tone:'good',raw:equipRelCount,fmt:'number'})}</div>
      <div class="ana-decision-flow" aria-label="Decision process">${[['Outcome','What result matters?'],['Measure','What do the records show?'],['Target','What does the owner expect?'],['Action','What can we do next?']].map(([label,note])=>`<div><strong>${label}</strong><span>${note}</span></div>`).join('')}</div>
      ${sectionBlock('01', 'Prioritized Action Queue', 'High-priority follow-ups and balanced operational recommendations triggered by your targets')}
      <div class="ana-queue-console">${priorityVisual}<div class="ana-actions-toolbar"><div class="ana-actions-heading"><h2>Review in priority order</h2><span class="ana-showing-count" data-recommendation-count>${e(recSummaryText)}</span>${recClearButton}</div><div class="ana-action-filters" role="group" aria-label="Recommendation focus area">${[['all',`All (${actions.length})`],...types.map(type=>[type,`${type} (${actions.filter(row=>row.type===type).length})`])].map(([id,label])=>`<button type="button" id="analytics-focus-${e(encodeURIComponent(id))}" data-recommendation-type="${e(id)}" aria-pressed="${filter===id}">${e(label)}</button>`).join('')}</div></div></div>
      ${shown.length ? priorities(shown) : recEmptyBlock}${sectionBlock('02', 'Growth Opportunities & Outcome Verification', 'Market basket pairings, owner scenario testing, and period-over-period audit')}<div class="ana-module-grid is-growth">${bundlesPanel}${whatIfPanel}</div>${beforeAfterPanel}${sectionBlock('03', 'Business Targets & Governance', 'Owner-defined alert limits and record completeness check')}<div class="ana-governance-grid">${targetSettings}${coverage}</div>`;
  }
  const content=section==='performance'?performance():section==='forecast'?forecasting():recommendations();
  return `<div class="analytics-workspace ana-business">${tabs}${filters}${demo}<div class="ana-scope"><span>${date(result.range.from)} – ${date(result.range.to)} · Philippine time</span><span>Philippine calendar dates · hover or tap charts for exact values</span></div>${['performance','forecast','recommendations'].map(id=>`<section id="analytics-panel-${id}" role="tabpanel" aria-labelledby="analytics-tab-${id}" tabindex="0" data-analytics-panel="${id}" ${section!==id?'hidden':''}>${section===id?content:''}</section>`).join('')}</div>`;
}
