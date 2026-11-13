import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnalyticsTargets, monthlyGoalForRange } from '../src/analytics-targets.js';
import { calculateDetailedAnalytics } from '../src/analytics-insights.js';
import { analyticsCsv } from '../src/analytics.js';

const now = new Date('2026-11-13T02:00:00Z');
const item = (id, category) => ({ id, name: id, category_id: category, is_active: true, status: 'AVAILABLE', created_at: '2026-01-01' });
const rental = (id, itemId, day, fee = 100) => ({ id, item_id: itemId, customer_id: id, status: 'COMPLETED', confirmed_rental_at: day + ' 09:00:00', received_at: day + ' 10:00:00', due_at: day + ' 10:00:00', rental_fee: fee });
const selection = { period: 'custom', from: '2026-10-01', to: '2026-10-31', groupBy: 'monthly' };
const data = () => ({ items: [item('bike', 'sports'), item('console', 'games')], categories: [{ id: 'sports', name: 'Sports' }, { id: 'games', name: 'Games' }],
  settings: { analytics_targets: { monthly_fee_goal: 3100, monthly_rental_goal: 31, utilization_goal: .3, overdue_rate_alert: .1 } },
  transactions: [rental('old', 'bike', '2026-09-10', 200), rental('old-games', 'console', '2026-09-10', 500), rental('new-one', 'bike', '2026-10-10', 100), rental('new-two', 'bike', '2026-10-20', 200)] });

test('missing or invalid management goals remain unset and zero late tolerance is valid', () => {
  assert.deepEqual(normalizeAnalyticsTargets(), { monthly_fee_goal: null, monthly_rental_goal: null, utilization_goal: null, overdue_rate_alert: null });
  assert.deepEqual(normalizeAnalyticsTargets({ monthly_fee_goal: true, monthly_rental_goal: 1.5, utilization_goal: 5, overdue_rate_alert: 0 }), { monthly_fee_goal: null, monthly_rental_goal: null, utilization_goal: null, overdue_rate_alert: 0 });
  assert.equal(normalizeAnalyticsTargets({ monthly_fee_goal: 12.345 }).monthly_fee_goal, null);
  assert.equal(normalizeAnalyticsTargets({ monthly_fee_goal: 12.34 }).monthly_fee_goal, 12.34);
  assert.equal(normalizeAnalyticsTargets({ monthly_fee_goal: [100] }).monthly_fee_goal, null);
  assert.equal(normalizeAnalyticsTargets({ monthly_rental_goal: Number.MAX_SAFE_INTEGER + 1 }).monthly_rental_goal, null);
  assert.equal(normalizeAnalyticsTargets({ overdue_rate_alert: ' 0 ' }).overdue_rate_alert, 0);
});

test('monthly allocation handles month lengths, leap days and date boundaries', () => {
  assert.equal(monthlyGoalForRange(3100, '2026-10-01', '2026-10-31'), 3100);
  assert.equal(monthlyGoalForRange(2900, '2024-02-01', '2024-02-29'), 2900);
  assert.equal(monthlyGoalForRange(2900, '2024-02-29', '2024-02-29'), 100);
  assert.equal(monthlyGoalForRange(3100, '2026-10-01', '2026-10-10'), 1000);
  assert.ok(Math.abs(monthlyGoalForRange(3100, '2026-10-31', '2026-11-01') - (100 + 3100 / 30)) < 1e-10);
  assert.equal(monthlyGoalForRange(0, '2026-10-01', '2026-10-31'), null);
  assert.equal(monthlyGoalForRange(1, '2026-02-30', '2026-03-01'), null);
});

test('targets align with trend buckets and use no fabricated percent when unset', () => {
  const result = calculateDetailedAnalytics(data(), selection, now);
  assert.equal(result.targets.fees.goal, 3100);
  assert.equal(result.targets.fees.actual, 300);
  assert.equal(result.targets.fees.attainment, 300 / 3100);
  assert.equal(result.targets.trend[0].fees, 3100);
  assert.equal(result.targets.trend[0].rentals, 31);
  const blank = data(); blank.settings = {};
  assert.equal(calculateDetailedAnalytics(blank, selection, now).targets.fees.attainment, null);
});

