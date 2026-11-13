# Rent and Play analytics metric dictionary

This guide explains the source records, formulas, limits, and decisions supported by the analytics workspace. It is also a presentation reference: every chart should answer a business question, show its reporting scope, and support a specific management review.

## Reporting scope and source records

- Supabase PostgreSQL is the persistent database. The backend collection interface is a compatibility adapter; it is not Firebase Firestore storage.
- Confirmed rental activity includes `ACTIVE`, `RETURN_PENDING_INSPECTION`, and `COMPLETED` records. Pending requests, approvals without a confirmed handoff, and cancelled requests do not become confirmed rental volume or fees.
- Calendar dates use Asia/Manila. Weeks run Monday through Sunday; months follow calendar boundaries. The selected first and last buckets may be partial.
- Time-based calculations stop at the earlier of the selected period end and the current time. Today's activity is partial.
- Equipment filters combine physical units that share `stock_group_id`. A category uses the equipment group's current category; historical category changes are not reconstructed.
- Counts and sums may be zero. An unmeasurable rate or average is null and must display as unavailable, not as an invented zero.
- Report input must include the selected period, the full preceding comparison window, and rentals that overlap the period even if their handoffs were earlier. Current snapshots additionally need current open records. A paginated rental-table response is rejected as an analytics source.

## Primary descriptive measures

| Measure | Source and formula | Decision supported | Limits |
| --- | --- | --- | --- |
| Recorded rental fees | Sum valid nonnegative `rental_fee` values for confirmed rentals whose `confirmed_rental_at` falls in the period. Amounts are accumulated in cents. | Track rental charges and compare equipment contribution. | Charges are not cash collections, refundable deposits, reconciled payments, or profit. Invalid fees are excluded and counted in coverage notes. |
| Confirmed rentals | Count confirmed handoffs in the period. | Understand rental volume independently from changes in fees or rates. | A request or reservation is not a confirmed rental. |
| Average rental fee | Recorded rental fees divided by confirmed rentals. | Understand how equipment mix and fees affect average transaction value. | Not the average amount collected. With no confirmed rentals, the UI should explain the lack of activity rather than infer a customer spending trend. |
| Equipment utilization | Merged rented unit-hours divided by observed calendar unit-hours. Rental intervals are clipped to the period; overlapping intervals are counted once per physical unit. Physical-unit results are weighted by their observed hours when grouped. | Review which assets are frequently occupied and which require investigation. | Observation starts at unit creation or period start, whichever is later. Recorded archive intervals are removed. Nights and maintenance remain in the denominator. This is calendar-hour utilization, not opening-hours utilization or unmet demand. |
| Overdue rentals now | Count current `ACTIVE` rentals with valid due times earlier than now. | Prioritize customer follow-up and return arrangements. | Live snapshot across all dates within equipment/category filters; it is independent of the historical reporting range. It must not be compared as a historical count without historical snapshots. |
| Late rental rate in period | Rentals due in the period that were received late, or still unreceived after their due time at the cutoff, divided by valid rentals due in the period. | Review reminders and return procedures. | Uses due dates, not handoff or return dates. A valid physical receipt stops lateness even if inspection is pending. No grace allowance is applied. |

Physical receipt uses `received_at`, with `confirmed_return_at` as the legacy fallback. Return confirmation after inspection must not turn an on-time physical receipt into a late return.

## Comparisons and contributions

| Output | Formula or construction | Interpretation |
| --- | --- | --- |
| Previous matched period | Immediately preceding window with the same number of calendar days. If the selected window includes today, the earlier window uses a matching elapsed-time cutoff. | Compare like-length windows. The UI must show the actual dates rather than call every comparison "last month" or "last year." |
| Difference | Current minus previous. | Signed movement in the original unit. |
| Percentage change | `(current - previous) / previous`, only when the previous value is positive. | Previous zero and current positive is "new activity"; it is not an infinite or invented percentage increase. |
| Equipment comparison | Aggregate rental count and recorded fees over every physical unit in an equipment group, then compare the group to its earlier matched window. | Show most/least rented equipment and changes within the same selected filters. Active zero-rental equipment is meaningful, but new equipment has had less exposure. |
| Category comparison | Aggregate confirmed rentals and fees by current category. Include categories with activity only in the earlier window as zero current activity. | Identify which categories contributed to changes. A category change may move historical activity because category history is not reconstructed. |
| Fee contribution | Equipment/category fees divided by total selected fees. | Share of recorded charges; different from a growth percentage. No share is reported when the denominator is zero. |
| Weekday or hour demand | Count confirmations in each Manila weekday or time slot. | Review busy handoff periods for preparation and staffing. Counts show activity, not customer wait time or unsatisfied demand. |

