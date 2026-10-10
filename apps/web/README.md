# Rent & Play web workspace

Responsive admin login and dashboard using the supplied logo. Built with HTML, CSS, and JavaScript, connected to the Firebase-backed REST API in `apps/backend`. Existing TypeScript API scaffolds are retained.

## Run

New Owner/Operator accounts must change their temporary password before opening the workspace. Account creation is under **Settings → Staff** for Owners. Forms show inline errors and forgot password confirms the recipient. See [account access](../../docs/architecture/account-access.md).

Configure and start the backend first; see `../backend/README.md` for database setup and first-account creation. In a second VS Code terminal, from `apps/web`, run `npm run dev`, then open http://127.0.0.1:5173.

Sign in with a separate, active staff account. `OPERATOR` is the operator role and `OWNER` is the super admin role. `CUSTOMER` accounts are customers for the mobile app and cannot sign in to the web workspace. Set backend `SUPER_ADMIN_UID` to bootstrap the initial owner from an existing Firebase Auth account.

`npm run check` checks JavaScript syntax. `npm test` checks analytics calculations, settings and MX10 printer commands/transfer behavior.

## Included

- Working Firestore inventory: add/edit equipment, per-item QR labels created automatically with each new item, current pricing with rate history, maintenance and inspection records, reversible archive/restore, and status history.
- MX10 QR/barcode printing over Bluetooth LE with a 50 × 30 mm design and a native 384 × 240-dot monochrome raster. Continuous sticker paper is the default: adjustable start allowance (2 mm), 30 mm artwork, then adjustable tear allowance (3 mm), without sensor gap search. Precut stock can still use sensor positioning/calibration. Light/Medium/Dark image presets match the supplied Fun Print APK; Dark (100%) is the default. QR modules occupy uniform whole printer dots; offsets preserve the complete QR box and white border. A small monochrome Rent & Play logo is centered under the equipment text. Transfers stream ordered writes with printer pause/resume; devices without notifications retain conservative pacing. Paper-out and overheat reports stop transfer. Download an individual PNG for Fun Print or a sheet respecting the selected paper mode and allowances. Web Bluetooth needs HTTPS and a supported browser such as Android Chrome.
- Customer directory with search, add/edit, and reversible archive/restore controls.
- Dedicated rental, return, and complete transaction-history views backed by Firestore records.
- Rental and return request forms with release/return inspections, recorded penalties, and an in-dialog confirmation check. When automatic refresh is enabled, pending handoff dialogs update every 30 seconds. Physical terminal confirmation remains required.
- Pricing workspace with compact pricing settings and a quote preview. Admins can manage hourly and package prices, card sale prices, overtime, service hours, and rental rules. Physical equipment can be linked to a pricing product by its QR inventory record; legacy per-item rates keep their history.
- Reports with all 14 business analytics: revenue and rental-count trends; equipment utilization; most/least rented (including zero-rental items); revenue per item and category; overdue and on-time rates; average rental duration; repeat customer rate; maintenance frequency and downtime; terminal verification time with average, median and P95.
- Analytics filters for 7/30/90/365 days or custom dates (up to 366 days), daily/calendar-week/calendar-month grouping, category, and equipment. Full equipment performance, trend values, category totals and terminal results use 5-row pagination where needed. CSV exports all matching rows, not just the current page.
- In-page definitions and data-coverage notes explain formulas, exclusions, missing timestamps and partial periods. See `../../docs/analytics-demo-guide.md` for the panel demonstration guide.
- Admin-only business settings and Firebase/Firestore account administration.
- Horizontal Settings tabs for Business, Appearance, Preferences, Accounts (admins only), and Account & security. Tabs support arrow keys and Home/End; business and preference drafts survive tab changes. Business edits have save/discard controls, and account settings link to the profile and Firebase password-reset email.
- Browser-local preferences control automatic refresh and the default analytics period/grouping. Restore defaults requires Save to apply. Automatic refresh pauses while in Settings so edits are not interrupted; manual Refresh remains available. Currency/timezone are read-only because reporting currently uses PHP and Philippine time; the grace setting does not recalculate penalties or analytics.
- Inventory search, category/status filters (including archives), sorting, table/card views, 5-item pagination, and CSV export of the filtered collection. Active/pending rentals lock availability, condition changes, and archiving.
- Database-backed login, Firebase password-reset email, password visibility, optional remembered session, and server-side sign-out.
- Live availability, active/pending rentals, due/overdue alerts, confirmed-fee chart, equipment categories, customer records, and terminal status.
- Search and status filters, rental detail dialogs, weekly fee selection, and CSV export of open rentals.
- Automatic refresh every 30 seconds and manual refresh. Database failures are shown explicitly; previously loaded records are labeled as stale.
- Responsive mobile sidebar, labeled inputs, keyboard focus states, native accessible dialogs, and reduced-motion support.
- Light/dark appearance switch in Settings & Help and sun/moon toggle on login. Theme preference is saved in this browser and applied before first paint; toggling preserves form input.
- Browser-history routing for direct URLs such as `/equipment`, `/customers`, and `/reports`, plus an actionable notification center.

## Responsibilities

The web dashboard reads real database records through `/api/dashboard`, proxied to the backend on port 3000. Database credentials never go to the browser. Empty tables show empty lists and zero totals.

Reports use ACTIVE/COMPLETED rentals and their recorded rental fees, not verified payment receipts. Pending requests and cancelled rentals are excluded. Date filters use Philippine time; calendar weeks start on Monday. Current equipment status and the "overdue now" count are live snapshots. The overdue rate uses rentals due in the period; the on-time rate uses completed returns in the period, so the two rates are not complements.

Utilization merges overlapping rental intervals and divides by observed calendar hours since item creation, excluding recorded archived intervals. Nights and maintenance remain in the denominator. Missing creation dates use the period start and are disclosed; insufficient archive history excludes that item from utilization. Downtime merges maintenance intervals per item, including work carried over into the period. Terminal timing requires valid request/confirmation dates and a terminal ID, with explicit rental/return confirmation fallback. Missing samples show a dash instead of a fabricated average.

Staff can prepare rental and return requests from the web workspace or mobile QR workflow. Web forms save the inspection and applicable quote; requests stay pending until the assigned ESP32 terminal confirms them with its physical button. Available equipment, active customers, configured terminals, and eligible return records are checked before preparing a request. A rental with a pending return is excluded from new return choices.

Quote and resort checkout inputs use Philippine time regardless of the browser's local timezone. Failed page loads provide a retry action; refresh failures retain and label the last successfully loaded records. Direct page URLs and browser history preserve the selected page through sign-in. See `../../docs/testing/web-page-audit.md` for the latest page audit and validation limits.

The local server binds to `127.0.0.1:5173`. Keep both terminal processes running. Sessions expire and are cleared when the backend restarts. Deployment requires HTTPS, secure cookies, a dedicated database account, and shared persistent session storage if running multiple backend instances.
