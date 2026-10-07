# Customer rental and delivery flow

The Android customer app, Android admin app, web admin, and backend use the same rental records. The owner configures the payment QR in web **Settings → Business → InstaPay QR**. Operators can prepare and hand off rentals from either admin client. The ESP32 remains on standby and is not required for this flow.

## Rental stages

| Rental stage | Equipment state | Meaning |
| --- | --- | --- |
| PENDING_ADMIN_APPROVAL | Reserved for the customer | Cash request awaits approval, or QR payment screenshot awaits review |
| APPROVED | Reserved for the customer | Payment is verified or will be collected at handoff; equipment still needs shop preparation |
| APPROVED + PREPARED | Reserved for the customer | Operator scanned the assigned equipment QR at the shop; item can be delivered |
| ACTIVE | RENTED | Operator scanned the customer's rental QR at the selected resort and confirmed handoff; timer is running |
| RETURN_PENDING_INSPECTION | UNDER_INSPECTION | Staff physically received the item; timer has stopped and inspection remains |
| COMPLETED | AVAILABLE or UNDER_MAINTENANCE | Return inspection is done; financial settlement remains tracked separately |
| CANCELLED / REJECTED / EXPIRED | Original hold is released | Any recorded payment remains visible for refund or settlement |

## Customer and operator steps

1. **Configure payment:** The owner saves the InstaPay QR image, account name/number, and customer instructions. The QR is available in mobile checkout. QR checkout is hidden until the owner configures it.
2. **Request a rental:** The customer selects equipment, duration, delivery resort/location, and Cash or InstaPay QR. The backend calculates the rental fee and refundable deposit. For QR, the app shows the configured owner QR and exact total; the customer confirms a successful transfer, enters an optional reference, uploads a PNG/JPEG screenshot, and submits the request. Cash requests do not need a screenshot.
3. **Review payment and request:** The operator can approve a cash request, then collect the rental fee and deposit at handoff. For QR, the operator reviews the screenshot against the saved total. Verifying the proof records payment and approves the request. Rejecting it leaves the hold open for a corrected screenshot; the customer can upload again. The review hold expires after 15 minutes by default.
4. **Prepare at the shop:** After approval, the operator scans the assigned equipment's printed QR at the shop. The server confirms it is the exact reserved unit and marks it prepared for delivery. This step does not change the equipment to rented and does not start the timer. If the assigned unit is changed, preparation is cleared and the replacement must be scanned.
5. **Deliver and hand off at the resort:** The operator takes the prepared item to the selected location. At handoff, the customer shows the rental handoff QR from **My Rentals**. The operator scans that customer-specific QR, confirms customer identity, payment/deposit, condition, and included accessories, then confirms handoff. The server rechecks the reservation and starts the timer at that moment. The operator does not need to scan the equipment QR again at the resort.
6. **Receive and inspect:** When the equipment physically returns to the operator, staff scans the equipment QR and confirms receipt. The server records the receipt time and stops overtime then, before inspection. Staff records condition, accessories, notes, photos, and an explicit penalty (zero if none).
7. **Settle:** Staff records additional money collected, deposit deductions, and refunds actually paid. Outstanding balances and refundable amounts stay independent of equipment availability.

## Holds, security, and recovery

Customer review holds last 15 minutes by default (`RENTAL_REQUEST_HOLD_SECONDS=900`). An approved request has 30 minutes to be prepared (`RENTAL_PICKUP_HOLD_SECONDS=1800`); after the equipment QR is scanned at the shop, the delivery window resets to 2 hours (`RENTAL_DELIVERY_HOLD_SECONDS=7200`) so the operator has time to reach the selected resort. Each setting accepts 60–86400 seconds. A startup/30-second sweep and mutation-time checks expire holds and release only the matching unit reservation.

Rental creation, handoff, receipt, inspection completion, and settlement use stable 32-character lowercase hexadecimal `requestKey` values. Retries return the saved operation without creating another rental, restarting the timer, or recording a duplicate payment/refund. Payment proof images are restricted to valid PNG/JPEG files up to 350 KB. Owner payment QR images are restricted to valid PNG/JPEG files up to 250 KB. Admin payment review, equipment preparation, handoff, inspections, and money movements are audited.

Changing an approved rental's assigned unit requires an available unit of the same product and saved price; both reservation pointers update atomically and previous preparation is cleared. A released unit cannot be silently reassigned.

Legacy active rentals can still be received and inspected. Missing historical pricing/payment receipts remain unknown; current rates are not used to invent old fees.

## Current scope

The system supports rentals that start at physical handoff, not future calendar reservations. Android checkout supports duration-based rentals; web and Android admin counter rentals can also use whole-stay board-game pricing with a resort checkout. InstaPay handling is manual: the app displays the owner's QR and the owner verifies the uploaded screenshot. No payment gateway processes the transfer.

Camera scanning needs Android permission or a browser camera on HTTPS/localhost. Manual lookup with a reason is available when a camera is unavailable. Deploy the backend and web app, configure the owner's payment QR, then rebuild the Android app before using the flow against the hosted API. See [deployment instructions](../deployment/render-mobile-integration.md) and [endpoint details](../api/endpoints.md).
