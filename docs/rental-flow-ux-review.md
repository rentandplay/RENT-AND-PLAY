# Rental flow and counter terminal review

Reviewed 2026-11-07 against the current web controllers, backend rental lifecycle, terminal confirmation implementation, and ESP32 firmware. The separate Android application's UI and the physical terminal were not exercised.

## What the terminal actually does

The ESP32 is a physical confirmation station at the shop. It fetches an authenticated pending request, displays its reference and mode, and sends a confirmation after a button press. The backend owns validation, state transitions, timestamps and money records. A button does not independently verify identity, payment, item condition, or the presence of a customer. Staff must perform those checks first.

| Location and action | Confirmation | Timer |
| --- | --- | --- |
| Shop handover | Verify customer, payment and accessories; send to counter terminal and press its button | Starts at confirmed handover |
| Departure for resort delivery | Scan assigned unit; confirm shop departure at terminal | Remains stopped |
| Resort handover | Verify customer ticket and physical checks; confirm on staff device | Starts at resort handover |
| Physical return receipt | Scan actual equipment and confirm receipt | Stops immediately, before inspection |
| Return inspection at shop | Record condition, accessories and penalty; confirm at counter terminal | Uses saved physical receipt time |

## Changes made

- Resort handover no longer requires returning to the shop terminal or claiming a hardware emergency to use the staff device.
- Added Back to verification without dismissing the handover form. Final resort confirmation stays locked until verification succeeds.
- Removed staff-generated customer QR/PIN shortcuts from the handoff form. Staff read the customer's ticket instead.
- Counter dispatch now validates rolling QR and PIN through the same verifier as handoff preflight, including expiry and signature checks.
- Web terminal requests carry stable operation keys. Retrying a saved request preserves its reference and verification code, including after confirmation.
- Disabled hardware mode rejects terminal dispatch before queueing an unconfirmable request. Actual hardware operation requires the existing `ENABLE_ESP32=true` server configuration; this review does not enable it.
- Physical receipt uses its explicit checkbox and action button without another confirmation dialog. It still stops the timer before inspection and keeps equipment unavailable until inspection completes.
- Waiting dialogs show the actual request state, reference, terminal and expiry. Removed unobserved claims that a buzzer or OLED is active. Charges and inspection history remain available in a disclosure.
- Footer actions wrap on narrow screens and preserve a single primary action for each current handoff stage.

## Hardware requirement

Classic ESP32 GPIO35 is input-only and has no internal pull-up. The firmware now uses INPUT and documents an external 10 kΩ pull-up to 3.3 V, with the button between GPIO35 and GND. Verify the actual board and wiring before flashing. No physical wiring or firmware flashing was performed.

## UX rationale and limits

The workflow separates operational events that must have different timestamps: reserving equipment, leaving the shop, physical handover, physical receipt, and clearing inspection. Combining these into one button would make custody and late-fee timing less reliable. The checkout/payment and inspection checks are intentionally retained; optional notes and photos stay secondary.

The changes follow [GOV.UK's check-answers guidance](https://design-system.service.gov.uk/patterns/check-answers/) for review, correction and explicit action labels, and [Carbon modal guidance](https://www.carbondesignsystem.com/building-blocks/core/components/modal/guidelines) for focused transactional dialogs. GPIO behavior was checked against [Espressif's GPIO documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/gpio.html).

Automated checks cover web handoff routing, verification locking, duplicate submission, terminal ticket validation, retry replay, and lifecycle timestamps. This is a code and regression review, not evidence of usability testing with staff or a successful physical terminal demonstration.
