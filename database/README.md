# Database

Use PostgreSQL as the shared source of truth.

- `schema/` - current complete schema
- `migrations/` - ordered schema changes
- `seeds/` - development/sample data
- `diagrams/` - ERD files

Clients must NOT connect directly to PostgreSQL.
Only the Backend API should access it.
