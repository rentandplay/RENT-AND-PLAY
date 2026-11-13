import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createWorkspaceUI } from '../src/workspace-ui.js';
import { renderRentalNotifications } from '../src/notifications.js';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = { escape, icon: () => '', money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded' };
const originalDue = '2026-11-14T08:31:00.000Z', extendedDue = '2026-11-14T11:31:00.000Z';
const rental = { id: 'rental-332', rental_code: 'R-0332', customer_name: 'Sai', item_name: 'Bicycle', status: 'ACTIVE', due_at: originalDue, rental_fee: 4700, rental_paid_amount: 4700, balance_due: 0,
  extension_request: { status: 'PENDING', request_key: 'a'.repeat(32), original_due_at: originalDue, requested_due_at: extendedDue, additional_minutes: 180, additional_fee: 500 } };
const workspace = row => ({ transactions: [structuredClone(row)], customers: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [] });
function setup(api) {
  const { document } = parseHTML('<html><body><dialog></dialog></body></html>');
  const modal = document.querySelector('dialog'), messages = [];
  modal.close = () => { modal.open = false; };
  let title;
  const ui = createWorkspaceUI({ ...helpers, api, modal, toast: message => messages.push(message),
    showModal: (heading, html) => {
      title = heading; modal.innerHTML = html; modal.open = true;
      if (modal.querySelector('form')) modal.querySelector('form').reportValidity = () => true;
    }
  });
  return { ui, modal, messages, get title() { return title; } };
}
const submit = form => form.onsubmit({ preventDefault() {} });

test('pending extension details prioritize review over return intake on the Returns page', async () => {
  const view = setup(async () => workspace(rental));
  await view.ui.load(); view.ui.render('Returns', {});
  await view.ui.openTransaction(rental.id);
  assert.match(view.modal.textContent, /Rental extension · PENDING/);
  assert.match(view.modal.textContent, /3 Hours|3 hours/);
  assert.match(view.modal.textContent, /PHP 500/);
  assert.equal(view.modal.querySelector('[data-mobile-return-confirm]'), null);
  assert.equal(view.modal.querySelector('[data-go-to-returns]'), null);
  view.modal.querySelector('[data-review-extension]').click();
  assert.equal(view.title, 'Review rental extension');
  assert.equal(view.modal.querySelector('.primary').textContent, 'Approve extension');
});

test('extension notification bypasses stale cached rental and approval saves once, showing the active extended rental', async t => {
  let current = { ...rental, extension_request: undefined }, finishReview;
  const writes = [], lookups = [];
  const view = setup(async (path, options) => {
    if (path.startsWith('/workspace')) return workspace(current);
    if (path === '/rentals/lookup') { lookups.push(JSON.parse(options.body)); return { rental: structuredClone(current) }; }
    writes.push({ path, body: JSON.parse(options.body) });
    return new Promise(resolve => { finishReview = () => {
      current = { ...rental, due_at: extendedDue, rental_fee: 5200, balance_due: 500, extension_request: { ...rental.extension_request, status: 'APPROVED' } };
      resolve({ rental: structuredClone(current) });
    }; });
  });
  await view.ui.load(); view.ui.render('Returns', {});
  current = structuredClone(rental);
  const html = renderRentalNotifications({ notifications: [{ id: 'alert', type: 'EXTENSION_REQUESTED', rental_id: rental.id, rental_code: rental.rental_code }] }, helpers);
  const entry = parseHTML(html).document.querySelector('button');
  await view.ui.openTransaction(entry.dataset.notificationRental, { rentalCode: entry.dataset.rentalCode, notificationType: entry.dataset.notificationType });
  assert.deepEqual(lookups, [{ kind: 'RENTAL', code: rental.id }]);
  assert.equal(view.title, 'Review rental extension');
  const form = view.modal.querySelector('form');
  t.mock.method(globalThis, 'FormData', function () { return [['action', 'APPROVE'], ['reason', '']]; });
  const pending = submit(form); await submit(form);
  assert.deepEqual(writes, [{ path: `/rentals/${rental.id}/extension-review`, body: { action: 'APPROVE', reason: '', requestKey: rental.extension_request.request_key } }]);
  finishReview(); await pending;
  assert.equal(view.title, 'Rental details');
  assert.match(view.modal.textContent, /Rental extension · APPROVED/);
  assert.match(view.modal.textContent, new RegExp(extendedDue.replaceAll('.', '\\.')));
  assert.match(view.modal.textContent, /Active rental in progress/);
  assert.ok(view.modal.querySelector('[data-rental-settlement]'));
  assert.equal(view.modal.querySelector('[data-mobile-return-confirm]'), null);
  assert.match(view.messages[0], /Extension approved/);
});

test('rejection requires a reason, keeps errors reviewable, and shows committed state even when refresh fails', async t => {
  let attempts = 0;
  const rejected = { ...rental, extension_request: { ...rental.extension_request, status: 'REJECTED', reason: 'Next reservation overlaps' } };
  const view = setup(async path => {
    if (path === '/rentals/lookup') return { rental };
    if (path.startsWith('/workspace')) throw Error('Refresh unavailable');
    if (++attempts === 1) throw Error('Connection lost');
    return { rental: rejected };
  });
  await view.ui.openTransaction(rental.id, { notificationType: 'EXTENSION_REQUESTED' });
  const form = view.modal.querySelector('form');
  form.querySelector('[name="action"]').onchange({ target: { value: 'REJECT' } });
  assert.equal(form.querySelector('[name="reason"]').required, true);
  assert.equal(form.querySelector('.primary').textContent, 'Reject extension');
  t.mock.method(globalThis, 'FormData', function () { return [['action', 'REJECT'], ['reason', 'Next reservation overlaps']]; });
  await submit(form);
  assert.match(form.querySelector('.form-error').textContent, /Connection lost/);
  assert.equal(form.inert, false);
  await submit(form);
  assert.equal(view.title, 'Rental details');
  assert.match(view.modal.textContent, /REJECTED/);
  assert.match(view.modal.textContent, /Next reservation overlaps/);
  assert.match(view.modal.textContent, new RegExp(originalDue.replaceAll('.', '\\.')));
  assert.match(view.messages.at(-1), /Refresh the list/);
});

test('an old extension alert uses the reviewed state and a failed lookup never offers stale actions', async () => {
  const approved = { ...rental, due_at: extendedDue, extension_request: { ...rental.extension_request, status: 'APPROVED' } };
  const view = setup(async () => ({ rental: approved }));
  await view.ui.openTransaction(rental.id, { rental, notificationType: 'EXTENSION_REQUESTED' });
  assert.equal(view.title, 'Rental details');
  assert.equal(view.modal.querySelector('[data-review-extension]'), null);
  const failed = setup(async () => { throw Error('Offline'); });
  await failed.ui.openTransaction(rental.id, { rental, notificationType: 'EXTENSION_REQUESTED' });
  assert.match(failed.modal.textContent, /Offline/);
  assert.ok(failed.modal.querySelector('[data-retry-rental-open]'));
  assert.equal(failed.modal.querySelector('[data-mobile-return-confirm]'), null);
});
