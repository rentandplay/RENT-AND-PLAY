# API Endpoints

Proposal-defined core endpoints:

- POST `/api/rentals`
- POST `/api/returns`
- GET `/api/terminals/{terminalId}/pending`
- POST `/api/terminals/{terminalId}/confirm`
- PATCH `/api/items/{id}/status` (internal backend update)
- GET `/api/terminals/{terminalId}/status`

Add new endpoints only after agreeing on the API contract.

## Implemented pricing endpoints

These authenticated endpoints use the backend as the pricing source of truth:

- GET `/api/pricing` — return the client rate sheet and rental policies. The initial catalog is supplied from backend defaults until saved to Firestore.
- PUT `/api/pricing` — save edited rates, deposits, overtime, service hours, inclusions, and policy text.
- POST `/api/pricing/quote` — calculate a timed or whole-stay rental quote. Send `productId` or an `itemId` linked to a pricing product, `startAt`, and either `durationMinutes` or `mode: "WHOLE_STAY"` plus `resortCheckoutAt`. Optional `actualReturnAt` adds overtime.

The quote endpoint only calculates and returns amounts; it does not create a rental or collect a deposit. The mobile/ESP32 rental confirmation workflow still needs to call it and save the resulting quote snapshot when that workflow is implemented.

Timed blocks round up. The quote chooses the cheapest applicable regular/package price; each started overtime hour uses the product's configured overtime rate. Whole-stay rates end at the resort guest's checkout time. Bikes and tech require a configured deposit and a valid ID; an unset deposit appears as a quote warning for the operator to resolve.
