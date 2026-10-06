# Web page and feature audit

Date: 6 October 2026 (Asia/Manila)

All 12 workspace pages were reviewed in the browser against an isolated local API using synthetic records. The API exercised the actual inventory, workspace, pricing, profile, and transaction services with an in-memory Firestore adapter. Authentication and email delivery used local substitutes. No production records or accounts were changed.

## Page coverage

| Page | Coverage |
| --- | --- |
| Dashboard | Live statistics, due/overdue records, navigation actions, rental details, chart periods, notifications and account navigation. |
| Equipment | Add equipment, search/filter and card/table views, equipment details, maintenance start/completion, QR label preparation and PNG download action. Authenticated API tests cover rate history, stale updates, archive/restore, deletion restrictions and category restrictions. |
| Customers | Add/edit, search, record details and rental history. Existing tests cover directory filters, sorting, pagination and archive/restore behavior. |
| Rates & Fees | Timed and whole-stay quote previews, Philippine-time dates, saved service hours, catalog save, current per-item rate prefill and decimal rate updates. |
| Rentals | Eligible equipment/customer/terminal choices, release inspection, saved pricing and request confirmation. Device API confirmation changes the rental to Active and the item to Rented. |
| Returns | Return inspection, required penalty reason, saved fees, duplicate pending-return exclusion and terminal confirmation. A damaged return creates linked maintenance and retains inspection history. |
| Transaction History | Saved charges, condition snapshots, all verification attempts, filters, pagination and filtered CSV export. Cancelled and unconfirmed requests are excluded from popularity counts. |
| Maintenance | Search by equipment and repair/inspection notes, in-progress-first ordering, pagination and linked rental details. |
| ESP32 / Verification | Queue/history, status/type/terminal filters, terminal details, inspection records and status refresh inside an open handoff dialog. Local device confirmations exercised both rental and return paths. |
| Reports | Report sections, category/equipment/custom-date filters, invalid-range guards, service metrics, audit records and CSV export action. Automated tests verify calculations and complete CSV contents. |
| Settings | Business draft discard/save, appearance switch, saved preferences and reload persistence, account information, user-management view and admin-form validation. |
| Profile | View/edit/save, account identity, read-only role and consistent light/dark rendering. |

## Fixes and usability changes

- Direct links and trailing-slash URLs resolve to the correct page; signing in preserves the requested page.
- Protected API failures end an expired session cleanly and clear cached workspace data.
- Failed initial page loads offer an explicit retry. Manual and automatic refresh failures retain the last successful records, label them as stale and restore the Refresh button. Dashboard connection updates preserve workspace-specific outage notices.
- Quote and resort-checkout inputs consistently use Asia/Manila rather than the browser's timezone; invalid calendar dates are rejected.
- Rental forms exclude reserved/archived equipment and archived customers. Return forms exclude rentals already awaiting return confirmation and provide useful empty-state actions.
- Successful writes remain successful when the subsequent reload fails, avoiding misleading errors and repeated submissions.
- Open pending handoff dialogs can check the current terminal status and update automatically when the browser's refresh preference is enabled. A late status response cannot overwrite an inspection form.
- Rate editing retains saved service hours and pre-fills the selected equipment's existing rate, deposit and late penalty.
- Due-today and already-overdue rentals have consistent separate counts.
- Shared page headings, clearer guidance, readable controls/tables, dark-mode profile surfaces, keyboard focus, a skip link and a mobile drawer focus loop improve navigation.
- Customer tables stay inside their scroll container. Compact headers truncate safely instead of widening the page. Phone table scrolling remains available.
- Production builds include every new browser module. Existing user changes to the return-queue heading layout were preserved.

## Validation

- Web: `npm run check`, `npm test` and `npm run build`.
- Web tests: **88 passed**, no failures or skips. The static-server test covers every page route in development and production and follows browser module imports.
- Backend: `npm test`: **49 passed**, **2 skipped**. The skipped tests require the Firebase emulator.
- Browser widths: **320, 390, 768 and 1440 pixels**. All 12 pages were checked; compact-phone overflow was corrected and retested against the document's actual content width.
- Both appearance modes, mobile drawer Tab/Shift+Tab/Escape behavior and full rental/return device API transitions were checked.
- The final desktop route sweep reported no browser console errors. Signing out cleared the workspace and returned to an empty sign-in form.
- Synthetic initial, manual-refresh and automatic-refresh workspace outages were tested in the browser; retry and recovery retained usable records.
- An invalidated local session returned to sign-in with a clear message.

## Remaining external validation

### Live Firestore quota finding — 6 October 2026

The configured service-account file exists and matches `rent-and-play`. Authenticated read-only checks against the real Firestore project returned HTTP `429 RESOURCE_EXHAUSTED: Quota exceeded.` The updated diagnostic also reported SDK error `8 RESOURCE_EXHAUSTED: Quota exceeded.` This is a confirmed live usage-limit failure; successful local tests do not imply that cloud inventory is currently accessible.

The backend now distinguishes quota, configuration, and temporary connection errors; quotas provide a five-minute HTTP/worker cooldown. Display models share 60-second query snapshots and invalidate after writes, while authorization and quote/transaction checks stay authoritative. Concurrent dashboard/workspace/inventory loads require 15 queries in the fixture (14 unique display queries and one shared expiry sweep), and unchanged repeat loads reuse their snapshots. Device polling avoids completed request history and throttles heartbeat writes.

Regression tests cover read coalescing, cache invalidation after saved equipment, disabled-account and quote checks, stale in-flight snapshots, quota cooldown/recovery, outage diagnostics, logout/password-reset during quota failures, and terminal heartbeat behavior. A real temporary API server returned `database: false` with `FIRESTORE_QUOTA_EXCEEDED` on health and a quota-specific HTTP `429` on inventory, and was stopped afterward. Restoring live access requires resolving the exhausted limit in Firebase Usage, such as waiting for a free daily-quota reset or enabling billing when applicable. See [backend recovery guidance](../../apps/backend/README.md#firebase-usage-and-quota-recovery).

The actual Firebase Authentication/Firestore deployment, password-reset email delivery, physical ESP32 button/scanner, and MX10 Bluetooth connection and printed label quality require their real services or devices. Device confirmations here were simulated through the authenticated local device API. Browser download controls were exercised; downloaded file contents are covered by unit tests where available, while the in-app browser did not expose a reliable download-file capture.

Use the existing [test plan](test-plan.md) and [device flow](../esp32/device-flow.md) for those final hardware and deployment checks.
