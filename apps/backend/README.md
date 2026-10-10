# Rent & Play Firebase backend

The Node.js REST API uses Firebase Authentication for staff sign-in and Cloud Firestore for application data. Active `OPERATOR` operator and `OWNER` super admin accounts can access staff endpoints; `CUSTOMER` accounts are reserved for customers. The browser talks only to this backend; Firebase Admin credentials are never exposed to web code.

## Firebase setup

Account validation, forgot-password steps, emailed temporary staff passwords, and required first-login password changes are described in [account access](../../docs/architecture/account-access.md). Legacy `ADMIN`, `USER`, and `SUPER_ADMIN` profiles remain compatible. Run `npm run auth:password-policy` to inspect the provider's rules and `npm run auth:password-policy -- --apply` to enforce the new password policy for registration and hosted reset forms.

### Android integration

The active Flutter app is in the adjacent `AndroidFiles` checkout. Customer catalog, QR lookup, profiles, quotes, rentals, and returns use `/api/mobile/*`. Android staff operations use the same protected endpoints as the web and authenticate with a Firebase ID token for an active `OPERATOR` operator or `OWNER` profile. Customer rental endpoints accept only `CUSTOMER` profiles. No client Firestore rule changes are needed for these flows.

`GET /api/mobile/catalog` contains active inventory records with configured rental rates, exposing public pricing/availability only. Unconfigured equipment stays in admin inventory and is hidden from customers until its rate configuration is complete. Configured equipment can remain visible while rented or reserved. `GET /api/mobile/rentals` and individual rental reads are restricted to the signed-in owner, including legacy customer-ID fields. Profile bootstrap creates a regular `CUSTOMER` from verified Firebase claims; it cannot grant an admin role.

Approval moves the booking to `APPROVED` and holds it for pickup without starting a timer. Admin then scans the transaction QR and exact inventory QR, verifies the customer, rental payment, and condition, and confirms physical release. A separate physical receipt step stops overtime before return inspection. Original saved rates determine final charges; damaged returns create linked maintenance records. Payment balances are recorded separately from equipment availability. See [the admin rental flow](../../docs/architecture/admin-rental-flow.md).

Run `node --env-file-if-exists=.env scripts/check-mobile-integration.mjs` for a read-only comparison of the admin and customer catalog. Restart the local backend after source changes. The local web app uses `http://localhost:5173` and proxies API calls to the backend on port 3000. Android emulators use `--dart-define=API_BASE_URL=http://10.0.2.2:3000/api`; physical phones use the laptop's Wi-Fi IP. The web proxy and Android API must use the same Firebase project.

1. Create a Firebase project and enable **Authentication > Sign-in method > Email/Password**.
2. Create the default Cloud Firestore database.
3. In **Project settings > General**, copy the Web API key.
4. In **Project settings > Service accounts**, create a service-account key for local development. Store it outside this repository.
5. Install Node.js 22 or newer. From `apps/backend`, install the exact dependency versions in the lockfile and create the local environment file once on this laptop:

```powershell
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Set `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY` in `.env`. For Admin SDK credentials, either set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of the downloaded JSON key or put its single-line JSON value in `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit that key.

### Mobile email verification

Customer registration sends a six-digit code through the backend. For local development, set `SMTP_USER` to the Gmail sender address, `SMTP_PASSWORD` to that account's Google App Password, and `REGISTRATION_OTP_PEPPER` to a separate random value of at least 32 bytes in `apps/backend/.env`. These credentials stay on the backend and must never be added to Flutter `--dart-define` values. Set the same variables in the backend host's secret environment before deploying.

Codes expire after 10 minutes, allow five guesses, and can be resent after 30 seconds. Each email is limited to five sends per 15 minutes; the API also limits requests by source address. A successful code check returns a short-lived proof that is bound to the Firebase account email. The account profile is created only after the authenticated completion request consumes that proof.

The `.vscode/launch.json` Run and Debug configurations are shared through Git. After setting up Firebase on this laptop, choose **Rent & Play: Start App** from the Run and Debug menu and press **F5** to start both backend and web. `node_modules`, `.env`, and the service-account key are local to each laptop; they are intentionally not stored in Git.

