# Local rentals, delivery and payments

Rent & Play operates from its own establishment in Lakewood Subdivision, Los Baños, Laguna. Delivery is restricted to this subdivision. Staff validate the resort/address during review. The system stores this delivery area; it does not infer geography from a typed address or provide GPS tracking.

Customers can rent now or choose a start time from five minutes to 180 days ahead. Web and Android convert Philippine dates to a timezone-qualified instant; the backend validates the time and quotes the entire rental period. A ten-minute return/inspection allowance separates reservations. A future reservation occupies its planned interval while the healthy unit can still serve an earlier nonoverlapping rental. A damaged, maintained, overdue or uninspected unit cannot be promised as available.

Customer requests retain the existing fifteen-minute review hold. Once approved, a scheduled request can be prepared within ten minutes of its start and expires thirty minutes after the planned start unless staff already have it in delivery custody. Preparation verifies the exact unit. An immediate prepared rental has a thirty-minute handoff window by default. The server checks availability again at preparation and handoff. The timer starts at physical customer handoff; whole-stay rentals retain their fixed checkout deadline.

| Step | Staff action | Stock and timer |
| --- | --- | --- |
| Confirmed schedule | Review customer and address | Future interval reserved; current stock remains usable |
| Prepared | Scan the assigned physical unit | Unit reserved; timer stopped |
| On the way | Optional short-trip progress update | Unit stays in operator custody; timer stopped |
| Delivered | Verify rental QR/code, identity, actual payment and inspection | Timer starts and the unit becomes rented |
| Unsuccessful | Record the reason | Unit remains reserved until physically back at the shop |
| Back at shop | Scan that unit and confirm receipt/condition | Healthy unit becomes available; damaged unit gets maintenance; prepaid money remains refundable |

An expired outgoing handoff does not release stock automatically. Staff resolve the unsuccessful delivery and receive the unit at the shop. Customer cancellation and assignment changes cannot free a unit still in transit. Delivery records retain time and operator. The web and Android day calendars use the same paginated backend query.

An active customer can review the additional price and request an extension before the due time or a pending return. Staff can assist a walk-in customer after confirming their agreement. Approval rechecks the next reservation and the current due time inside a transaction. It changes the due time and assessed charges, creates an outstanding balance, and records no collection. Persistent operation records make older retries safe after later extensions. Receiving the item cancels an unresolved extension.

The payment ledger records money accepted against rental charges, verified QR receipts, actual refunds, and expenses already paid. Cash is accepted in person. This is a manual recording flow without a POS or payment gateway. Normal receipts cannot exceed the unpaid charge; closed requests can record a late-confirmed receipt against the original rental fee and preserve its refund liability. Staff confirm the transfer/reference before posting a QR entry.

Collections are journaled atomically with QR verification, cash handoff or a separate partial/balance receipt. Refunds are separate entries. Receipt keys and daily totals share the same transaction so a lost response or repeated submission cannot double-count money. Expenses use their own operation keys. Public payment references are persisted as PAY-00001; rental R-codes and all existing equipment QR tokens remain unchanged.

Daily summaries group by Asia/Manila and show collections, refunds, expenses, net collections and net recorded cash movement. They do not claim a counted cash drawer or complete profit. Payments defaults to the last 30 days on web and mobile. Its Rental payments tab shows saved historical amounts and outstanding balances for rentals created in the period; its receipt ledger uses the actual receipt date. Missing receipt dates are flagged and can be confirmed by staff with evidence, without adding another payment to the rental. Unknown payment amounts remain unknown. Report charts separate assessed rental charges, attributed to handoff day, from collections recorded/verified on their ledger date.

Rental financial totals are precomputed in `rental_financial_daily`; per-rental ledger coverage is atomically maintained in `rental_payment_totals`. Run `node --env-file-if-exists=.env scripts/rebuild-finance-summaries.mjs --apply` from the backend to reconcile existing records after upgrading. This only rebuilds derived data and creates no receipts. Removing an incorrect rental reverses its charge, customer and financial projections; recovery records and audit entries remain available.

Rental, customer and maintenance lists use backend filters and cursors with a default page of 5 and a maximum of 100. Customer prefix lookup searches stored normalized names. Item/maintenance name prefixes use saved capitalization; reference searches are exact. Date filters apply to known creation dates. Local secondary filters and counts apply to the loaded page. Both platforms can retrieve older history without repeatedly downloading every rental. Owner account lists load with Settings, and audit feeds load when needed. Financial and charge/count summaries are precomputed; detailed report evidence is requested for the selected period.

Charge/count projections are idempotent, with persisted repair jobs for retry after a temporary failure. Safe metadata migration preserves original IDs, QR tokens, financial values and historical aliases. The `hasAcknowledgedIdRequirement` field acknowledges the physical-ID requirement; actual identity is checked by staff at handoff. The earlier sentinel remains a compatibility input for older Android clients.

Equipment popularity uses `equipment_rental_totals` and `equipment_rental_daily`, maintained by the same idempotent rental projection. Only ACTIVE, RETURN_PENDING_INSPECTION or COMPLETED rentals with a real, non-future confirmation timestamp contribute. Counts combine all physical units in their current stock group, including archived units that have rental history. Rejected, expired and unconfirmed requests do not contribute. Corrections and deleted rentals reverse their previous contribution. The History ranking has its own date period and is independent of five-record table pages; Analytics requires complete report records and uses the same count/name order. Backfill existing derived counts with `node --env-file-if-exists=.env scripts/rebuild-equipment-ranking.mjs --apply`; this never changes rentals, payments or receipts. Background repair completion invalidates cached summaries immediately.

ESP32 endpoints remain on standby. Camera optics and Bluetooth printer output require the separately deferred physical-device checks.
