# Rent and Play analytics redesign

The owner and counter staff use this dashboard to review recorded rental performance, compare equipment, prepare for future demand and decide what to review next. The three sections are Performance (descriptive), Forecasting (predictive), and Recommendations (prescriptive).

## Primary dashboard

- Four KPI cards: recorded rental fees, confirmed rentals, calendar-hour utilization, and current overdue rentals. Fees and rental volume have matched-period changes and optional goal attainment. Utilization shows its calendar-hours basis. Current overdue is a live snapshot, not a historical-period count.
- A combination chart shows actual rental fees or volume as columns and an optional owner-defined goal as a line on the same scale. Dates, units, partial-period rules and a dynamic interpretation are visible.
- Equipment comparisons show most rented, least rented active equipment and highest recorded fees, with current/prior bars, exact values, percentage changes, grouped physical units and record drill-downs.
- The most urgent four supported recommendations appear beside the main trend. Full recommendation cards explain outcome, measure, target, evidence, review trigger and action.
- Equipment and category comparisons are visible side by side on wide screens and stack on mobile. Their exact-value tables remain visible. Supporting return metrics, targets, data coverage and calculation notes are also always visible. Repeat-customer, terminal timing, audit logs and model galleries do not dominate the client overview.

## Targets

The owner saves shared goals and alert rates in Supabase-backed business settings. Operators may read them. There are no automatic management quotas. Missing goals display as unset and never as a fabricated zero line or attainment percentage. Monthly goals are allocated by calendar days, including a full allocation for a partial current day. The current saved recurring goal is a benchmark; there is no historical goal revision ledger. Store-wide targets are not applied to category/equipment-filtered views.

## Forecasts

Forecasting uses one fixed moving-average method. Daily estimates average matching weekdays in the last 28 complete days; weekly estimates average the last 8 complete weeks; monthly estimates average the last 6 complete months after at least 8 complete months are recorded. Actual history is solid blue and estimates are dashed orange. There is no model picker, automatic model selection, ranking table or what-if scenario control. A visible historical review compares rolling one-period-ahead estimates with actuals, with MAE, evaluation dates, exact values and an aggregate CSV export. It reconstructs estimates from earlier periods; these are not saved issued forecasts or guaranteed future accuracy. Monthly checks require eight earlier months, averaging the recent six. Method, dates, sample requirements and limits are explained in plain language. Aggregate demand does not establish a stockout date or a purchase quantity.

## Data and access

Supabase PostgreSQL is the database; Firebase handles authentication and push notifications. Reports receive complete rental evidence needed for earlier comparisons, carry-over hours, historical returns and current overdue snapshots. Valid physical receipt dates prevent returned equipment awaiting inspection from being mislabeled as overdue. Analytics exports are aggregate-only and omit customer contacts and individual rental logs. Simulated presentation records are labeled; they do not prove real business revenue or forecast accuracy.

## Review and demonstration

See `analytics-metric-dictionary.md` for formulas and limits and `analytics-rubric-evidence.md` for rubric mapping, roles, governance and the live demonstration sequence. Grading also depends on the team's actual business justification, demonstration and individual defense. These cannot be guaranteed by a dashboard implementation.

Verification includes chart keyboard/touch/legend/resize behavior, target scope and allocation, owner authorization, audit rollback, complete Reports history, record validation, privacy, build checks and desktop/mobile light/dark rendering with labeled synthetic fixtures.

## Readability revision

The dedicated `analytics-layout.css` loads after both shared stylesheets, including `workspace-design.css`, so legacy workspace selectors cannot silently reshape analytics containers. Tabs and filters are compact, KPI cards have consistent sizing, and the actual-versus-goal chart has a separate action-priority rail. Technical tables and calculation notes are fully visible in clearly labeled sections. Forecast history uses straight point-to-point lines to avoid suggesting unrecorded peaks; estimates remain dashed orange. Long combination charts support a 7/14-period inspection window without changing report totals or goal alignment.

Visual checks use the production stylesheet order, the `.workspace` ancestor and a sidebar-sized content area. They include 320, 390, 768 and 1440-pixel layouts, plus desktop dark mode. These are labeled synthetic-data previews; the actual authenticated workflow still needs a presentation rehearsal.

## Rental operations review

Performance includes visible utilization and peak-demand panels. Utilization is measured rented unit-hours divided by observed calendar unit-hours, not business-hours occupancy. Weekday and time-band charts show confirmed handoff totals in Philippine time. Time bands have different lengths; totals must not be described as rentals per hour. Tied peak labels and empty states remain explicit. All three analytics layers and the single forecasting method are retained.

## Visible evidence and chart selection

All disclosure controls are removed, including recommendation trigger explanations. Tables, formulas, data coverage, target controls, forecast method and historical review remain visible within their analytics section, even when older saved detail preferences say closed. Chart selection follows the question: combination columns/goal line for actual versus target, grouped horizontal bars for equipment comparison, percentage bars for utilization, a category-share donut for part-to-whole contribution, weekday columns for counts, a weekday/time-band heatmap for recorded handoff patterns, and lines for time-based forecasts and historical checks. The category donut aggregates a long tail into Other while retaining every category in the adjacent table. Empty totals never become fabricated percentage shares. The heatmap uses Philippine confirmation times, counts each handoff once and labels unequal time bands.

Verification: 86 focused analytics/forecast/workspace tests passed; build and syntax checks passed. Fifteen labeled synthetic previews cover all three sections at 320, 390, 768 and 1440 pixels plus desktop dark mode, with no page overflow. Wide data tables scroll inside their own mobile region. No live database records were changed.
