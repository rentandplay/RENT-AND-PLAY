# Shared API Contracts

Keep the agreed request/response shapes here so Web, Mobile, Backend, and ESP32
do not invent different field names or statuses.

The implemented shapes are in `openapi/openapi.yaml` and the operational procedures are in `docs/api/endpoints.md`. Web uses its staff session cookie; Android uses a Firebase bearer token. Both use saved public references such as `R-0001`, `M-0001` and `EQUIP-001`, while internal document IDs remain API identifiers. QR tokens come from the backend and must not be rebuilt from display codes.

Current rentals use customer request, staff approval, equipment preparation, physical handoff, receipt and inspection. Maintenance is an exact-unit workflow with shared revision checks and authenticated photos. ESP32 contracts and firmware are retained for the end of the project; hardware endpoints return a standby response while `ENABLE_ESP32=false`.
