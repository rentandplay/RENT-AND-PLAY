# Data Dictionary

## Pricing configuration

`settings/pricing` is the saved business rate sheet. When the document is absent, the backend supplies client-sheet defaults. Invalid saved values raise an error instead of silently changing quoted prices.

- `products[]`: stable `id`, display `name`, group, included items, high-value flag, refundable `deposit_amount`, `overtime_rate_per_hour`, optional new-product `sale_price`, and `rate_options[]`.
- `rate_options[]`: stable option `id`, display label, amount in PHP, duration in minutes, and billing kind (`SHORT`, `HOURLY`, `PACKAGE`, `BLOCK`, or `WHOLE_STAY`). Whole-stay options use the resort guest's checkout time as their due time.
- `rules`: daily opening and closing time, valid-ID requirement, high-value deposit requirement, lost board-game piece fee, booking phone/channel, overtime and after-hours return guidance, whole-stay definition, bike safety, care/damage, and return reminders.
- `updated_at`, `updated_by`: last save timestamp and workspace user ID.

Each physical `items/{id}` record may include `pricing_product_id`, which connects its QR label to a product in the rate sheet. Existing `item_rates` remain in place for legacy per-item rates and pricing history.

## Quote rules

- Each started rental block is charged in full. Hourly rates round up to the next full hour; five-hour card/game rates round up to the next five-hour block.
- A package is considered once the requested duration reaches its covered number of hourly blocks; the lowest applicable package/hourly amount is used.
- Overtime adds one configured product rate for every started hour after the due time. Returns after closing are accepted when service reopens; overtime continues until return.
- Whole-stay board-game rentals are due at the resort guest's checkout. The quote reports valid-ID and refundable-deposit requirements; a zero high-value deposit generates a setup warning.
- The ₱50 lost-piece fee is configured for board games, matching the note under the board-games section of the client sheet.

## Existing operational records

Other collections and fields are documented in [the backend README](../../apps/backend/README.md).

## Account roles

`users/{uid}.role` identifies one account type: `USER` is a customer mobile account, `ADMIN` is an operator account for daily rental operations, and `OWNER` is the super admin account for staff and shared business settings. Each account uses its own Firebase Auth UID. Configure backend `SUPER_ADMIN_UID` with the initial owner's Firebase UID; on that account's first successful login, the backend creates its active `OWNER` profile if one is missing and treats any existing profile for the configured UID as `OWNER`.

## Saved rental inspections and charges

