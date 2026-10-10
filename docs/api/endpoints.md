# API Endpoints

## Database availability errors

Firestore quota exhaustion returns HTTP `429` with `{error, code: "FIRESTORE_QUOTA_EXCEEDED", retryAfterSeconds}` and a `Retry-After` header. During the five-minute cooldown, further database requests fail without consuming more reads. Device clients should honor that header when polling. Logout and password-reset do not require Firestore access and remain available.

Temporary database failures return HTTP `503` with code `FIREBASE_UNAVAILABLE`; invalid server configuration or credentials use `FIREBASE_CONFIGURATION_ERROR`. `GET /api/health` returns HTTP `200` with `database: false`, the matching `code`, `warning`, and `retryAfterSeconds` when the database is unavailable. A healthy response includes `database: true`.

## Core endpoints

- GET `/api/mobile/admin-workspace` — active OPERATOR/OWNER account that has completed its temporary-password change. Returns the staff workspace, dashboard summary, and inventory view in one response; used by the Android staff app. `Cache-Control: no-cache` requests an explicit fresh snapshot.
- GET `/api/analytics` — active OPERATOR/OWNER account. Returns only rental and catalog summary metrics. The Android report uses this cached summary instead of opening whole-collection realtime listeners.

## Account security

Canonical roles are `OWNER`, `OPERATOR`, and `CUSTOMER`; old `SUPER_ADMIN`, `ADMIN`, and `USER` values remain compatible. See [account procedures and validation](../architecture/account-access.md).

- POST `/api/auth/email-check` — public, rate limited. `{email}` validates syntax, lowercase normalization, and the ability of the domain to receive mail. Whitespace is rejected; company/school domains are allowed. Invalid domains return `400 INVALID_EMAIL_DOMAIN`; temporary DNS errors return `503`.
- POST `/api/auth/login` — `{email, password, remember?}` checks email format without DNS/domain validation, creates a staff session, and returns a canonical user with `mustChangePassword`.
- POST `/api/auth/password-reset` — public, rate limited. `{email}` checks format without DNS/domain validation, requests a Firebase reset link, and returns the recipient plus generic instructions without revealing whether the account exists. Service failures are reported.
- GET `/api/auth/me` — staff cookie or Firebase token; includes `mustChangePassword`.
- POST `/api/auth/change-password` — active staff, rate limited. `{currentPassword, newPassword, confirmPassword, remember?}` requires a different password with 8–128 characters, an uppercase letter, a number, and matching confirmation. Verifies the current identity, revokes prior sessions, and clears `must_change_password`. Web receives a fresh cookie or `signInAgain: true`; mobile signs in again.
- POST `/api/users` — Owner only. `{fullName, email, role, passwordMode, password?, confirmPassword?}` creates `OWNER` or `OPERATOR` with email format validation and no DNS/domain check. `passwordMode` is `generated` (emailed using backend SMTP) or `manual` (matching password fields required). Returns `mustChangePassword` and `credentialsEmailSent`, never the password. Generated-email failure rolls back account creation.

Other staff endpoints return `403 PASSWORD_CHANGE_REQUIRED` while the account's temporary-password flag is set.

## Mobile registration and email verification

- POST `/api/mobile/registration/email-code` — public JSON `{email}`. Sends a six-digit code that expires after 10 minutes. Requests are limited to one email and source address; each email can request at most five codes per 15 minutes and must wait 30 seconds between sends. The response does not reveal whether the address already has an account.
- POST `/api/mobile/registration/verify-email-code` — public JSON `{email, code}`. Checks a six-digit code with at most five guesses and returns a short-lived `verificationToken` on success.
- POST `/api/mobile/registration/complete` — Firebase bearer token plus `{email, verificationToken, name, phone}`. The email must match the authenticated Firebase account; the backend marks that address verified and creates its customer profile only after the proof is accepted. Names are limited to letters and common name punctuation, and phone numbers must normalize to a Philippine mobile number.

The backend sends mail over Gmail SMTP using `SMTP_USER`, `SMTP_PASSWORD`, and `REGISTRATION_OTP_PEPPER`. The Firestore index configuration enables TTL cleanup for expired OTP records; deploy it with `firebase deploy --only firestore:indexes`.

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

- POST `/api/customer-accounts` — active Owner/Operator session. Create a Firebase email/password account for a mobile customer and linked `users/{uid}` (`CUSTOMER`) and `customers/{uid}` profiles. Requires a valid full name, unique customer code, valid email format without a DNS/domain check, Philippine mobile number, an 8–128 character password with an uppercase letter and number, and matching confirmation. Address is optional. The password is never written to Firestore. Mobile rental requests use this signed-in customer identity and still require staff approval before equipment is released.
- PATCH `/api/customers/{id}` — update customer details or archive/restore a customer. Archived customers stay in the directory and retain their rental history.
- PATCH `/api/customers/{id}/password` — active Owner/Operator session. Change the password for a linked mobile customer account with matching `newPassword` and `confirmNewPassword` values (8–128 characters, uppercase letter, number). The password is sent only to Firebase Authentication and is never written to Firestore or audit logs.
- DELETE `/api/customers/{id}` — active administrator session. Permanently delete an archived customer with the current `version` (`updated_at`, or `created_at` for legacy records). Customers with active or pending rentals cannot be deleted. Completed rental records and audit logs remain; a linked mobile account is removed too.