Verify the connection and create the initial owner account:

```powershell
npm.cmd run firebase:check
npm.cmd run user:create
```

The account command creates one Firebase Authentication account, its matching active `OWNER` `users/{uid}` Firestore profile, and four starter equipment categories when the category collection is empty. It refuses to overwrite an existing profile. For an existing deployment, set `SUPER_ADMIN_UID` to the current owner's Firebase UID to grant owner access without changing account credentials; newly created operators receive separate `OPERATOR` profiles.

### Replace equipment with the Android catalog

`npm run catalog:replace-mobile` previews a replacement of the Firestore equipment list with the 14 records in `AndroidFiles/lib/models/item_model.dart`. It also sets the four matching categories, item rates, QR codes, catalog pricing, sale prices, and available status. Equipment images stay in `apps/web/public/images` and are selected by equipment name in the web inventory.

The preview stops when any equipment record has an open rental or maintenance job. To apply the replacement after reviewing the counts, run `npm run catalog:replace-mobile -- --apply`. The command first writes an equipment-only backup to the ignored `apps/backend/backups/` folder, preserves rental/status/audit history, and records the replacement in the audit log. It removes unmatched item and category documents from Firestore; old rate rows are retained as inactive history.

Equipment item codes use one shared sequence across categories: `EQUIP-001`, `EQUIP-002`, and so on. To convert the existing Firestore item codes for both web and Android, preview `npm run item-codes:migrate`, then apply `npm run item-codes:migrate -- --apply`. The migration backs up the equipment and code registry, updates `item_code`, the Android `qrCode` alias, and the QR scan token, and records each code change in the audit log. Print new QR labels after applying the migration; older labels contain the previous codes.

Start the backend, then start the web app in a second terminal:

```powershell
npm.cmd run dev
```

```powershell
cd ..\web
npm.cmd run dev
```

Open http://127.0.0.1:5173 and sign in with the admin account.

## Authentication and API

`POST /api/auth/login` validates the password with Firebase Authentication, exchanges the returned ID token for an HttpOnly Firebase session cookie, then checks that the matching `users/{uid}` profile is active and has role `OPERATOR` (operator) or `OWNER` (super admin). `CUSTOMER` accounts are customer accounts and cannot enter the admin workspace. Set `SUPER_ADMIN_UID` to the Firebase Auth UID of the initial owner account; the first successful login creates its active `OWNER` profile if missing, and existing profiles for that UID receive `OWNER` access. Protected routes revalidate the Firebase session and Firestore profile. Standard sessions last eight hours; Remember me uses Firebase's maximum supported 14 days. Login is rate limited, write requests check their browser origin, and logout clears and locally revokes the presented cookie.

The web administration API exposes authenticated workspace data, customer management, the client rate sheet, and rental operations to operators and owners. Only `OWNER` can change shared business settings or manage workspace accounts. Owner-created staff accounts use separate Firebase identities with the `OPERATOR` operator or `OWNER` role; customer app accounts stay `CUSTOMER`. Mobile rental and customer inbox endpoints reject staff accounts, while staff booking notifications are delivered only to active staff devices. `POST /api/mobile/rentals` submits customer bookings; web and Android staff can prepare counter bookings through `POST /api/rental-bookings`. Both use atomic unit holds. Admin approval leaves the booking `APPROVED` awaiting pickup. `POST /api/rentals/{id}/release` starts the timer after QR/customer/payment/inspection checks. Receipt and inspection use separate `/receipt` and `/complete-return` actions. Owners can cancel pending or approved bookings. The ESP32 terminal remains visible and disabled. `GET /api/pricing` reads the seeded rate sheet, `PUT /api/pricing` saves administrator changes, and `POST /api/pricing/quote` calculates an admin rental quote. Quotes can use a catalog product directly or an inventory item linked to that product. `POST /api/auth/password-reset` requests a Firebase password-reset email without revealing whether an account exists.

