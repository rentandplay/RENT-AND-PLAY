import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDetailedAnalytics, analyticsEquipmentOptions, groupEquipmentPerformance, forecastScenario, forecastEquipmentMix } from '../src/analytics-insights.js';
import { analyticsCsv } from '../src/analytics.js';

const now = new Date('2026-10-13T03:00:00Z');
const stock = { items: [
  { id: 'bike', stock_group_id: 'bike', name: 'Bicycle', item_code: 'EQUIP-001', category_id: 'sports', is_active: true, status: 'AVAILABLE', created_at: '2026-07-01' },
  { id: 'bike-2', stock_group_id: 'bike', name: 'Bicycle', item_code: 'EQUIP-002', category_id: 'sports', is_active: true, status: 'AVAILABLE', created_at: '2026-07-01' },
  { id: 'bike-3', stock_group_id: 'bike', name: 'Old bicycle', item_code: 'EQUIP-003', category_id: 'old', is_active: false, status: 'INACTIVE', created_at: '2026-07-01' },
  { id: 'idle', name: 'Basketball', item_code: 'EQUIP-004', category_id: 'sports', is_active: true, status: 'AVAILABLE', created_at: '2026-07-01' }
], categories: [{ id: 'sports', name: 'Sports' }, { id: 'old', name: 'Old category' }] };
const rental = (id, itemId, when, fee = 100, extra = {}) => ({ id, item_id: itemId, customer_id: 'customer-' + id, status: 'COMPLETED', confirmed_rental_at: when, received_at: when, due_at: when, rental_fee: fee, ...extra });
function history(days = 90) {
  const transactions = [];
  for (let index = days; index >= 1; index--) {
    const date = new Date(Date.parse('2026-10-13T00:00:00Z') - index * 86400000), key = date.toISOString().slice(0, 10), day = date.getUTCDay();
    const amount = day === 6 || day === 0 ? 4 : 2;
    for (let count = 0; count < amount; count++) transactions.push(rental(`${index}-${count}`, count % 2 ? 'bike-2' : 'bike', `${key} ${String(8 + count * 2).padStart(2, '0')}:00:00`, 100 + count * 25, { received_at: `${key} ${String(9 + count * 2).padStart(2, '0')}:00:00`, due_at: `${key} ${String(9 + count * 2).padStart(2, '0')}:00:00` }));
  }
  return { ...structuredClone(stock), transactions };
}

test('equipment filters and rankings combine siblings and use the shared current category', () => {
  const data = { ...stock, transactions: [rental('one', 'bike', '2026-10-01 09:00:00', 100.25), rental('two', 'bike-2', '2026-10-02 09:00:00', 200.5), rental('three', 'bike-3', '2026-10-03 09:00:00', 50)] };
  const result = calculateDetailedAnalytics(data, { period: '30d', itemId: 'bike', categoryId: 'sports' }, now);
  assert.equal(result.totals.rentals, 3);
  assert.equal(result.totals.fees, 350.75);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].unitCount, 2);
  assert.equal(result.groups[0].totalUnits, 3);
  assert.equal(result.groups[0].rentals, 3);
  assert.deepEqual(result.categoryRevenue.map(row => [row.name, row.fees]), [['Sports', 350.75]]);
  assert.equal(analyticsEquipmentOptions(data.items).filter(row => row.name === 'Bicycle').length, 1);
});

test('group utilization weights measured hours and excludes unknown observation time', () => {
  const rows = [
    { id: 'bike', name: 'Bicycle', active: true, known: true, rentals: 1, fees: .1, rentedHours: 50, observedHours: 100 },
    { id: 'bike-2', name: 'Bicycle', active: true, known: true, rentals: 1, fees: .2, rentedHours: 10, observedHours: 50 },
    { id: 'bike-3', name: 'Old bicycle', active: false, known: true, rentals: 1, fees: 0, rentedHours: 20, observedHours: null }
  ];
  const [group] = groupEquipmentPerformance(rows, stock.items, stock.categories);
  assert.equal(group.fees, .3);
  assert.equal(group.utilization, 60 / 150);
  assert.equal(group.observedHours, 150);
  assert.equal(group.unknownObservationUnits, 1);
});

test('current stock counts include units added after a historical reporting cutoff', () => {
  const data = structuredClone(stock);
  data.items[1].created_at = '2026-10-12';
  const result = calculateDetailedAnalytics(data, { period: 'custom', from: '2026-10-01', to: '2026-10-05' }, now);
  assert.equal(result.groups.find(row => row.stockGroupId === 'bike').unitCount, 2);
  assert.equal(result.groups.find(row => row.stockGroupId === 'bike').unitRows.some(row => row.id === 'bike-2'), false);
});

