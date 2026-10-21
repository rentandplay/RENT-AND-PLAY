# Project Architecture & System Rules

## 1. Database & Storage Architecture
- **SUPABASE IS THE ONLY DATABASE**:
  - The active database engine is **Supabase PostgreSQL** (`yuhforhnrnfpzzhulgzt.supabase.co`).
  - All collections, tables, and documents (rentals, items/inventory, customers, categories, item_rates, maintenance_records, terminals, verification_requests, audit_logs) are stored and persisted in **Supabase**.
  - All file and media uploads (receipts, equipment condition inspection photos, payment proof images, QR codes) are stored in **Supabase Storage** (`rental-media` bucket).
  - **Important**: Even though backend service files use Firestore-like syntax (`collection().where().get()`), they run through the Supabase compatibility adapter (`apps/backend/src/supabase.mjs` / `createSupabaseFirestore()`). Never mistake this for Firebase Firestore.

## 2. Firebase Role (Auth & Push Notifications Only)
- **FIREBASE IS NOT THE DATABASE**:
  - Firebase Firestore is **not** used for data storage.
  - **Firebase Authentication** is used strictly for user login (email & password verification), session JWT token validation, and password reset OTP.
  - **Firebase Cloud Messaging (FCM)** is used strictly for sending push notifications and alerts to Android devices and POS terminals.
