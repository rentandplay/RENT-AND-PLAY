# Rent & Play Firebase backend

The Node.js REST API uses Firebase Authentication for admin sign-in and Cloud Firestore for application data. Only active users with the `ADMIN` profile role can access this website. The browser talks only to this backend; Firebase Admin credentials are never exposed to web code.

## Firebase setup

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

The `.vscode/launch.json` Run and Debug configurations are shared through Git. After setting up Firebase on this laptop, choose **Rent & Play: Start App** from the Run and Debug menu and press **F5** to start both backend and web. `node_modules`, `.env`, and the service-account key are local to each laptop; they are intentionally not stored in Git.

Verify the connection and create the first admin:

```powershell
npm.cmd run firebase:check
npm.cmd run user:create
```

The account command creates one Firebase Authentication account, its matching active `ADMIN` `users/{uid}` Firestore profile, and four starter equipment categories when the category collection is empty. It refuses to overwrite an existing profile.

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

`POST /api/auth/login` validates the password with Firebase Authentication, exchanges the returned ID token for an HttpOnly Firebase session cookie, then checks that the matching `users/{uid}` profile is active and has role `ADMIN`. Protected routes revalidate both the Firebase session and Firestore profile. Standard sessions last eight hours; Remember me uses Firebase's maximum supported 14 days. Login is rate limited, write requests check their browser origin, and logout clears and locally revokes the presented cookie.

The web administration API also exposes authenticated workspace data, customer management, the client rate sheet, rate publishing, and admin-only business settings/user management. `GET /api/pricing` reads the seeded rate sheet, `PUT /api/pricing` saves administrator changes, and `POST /api/pricing/quote` calculates a rental quote. Quotes can use a catalog product directly or an inventory item linked to that product. `POST /api/auth/password-reset` requests a Firebase password-reset email without revealing whether an account exists.

The existing dashboard and inventory API routes are unchanged. Inventory writes use Firestore transactions. The `item_codes/{ITEM_CODE}` registry enforces unique item codes, and stale edits are rejected using `updated_at`. QR tokens and historical rates remain stable.

Run unit tests with:

```powershell
npm.cmd test
```

The Firestore write integration test runs only against the Firebase emulator when `FIRESTORE_EMULATOR_HOST` is set, so tests never modify a production project accidentally.

## Firestore collections

- `users/{uid}`: `full_name`, `email`, `role`, `is_active`, timestamps
- `item_categories`, `items`, `item_codes`, `item_rates`
- `settings/pricing`: client rate products, timed packages, sale prices, deposits, overtime rates, service hours, and rental policy text. Missing configuration loads the versioned catalog defaults in the backend until an administrator saves it.
- `customers`, `rentals`
- `verification_requests`, `terminals`
- `maintenance_records`, `item_status_history`, `item_condition_records`, `audit_logs`

References between collections are string document IDs such as `item_id`, `customer_id`, `rental_id`, and `terminal_id`. Date fields are Firestore timestamps. Rental fees and deposits are numeric PHP amounts.

Each physical `items/{id}` record may include `pricing_product_id` to connect its QR label to one of the client rate sheet products. Timed rates bill each started block in full; package rates apply when they cost less than the regular hourly blocks. Overtime uses the product's configured amount per started hour. Board-game whole-stay quotes use the guest's resort checkout time. Bikes and tech have a deposit requirement, with the amount set by an administrator; quotes warn when that amount is still zero. The catalog starts with the rates shown in the client sheet.

## Analytics data contract

The authenticated workspace response includes the records needed by Reports. Analytics is read-only and does not add demo records or modify operational data.

