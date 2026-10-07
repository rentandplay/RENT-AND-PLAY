# System Architecture

Web Dashboard --------------------\
Android App (separate project) ----> Backend REST API ---> Firebase Auth + Cloud Firestore

ESP32 Terminal: retained on standby for future hardware integration.

Rules:
1. Cloud Firestore is the shared source of truth and Firebase Authentication owns credentials.
2. Web and the Android app in the sibling `AndroidFiles` project use the Backend API rather than direct privileged Firestore access. The retained ESP32 contract also uses the backend when hardware is eventually enabled.
3. Backend owns validation, business rules, fee calculation, state transitions, and device synchronization.
4. Admin confirms current release, physical receipt, and return inspection on Android or web. ESP32 tabs stay visible; hardware endpoints default disabled (`ENABLE_ESP32=false`) and are not involved in these transitions.
5. Approval reserves pickup without a timer. Physical release starts the duration, physical receipt stops overtime, and inspection clears equipment separately from payment/refund settlement.

See [the admin rental flow](admin-rental-flow.md) for lifecycle stages, holds, QR checks, and acceptance steps.
