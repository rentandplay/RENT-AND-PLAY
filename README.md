# Rent & Play

Scalable monorepo structure for the Rent & Play system.

## Main architecture

Web / Mobile / ESP32 -> Backend REST API -> Firebase Authentication + Cloud Firestore

The Web, Mobile, Backend, and ESP32 firmware are separate applications/projects
inside one main repository.

## Main folders

- `apps/web` - Owner/Operator web dashboard
- `apps/mobile` - Mobile QR rental/return workflow
- `apps/backend` - Shared REST API and business rules
- `firmware/esp32-terminal` - ESP32 verification terminal firmware
- `database` - Legacy relational schema reference; the running application uses Cloud Firestore
- `packages/api-contracts` - Shared API schemas/examples
- `docs` - Proposal, architecture, ERD, API, testing, and defense notes
- `tests/system` - End-to-end system flow test notes
- `infrastructure` - Optional deployment/docker files

## Team ownership suggestion

Developer 1 (Web):
- Web dashboard
- Inventory, customers, rates, dashboard, reports
- Shared database/API coordination

Developer 2 (Mobile):
- Mobile QR workflow
- Rental/return screens
- ESP32 terminal / verification integration

Backend ownership should be divided by module so that every API area has a clear owner.

## First step

Open this root folder in VS Code:

`File -> Open Folder -> rent-and-play`

For the connected login and dashboard, follow [apps/backend/README.md](apps/backend/README.md), then run the web app from `apps/web` in a second terminal. No demo access or default accounts are enabled.
