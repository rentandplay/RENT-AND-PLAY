# Data Dictionary

## Pricing configuration

`settings/pricing` is the saved business rate sheet. When the document is absent, the backend supplies client-sheet defaults. Invalid saved values raise an error instead of silently changing quoted prices.

- `products[]`: stable `id`, display `name`, group, included items, high-value flag, refundable `deposit_amount`, `overtime_rate_per_hour`, optional new-product `sale_price`, and `rate_options[]`.
- `rate_options[]`: stable option `id`, display label, amount in PHP, duration in minutes, and billing kind (`SHORT`, `HOURLY`, `PACKAGE`, `BLOCK`, or `WHOLE_STAY`). Whole-stay options use the resort guest's checkout time as their due time.
- `rules`: daily opening and closing time, valid-ID requirement, high-value deposit requirement, lost board-game piece fee, booking phone/channel, overtime and after-hours return guidance, whole-stay definition, bike safety, care/damage, and return reminders.
- `updated_at`, `updated_by`: last save timestamp and workspace user ID.

Each physical `items/{id}` record may include `pricing_product_id`, which connects its QR label to a product in the rate sheet. Existing `item_rates` remain in place for legacy per-item rates and pricing history.

## Quote rules

- Each started rental block is charged in full. Hourly rates round up to the next full hour; five-hour card/game rates round up to the next five-hour block.
- A package is considered once the requested duration reaches its covered number of hourly blocks; the lowest applicable package/hourly amount is used.
- Overtime adds one configured product rate for every started hour after the due time. Returns after closing are accepted when service reopens; overtime continues until return.
- Whole-stay board-game rentals are due at the resort guest's checkout. The quote reports valid-ID and refundable-deposit requirements; a zero high-value deposit generates a setup warning.
- The ₱50 lost-piece fee is configured for board games, matching the note under the board-games section of the client sheet.

## Existing operational records

Other collections and fields are documented in [the backend README](../../apps/backend/README.md).
