# API Endpoints

## Database availability errors

Firestore quota exhaustion returns HTTP `429` with `{error, code: "FIRESTORE_QUOTA_EXCEEDED", retryAfterSeconds}` and a `Retry-After` header. During the five-minute cooldown, further database requests fail without consuming more reads. Device clients should honor that header when polling. Logout and password-reset do not require Firestore access and remain available.

Temporary database failures return HTTP `503` with code `FIREBASE_UNAVAILABLE`; invalid server configuration or credentials use `FIREBASE_CONFIGURATION_ERROR`. `GET /api/health` returns HTTP `200` with `database: false`, the matching `code`, `warning`, and `retryAfterSeconds` when the database is unavailable. A healthy response includes `database: true`.

## Core endpoints

The current rental desk uses the booking/release/receipt endpoints described below. These legacy/proposal endpoints remain documented:

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
- PUT `/api/pricing` — save edited rates, deposits, overtime, service hours, inclusions, and policy text.
- POST `/api/pricing/quote` — calculate a timed or whole-stay rental quote. Send `productId` or an `itemId` linked to a pricing product, `startAt`, and either `durationMinutes` or `mode: "WHOLE_STAY"` plus `resortCheckoutAt`. Optional `actualReturnAt` adds overtime.

The quote endpoint previews amounts. `POST /api/mobile/rentals` and `POST /api/rental-bookings` independently calculate and saves its authoritative quote inside the reservation transaction. Client-supplied amounts never determine final charges.

## Customer accounts

- POST `/api/customer-accounts` — active administrator session. Create a Firebase email/password account for a mobile customer and linked `users/{uid}` (`USER`) and `customers/{uid}` profiles. Requires full name, unique customer code, email, a 12–128 character password, and matching password confirmation. Phone and address are optional. The password is never written to Firestore. Mobile rental requests use this signed-in customer identity and still require admin approval before equipment is released.
- PATCH `/api/customers/{id}` — update customer details or archive/restore a customer. Archived customers stay in the directory and retain their rental history.
- PATCH `/api/customers/{id}/password` — active administrator session. Change the password for a linked mobile customer account with matching `newPassword` and `confirmNewPassword` values (12–128 characters). The password is sent only to Firebase Authentication and is never written to Firestore or audit logs.
- DELETE `/api/customers/{id}` — active administrator session. Permanently delete an archived customer with the current `version` (`updated_at`, or `created_at` for legacy records). Customers with active or pending rentals cannot be deleted. Completed rental records and audit logs remain; a linked mobile account is removed too.

Timed blocks round up. The quote chooses the cheapest applicable regular/package price; each started overtime hour uses the product's configured overtime rate. Whole-stay rates end at the resort guest's checkout time. Bikes and tech require a configured deposit and a valid ID; an unset deposit appears as a quote warning for the operator to resolve.

## Admin-confirmed booking, release, and return

All staff routes accept an active ADMIN web session or a Firebase ID token for an active ADMIN profile. Customer records and tickets are owner-only. Admin identity and physical timestamps come from the server.

- GET `/api/mobile/catalog`: public actual inventory IDs, configured public pricing and availability, QR labels, and Firebase project ID. Equipment without configured rates or required deposits is hidden from customers and retained in admin inventory. Configured held units show reserved.
- POST `/api/mobile/catalog/resolve`: public `{code}` lookup of a unique actual equipment QR, item code, or ID.
- GET/POST/PATCH `/api/mobile/profile`: verified Firebase identity; bootstrap/read/edit own regular USER profile and terms acceptance. Payload cannot change role, UID, active status, or login email.
- POST `/api/mobile/quote`: authenticated `{itemId, durationMinutes}` returns `{quote}` with fee, deposit, package components and billed duration. This is an estimate; the duration starts on physical release.
- POST `/api/mobile/rentals`: customer `{itemId, durationMinutes, requestKey, paymentMethod, deliveryLocation, expectedQuote?}` creates `PENDING_ADMIN_APPROVAL` and a hold. Payment method is `CASH` or `QR`. `expectedQuote` contains numeric `rentalFee`, `depositAmount`, and `billedMinutes`; changed amounts are rejected.
- POST `/api/rental-bookings`: admin `{itemId, customerId, requestKey, paymentMethod?, deliveryLocation?, durationMinutes}` creates an `APPROVED` counter booking. Alternative: `mode: "WHOLE_STAY"` and timezone-qualified `resortCheckoutAt`. No terminal ID is required.
- GET `/api/mobile/rentals` and `/api/mobile/rentals/{rentalId}`: owner's records, canonical fields, UTC ISO times, current status, physical receipt, saved charges, and balance/refund amounts.
- GET `/api/mobile/rentals/{rentalId}/ticket`: owner-only `{ticket}` containing the transaction QR `value`, `image_data_url`, booking ID/code, status, and pickup/review deadline.
- POST `/api/mobile/rentals/{rentalId}/review`: admin `{action: "APPROVE", paymentVerified?, depositReceived?, notes?}` moves a pending booking to `APPROVED` without starting a timer. Payment/deposit booleans record actual receipt and may be omitted until pickup. `{action: "REJECT", reason}` closes the hold and retains refund liability.
- POST `/api/mobile/rentals/{rentalId}/cancel`: owner cancels a pending or approved booking before release. Frees only its own reservation and retains recorded refunds.
- POST `/api/rentals/lookup`: admin `{kind: "BOOKING" | "INVENTORY", code}` returns `{rental, item}`. Booking lookup accepts transaction QR or booking code; inventory lookup identifies the unique active or inspection-pending borrower of the physical unit.
- POST `/api/rentals/{rentalId}/assignment`: admin `{inventoryCode, reason}` swaps an approved booking to an available unit with the same product and saved price. Both holds update atomically.
- POST `/api/rentals/{rentalId}/release-verification`: admin read-only preflight `{transactionCode, inventoryCode?, manualReason?}`. First verify the customer transaction QR to unlock the equipment scanner; then send both codes to verify the exact assigned physical unit. Returns `{booking_verified, inventory_verified, rental, item}`. Rejects mismatched, unavailable, unapproved, or expired bookings without starting the timer or recording a release. Printed codes require a manual reason.
- POST `/api/rentals/{rentalId}/release`: admin `{requestKey, transactionCode, inventoryCode, customerVerified: true, paymentVerified, depositReceived, inspection, manualReason?}`. The transaction and inventory QR must match this booking and physical unit. Actual base fee and required deposit must be collected now or previously recorded. Saves the official condition and starts the timer; rental `ACTIVE`, item `RENTED`.
- POST `/api/mobile/rentals/{rentalId}/return`: owner reports condition/notes for an active mobile rental. The unit remains rented and the timer runs until staff physically receives it.
- POST `/api/rentals/{rentalId}/receipt`: admin `{requestKey, inventoryCode, physicalReceiptConfirmed: true, manualReason?}` records the actual physical receipt instant, stops overtime, and sets rental `RETURN_PENDING_INSPECTION`, item `UNDER_INSPECTION`.
- POST `/api/rentals/{rentalId}/complete-return`: admin `{requestKey, inspection, penaltyAmount, penaltyReason?}` after physical receipt. Explicit numeric penalty is required, including zero. Positive penalties need a reason. Original rates and saved receipt time determine fees. Cleared items become available; damage/inspection-required results create maintenance.
- POST `/api/mobile/rentals/{rentalId}/return/review`: compatibility route. `action: "APPROVE"` delegates to complete-return and requires the same key/inspection/penalty after receipt. `action: "REJECT", reason` rejects an outstanding customer request while the rental stays active.
- POST `/api/rentals/{rentalId}/settlement`: admin `{requestKey, paymentAmount?, depositAppliedAmount?, depositRefundAmount?, rentalRefundAmount?, notes}` records additional actual collection/deduction/refunds. Each numeric amount defaults to zero; at least one must be positive. Available only after completion or booking closure. Amounts cannot exceed balances or recorded refundable payments.
- GET `/api/rental-inspection-photos/{photoId}`: admin-only saved inspection image. Photos are omitted from catalog/owner lists and loaded separately.
- GET `/api/workspace`: admin records, rental transactions, inspections, maintenance, pricing, audit history and safe terminal metadata.

