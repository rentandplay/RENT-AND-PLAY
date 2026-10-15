# API Endpoints

## Database availability errors

Firestore quota exhaustion returns HTTP `429` with `{error, code: "FIRESTORE_QUOTA_EXCEEDED", retryAfterSeconds}` and a `Retry-After` header. During the five-minute cooldown, further database requests fail without consuming more reads. Device clients should honor that header when polling. Logout and the legacy Firebase reset-link endpoint do not require Firestore access and remain available; the current OTP password-reset endpoints use Firestore.

Temporary database failures return HTTP `503` with code `FIREBASE_UNAVAILABLE`; invalid server configuration or credentials use `FIREBASE_CONFIGURATION_ERROR`. `GET /api/health` returns HTTP `200` with `database: false`, the matching `code`, `warning`, and `retryAfterSeconds` when the database is unavailable. A healthy response includes `database: true`.

## Core endpoints

- GET `/api/mobile/admin-workspace` — active OPERATOR/OWNER account that has completed its temporary-password change. Returns the staff workspace, dashboard summary, and inventory view in one response; used by the Android staff app. `Cache-Control: no-cache` requests an explicit fresh snapshot.
- GET `/api/analytics` — active OPERATOR/OWNER account. Returns only rental and catalog summary metrics. The Android report uses this cached summary instead of opening whole-collection realtime listeners.

## Account security

Canonical roles are `OWNER`, `OPERATOR`, and `CUSTOMER`; old `SUPER_ADMIN`, `ADMIN`, and `USER` values remain compatible. See [account procedures and validation](../architecture/account-access.md).

- POST `/api/auth/email-check` — public, rate limited compatibility endpoint. `{email}` checks format, rejects whitespace, and normalizes to lowercase. No DNS/domain lookup is performed; invalid syntax returns `400`.
- POST `/api/auth/login` — `{email, password, remember?}` checks email format without DNS/domain validation, creates a staff session, and returns a canonical user with `mustChangePassword`.
- POST `/api/auth/password-reset/request` — public, rate limited. `{email}` checks email format only and requests a six-digit reset code. The generic response does not reveal whether an active account exists; codes expire after 10 minutes, permit five guesses, and have a 30-second resend cooldown.
- POST `/api/auth/password-reset/verify` — public, rate limited. `{email, code}` returns a short-lived proof token only for a valid code and active account.
- POST `/api/auth/password-reset/complete` — public, rate limited. `{email, verificationToken, requestKey, newPassword, confirmPassword}` changes the password after code verification, revokes existing sessions, and clears the temporary-password flag.
- POST `/api/auth/password-reset` — compatibility endpoint for older clients and the signed-in Settings shortcut. `{email}` requests a Firebase reset link; the current Forgot password screens use the OTP endpoints above.
- GET `/api/auth/me` — staff cookie or Firebase token; includes `mustChangePassword`.
- POST `/api/auth/change-password` — active staff, rate limited. `{currentPassword, newPassword, confirmPassword, remember?}` requires a different password with 8–128 characters, an uppercase letter, a number, and matching confirmation. Verifies the current identity, revokes prior sessions, and clears `must_change_password`. Web receives a fresh cookie or `signInAgain: true`; mobile signs in again.
- POST `/api/users` — Owner only. `{fullName, email, role, passwordMode, password?, confirmPassword?}` creates `OWNER` or `OPERATOR` after email-format validation. `passwordMode` is `generated` (emailed using backend SMTP) or `manual` (matching password fields required). Returns `mustChangePassword` and `credentialsEmailSent`, never the password. Generated-email failure rolls back account creation.

Other staff endpoints return `403 PASSWORD_CHANGE_REQUIRED` while the account's temporary-password flag is set.

## Mobile registration and email verification

- POST `/api/mobile/registration/email-code` — public JSON `{email}`. Sends a six-digit code that expires after 10 minutes. Requests are limited to one email and source address; each email can request at most five codes per 15 minutes and must wait 30 seconds between sends. The response does not reveal whether the address already has an account.
- POST `/api/mobile/registration/verify-email-code` — public JSON `{email, code}`. Checks a six-digit code with at most five guesses and returns a short-lived `verificationToken` on success.
- POST `/api/mobile/registration/complete` — Firebase bearer token plus `{email, verificationToken, name, phone}`. The email must match the authenticated Firebase account; the backend marks that address verified and creates its customer profile only after the proof is accepted. Names are limited to letters and common name punctuation, and phone numbers must normalize to a Philippine mobile number.

