# ESP32 Verification Terminal

Responsibilities:
- Connect to Wi-Fi
- Poll backend for pending transaction
- Show RENT READY / RETURN READY / CONFIRMED / REJECTED / OFFLINE
- Wait for physical confirmation button
- POST confirmation to backend
- LED and buzzer feedback
- Never confirm locally without a valid backend response
