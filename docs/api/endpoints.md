# API Endpoints

Proposal-defined core endpoints:

- POST `/api/rentals`
- POST `/api/returns`
- GET `/api/terminals/{terminalId}/pending`
- POST `/api/terminals/{terminalId}/confirm`
- PATCH `/api/items/{id}/status` (internal backend update)
- GET `/api/terminals/{terminalId}/status`

Add new endpoints only after agreeing on the API contract.
