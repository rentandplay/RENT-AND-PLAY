# Rental notifications

Rental notifications use the same authenticated backend as rental requests. ESP32 remains on standby and has no part in this flow.

| Event | Recipient | Next step |
| --- | --- | --- |
| Customer submits a cash rental request | Active operators and owners | Review and approve or reject |
| Customer submits QR payment proof | Active operators and owners | Check the screenshot against the saved total |
| Owner rejects QR payment proof | That customer | Upload a corrected successful-transfer screenshot |
| Admin approves a rental request or prepares a counter rental | That rental's customer | Keep the rental handoff QR ready |
| Admin rejects a rental request | That rental's customer | Read the reason, when supplied, and submit another request |
| Customer cancels before handoff | Active operators and owners | Reservation is released |
| Review or handoff hold expires | That rental's customer | Submit a new rental request |
| Equipment is prepared at the shop | That rental's customer | Expect delivery of the assigned unit at the selected location |
| Operator scans customer rental QR and confirms handoff | That rental's customer | Rental clock starts |
| Customer submits a return request | Active operators and owners | Arrange collection or physical receipt |
| Admin rejects a return request | That rental's customer | Rental stays active; customer can request again |
| Admin receives the equipment | That rental's customer | Clock stops; inspection is pending |
| Admin completes return inspection | That rental's customer | Check final balance and deposit refund |

Notifications are saved in the same Firestore transaction as the rental change. Failed actions create no alert. Event IDs identify the rental, recipient inbox, event type and return-request revision, so retries do not create duplicate inbox messages. No previous rental events are backfilled on upgrade.

The staff inbox is shared, but read status belongs to each signed-in staff account. Customer inboxes belong to the authenticated customer's Firebase UID; recipient IDs supplied by clients are ignored. `ADMIN` is the operator role and `OWNER` is the super admin role; both receive staff alerts. `USER` customers receive only their own rental decisions and return updates. Opening the bell does not clear unread messages. Opening a message marks it read and opens the specific rental, including completed or rejected records. “Mark shown as read” covers loaded entries; older history loads in pages of 60. Badges count unread entries currently loaded. A failed refresh preserves the displayed history. Changing accounts clears local inbox state and ignores late responses from the old session.

Web and Android poll once a minute while active; Android also refreshes on foreground Firebase messages. Initial history shows a badge without replaying old alerts. A revision check avoids rereading message documents when the inbox has not changed. Read-status revisions are scoped to the signed-in account, so one staff member marking a message read does not make every other staff device reload the shared inbox. The backend dispatches up to 40 queued phone alerts from one combined pending/retry query each minute; delivery can therefore take up to about a minute.

## Android phone alerts

The Android notification screen has an **Enable phone alerts** button. It asks for notification permission and registers that phone's Firebase Cloud Messaging token with the authenticated backend. With permission already granted, registration is refreshed on sign-in and token rotation. Foreground updates appear as an in-app banner; background messages use the `rental_updates` notification channel. Tapping a phone alert opens the matching inbox entry and booking. Sign-out unregisters the device before ending the Firebase session. Switching accounts invalidates the previous installation token before registering a fresh token, so a customer session cannot keep receiving pushes sent to a staff account on a shared phone. The dispatcher also checks the device audience against the account's current role before sending.

A persistent outbox dispatches phone messages every 60 seconds. It checks active account roles, removes expired tokens, and retries transient failures up to six attempts with increasing delays. A push failure does not undo a booking or remove its inbox history.

For local push testing, run the backend and web locally, then run Android with a local API address. The backend Firebase Admin credentials must target the same Firebase project as Android and be allowed to send FCM messages. Enable the Firebase Cloud Messaging API for that project if it is disabled. See the [local integration guide](../development/local-integration.md), [Firebase's Flutter setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started), and [delivery behavior](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages).

## Verification

Local automated tests cover recipient isolation, optional rejection reasons, duplicate requests, read status, pagination, account changes, outbox retries, and invalid devices. The browser preview uses disposable memory records and no push worker. Flutter tests render the customer inbox at narrow widths and large text, and open a rejected booking through a fake API.

On a real Android device using the updated backend, sign in as a customer, enable phone alerts, and submit a test booking. Check the web/admin app notification, approve or reject it, and verify the customer's in-app update. Repeat with the customer app in the background and tap the phone alert. Test a return request and sign out/switch accounts on a shared phone. Physical-device delivery remains a separate acceptance check from local automated tests.
