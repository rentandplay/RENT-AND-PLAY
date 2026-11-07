# Analytics redesign

The workspace should answer three owner questions: how rental activity changed, which equipment contributed, and what needs attention. Detailed diagnostics remain available without dominating the first screen.

## Information hierarchy

- **Performance:** reporting scope → period summary → urgent follow-up → four core metrics → rental trend and switchable weekday/hour demand → equipment ranking and current stock. Exact values, cash, full equipment analysis, operations and measurement notes expand on demand.
- **Forecasting:** readiness and estimated totals → interactive history/projection → equipment mix. Exact period estimates, assumptions and historical error live in expandable sections. Missing history shows an honest unavailable state.
- **Recommendations:** urgency counts → focus filters → evidence and next-step cards. Remove the chart of recommendation counts and the repeated tutorial. Keep the rule available for inspection.

## Interaction contract

- Trend plots: hover to inspect; click/tap to pin; unpin or Escape to release. A floating tooltip shows values directly on the plot. Focus the chart and use Left/Right, Home/End, Enter and Escape; touch users can tap points. Comparison values retain their actual historical dates.
- Legends toggle individual series. Zoom shows the last 7 or 14 reporting buckets and can restore the full period. Zoom changes only the chart view; report totals and exports keep the selected reporting scope.
- Demand bars expose exact counts and share of chart total through hover, focus, tap or Enter/Space. Tooltips disappear on pointer leave unless pinned. Arrow keys navigate bars.
- Demand switches between weekday and hour. Equipment ranking switches between rental count and fees. Equipment names retain record drill-downs.
- Shared filters and CSV export retain their existing calculation paths. Expanded report sections persist across workspace redraws. Section navigation synchronizes the page heading, sidebar, URL and document title.

## Data integrity decisions

- Recorded rental fees are charges, not collections or profit. Cash uses its own date basis and is explicitly labeled **store-wide** because equipment/category filters do not apply to the finance endpoints.
- Current stock and currently overdue rentals are labeled as live snapshots, independent of the historical date range.
- Remove the fabricated weekend forecast preview. Retain only forecasts backed by sufficient recorded history and the existing what-if scenarios. Historical variation is not a calibrated confidence interval.
- Remove unsupported fixed 20% discount and 2–3 unit purchase suggestions. Retain evidence-based capacity, idle-equipment, service, overdue and data-quality review rules.
- Separate midnight–6 AM activity from 6–8 AM; label the noon and midnight boundaries explicitly.
- Replace the decorative stock donut with direct counts and availability meters; merge duplicate top-equipment rankings and demand charts.

## Verification

Run `npm run check` and `npm test` from `apps/web`. The DOM interaction tests use LinkeDOM as a development-only dependency. They exercise pinning, series visibility, zoom restoration, keyboard controls, escaped labels, hit-region bounds, disclosure defaults, forecast absence and hourly boundaries.

Browser visual verification could not run in this session: the computer-use tool stopped because it could not confidently determine the Chrome URL. Responsive styles and focus states are implemented, but desktop/mobile rendering still needs a browser review.
