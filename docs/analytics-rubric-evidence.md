# Rent and Play analytics rubric evidence

This guide maps the analytics redesign to the BA3101 final system rubric and describes the live evidence the group must supply. It supports a defensible presentation; a full score cannot be guaranteed by code changes. The instructor evaluates correctness, live demonstration, justification, the wider system, and each member's own work.

Sources: BA3101 Final System Presentation Rubric, sections 2–9; BA3101 Group System Presentation Grading Form, section B; supplied Module 9, Data Visualization.

## Criteria and evidence

| Group criterion | Maximum | Evidence to demonstrate |
| --- | ---: | --- |
| Business problem and objectives | 10 | Explain the owner's need to understand rental demand, equipment use and overdue returns. Identify owner and staff roles. State a measurable goal and review date with the client; demonstrate the configured target rather than inventing a quota. |
| BA concepts and process | 10 | Walk through collect, prepare, analyze, interpret and decide. Use Performance for descriptive results, Forecasting for estimates, and Recommendations for rule-based actions. Explain how reporting becomes decision support. |
| Data management and quality | 15 | Identify confirmed rentals, equipment, maintenance and settings as sources. Explain exclusion of unconfirmed/cancelled requests, missing-date/amount handling, observed-time assumptions, period boundaries and data-coverage notes. Trace a total or equipment row to records. |
| Analytics and decision support | 20 | Demonstrate working period and equipment comparisons, trends, interpreted results, forecast history requirements and recommendations with evidence and trigger rules. Explain the supported management decision. |
| Dashboard and visualization | 15 | Demonstrate at least two justified KPIs, correct units and chart types, readable comparisons and exact values. Show actual versus target only when a matching target exists. Distinguish recorded history from forecasts. |
| Ethics, privacy and governance | 10 | Demonstrate staff authentication and owner-only target changes. Explain aggregate reporting, personal-data handling in exports, audit records, data retention/access rules and human review of suggestions. Label simulated records visibly. |
| Resources, alignment and business value | 10 | Explain Supabase PostgreSQL/Storage, Firebase Auth/FCM, API/web/device responsibilities, staffing and adoption. Assign a person and review cadence for each action. Measure benefit against an agreed baseline after adoption. |
| System demo and validation | 10 | Run a live input-to-output case and selected failure/empty-data cases. Show reliable calculations and error handling. Present test results from the actual version demonstrated. Screenshots and recordings supplement the live workflow. |
| **Total** | **100** | Rating 4 earns 100% of the criterion maximum; rating 3 earns 80%, 2 earns 60%, 1 earns 30%, and 0 means not demonstrated. |

The group system contributes 40% of the final-period grade. Individual oral defense contributes 20%, quiz 20%, attendance 10%, and activities 10%. Modules 1–9 must be addressed, but governance, roles and adoption may be explained through documentation. Analytics and dashboards must actually run.

## Client decisions and measurement definitions

- Recorded rental fees measure confirmed charges, not receipts, refundable deposits, or net profit. Explain payment collections separately when discussing cash.
- Confirmed rentals measure recorded handoffs, not requests or expressions of interest. Low observed activity alone does not establish weak market demand.
- Equipment utilization uses the displayed observation basis. Calendar-hour utilization includes overnight hours; it must not be described as business-hours occupancy.
- Current availability and current overdue counts are live snapshots. Historical period metrics use their stated date basis and cutoff.
- Management targets express a desired outcome. A recommendation trigger flags a review; it is not automatically a business target or proof of cause.
- Forecasts depend on sufficiently complete historical periods. Historical backtest error describes the evaluated data and is not a guaranteed future accuracy percentage.
- Rental assets return to stock. A retail-style depletion date or exact purchasing quantity requires concurrent bookings, rental durations, service status, lead time and other evidence; aggregate rental counts alone do not justify it.

## Shared targets and access

The owner may save optional store-wide targets through `PATCH /api/settings/analytics`. Input is a flat object containing only the following fields:

| Field | Meaning and validation |
| --- | --- |
| `monthly_fee_goal` | Positive PHP amount with at most two decimal places, or null. |
| `monthly_rental_goal` | Positive whole number of confirmed rentals, or null. |
| `utilization_goal` | Ratio greater than 0 and at most 1, or null. |
| `overdue_rate_alert` | Ratio from 0 to 1, or null. |

Blank strings clear individual values. Omitted fields retain their saved values. Unknown or invalid fields are rejected. Unset targets remain unset; example slide figures and synthetic history never become quotas automatically. Percentage form inputs must be converted to ratios before calling this endpoint.

Targets are saved in `settings/business.analytics_targets` through the Supabase compatibility adapter. Owner attribution and update time are stored, with an atomic `ANALYTICS_TARGETS_UPDATED` audit entry. A transaction preserves concurrent partial target updates and the committed before state. This does not add a historical target ledger. A revised goal is a current planning benchmark, so historical comparisons must not claim that it was the goal in force in past months.

## Live presentation sequence