Mobile registration uses `POST /api/mobile/registration/email-code`, `POST /api/mobile/registration/verify-email-code`, and authenticated `POST /api/mobile/registration/complete`. New profiles require a Firebase-verified email claim; the completion endpoint sets that claim only after checking the one-time OTP proof.

The existing dashboard and inventory API routes are unchanged. Inventory writes use Firestore transactions. The `item_codes/{ITEM_CODE}` registry enforces unique item codes, and stale edits are rejected using `updated_at`. QR tokens and historical rates remain stable.

Run unit tests with:

```powershell
npm.cmd test
```

The Firestore write integration test runs only against the Firebase emulator when `FIRESTORE_EMULATOR_HOST` is set, so tests never modify a production project accidentally.

## Firestore collections

- `users/{uid}`: `full_name`, `email`, `role`, `is_active`, timestamps
- `item_categories`, `items`, `item_codes`, `item_rates`
- `settings/pricing`: client rate products, timed packages, sale prices, overtime rates, service hours, and rental policy text. Missing configuration loads the versioned catalog defaults in the backend until an administrator saves it.
- `customers`, `rentals`
- `verification_requests`, `terminals`
- `notification_inboxes/{staff|customer_UID}/messages`, `notification_outbox`, `notification_devices`: rental inbox history and Android push delivery. See [notification flow and phone setup](../../docs/architecture/rental-notifications.md).
- `maintenance_records`, `item_status_history`, `item_condition_records`, `item_condition_photos`, `rental_settlements`, `audit_logs`

References between collections are string document IDs such as `item_id`, `customer_id`, `rental_id`, and `terminal_id`. Date fields are Firestore timestamps. Rental fees are numeric PHP amounts.

Each physical `items/{id}` record may include `pricing_product_id` to connect its QR label to one of the client rate sheet products. Timed rates bill each started block in full; package rates apply when they cost less than the regular hourly blocks. Overtime uses the product's configured amount per started hour. Board-game whole-stay quotes use the guest's resort checkout time. Rentals collect the quoted rental fee without a deposit. The catalog starts with the rates shown in the client sheet.

## Analytics data contract

The authenticated workspace response includes the records needed by Reports. Analytics is read-only and does not add demo records or modify operational data.

- `rentals`: `item_id`, `customer_id`, `status`, `rental_fee`, `confirmed_rental_at`, `due_at`, `confirmed_return_at`. Only ACTIVE/RETURN_PENDING_INSPECTION/COMPLETED records contribute confirmed rental counts and fees; `received_at` is the physical return time. Duration and return punctuality require consistent confirmation dates.
- `items`: `created_at`, `category_id`, `is_active`, and `status`; `item_status_history`: `item_id`, `old_status`, `new_status`, `changed_at`. Status INACTIVE denotes archived time. The workspace exposes only these history fields plus the document ID for utilization calculations.
- `maintenance_records`: `item_id`, `status` (IN_PROGRESS or COMPLETED), `started_at`, `completed_at`. Ongoing records use the report cutoff for downtime; completed records without an end time are excluded from downtime and flagged.
- `verification_requests`: `status: CONFIRMED`, `terminal_id`, `requested_at`, `confirmed_at`, and either `rental_id` or `item_id` for equipment filtering. When `confirmed_at` is absent, `rental_id` plus explicit `transaction_type: RENTAL` or `RETURN` allows fallback to the corresponding rental confirmation timestamp. Missing or inconsistent timing/terminal data is excluded and disclosed, not treated as zero seconds.
- `terminals`: `name`, `terminal_code` for labels. Unregistered IDs remain grouped separately.

All timestamps above are serialized, including nested inspection and fee-snapshot dates. The response includes `refreshedAt`. Trusted transaction endpoints now persist admin confirmations, conditions, and fees; physical ESP32 integration remains on standby.

## Rental / return audit workflow

