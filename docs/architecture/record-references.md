# Shared record references

Public references are saved on the backend and read by both web and Android. Clients must display the saved field rather than shortening a Firestore document ID. Rental history shows only the public rental reference.

| Record | Field | Example |
| --- | --- | --- |
| Rental | `rental_code` | `R-0001` |
| Verification request | `request_code` | `V-0001` |
| Equipment | `item_code` | `EQUIP-001` |
| Customer | `customer_code` | `CUST-001` |
| Account | `account_code` | `USER-001` |
| Terminal | `terminal_code` | `TERM-001` |
| Maintenance | `maintenance_code` | `M-0001` |
| Rate | `rate_code` | `RATE-001` |
| Category | `category_code` | `CAT-001` |
| Condition inspection | `condition_code` | `COND-0001` |
| Equipment status history | `history_code` | `HIST-0001` |
| Audit record | `audit_code` | `A-0001` |

Counters allocate references transactionally, including when a rental and a verification request are created together. References expand beyond their initial padding as needed. Existing readable equipment, customer and terminal codes remain valid.

Firestore document IDs, authentication UIDs, linked record IDs and QR tokens remain unchanged. Internal legacy `booking_...` keys are still used in API requests and idempotency checks. Legacy rental references are retained in `legacy_rental_code` and remain accepted by manual lookup. Printed QR labels encode the original backend QR token, while their caption shows the public reference. Rental ticket validation checks that the ticket identifies the exact requested rental.

Run `npm run record-codes:migrate` from `apps/backend` to preview record counts. Run `npm run record-codes:migrate -- --apply` to assign missing or obsolete public references in the configured Firebase project. The migration changes reference metadata only; it preserves status, QR tokens, relationships and business timestamps. Existing records were normalized on October 13, 2026. API reads also normalize references for records added through older clients.

Regression checks: `node --test tests/record-codes.test.mjs` in both backend and web, and `flutter test test/record_codes_test.dart` in the adjacent Android project.