1. **Owner or business lead:** Introduce Rent and Play, the operational problem, intended users, agreed goal and review period. Explain expected benefit without claiming a measured improvement before a baseline comparison exists.
2. **Data and method lead:** Show a rental record, its confirmed date/status/fee and equipment reference. Explain preparation, missing-data rules and Philippine calendar dates. State clearly whether the selected dataset contains simulated records.
3. **Web lead:** Open Performance, explain two KPIs, change date/equipment filters, inspect exact chart values, compare a prior period and identify an equipment result. Explain recorded fees versus collected cash.
4. **Owner or authorized presenter:** Save a client-approved target, then demonstrate its effect. Clear a target and show the honest unset state. Use an operator account to demonstrate that target changes are denied.
5. **Analytics lead:** Open Forecasting and explain the horizon, actual/forecast distinction, method and validation status. Demonstrate insufficient history as an expected state rather than a fabricated estimate.
6. **Decision lead:** Open Recommendations and explain one priority's outcome, metric, evidence, trigger, target and next step. Assign the decision to the owner/staff; suggestions do not automatically change prices, stock or customer records.
7. **QA and governance lead:** Demonstrate a realistic invalid input and one empty/missing-data case. Explain access, data protection, roles, operating resources and known limitations. Provide the test result for this release.
8. **Every member:** Independently demonstrate the part they own and answer input, processing, output, business meaning and limitations questions. Reading introductions alone does not satisfy individual mastery.

## Verification evidence

`apps/backend/tests/analytics-settings.test.mjs` exercises target validation and boundaries, partial updates and clearing, concurrent partial changes, preservation of business settings, workspace loading, owner attribution, audit rollback, unauthenticated/operator/inactive-user denial, owner success, and foreign-origin rejection. It uses in-memory records and a loopback API server, not the live Supabase database.

Before presenting, run the current web/backend checks and the chosen live workflow in the environment used for the demonstration. Document any missing real history, unavailable hardware, incomplete payments, unconfigured targets or other limitations. The instructor may supply unfamiliar input, so the team must explain results without relying on memorized sample numbers.

## Verified implementation on 13 November 2026

- Web build and syntax checks: `npm run check` passed. The production static-server smoke test follows all imported browser modules, including analytics-targets.js.
- Analytics and forecasting suite after the readability revision: 75 passed, 0 failed.
- Full web suite on the current shared checkout: 284 passed, 2 failed (286 total). Both failures are in `page-flows.test.mjs`: return-confirmation tests expect the former success dialog, while a separate existing change redirects confirmed returns to Dashboard. This analytics revision preserves that unrelated return behavior and does not claim a clean full-suite result.
- Full backend suite: 258 passed, 0 failed, 7 existing emulator-dependent tests skipped (265 total).
- Headless Chrome rendered Performance, Forecasting and Recommendations at 320, 390, 768 and 1440 CSS pixels and desktop dark mode. The fixture includes both shared stylesheets, the final analytics stylesheet, the `.workspace` ancestor and sidebar-sized content. No page-level horizontal overflow was detected. Visual review covered readable axes, visible equipment/category charts, expandable exact-value tables, the forecast evidence panel and recommendation cards. Horizontal record tables intentionally scroll within their own region.
- Tests and visual fixtures use local in-memory or explicitly labeled simulated data. They do not write transactions or goals to the live database. These checks do not replace a live Supabase/ESP32 workflow demonstration, client target approval or the individual defense.

Restart the backend to register the new analytics settings endpoint and restart the web server to load its new stylesheet route; then refresh the web application. The owner can open Performance then Business targets and alert rules to enter client-approved goals. Existing saved browser report preferences are preserved; new default preferences use a monthly view over the last 365 days.

## Single forecasting method update

The forecasting screen now uses only moving-average estimates. The model picker, auto selection, algorithm rankings, benchmarking table and lower/higher scenario controls have been removed from the active calculation and export flow. Daily forecasts use the same weekdays from the last four complete weeks; weekly/monthly forecasts use the documented recent-period mean. Internal checks validate the averaging rule without selecting competing algorithms. Forecast lines connect recorded points directly, avoiding artificial peaks from curve smoothing. Current test results are recorded above.

## Lesson-based rental review additions

Added visible calendar-hour utilization and weekday/time-band handoff panels, plus an expandable historical forecast review with exact values, MAE and evaluation dates. Historical checks reconstruct rolling one-period-ahead estimates and do not claim future accuracy or saved original forecasts. The latest analytics/forecast suite passed all 78 tests; build and syntax checks passed. Visual fixtures covered 320, 390, 768 and 1440 pixels plus desktop dark mode, with the review expanded, and extra daily/hour views. No page overflow was detected. The complete shared-checkout web run again reported the two previously documented return-flow failures; it did not finish and was stopped, so no final full-suite pass count is claimed for this revision.

## Visible chart evidence revision

The current layout replaces every analytics disclosure with a visible labeled section. Recommendation trigger rules are visible too. The chart set now includes a category-share donut and a weekday/time-band heatmap, alongside actual/goal combination charts, grouped equipment bars, percentage utilization bars, weekday columns and time-series lines. Each chart is tied to its units and decision. The current focused analytics/forecast/workspace suite passed 86 tests; build and syntax checks passed. Desktop/mobile/light/dark synthetic previews have no page overflow; mobile tables retain internal scrolling. This revision did not rerun the full shared-checkout suite; its unrelated return-flow failures remain documented above.
