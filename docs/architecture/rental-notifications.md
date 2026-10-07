# Rental notifications

Rental notifications use the same authenticated backend as bookings. ESP32 remains on standby and has no part in this flow.

| Event | Recipient | Next step |
| --- | --- | --- |
| Customer submits a booking | Active operators and owners | Open the booking and approve or reject |
| Admin approves or prepares a counter booking | That booking's customer | Keep the transaction QR ready for handoff |
| Admin rejects a booking | That booking's customer | Read the reason, when supplied, and make another booking |
| Customer cancels before release | Active operators and owners | Reservation is released |
| Booking or pickup hold expires | That booking's customer | Make a new booking |
| Equipment is physically released | That booking's customer | Rental clock starts |
| Customer submits a return request | Active operators and owners | Arrange collection or physical receipt |
| Admin rejects a return request | That booking's customer | Rental stays active; customer can request again |
| Admin receives the equipment | That booking's customer | Clock stops; inspection is pending |
| Admin completes return inspection | That booking's customer | Check final balance and deposit refund |

Notifications are saved in the same Firestore transaction as the rental change. Failed actions create no alert. Event IDs identify the rental, recipient inbox, event type and return-request revision, so retries do not create duplicate inbox messages. No previous rental events are backfilled on upgrade.

The staff inbox is shared, but read status belongs to each signed-in staff account. Customer inboxes belong to the authenticated customer's Firebase UID; recipient IDs supplied by clients are ignored. `ADMIN` is the operator role and `OWNER` is the super admin role; both receive staff alerts. `USER` customers receive only their own booking decisions and return updates. Opening the bell does not clear unread messages. Opening a message marks it read and opens the specific booking, including completed or rejected bookings. “Mark shown as read” covers loaded entries; older history loads in pages of 60. Badges count unread entries currently loaded. A failed refresh preserves the displayed history. Changing accounts clears local inbox state and ignores late responses from the old session.

Web polls while visible every 15 seconds. Android polls every 20 seconds while active and refreshes on foreground Firebase messages. Initial history shows a badge without replaying old alerts. A revision check avoids rereading all message documents when the inbox has not changed.

## Android phone alerts

The Android notification screen has an **Enable phone alerts** button. It asks for notification permission and registers that phone's Firebase Cloud Messaging token with the authenticated backend. With permission already granted, registration is refreshed on sign-in and token rotation. Foreground updates appear as an in-app banner; background messages use the `rental_updates` notification channel. Tapping a phone alert opens the matching inbox entry and booking. Sign-out unregisters the device before ending the Firebase session. Switching accounts invalidates the previous installation token before registering a fresh token, so a customer session cannot keep receiving pushes sent to a staff account on a shared phone. The dispatcher also checks the device audience against the account's current role before sending.

A persistent outbox dispatches phone messages every 10 seconds. It checks active account roles, removes expired tokens, and retries transient failures up to six attempts with increasing delays. A push failure does not undo a booking or remove its inbox history. New messages are processed separately from waiting retries.

Deploy backend and web together, then install the rebuilt APK. The default Android API address is the hosted Render service, so a local backend restart does not update a phone using that address. The backend Firebase Admin credentials must target the same Firebase project as Android and be allowed to send FCM messages. Enable the Firebase Cloud Messaging API for that project if it is disabled. See [Firebase's Flutter setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started) and [delivery behavior](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages).

## Verification

Local automated tests cover recipient isolation, optional rejection reasons, duplicate requests, read status, pagination, account changes, outbox retries, and invalid devices. The browser preview uses disposable memory records and no push worker. Flutter tests render the customer inbox at narrow widths and large text, and open a rejected booking through a fake API.

On a real Android device using the updated backend, sign in as a customer, enable phone alerts, and submit a test booking. Check the web/admin app notification, approve or reject it, and verify the customer's in-app update. Repeat with the customer app in the background and tap the phone alert. Test a return request and sign out/switch accounts on a shared phone. Physical-device delivery remains a separate acceptance check from local automated tests.