The client should be able to switch between equipment/category comparisons or inspect an equipment trend without loading many unrelated charts at once.

## Optional owner-defined targets

Targets are saved in `settings.business.analytics_targets`. No target is inferred from the lecture's sales examples, generated demo data, or an arbitrary default quota.

| Field | Accepted value | Use |
| --- | --- | --- |
| `monthly_fee_goal` | Positive PHP amount, at most two decimal places, safely representable in cents | Recurring store-wide monthly recorded-fee goal. |
| `monthly_rental_goal` | Positive safe whole number | Recurring store-wide monthly confirmed-rental goal. |
| `utilization_goal` | Ratio greater than zero and at most one | Store-wide calendar-hour utilization goal. |
| `overdue_rate_alert` | Ratio from zero through one | Owner-selected late-rate review threshold. Zero means any positive late rate; it does not alert on a zero late rate. |

A blank value means unset. Store-wide targets are unavailable when a category or equipment filter is selected; they are never compared to a subset as though it represented the full store.

For a monthly goal `G`, each calendar day receives `G / days_in_that_month`. A selected period or trend bucket sums those daily allocations across its actual dates. This handles months of different lengths and leap years. A current day includes a full day's target allocation while its actual activity is still partial, which must be stated to the client.

Target attainment is `actual / allocated_goal`. It may exceed 100%. There is no attainment percentage when the goal is unset. Rental-goal allocation can be fractional even though the monthly goal is a whole count. Allocations retain precision internally so bucket sums agree with the full selected-period goal; round display amounts and percentages only at presentation/export boundaries.

The saved goal is a current recurring planning assumption. Applying it to an older report is not evidence of the goal that management approved at that historical time: target revision history is not reconstructed. Missed-goal recommendations are generated only for completed selected periods, preventing a partially completed current day from being treated as a failed goal.

## Fixed moving-average forecast

The application uses a single transparent averaging method, not model selection or benchmarking.

| View | Historical input | Forecast |
| --- | --- | --- |
| Daily | Last 28 complete recorded days; average the 4 matching weekdays for each future date | Next 7 days |
| Weekly | Last 8 complete weeks | Same recent-week mean for each of the next 4 complete weeks |
| Monthly | Last 6 complete months, after at least 8 complete months exist | Same recent-month mean for each of the next 3 complete months |

At least four confirmed rentals must exist in the training window. Incomplete days/weeks/months are excluded. Recorded zero-activity periods count as zero; unknown earlier collection history does not manufacture readiness. Monthly averages do not estimate annual seasonality. The selected historical cutoff can produce retrospective forecast dates; these are labeled.

Daily example: next Saturday's estimate is the total activity of the previous four complete Saturdays divided by four. Fees use the same averaging rule on recorded rental charges. Fractional rental estimates are expected averages, not partial physical rentals. Equipment mix allocates forecast volume in proportion to historical rental shares, not concurrent capacity.

Internal walk-forward checks train on earlier periods and measure average absolute error on later held-out periods. They do not select a method or establish guaranteed future accuracy. The client screen focuses on the forecast, dates and business explanation. Aggregate CSV retains method and readiness information; it has no ranked algorithms or scenario overrides. Historical sample variation, where exported, is not a calibrated confidence interval.

Weather, special events, rate changes, rejected requests and future reservations are not incorporated. Use forecasts to plan preparation and staffing; verify unit availability before promising equipment or buying stock.

## Prescriptive review rules

Every primary recommendation includes an outcome, measure, target status, evidence, next action, review timing, and disclosed trigger. Review triggers and management goals are different concepts.