test('store-wide targets do not leak into category or equipment filtered reports', () => {
  for (const filter of [{ categoryId: 'sports' }, { itemId: 'bike' }]) {
    const result = calculateDetailedAnalytics(data(), { ...selection, ...filter }, now);
    assert.equal(result.targets.scoped, true);
    assert.equal(result.targets.fees.goal, null);
    assert.equal(result.targets.utilization.goal, null);
    assert.equal(result.targets.overdue.limit, null);
    assert.ok(result.targets.trend.every(row => row.fees === null && row.rentals === null));
    assert.ok(!result.recommendations.some(row => row.id.startsWith('below-target-')));
  }
});

test('equipment and category comparisons preserve prior-only groups and finite changes', () => {
  const result = calculateDetailedAnalytics(data(), selection, now);
  const bike = result.groups.find(row => row.id === 'bike');
  assert.deepEqual(bike.comparison.rentals, { current: 2, previous: 1, difference: 1, percent: 1, newActivity: false });
  const games = result.categoryComparison.find(row => row.id === 'games');
  assert.equal(games.fees, 0);
  assert.equal(games.comparison.fees.previous, 500);
  assert.equal(games.comparison.fees.percent, -1);
  const newData = data(); newData.transactions = [rental('new', 'bike', '2026-10-10')];
  const fresh = calculateDetailedAnalytics(newData, selection, now).groups.find(row => row.id === 'bike');
  assert.equal(fresh.comparison.fees.newActivity, true);
  assert.equal(fresh.comparison.fees.percent, null);
});

test('recommendations connect outcomes, measures, targets and review rules and respect incomplete periods', () => {
  const complete = calculateDetailedAnalytics(data(), selection, now);
  assert.ok(complete.recommendations.some(row => row.id === 'below-target-fees'));
  assert.ok(complete.recommendations.every(row => row.outcome && row.measure && row.target && row.ruleKind && row.action && row.basis));
  const ongoing = calculateDetailedAnalytics(data(), { period: '30d' }, now);
  assert.ok(!ongoing.recommendations.some(row => row.id.startsWith('below-target-')));
  const csv = analyticsCsv(complete, data(), selection);
  for (const text of ['OWNER DEFINED TARGETS', 'EQUIPMENT PERIOD COMPARISON', 'Outcome', 'Rule basis']) assert.ok(csv.includes(text));
  assert.ok(!csv.includes('NaN'));
});

test('aggregate analytics export omits customer contacts and identifiable rental records', () => {
  const source = data();
  source.customers = [{ id: 'PRIVATE-CUSTOMER-ID-77', full_name: 'Private Person Example', email: 'private-person@example.invalid', phone: '+639991234567', address: 'Private Address 77' }];
  source.transactions = [rental('PRIVATE-RENTAL-ID-88', 'bike', '2026-10-10', 250)];
  Object.assign(source.transactions[0], { customer_id: 'PRIVATE-CUSTOMER-ID-77', rental_code: 'PRIVATE-RENTAL-CODE-99', customer_name: 'Private Person Example', customer_email: 'private-person@example.invalid', customer_phone: '+639991234567' });
  const result = calculateDetailedAnalytics(source, selection, now), csv = analyticsCsv(result, source, selection);
  for (const privateValue of ['PRIVATE-CUSTOMER-ID-77', 'Private Person Example', 'private-person@example.invalid', '+639991234567', 'Private Address 77', 'PRIVATE-RENTAL-ID-88', 'PRIVATE-RENTAL-CODE-99']) assert.ok(!csv.includes(privateValue), privateValue);
  assert.ok(csv.includes('Aggregate analytics only'));
  assert.ok(csv.includes('bike'));
  assert.ok(csv.includes('250'));
  assert.ok(csv.includes('OWNER DEFINED TARGETS'));
  assert.ok(csv.includes('DATA COVERAGE AUDIT'));
});

test('on-time physical receipt is not overdue while inspection is still pending', () => {
  const source = data();
  source.transactions = [{ ...rental('pending-inspection', 'bike', '2026-10-10'), status: 'RETURN_PENDING_INSPECTION', received_at: '2026-10-10 09:59:00' }];
  const result = calculateDetailedAnalytics(source, selection, now);
  assert.equal(result.totals.dueRentals, 1);
  assert.equal(result.totals.overdueRentals, 0);
  assert.equal(result.totals.overdueRate, 0);
  assert.equal(result.totals.overdueNow, 0);
  source.transactions[0].received_at = '2026-10-10 10:01:00';
  assert.equal(calculateDetailedAnalytics(source, selection, now).totals.overdueRentals, 1);
});