`inspection` is `{condition, result, notes, accessoriesChecked: true, photos?}`. Condition is GOOD/FAIR/DAMAGED/NEEDS_INSPECTION, result AVAILABLE/UNDER_MAINTENANCE, notes required (maximum 2000 characters). Release must be GOOD or FAIR with AVAILABLE result. Return damage or inspection-needed results require maintenance. `photos` accepts at most two valid JPEG data URLs, each up to 150000 characters. Inspector and timestamps are server supplied.

Creation, release, receipt, completion and settlement require `requestKey`, exactly 32 lowercase hex characters. Preserve it for retries of the same operation. Identical retries return the saved record with `duplicate: true`; changed details under that key return 409. A manual lookup requires a nonblank `manualReason` plus exact matching booking/item IDs or printed codes; a QR scan uses actual QR tokens.

Approval holds default to 900 seconds and pickup holds to 1800 seconds. Configure `RENTAL_REQUEST_HOLD_SECONDS`/`RENTAL_PICKUP_HOLD_SECONDS` (60–86400 seconds). Startup/30-second and request-time sweeps expire holds, audit the reason, and release only their own pointers. Mutation transactions recheck deadlines and availability. Rental/physical-item changes, inspections, fees, and audit entries commit atomically.

Current customer checkout supports rent-now durations. Future date scheduling is not implemented. Staff payment verification records actual cash/QR collection; there is no online gateway charge. See [the rental flow](../architecture/admin-rental-flow.md).

## Rental notifications

These routes accept the web admin session cookie or an active Android account's Firebase bearer token. The backend chooses the recipient inbox from the authenticated profile.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/notifications` | Latest 60 inbox entries, loaded unread count, audience, revision and next cursor. `before` loads older entries. `since` returns `{unchanged: true, revision}` when unchanged. |
| POST | `/api/notifications/read` | `{ids: [...]}` marks up to 60 owned inbox entries read for the current account. |
| POST | `/api/notifications/device` | `{token: "..."}` registers an Android FCM token for the signed-in account. |
| DELETE | `/api/notifications/device` | `{token: "..."}` removes only a device owned by the current account. |

Booking and return events persist inbox entries atomically with their rental changes. Push is asynchronous and retryable. See [notification flow](../architecture/rental-notifications.md).

## ESP32 terminal on standby

Keep `ENABLE_ESP32=false`, the default. The ESP32 terminal tab and existing records/firmware remain present. Legacy `POST /api/rentals`, `POST /api/returns`, `GET /api/terminals/{id}/pending` and `POST /api/terminals/{id}/confirm` return 409 standby and cannot change the current rent flow.

The retained device contract is for later hardware work: separately provisioned device credentials, assigned verification request/code, physical OK/reject action, deadline and displayed inspection revision. Provisioning uses `npm run terminal:register`; only the key digest is stored and credentials never appear in web responses. Legacy `PUT /api/verification-requests/{id}/inspection` edits a pending draft with revision checking and does not release or receive equipment.

Legacy attempts retain `VERIFICATION_TTL_SECONDS=600` (60–1800 seconds). Their expiry and history remain supported. Hardware must be integrated and physically validated before enabling terminal endpoints.
