# Firebase usage optimization

Implemented October 11, 2026 in the shared backend, web client and sibling AndroidFiles project.

## Live behavior

- Successful rental commits publish an authenticated server event and wake phone delivery immediately. Duplicate actions and release-verification reads do not produce extra change events.
- Web notifications update during open rental dialogs. Workspace replacement waits for the dialog to close so existing drafts survive.
- Android staff updates from the same shared event connection used by notifications and customer rental progress. Short bursts are combined into one staff refresh; an event during a running request queues a follow-up so older data cannot hide the change.
- Customer progress remains live through approval, release, physical receipt and completion. Reconnection/resume resyncs records. The existing foreground notification and FCM behavior remains available.
- Hold expiry runs at the next known deadline, with recovery discovery every five minutes. A newly committed earlier deadline advances the schedule. Expiry invalidates cached records and publishes to staff and the affected customer even when a normal API read discovers it.

## Fewer reads

- Idle outbox and expiry workers use one scheduled timer each rather than minute-by-minute database checks. Commit wakeups and retry/deadline schedules remain immediate.
- Inventory and the customer catalog query open rentals and open maintenance rather than reading all completed history. Lowercase statuses from the earlier mobile app remain included.
- Mobile counter requests skip web-only audit, condition/status history, complete repair history, business/pricing administration and staff account lists. Completed rental history is retained. The web workspace and reports retain their full data.
- Filtered inventory queries are invalidated after changes. Customer rental caches are invalidated for the affected customer; other customers retain their cache. Quotes, authorization and transaction safety still use authoritative reads.
- Android staff keeps a five-minute foreground recovery check for inventory changes and stops its event subscription/timer in the background.

The deterministic empty-database simulation counts **1,152 queries per idle day**, compared with **5,760** for the previous four minute-by-minute queries. This is an **80% reduction in these idle checks**, assuming one continuously running backend. It does not predict an 80% reduction in total Firebase usage. Activity, record counts, cache misses and additional server processes affect actual usage. Empty queries have a minimum read charge but are omitted from the document-usage graph: [Firestore pricing](https://firebase.google.com/docs/firestore/pricing#minimum_charge_for_queries), [usage dashboard discrepancies](https://firebase.google.com/docs/firestore/monitor-usage#usage_dashboard_and_billing_reports).

The inventory regression fixture has 200 completed rentals and 200 completed repairs. The new availability queries return its two open rentals and one open repair instead of the full histories.

## Verification and rollout

Automated tests use fake Firestore and API services. They cover shared mobile event connections, mobile progress without refresh, notification delivery and duplicate suppression, web alerts during dialogs, immediate outbox wakeups, scoped cache invalidation, expiry deadlines and in-flight races. Android's full suite passed. Backend and web have pre-existing deposit-related failures; the backend failures were reproduced using the original Git source in an isolated loader. The changed live-update/usage tests pass.

Final checks: 29 Android tests passed; 71 backend rental/live/usage tests passed; 16 web notification/cache/client tests passed. The broader backend suite had five pre-existing failures and two emulator-only skips; the web suite had three pre-existing failures. Those failures concern deposit expectations in the existing tests, and the associated product behavior was not changed by this optimization.

Restart the shared backend and serve the updated web source/build. Rebuild and install the Android APK for phones using an installed build, or restart the running Flutter session to initialize the new live subscriptions. These changes add no new Firestore indexes; the existing status/expiry indexes in firestore.indexes.json are used.

On two clients, submit a booking on Android, approve and prepare it on web, then confirm handoff and physical return. Keep My Rentals open and check that each progress stage and notification appears without a manual refresh. Repeat with Android in the background and phone alerts enabled to verify real FCM delivery. Production Firebase reads and physical phone delivery were not exercised by local automated tests.

For larger histories, server-side pagination of the web workspace and staff rental history remains a separate improvement. Their current full-history queries are retained to preserve reports and history views.
