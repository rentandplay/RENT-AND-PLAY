import test from 'node:test';
import assert from 'node:assert/strict';
import { createRentalDesk } from '../src/rental-desk.js';

const row = { id: 'internal-rental-id', rental_code: 'R-0001', item_name: 'Bicycle', customer_name: 'Customer', status: 'PENDING_ADMIN_APPROVAL', payment_method: 'CASH' };
function setup(api, { refreshFailure = false } = {}) {
  const button = { disabled: false }, error = { textContent: '' }, cancel = {};
  let submit, title, html, refreshed = 0;
  const messages = [];
  const form = {
    isConnected: true, reportValidity: () => true,
    querySelector: selector => selector === '[type="submit"]' ? button : selector === '.form-error' ? error : cancel,
    addEventListener: (_event, listener) => { submit = listener; }
  };
  const modal = { querySelector: () => form, close: () => { form.isConnected = false; } };
  const desk = createRentalDesk({
    api, escape: value => String(value ?? ''), modal, model: () => ({ transactions: [row] }),
    showModal: (heading, body) => { title = heading; html = body; },
    toast: message => messages.push(message), refresh: async () => { refreshed++; if (refreshFailure) throw Error('Refresh unavailable'); }, redraw() {}
  });
  return { desk, button, error, messages, get title() { return title; }, get html() { return html; }, get refreshed() { return refreshed; }, submit: () => submit({ preventDefault() {} }) };
}
async function withFormData(callback) {
  const original = globalThis.FormData;
  globalThis.FormData = class { *[Symbol.iterator]() { yield ['notes', 'Customer request checked']; } };
  try { await callback(); } finally { globalThis.FormData = original; }
}

test('web staff approval submits the exact rental once, preserves its reference, and refreshes after save', async () => {
  await withFormData(async () => {
    const calls = [];
    let resolve;
    const ui = setup((path, options) => {
      calls.push({ path, method: options.method, body: JSON.parse(options.body) });
      return new Promise(done => { resolve = () => done({ rental: { ...row, status: 'APPROVED', start_at: null } }); });
    });
    ui.desk.reviewForm(row, 'APPROVE');
    assert.equal(ui.title, 'Approve rental request');
    assert.match(ui.html, /R-0001/); assert.match(ui.html, /timer starts when you confirm delivery/);
    assert.equal(calls.length, 0);
    const first = ui.submit();
    await ui.submit();
    assert.equal(ui.button.disabled, true);
    assert.deepEqual(calls, [{ path: '/mobile/rentals/internal-rental-id/review', method: 'POST', body: { action: 'APPROVE', notes: 'Customer request checked' } }]);
    resolve(); await first;
    assert.equal(ui.refreshed, 1);
    assert.match(ui.messages[0], /approved/);
  });
});

test('failed web approval restores the form and a confirmed save survives a subsequent refresh failure', async () => {
  await withFormData(async () => {
    let attempts = 0;
    const ui = setup(async () => {
      if (++attempts === 1) throw Error('Connection lost. Try again.');
      return { rental: { ...row, status: 'APPROVED' } };
    }, { refreshFailure: true });
    ui.desk.reviewForm(row, 'APPROVE');
    await ui.submit();
    assert.equal(ui.button.disabled, false);
    assert.match(ui.error.textContent, /Connection lost/);
    await ui.submit();
    assert.equal(attempts, 2); assert.equal(ui.refreshed, 1);
    assert.match(ui.messages[0], /approved/);
    assert.match(ui.messages[0], /Refresh to see the latest records/);
  });
});
