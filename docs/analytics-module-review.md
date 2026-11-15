# Analytics suitability and module review

Reviewed 15 November 2026. This document describes the implemented dashboard, how its methods fit a rental business, and what the checks establish. The supplied documents are reference material; their sample sales figures are not rental records or owner targets.

## Source map

| Supplied reference | Relevant material | Application in Rent and Play |
| --- | --- | --- |
| [Business Analytics, Modules 1-4](C:/Users/requi/Downloads/Module%201-4.pdf) | Descriptive, diagnostic, predictive and prescriptive analytics; data preparation and business decisions | Performance summarizes recorded activity; Forecasting estimates future activity; Recommendations suggests reviews with evidence. Possible causes remain hypotheses. |
| [Business Analytics, Modules 5-8](C:/Users/requi/Downloads/Module%205-8.pdf) | Applications, ethics, personnel/data/technology resources, information policy, quality and business contribution | Aggregate customer views, owner-defined goals, data-coverage notes, named follow-up responsibilities and comparison periods. Changes in outcomes do not establish a causal benefit. |
| [Analytics Modeling, Modules 1-3](C:/Users/requi/Downloads/cd093ca00e7c3cb7dbdc84917647d0fcfb91b21e.pdf) | Business understanding, model types and modeling lifecycle | Every method has a rental decision, source fields, readiness rule and interpretation. |
| [Analytics Modeling, Modules 4-8](C:/Users/requi/Downloads/0d8c4c111e2bb70f65b5d6943febe9108b578ddd.pdf) | Preparation, model choice, validation, features and overfitting; PDF pp. 10, 12-14 | Simple forecasts with chronological evaluation, shallow operational decision tree, normalized customer grouping and silhouette. Complexity is not a substitute for enough history. |
| [Analytics Modeling, Modules 10-11](C:/Users/requi/Downloads/9ac3673cfe818127d7c78fdfe774ff814babf0d5.pdf) | Deployment/monitoring, transparency and privacy; PDF pp. 6, 13 | Recent-pattern review, transparent model notes, aggregate customer results and human decisions. No automatic pricing, customer restrictions or stock purchases. |
| [Business Analytics, Module 9](C:/Users/requi/Downloads/Module%209.pdf) | Fig. 9.14 combination chart; Fig. 9.19 color-scale heatmap; sparklines, data bars and dashboards | Actual/goal combination, Month x Equipment matrix, equipment mini trends, utilization bars and decision explanations. |
| [Module 9 professional slides](C:/Users/requi/Downloads/Module_9_Data_Visualization_Professional%20(1792561300).pptx.pdf) | Slides 7, 19, 28, 34-37: chart choice, combo, heatmap, objectives/metrics/actions and readability | Select charts for their analytical question. Keep units explicit, scales honest and labels legible. The sales-dashboard exercise is adapted to confirmed rentals, rather than copying its example numbers. |

## Chart decisions

| Chart | Why it fits rental records | Important interpretation |
| --- | --- | --- |
| Actual columns + goal line | Compares recorded fees or handoffs with an owner goal in the same units and date buckets. Module 9 Fig. 9.14 explicitly demonstrates this form. | Goal allocation follows calendar days. Store-wide goals are hidden for equipment/category slices. A goal is not a forecast. |
| Equipment horizontal bars | Compares equipment types, with enough room for names and prior-period values. | Rank by the selected metric. Fees, count and utilization answer different questions. |
| Category donut | Communicates part-to-whole composition with a small number of slices and a labeled remainder. | Category tables preserve exact values; a donut is not the primary time-trend comparison. |
| Month x Equipment heatmap | Shows monthly concentration across equipment, matching the color-scale table in Fig. 9.19. | A single scale applies to all cells for the selected metric. Top five plus Other when there are more than six groups; no records disappear from totals. Partial months and incomplete today are disclosed. |
| Weekday/time-band heatmap and weekday columns | Supports handoff preparation and staff coverage. | Counts are observed handoffs, not hourly rates, daily averages, latent demand or proof of unmet demand. Time bands and weekday exposure can differ. |
| Straight forecast lines | Makes chronological observations and future estimates readable. Dashed forecasts and a visible boundary distinguish them. | No smoothing-induced peaks; incomplete current periods are excluded from fitting. |
| Stacked channel/payment columns | Shows how booking volume is divided across channels or known payment tags over time. | Unknown tags remain identifiable; payment-method counts are not collected-cash amounts. |
| Pareto | Ranks actual contribution and cumulative share for prioritizing equipment reviews. | 80% is a reference threshold, not an assumption that exactly 20% of equipment produces it. |
| Waterfall | Shows collections less refunds/expenses when a matching period ledger is available, otherwise recorded-fee composition. | The end is net cash movement, not closing balance or accounting profit. Missing/mismatched ledgers cannot establish collections from charges. |
| Timing frequency bars | Shows counts in operational duration/verification ranges. | Unequal and open-ended ranges are explicitly frequency categories, not a density histogram. Most frequent ranges are not exact numerical modes. |
| Sparklines, data bars and status icons | Compact per-equipment trends, utilization magnitude and threshold status as taught in Module 9. | Exact values and threshold explanations accompany compact visuals. |

