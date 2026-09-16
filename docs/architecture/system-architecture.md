# System Architecture

Web Dashboard ----\
Mobile App --------> Backend REST API ---> PostgreSQL
ESP32 Terminal ----/

Rules:
1. PostgreSQL is the shared source of truth.
2. Web, Mobile, and ESP32 never connect directly to PostgreSQL.
3. Backend owns validation, business rules, fee calculation, state transitions, and device synchronization.
4. ESP32 confirmation is required before a rental/return is finalized.
