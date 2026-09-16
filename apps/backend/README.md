# Rent & Play MySQL backend

The login and dashboard use the existing MySQL 8 database through this Node.js backend. It targets the tables in `rent_and_play_mysql_schema_v2_fixed.sql` and the schema name `rent_and_play_db` shown in Workbench. It never recreates the database or imports starter/sample records.

## First setup in VS Code

Requires Node.js 22 or newer and your MySQL service running.

In a terminal at the project root:

```powershell
cd apps\backend
npm.cmd install
Copy-Item .env.example .env
```

Open `apps/backend/.env` in VS Code. Enter the host, port, username, password, and schema name from your Workbench connection. In particular, replace `DB_PASSWORD=YOUR_MYSQL_PASSWORD` with your database login password. Quote passwords containing `#` with double quotes. This file is ignored by Git. Do not put database credentials in any web file.

The schema name in the downloaded SQL file is `rent_and_play`, but the screenshot shows `rent_and_play_db`. Use the name of the database you actually created; you do not need to import the SQL again.

Check the connection and table columns:

```powershell
npm.cmd run db:check
```

Your screenshot shows an empty `users` table. Create your first owner account:

```powershell
npm.cmd run user:create
```

This command asks for your full name, login email, and a new password (12+ characters). Password input is hidden. It stores a salted scrypt hash in the existing `users` table and only works when no user accounts exist. It never overwrites a user. The website login password is separate from the MySQL connection password.

Start the backend:

```powershell
npm.cmd run dev
```

Keep it running. In a second terminal at the project root:

```powershell
cd apps\web
npm.cmd run dev
```

Open http://127.0.0.1:5173 and sign in with the owner account you created.

## Implemented API

- `POST /api/auth/login`: parameterized user lookup, scrypt/bcrypt verification, active owner/operator check, last-login update, and opaque HttpOnly session cookie.
- `GET /api/auth/me`: current account, rechecking active status and role.
- `POST /api/auth/logout`: revoke the server session and clear the cookie.
- `GET /api/dashboard`: authenticated, consistent read of items/current rates, customers, categories, open rentals, pending verification records, registered terminals, and current/previous-week confirmed fees.
- `GET /api/health`: database connection and schema validation.

Run `npm test` for authentication, API access, inventory validation, rental guards, Philippine due-date boundaries, fee aggregation, and empty-data tests. Run `node --env-file=.env --test tests/*.test.mjs` to also exercise real MySQL inventory writes in an outer transaction that always rolls back its test records.

Inventory endpoints require an active owner/operator session: `GET /api/inventory`, `GET /api/inventory/:id`, `GET /api/inventory/:id/qr`, `POST /api/inventory`, `PATCH /api/inventory/:id`, and `POST /api/inventory/:id/actions`. Actions support maintenance, complete-maintenance, archive, and restore. Updates send the item's `updated_at` as `version` to reject stale edits. Writes use transactions, row locks, parameterized SQL, audit logs, and status/rate history. QR tokens remain stable. Archive preserves records, and existing rental price snapshots are not overwritten.

## Data and sessions

DATETIME fields are interpreted in Philippine time (`+08:00`). Fee charts exclude pending/unconfirmed rentals and refundable deposits. They show recorded rental charges, not proof of payment collection. An online terminal requires `status=ONLINE` and a last-seen timestamp within 90 seconds.

Sessions last eight hours by default or 30 days with Remember me. They live in backend memory, so restarting the backend signs users out. Login is rate limited and browser write requests are checked against allowed origins. For deployment, use HTTPS and `COOKIE_SECURE=true`; replace memory sessions with persistent shared storage if scaling to multiple instances.

Mobile rental/return creation and authenticated ESP32 confirmation endpoints are not implemented in this login/dashboard change. The dashboard displays their database records without bypassing the physical confirmation gate.
