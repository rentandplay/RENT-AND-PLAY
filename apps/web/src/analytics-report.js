import { renderAnalyticsWorkspace } from './analytics-workspace.js';

export const analyticsDefinitions=[
  ['Recorded rental fee trend','Sum of recorded rental fees for ACTIVE, RETURN_PENDING_INSPECTION, or COMPLETED rentals, grouped by rental confirmation date. Pending requests and cancelled rentals are excluded. This measures charges, not verified cash payments.'],
  ['Rentals trend','Number of confirmed rentals by day, calendar week (Monday–Sunday), or calendar month. The first and last buckets can be partial periods.'],
  ['Equipment utilization','Measured rented unit-hours ÷ observed calendar unit-hours × 100. Physical units are grouped by equipment type. Rental intervals are clipped to the period and overlaps are counted once per unit. Observation starts at the later of unit creation or period start; recorded archived intervals are removed. Nights and maintenance hours remain in the denominator. Missing creation dates use period start and are noted below; units without measurable collection history are excluded.'],
  ['Most rented equipment','Top five equipment types by confirmed rental count across all their physical units in the period. Pagination does not change the totals. Ties are sorted by equipment name.'],
  ['Least rented equipment','Lowest confirmed rental counts across the grouped equipment in this report. Active equipment with no rentals is also listed separately; that list excludes fully archived groups.'],
  ['Rental fees per equipment','Recorded rental fees summed across each equipment type’s physical units. The highest-fee ranking sorts by fees; the equipment table includes every matching group, including historical archived equipment.'],
  ['Rental fees per category','Recorded rental fees grouped by the equipment’s current category. Historical category changes are not reconstructed.'],
  ['Overdue rate','Late or still-overdue rentals ÷ valid rentals due in the selected period by its cutoff × 100. A late return is after its due time. Active rentals are late once due time passes. This uses recorded due dates without a grace allowance.'],
  ['On-time return rate','Returns at or before their due time ÷ completed returns with valid due dates × 100. Uses return dates in the period, so its sample differs from the overdue-rate sample.'],
  ['Average rental duration','Average of physical return receipt time minus rental confirmation time for completed returns in the period. Measures the full rental duration; active rentals and invalid dates are excluded.'],
  ['Repeat customer rate','Customers with at least two confirmed rentals ÷ customers with at least one confirmed rental in the period × 100. Measures repeat activity within the chosen period.'],
  ['Maintenance frequency','Number of maintenance records started per item in the period. Includes inspections and preventive care; it is not a count of equipment failures.'],
  ['Maintenance downtime','Hours under maintenance within the period, merged per item to avoid double counting. Ongoing work stops at the period cutoff or current time. Fleet downtime is item-hours: two items unavailable for one hour equal two item-hours.'],
  ['Terminal verification time','Average elapsed time from request to confirmation for CONFIRMED terminal requests completed in the period. Includes queue and operator wait time. If the request has no confirmation timestamp, a matching rental/return confirmation is used when available. Missing or inconsistent times are excluded. Median is the middle value; P95 is the interpolated 95th percentile.'],
  ['Pareto 80–20 equipment rule','Ranks equipment types from highest to lowest fees or rentals and plots the running cumulative percentage against the 80% line to spotlight vital revenue or demand drivers.'],
  ['Rental-fee and cash-flow waterfall','Without a ledger, shows recorded rental fees by channel. With a complete period ledger, shows collections minus refunds and expenses. Neither view establishes accounting profit; charges alone do not establish cash received.'],
  ['Timing ranges and spread stats','Frequency bars compare counts in labeled duration or counter-confirmation ranges. Ranges can have unequal or open-ended widths. Mean, median and sample standard deviation use individual observations; the most frequent range is not an exact numerical mode.'],
  ['Category × Channel matrix','Interactive cross-tab comparing Shop counter versus Resort delivery across equipment categories using switchable Fees, Rentals, Average Fee, and % Share metrics.'],
  ['Forecasting methods and MAE','Compares moving average, exponential smoothing (α = 0.35), and linear regression trend on complete periods using walk-forward mean absolute error (MAE).'],
  ['Model pattern drift check','Monitors whether recent completed periods shifted meaningfully compared with earlier history so forecasts can be reviewed promptly when demand changes.'],
  ['Late-return IF–THEN rules','Pruned depth-2 rules use channel, schedule, package type and prior booking counts. Validation retrains the same method on earlier known outcomes. All recorded history for the selected equipment/category through the reporting cutoff is used; identities are not displayed.'],
  ['Customer groups and churn watch','Aggregate groups use booking frequency, recorded fees and days since last rental across selected-equipment history through the reporting cutoff. More than 21 days inactive is a review heuristic, not a validated churn probability. Customer identities are not displayed.'],
  ['Market basket bundles and What-If simulator','Pairs use same-customer, same-day co-occurrence, which may span separate bookings. What-If uses an assumed price elasticity of -0.35 and entered demand change, not fitted causal effects. Added units change capacity without automatically increasing demand.']
];

export function renderAnalyticsReport(model, selection, view, h) {
  return renderAnalyticsWorkspace(model, selection, view, { ...h, definitions: analyticsDefinitions });
}
