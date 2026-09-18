# System Architecture

Web Dashboard ----\
Mobile App --------> Backend REST API ---> Firebase Auth + Cloud Firestore
ESP32 Terminal ----/

Rules:
1. Cloud Firestore is the shared source of truth and Firebase Authentication owns credentials.
2. Web, Mobile, and ESP32 use the Backend API rather than direct privileged Firestore access.
3. Backend owns validation, business rules, fee calculation, state transitions, and device synchronization.
4. ESP32 confirmation is required before a rental/return is finalized.
