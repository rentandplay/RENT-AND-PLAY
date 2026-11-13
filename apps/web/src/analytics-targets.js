// Optional owner-defined business goals. Null means unset, never an implied zero goal.
export function normalizeAnalyticsTargets(raw = {}) {
  const numeric = value => !['number', 'string'].includes(typeof value) || typeof value === 'string' && !value.trim() ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const positive = value => { const n = numeric(value); return n !== null && n > 0 ? n : null; };
  const ratio = value => { const n = positive(value); return n !== null && n <= 1 ? n : null; };
  const fee = positive(raw?.monthly_fee_goal), feeCents = fee === null ? null : Math.round(fee * 100);
  const overdue = numeric(raw?.overdue_rate_alert);
  return {
    monthly_fee_goal: fee !== null && Number.isSafeInteger(feeCents) && Math.abs(fee * 100 - feeCents) <= .000001 ? feeCents / 100 : null,
    monthly_rental_goal: Number.isSafeInteger(positive(raw?.monthly_rental_goal)) ? positive(raw?.monthly_rental_goal) : null,
    utilization_goal: ratio(raw?.utilization_goal),
    overdue_rate_alert: overdue !== null && overdue >= 0 && overdue <= 1 ? overdue : null
  };
}

const DAY = 86400000;
const validKey = key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(key + 'T00:00:00Z')) && new Date(key + 'T00:00:00Z').toISOString().slice(0, 10) === key;

// Allocate a recurring monthly goal over the actual number of days in each month.
// Current-day allocation is a full calendar day; it is never an hourly forecast.
export function monthlyGoalForRange(monthlyGoal, from, to) {
  if (!Number.isFinite(monthlyGoal) || monthlyGoal <= 0 || !validKey(from) || !validKey(to) || from > to) return null;
  let total = 0, cursor = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z');
  while (cursor <= end) {
    const date = new Date(cursor), next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    const through = Math.min(end + DAY, next);
    total += monthlyGoal * (through - cursor) / (next - monthStart);
    cursor = next;
  }
  return total;
}

export function calculateAnalyticsTargets(result, selection = {}, raw = {}) {
  const config = normalizeAnalyticsTargets(raw), scoped = Boolean(selection.categoryId || selection.itemId);
  const active = !scoped;
  const feesGoal = active ? monthlyGoalForRange(config.monthly_fee_goal, result.range.from, result.range.to) : null;
  const rentalGoal = active ? monthlyGoalForRange(config.monthly_rental_goal, result.range.from, result.range.to) : null;
  const metric = (goal, actual) => ({ goal, actual, attainment: goal !== null && actual !== null ? actual / goal : null });
  const limit = active ? config.overdue_rate_alert : null;
  return {
    config, scoped,
    scopeReason: scoped ? 'Store-wide targets do not apply to category or equipment filters.' : null,
    basis: 'Monthly goals are allocated evenly over calendar days in each month, including a full allocation for today. Current-day actuals are partial. These are owner-defined recurring goals, not historical target revisions.',
    fees: metric(feesGoal, result.totals.fees), rentals: metric(rentalGoal, result.totals.rentals),
    utilization: metric(active ? config.utilization_goal : null, result.totals.utilization),
    overdue: { limit, actual: result.totals.overdueRate, breached: limit !== null && result.totals.overdueRate !== null ? result.totals.overdueRate > 0 && result.totals.overdueRate >= limit : false },
    trend: result.trend.map(row => ({ from: row.from, to: row.to, label: row.label,
      fees: active ? monthlyGoalForRange(config.monthly_fee_goal, row.from, row.to) : null,
      rentals: active ? monthlyGoalForRange(config.monthly_rental_goal, row.from, row.to) : null }))
  };
}
