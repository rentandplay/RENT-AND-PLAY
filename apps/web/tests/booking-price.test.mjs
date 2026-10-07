import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBookingPrice } from '../src/rental-desk.js';

const helpers = { escape: value => String(value ?? '').replaceAll('<', '&lt;').replaceAll('>', '&gt;'), money: value => `₱${value.toFixed(2)}` };
test('booking preview separates rental, deposit, total and minimum package coverage', () => {
  const html = renderBookingPrice({ rental_fee: 150, deposit_amount: 100, billed_minutes: 300 }, helpers);
  assert.match(html, /Rental fee/);
  assert.match(html, /Refundable deposit/);
  assert.match(html, /Due at handoff/);
  assert.match(html, /₱250\.00/);
  assert.match(html, /covers 300 minutes/);
  assert.match(html, /starts at physical handoff/);
});
test('unavailable quote amounts stay unavailable while recorded zero deposits remain valid', () => {
  const missing = renderBookingPrice({ rental_fee: 150, billed_minutes: '<script>' }, helpers);
  assert.match(missing, /Not available/);
  assert.doesNotMatch(missing, /₱0\.00/);
  assert.doesNotMatch(missing, /<script>/);
  const freeDeposit = renderBookingPrice({ rental_fee: 150, deposit_amount: 0, billed_minutes: 60 }, helpers);
  assert.match(freeDeposit, /₱0\.00/);
  assert.match(freeDeposit, /Due at handoff<\/dt><dd>₱150\.00/);
});