The backend sends mail over Gmail SMTP using backend-only `SMTP_USER` and `SMTP_PASSWORD`. Registration OTP hashes use `REGISTRATION_OTP_PEPPER`; password-reset OTP hashes use `PASSWORD_RESET_OTP_PEPPER` (at least 32 random bytes), with the registration pepper as a compatibility fallback. Firestore TTL settings cover both expired registration and password-reset OTP records; deploy index changes with `firebase deploy --only firestore:indexes`.

The current rental desk uses the rental request, payment review, equipment preparation, resort handoff, and receipt endpoints described below. These legacy/proposal endpoints remain documented:

- POST `/api/rentals`
- POST `/api/mobile/rentals`
- POST `/api/mobile/rentals/{rentalId}/cancel`
- POST `/api/mobile/rentals/{rentalId}/review`
- POST `/api/returns`
- GET `/api/terminals/{terminalId}/pending`
- POST `/api/terminals/{terminalId}/confirm`
- PATCH `/api/items/{id}/status` (internal backend update)
- GET `/api/terminals/{terminalId}/status`

The handoff endpoints below are implemented. Direct item-state overrides and a separate device status endpoint are not exposed; device status is available through workspace/dashboard terminal metadata.

## Implemented pricing endpoints

These authenticated endpoints use the backend as the pricing source of truth:

- GET `/api/pricing` — return the client rate sheet and rental policies. The initial catalog is supplied from backend defaults until saved to Firestore.
- PUT `/api/pricing` — save edited rates, overtime, service hours, inclusions, and policy text.
- POST `/api/pricing/quote` — calculate a timed or whole-stay rental quote. Send `productId` or an `itemId` linked to a pricing product, `startAt`, and either `durationMinutes` or `mode: "WHOLE_STAY"` plus `resortCheckoutAt`. Optional `actualReturnAt` adds overtime.

The quote endpoint previews amounts. `POST /api/mobile/rentals` and `POST /api/rental-bookings` independently calculate and saves its authoritative quote inside the reservation transaction. Client-supplied amounts never determine final charges.

## Customer accounts

- POST `/api/customers` — active Owner/Operator. Create a walk-in directory profile with `fullName` and a Philippine `phone`; `email` and `address` are optional. No auth login is created. Customer code is assigned by the server. Optional 32-hex `requestKey` makes retries idempotent. Matching name + normalized phone or matching email returns 409; reuse/restore the existing profile. Shared family contact numbers are allowed for different people.
- POST `/api/customer-accounts` — active Owner/Operator. Create optional mobile app access using `fullName`, `email`, PH `phone`, `password`, and `confirmPassword`. A supplied `customerId` upgrades an active profile without a login: Firebase Auth UID equals that customer ID, preserving the code and rental history. Code is assigned by the server. Password is sent only to Firebase Auth. Mobile login still requires customer acceptance of the app terms.
- PATCH `/api/customers/{id}` — update customer details or archive/restore a customer. Archived customers stay in the directory and retain their rental history.
- PATCH `/api/customers/{id}/password` — active Owner/Operator session. Change the password for a linked mobile customer account with matching `newPassword` and `confirmNewPassword` values (8–128 characters, uppercase letter, number). The password is sent only to Firebase Authentication and is never written to Firestore or audit logs.
- DELETE `/api/customers/{id}` — active administrator session. Permanently delete an archived customer with the current `version` (`updated_at`, or `created_at` for legacy records). Customers with active or pending rentals cannot be deleted. Completed rental records and audit logs remain; a linked mobile account is removed too.

Timed blocks round up. The quote chooses the cheapest applicable regular/package price; each started overtime hour uses the product's configured overtime rate. Whole-stay rates end at the resort guest's checkout time. Customers pay the rental fee shown in the quote; new rentals do not have a deposit.

## Customer rental request, payment, delivery, and return

All staff routes accept an active Owner/Operator web session or a Firebase ID token for an active Owner/Operator profile. Staff manage customer records; each customer can view only their own rental records and handoff QR. Staff identity and physical timestamps come from the server.

