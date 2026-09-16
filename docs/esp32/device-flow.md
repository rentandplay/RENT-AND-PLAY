# ESP32 Device Flow

IDLE -> FETCH_PENDING -> READY -> WAIT_BUTTON -> CONFIRMING -> SUCCESS/ERROR

If Wi-Fi/API is unavailable:
- Show OFFLINE/API ERROR
- Do not confirm locally
- Keep backend transaction Pending Verification
