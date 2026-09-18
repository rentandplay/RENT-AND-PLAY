# Database

This directory preserves the original relational design as a reference for collection fields and business rules.

- `schema/` - legacy complete SQL schema
- `migrations/` - ordered schema changes
- `seeds/` - development/sample data
- `diagrams/` - ERD files

The running application uses Cloud Firestore. Clients must use the Backend API rather than direct privileged database access.
