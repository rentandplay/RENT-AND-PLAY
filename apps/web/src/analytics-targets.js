import { manilaDateKey } from './analytics.js';
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
  const historical = suggestAnalyticsGoals(result);
  const system = buildSystemPlanningTarget(result, historical, scoped, metric);
  return {
    config, scoped,
    scopeReason: scoped ? 'Store-wide targets do not apply to category or equipment filters.' : null,
    basis: 'Monthly goals are allocated evenly over calendar days in each month, including a full allocation for today. Current-day actuals are partial. These are owner-defined recurring goals, not historical target revisions.',
    fees: metric(feesGoal, result.totals.fees), rentals: metric(rentalGoal, result.totals.rentals),
    utilization: metric(active ? config.utilization_goal : null, result.totals.utilization),
    overdue: { limit, actual: result.totals.overdueRate, breached: limit !== null && result.totals.overdueRate !== null ? result.totals.overdueRate > 0 && result.totals.overdueRate >= limit : false },
    system,
    trend: result.trend.map(row => ({ from: row.from, to: row.to, label: row.label,
      fees: active ? monthlyGoalForRange(config.monthly_fee_goal, row.from, row.to) : null,
      rentals: active ? monthlyGoalForRange(config.monthly_rental_goal, row.from, row.to) : null }))
  };
}

function buildSystemPlanningTarget(result, historical, scoped, metric) {
  if (historical?.available) historical = { ...historical, scoped };
  const unavailable = reason => ({ available:false, scoped, reason, historical, fees:metric(null,result.totals?.fees??null), rentals:metric(null,result.totals?.rentals??null), trend:[] });
  if (!historical.available) return unavailable(historical.reason || 'More complete rental history is needed to calculate a system target.');

  const equipmentStatus = result.equipmentStatus || {};
  const activeUnits = Object.entries(equipmentStatus).filter(([status])=>status!=='Archived').reduce((total,[,value])=>total+(Number.isFinite(Number(value))?Number(value):0),0);
  const averageDurationHours = result.totals?.averageDurationHours;
  if (!(activeUnits > 0)) return unavailable('No active equipment is available in this selection for a capacity check.');
  if (!Number.isFinite(averageDurationHours) || averageDurationHours <= 0) return unavailable('Completed rentals with valid return times are needed to check monthly capacity.');

  // This is a theoretical ceiling: it assumes every active unit can be rented
  // continuously and does not subtract maintenance, turnaround, or idle time.
  const averageCalendarHoursPerMonth = 365.2425 / 12 * 24;
  const theoreticalMonthlyCapacity = averageCalendarHoursPerMonth * activeUnits / averageDurationHours;
  if (!Number.isFinite(theoreticalMonthlyCapacity) || theoreticalMonthlyCapacity <= 0) return unavailable('The selected fleet does not have a measurable monthly capacity.');

  const requestedRentals = historical.average_monthly_rentals;
  const capacityCapped = theoreticalMonthlyCapacity < requestedRentals;
  const monthlyRentals = capacityCapped ? Math.floor(theoreticalMonthlyCapacity * 100) / 100 : Math.round(requestedRentals * 100) / 100;
  if (!(monthlyRentals > 0)) return unavailable('Theoretical capacity is below 0.01 rentals per month, so a practical monthly target cannot be calculated.');
  const monthlyFees = historical.monthly_fee_goal == null ? null : capacityCapped && historical.average_monthly_rentals > 0
    ? Math.round(historical.monthly_fee_goal * monthlyRentals / historical.average_monthly_rentals * 100) / 100
    : historical.monthly_fee_goal;
  const system = {
    available:true, scoped, historical,
    monthly:{ fees:monthlyFees, rentals:monthlyRentals },
    capacity:{ activeUnits, averageDurationHours, theoreticalMonthlyRentals:theoreticalMonthlyCapacity, capacityCapped },
    basis:`Uses ${historical.months} complete months and ${historical.confirmedRentals} confirmed rentals (${historical.from} to ${historical.to}). Fees use the average recorded fees per month and are reduced in proportion to rentals if capacity caps the rental target. Capacity formula: ${averageCalendarHoursPerMonth.toFixed(1)} calendar hours/month × ${activeUnits} current non-archived units ÷ ${averageDurationHours.toFixed(1)} average completed-rental hours in the selected date range = ${theoreticalMonthlyCapacity.toFixed(2)} theoretical rentals/month. This ceiling excludes maintenance, turnaround, and idle time.`,
    fees:metric(monthlyFees == null ? null : monthlyGoalForRange(monthlyFees,result.range.from,result.range.to),result.totals?.fees??null),
    rentals:metric(monthlyGoalForRange(monthlyRentals,result.range.from,result.range.to),result.totals?.rentals??null),
    trend:result.trend.map(row=>({from:row.from,to:row.to,label:row.label,
      fees:monthlyFees==null?null:monthlyGoalForRange(monthlyFees,row.from,row.to),
      rentals:monthlyGoalForRange(monthlyRentals,row.from,row.to)}))
  };
  return system;
}

// Suggestions are historical baselines for owner review; they never save a target.
export function suggestAnalyticsGoals(result) {
  if (!result?.range || result.error) return {available:false,reason:'Choose a valid reporting period.'};
  const {from,to}=result.range, coverage=result.forecast?.coverageStart;
  const completeThrough=manilaDateKey(result.asOf) || to;
  const start=[from,coverage || from].sort().at(-1);
  const rows=result.confirmed || [], months=[];
  let cursor=new Date(start.slice(0,7)+'-01T00:00:00Z');
  while(cursor.toISOString().slice(0,10)<=to) {
    const monthFrom=cursor.toISOString().slice(0,10);
    cursor.setUTCMonth(cursor.getUTCMonth()+1);
    const monthTo=new Date(cursor.getTime()-DAY).toISOString().slice(0,10);
    if(monthFrom>=start && monthTo<=to && monthTo<completeThrough) months.push({from:monthFrom,to:monthTo});
  }
  const recent=months.slice(-6);
  if(recent.length<3) return {available:false,reason:'Select a range with at least 3 complete months to suggest monthly goals.'};
  // Match the report's Philippine calendar keys, including timestamps near midnight.
  const observed=rows.filter(row=>{const day=manilaDateKey(row.confirmed_rental_at);return day && day>=recent[0].from && day<=recent.at(-1).to;});
  if(observed.length<4) return {available:false,reason:'At least 4 confirmed rentals in the complete months are needed for a suggestion.'};
  const fees=observed.reduce((total,row)=>{const fee=Number(row.rental_fee);return total+(Number.isFinite(fee)&&fee>0?Math.round(fee*100):0);},0)/100;
  return {available:true,scoped:Boolean(result.targets?.scoped),months:recent.length,from:recent[0].from,to:recent.at(-1).to,
    monthly_fee_goal:fees>0?Math.round(fees/recent.length*100)/100:null,monthly_rental_goal:Math.max(1,Math.round(observed.length/recent.length)),
    confirmedRentals:observed.length,average_monthly_rentals:observed.length/recent.length,average_fee_per_rental:fees/observed.length};
}
