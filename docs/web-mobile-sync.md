# Web and Android synchronization

Owner settings stay in Supabase through the existing backend adapter. Firebase continues to handle authentication and push only.

Implemented customer behavior:

- Public `/api/mobile/settings` exposes an allowlist of store details. Home and checkout refresh announcements on `settings.changed`, including guest discovery.
- Checkout hides disabled cash, defaults to QR, blocks unconfigured payment methods, uses current rental agreement versions, and validates opening hours. The backend enforces cash and opening hours before reserving stock. Overnight hours work and closing time is exclusive; equal opening/closing means 24-hour service.
- Rental and ticket expiry displays use a server UTC anchor plus monotonic elapsed time. Changing the device clock after synchronization cannot alter a running countdown. Server due dates and fee calculations remain authoritative.
- Current terms, rental agreement, privacy, refund policy and accepted identification come from the owner settings. Failed policy loads expose retry controls instead of allowing submission with an unknown agreement.
- Proofs are compressed locally to JPEG at no more than 300,000 bytes. Duplicate proofs remain flagged for staff review; a verified transfer reference or screenshot cannot be collected again for another rental.
- Notification preference patches merge into the user profile. Disabled push unregisters the device; enabling requests permission and registers it. The dispatcher checks saved preferences before sending.

Implemented staff behavior:

- The Business profile tab displays a live read-only system overview with guidance to use the Web Dashboard for configuration.
- Stock +/- and maintenance/archive actions use the existing version and stock-group concurrency checks. Units in maintenance return to service through the existing inspection checklist; the quick action does not bypass that workflow.
- Customer trust cards count completed rentals, flag active overdue rentals, and distinguish explicit staff physical-ID verification from a customer's acknowledgement.
- Today-at-a-glance reads the finance summary for today's actual cash/QR collections, active units, due/overdue counts and station status. The default finance report contract remains compatible.
- The Bluetooth receipt dialog receives the saved workspace receipt header, address, contact and footer settings.

Additional contracts are recorded in `packages/api-contracts/openapi/openapi.yaml`. No database migration is needed: these settings/preferences use the existing document JSON storage.

Hardware/device verification still requires an Android phone, an MX10 printer and an ESP32 station. Verify a real printed receipt, notification permission changes and background/resume behavior on-device. Network latency determines settings delivery time; the implementation uses immediate SSE invalidation without an artificial polling delay.


## Verification — 2026-11-07

- Backend: `npm test` — 224 passed, 7 integration tests skipped, 0 failed.
- Web: `npm run check` and `npm test` — build/syntax checks passed; 207 tests passed.
- Flutter: 18 focused synchronization, receipt, customer-flow and live-update tests passed. Both checkout and rental-card narrow-screen layout tests passed (20 focused tests total).
- Flutter analysis: no errors; four existing warnings/info findings (unused dashboard color, deprecated animation scale, and two existing Home test helper findings).
- OpenAPI YAML parses successfully, and both working trees pass `git diff --check`.

The full Flutter suite was also exercised. Its earlier run had 75 passes and 10 failures. The customer-flow overflow, narrow-card overflow, and checkout scroll-test ambiguity were subsequently fixed and their focused checks now pass. The broader suite still includes registration validation expectations, Home timeouts, catalog label/search assertions and older rental timeline expectations. The Home timeout was reproduced against the original Home source before these changes; temporary comparison fixtures were removed afterward. These broader UI checks should be updated separately from the synchronization contracts.
