import { renderAnalyticsWorkspace } from './analytics-workspace.js';

export const analyticsDefinitions=[
  ['Revenue trend','Sum of recorded rental fees for ACTIVE, RETURN_PENDING_INSPECTION, or COMPLETED rentals, grouped by rental confirmation date. Pending requests and cancelled rentals are excluded. This measures charges, not verified cash payments.'],
  ['Rentals trend','Number of confirmed rentals by day, calendar week (Monday–Sunday), or calendar month. The first and last buckets can be partial periods.'],
  ['Equipment utilization','Measured rented unit-hours ÷ observed calendar unit-hours × 100. Physical units are grouped by equipment type. Rental intervals are clipped to the period and overlaps are counted once per unit. Observation starts at the later of unit creation or period start; recorded archived intervals are removed. Nights and maintenance hours remain in the denominator. Missing creation dates use period start and are noted below; units without measurable collection history are excluded.'],
  ['Most rented equipment','Top five equipment types by confirmed rental count across their physical units in the period. Ties use rental fees, then equipment name.'],
  ['Least rented equipment','Lowest confirmed rental counts across the grouped equipment in this report. Active equipment with no rentals is also listed separately; that list excludes fully archived groups.'],
  ['Revenue per equipment','Recorded rental fees summed across each equipment type’s physical units. The highest-fee ranking sorts by fees; the equipment table includes every matching group, including historical archived equipment.'],
  ['Revenue per category','Recorded rental fees grouped by the equipment’s current category. Historical category changes are not reconstructed.'],
  ['Overdue rate','Late or still-overdue rentals ÷ valid rentals due in the selected period by its cutoff × 100. A late return is after its due time. Active rentals are late once due time passes. This uses recorded due dates without a grace allowance.'],
  ['On-time return rate','Returns at or before their due time ÷ completed returns with valid due dates × 100. Uses return dates in the period, so its sample differs from the overdue-rate sample.'],
  ['Average rental duration','Average of physical return receipt time minus rental confirmation time for completed returns in the period. Measures the full rental duration; active rentals and invalid dates are excluded.'],
  ['Repeat customer rate','Customers with at least two confirmed rentals ÷ customers with at least one confirmed rental in the period × 100. Measures repeat activity within the chosen period.'],
  ['Maintenance frequency','Number of maintenance records started per item in the period. Includes inspections and preventive care; it is not a count of equipment failures.'],
  ['Maintenance downtime','Hours under maintenance within the period, merged per item to avoid double counting. Ongoing work stops at the period cutoff or current time. Fleet downtime is item-hours: two items unavailable for one hour equal two item-hours.'],
  ['Terminal verification time','Average elapsed time from request to confirmation for CONFIRMED terminal requests completed in the period. Includes queue and operator wait time. If the request has no confirmation timestamp, a matching rental/return confirmation is used when available. Missing or inconsistent times are excluded. Median is the middle value; P95 is the interpolated 95th percentile.']
];

export function renderAnalyticsReport(model, selection, view, h) {
  return renderAnalyticsWorkspace(model, selection, view, { ...h, definitions: analyticsDefinitions });
}
