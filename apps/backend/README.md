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
- `maintenance_records`, `item_status_history`, `audit_logs`

References between collections are string document IDs such as `item_id`, `customer_id`, `rental_id`, and `terminal_id`. Date fields are Firestore timestamps. Rental fees and deposits are numeric PHP amounts.

Each physical `items/{id}` record may include `pricing_product_id` to connect its QR label to one of the client rate sheet products. Timed rates bill each started block in full; package rates apply when they cost less than the regular hourly blocks. Overtime uses the product's configured amount per started hour. Board-game whole-stay quotes use the guest's resort checkout time. Bikes and tech have a deposit requirement, with the amount set by an administrator; quotes warn when that amount is still zero. The catalog starts with the rates shown in the client sheet.

## Analytics data contract

The authenticated workspace response includes the records needed by Reports. Analytics is read-only and does not add demo records or modify operational data.

- `rentals`: `item_id`, `customer_id`, `status`, `rental_fee`, `confirmed_rental_at`, `due_at`, `confirmed_return_at`. Only ACTIVE/COMPLETED records contribute confirmed rental counts and fees. Duration and return punctuality require consistent confirmation dates.
- `items`: `created_at`, `category_id`, `is_active`, and `status`; `item_status_history`: `item_id`, `old_status`, `new_status`, `changed_at`. Status INACTIVE denotes archived time. The workspace exposes only these history fields plus the document ID for utilization calculations.
- `maintenance_records`: `item_id`, `status` (IN_PROGRESS or COMPLETED), `started_at`, `completed_at`. Ongoing records use the report cutoff for downtime; completed records without an end time are excluded from downtime and flagged.
- `verification_requests`: `status: CONFIRMED`, `terminal_id`, `requested_at`, `confirmed_at`, and either `rental_id` or `item_id` for equipment filtering. When `confirmed_at` is absent, `rental_id` plus explicit `transaction_type: RENTAL` or `RETURN` allows fallback to the corresponding rental confirmation timestamp. Missing or inconsistent timing/terminal data is excluded and disclosed, not treated as zero seconds.
- `terminals`: `name`, `terminal_code` for labels. Unregistered IDs remain grouped separately.

All timestamps above are serialized for the web report, including `confirmed_at` and `changed_at`. The response includes `refreshedAt`. Capture terminal confirmation timestamps when the trusted mobile/ESP32 confirmation workflow completes; this report does not implement those separate write endpoints or prove that physical device confirmation is connected.

The included Firestore rules deny direct client access because all web, mobile, and ESP32 traffic is expected to pass through the trusted REST API. Deploy them with the Firebase CLI when you are ready to connect the project.
