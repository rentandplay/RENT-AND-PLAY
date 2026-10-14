# System and staff scanner audit — 14 October 2026

The web, Android app and backend use one rental lifecycle and the same saved rental references, physical-unit codes, QR tokens and maintenance records. ESP32 remains on standby. This report supersedes the totals and APK details in the earlier readiness, walk-in and Bluetooth receipt reports.

## Fixes made in this audit

- **Equipment scans can prepare approved rentals.** Inventory lookup previously searched only active and inspection-pending rentals, although Android offered preparation after an approved-unit scan. The backend now resolves a unique approved reservation too. Pending review, wrong units and ambiguous rentals remain rejected.
- **Resort delivery stays delivery.** Android checkout no longer converts ASRI Hotspring Resort into a Rent & Play pickup address or tells the customer to collect equipment there. Customer requests require a nonblank delivery location and save `fulfillment_mode=DELIVERY`. Shop handover remains an explicit staff-assisted walk-in option at Rent & Play, Lakewoods Subdivision, Los Baños, Laguna.
- **Customer tickets preserve fulfillment.** The rental model reads, saves and copies the fulfillment mode. Approved/prepared labels distinguish delivery from shop handover; tickets and My Rentals show the saved resort/address or the actual Lakewoods shop location. Legacy shop records remain readable.
- **Staff camera operations recover safely.** One camera session serializes start, stop, foreground changes, torch/switch requests and disposal. Duplicate detections return one token. Camera-stop errors cannot discard a successful scan. A denied permission can be retried after the user allows access; a retained scanner-plugin error previously prevented restart. Camera failures show retry/manual-code guidance, and unavailable controls stay disabled.
- **Group lookup also preserves physical identity.** Public equipment lookup keeps the catalog group ID and returns `scanned_unit_id`/`scanned_unit_code` for the exact label. Two units with the same label are rejected even within one stock group. Group-only lookup does not invent a scanned unit. Existing IDs and QR labels are preserved.
- **The catalog diagnostic counts groups correctly.** Its previous comparison treated the two additional Bicycle units as equipment without rates. The corrected live audit found 16 active physical units in 14 configured equipment groups, with matching group IDs and stock counts and no groups hidden for missing rates. All three Bicycle labels belong to one group.
- **Obsolete mobile screens were removed.** The standalone customer scanner and old analytics screen had no production imports or routes. Customers use Browse and My Rentals; the active Owner/Operator scanner handles physical preparation, handover, receipt and inspection. Scanner regressions exercise those actual staff routes. Detailed reporting stays in the web workspace.
- **Web guidance matches the current workflow.** Rental dialogs now describe staff preparation/handover and Returns inspection instead of requiring a physical terminal button. Account documentation no longer reports already-resolved deposit test failures. API documentation and the acceptance plan reflect delivery and exact-unit scan behavior.

## Owner/Operator mobile scope

The mobile staff counter supports review/approval and payment proof review, staff-assisted walk-in customer profiles and rentals, shop handover or resort delivery, exact-unit preparation, customer rental QR verification, physical handover, return receipt and inspection, settlement, receipts, equipment browsing/QR labels and unit maintenance. The timer begins at physical handover and stops at physical receipt; inspection separately determines availability.

Web provides detailed inventory setup, rates, reports and staff/business settings. Operator and Owner share operational permissions. Only Owner can manage privileged staff accounts and protected business/payment settings. Inactive staff, customer credentials and accounts requiring their first password change cannot bypass these backend checks.

## Verification

| Check | Result |
| --- | --- |
| Backend full suite with isolated Firestore emulator | 174 passed; 0 failed; 0 skipped |
| Web full suite | 164 passed; 0 failed |
| Android full suite | 68 passed; 0 failed |
| Flutter analyzer | No issues found |
| Staff scanner regressions, included above | 7 checks: permission retry, duplicate frames/native stop failure, lifecycle/control recovery and four actual rental stages |
| Account security follow-up, included in backend count | 8 passed; explicitly covers web cookies and mobile bearer tokens for Operator/Owner/customer access, temporary password restrictions and inactive staff |
| Web syntax and static build | Passed |
| OpenAPI | Valid YAML; 44 paths and all 47 local references resolve |
| Real Firebase read-only check | Firebase Auth and Firestore connectivity succeeded for `rent-and-play` |
| Live catalog and group audit | 16 physical units, 14 configured groups; shared stock counts; zero missing-rate groups |
| Restarted API at the phone's configured LAN address | HTTP 200, healthy database, project `rent-and-play` |
| Web API proxy exact-unit lookup | Bicycle group has 3/3 units; `EQUIP-017` resolves to that group and its own physical unit |
| ESP32 polling and confirmation | Both return HTTP 409 standby |
| Normal Android app | APK built, installed successfully on CPH2375 and launched; process running with no recent AndroidRuntime/Flutter error entries in the checked log window |

The unique full-suite total is **406 passing checks**. Focused reruns are not added again to that total. Synthetic quota, outage, wrong-QR and invalid-input errors in test logs are intentional rejection/recovery scenarios.

The Firestore integrations independently exercised Owner and Operator: customer request → mobile staff approval → the same rental on web → equipment QR preparation → customer rental QR verification and handover → customer return request → physical receipt → completed inspection and restored stock. They assert one shared public rental reference, correct physical unit, stopped timer before handover, and authorization failures for customer or inactive staff credentials. The walk-in integration additionally verifies account linking to the same customer ID/history and a damaged return creating maintenance.

These integrations use real service wrappers and an isolated Firestore emulator with fixture authentication. They do not demonstrate an actual staff credential login or camera scan on the phone. No fake rentals, payments or customer accounts were added to the live Firebase project during this audit.

## Android build

- APK: `C:/Users/requi/Videos/AndroidFiles/build/app/outputs/flutter-apk/app-local-debug.apk`
- Size: 139,650,262 bytes.
- SHA-256: `E9FF992CAB1AF6658BFC1FD7F9C7B008FDE4CBF961BEE5E6AE2C7E12E000FEA9`.
- Local API: `http://192.168.1.4:3000/api`. The laptop API must be running and reachable on the phone's network. Rebuild if the laptop's address changes.

The APK contains the active camera-session fixes and fulfillment changes. Removed legacy screens were not reachable in the compiled application. The normal app replaced the temporary integration-test APK; the test entry point is not left installed. Only the six generated Flutter cache files known to be clean before this audit were restored. Earlier source changes and the already-modified cache directory were preserved.

The current build succeeds. Flutter reports a forward-compatibility warning for the Kotlin Gradle Plugin applied by the project and `mobile_scanner`; review that migration before upgrading Flutter. The ordinary web/API servers remain running, and the disposable Firestore emulator has been stopped.

## Deferred device/provider acceptance

The user deferred the actual camera scanner test and Bluetooth paper test. An attempted connected-device scanner integration installed its test APK, but the runner failed to start Dart Development Service before any test body executed. Consequently, native image decoding, optical scanning, camera permission on this phone and the live mobile Owner/Operator session were not verified by that attempt. The normal APK was restored and launched afterward.

Use [the acceptance plan](test-plan.md) and [optical fixture](scanner-optical-fixture.png) for the later camera check. Physical Bluetooth receipt/label output, background push delivery and actual email delivery still need their device/provider checks. The earlier successful phone connection check remains historical evidence for its earlier build. Automated passes and today's launch smoke check do not guarantee the absence of every possible bug.