- `rentals`: `item_id`, `customer_id`, `status`, `rental_fee`, `confirmed_rental_at`, `due_at`, `confirmed_return_at`. Only ACTIVE/COMPLETED records contribute confirmed rental counts and fees. Duration and return punctuality require consistent confirmation dates.
- `items`: `created_at`, `category_id`, `is_active`, and `status`; `item_status_history`: `item_id`, `old_status`, `new_status`, `changed_at`. Status INACTIVE denotes archived time. The workspace exposes only these history fields plus the document ID for utilization calculations.
- `maintenance_records`: `item_id`, `status` (IN_PROGRESS or COMPLETED), `started_at`, `completed_at`. Ongoing records use the report cutoff for downtime; completed records without an end time are excluded from downtime and flagged.
- `verification_requests`: `status: CONFIRMED`, `terminal_id`, `requested_at`, `confirmed_at`, and either `rental_id` or `item_id` for equipment filtering. When `confirmed_at` is absent, `rental_id` plus explicit `transaction_type: RENTAL` or `RETURN` allows fallback to the corresponding rental confirmation timestamp. Missing or inconsistent timing/terminal data is excluded and disclosed, not treated as zero seconds.
- `terminals`: `name`, `terminal_code` for labels. Unregistered IDs remain grouped separately.

All timestamps above are serialized, including nested inspection and fee-snapshot dates. The response includes `refreshedAt`. Trusted transaction endpoints now persist terminal confirmations, conditions, and fees; physical ESP32 connectivity still requires hardware integration and validation.

## Rental / return audit workflow

The website prepares rental/return requests and records inspections. Only the device-authenticated terminal endpoint finalizes a handoff. See [the API contract](../../docs/api/endpoints.md) and [data dictionary](../../docs/database/data-dictionary.md) for exact fields and legacy-data handling.

Run `npm run terminal:register` to provision a new terminal or add a credential to an existing terminal without one. The command refuses to overwrite credentials, stores only a key digest, and displays the key once for ESP32 setup. Configure polling and physical confirmation according to the shared contract.

Requests expire after 10 minutes by default (`VERIFICATION_TTL_SECONDS`). A startup/30-second worker and request-time sweeps persist EXPIRED status/reason. Concurrent display requests share a sweep; mutation-time checks force a fresh sweep. Firestore transactions coordinate confirmation, rejection, expiry, and reservations. Inspected returns requiring maintenance create linked records only after valid device confirmation. Original pricing and condition snapshots survive edits and repairs.

## Firebase usage and quota recovery

Run `npm run firebase:check` from this directory to check the configured project. The diagnostic prints the complete error code and message without printing credentials or record contents. `8 RESOURCE_EXHAUSTED: Quota exceeded.` means Firestore rejected the operation because a usage limit was reached; changing the service-account path does not restore that quota.

Open the project's Firestore **Usage** tab to identify the exhausted limit. If it is the free daily quota, wait for its reset around midnight Pacific time or enable billing/upgrade the Firebase plan to continue sooner. Billing can incur charges and must be configured by the project owner. See [Firebase usage limits](https://firebase.google.com/docs/firestore/quotas) and [Firestore error recovery](https://docs.cloud.google.com/firestore/native/docs/understand-error-codes). Restart the backend after applying source changes, then refresh the browser once access is restored.

Dashboard, equipment-list, workspace, and pricing displays share collection/document snapshots for up to 60 seconds. Writes through this backend invalidate those snapshots, including terminal confirmations and persisted expiry. Manual Refresh bypasses the display cache. Authentication, equipment availability checks, rental quotes, and transaction commits read the database directly. Other backend instances or direct console edits may take up to 60 seconds to appear.

Quota responses use HTTP `429`, `FIRESTORE_QUOTA_EXCEEDED`, and `Retry-After`; requests and the expiry worker share a five-minute cooldown. The browser pauses automatic polling during that cooldown. Logout and password-reset remain usable. Temporary connection failures and invalid configuration have distinct diagnostics. No synthetic records are substituted for unavailable cloud data.

Device polling queries pending requests for its terminal instead of rereading completed history. Online terminal heartbeats are written at most once per 30 seconds; offline terminals are updated immediately on a successful poll.

New return confirmations require an explicit penalty (zero when none applies). Missing historical data remains labelled not recorded. Refundable deposits are separate from rental charges.

The included Firestore rules deny direct client access because all web, mobile, and ESP32 traffic is expected to pass through the trusted REST API. Deploy them with the Firebase CLI when you are ready to connect the project.
