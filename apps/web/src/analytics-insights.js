import { calculateAnalytics, manilaDateKey, recordDate } from './analytics.js';
import { calculateAnalyticsTargets } from './analytics-targets.js';

const DAY = 86400000;
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const shift = (key, days) => new Date(Date.parse(key + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function compareAnalyticsMetric(current, previous) {
  return { current, previous, difference: current == null || previous == null ? null : current - previous,
    percent: previous > 0 && current != null ? (current - previous) / previous : null,
    newActivity: previous === 0 && current > 0 };
}

export function analyticsEquipmentOptions(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = String(item.stock_group_id || item.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups].map(([id, units]) => {
    const live = units.filter(item => item.is_active !== false);
    const item = live.find(item => String(item.id) === id) || live[0] || units.find(item => String(item.id) === id) || units[0];
    return { id, name: item.name || 'Unnamed equipment', categoryId: String(item.category_id), units: live.length, archived: !live.length };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function groupEquipmentPerformance(performance, items, categories = []) {
  const itemMap = new Map(items.map(item => [String(item.id), item])), groups = new Map();
  const categoryMap = new Map(categories.map(category => [String(category.id), category.name]));
  for (const row of performance) {
    const key = String(itemMap.get(row.id)?.stock_group_id || row.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([stockGroupId, rows]) => {
    const units = items.filter(item => String(item.stock_group_id || item.id) === stockGroupId), liveUnits = units.filter(item => item.is_active !== false);
    const live = rows.filter(row => row.active), measured = rows.filter(row => row.observedHours > 0);
    const canonical = liveUnits.find(item => String(item.id) === stockGroupId) || liveUnits[0] || units.find(item => String(item.id) === stockGroupId) || units[0];
    const representative = rows.find(row => row.id === String(canonical?.id)) || live.find(row => row.id === stockGroupId) || live[0] || rows[0];
    const observedHours = measured.length ? sum(measured, 'observedHours') : null;
    return { ...representative, id: String(canonical?.id || representative.id), name: canonical?.name || representative.name, code: canonical?.item_code || representative.code,
      category: categoryMap.get(String(canonical?.category_id)) || representative.category, stockGroupId, unitRows: rows, unitCount: liveUnits.length, totalUnits: units.length,
      unitCodes: units.map(unit => unit.item_code).filter(Boolean), active: liveUnits.length > 0, rentals: sum(rows, 'rentals'), fees: Math.round(sum(rows, 'fees') * 100) / 100,
      maintenanceCount: sum(rows, 'maintenanceCount'), rentedHours: sum(rows, 'rentedHours'), downtimeHours: sum(rows, 'downtimeHours'), observedHours,
      measuredRentedHours: sum(measured, 'rentedHours'),
      utilization: observedHours ? sum(measured, 'rentedHours') / observedHours : null,
      observationAssumed: rows.some(row => row.observationAssumed), unknownObservationUnits: rows.filter(row => row.observedHours === null).length,
      repeatServiceUnits: rows.filter(row => row.maintenanceCount >= 2).length };
  }).sort((a, b) => b.rentals - a.rentals || a.name.localeCompare(b.name) || a.stockGroupId.localeCompare(b.stockGroupId));
}

function comparisonFor(data, selection, current, now) {
  const from = shift(current.range.from, -current.range.days), to = shift(current.range.from, -1);
  const elapsed = recordDate(current.asOf).getTime() - recordDate(current.range.from).getTime();
  const cutoff = new Date(recordDate(from).getTime() + elapsed);
  const previous = calculateAnalytics(data, { ...selection, period: 'custom', from, to }, cutoff);
  const change = key => compareAnalyticsMetric(current.totals[key], previous.totals[key]);
  return { from, to, previous, partial: current.range.to === manilaDateKey(now), cutoff: cutoff.toISOString(),
    fees: change('fees'), rentals: change('rentals'), averageFee: change('averageFee'), utilization: change('utilization'), overdueRentals: change('overdueRentals'), overdueRate: change('overdueRate'), repeatCustomerRate: change('repeatCustomerRate') };
}

function backtest(trend, groupBy, today, coverageStart) {
  const completed = trend.filter(row => (!coverageStart || row.from >= coverageStart) && row.to < today && (groupBy === 'daily' || groupBy === 'weekly' && new Date(row.from + 'T00:00:00Z').getUTCDay() === 1 && (Date.parse(row.to) - Date.parse(row.from)) / DAY === 6 || groupBy === 'monthly' && row.from.endsWith('-01') && new Date(Date.parse(row.to) + DAY).getUTCDate() === 1));
  const training = groupBy === 'daily' ? 28 : 8, holdout = groupBy === 'daily' ? 7 : 2;
  if (completed.length < training + holdout) return { available: false, required: training + holdout, found: completed.length };
  const windows = completed.slice(-holdout).map((actual, index) => {
    const at = completed.length - holdout + index, window = completed.slice(Math.max(0, at - training), at);
    const samples = groupBy === 'daily' ? window.filter(row => new Date(row.from + 'T00:00:00Z').getUTCDay() === new Date(actual.from + 'T00:00:00Z').getUTCDay()) : groupBy === 'monthly' ? window.slice(-6) : window;
    return { actual, samples, window, trainingRentals: sum(groupBy === 'monthly' ? samples : window, 'rentals') };
  });
  if (windows.some(row => row.trainingRentals < 4)) return { available: false, required: training + holdout, found: completed.length, reason: 'There is not enough confirmed rental activity in the earlier training windows to evaluate the forecast. Each requires at least 4 confirmed rentals.' };
  const rows = windows.map(({ actual, samples, window }) => ({ label: actual.label, from: actual.from, to: actual.to, trainingFrom: window[0].from, trainingTo: window.at(-1).to, actualRentals: actual.rentals, estimatedRentals: mean(samples.map(row => row.rentals)), actualFees: actual.fees, estimatedFees: mean(samples.map(row => row.fees)) }));
  const rentals = rows.map(row => Math.abs(row.actualRentals - row.estimatedRentals)), fees = rows.map(row => Math.abs(row.actualFees - row.estimatedFees));
  return { available: true, rows, windows, periods: holdout, rentalError: mean(rentals), feeError: mean(fees),
    rentalErrorRate: sum(rows, 'actualRentals') > 0 ? rentals.reduce((a, b) => a + b, 0) / sum(rows, 'actualRentals') : null };
}

function recommendationsFor(result, groups, comparison, targets) {
  const actions = [], t = result.totals;
  const contextFor = id => {
    if (id === 'overdue-now' || id === 'late-returns') return { outcome: 'Improve timely equipment returns', measure: 'Active overdue rentals and late return rate', target: targets.overdue.limit === null ? 'Management target not set; current overdue always needs review' : 'Late return alert at ' + Math.round(targets.overdue.limit * 100) + '%' };
    if (id.startsWith('capacity-')) return { outcome: 'Meet rental demand with suitable capacity', measure: 'Confirmed rentals and calendar-hour utilization' };
    if (id.startsWith('idle-')) return { outcome: 'Improve use of under-rented equipment', measure: 'Equipment rental count and observed hours' };
    if (id.startsWith('below-target-')) return { outcome: 'Work toward the owner-defined goal', measure: id.endsWith('fees') ? 'Recorded rental fees' : 'Confirmed rental count', target: 'Owner-defined, calendar-day allocated goal' };
    if (id === 'demand-decrease') return { outcome: 'Understand changes in rental demand', measure: 'Confirmed rentals versus the preceding matched period' };
    if (id === 'record-coverage') return { outcome: 'Improve the reliability of management decisions', measure: 'Missing-data and observation notes' };
    if (id === 'forecast-history') return { outcome: 'Build a usable demand outlook', measure: 'Complete recorded periods and confirmed rentals' };
    return { outcome: 'Maintain equipment and rental performance', measure: typeLabel(id) };
  };
  const typeLabel = id => id.startsWith('service-') ? 'Service records and equipment downtime' : id === 'handoff-delay' ? 'Request-to-confirmation timing' : id === 'repeat-customers' ? 'Repeat activity within the selected period' : 'Confirmed rental activity';
  const ruleKindFor = id => id === 'overdue-now' ? 'Recorded due-time condition' : id === 'forecast-history' ? 'Model readiness requirement' : id === 'record-coverage' ? 'Data quality condition' : id === 'record-activity' ? 'Data availability condition' : id === 'monitor' ? 'No matching review rule' : 'Review heuristic; confirm suitability with the owner';
  const add = (id, type, priority, title, action, basis, threshold, extra = {}) => actions.push({ target: 'Management target not set', ruleKind: ruleKindFor(id), ...contextFor(id), id, type, priority, title, action, basis, threshold,
    diagnostic: id === 'handoff-delay' || id === 'repeat-customers' || id.startsWith('service-'), ...extra });
  if (t.overdueNow > 0) add('overdue-now', 'Operations', 'high', 'Follow up on overdue equipment', 'Review overdue rentals, confirm their return arrangements, and keep their units unavailable until the return is recorded.', `${t.overdueNow} active rental${t.overdueNow === 1 ? '' : 's'} currently past the due time. This is current activity across all dates in your equipment filters.`, 'Appears when at least one active rental is overdue now.', { page: 'Rentals', review: 'Today' });
  else if (t.dueRentals >= 5 && t.overdueRentals > 0 && t.overdueRate >= (targets.overdue.limit ?? .2)) add('late-returns', 'Operations', 'medium', 'Improve return reminders', 'Review reminder timing and the return handoff process. Start with rentals that were returned late.', `${t.overdueRentals} of ${t.dueRentals} rentals due in this period were late (${Math.round(t.overdueRate * 100)}%).`, `At least 5 due rentals and a late rate of ${Math.round((targets.overdue.limit ?? .2) * 100)}% or higher, with at least one late rental. ${targets.overdue.limit === null ? 'The 20% default is a review heuristic, not an owner-approved target.' : 'Alert rate set by the owner.'}`, { page: 'Returns', review: 'This week', ruleKind: targets.overdue.limit === null ? 'Review heuristic; confirm suitability with the owner' : 'Owner-defined alert rate with a 5-rental minimum sample' });
  if (t.verificationCount >= 5 && t.verificationP95Seconds >= 60) add('handoff-delay', 'Operations', 'medium', 'Check slow counter confirmations', 'Compare the operator queue with terminal connectivity, then test a complete handoff. Timing includes operator and queue wait.', `${t.verificationCount} confirmations measured; the 95th percentile was ${Math.round(t.verificationP95Seconds)} seconds.`, 'At least 5 timed confirmations and a P95 of 60 seconds or more.', { page: 'ESP32 terminal', review: 'This week' });
  for (const row of groups.filter(row => row.known && row.repeatServiceUnits > 0).slice(0, 2)) add(`service-${row.stockGroupId}`, 'Reliability', 'medium', `Review service patterns for ${row.name}`, 'Read the unit maintenance notes to distinguish preventive inspections from recurring repairs. Prioritize units that repeatedly need service.', `${row.maintenanceCount} service records across ${row.totalUnits} unit${row.totalUnits === 1 ? '' : 's'}; ${row.downtimeHours.toFixed(1)} hours of downtime. Inspections are included.`, 'At least one physical unit had 2 or more service records in this period.', { itemId: row.id, itemName: row.name, review: 'This week' });
  for (const row of groups.filter(row => row.known && row.active && row.rentals >= 5 && row.utilization >= .5).slice(0, 2)) add(`capacity-${row.stockGroupId}`, 'Equipment', 'medium', `Review capacity for ${row.name}`, 'Check rental overlaps and the availability of each unit before considering more stock. Use the forecast to plan busy periods.', `${row.rentals} confirmed rentals; ${Math.round(row.utilization * 100)}% of observed calendar unit-hours rented across ${row.unitCount} active unit${row.unitCount === 1 ? '' : 's'}.`, 'At least 5 rentals and 50% calendar-hour utilization. This alone does not prove unmet demand.', { itemId: row.id, itemName: row.name, review: 'Before the next busy period' });
  if (result.range.days >= 30 && t.rentals >= 5) for (const row of groups.filter(row => row.known && row.active && row.rentals === 0 && row.observedHours > 0 && row.unitRows.some(unit => unit.active && unit.status !== 'UNDER_MAINTENANCE')).slice(0, 2)) add(`idle-${row.stockGroupId}`, 'Equipment', 'medium', `Review the listing for ${row.name}`, 'Check its photo, description, relevance, and rate options. Try a small listing improvement and compare rentals in the next equal period.', `No confirmed rentals in ${result.range.days} days, with ${Math.round(row.observedHours)} observed calendar unit-hours.`, 'At least a 30-day view and 5 fleet rentals, while this active equipment has zero rentals.', { itemId: row.id, itemName: row.name, review: 'This week' });
  if (t.uniqueCustomers >= 10 && t.repeatCustomerRate < .25) add('repeat-customers', 'Customers', 'medium', 'Make repeat rentals easier', 'Review the customer experience and how equipment options are presented. Compare repeat activity in another period before treating this as a retention issue.', `${t.repeatCustomers} of ${t.uniqueCustomers} customers rented twice or more in this selected period (${Math.round(t.repeatCustomerRate * 100)}%).`, 'At least 10 customers and repeat activity below 25% within the selected period; lifetime retention is not measured.', { page: 'Customers', review: 'Next reporting period' });
  if (comparison.previous.totals.rentals >= 10 && comparison.rentals.percent <= -.2) add('demand-decrease', 'Performance', 'medium', 'Investigate the drop in rental activity', 'Compare the weekday demand pattern and equipment rankings. Check seasonality and availability before changing prices.', `${t.rentals} rentals versus ${comparison.previous.totals.rentals} in the previous matched window (${Math.round(Math.abs(comparison.rentals.percent) * 100)}% lower).`, 'A previous sample of at least 10 rentals and a decline of 20% or more.', { section: 'performance', review: 'This week' });
  if (result.quality.length) add('record-coverage', 'Data quality', 'medium', 'Improve the records behind these metrics', 'Review the data coverage notes. Ensure future handoffs, returns, and repairs record their actual times; do not fill historical gaps with guesses.', `${result.quality.length} data coverage issue${result.quality.length === 1 ? ' affects' : 's affect'} the selected analytics. One record can appear in more than one coverage note.`, 'One or more missing-data or observation assumptions were detected.', { section: 'performance', coverage: true, review: 'This week' });
  if (!result.forecast.available) add('forecast-history', 'Planning', 'monitor', 'Build a usable forecast history', 'Choose a longer date range or a daily interval to check available history. Continue recording real rental confirmations so future estimates use actual activity.', result.forecast.reason, `${result.forecast.requiredPeriods} complete ${result.groupBy} periods and at least 4 confirmed rentals are required.`, { section: 'forecast', review: 'As more rentals are recorded' });
  if (t.rentals === 0) add('record-activity', 'Performance', 'monitor', 'Start with confirmed rental activity', 'Check the reporting filters, then record actual equipment handoffs through the rental workflow. Pending requests alone do not establish rental performance.', 'No confirmed rental activity was found in the selected dates and equipment filters.', 'Appears when the selected view contains zero confirmed rentals.', { page: 'Rentals', review: 'As rentals are confirmed' });
  if (!comparison.partial) for (const [metric, label] of [['fees', 'recorded rental fees'], ['rentals', 'confirmed rentals']]) {
    const goal = targets[metric];
    if (goal.goal !== null && goal.attainment < 1) add('below-target-' + metric, 'Performance', 'medium', 'Review the gap to the ' + label + ' goal', 'Compare equipment contribution, availability, and rental timing before adjusting rates or stock. Agree one change with the owner and review the next equal period.', `${goal.actual.toFixed(2)} actual versus ${goal.goal.toFixed(2)} allocated goal (${Math.round(goal.attainment * 100)}% attained).`, 'A completed selected period is below its owner-defined calendar-day allocated goal.', { section: 'performance', review: 'Next planning review', ruleKind: 'Owner-defined goal; completed periods only' });
  }
  if (!actions.some(row => !row.diagnostic)) add('monitor', 'Performance', 'monitor', 'Keep monitoring the current pattern', 'Review this dashboard after the next reporting period and watch for changes in rental demand, returns, and service load.', `${t.rentals} confirmed rentals reviewed. No supported action thresholds were triggered; this does not establish that every business issue is resolved.`, 'No other rule matched the selected records.', { section: 'performance', review: 'Next reporting period' });
  const order = { high: 0, medium: 1, monitor: 2 };
  return actions.sort((a, b) => order[a.priority] - order[b.priority]);
}

export function calculateDetailedAnalytics(data = {}, selection = {}, now = new Date()) {
  const result = calculateAnalytics(data, selection, now);
  if (result.error) return result;
  const comparison = comparisonFor(data, selection, result, now);
  const previousGroups = new Map(groupEquipmentPerformance(comparison.previous.performance, data.items || [], data.categories || []).map(row => [row.stockGroupId, row]));
  const groups = groupEquipmentPerformance(result.performance, data.items || [], data.categories || []).map(row => {
    const previous = previousGroups.get(row.stockGroupId);
    return { ...row, comparison: { rentals: compareAnalyticsMetric(row.rentals, previous?.rentals ?? 0), fees: compareAnalyticsMetric(row.fees, previous?.fees ?? 0) } };
  });
  const previousCategories = new Map(comparison.previous.categoryRevenue.map(row => [row.id, row]));
  const currentCategories = new Map(result.categoryRevenue.map(row => [row.id, row]));
  const categoryComparison = [...new Set([...currentCategories.keys(), ...previousCategories.keys()])].map(id => {
    const current = currentCategories.get(id), previous = previousCategories.get(id);
    const row = current || { ...previous, fees: 0, rentals: 0 };
    return { ...row, comparison: { fees: compareAnalyticsMetric(row.fees, previous?.fees ?? 0), rentals: compareAnalyticsMetric(row.rentals, previous?.rentals ?? 0) } };
  }).sort((a, b) => b.fees - a.fees || a.name.localeCompare(b.name));
  const targets = calculateAnalyticsTargets(result, selection, data.settings?.analytics_targets);
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => ({ label, rentals: 0, fees: 0 }));
  const hours = ['12–6 AM', '6–8 AM', '8–10 AM', '10 AM–12 PM', '12–2 PM', '2–4 PM', '4–6 PM', '6 PM–12 AM'].map(label => ({ label, rentals: 0, fees: 0 }));
  const demandMatrix = Array.from({length:7},()=>Array(8).fill(0));
  for (const rental of result.confirmed) {
    const day = new Date(manilaDateKey(rental.confirmed_rental_at) + 'T00:00:00Z').getUTCDay(), row = weekdays[(day + 6) % 7];
    const amount = Number(rental.rental_fee), validAmount = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
    row.rentals++; row.fees += validAmount;
    const parsed = recordDate(rental.confirmed_rental_at);
    if (parsed) {
      const manilaHour = new Date(parsed.getTime() + 8 * 3600000).getUTCHours();
      const hourIndex = manilaHour < 6 ? 0 : manilaHour < 8 ? 1 : manilaHour < 10 ? 2 : manilaHour < 12 ? 3 : manilaHour < 14 ? 4 : manilaHour < 16 ? 5 : manilaHour < 18 ? 6 : 7;
      demandMatrix[(day + 6) % 7][hourIndex]++;
      hours[hourIndex].rentals++; hours[hourIndex].fees += validAmount;
    }
  }
  const peakWeekday = [...weekdays].sort((a, b) => b.rentals - a.rentals)[0];
  const peakHour = [...hours].sort((a, b) => b.rentals - a.rentals)[0];
  const fleetUnits = Object.entries(result.equipmentStatus).filter(([status]) => status !== 'Archived').reduce((total, [, count]) => total + count, 0);
  const topEquipment = groups.filter(row => row.rentals > 0).slice(0, 5), idleEquipment = groups.filter(row=> row.known && row.active && row.rentals === 0);
  const history = result.forecast.history, first = history[0]?.from, last = history.at(-1)?.to, mix = new Map();
  const itemMap = new Map((data.items || []).map(item => [String(item.id), item]));
  for (const row of result.confirmed) {
    const date = manilaDateKey(row.confirmed_rental_at); if (!first || date < first || date > last) continue;
    const key = String(itemMap.get(String(row.item_id))?.stock_group_id || row.item_id); mix.set(key, (mix.get(key) || 0) + 1);
  }
  const mixTotal = [...mix.values()].reduce((a, b) => a + b, 0), expectedRentals = sum(result.forecast.points, 'rentals');
  const demandMix = groups.filter(row => mix.has(row.stockGroupId)).map(row => ({ ...row, historyRentals: mix.get(row.stockGroupId), share: mixTotal ? mix.get(row.stockGroupId) / mixTotal : 0, expectedRentals: mixTotal ? expectedRentals * mix.get(row.stockGroupId) / mixTotal : 0 })).sort((a, b) => b.expectedRentals - a.expectedRentals);
  const bt = backtest(result.trend, result.groupBy, manilaDateKey(now), result.forecast.coverageStart);
  const actions = recommendationsFor(result, groups, comparison, targets);
  return { ...result, comparison, groups, categoryComparison, targets, weekdays, peakWeekday, hours, peakHour, demandMatrix, fleetUnits, topEquipment, idleEquipment, demandMix,
    forecast: { ...result.forecast, backtest: bt, retrospective: result.range.to < manilaDateKey(now) },
    recommendations: actions.filter(row => !row.diagnostic), diagnosticRecommendations: actions.filter(row => row.diagnostic) };
}

export function forecastEquipmentMix(mix, points) {
  const total = sum(points, 'rentals');
  return mix.map(row => ({ ...row, expectedRentals: total * row.share }));
}
