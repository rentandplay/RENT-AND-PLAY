# Rent and Play analytics defense and evidence guide

Use this guide to demonstrate how rental records lead to a management decision. The dashboard supports the analysis; owner approval, source receipts, adoption and measured business benefits require evidence from the business. Complete the owner decisions below before presenting them as agreed goals.

## Owner decisions to record

In Performance or Recommendations, open Business targets and alert rules. Only the owner can save changes. Enter the numerical goals and the Outcome and review plan fields.

| Field | What the owner should supply |
| --- | --- |
| Business outcome | A concrete result, such as improving equipment availability or timely returns. |
| Numerical target | A justified fee, confirmed-rental or utilization goal, or a late-return review threshold. |
| Why achievable | Evidence from budget, recorded history, available units and operating constraints. |
| Review lead | An agreed person or staff role accountable for reviewing the results. |
| Review frequency and date | When progress will be reviewed and the next specific review date. |
| Baseline dates | Both dates of the period used as the reference. Choose comparable periods and equipment filters. |

The saved plan and numerical goals provide the elements of a measurable, time-bound objective. Discuss whether the target is achievable and relevant with the owner. Saving a plan is not independent proof of client approval. Retain the owner's dated confirmation with the project evidence. Clear unknown values rather than inventing agreement.

The baseline dates are planning references, not frozen results. The Before vs. After view compares the selected reporting window with the preceding equal-length window; it does not automatically switch to the plan's baseline dates. To examine the agreed baseline, use Custom dates. Save the corresponding aggregate CSV and note the equipment filters and extraction date. Later record corrections can change a recalculated baseline.

## Live demonstration sequence

1. Explain the business problem, intended owner and counter users, agreed outcome, target, baseline and review date. State whether records are real, simulated or mixed; keep the demo dataset banner visible for simulated records.
2. Open Performance. State the date range, Philippine time basis, category and equipment filters. Explain recorded rental fees and confirmed rentals. Fees are charges; compare collections separately with receipts or the cash ledger.
3. Open Trace totals to rental records. The count and fee total reconcile all included records, independently of the visible table page. Open one rental link and check its equipment, confirmed handoff date, status and recorded charge. Record details use staff access. Customer contacts are omitted from the analytics table and aggregate CSV.
4. Change to a single equipment group or category and explain why totals change. Store-wide targets are intentionally hidden for these slices. Reset the filters and compare actual results with the owner's goal and previous period.
5. Open Forecasting. Explain minimum complete history, available complete periods and the moving-average training window separately. Monthly forecasting requires eight complete months, while its moving-average baseline uses the latest six. Compare the methods and historical MAE. Historical one-period-ahead error does not establish the accuracy of the entire future horizon.
6. Open Recommendations. Choose one action. Explain Outcome, Measure, Target, Evidence, Review trigger, Suggested responsibility, Review lead and Follow-up. Suggested roles are planning prompts, not a record of an accepted task assignment. Open the related operational record and let the owner decide the action.
7. Explain how follow-up will be measured. Record the action date, implementation details and other changes. Compare the same measure, scope and comparable periods after the review. A period comparison alone does not prove that the action caused the change.
8. Demonstrate an empty selection, insufficient forecast history, invalid target input and an operator account's read-only target view. Every member personally demonstrates their assigned part and explains its inputs, processing, output, action and limitations.

Use an isolated, clearly labelled demo dataset for input changes. Do not insert fake rentals, payments, maintenance events or data issues into business records just to create a presentation result. The Sample issue card is an explicit design example and is not included in data-quality counts.

## Record reconciliation worksheet

Choose a small date range and complete this worksheet from the actual records. Do not fill it from memorized screenshot values.

| Evidence | Observed value or reference |
| --- | --- |
| Environment and release | To record |
| Real or simulated dataset | To record |
| Selected dates and equipment filters | To record |
| Included handoff count | To record |
| Sum of valid recorded fees | To record |
| Dashboard confirmed rentals and fees | To record |
| One rental reference checked by staff | To record |
| Payment receipt or ledger check, if discussing collections | To record separately |
| Discrepancy and resolution, if any | To record |
| Reviewer and date | To record |

Included rental statuses are ACTIVE, RETURN_PENDING_INSPECTION and COMPLETED. The handoff date must fall within the selected Philippine dates. Pending and cancelled requests are excluded. Invalid or missing charges contribute zero and are reported in data coverage. Current overdue rentals and availability are current snapshots and need not equal historical period totals. Other metrics, such as on-time returns, use their own displayed date basis and denominator.

## Action and outcome register

Keep this register with the business review evidence. The current dashboard displays recommendations and a shared review plan; it does not save task completion or certify the outcome.

| Action | Evidence and trigger | Agreed assignee | Action date | Baseline and scope | Next review | Observed outcome and other changes |
| --- | --- | --- | --- | --- | --- | --- |
| To record after owner review | To record | Owner to confirm | To record | To record | To record | To record after review |

