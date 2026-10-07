# Rent & Play

Web dashboard, shared API backend, and ESP32 verification terminal. The native Android app source is maintained separately in the sibling `AndroidFiles` project.

## Main architecture

Web dashboard / Android app / ESP32 -> Backend REST API -> Firebase Authentication + Cloud Firestore

The Android app source is outside this repository. It and the web dashboard use the shared backend API.

## Main folders

- `apps/web` - Owner/Operator web dashboard
- `apps/backend` - Shared REST API and business rules
- `firmware/esp32-terminal` - ESP32 verification terminal firmware
- `packages/api-contracts` - Shared API schemas/examples
- `docs` - Proposal, architecture, ERD, API, testing, and defense notes
- `tests/system` - End-to-end system flow test notes
- `infrastructure` - Optional deployment/docker files

## Team ownership suggestion

Developer 1 (Web):
- Web dashboard
- Inventory, customers, rates, dashboard, reports
- Shared database/API coordination

Developer 2 (Android):
- Customer workflows in the separate `AndroidFiles` project
- Rental/return screens and shared API integration
- ESP32 terminal / verification integration

Backend ownership should be divided by module so that every API area has a clear owner.

## First step

Open this root folder in VS Code:

`File -> Open Folder -> rent-and-play`

## Run on another laptop

The VS Code **Rent & Play: Start App** launch configuration is included in Git. Each laptop needs a one-time local setup because Git does not include installed `node_modules` packages or Firebase credentials.

1. Clone the repository, open its root folder in VS Code, and install Node.js 22 or newer.
2. In a PowerShell terminal at the repository root, install the backend dependencies and create a local environment file if one does not exist:

```powershell
cd apps/backend
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

3. Edit `apps/backend/.env` with your Firebase project ID, Web API key, and local Admin SDK credentials. Follow [apps/backend/README.md](apps/backend/README.md) for Firebase setup.
4. In VS Code, choose **Rent & Play: Start App** in Run and Debug, then press **F5**. This starts the backend on port 3000 and opens the website at http://127.0.0.1:5173. After this laptop is set up, use that same Run button each time.

If a previous run is still active, stop it with **Shift+F5** before starting again. Restart both servers after changing their server code so the running processes load the updates. Selecting **Rent & Play: Backend** alone starts only the API; use **Rent & Play: Start App** to launch the complete app.

Run `npm.cmd ci` again after backend dependencies change in `package-lock.json` or if `node_modules` is removed. The `.env` file and service-account key must stay local and must not be committed to GitHub. No demo access or default accounts are enabled.
