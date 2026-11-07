import test from 'node:test';
import assert from 'node:assert/strict';
import { Event, parseHTML } from 'linkedom';
import { createRentalDesk } from '../src/rental-desk.js';

function fixture(fulfillmentMode) {
  const { document } = parseHTML('<html><body><dialog open></dialog></body></html>');
  const modal = document.querySelector('dialog'); modal.open = true; modal.close = () => { modal.open = false; };
  const row = { id: 'rental', rental_code: 'R-1', status: 'APPROVED', delivery_status: 'PREPARED', fulfillment_mode: fulfillmentMode, rental_fee: 100 };
  const calls = [];
  const desk = createRentalDesk({ modal, escape: v => String(v ?? ''), model: () => ({ transactions: [row] }), money: v => `PHP ${v}`, formatDate: String, toast() {}, redraw() {}, refresh: async () => {},
    showModal: (_title, html) => {
      modal.innerHTML = html;
      const form = modal.querySelector('form');
      form.elements = Object.fromEntries([...form.querySelectorAll('[name]')].map(el => [el.name, el]));
      form.reportValidity = () => true;
    },
    api: async (path, options) => {
      calls.push({ path, body: JSON.parse(options.body) });
      return path.endsWith('/release-verification') ? { rental: { id: row.id }, rental_verified: true, delivery_prepared: true } : { rental: row };
    }
  });
  desk.releaseForm(row);
  return { modal, form: modal.querySelector('form'), calls };
}

test('resort handoff verifies the customer and directly confirms delivery without a shop-terminal step', async () => {
  const { form, calls } = fixture('DELIVERY');
  assert.equal(form.querySelector('[data-release-esp32]'), null);
  assert.equal(form.querySelector('[data-load-rolling-qr]'), null, 'staff do not issue their own customer verification challenge');
  const button = form.querySelector('[data-release-confirm]');
  assert.equal(button.hidden, true);
  form.elements.transactionCode.value = 'rp-rental-customer';
  form.elements.transactionCode.dispatchEvent(new Event('input'));
  await form.querySelector('[data-verify-booking]').onclick();
  assert.equal(button.hidden, false); assert.equal(button.disabled, false);
  assert.match(button.textContent, /Confirm resort handoff/);
  form.querySelector('[data-release-back]').click();
  assert.equal(button.hidden, true);
  await form.querySelector('[data-verify-booking]').onclick();
  const original = globalThis.FormData;
  globalThis.FormData = class { *[Symbol.iterator]() { yield ['inspectionNotes', 'Checked']; yield ['customerVerified', 'on']; yield ['paymentVerified', 'on']; yield ['accessoriesChecked', 'on']; yield ['condition', 'GOOD']; } };
  try {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.filter(call => call.path.endsWith('/release')).length, 1);
    assert.equal(calls.some(call => call.path.endsWith('/terminal-dispatch')), false);
  } finally { globalThis.FormData = original; }
});

test('shop handoff keeps terminal confirmation primary and hides the explicit offline fallback', async () => {
  const { form } = fixture('SHOP_HANDOVER');
  form.elements.transactionCode.value = 'rp-rental-customer';
  form.elements.transactionCode.dispatchEvent(new Event('input'));
  await form.querySelector('[data-verify-booking]').onclick();
  assert.equal(form.querySelector('[data-release-esp32]').hidden, false);
  assert.equal(form.querySelector('[data-emergency-drawer]').hidden, true);
  assert.equal(form.querySelector('[data-release-confirm]').disabled, true);
});