- GET `/api/mobile/catalog`: public actual inventory IDs, configured public pricing and availability, QR labels, and Firebase project ID. Equipment without configured rental rates is hidden from customers and retained in admin inventory. Configured held units show reserved.
- POST `/api/mobile/catalog/resolve`: public `{code}` lookup of a unique actual equipment QR, item code, or ID. `item.id` and `stock_group_id` identify the equipment group; `item.scanned_unit_id` and `scanned_unit_code` identify the exact physical label. Customer return matching must use `scanned_unit_id`, not the group ID. A group-only lookup has null scanned-unit fields; duplicate unit labels are rejected even within one group.
- GET/POST/PATCH `/api/mobile/profile`: verified Firebase identity; bootstrap/read/edit own regular CUSTOMER profile and terms acceptance. Staff profiles include `mustChangePassword`. Payload cannot change role, UID, active status, or login email.
- POST `/api/mobile/quote`: authenticated `{itemId, durationMinutes}` returns `{quote}` with rental fee, package components and billed duration. This is an estimate; the duration starts on physical release.
- GET `/api/mobile/payment-instructions`: authenticated customer returns the owner's InstaPay QR, account name/number, and instructions, or null QR fields if the owner has not configured one.
- POST `/api/mobile/rentals`: customer `{itemId, durationMinutes, requestKey, paymentMethod, deliveryLocation, expectedQuote?}` creates `PENDING_ADMIN_APPROVAL` and a hold with `fulfillment_mode=DELIVERY`. A nonblank resort/address is required; this never silently defaults to shop pickup. Payment method is `CASH` or `QR`. `expectedQuote` contains numeric `rentalFee` and `billedMinutes`; changed amounts are rejected. QR requests also require `paymentProof: {imageDataUrl, reference?}` with a valid PNG/JPEG screenshot up to 350 KB, and the owner must have configured an InstaPay QR.
- POST `/api/mobile/rentals/{rentalId}/payment-proof`: customer may replace the screenshot only after an operator rejects the current proof. The request is `{imageDataUrl, reference?}` and is accepted only while the request is open and its hold has not expired.
- POST `/api/rental-bookings`: admin `{itemId, customerId, requestKey, paymentMethod?, deliveryLocation?, durationMinutes}` creates an `APPROVED` counter rental. Alternative: `mode: "WHOLE_STAY"` and timezone-qualified `resortCheckoutAt`. No terminal ID is required.
- PATCH `/api/settings/payment`: owner-only. Saves `{imageDataUrl?, accountName, accountNumber, instructions}` for the customer InstaPay payment display. PNG/JPEG QR images are limited to 250 KB. Removing the QR disables QR checkout until a new QR is saved.
- GET `/api/mobile/rentals` and `/api/mobile/rentals/{rentalId}`: the authenticated customer's own rental records, canonical fields, UTC ISO times, current status, physical receipt, saved charges, and balance/refund amounts.
- GET `/api/mobile/rentals/{rentalId}/ticket`: customer-only for their own rental; returns `{ticket}` containing the customer rental handoff QR `value`, `image_data_url`, rental ID/code, status, and review/handoff deadline.
- POST `/api/mobile/rentals/{rentalId}/review`: admin `{action: "APPROVE", paymentVerified?, notes?}` approves a cash rental request without starting a timer. QR requests cannot be approved here until payment proof is verified. `{action: "REJECT", reason}` closes the hold and retains any payment/refund liability.
- POST `/api/rentals/{rentalId}/payment-review`: admin `{action: "VERIFY", notes?}` reviews the customer's saved screenshot, records the exact rental fee as paid, and approves the request. `{action: "REJECT", reason}` leaves the request open for a replacement screenshot.
- GET `/api/rentals/{rentalId}/payment-proof`: admin-only view of the latest customer screenshot and reference.
- POST `/api/mobile/rentals/{rentalId}/cancel`: customer cancels a pending or approved rental before handoff. Frees only its own reservation and retains recorded refund liability.
- POST `/api/rentals/lookup`: staff `{kind: "RENTAL" | "BOOKING" | "INVENTORY", code}` returns `{rental, item}`. Rental lookup accepts the customer rental QR or saved reference; inventory lookup finds the unique approved, active or inspection-pending rental for the physical unit. This supports preparation and return scanning, while unapproved and ambiguous rentals are rejected.
- POST `/api/rentals/{rentalId}/assignment`: admin `{inventoryCode, reason}` swaps an approved booking to an available unit with the same product and saved price. Both holds update atomically.
- POST `/api/rentals/{rentalId}/prepare-delivery`: admin `{inventoryCode, manualReason?}` scans the exact assigned equipment QR at the shop and records it as prepared for delivery. This leaves the equipment reserved and does not start the timer. Changing the assigned unit clears preparation.
- POST `/api/rentals/{rentalId}/release-verification`: admin read-only preflight `{transactionCode, manualReason?}` verifies the customer's rental handoff QR after the unit is prepared. It returns `{booking_verified, inventory_verified, delivery_prepared, rental, item}`; the item QR is checked earlier during preparation. This does not start the timer or record a release.
- POST `/api/rentals/{rentalId}/release`: admin `{requestKey, transactionCode, customerVerified: true, paymentVerified, inspection, manualReason?}` confirms the customer rental QR at the selected delivery location. The saved equipment preparation and reservation are rechecked atomically. Cash balances must be collected and verified at handoff unless already recorded; verified QR proof is already recorded as paid. Saves the handoff inspection, starts the timer at server time, and changes rental to `ACTIVE`, item to `RENTED`.
- POST `/api/mobile/rentals/{rentalId}/return`: customer reports condition/notes for an active mobile rental. The unit remains rented and the timer runs until staff physically receives it.
- POST `/api/rentals/{rentalId}/receipt`: admin `{requestKey, inventoryCode, physicalReceiptConfirmed: true, manualReason?}` records the actual physical receipt instant, stops overtime, and sets rental `RETURN_PENDING_INSPECTION`, item `UNDER_INSPECTION`.
- POST `/api/rentals/{rentalId}/complete-return`: admin `{requestKey, inspection, penaltyAmount, penaltyReason?}` after physical receipt. Explicit numeric penalty is required, including zero. Positive penalties need a reason. Original rates and saved receipt time determine fees. Cleared items become available; damage/inspection-required results create maintenance.
- POST `/api/mobile/rentals/{rentalId}/return/review`: compatibility route. `action: "APPROVE"` delegates to complete-return and requires the same key/inspection/penalty after receipt. `action: "REJECT", reason` rejects an outstanding customer request while the rental stays active.
- POST `/api/rentals/{rentalId}/settlement`: admin `{requestKey, paymentAmount?, rentalRefundAmount?, paymentMethod?, reference?, notes}` records an actual partial/balance receipt or refund. Method is `CASH` or manually verified `QR` (reference required). Receipts do not approve or start a rental. Closed cancelled/rejected/expired requests can record a late-confirmed receipt against the original fee while preserving its refund liability. Refunds require a closed request; collections and refunds cannot share one submission. Amounts cannot exceed balances or refundable payments. Legacy deposit fields remain for historical records.
- GET `/api/rental-inspection-photos/{photoId}`: admin-only saved inspection image. Photos are omitted from catalog/owner lists and loaded separately.
- GET `/api/workspace`: admin records, rental transactions, inspections, maintenance, pricing, audit history and safe terminal metadata.