Scatter/bubble, orbit, treemap, 3D charts, neural networks, PCA and ARIMA are not added solely because they appear in teaching material. A price-versus-demand scatter, for example, would require defensible paired observations and controls for duration, stock availability and time. A rental asset returns to inventory; retail stock-depletion forecasting would be misleading here.

## Model decisions and evidence

| Method | Fit for the system | Validation and limits |
| --- | --- | --- |
| Same-weekday / moving average | Interpretable demand and fee baseline. Daily uses four recent weeks by matching weekday; weekly uses eight complete weeks; monthly uses six complete months after the eight-month readiness gate. | Historical estimates use only preceding complete periods and sufficient rental activity. MAE is in rental or peso units. |
| Simple exponential smoothing | Baseline that weights recent observations more strongly; alpha 0.35 is an explicit assumption. | Evaluated on the same eligible historical periods as the comparison models. It is not a seasonal or event-aware forecast. |
| Linear time trend | Alternative for gradual movement across complete periods. | Advances the time index across excluded incomplete periods. Negative predictions are bounded at zero. Recent lowest MAE does not establish universally best future performance. |
| Depth-2 late-return decision tree | Explainable operational patterns using channel, package, release time and prior booking history. | Minimum 12 labeled bookings, minimum leaf five, same learner for rules/scoring/chronological holdout. Only outcomes known before holdout release are training evidence. Accuracy, precision and recall are limited historical checks, not individualized guarantees. |
| Customer grouping | Exploratory normalized recency, frequency and recorded-fee grouping; small samples use labeled tiers. | Silhouette is group separation, not churn accuracy. Singleton silhouettes are zero; identical profiles do not create fake distinct groups. Single-booking customers are not labeled repeat renters. The 21-day inactivity rule is heuristic. |
| Equipment pairing | Counts equipment co-occurrence within the same customer's Philippine day. | A day may span separate bookings. Directional pairing share is not a purchase probability or a causal promotion effect. |
| Maintenance topics / unusual-record rules | Interpretable keyword counts and timing/amount checks for operational review. | Multiple topics can match one note. No flag does not prove all data is valid. |
| What-if scenario | Explores entered fee/demand/capacity assumptions without mutating records. | Added units change capacity, not invented demand. Price elasticity is assumed, not estimated. Aggregate calendar utilization is not a concurrent-booking feasibility guarantee. |

## Design and interaction sources

The new matrix is original HTML/CSS/JavaScript using the visual conventions of [Observable Plot's sorted heatmap](https://observablehq.com/@observablehq/plot-sorted-heatmap): aligned cells, sorted categories and a shared zero-based color legend. Plot is [ISC licensed](https://github.com/observablehq/plot/blob/main/LICENSE). No Plot source or example dataset was copied and no CDN is needed.

Entrance/replay and metric-change behavior follows the distinction between initial and updated views documented in [Apache ECharts data transitions](https://echarts.apache.org/handbook/en/how-to/animation/transition/). ECharts is [Apache-2.0 licensed](https://github.com/apache/echarts/blob/master/LICENSE); this implementation uses the project's existing SVG motion plus local CSS, without adding the library. The [ECharts accessibility guidance](https://echarts.apache.org/handbook/en/best-practices/aria/) also supports explicit descriptions and non-color cues. Each heatmap cell has an exact-value accessible label, keyboard navigation and selection; color is supplementary. Reduced-motion preference disables replay animation. There is no fake live-data animation or random value generation in production charts.

The singleton silhouette convention was independently checked against [scikit-learn's reference implementation](https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/metrics/cluster/_unsupervised.py), which assigns zero to single-member clusters.

## Verification and presentation boundary

- Regression fixtures independently calculate monthly totals, Philippine month boundaries, category/unit filtering, cent arithmetic, retained Other totals, and singleton silhouettes. Prior regression coverage verifies forecast windows, known-at-time validation, target scope, cash/fee separation and capacity assumptions.
- Chrome checked 25 layouts across 320, 390, 768 and 1440 CSS pixels, light/dark themes, daily/weekly/monthly views, empty data and a matching-ledger waterfall: zero detected SVG-text overlaps, page overflow or JavaScript errors. Exact-value tables intentionally scroll within their panels.
- Browser interaction checks exercise heatmap and main-chart replay, arrow-key movement, metric switching, exact readout and reduced motion. Final desktop/mobile heatmap captures were visually inspected.
- Final full web suite: 341 tests passed in serial execution, including the matching-ledger regression. The earlier concurrent run had a React support-inbox timing failure outside analytics; serial execution passed that test without changes to inbox code. Backend analytics/target integration: 8 passed. Production build and syntax checks passed. Logs are listed below.

Checks use explicit synthetic/in-memory records; they do not certify the truth of live payments or transactions. No production database was changed or deployment performed. Before presenting live totals as business facts, reconcile a selected day against confirmed handoffs, physical returns and payment receipts. Owner targets and the instructor's assessment remain external evidence. Forecasts and exploratory groups are estimates even when their implementations and tests are correct.

Review artifacts: `C:/Users/requi/Videos/analytics-review/module-analytics-review.json`, `analytics-module-web-tests-serial.log`, `analytics-module-backend-tests.log`, `analytics-module-build.log`, and `analytics-monthly-equipment-desktop.png`.
