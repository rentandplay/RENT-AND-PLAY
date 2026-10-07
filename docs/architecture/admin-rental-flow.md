# Admin-confirmed rental flow

The customer Android app, Android admin, and web admin use the same trusted API and Firebase records. The **ESP32 terminal** stays in both admin interfaces on standby. `ENABLE_ESP32=false` is the backend default and Android hardware actions are disabled; current bookings, releases, and returns do not need a terminal.

## Stages

| Rental stage | Physical equipment | What happens next |
| --- | --- | --- |
| PENDING_ADMIN_APPROVAL | Available physically, held for this booking | Admin approves or rejects the customer request |
| APPROVED | Held; shown as reserved in the customer catalog | Customer presents the transaction QR; admin verifies pickup |
| ACTIVE | RENTED | Timer runs from the server's physical release time |
| RETURN_PENDING_INSPECTION | UNDER_INSPECTION | Physical receipt has stopped the timer; admin checks the unit |
| COMPLETED | AVAILABLE or UNDER_MAINTENANCE | Cleared units can be rented again; payment/refund records remain separate |
| CANCELLED / REJECTED / EXPIRED | Own hold is released | Recorded prepayments/deposits remain refundable |

1. **Register units:** Each physical unit has its own inventory record, equipment code, and inventory QR sticker. Link the unit to a configured rate product or item rate. Prices and deposits come from the backend.
2. **Book:** The customer chooses a unit and duration, reviews the authoritative fee and refundable deposit, and submits one request. A database transaction prevents another customer from taking the same unit. The app displays a separate transaction QR for that booking.
3. **Approve:** Admin reviews the request on Android or web. Approval reserves pickup time but does not start the rental timer. Payment and deposit checkboxes record amounts already received; leave them unchecked if collection will happen at pickup.
4. **Release:** The web desk first verifies the customer's transaction QR with the server; the equipment scanner stays hidden and disabled until it matches the selected booking. Next, scan the assigned unit's inventory QR. The server rejects another product or another physical unit, and changing either code or the manual verification reason resets the dependent checks. After both codes match, verify the customer, collect the required fee/deposit, check condition and accessories, and optionally take photos. Confirm Release rechecks both codes and the reservation atomically, marks the equipment rented, and starts the saved billing duration at server time. A whole-stay booking keeps its agreed resort checkout deadline.
5. **Receive:** Scan the returned unit and explicitly confirm physical receipt. The backend identifies its active borrower, records the receipt time, stops overtime at that time, and places the unit under inspection. A customer return request alone does not stop the timer.
6. **Inspect:** Record condition, accessories, notes, optional photos, and an explicit damage/missing-part penalty (zero if none). Overtime uses the original rate snapshot and physical receipt time. Cleared equipment becomes available; damaged or inspection-required equipment creates a linked maintenance job.
7. **Settle:** Record additional money collected, deposit applied to charges, and refunds actually paid. Outstanding balances and refundable amounts remain visible independently of equipment availability.

## Holds and recovery

Customer review holds last 15 minutes by default (`RENTAL_REQUEST_HOLD_SECONDS=900`). Approved pickup holds last 30 minutes (`RENTAL_PICKUP_HOLD_SECONDS=1800`). Either setting accepts 60–86400 seconds. A startup/30-second sweep and checks before mutations persist expiry and release only the expired booking's own hold. Owners can cancel before release, including an approved booking.

Creation, release, receipt, completion, and settlement use stable 32-character lowercase hexadecimal `requestKey` values. Retries return the saved result without creating another booking, restarting the timer, or refunding twice. Changed details with a reused key are rejected. Manual QR fallback requires matching printed codes and a recorded reason. Admin identity, timestamps, condition records, and money movements are audited by the backend.

An approved booking can move to another available physical unit only if its product and saved pricing match. The backend swaps both hold pointers atomically. A released unit cannot be silently reassigned.

Legacy active rentals can be physically received and inspected without hardware. Missing historical pricing/payment receipts remain unknown; the system does not use today's prices to invent old overtime or payment balances. Their physical return can clear the unit while financial history stays marked not recorded.

## Current scope

Booking decisions and return progress also create durable customer/admin inbox updates and optional Android phone alerts. See [notification recipients and setup](rental-notifications.md).

This version supports rentals starting when staff releases equipment. It does not implement a calendar of future date reservations. Web counter bookings also support whole-stay board-game packages with a fixed resort checkout. Android customer checkout currently uses duration-based rentals. Payment selection and verification record actual collection; they do not charge an online payment gateway.

Camera scanning needs Android permission or a browser camera on HTTPS/localhost. The web includes its QR decoder locally. Manual lookup with a reason is available when a camera is unavailable. Test real printed stickers and Android cameras on the actual devices before shop use.

## Acceptance check

Use disposable test equipment/customer records in a development database. Submit a booking from Android, verify it appears pending on web, approve it, and check that no timer starts. Present the transaction QR and scan the assigned unit; a different unit must be rejected. Release from either admin client and verify both clients show the same start/due time. Record physical receipt, wait before finishing inspection, and confirm that the wait adds no overtime. Complete a good return and verify the unit is available. Repeat with damage and verify maintenance. Check expiry/cancellation, a repeated submission, and a deposit refund. Keep the ESP32 terminal visible and confirm that no step requires it.

Deploy the updated backend/web before using a rebuilt Android app against the hosted API. See [deployment instructions](../deployment/render-mobile-integration.md) and [endpoint details](../api/endpoints.md).