`inspection` is `{condition, result, notes, accessoriesChecked: true, photos?}`. Condition is GOOD/FAIR/DAMAGED/NEEDS_INSPECTION, result AVAILABLE/UNDER_MAINTENANCE, notes required (maximum 2000 characters). Release must be GOOD or FAIR with AVAILABLE result. Return damage or inspection-needed results require maintenance. `photos` accepts at most two valid JPEG data URLs, each up to 150000 characters. Inspector and timestamps are server supplied.

Creation, handoff, receipt, completion and settlement require `requestKey`, exactly 32 lowercase hex characters. Preserve it for retries of the same operation. Identical retries return the saved record with `duplicate: true`; changed details under that key return 409. A manual lookup requires a nonblank `manualReason` plus the exact rental/equipment ID or printed code; a QR scan uses actual QR tokens.

Customer review holds default to 900 seconds, approved requests have 1800 seconds to be prepared, and shop-prepared deliveries have 7200 seconds to reach the customer. Configure `RENTAL_REQUEST_HOLD_SECONDS`, `RENTAL_PICKUP_HOLD_SECONDS`, and `RENTAL_DELIVERY_HOLD_SECONDS` (60–86400 seconds). Startup/30-second and request-time sweeps expire holds, audit the reason, and release only their own pointers. Mutation transactions recheck deadlines and availability. Rental/physical-item changes, inspections, fees, and audit entries commit atomically.