test('partial-day comparisons use the same elapsed time in the previous period', () => {
  const data = { ...stock, transactions: [rental('current', 'bike', '2026-10-13 10:00:00', 100), rental('previous-am', 'bike', '2026-10-06 10:00:00', 50), rental('previous-pm', 'bike', '2026-10-06 15:00:00', 500)] };
  const result = calculateDetailedAnalytics(data, { period: '7d' }, now);
  assert.equal(result.comparison.from, '2026-09-30');
  assert.equal(result.comparison.to, '2026-10-06');
  assert.equal(result.comparison.previous.totals.fees, 50);
  assert.equal(result.comparison.fees.percent, 1);
  assert.equal(result.comparison.partial, true);
});

test('zero baselines never create infinite percent changes', () => {
  const result = calculateDetailedAnalytics({ ...stock, transactions: [rental('current', 'bike', '2026-10-10', 100)] }, { period: '7d' }, now);
  assert.equal(result.comparison.fees.newActivity, true);
  assert.equal(result.comparison.fees.percent, null);
  assert.equal(result.comparison.utilization.percent, null);
});

test('daily forecasts use complete covered history and expose finite sample variation', () => {
  const result = calculateDetailedAnalytics(history(), { period: '90d', groupBy: 'daily' }, now);
  assert.equal(result.forecast.available, true);
  assert.equal(result.forecast.trainingPeriods, 28);
  assert.equal(result.forecast.points.length, 7);
  assert.equal(result.forecast.points[0].from, '2026-10-14');
  assert.ok(result.forecast.points.every(row => row.samplePeriods === 4 && row.rentalSpread.low >= 0 && row.rentalSpread.high >= row.rentals));
  assert.equal(result.forecast.backtest.available, true);
  assert.equal(result.forecast.backtest.rentalError, 0);
  assert.equal(result.forecast.backtest.rentalErrorRate, 0);
});

test('recently added equipment cannot turn blank earlier dates into a long forecast history', () => {
  const data = history(4); data.items = data.items.map(item => ({ ...item, created_at: '2026-10-09' }));
  const result = calculateDetailedAnalytics(data, { period: '90d', groupBy: 'daily' }, now);
  assert.equal(result.forecast.available, false);
  assert.equal(result.forecast.completedPeriods, 4);
  assert.equal(result.forecast.coverageStart, '2026-10-09');
  assert.equal(result.forecast.backtest.available, false);
});

test('a long empty calendar cannot be reported as a successful historical forecast fit', () => {
  const data = history(90);
  data.transactions = [];
  const result = calculateDetailedAnalytics(data, { period: '90d', groupBy: 'daily' }, now);
  assert.equal(result.forecast.available, false);
  assert.equal(result.forecast.backtest.available, false);
  assert.match(result.forecast.backtest.reason, /confirmed rental activity/);
});

test('forecast scenarios scale estimates and spreads without changing the baseline', () => {
  const result = calculateDetailedAnalytics(history(), { period: '90d', groupBy: 'daily' }, now), first = result.forecast.points[0];
  const lower = forecastScenario(result.forecast, 'lower')[0], higher = forecastScenario(result.forecast, 'higher')[0];
  assert.equal(lower.rentals, first.rentals * .8);
  assert.equal(higher.fees, first.fees * 1.2);
  assert.equal(higher.rentalSpread.high, first.rentalSpread.high * 1.2);
  assert.notEqual(higher.rentalSpread, first.rentalSpread);
  assert.equal(result.forecast.points[0], first);
});

test('allocated equipment demand adds up to the baseline rental estimate', () => {
  const result = calculateDetailedAnalytics(history(), { period: '90d', groupBy: 'daily' }, now);
  assert.equal(result.demandMix.length, 1);
  assert.equal(result.demandMix[0].expectedRentals, result.forecast.points.reduce((sum, row) => sum + row.rentals, 0));
});

test('recommendations prioritize current overdue rentals and include evidence and explicit rules', () => {
  const data = history(); data.transactions.push(rental('overdue', 'bike', '2026-10-11 09:00:00', 200, { status: 'ACTIVE', received_at: null, due_at: '2026-10-12 09:00:00' }));
  const result = calculateDetailedAnalytics(data, { period: '30d' }, now);
  assert.equal(result.recommendations[0].id, 'overdue-now');
  assert.equal(result.recommendations[0].priority, 'high');
  assert.ok(result.recommendations.every(row => row.action && row.basis && row.threshold && row.review));
  assert.ok(result.recommendations.some(row => row.id === 'idle-idle'));
});

