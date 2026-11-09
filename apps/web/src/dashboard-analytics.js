import { manilaDateKey } from './analytics.js';

const DAY = 86400000;
const shift = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const amount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

// Dashboard snapshots contain open rentals; historical activity comes from daily summaries.
export function calculateDashboardPulse(data, now = new Date()) {
  const today = manilaDateKey(now);
  const items = (data.items || []).filter(item => item.is_active !== false);
  const active = (data.rentals || []).filter(row => row.status === 'ACTIVE');
  const rented = amount(data.stats?.active ?? active.length);
  const totalUnits = items.length;
  const utilization = totalUnits ? Math.min(100, rented / totalUnits * 100) : 0;
  const resort = active.filter(row => row.fulfillment_mode === 'DELIVERY').length;
  const counter = active.filter(row => row.fulfillment_mode === 'SHOP_HANDOVER').length;
  const unknown = active.length - resort - counter;
  const source = new Map((data.analyticsHistory?.daily || []).map(row => [row.date, row]));
  const coverageStart = data.analyticsHistory?.coverageStart;
  const history = Array.from({ length: 14 }, (_, index) => shift(today, index - 14))
    .filter(date => coverageStart && date >= coverageStart)
    .map(date => ({ date, fees: amount(source.get(date)?.fees), rentals: amount(source.get(date)?.rentals) }));
  const rentalSamples = history.reduce((total, row) => total + row.rentals, 0);
  const available = history.length >= 7 && rentalSamples >= 4;
  let level = history[0]?.fees || 0;
  for (const row of history.slice(1)) level = .35 * row.fees + .65 * level;
  const recent = history.slice(-7);
  return {
    rented, totalUnits, utilization, resort, counter, unknown, channelTotal: active.length,
    recent, trainingDays: history.length, rentalSamples,
    recentFees: recent.reduce((total, row) => total + row.fees, 0),
    forecast: available ? level : null, forecastDate: shift(today, 1),
    reason: available ? 'Preliminary SES estimate · accuracy not yet validated'
      : 'Need 7 complete days and 4 confirmed rentals for a preliminary estimate.'
  };
}