Customer checkout supports rent-now durations and future dates. Quotes and rental creation accept optional timezone-qualified `scheduledStartAt` (five minutes to 180 days ahead). Availability covers the entire period; the timer starts at physical handoff. InstaPay payment is manual: the app displays the owner QR and a staff member verifies the uploaded screenshot; no online gateway charge is made. See [the rental flow](../architecture/admin-rental-flow.md).

## Rental notifications

These routes accept the web admin session cookie or an active Android account's Firebase bearer token. The backend chooses the recipient inbox from the authenticated profile.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/notifications` | Latest 60 inbox entries, loaded unread count, audience, revision and next cursor. `before` loads older entries. `since` returns `{unchanged: true, revision}` when unchanged. |
| POST | `/api/notifications/read` | `{ids: [...]}` marks up to 60 owned inbox entries read for the current account. |
| POST | `/api/notifications/device` | `{token: "..."}` registers an Android FCM token for the signed-in account. |
| DELETE | `/api/notifications/device` | `{token: "..."}` removes only a device owned by the current account. |
| GET | `/api/rental-events` | Authenticated SSE stream. `rental.changed` carries only a revision and rental ID; customer events are scoped to that customer, except generic expiry refresh signals. Clients reload scoped API data on events and reconnects. Fan-out is in-process, so multi-instance deployments need a shared event broker. |

Booking and return events persist inbox entries atomically with their rental changes. Push is asynchronous and retryable. See [notification flow](../architecture/rental-notifications.md).

## Unit maintenance on web and Android

These routes accept an active Owner/Operator web session or Android Firebase bearer token. Public ticket references (`M-0001`) and physical unit codes (`EQUIP-001`) are saved by the backend and shared by both clients. Internal document IDs are used in API paths.

| Method | Route | Behavior |
| --- | --- | --- |
| POST | `/api/maintenance` | Report one physical unit with `itemId`, exact saved `version`, issue, condition, priority, staff, target date and optional resized photos. Busy units and duplicate open tickets are rejected. |
| GET | `/api/maintenance-staff` | Minimal active staff choices for assignments. |
| GET | `/api/maintenance/{id}` | Current ticket, workflow stage, saved references and unit; historical tickets may have `item: null`. |
| PATCH | `/api/maintenance/{id}` | Require `revision` and `action`: `update`, `start-repair`, `send-inspection`, `inspection-failed`, `complete` or `retire`. Completion needs Good/Fair condition and all three inspection checks. A stale revision returns 409. |
| GET | `/api/maintenance/{id}/photos/{photoId}` | Authenticated photo from this exact ticket. |

Repair cost is the full actual total for the ticket, with null meaning unknown and zero meaning no cost. Up to three resized photos may be added per update and six per ticket. Closed tickets allow expense corrections, notes and photos without changing stock. See [the maintenance procedure](../architecture/maintenance-flow.md) and OpenAPI schemas for field limits.

## ESP32 terminal on standby

Keep `ENABLE_ESP32=false`, the default. The ESP32 terminal tab and existing records/firmware remain present. Legacy `POST /api/rentals`, `POST /api/returns`, `GET /api/terminals/{id}/pending` and `POST /api/terminals/{id}/confirm` return 409 standby and cannot change the current rent flow.

The retained device contract is for later hardware work: separately provisioned device credentials, assigned verification request/code, physical OK/reject action, deadline and displayed inspection revision. Provisioning uses `npm run terminal:register`; only the key digest is stored and credentials never appear in web responses. Legacy `PUT /api/verification-requests/{id}/inspection` edits a pending draft with revision checking and does not release or receive equipment.

Legacy attempts retain `VERIFICATION_TTL_SECONDS=600` (60–1800 seconds). Their expiry and history remain supported. Hardware must be integrated and physically validated before enabling terminal endpoints.

### Staff-assisted walk-in rentals

POST `/api/rental-bookings` accepts `rentalChannel: "WALK_IN"`, `fulfillmentMode: "SHOP_HANDOVER" | "DELIVERY"`, an active `customerId`, an available `itemId`, duration/mode, payment method, quote snapshot and retry key. Shop handover stores the Lakewoods establishment location; delivery requires `deliveryLocation`. It reserves the unit in APPROVED without starting the timer or inventing a payment. Only staff can create this channel.