- Rental stages: `PENDING_ADMIN_APPROVAL`, `APPROVED`, `ACTIVE`, `RETURN_PENDING_INSPECTION`, `COMPLETED`, `CANCELLED`, `REJECTED`, `EXPIRED`. Physical status remains `AVAILABLE` with a hold before release, then `RENTED`, `UNDER_INSPECTION`, and finally `AVAILABLE` or `UNDER_MAINTENANCE`. ESP32 verification history remains separate and hardware endpoints default disabled.
- Rental fields: `rental_code`, assigned `item_id`/`item_code`, customer rental `booking_qr_token`, `hold_expires_at`, `booking_mode`, and `admin_review`. `delivery_status` is `NOT_PREPARED`, `PREPARED`, or `HANDED_OFF`; `delivery_preparation` records the shop equipment scan and operator. `start_at`, `due_at` and `confirmed_rental_at` are null until the operator confirms physical handoff at the selected location. Customer rental QR tokens are separate from equipment QR tokens.
- QR payment fields: `payment_proof_status` (`NOT_REQUIRED`, `PENDING_REVIEW`, `VERIFIED`, or `REJECTED`), optional `payment_proof_reference`, `payment_proof_note`, and `payment_proof_revision`. `rental_payment_proofs/{rentalId}` stores the latest screenshot, transfer reference, customer ID, review status/note, operator, amount, and timestamps. The screenshot is available only on staff payment review routes, not customer rental list responses.
- Business payment settings: `settings/business.instapay_qr_data_url`, `instapay_account_name`, `instapay_account_number`, and `instapay_instructions` are owner-managed and returned to authenticated customer checkout.
- Physical receipt: server `received_at`/`received_by` and `receipt_verification` stop overtime before inspection. `confirmed_return_at`/`confirmed_return_by` record inspection completion. Fees use receipt time rather than the inspection delay.
- Payment fields: `rental_paid_amount`, `deposit_collected_amount`, `deposit_applied_amount`, `deposit_refunded_amount`, `rental_refunded_amount`, `balance_due`, `refund_due`, `deposit_remaining`, `payment_status`. Recorded payments survive hold cancellation/expiry; equipment availability does not clear money owed.
- `rental_settlements/{rentalId_requestKey}`: immutable actual payment/deposit deduction/refund amounts, notes, admin ID, time, and retry key. A repeated identical movement returns the existing record.
- `item_condition_photos/{id}`: admin-only JPEG data URL, rental/item IDs, RELEASE/RETURN phase, creator and time. Inspection snapshots contain `photo_ids` and `accessories_checked`; photos are loaded separately to keep list responses small.
- `rentals/{id}`: item/customer IDs, lifecycle status, rental/deposit amounts, due/confirmation/actual-return times; `rental_request_id`, `latest_return_request_id/status/reason`, confirming terminal IDs, and `final_reason`.
- `fee_breakdown`: pricing snapshot saved at reservation. Includes version/source (`RATE_SHEET` or `ITEM_RATE`), product/rate IDs, package label and kind, component units/prices/totals, requested/billed minutes, start/due times, PHP base fee, refundable deposit, overtime unit/rate, saved grace period and lost-piece fee. A valid return appends actual return time, overtime units/amount, explicit penalty/reason, final rental charges, and finalization time. Pricing edits never replace the original snapshot.
- `release_condition`, `return_condition`: condition, notes, inspector ID/name and time, result (`AVAILABLE` or `UNDER_MAINTENANCE`), terminal ID/code, confirmation time, and immutable record ID. Repair changes current inventory condition without rewriting these snapshots.
- `item_condition_records/{id}`: append-only confirmation records with rental/item/request IDs, phase (`RELEASE` or `RETURN`), and inspection snapshot. Pending inspections remain drafts on their requests until trusted confirmation.
- `maintenance_records/{id}`: damaged/inspection-required returns add `rental_id`, `verification_request_id`, `condition_record_id`, `inspection_notes`, and `inspected_by`. Repair notes remain in `details`; original inspection notes are retained.
- `items/{id}.reserved_rental_id`: reservation pointer. Item state stays AVAILABLE while dashboard/inventory derive Pending from its open rental. Confirmation clears the pointer and sets RENTED; expiry/rejection releases it without changing another rental's state.

Rate-sheet overtime bills each started hour. Per-item HOURLY and FLAT late rates bill each started hour; per-item DAILY late rates bill each started day. Refundable deposits are excluded from final rental charges. Rental requests do not accept final fee values from the client.

Legacy data is shown without inventing history. Absent penalty, overtime, package, duration, or inspection fields are labelled not recorded. Returning a legacy rental saves its new inspection and explicit penalty while unprovable overtime/final charges remain unknown; current rates cannot backfill an old agreement.

## Rental notification records

- `notification_inboxes/{staff|customer_UID}` stores an opaque revision for efficient polling.
- `notification_inboxes/{inbox}/messages/{notificationId}` stores event type, title, message, rental ID/code, item name, page, creation timestamp and a `read_by` map of authenticated account IDs to read timestamps. Customer messages are scoped by UID; staff read markers are per administrator.
- `notification_outbox/{notificationId}` stores audience, customer UID where applicable, message snapshot, event/rental IDs, status (`PENDING`, `RETRY`, `SENT`, `FAILED`), attempt count, retry timestamp, lease, delivery timestamp and error code. Created atomically with the rental event.
- `notification_devices/{SHA256_token}` stores the private FCM token, owner UID, audience, platform and update timestamp. It is backend-only and never part of a workspace response.

See [notification flow](../architecture/rental-notifications.md) for recipients and Android setup.

## Complete verification records

`verification_requests/{id}` stores rental/item IDs, request type, assigned terminal ID/code snapshot, verification code, status, requested/deadline/confirmed/rejected/expired times, final/rejection reason, authenticated requested-by ID, pending inspection, and increasing inspection revision. Confirmed records store confirming terminal ID/code and condition-record ID; rejected records store resolving terminal ID/code. Expiry is audited as SYSTEM.

`terminals/{id}.auth_token_hash` is the SHA-256 digest of a separately provisioned random credential. The web receives only `credentials_configured`; credential fields are excluded from workspace/dashboard responses. Device ID, active state, credential, verification code, deadline, lifecycle state, and displayed inspection revision are checked before finalizing a handoff.
