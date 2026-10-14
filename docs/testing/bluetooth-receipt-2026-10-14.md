# Bluetooth receipt verification — 14 October 2026

[The later system audit](system-audit-2026-10-14.md) supersedes the test totals, APK checksum and phone-install status below. Actual paper output remains deferred.

Web and Android staff can print confirmed rental receipts directly through the same MX10 Bluetooth printer used for equipment QR labels. Open rental details, choose the Bluetooth receipt action, connect the printer and select **Print via Bluetooth**. PDF printing/saving remains available.

The user's paper is a **55 mm continuous roll**. The receipt preview now shows that physical width, with the current MX10 driver's 384-dot (48 mm) printing area inside it. Increasing the paper width does not increase the raster width supported by the driver. Receipt length grows with wrapped content; it is not squeezed into the 50 × 30 mm QR label artwork. Both clients use the saved public rental reference, customer and physical unit, fulfillment location, Manila start/due times, payment snapshot, balance and late/return terms. A shared fixture verifies matching web and Android content. Internal record IDs and rental QR secrets are excluded.

The receipt UI now has separate preview and printer/paper sections, a visible rental reference, connection guidance, readable error/success states and a fixed print/PDF footer. Its labels use **Bluetooth printer** and **Continuous paper roll**, as requested by the user; fixed model/width mentions are hidden from the product UI while the actual driver and paper dimensions remain unchanged. Desktop uses two columns; narrow screens put connection controls first and scroll the receipt above the footer. Back/close/PDF actions remain locked while the printer is busy. Android also offers a retry when reading printer status fails.

QR labels and receipts share one connection and print queue within each client. Printing prevents connection replacement and duplicate jobs. Existing raster commands, paper/heat errors, flow control and disconnect handling are reused. A failed job shows a recoverable error and asks staff to check partial output before retrying. Receipt mode does not run the gapped-label sensor search. A printer should be connected to one client at a time.

| Check | Result |
| --- | --- |
| Full web suite | 164 passed; 0 failed |
| Full Android suite | 60 passed; 0 failed |
| Flutter analyzer | No issues found |
| Web syntax / static build | Passed; thermal receipt module included |
| Android debug APK | Build succeeded, including the native receipt rasterizer |
| Browser preview | Inspected desktop light/dark themes and 390-pixel web layout using disposable rental data; PDF fallback opens the same saved rental |
| Android UI preview | Rendered dark theme with mocked printer status; 320 × 640 layout with larger text keeps Print visible and status errors recover |
| Final local API / browser module probes | HTTP 200; shared Firebase project `rent-and-play` |
| Actual Bluetooth paper output | Deferred by the user; no physical printer result claimed |
| Phone installation of this build | Not performed; no Android device was connected during this follow-up |

The automated checks cover matching receipt content, long fields and XML escaping, missing versus zero amounts, variable-height raster output, the shared QR/receipt lock, disconnect recovery, narrow mobile layout, status failure/retry and duplicate-print prevention. All 22 focused printer/receipt tests passed after the layout changes. The later generic-label follow-up passed 20 web printer/receipt checks, four Android receipt checks and Flutter analysis; browser review confirmed the generic labels and paper guidance. Browser QA did not write test rentals to live Firebase. Current previews: [desktop web](receipt-generic-web.png), [Android widget rendering](receipt-generic-android.png). The earlier [phone-width web preview](receipt-55mm-web-mobile.png) shows the same layout before the generic wording change. Android's connected state is mocked; these images do not demonstrate physical Bluetooth output.

Current APK: `C:/Users/requi/Videos/AndroidFiles/build/app/outputs/flutter-apk/app-local-debug.apk` (139,645,910 bytes). SHA-256: `AA303481804338CFA3EDD3A60A6107A512E0CB717F3C92A6A84419DA3AFF15D3`. It uses `http://192.168.1.4:3000/api`, matching the laptop's verified Wi-Fi address. Keep the laptop API running and the phone on the same network for local use.

The earlier [walk-in verification](walk-in-2026-10-14.md) documents backend and customer/staff flow coverage. Its APK checksum and test totals predate this printer update. The ordinary API and web development servers remain running; the disposable receipt preview server was stopped. ESP32 remains on standby.

## Deferred physical check

1. Install this APK, turn on the MX10 and load the user's 55 mm continuous roll. On web, use Chrome/Edge on localhost or HTTPS with Bluetooth support.
2. Open one confirmed rental on each client and compare its public reference, unit, due time, payment and balance. Connect only the client currently printing.
3. Print once from web and once from Android. Inspect legibility, wrapped fields, the final return terms and the tear feed. The preview confirms the content; the paper confirms alignment and darkness.
4. Verify no-paper, reconnect and retry behavior, checking partial paper output before another copy. Switch back to an equipment QR label and confirm its existing dimensions and QR decode still work.
