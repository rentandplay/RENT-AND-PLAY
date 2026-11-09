import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDashboardPulse } from '../src/dashboard-analytics.js';

const now = new Date('2026-11-09T04:00:00Z');
const daily = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 26 + i)).toISOString().slice(0, 10), fees: 100, rentals: 1 }));
const data = { items: [{ id: 'one', status: 'RENTED' }, { id: 'two', status: 'UNDER_MAINTENANCE' }, { id: 'three', status: 'RESERVED_PENDING' }, { id: 'archived', is_active: false }],
  stats: { active: 1, available: 0 }, rentals: [{ status: 'ACTIVE', fulfillment_mode: 'SHOP_HANDOVER' }, { status: 'APPROVED', fulfillment_mode: 'DELIVERY' }],
  analyticsHistory: { coverageStart: '2026-10-01', daily } };

test('pulse counts active channels and all active inventory without including pending delivery', () => {
  const p = calculateDashboardPulse(data, now);
  assert.equal(p.totalUnits, 3);
  assert.ok(Math.abs(p.utilization - 100 / 3) < 1e-10);
  assert.equal(p.resort, 0);
  assert.equal(p.counter, 1);
  assert.equal(p.channelTotal, 1);
  const empty = calculateDashboardPulse({}, now);
  assert.equal(empty.totalUnits, 0);
  assert.equal(empty.forecast, null);
  assert.equal(empty.channelTotal, 0);
});

test('pulse SES uses complete covered days, ignores partial today and reports a genuine zero forecast', () => {
  const p = calculateDashboardPulse({ ...data, analyticsHistory: { ...data.analyticsHistory, daily: [...daily, { date: '2026-11-09', fees: 9999999, rentals: 50 }] } }, now);
  assert.equal(p.forecast, 100);
  assert.equal(p.forecastDate, '2026-11-10');
  assert.equal(p.recentFees, 700);
  assert.equal(p.trainingDays, 14);
  assert.equal(p.rentalSamples, 14);
  assert.equal(p.recent.at(-1).date, '2026-11-08');
  assert.equal(calculateDashboardPulse({ ...data, analyticsHistory: { ...data.analyticsHistory, daily: daily.map(row => ({ ...row, fees: 0 })) } }, now).forecast, 0);
});

test('recently started or sparse pulse history does not manufacture a forecast', () => {
  const recent = calculateDashboardPulse({ ...data, analyticsHistory: { ...data.analyticsHistory, coverageStart: '2026-11-06' } }, now);
  assert.equal(recent.trainingDays, 3);
  assert.equal(recent.forecast, null);
  assert.equal(calculateDashboardPulse({ ...data, analyticsHistory: { coverageStart: '2026-10-01', daily: [] } }, now).forecast, null);
});