The web and Android admin complete bookings, release, physical receipt, inspection, and settlements through the shared protected API. ESP32 terminal tabs remain visible on standby. Keep `ENABLE_ESP32=false` (the default): legacy terminal mutation/polling endpoints return a standby response and cannot participate in the current flow. The firmware and terminal records are retained for later hardware integration. See [the flow](../../docs/architecture/admin-rental-flow.md), [API contract](../../docs/api/endpoints.md), [data dictionary](../../docs/database/data-dictionary.md), and [local integration guide](../../docs/development/local-integration.md).

Run `npm run terminal:register` to provision a new terminal or add a credential to an existing terminal without one. The command refuses to overwrite credentials, stores only a key digest, and displays the key once for ESP32 setup. Configure polling and physical confirmation according to the shared contract.

Customer booking holds default to 15 minutes (`RENTAL_REQUEST_HOLD_SECONDS=900`); approved pickup holds default to 30 minutes (`RENTAL_PICKUP_HOLD_SECONDS=1800`). A startup/60-second worker and request-time sweeps persist expiry and release only the booking's own hold. Original pricing and condition snapshots survive edits and repairs. Legacy verification attempts retain their 10-minute `VERIFICATION_TTL_SECONDS` deadline while hardware stays disabled.

## Firebase usage and quota recovery

Run `npm run firebase:check` from this directory to check the configured project. The diagnostic prints the complete error code and message without printing credentials or record contents. `8 RESOURCE_EXHAUSTED: Quota exceeded.` means Firestore rejected the operation because a usage limit was reached; changing the service-account path does not restore that quota.

Open the project's Firestore **Usage** tab to identify the exhausted limit. If it is the free daily quota, wait for its reset around midnight Pacific time or enable billing/upgrade the Firebase plan to continue sooner. Billing can incur charges and must be configured by the project owner. See [Firebase usage limits](https://firebase.google.com/docs/firestore/quotas) and [Firestore error recovery](https://docs.cloud.google.com/firestore/native/docs/understand-error-codes). Restart the backend after applying source changes, then refresh the browser once access is restored.

Dashboard, equipment-list, workspace, pricing, mobile catalog, analytics-summary, and customer rental-list reads share collection/document snapshots for up to five minutes, with concurrent reads coalesced and the in-memory cache capped at 4,096 least-recently-used entries. Rental changes invalidate the admin-wide rental view and only the affected customer's rental-list entries. Health probes are cached for one minute. Backend writes invalidate only the affected collections; the web app's manual dashboard refresh clears all display snapshots, while other manual refreshes clear the collections needed by that view. Firebase ID-token checks, active-account/role checks, and transactional availability, quote, and commit checks remain authoritative and read the database directly. Other backend instances or direct console edits may take up to five minutes to appear.

Every 15 minutes, backend logs emit `[firestore-display-cache]` counters for cache-miss reads and returned documents by collection. These cover display-cache reads only, not transactional, notification, health, or worker reads, so use Firebase Usage as the source for total billed usage.

The expiry worker now queries only pending records whose deadline has passed. Before deploying this backend, create the two composite indexes in the root `firestore.indexes.json` and wait until Firebase reports them ready. If the Firebase project already has other composite indexes, export or preserve them and merge them into that file before using the Firebase CLI so existing index definitions stay managed. Creating indexes changes Firebase configuration; it was not deployed from this workspace.

Quota responses use HTTP `429`, `FIRESTORE_QUOTA_EXCEEDED`, and `Retry-After`; requests and the expiry worker share a five-minute cooldown. The browser pauses automatic polling during that cooldown. Logout and password-reset remain usable. Temporary connection failures and invalid configuration have distinct diagnostics. No synthetic records are substituted for unavailable cloud data.

Device polling queries pending requests for its terminal instead of rereading completed history. Online terminal heartbeats are written at most once per 30 seconds; offline terminals are updated immediately on a successful poll.

New return confirmations require an explicit penalty (zero when none applies). Missing historical data remains labelled not recorded. New rentals contain only rental charges; older database records may retain their original legacy fields.

The included Firestore rules deny direct client access because all web, mobile, and ESP32 traffic is expected to pass through the trusted REST API. Deploy them with the Firebase CLI when you are ready to connect the project.
