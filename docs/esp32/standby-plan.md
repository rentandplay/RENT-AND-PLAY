# ESP32 integration on standby

Keep `ENABLE_ESP32=false` during the current project phase. The web terminal page, historical terminal records, device authentication contracts, firmware in `firmware/esp32-terminal`, and isolated backend hardware tests remain available for the final integration phase.

Customer requests and staff approvals, preparation, handoff, physical receipt and inspection run through the shared backend on web and Android. No current rental requires a terminal confirmation. While standby is enabled, legacy hardware rental/return and terminal confirmation endpoints return HTTP 409 without changing rental or equipment state.

At the end of the project, integrate hardware through the backend's authenticated device APIs. Use saved rental and physical-unit IDs/QR tokens and inspection revisions, and preserve the current atomic reservation and receipt rules. Do not restore the old Android screens that wrote directly to Firestore or Realtime Database. Enable the flag only after real device authentication, duplicate confirmation, expiry, wrong-code and concurrent handoff checks pass.
