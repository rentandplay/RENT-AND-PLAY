import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createWorkspaceUI } from '../src/workspace-ui.js';
import { rentalHoldExpired } from '../src/rental-desk.js';

const deadline = Date.parse('2026-11-17T04:00:00Z');
const rental = { id: 'rental-3915', rental_code: 'R-3915', item_name: 'Scrabble', customer_name: 'Customer',
  status: 'PENDING_ADMIN_APPROVAL', payment_method: 'CASH', hold_expires_at: '2026-11-17T04:00:00Z' };
const workspace = row => ({ transactions: [row], customers: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [] });
function setup(api, now = () => deadline) {
  const { document } = parseHTML('<html><body><dialog></dialog></body></html>');
  const modal = document.querySelector('dialog');
  modal.close = () => { modal.open = false; };
  let title;
  const ui = createWorkspaceUI({ api, modal, nowMs: now, escape: value => String(value ?? ''),
    icon: () => '', money: value => `PHP ${value}`, formatDate: value => value || '', toast() {},
    showModal: (heading, html) => { title = heading; modal.innerHTML = html; modal.open = true; }
  });
  return { ui, modal, get title() { return title; } };
}
function assertExpired(view) {
  assert.equal(view.title, 'Rental details');
  assert.match(view.modal.textContent, /EXPIRED/);
  assert.match(view.modal.textContent, /This reservation expired.*submit a new request/);
  assert.equal(view.modal.querySelector('[data-mobile-rental-review]'), null);
  assert.equal(view.modal.querySelector('[data-rental-prepare]'), null);
  assert.equal(view.modal.querySelector('[type="submit"]'), null);
}

test('rental expiry matches the hold boundary and preserves rentals already in delivery or use', () => {
  assert.equal(rentalHoldExpired(rental, deadline - 1), false);
  assert.equal(rentalHoldExpired(rental, deadline), true);
  assert.equal(rentalHoldExpired({ ...rental, hold_expires_at: '2026-11-17 12:00:00' }, deadline), true);
  assert.equal(rentalHoldExpired({ ...rental, hold_expires_at: new Date(deadline) }, deadline), true);
  assert.equal(rentalHoldExpired({ status: 'EXPIRED' }, deadline), true);
  for (const status of ['ACTIVE', 'RETURN_PENDING_INSPECTION', 'COMPLETED', 'REJECTED', 'CANCELLED']) {
    assert.equal(rentalHoldExpired({ ...rental, status }, deadline), false);
  }
  for (const delivery_status of ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED']) {
    assert.equal(rentalHoldExpired({ ...rental, status: 'APPROVED', delivery_status }, deadline), false);
  }
  for (const hold_expires_at of [null, 'invalid']) assert.equal(rentalHoldExpired({ ...rental, hold_expires_at }, deadline), false);
});

test('old request notification fetches the current record instead of offering cached approval', async () => {
  const calls = [];
  const view = setup(async (path, options) => {
    if (path.startsWith('/workspace')) return workspace({ ...rental, hold_expires_at: '2026-11-17T05:00:00Z' });
    calls.push({ path, body: JSON.parse(options.body) });
    return { rental: { ...rental, status: 'EXPIRED' } };
  });
  await view.ui.load();
  await view.ui.openTransaction(rental.id, { rental, notificationType: 'BOOKING_REQUESTED' });
  assert.deepEqual(calls, [{ path: '/rentals/lookup', body: { kind: 'RENTAL', code: rental.id } }]);
  assertExpired(view);
});

test('elapsed hold shows expired details even before the server expiry worker updates status', async () => {
  const view = setup(async () => ({ rental }));
  await view.ui.openTransaction(rental.id, { refresh: true, notificationType: 'BOOKING_REQUESTED' });
  assertExpired(view);
  assert.equal(rental.status, 'PENDING_ADMIN_APPROVAL');
});

test('failed notification lookup shows retry without falling back to stale approval actions', async () => {
  const view = setup(async () => { throw Error('Connection lost'); });
  await view.ui.openTransaction(rental.id, { rental, notificationType: 'BOOKING_REQUESTED' });
  assert.match(view.modal.textContent, /Connection lost/);
  assert.ok(view.modal.querySelector('[data-retry-rental-open]'));
  assert.equal(view.modal.querySelector('[data-mobile-rental-review]'), null);
});

test('direct review entry points block expired cash and QR requests for approval and rejection', () => {
  const view = setup(async () => { throw Error('Unexpected API call'); });
  for (const payment_method of ['CASH', 'QR']) {
    for (const action of ['APPROVE', 'REJECT']) {
      view.ui.desk.reviewForm({ ...rental, payment_method, payment_proof_status: 'PENDING_REVIEW' }, action);
      assertExpired(view);
    }
  }
});

test('a request that expires while its review is open cannot be submitted', async t => {
  let now = deadline - 1, writes = 0;
  const view = setup(async () => { writes++; }, () => now);
  view.ui.desk.reviewForm(rental, 'APPROVE');
  assert.equal(view.title, 'Approve rental request');
  const form = view.modal.querySelector('form');
  form.reportValidity = () => true;
  t.mock.method(globalThis, 'FormData', function () { return [['notes', '']]; });
  now = deadline;
  form.dispatchEvent(new form.ownerDocument.defaultView.Event('submit', { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 0);
  assertExpired(view);
});

test('QR payment review also stops if the hold expires while the screenshot is open', async () => {
  let now = deadline - 1;
  const calls = [];
  const view = setup(async path => { calls.push(path); return { proof: {} }; }, () => now);
  view.ui.desk.reviewForm({ ...rental, payment_method: 'QR', payment_proof_status: 'PENDING_REVIEW' }, 'APPROVE');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.title, 'Review QR payment');
  now = deadline;
  await view.modal.querySelector('[data-verify-proof]').onclick();
  assert.deepEqual(calls, [`/rentals/${rental.id}/payment-proof`]);
  assertExpired(view);
});
