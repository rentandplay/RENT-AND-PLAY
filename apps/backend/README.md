# Rent & Play Firebase backend

The Node.js REST API now uses Firebase Authentication for owner/operator passwords and Cloud Firestore for application data. The browser still talks only to this backend; Firebase Admin credentials are never exposed to web code.

## Firebase setup

1. Create a Firebase project and enable **Authentication > Sign-in method > Email/Password**.
2. Create the default Cloud Firestore database.
3. In **Project settings > General**, copy the Web API key.
4. In **Project settings > Service accounts**, create a service-account key for local development. Store it outside this repository.
5. From `apps/backend`, install dependencies and create the local environment file:

```powershell
npm.cmd install
Copy-Item .env.example .env
```

Set `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY` in `.env`. For Admin SDK credentials, either set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of the downloaded JSON key or put its single-line JSON value in `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit that key.

Verify the connection and create the first owner:

```powershell
npm.cmd run firebase:check
npm.cmd run user:create
```

The owner command creates one Firebase Authentication account, its matching `users/{uid}` Firestore profile, and four starter equipment categories when the category collection is empty. It refuses to overwrite an existing profile.

Start the backend, then start the web app in a second terminal:

```powershell
npm.cmd run dev
```

```powershell
cd ..\web
npm.cmd run dev
```

Open http://127.0.0.1:5173 and sign in with the owner account.

## Authentication and API

`POST /api/auth/login` validates the password with Firebase Authentication, exchanges the returned ID token for an HttpOnly Firebase session cookie, then checks the active `users/{uid}` profile and its `OWNER` or `OPERATOR` role. Protected routes revalidate both the Firebase session and Firestore profile. Standard sessions last eight hours; Remember me uses Firebase's maximum supported 14 days. Login is rate limited, write requests check their browser origin, and logout clears and locally revokes the presented cookie.

The web administration API also exposes authenticated workspace data, customer management, rate publishing, and owner-only business settings/user management. `POST /api/auth/password-reset` requests a Firebase password-reset email without revealing whether an account exists.

The existing dashboard and inventory API routes are unchanged. Inventory writes use Firestore transactions. The `item_codes/{ITEM_CODE}` registry enforces unique item codes, and stale edits are rejected using `updated_at`. QR tokens and historical rates remain stable.

Run unit tests with:

```powershell
npm.cmd test
```

The Firestore write integration test runs only against the Firebase emulator when `FIRESTORE_EMULATOR_HOST` is set, so tests never modify a production project accidentally.

## Firestore collections

- `users/{uid}`: `full_name`, `email`, `role`, `is_active`, timestamps
- `item_categories`, `items`, `item_codes`, `item_rates`
- `customers`, `rentals`
- `verification_requests`, `terminals`
- `maintenance_records`, `item_status_history`, `audit_logs`

References between collections are string document IDs such as `item_id`, `customer_id`, `rental_id`, and `terminal_id`. Date fields are Firestore timestamps. Rental fees and deposits are numeric PHP amounts.

The included Firestore rules deny direct client access because all web, mobile, and ESP32 traffic is expected to pass through the trusted REST API. Deploy them with the Firebase CLI when you are ready to connect the project.
