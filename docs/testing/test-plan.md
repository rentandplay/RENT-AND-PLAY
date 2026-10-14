# Current web and Android acceptance plan

ESP32 stays on standby (`ENABLE_ESP32=false`). Customer requests and staff approval, preparation, handoff, receipt and inspection use the shared backend. Firmware and hardware contracts remain available for the end-of-project integration in [the standby plan](../esp32/standby-plan.md).

## Automated checks

- Backend: run `npm test` in `apps/backend`. HTTP integration covers customer Firebase tokens, web staff cookies, Android staff tokens, authorization, shared rental references, approval, exact-unit QR preparation, handoff, return and stock release. Concurrent/idempotent mutations, expired holds, payment snapshots, maintenance revisions, photos and bad scans have separate regression coverage.
- Database integration: run that suite with `FIRESTORE_EMULATOR_HOST` pointing to a local Firestore emulator and `FIREBASE_PROJECT_ID=demo-rent-and-play`. This enables the inventory, concurrent confirmation and customer/staff integration tests; they skip when no emulator is configured. Use the emulator's isolated demo project rather than the live database.
- Web: run `npm test`, `npm run check`, and `npm run build` in `apps/web`. Covers grouped stock, pricing, analytics, QR decoding, rental/return actions, inspection and maintenance rendering and interaction handlers.
- Android: run `flutter analyze` and `flutter test`. Customer/staff widget tests exercise terms acceptance, successful checkout navigation and confirmed request approval. Maintenance tests cover an exact-unit report, mandatory final checks, explicit zero cost, closed records, stale revisions and a 390-pixel layout.
- Connected Android: run `flutter test -d <device-id> integration_test/local_connection_test.dart --dart-define=API_BASE_URL=http://<laptop-ip>:3000/api`. This read-only check verifies the real Firebase project, reachable catalog, equipment code resolution and terminal standby. It does not create production records or send notifications.

## Physical rental acceptance

1. Start backend and web. Open `/api/health`; verify database health and the same Firebase project configured in Android. Use the laptop's reachable IP for the phone.
2. Sign in as a customer. Choose available equipment, duration, delivery location and Cash; accept the rental agreement and send one request. Verify one saved rental reference in My Rentals and the staff request queue on both clients. A retry must preserve that request rather than reserve another unit.
3. Sign in as active Operator/Owner. Approve that exact request on either staff client. Refresh the other client and customer app; verify the same reference and APPROVED status. The timer must remain stopped.
4. At the shop, scan the assigned equipment QR. Verify only that reserved unit becomes prepared. A wrong unit must be rejected. For unavailable cameras, use supported manual lookup and record the required reason.
5. At the selected location, scan the customer's rental QR. Confirm identity, actual rental payment, condition and accessories. Verify ACTIVE on both clients and a timer beginning at physical handoff. A repeated confirmation must not restart it.
6. Request a return. Verify staff sees the request but the timer continues until actual receipt. Scan the equipment QR and confirm physical receipt; verify the saved receipt time stops overtime and the unit awaits inspection.
7. Record condition, accessories, notes/photos and an explicit penalty (zero if none), then complete inspection. Good/Fair equipment returns to Available. Damaged equipment creates a linked maintenance ticket for that exact unit. Saved prices and receipt time remain unchanged after rate edits or retries.
8. For InstaPay, first configure the owner's payment QR. Upload a screenshot, review the proof on a staff client, and check payment/approval synchronization. Correct a rejected proof using the same request. Verify balances and refunds independently of equipment availability.
9. Test cancelled, rejected and expired requests. Verify only matching reservations are freed and their history/reasons remain visible. Inactive accounts, customer tokens on staff actions, wrong QR values and stale inspections must be rejected.

## Maintenance acceptance on both clients

1. With three units of one equipment type, report an issue for one available unit. Verify one grouped row with two available units; the affected unit keeps its ID and QR. Rented/reserved units follow physical return inspection instead of bypassing rental ownership.
2. Open the same maintenance reference on web and Android. Start repair, record work, priority, assignment, target date, photos and costs. Check changes appear on a fresh read in the other client.
3. Send for final inspection. Completion requires function, safety and completeness checks plus Good/Fair condition. Failed inspection stays unavailable. Blank cost remains unknown; zero explicitly records no cost.
4. Confirm final inspection or retire an unsafe unit. Verify correct available/total stock, preserved work history and unchanged rental inspection evidence. A closed ticket cannot repeat repair or availability transitions. An outdated revision must ask for a refresh.

## Later hardware acceptance

Keep the terminal credential, code/revision, duplicate, expiry and device-authorization tests. Run physical ESP32 polling/button/display checks during the planned hardware integration; they are not required for today's customer or staff flow. Camera scans, Bluetooth label printing and background FCM delivery also require their actual device/provider acceptance checks.