Preparation and return endpoints are shared with app rentals. At handover, `/api/rentals/{id}/release-verification` can verify the saved public R-code with audited manual lookup; no customer phone is required. `/release` additionally requires `customerVerified`, `paymentVerified` (unless already paid), `customerTermsAcknowledged` and condition/accessory inspection. Staff-witnessed agreement details and the physical handover time are persisted. Staff can receive equipment without a customer return request. Physical receipt stops the timer, inspection determines availability/maintenance, and settlement handles remaining balances/refunds. ESP32 stays on standby.

## Local planning, extensions and financial records

These staff routes accept the same active Owner/Operator web cookie or Android bearer token. Customer extension routes are scoped to that customer's rental. No client reads these Firestore collections directly.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/records/rentals` | Bounded history/current list with `status`, `customerId`, `itemId`, `search`, `from`, `to`, or `scheduledDay`. |
| GET | `/api/records/customers` | Active/archive filter and normalized customer name prefix or exact public reference. Staff profiles are excluded. |
| GET | `/api/records/maintenance` | Open/closed history, exact reference or saved item-name prefix; optional `itemId` and creation dates. |
| GET | `/api/finance/summary` | Dated receipt totals plus `rental_totals`: saved paid amounts, charges, balances, refund liabilities, and payments needing receipt dates. Rental totals use creation dates; ledger totals use receipt dates. |
| GET | `/api/finance/rentals` | Bounded rental-payment page for `from`/`to`, exact rental-reference `search`, `limit` and cursor. Each row separates charges, saved paid, dated ledger coverage, balance and missing receipt details. |
| POST | `/api/finance/rentals/{id}/receipt-history` | Journal an existing saved payment after staff confirms its original receipt date/time, method, amount and evidence. Changes neither the rental paid amount nor its workflow status. Retry-safe; concurrent duplicate confirmations are rejected. |
| GET | `/api/finance/ledger` | Immutable entries, filtered by day range, `type`, `method` or `rentalId`. |
| POST | `/api/finance/expenses` | Record an expense already paid: retry key, positive amount, cash/QR method, category, notes and QR reference. |
| GET | `/api/reports/daily` | Precomputed charge/count summaries for the selected period; unknown historical charges are flagged. |
| POST | `/api/rentals/{id}/delivery` | `DEPART`, `FAIL` with reason, or `RETURN_TO_SHOP` with exact-unit scan/code and physical condition confirmation. Failed delivery retains custody until actual shop receipt. |
| POST | `/api/rentals/{id}/extension-quote` | Staff quote for additional time, including additional fee and new due time. |
| POST | `/api/rentals/{id}/extension` | Staff-assisted request with `customerRequestedExtension: true`, retry key, additional minutes and accepted quote. |
| POST | `/api/rentals/{id}/extension-review` | Approve/reject the saved request; approval rechecks the next reservation and creates charges/balance without recording money. |
| POST | `/api/mobile/rentals/{id}/extension-quote` | Customer quote for their active rental. |
| POST | `/api/mobile/rentals/{id}/extension` | Customer request after accepting the additional fee; staff review is required. |

List endpoints default to 5 entries with a maximum of 100. Pass `limit` and the returned `nextCursor`; changing a filter requires a fresh cursor. Creation-date filters apply only to known dates; `scheduledDay=YYYY-MM-DD` uses Manila and cannot be combined with creation dates. Exact public references are supported; customer prefixes are normalized, while item-name prefixes retain saved capitalization. Return metadata distinguishes a bounded page from lifetime totals.

`GET /api/workspace?view=Transaction History` also returns `rental_ranking`, computed from all confirmed rentals across physical units, independently of the table cursor, search and status. Optional `rankingFrom` and `rankingTo` filter by Philippine rental-confirmation day; omit both for all time. Counts come from derived equipment summaries, not a download of every rental. `view_meta` identifies the requested workspace view and report dates so clients cannot reuse a paginated history page as a complete analytics dataset. Equal rental counts use equipment name as the tie order in both History and Analytics.

The ledger records in-person cash and manual QR confirmation, without a POS or automatic transfer provider. Historical saved payments appear in Rental payments immediately; their original date must be confirmed before they join dated collections. The confirmation body requires `{requestKey, amount, occurredAt, paymentMethod, reference?, notes, confirmed: true}`. `occurredAt` must include a timezone, be no earlier than rental creation and no later than now; QR requires a reference. This action journals money already recorded as paid and never collects it again. See [the full rules](../architecture/local-planning-and-payments.md) and [OpenAPI](../../packages/api-contracts/openapi/openapi.yaml) for request schemas.
