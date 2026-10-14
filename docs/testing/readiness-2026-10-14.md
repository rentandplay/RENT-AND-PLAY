# Web and Android readiness check — 14 October 2026

The later [walk-in flow verification](walk-in-2026-10-14.md) adds staff-assisted rentals. [Bluetooth receipt verification](bluetooth-receipt-2026-10-14.md) covers receipt printing. [The latest system audit](system-audit-2026-10-14.md) reports current test totals, fixes and Android build/device status. Device-install evidence below describes the earlier build tested that day.

The current rental flow uses the shared backend without ESP32. The local backend was restarted with `ENABLE_ESP32=false`. Terminal polling and confirmation return HTTP 409 with a standby message. Firmware, device contracts, terminal history and isolated hardware tests remain available for the final project phase.

## Audit gaps resolved

- The Android staff workspace now includes maintenance history. Staff can report an exact physical unit, assign work, set a target date/priority, add resized photos and repair costs, start repair, send for inspection, fail inspection, complete all three checks or retire an unsafe unit. Web and Android use the same saved ticket reference and revision. Only the affected unit leaves available stock; closed ticket corrections preserve rental inspection evidence.
- Android Equipment refresh updates the displayed route snapshot after maintenance rather than retaining the original list. Ticket and unit details load fresh data; stale ticket revisions require a refresh before another save.
- Equipment → Start maintenance now displays the issue form immediately. The selected unit is checked through its inventory endpoint while staff choices load in parallel, replacing two consecutive whole-workspace reloads. Draft text survives loading/retry, closing the form prevents a delayed reopen, and saving waits for current availability and revision checks.
- Maintenance ticket details now show a loading state at once; delayed responses cannot reopen a closed dialog or replace a newer dialog. Closing a form while a save finishes refreshes saved data without forcing the user back into that form. Android repair actions skip the staff-list request unless assignment controls are needed, and a failed required metadata read keeps Save disabled until retry succeeds.
- Successful customer checkout opens My Rentals using the same API client. Current checkout tests accept the actual rental agreement before submitting; a dedicated customer/staff test covers successful checkout and confirmed approval with the same rental reference and an unstarted rental timer.
- Physically received rentals show the return stage. Return-request headings/badges and staff overdue labels are consistent. Overdue notices distinguish an ordinary overdue rental from a customer-requested return.
- Web price summaries label missing/invalid billed duration as unavailable. Current rental fees exclude deposits; obsolete deposit expectations were corrected while keeping tests for saved charges, unknown legacy data, authorization, inspections and retries.
- Flutter lint findings were fixed. Maintenance API paths, exact-unit fields, revision guards, photo limits and public references are documented in the shared OpenAPI contract. The current acceptance plan uses staff desk actions, with physical ESP32 checks reserved for later.

## Verification

| Check | Result |
| --- | --- |
| Backend suite with local Firestore emulator | 165 passed; 0 failed; no skips, including all three database integration tests |
| Web suite | 157 passed; 0 failed; no skips, including delayed dialog, close, and retry checks |
| Android suite | 48 passed; 0 failed, including metadata failure/retry and maintenance flow checks |
| Flutter analyzer | No issues found |
| Web syntax and static build | Passed |
| API contract | Valid YAML; 41 paths and all 46 local references resolve |
| Real Firebase | Authentication and Firestore read-only connectivity succeeded for `rent-and-play` |
| Restarted backend | Health HTTP 200, database healthy, project `rent-and-play` |
| Web API proxy | Catalog HTTP 200; 14 equipment groups, all with available stock at check time |
| ESP32 | Live poll and confirmation HTTP 409; regression verifies no rental is created/finalized while disabled |
| Connected Android phone | Read-only integration test passed: Firebase project, live catalog, equipment code/group resolution and terminal standby |
| Android APK | Debug build succeeded; normal updated app installed successfully on the connected phone after the test build |

The HTTP integration uses an isolated database and the real production service wrappers, including cache invalidation: customer token → saved request → Android staff bearer approval → web workspace → preparation and customer rental QR handoff → customer return request → web receipt and inspection → released stock. It asserts the public rental reference stays the same, the timer starts only at handoff, and customer credentials cannot approve or release rentals. Web approval tests additionally cover duplicate submits, retry after a connection error and success when a later refresh fails. Android widget tests exercise the actual checkout, staff confirmation and maintenance forms without writing fake transactions into the live Firebase project.

The full backend run also used the cached Firestore emulator at `127.0.0.1:8092` with `FIREBASE_PROJECT_ID=demo-rent-and-play`. The database integration tests verified generated equipment IDs and preserved QR/rate history, concurrent confirmation commits, and the current customer request → Android/web staff approval → physical handoff → receipt → completed return with shared references and restored stock. No fake rentals were added to the real Firebase project.

The 390-pixel Android maintenance preview uses isolated ticket data and the app's theme. It is a widget rendering, not a screenshot from a connected phone.

## Android delivery and remaining device/provider checks

The phone reconnected and `AndroidFiles/integration_test/local_connection_test.dart` passed on device `d6fe682` (CPH2375). It checked the actual shared Firebase project, catalog and equipment-code/group resolution and ESP32 standby. The normal app was then installed successfully over the temporary test build. Its APK is `AndroidFiles/build/app/outputs/flutter-apk/app-local-debug.apk`, built with `http://192.168.1.4:3000/api`. Keep the laptop backend running and both devices on the same network; a changed laptop address requires rebuilding the local APK. The current Android build succeeds, with a Gradle forward-compatibility warning because `mobile_scanner` still applies the Kotlin Gradle Plugin; review the plugin or Flutter migration before a future Flutter upgrade.

The in-app browser reached the web sign-in page. Authenticated Equipment and maintenance clicks were not exercised in that browser session; the web rendering, handlers, API flow, routes, build and syntax are covered by automated checks above. Real camera permission/printed QR scans, Bluetooth printer output, background FCM delivery and password-reset mail delivery still require their physical devices/providers. ESP32 hardware acceptance is deliberately postponed.

## Cleanup retained

Eleven unused Android screens/services/models and the unused Realtime Database dependency were removed, along with their unused provider wiring. Three obsolete stub documents were removed from the web repository. Active REST services, current safety/regression scenarios, historical rental records and all ESP32 firmware/contracts remain.

Use [the current acceptance plan](test-plan.md) for the physical walkthrough and [the ESP32 standby plan](../esp32/standby-plan.md) for later hardware integration.
