import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWalkInReceipt } from '../src/walk-in-receipt.js';
const helpers = { escape: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'), money: value => `PHP ${value.toFixed(2)}`, formatDate: value => value };
test('walk-in receipt uses the saved public reference and payment snapshot, without exposing handoff tokens', () => {
  const html = renderWalkInReceipt({ id: 'booking_internal', rental_code: 'R-0042', booking_qr_token: 'secret-token', customer_name: '<script>bad</script>', rental_fee: 50, rental_paid_amount: 0, balance_due: 50, fulfillment_mode: 'SHOP_HANDOVER', fee_breakdown: { billed_minutes: 60, overtime_rate: 10, overtime_unit_minutes: 60 } }, helpers);
  assert.match(html, /R-0042/); assert.match(html, /Lakewoods Subdivision/);
  assert.match(html, /Payment received<\/th><td>PHP 0.00/);
  assert.match(html, /Set at actual handover/);
  assert.match(html, /&lt;script&gt;bad/);
  assert.ok(!html.includes('secret-token')); assert.ok(!html.includes('booking_internal'));
});
test('historical missing payment amounts are disclosed and physical receipt stays separate from inspection', () => {
  const html = renderWalkInReceipt({ rental_code: 'R-0043', received_at: '2026-10-14T03:00:00Z', status: 'RETURN_PENDING_INSPECTION' }, helpers);
  assert.match(html, /Payment received<\/th><td>Not recorded/);
  assert.match(html, /2026-10-14T03:00:00Z/); assert.match(html, /RETURN_PENDING_INSPECTION/);
});
