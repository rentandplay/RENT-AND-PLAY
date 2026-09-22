# Rent & Play web workspace

Responsive owner/operator login and dashboard using the supplied logo. Built with HTML, CSS, and JavaScript, connected to the Firebase-backed REST API in `apps/backend`. Existing TypeScript API scaffolds are retained.

## Run

Configure and start the backend first; see `../backend/README.md` for database setup and first-account creation. In a second VS Code terminal, from `apps/web`, run `npm run dev`, then open http://127.0.0.1:5173.

Sign in with an active Firebase Authentication account that has a matching active `users/{uid}` Firestore profile with an `OWNER` or `OPERATOR` role. There are no default passwords or demo access.

`npm run check` checks JavaScript syntax.

## Included

- Working Firestore inventory: add/edit equipment, per-item QR labels, current pricing with rate history, maintenance and inspection records, reversible archive/restore, and status history.
- Customer directory with search, add/edit, and reversible archive/restore controls.
- Dedicated rental, return, and complete transaction-history views backed by Firestore records.
- Pricing workspace for publishing new active rates while preserving historical rates, plus a consolidated maintenance workspace.
- Business reports with operational summaries, utilization rankings, and CSV export.
- Owner-only business settings and Firebase/Firestore user administration; operators receive read-only business details.
- Inventory search, category/status filters (including archives), sorting, table/card views, 12-item pagination, and CSV export of the filtered collection. Active/pending rentals lock availability, condition changes, and archiving.
- Database-backed login, Firebase password-reset email, password visibility, optional remembered session, and server-side sign-out.
- Live availability, active/pending rentals, due/overdue alerts, confirmed-fee chart, equipment categories, customer records, and terminal status.
- Search and status filters, rental detail dialogs, weekly fee selection, and CSV export of open rentals.
- Automatic refresh every 30 seconds and manual refresh. Database failures are shown explicitly; previously loaded records are labeled as stale.
- Responsive mobile sidebar, labeled inputs, keyboard focus states, native accessible dialogs, and reduced-motion support.
- Light/dark appearance switch in Settings & Help and sun/moon toggle on login. Theme preference is saved in this browser and applied before first paint; toggling preserves form input.
- Browser-history routing for direct URLs such as `/equipment`, `/customers`, and `/reports`, plus an actionable notification center.

## Responsibilities

The web dashboard reads real database records through `/api/dashboard`, proxied to the backend on port 3000. Database credentials never go to the browser. Empty tables show empty lists and zero totals.

Rental initiation and return processing belong to the mobile app and ESP32 workflow. The web dashboard monitors their stored records; it does not generate requests or simulate confirmation. Those mobile/device write endpoints are separate work.

The local server binds to `127.0.0.1:5173`. Keep both terminal processes running. Sessions expire and are cleared when the backend restarts. Deployment requires HTTPS, secure cookies, a dedicated database account, and shared persistent session storage if running multiple backend instances.