| Review | Trigger | Appropriate response |
| --- | --- | --- |
| Current overdue follow-up | At least one active overdue rental now | Confirm customer return arrangements and availability. |
| Late-return process | At least five due rentals, at least one late rental, and late rate reaches the owner alert or the disclosed 20% fallback heuristic | Review reminders and handoff procedures. The fallback is not an empirically validated business standard. |
| Capacity review | Equipment has at least five rentals and at least 50% calendar-hour utilization | Check overlaps and availability before considering more stock; the heuristic does not establish unmet demand. |
| Idle equipment review | At least 30 reporting days and five selected-fleet rentals, while active, observed, non-maintenance equipment has zero rentals | Inspect listing quality, suitability, and rates; test a change and compare another equal period. |
| Demand decline | Previous matched window had at least ten rentals and current volume declined at least 20% | Investigate timing, equipment mix, seasonality, and availability before changing prices. |
| Below owner goal | Completed selected period below an applicable allocated fee or rental goal | Review the evidence and agree a measured change with the owner. |
| Record coverage | Missing-data or observation assumptions detected | Improve recording practices; do not fill unknown historical dates with guesses. |
| Forecast readiness | Forecast unavailable under the documented history requirements | Continue recording confirmed handoffs or choose a sufficient supported history window. |

Terminal handoff timing, repeat-customer activity, and service-pattern suggestions are retained as secondary diagnostics rather than competing with the main rental decision priorities. Service counts include preventive inspections, so they are not automatically failure counts.

## Secondary diagnostic formulas

| Measure | Calculation and limit |
| --- | --- |
| On-time return rate | Completed returns physically received on/before due time divided by completed returns in the period with valid dates. The sample differs from the late-rate due-date sample. |
| Average rental duration | Average physical receipt time minus confirmed handoff time for completed returns in the period. Uses full rental duration, not only hours intersecting the reporting range. |
| Repeat customer activity | Customers with at least two confirmed rentals divided by customers with any confirmed rental in the selected period. It is not lifetime retention. |
| Maintenance frequency | Service records started in the period per physical unit. Includes inspections and preventive care. |
| Maintenance downtime | Merged maintenance intervals per item intersecting the reporting period. Fleet total is item-hours. |
| Terminal confirmation timing | Confirmation time minus request time for valid confirmed requests. Uses an explicitly linked rental/return confirmation as fallback. Includes operator and queue wait; it is not pure ESP32 processing latency. Average, median, and P95 must show sample size. |

## Privacy and exports

The default analytics CSV is aggregate-only. It contains metric totals, equipment/category contributions, comparisons, goals, forecasts, action evidence, and coverage notes. It omits individual rental logs, rental identifiers, customer names, customer IDs, emails, phone numbers, and addresses. Authorized operational record views remain the place to inspect individual transactions.

CSV values are serialized with spreadsheet formula neutralization. Equipment labels, unit codes, and terminal labels may still be operationally identifying; share aggregate reports within the intended business audience. Demo records must retain a clear synthetic-data notice and cannot be presented as real enterprise performance.

## Verification references

The focused tests cover month/leap-year allocation, invalid or missing targets, store-wide scope protection, zero comparison baselines, prior-only categories, incomplete current periods, physical receipts awaiting inspection, forecast leakage and sparse history, and absence of customer/rental identifiers from the aggregate CSV.

## Historical forecast review

The visible review reconstructs rolling one-period-ahead estimates using earlier complete periods only. Daily review uses 28 earlier days and the latest 7 evaluation days; weekly uses 8 earlier weeks and 2 evaluation weeks. Monthly requires 8 earlier complete months and 2 evaluation months, averaging only the most recent 6 earlier months. Each training window must contain at least 4 rentals (monthly: in the six-month averaging window). Later checks may incorporate earlier evaluated actuals. MAE is the average absolute difference between actual and estimated rental counts or recorded fees, expressed per evaluated period. No future accuracy percentage is inferred. Missing history displays an unavailable state, not a zero error. Exact aggregate review values are included in the CSV; these are not forecasts saved when originally issued.

## Category share and demand heatmap

Category share is the category value divided by the sum of positive category values in the selected scope. It uses the same recorded fees or rental counts as the table; long tails are grouped for the donut only. Zero totals show an empty state. The handoff heatmap cross-tabulates Philippine weekday and time band from confirmed rental timestamps. Its row and column sums match the weekday/time totals. Bands vary in length, so counts do not imply rentals-per-hour intensity or unmet demand.
