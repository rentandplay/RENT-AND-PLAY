# API Endpoints

Proposal-defined core endpoints:

- POST `/api/rentals`
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

The quote endpoint previews amounts. `POST /api/rentals` independently calculates and saves its authoritative quote inside the reservation transaction. Client-supplied amounts never determine final charges.

Timed blocks round up. The quote chooses the cheapest applicable regular/package price; each started overtime hour uses the product's configured overtime rate. Whole-stay rates end at the resort guest's checkout time. Bikes and tech require a configured deposit and a valid ID; an unset deposit appears as a quote warning for the operator to resolve.

## Implemented handoff and inspection endpoints

- POST `/api/rentals`: active ADMIN session cookie or a Firebase ID token belonging to an active ADMIN profile. Submit `itemId`, `customerId`, `terminalId`, and `durationMinutes`, or `mode: "WHOLE_STAY"` with a timezone-qualified `resortCheckoutAt`. Optional `inspection: {condition, notes, result}` records the authenticated inspector. Returns `{rental, request}`. The backend saves the rate/package components and deposit, and reserves equipment until resolution. A configured high-value deposit is required. Equipment without a rate sheet product uses its current saved per-item rate.
- POST `/api/returns`: same administrator authentication. Submit `rentalId`, `terminalId`, optional `inspection`, optional numeric `penaltyAmount` and `penaltyReason` (required for a positive penalty). Optional `returnedAt` must include a timezone and be between release and server time; omission uses server receipt time. Returns `{request, fee_preview}`. Equipment remains Rented. Blank penalty values remain null and block final confirmation until an inspector explicitly records an amount, including zero.
- PUT `/api/verification-requests/{requestId}/inspection`: same administrator authentication. Submit `condition`, `notes`, `result`, and the current integer `revision`. Return inspections also include numeric `penaltyAmount` and `penaltyReason` when applicable. The server supplies inspector identity and time. Closed requests cannot be edited. Saving increases `inspection_revision`; the terminal must reload the inspected request before confirming.
- GET `/api/workspace`: administrator session. Includes all rental transactions, all verification attempts, immutable condition records, linked maintenance, and safe terminal metadata. The web verification page offers Pending/Confirmed/Rejected/Expired, request-type, terminal, and text filters and paginates all attempts.
- GET `/api/terminals/{terminalId}/pending`: device-only `Authorization: Bearer <device-key>`. Returns `{terminal_id, requests}` with saved quote/return previews and inspection revisions; updates the device heartbeat. Closed attempts never appear here.
- POST `/api/terminals/{terminalId}/confirm`: same device-only authentication. Submit `requestId`, `verificationCode`, `action: "CONFIRM"`, `button: "OK"`, and the displayed `inspectionRevision`. To reject, submit `action: "REJECT"` and a nonblank `reason`. Cookie/mobile authentication does not substitute for a device key. Timestamps and terminal identity come from the backend.

Provision keys with `npm run terminal:register` in `apps/backend`. Only a SHA-256 digest is stored; the random key is displayed once for firmware setup and excluded from web responses. Existing terminal records require provisioning before new handoffs can use them. Use HTTPS in production. Mobile administrator ID tokens can prepare requests; customer-facing mobile authentication is outside the current role model.

Final state changes, condition snapshots, maintenance links, final fees, audit entries, and verification resolution are committed together in a Firestore transaction. Matching retransmissions return `duplicate: true` without applying another update. Mismatched codes/devices/revisions and closed-state actions are rejected. Confirmation at or after the deadline commits expiry and returns HTTP 410.

The backend sweeps expiry at startup and every 15 seconds, plus before workspace/dashboard reads, request creation, equipment quotes, and terminal polling. `VERIFICATION_TTL_SECONDS` defaults to 600 (allowed range 60–1800). Expiry persists its reason and timestamp. Failed rental handoffs release their reservation; failed return handoffs leave equipment Rented and allow another attempt. No external scheduler is required while the backend runs; after downtime, the first sweep closes overdue requests.

Firmware remains a hardware scaffold. Its polling and physical-button integration must use this contract; the web never calls the device confirmation endpoint. Passing web/backend tests does not verify physical device connectivity.