test('invalid recorded fees cannot create NaN in weekday charts', () => {
  const result = calculateDetailedAnalytics({ ...stock, transactions: [rental('bad', 'bike', '2026-10-12', 'invalid')] }, { period: '30d' }, now);
  assert.ok(result.weekdays.every(row => Number.isFinite(row.fees)));
  assert.equal(result.totals.fees, 0);
  assert.ok(result.quality.some(row => row.text.includes('no valid recorded fee')));
});

test('CSV includes matched comparisons, grouped unit codes, scenarios and recommendation rules', () => {
  const result = calculateDetailedAnalytics(history(), { period: '90d', groupBy: 'daily' }, now);
  result.forecast.points = forecastScenario(result.forecast, 'higher'); result.forecast.scenario = 'higher';
  const csv = analyticsCsv(result, stock, {});
  for (const value of ['PREVIOUS MATCHED PERIOD', 'Training periods used', 'higher', 'Rental spread low', 'Trigger rule', 'EQUIP-001 / EQUIP-002 / EQUIP-003']) assert.ok(csv.includes(value), value);
  assert.ok(!csv.includes('NaN'));
});

test('CSV identifies synthetic rentals in the selected report', () => {
  const data=history(40);data.transactions[0].is_demo=true;
  const result=calculateDetailedAnalytics(data,{period:'90d',groupBy:'daily'},now);
  const csv=analyticsCsv(result,data,{});
  assert.ok(csv.includes('PRESENTATION DEMO'));
  assert.ok(csv.includes('Synthetic rentals in this selection'));
});


test('multi-model forecast benchmarking ranks 4 time-series algorithms and supports model switching', () => {
  const result = calculateDetailedAnalytics(history(), { period: '90d', groupBy: 'daily' }, now);
  const bm = result.forecast.benchmark;
  assert.ok(bm.available);
  assert.equal(bm.models.length, 4);
  assert.deepEqual(bm.models.map(m => m.rank), [1, 2, 3, 4]);
  assert.equal(bm.models.filter(m => m.isBestFit).length, 1);
  assert.equal(bm.recommended.id, bm.models[0].id);
  for (const model of bm.models) {
    assert.ok(Number.isFinite(model.maeRentals));
    assert.ok(Number.isFinite(model.rmseRentals));
    assert.ok(Number.isFinite(model.smapeRentals));
    assert.ok(Number.isFinite(model.accuracyRentals));
    assert.equal(model.validationRentals.length, 7);
    const pts = forecastScenario(result.forecast, 'baseline', model.id);
    assert.equal(pts.length, result.forecast.horizon);
    assert.ok(pts.every(pt => Number.isFinite(pt.rentals) && Number.isFinite(pt.fees)));
  }
});

test('unvalidated models have no performance rank, winner or recommendation', () => {
  const result = calculateDetailedAnalytics(history(29), { period: '30d', groupBy: 'daily' }, now);
  assert.ok(result.forecast.available);
  const bm = result.forecast.benchmark;
  assert.equal(bm.available, false);
  assert.equal(bm.recommended, null);
  assert.ok(bm.models.every(m => m.rank === null && !m.isBestFit && m.maeRentals === null));
});

test('SES, WMA and OLS match their displayed formulas without hidden seasonal blending', () => {
  const transactions = Array.from({ length: 4 }, (_, i) => rental(`impulse-${i}`, 'bike', '2026-10-12 10:00:00', 100));
  const f = calculateDetailedAnalytics({ ...stock, transactions }, { period: '30d', groupBy: 'daily' }, now).forecast;
  assert.ok(f.available);
  const ses = forecastScenario(f, 'baseline', 'ses'), wma = forecastScenario(f, 'baseline', 'wma'), linear = forecastScenario(f, 'baseline', 'linear');
  assert.ok(ses.every(p => Math.abs(p.rentals - 1.4) < 1e-10));
  assert.ok(wma.every(p => Math.abs(p.rentals - 1) < 1e-10));
  // Oct 13 is partial/excluded; the first target Oct 14 is two steps after Oct 12.
  assert.equal(linear[0].from, '2026-10-14');
  assert.ok(Math.abs(linear[0].rentals - (4 / 7 + 54 / 1827)) < 1e-10);
  assert.ok(linear.at(-1).rentals > linear[0].rentals);
  assert.equal(ses[0].rentalSpread, null);
  assert.equal(wma[0].feeSpread, null);
  for (const model of ['seasonal', 'ses', 'wma', 'linear', 'auto']) {
    const points = forecastScenario(f, 'higher', model);
    const mix = forecastEquipmentMix([{ share: .2 }, { share: .8 }], points);
    assert.ok(Math.abs(mix.reduce((sum, row) => sum + row.expectedRentals, 0) - points.reduce((sum, row) => sum + row.rentals, 0)) < 1e-10);
  }
});

