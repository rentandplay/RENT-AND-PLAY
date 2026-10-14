import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thermalReceiptLines, renderThermalReceipt, wrapReceiptText } from '../src/thermal-receipt.js';
const sample = JSON.parse(await readFile(new URL('../../../packages/api-contracts/examples/thermal-receipt.json', import.meta.url), 'utf8'));

test('web and Android thermal receipts use the same public reference, payment snapshot and Manila dates', () => {
  const lines = thermalReceiptLines(sample.rental);
  assert.deepEqual(lines.map(line => line.text), sample.expected_text);
  assert.ok(!JSON.stringify(lines).includes('private-qr-token'));
  assert.ok(!JSON.stringify(lines).includes('rental_internal'));
  assert.throws(() => thermalReceiptLines({}), /saved receipt reference/);
});
test('continuous receipt artwork wraps long values at the printable width and keeps its footer beyond the label height', () => {
  const measured = [], measure = (text, size) => { const width = Array.from(text).length * size * .6; measured.push(width); return width; };
  const receipt = renderThermalReceipt({ ...sample.rental, customer_name: '<script>José Reyes & Family</script>', delivery_location: 'Longaddress'.repeat(22) }, measure);
  assert.equal(receipt.width, 384); assert.ok(receipt.height > 240); assert.ok(receipt.height < 8192);
  assert.match(receipt.svg, /&lt;script&gt;/); assert.ok(!receipt.svg.includes('<script>'));
  const printedText = [...receipt.svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(match => match[1]).join(' ');
  assert.match(printedText, /parts may affect final charges\.$/);
  const positions = [...receipt.svg.matchAll(/<text x="\d+" y="(\d+)"/g)].map(match => Number(match[1]));
  assert.ok(Math.max(...positions) < receipt.height - 8);
  for (const text of wrapReceiptText('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(5), value => value.length * 12)) assert.ok(text.length * 12 <= 360);
});
test('missing financial data stays unknown while explicit zero and final charges survive', () => {
  const text = thermalReceiptLines({ ...sample.rental, status: 'COMPLETED', rental_paid_amount: null, refund_due: 0, fee_breakdown: { ...sample.rental.fee_breakdown, penalty_amount: 0, overtime_fee: 10, final_rental_charges: 210 } }).map(line => line.text);
  assert.ok(text.includes('Payment received: Not recorded')); assert.ok(text.includes('Refund due: PHP 0.00'));
  assert.ok(text.includes('Damage / missing: PHP 0.00')); assert.ok(text.includes('Final total: PHP 210.00'));
});