For overdue equipment, verify the actual return arrangement today. For reminder changes, compare late-return counts and due-rental denominators. For maintenance, distinguish routine inspections from failures. For listing changes, compare rentals and availability over equal periods. For counter timing, consider queue and connectivity as well as staff handling.

## Governance and resources

The following operating responsibilities are proposed for owner confirmation. They do not claim that organizational adoption has already occurred.

| Responsibility | Proposed lead | Evidence to prepare |
| --- | --- | --- |
| Goals, review plan and action decisions | Owner | Dated approval, saved plan and review register. |
| Accurate handoff and return entry | Counter / returns lead | Rental record and physical receipt checks. |
| Equipment condition and downtime | Equipment service lead | Inspection and maintenance notes. |
| Access administration and incidents | Authorized system administrator | Current roles, operator restrictions and audit records. |
| Adoption and monitoring | Owner with project team | Staff walkthrough, feedback and a scheduled review. |

Supabase PostgreSQL stores records and settings; Supabase Storage stores uploaded media. Firebase Authentication handles sign-in and Firebase Cloud Messaging handles push notifications. The web interface, backend API, mobile app and ESP32 terminal have different responsibilities. Explain what remains possible if a terminal or network connection is unavailable, using the actual implemented fallback workflow.

Prepare the current access rules and public privacy policy. Explain the purpose of collected information, who can access it, applicable consent, account-deletion requests and the owner's retention decisions. The code does not establish an approved fixed retention duration; do not invent one. Review any legal or operational retention need with the owner before deleting records. Analytics exports contain aggregate measures; operational records and downloaded files still require access control and careful handling. Show that an operator cannot save owner targets and that owner changes create an audit record. Human review is required before applying suggested pricing, inventory or customer-related actions.

## Validation cases and evidence log

Run these in the actual demonstration environment and write down observed results. A checklist describes expected behavior; it is not a claim that a live test passed.

| Case | Expected evidence |
| --- | --- |
| Known handoff with a valid recorded fee | Included count and fee match the source record. |
| Pending or cancelled request | Excluded from confirmed-handoff totals. |
| Equipment or category filter | Relevant totals change; store-wide goals are not applied to the slice. |
| Invalid or missing charge in an isolated fixture | No invented revenue; data coverage identifies the issue. |
| Empty selected period | Clear empty state and no invented forecast. |
| Insufficient complete history | More-history-needed state and explanation. |
| Invalid goal or review dates | Save rejected; existing saved values preserved. |
| Owner save and operator attempt | Owner succeeds with audit attribution; operator is denied. |
| Desktop and phone layout | Readable charts; wide tables scroll inside their panels. |
| Unfamiliar instructor input | Presenter can explain the resulting metric and supported decision. |

For each live case, retain the date, environment, release identifier, presenter, expected result, actual result and evidence reference. Automated tests use in-memory fixtures and do not establish that real transactions or receipts are correct.

## Rubric coverage

Local verification on 16 November 2026: all 118 web analytics tests passed, including source-total reconciliation, escaped plan text, aggregate privacy, plan save/refresh/clear behavior, forecasting and chart interactions. Six backend settings tests passed for persistence, validation, concurrent updates and audit behavior. Production build passed and contains the new review module. Headless Chrome checked all three sections at 1440, 768, 390 and 320 pixels; no page overflow or script errors were detected in those 12 layouts. Representative desktop and mobile panels were visually inspected.

These checks used isolated fixtures. The owner/operator API test was previously blocked by this environment's local connection restriction and was excluded from this backend test run. Demonstrate access enforcement and source-record reconciliation in the actual presentation environment. No owner approvals, real business results or live deployment are established by these local checks. Detailed local results are in `tmp/analytics-rubric-web-check.log` and `tmp/analytics-rubric-backend-check.log`.

| Criterion | Evidence location |
| --- | --- |
| Business problem and objectives | Owner goals, target basis, baseline and dated review plan. |
| BA concepts and process | Demonstration sequence from rental input to decision. |
| Data management and quality | Source record trail, reconciliation worksheet, exclusions and coverage checks. |
| Analytics and decision support | Comparisons, forecast methods and error, evidence-based action cards. |
| Dashboard and visualization | Justified KPIs, suitable charts, exact values, filters and interpretations. |
| Ethics, privacy and governance | Access demonstration, audit records, privacy policy and owner-confirmed rules. |
| Resources, alignment and business value | Responsibility table, actual architecture, adoption steps and outcome register. |
| System demo and validation | Live cases, recorded observed results and current automated checks. |

Each member should answer: What data enters my component? How is it processed? What does the output mean? Which decision can it support? What are its limitations? Demonstrate the feature personally; reading the guide alone does not establish mastery.
