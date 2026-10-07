# Shared web and Android deployment

The deployed API is `https://rent-and-play.onrender.com/api`. The Flutter app in the separate `rentandplay/AndroidFiles` repository uses this HTTPS address by default; set `API_BASE_URL` to use the laptop backend during local development. The deployed admin web uses `/api` on the same Render service. Both use the `rent-and-play` Firebase project.

## Code updates

1. Save and verify backend/web changes in the laptop's `RENT-AND-PLAY` checkout.
2. Commit the intended changes in both repositories. Backend/web deployment must include `rental-flow.mjs`, `mobile.mjs`, `rental-desk.js`, `qr-reader.js`, and the local `apps/web/public/vendor` QR decoder assets alongside the updated build files.
3. Push the commit to `rentandplay/RENT-AND-PLAY` on `main`.
4. Wait for the GitHub check and Render deployment to succeed. In Render, the linked branch must be `main` and Auto-Deploy must be **On Commit** or **After CI Checks Pass**.
5. Confirm the deployed catalog at `https://rent-and-play.onrender.com/api/mobile/catalog`. It must return JSON with `items` and `firebaseProjectId: "rent-and-play"`.
6. Build and install the matching Android APK after the backend/web deployment succeeds. A backend-only deployment does not replace the APK already installed on a phone. The new APK needs the release, receipt, inspection, and ticket endpoints from this deployment.

Keep `ENABLE_ESP32=false` on the backend. Set `WEB_ORIGIN` to the actual admin web origin, including its scheme and host, so browser writes pass origin validation. Flutter Web on Chrome calls the API cross-origin; add each exact local browser origin to `CORS_ORIGINS` as a comma-separated list. The provided Render configuration allows `http://localhost:7357` and `http://127.0.0.1:7357`. Customer review holds default to 900 seconds, approved rentals have 1800 seconds to be prepared, and shop-prepared deliveries have 7200 seconds to reach the resort; optionally configure `RENTAL_REQUEST_HOLD_SECONDS`, `RENTAL_PICKUP_HOLD_SECONDS`, and `RENTAL_DELIVERY_HOLD_SECONDS`. The ESP32 terminal remains visible on standby in both clients.

For an existing deployment, set backend `SUPER_ADMIN_UID` to the Firebase Auth UID of the account that should own the workspace. A fresh setup's `user:create` command creates the first account with the `OWNER` role. The owner can then create separate operator accounts from Settings → Users. Customer accounts keep the `USER` role and use their own email/password in the mobile app. Operators use `ADMIN`; only `OWNER` can change shared business settings or manage staff accounts.

The GitHub workflow now runs the project's backend tests, web checks/tests, and actual static web build using Node 22. It does not require a root npm package or Webpack.

An **API endpoint not found** response means the selected server does not have the required route. A successful older deployment can still lack new catalog, profile, or rental routes. Local fixes reach Render only after a commit, push, and successful deployment.

## Data updates

Equipment, rates, accounts, and rental state are Firebase records. Updating these records through either client does not need a Git push. The API validates ownership, saves reservations and fees, and refreshes shared reads after writes. Android customer rental/alert screens poll every 20 seconds and admin workspace every 15 seconds; actions refresh immediately. The web also polls for updates. This is shared cloud state with polling rather than an instant Firestore subscription.

The local admin web can also run against the laptop backend on port 3000. It will see the same records when that backend uses the same Firebase project. Local source changes can affect its behavior before those code changes have been deployed to Render.

## Optional local Android build

For a physical phone on this laptop's Wi-Fi:

```powershell
flutter run --dart-define=API_BASE_URL=http://192.168.1.4:3000/api
```

For local debug testing, set `API_BASE_URL` to the backend address reachable from the device. Android emulators use `10.0.2.2`; physical phones use the laptop's Wi-Fi IPv4 address. This needs no GitHub push or deployment. For the online backend:

```powershell
flutter run --dart-define=API_BASE_URL=https://rent-and-play.onrender.com/api
flutter build apk --debug --dart-define=API_BASE_URL=https://rent-and-play.onrender.com/api
```

The local address may change with the laptop's Wi-Fi lease. Release builds default to the deployed HTTPS API. Both clients still share Firebase records when their selected backend uses the same Firebase project.

## Deployment checks

```powershell
Invoke-RestMethod https://rent-and-play.onrender.com/api/health
Invoke-RestMethod https://rent-and-play.onrender.com/api/mobile/catalog
```

Health must report `database: true` and `firebaseProjectId: "rent-and-play"`. The customer catalog includes only active equipment with configured rental rates and required deposits. Its IDs and availability must match those records in admin inventory; unconfigured records remain visible only to staff. Account/profile and rental operations require the signed-in user's Firebase ID token.
