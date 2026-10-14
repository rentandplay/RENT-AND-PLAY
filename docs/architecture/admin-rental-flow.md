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
2. **Request a rental:** The customer selects equipment, duration, delivery resort/location, and Cash or InstaPay QR. The backend calculates the rental fee, with no deposit. For QR, the app shows the configured owner QR and exact rental fee; the customer confirms a successful transfer, enters an optional reference, uploads a PNG/JPEG screenshot, and submits the request. Cash requests do not need a screenshot.
3. **Review payment and request:** The operator can approve a cash request, then collect the rental fee at handoff. For QR, the operator reviews the screenshot against the saved rental fee. Verifying the proof records payment and approves the request. Rejecting it leaves the hold open for a corrected screenshot; the customer can upload again. The review hold expires after 15 minutes by default.
4. **Prepare at the shop:** After approval, the operator scans the assigned equipment's printed QR at the shop. The server confirms it is the exact reserved unit and marks it prepared for delivery. This step does not change the equipment to rented and does not start the timer. If the assigned unit is changed, preparation is cleared and the replacement must be scanned.
5. **Deliver and hand off at the resort:** The operator takes the prepared item to the selected location. At handoff, the customer shows the rental handoff QR from **My Rentals**. The operator scans that customer-specific QR, confirms customer identity and rental payment, checks condition and included accessories, then confirms handoff. The server rechecks the reservation and starts the timer at that moment. The operator does not need to scan the equipment QR again at the resort.
6. **Receive and inspect:** When the equipment physically returns to the operator, staff scans the equipment QR and confirms receipt. The server records the receipt time and stops overtime then, before inspection. Staff records condition, accessories, notes, photos, and an explicit penalty (zero if none).
7. **Settle:** Staff records additional rental payment or refunds of rental payments actually paid. Outstanding balances stay independent of equipment availability. Existing historical records may retain legacy deposit data.

## Holds, security, and recovery

Customer review holds last 15 minutes by default (`RENTAL_REQUEST_HOLD_SECONDS=900`). An approved request has 30 minutes to be prepared (`RENTAL_PICKUP_HOLD_SECONDS=1800`); after the equipment QR is scanned at the shop, the delivery window resets to 2 hours (`RENTAL_DELIVERY_HOLD_SECONDS=7200`) so the operator has time to reach the selected resort. Each setting accepts 60–86400 seconds. A startup/60-second sweep and mutation-time checks expire holds and release only the matching unit reservation.

Rental creation, handoff, receipt, inspection completion, and settlement use stable 32-character lowercase hexadecimal `requestKey` values. Retries return the saved operation without creating another rental, restarting the timer, or recording a duplicate payment/refund. Payment proof images are restricted to valid PNG/JPEG files up to 350 KB. Owner payment QR images are restricted to valid PNG/JPEG files up to 250 KB. Admin payment review, equipment preparation, handoff, inspections, and money movements are audited.

Changing an approved rental's assigned unit requires an available unit of the same product and saved price; both reservation pointers update atomically and previous preparation is cleared. A released unit cannot be silently reassigned.

Legacy active rentals can still be received and inspected. Missing historical pricing/payment receipts remain unknown; current rates are not used to invent old fees.

## Walk-in rentals at the Lakewoods establishment

Rent & Play operates from its own establishment in Lakewoods Subdivision, Los Baños, Laguna. It is not inside a resort. Walk-in customers can receive equipment at the establishment or ask staff to deliver it to their resort.

1. Staff selects **Create walk-in rental** in web or Android Rentals, searches name/code/contact, and reuses an active customer profile. A new profile requires a name and Philippine mobile number; email, address and app login are optional. Matching name + normalized phone or matching email returns the existing-profile error, including archived profiles. Different people may share a family contact number. Profile creation uses a retry key and transactional identity locks.
2. Staff selects an available physical unit, duration, payment method and **shop handover** or **resort delivery**. Resort delivery requires the resort/address/instructions. Web also supports whole-stay pricing for suitable products, with a fixed resort checkout. The server freezes the quote, assigns the shared public R-reference, and reserves the unit in APPROVED; no timer or received payment is invented.
3. Staff scans the exact assigned unit at the shop (or uses a logged printed-code fallback). Changing units clears preparation. Prepared shop rentals display ready for shop handover; delivery rentals remain awaiting handover at the resort.
4. For a staff-assisted rental, the admin verifies the saved public rental reference instead of requiring a customer phone/app. This uses the existing audited manual-reference verification and never skips exact-unit preparation. Staff separately confirms customer identity, actual payment, customer acknowledgement of duration/total/late fees/return inspection, and condition/accessories. The backend requires these checks, records staff-witnessed terms and starts the timer only at physical handover. Staff-created rentals do not need another admin approval.
5. Staff can print/save the rental receipt from rental details on web or Android after handover. It includes the saved public reference, unit, customer contact, location, start/due times and saved payments/late rates. It does not expose internal IDs or secret QR tokens. No customer app is needed for returns: staff scans the actual equipment at physical receipt, which stops the clock but leaves the unit under inspection. Inspection then completes the rental and sends damaged units to maintenance. Final balances and refunds remain separate audited money movements.
6. Web Customers can add app access to an existing walk-in profile later. Firebase Auth uses that exact customer ID; the customer code and every existing rental stay linked, and signing in on Android reads the same history. Account agreement acceptance remains the customer's own action at first app use.

Existing customer-app requests and legacy counter rentals keep their existing QR handover path. Walk-in fields are accepted only on staff-created rentals, with `request_source=WALK_IN`, `rental_channel=WALK_IN`, and `fulfillment_mode=SHOP_HANDOVER|DELIVERY`. ESP32 remains on standby.

## Current scope

Customers and staff can rent now or reserve a future date/time. Availability covers the full planned period with a ten-minute return/inspection allowance; the rental timer starts only at physical handoff. Android checkout supports duration-based rentals, while staff walk-in rentals can also use whole-stay board-game pricing with a resort checkout. Delivery stays within Lakewood Subdivision, Los Baños, Laguna. Staff can track preparation, the short trip, delivery or an unsuccessful attempt, and assist a consenting customer with an extension that cannot overlap the next reservation.

Cash is received in person and QR receipts are manually verified. The shared ledger records actual receipts, refunds and paid expenses separately from assessed charges. Daily summaries and historical lists use precomputed totals and bounded backend queries. See [local planning and payments](local-planning-and-payments.md) for deadlines, custody, extension and financial rules.

Camera scanning needs Android permission or a browser camera on HTTPS/localhost. Manual lookup with a reason is available when a camera is unavailable. For local use, start the backend and web server, configure the owner's payment QR, then run Android with its local API address. See the [local integration guide](../development/local-integration.md) and [endpoint details](../api/endpoints.md).