test('walk-forward predictions never learn from the held-out observation or later records', () => {
  const original = history(), altered = structuredClone(original);
  altered.transactions.push(...Array.from({ length: 20 }, (_, i) => rental(`last-${i}`, 'bike', '2026-10-12 12:00:00', 9999)));
  const before = calculateDetailedAnalytics(original, { period: '90d', groupBy: 'daily' }, now).forecast.benchmark;
  const after = calculateDetailedAnalytics(altered, { period: '90d', groupBy: 'daily' }, now).forecast.benchmark;
  for (const m of before.models) {
    const next = after.models.find(row => row.id === m.id);
    assert.deepEqual(next.validationRentals, m.validationRentals);
    assert.deepEqual(next.validationFees, m.validationFees);
  }
  const seasonal = before.models.find(m => m.id === 'seasonal');
  assert.equal(seasonal.maeRentals, 0);
  assert.equal(seasonal.rmseRentals, 0);
  assert.equal(seasonal.smapeRentals, 0);
  assert.equal(seasonal.accuracyRentals, 1);
});

test('zero held-out totals leave WAPE fit score undefined and nonzero errors remain measurable', () => {
  const transactions = Array.from({ length: 4 }, (_, i) => rental(`old-${i}`, 'bike', '2026-10-01 10:00:00', 100));
  const bm = calculateDetailedAnalytics({ ...stock, transactions }, { period:'90d', groupBy:'daily' }, now).forecast.benchmark;
  assert.ok(bm.available);
  const ses = bm.models.find(m => m.id === 'ses');
  assert.equal(ses.accuracyRentals, null);
  assert.equal(ses.errorRateRentals, null);
  assert.ok(ses.maeRentals > 0);
  const errors = ses.validationRentals;
  const mae = errors.reduce((a, b) => a + b, 0) / 7;
  const rmse = Math.sqrt(errors.reduce((a, b) => a + b * b, 0) / 7);
  assert.ok(Math.abs(ses.maeRentals - mae) < 1e-10);
  assert.ok(Math.abs(ses.rmseRentals - rmse) < 1e-10);
  assert.equal(ses.smapeRentals, 2);
});

test('seasonal forecasts reproduce an independent known weekday/weekend pattern',()=>{
  const f=calculateDetailedAnalytics(history(),{period:'90d',groupBy:'daily'},now).forecast;
  for(const point of f.points) {
    const weekend=[0,6].includes(new Date(point.from).getUTCDay());
    assert.equal(point.rentals,weekend?4:2);
    assert.equal(point.fees,weekend?550:225);
  }
});

test('OLS extrapolates known linear fees across the excluded current day and clamps negatives',()=>{
  const build=declining=>({...stock,transactions:Array.from({length:64},(_,i)=>{
    const day=new Date(Date.parse('2026-10-13T00:00:00Z')-(64-i)*86400000).toISOString().slice(0,10);
    return rental('trend-'+i,'bike',day+' 10:00:00',declining?135-2*i:7+2*i);
  })});
  const get=data=>calculateDetailedAnalytics(data,{period:'90d',groupBy:'daily'},now).forecast;
  const a=get(build(false)),linear=forecastScenario(a,'baseline','linear');
  assert.equal(linear[0].from,'2026-10-14');
  assert.ok(Math.abs(linear[0].fees-137)<1e-8);
  assert.ok(Math.abs(linear.at(-1).fees-149)<1e-8);
  const b=get(build(true)),negative=forecastScenario(b,'baseline','linear');
  assert.ok(Math.abs(negative[0].fees-5)<1e-8);
  assert.equal(negative.at(-1).fees,0);
  const changed=build(false);changed.transactions.push(rental('partial','bike','2026-10-13 09:00:00',99999));
  const partial=get(changed);
  for(const id of ['seasonal','ses','wma','linear'])assert.deepEqual(forecastScenario(partial,'baseline',id),forecastScenario(a,'baseline',id));
});