Timed blocks round up. The quote chooses the cheapest applicable regular/package price; each started overtime hour uses the product's configured overtime rate. Whole-stay rates end at the resort guest's checkout time. Customers pay the rental fee shown in the quote; new rentals do not have a deposit.

## Customer rental request, payment, delivery, and return

All staff routes accept an active Owner/Operator web session or a Firebase ID token for an active Owner/Operator profile. Staff manage customer records; each customer can view only their own rental records and handoff QR. Staff identity and physical timestamps come from the server.

- GET `/api/mobile/catalog`: public actual inventory IDs, configured public pricing and availability, QR labels, and Firebase project ID. Equipment without configured rental rates is hidden from customers and retained in admin inventory. Configured held units show reserved.
- POST `/api/mobile/catalog/resolve`: public `{code}` lookup of a unique actual equipment QR, item code, or ID.
- GET/POST/PATCH `/api/mobile/profile`: verified Firebase identity; bootstrap/read/edit own regular CUSTOMER profile and terms acceptance. Staff profiles include `mustChangePassword`. Payload cannot change role, UID, active status, or login email.
- POST `/api/mobile/quote`: authenticated `{itemId, durationMinutes}` returns `{quote}` with rental fee, package components and billed duration. This is an estimate; the duration starts on physical release.
- GET `/api/mobile/payment-instructions`: authenticated customer returns the owner's InstaPay QR, account name/number, and instructions, or null QR fields if the owner has not configured one.
- POST `/api/mobile/rentals`: customer `{itemId, durationMinutes, requestKey, paymentMethod, deliveryLocation, expectedQuote?}` creates `PENDING_ADMIN_APPROVAL` and a hold. Payment method is `CASH` or `QR`. `expectedQuote` contains numeric `rentalFee` and `billedMinutes`; changed amounts are rejected. QR requests also require `paymentProof: {imageDataUrl, reference?}` with a valid PNG/JPEG screenshot up to 350 KB, and the owner must have configured an InstaPay QR.
- POST `/api/mobile/rentals/{rentalId}/payment-proof`: customer may replace the screenshot only after an operator rejects the current proof. The request is `{imageDataUrl, reference?}` and is accepted only while the request is open and its hold has not expired.
- POST `/api/rental-bookings`: admin `{itemId, customerId, requestKey, paymentMethod?, deliveryLocation?, durationMinutes}` creates an `APPROVED` counter rental. Alternative: `mode: "WHOLE_STAY"` and timezone-qualified `resortCheckoutAt`. No terminal ID is required.
- PATCH `/api/settings/payment`: owner-only. Saves `{imageDataUrl?, accountName, accountNumber, instructions}` for the customer InstaPay payment display. PNG/JPEG QR images are limited to 250 KB. Removing the QR disables QR checkout until a new QR is saved.
- GET `/api/mobile/rentals` and `/api/mobile/rentals/{rentalId}`: the authenticated customer's own rental records, canonical fields, UTC ISO times, current status, physical receipt, saved charges, and balance/refund amounts.
- GET `/api/mobile/rentals/{rentalId}/ticket`: customer-only for their own rental; returns `{ticket}` containing the customer rental handoff QR `value`, `image_data_url`, rental ID/code, status, and review/handoff deadline.
- POST `/api/mobile/rentals/{rentalId}/review`: admin `{action: "APPROVE", paymentVerified?, notes?}` approves a cash rental request without starting a timer. QR requests cannot be approved here until payment proof is verified. `{action: "REJECT", reason}` closes the hold and retains any payment/refund liability.
- POST `/api/rentals/{rentalId}/payment-review`: admin `{action: "VERIFY", notes?}` reviews the customer's saved screenshot, records the exact rental fee as paid, and approves the request. `{action: "REJECT", reason}` leaves the request open for a replacement screenshot.
- GET `/api/rentals/{rentalId}/payment-proof`: admin-only view of the latest customer screenshot and reference.
- POST `/api/mobile/rentals/{rentalId}/cancel`: customer cancels a pending or approved rental before handoff. Frees only its own reservation and retains recorded refund liability.
- POST `/api/rentals/lookup`: admin `{kind: "BOOKING" | "INVENTORY", code}` returns `{rental, item}`. `BOOKING` accepts the customer rental QR or rental code; `INVENTORY` identifies the unique active or inspection-pending borrower of the physical unit.
- POST `/api/rentals/{rentalId}/assignment`: admin `{inventoryCode, reason}` swaps an approved booking to an available unit with the same product and saved price. Both holds update atomically.
- POST `/api/rentals/{rentalId}/prepare-delivery`: admin `{inventoryCode, manualReason?}` scans the exact assigned equipment QR at the shop and records it as prepared for delivery. This leaves the equipment reserved and does not start the timer. Changing the assigned unit clears preparation.
- POST `/api/rentals/{rentalId}/release-verification`: admin read-only preflight `{transactionCode, manualReason?}` verifies the customer's rental handoff QR after the unit is prepared. It returns `{booking_verified, inventory_verified, delivery_prepared, rental, item}`; the item QR is checked earlier during preparation. This does not start the timer or record a release.
- POST `/api/rentals/{rentalId}/release`: admin `{requestKey, transactionCode, customerVerified: true, paymentVerified, inspection, manualReason?}` confirms the customer rental QR at the selected delivery location. The saved equipment preparation and reservation are rechecked atomically. Cash balances must be collected and verified at handoff unless already recorded; verified QR proof is already recorded as paid. Saves the handoff inspection, starts the timer at server time, and changes rental to `ACTIVE`, item to `RENTED`.
- POST `/api/mobile/rentals/{rentalId}/return`: customer reports condition/notes for an active mobile rental. The unit remains rented and the timer runs until staff physically receives it.
- POST `/api/rentals/{rentalId}/receipt`: admin `{requestKey, inventoryCode, physicalReceiptConfirmed: true, manualReason?}` records the actual physical receipt instant, stops overtime, and sets rental `RETURN_PENDING_INSPECTION`, item `UNDER_INSPECTION`.
- POST `/api/rentals/{rentalId}/complete-return`: admin `{requestKey, inspection, penaltyAmount, penaltyReason?}` after physical receipt. Explicit numeric penalty is required, including zero. Positive penalties need a reason. Original rates and saved receipt time determine fees. Cleared items become available; damage/inspection-required results create maintenance.
- POST `/api/mobile/rentals/{rentalId}/return/review`: compatibility route. `action: "APPROVE"` delegates to complete-return and requires the same key/inspection/penalty after receipt. `action: "REJECT", reason` rejects an outstanding customer request while the rental stays active.
- POST `/api/rentals/{rentalId}/settlement`: admin `{requestKey, paymentAmount?, rentalRefundAmount?, notes}` records additional rental collection or a refund of rental payments. Each numeric amount defaults to zero; at least one must be positive. Available only after completion or booking closure. Amounts cannot exceed rental balances or recorded rental payments. Legacy deposit settlement fields are retained only for historical records.
- GET `/api/rental-inspection-photos/{photoId}`: admin-only saved inspection image. Photos are omitted from catalog/owner lists and loaded separately.
- GET `/api/workspace`: admin records, rental transactions, inspections, maintenance, pricing, audit history and safe terminal metadata.

