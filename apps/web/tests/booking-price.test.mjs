import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBookingPrice } from '../src/rental-desk.js';

const helpers = { escape: value => String(value ?? '').replaceAll('<', '&lt;').replaceAll('>', '&gt;'), money: value => `₱${value.toFixed(2)}` };
test('rental preview shows the rental fee and package duration without legacy deposit charges', () => {
  const html = renderBookingPrice({ rental_fee: 150, deposit_amount: 100, billed_minutes: 300 }, helpers);
  assert.match(html, /Rental fee/);
  assert.doesNotMatch(html, /deposit|₱250\.00/i);
  assert.match(html, /₱150\.00/);
  assert.match(html, /300 min/);
  assert.match(html, /Timer starts at handoff/);
});
test('missing or invalid quote amounts and durations are disclosed without inventing zero charges', () => {
  const missing = renderBookingPrice({ rental_fee: null, billed_minutes: '<script>' }, helpers);
  assert.match(missing, /Not available/);
  assert.doesNotMatch(missing, /₱0\.00/);
  assert.doesNotMatch(missing, /<script>/);
  const freeDeposit = renderBookingPrice({ rental_fee: 150, deposit_amount: 0, billed_minutes: 60 }, helpers);
  assert.doesNotMatch(freeDeposit, /₱0\.00|deposit/i);
  assert.match(freeDeposit, /Rental fee<\/dt><dd>₱150\.00/);
});