`inspection` is `{condition, result, notes, accessoriesChecked: true, photos?}`. Condition is GOOD/FAIR/DAMAGED/NEEDS_INSPECTION, result AVAILABLE/UNDER_MAINTENANCE, notes required (maximum 2000 characters). Release must be GOOD or FAIR with AVAILABLE result. Return damage or inspection-needed results require maintenance. `photos` accepts at most two valid JPEG data URLs, each up to 150000 characters. Inspector and timestamps are server supplied.

Creation, handoff, receipt, completion and settlement require `requestKey`, exactly 32 lowercase hex characters. Preserve it for retries of the same operation. Identical retries return the saved record with `duplicate: true`; changed details under that key return 409. A manual lookup requires a nonblank `manualReason` plus the exact rental/equipment ID or printed code; a QR scan uses actual QR tokens.

Customer review holds default to 900 seconds, approved requests have 1800 seconds to be prepared, and shop-prepared deliveries have 7200 seconds to reach the customer. Configure `RENTAL_REQUEST_HOLD_SECONDS`, `RENTAL_PICKUP_HOLD_SECONDS`, and `RENTAL_DELIVERY_HOLD_SECONDS` (60–86400 seconds). Startup/30-second and request-time sweeps expire holds, audit the reason, and release only their own pointers. Mutation transactions recheck deadlines and availability. Rental/physical-item changes, inspections, fees, and audit entries commit atomically.

Current customer checkout supports rent-now durations. Future date scheduling is not implemented. InstaPay payment is manual: the app displays the owner QR and a staff member verifies the uploaded screenshot; no online gateway charge is made. See [the rental flow](../architecture/admin-rental-flow.md).

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

## ESP32 terminal on standby

Keep `ENABLE_ESP32=false`, the default. The ESP32 terminal tab and existing records/firmware remain present. Legacy `POST /api/rentals`, `POST /api/returns`, `GET /api/terminals/{id}/pending` and `POST /api/terminals/{id}/confirm` return 409 standby and cannot change the current rent flow.

The retained device contract is for later hardware work: separately provisioned device credentials, assigned verification request/code, physical OK/reject action, deadline and displayed inspection revision. Provisioning uses `npm run terminal:register`; only the key digest is stored and credentials never appear in web responses. Legacy `PUT /api/verification-requests/{id}/inspection` edits a pending draft with revision checking and does not release or receive equipment.

Legacy attempts retain `VERIFICATION_TTL_SECONDS=600` (60–1800 seconds). Their expiry and history remain supported. Hardware must be integrated and physically validated before enabling terminal endpoints.
