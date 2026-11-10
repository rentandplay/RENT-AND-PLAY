import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createRentalDesk } from '../src/rental-desk.js';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

test('walk-in rental creation sorts available items first, keeps 60 min chip active, avoids quote jitter on customer edits, and restores search', async () => {
  const { document, window } = parseHTML('<html><body><dialog></dialog></body></html>');
  const dialog = document.querySelector('dialog');
  dialog.open = false;
  dialog.close = () => { dialog.open = false; };
  dialog.showModal = () => { dialog.open = true; };

  let quoteCalls = 0;
  const searchQueries = [];
  const model = {
    items: [
      { id: 'rented-1', name: 'Kayak', item_code: 'EQ-001', status: 'RENTED', is_active: true },
      { id: 'avail-1', name: 'Bicycle', item_code: 'EQ-002', status: 'AVAILABLE', is_active: true },
    ],
    customers: [
      { id: 'cust-1', full_name: 'Alice Guest', customer_code: 'C-01', phone: '09171112222', is_active: true },
      { id: 'cust-2', full_name: 'Bob Resort', customer_code: 'C-02', phone: '09173334444', is_active: true },
    ],
  };

  const desk = createRentalDesk({
    escape,
    money: v => `₱${Number(v || 0).toFixed(2)}`,
    formatDate: v => String(v || ''),
    modal: dialog,
    model: () => model,
    showModal: (_title, html) => {
      dialog.innerHTML = html;
      dialog.open = true;
      const form = dialog.querySelector('form');
      if (form) {
        const controls = [...form.querySelectorAll('input,select,textarea')];
        form.elements = Object.fromEntries(controls.filter(el => el.name).map(el => [el.name, el]));
        form.reportValidity = () => true;
        for (const el of controls) {
          el.setCustomValidity = () => {};
          el.focus = () => {};
          el.closest = () => null;
          if (el.tagName === 'SELECT') {
            Object.defineProperty(el, 'value', {
              configurable: true,
              get() {
                const opts = [...this.querySelectorAll('option')];
                const sel = opts.find(o => o.hasAttribute('selected'));
                return sel ? (sel.getAttribute('value') ?? sel.textContent) : (opts[0]?.getAttribute('value') ?? opts[0]?.textContent ?? '');
              },
              set(v) {
                for (const o of this.querySelectorAll('option')) {
                  const val = o.getAttribute('value') ?? o.textContent;
                  if (val === String(v)) o.setAttribute('selected', '');
                  else o.removeAttribute('selected');
                }
              },
            });
          }
        }
      }
    },
    confirmSubmit: () => {},
    toast: () => {},
    refresh: async () => {},
    redraw: () => {},
    api: async (path, options) => {
      if (path === '/pricing/quote') {
        quoteCalls++;
        const payload = JSON.parse(options.body);
        return {
          quote: {
            rental_fee: (payload.durationMinutes / 60) * 150,
            billed_minutes: payload.durationMinutes,
            overtime_rate: 150,
            overtime_unit_minutes: 60,
            grace_minutes: 10,
          },
        };
      }
      if (path.startsWith('/records/customers?')) {
        searchQueries.push(path);
        return { records: [model.customers[0]] };
      }
      return {};
    },
  });

  desk.bookingForm();

  const form = dialog.querySelector('form');
  assert.ok(form, 'bookingForm renders a form');

  // 1. Available equipment is sorted ahead of RENTED units and pre-selected
  const itemOptions = [...form.querySelectorAll('select[name="itemId"] option')];
  assert.equal(itemOptions[0].value, 'avail-1');
  assert.match(itemOptions[1].textContent, /In use — schedule ahead/);
  assert.equal(form.elements.itemId.value, 'avail-1');

  // 2. Default 60 min duration chip is marked active immediately
  const chip60 = form.querySelector('[data-duration-chip="60"]');
  const chip120 = form.querySelector('[data-duration-chip="120"]');
  assert.equal(chip60.classList.contains('active'), true);
  assert.equal(chip120.classList.contains('active'), false);

  // 3. Initial quote runs immediately (0ms delay) and enables Save
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(quoteCalls, 1);
  const saveBtn = form.querySelector('[type="submit"]');
  const quoteBox = form.querySelector('[data-quote-preview]');
  assert.equal(saveBtn.disabled, false);
  assert.match(quoteBox.textContent, /₱150\.00/);

  // 4. Selecting '+ New walk-in customer' & typing customer details does NOT invalidate or re-fetch quote
  form.elements.customerId.value = '__new';
  form.elements.customerId.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(form.querySelector('[data-new-customer]').hidden, false);

  form.elements.newFullName.value = 'Jhon Raven Saberon';
  form.elements.newFullName.dispatchEvent(new window.Event('input', { bubbles: true }));
  form.elements.newPhone.value = '09171234567';
  form.elements.newPhone.dispatchEvent(new window.Event('input', { bubbles: true }));
  form.elements.paymentMethod.value = 'QR';
  form.elements.paymentMethod.dispatchEvent(new window.Event('change', { bubbles: true }));

  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(quoteCalls, 1, 'customer edits and payment method must not trigger extra quote calls');
  assert.equal(saveBtn.disabled, false, 'Save stays enabled smoothly during customer data entry');
  assert.equal(quoteBox.classList.contains('is-calculating'), false);

  // 5. Clicking 120 min chip updates active chip and updates quote smoothly without collapsing box
  chip120.click();
  assert.equal(chip60.classList.contains('active'), false);
  assert.equal(chip120.classList.contains('active'), true);
  assert.ok(quoteBox.innerHTML.trim().length > 0, 'quote preview keeps stable height while updating');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(quoteCalls, 2);
  assert.match(quoteBox.textContent, /₱300\.00/);
  assert.equal(saveBtn.disabled, false);

  // 6. Searching and clearing customer search restores the full directory
  const searchInput = form.querySelector('[data-customer-search]');
  searchInput.value = 'Alice';
  searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(searchQueries.length, 1);
  assert.equal(form.querySelectorAll('select[name="customerId"] option').length, 3); // placeholder + Alice + __new

  searchInput.value = '';
  searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(form.querySelectorAll('select[name="customerId"] option').length, 4); // placeholder + Alice + Bob + __new
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('releaseForm resets scroll position cleanly when advancing to Step 2 and keeps CSS layout invariants intact', async () => {
  const { document } = parseHTML('<html><body><dialog></dialog></body></html>');
  const dialog = document.querySelector('dialog');
  dialog.open = false;
  dialog.close = () => { dialog.open = false; };

  let focusOptions;
  const approvedRental = {
    id: 'rental-324',
    rental_code: 'R-0324',
    item_name: 'Badminton Set',
    customer_name: 'please',
    delivery_location: 'ASRI Hotspring Resort',
    status: 'APPROVED',
    delivery_status: 'PREPARED',
    fulfillment_mode: 'DELIVERY',
    request_source: 'MOBILE_APP',
    rental_fee: 100,
    rental_paid_amount: 0,
  };

  const desk = createRentalDesk({
    escape,
    money: v => `₱${Number(v || 0).toFixed(2)}`,
    formatDate: v => String(v || ''),
    modal: dialog,
    model: () => ({ transactions: [approvedRental], items: [], customers: [] }),
    showModal: (_title, html) => {
      dialog.innerHTML = html;
      dialog.open = true;
      const form = dialog.querySelector('form');
      if (form) {
        const controls = [...form.querySelectorAll('input,select,textarea')];
        form.elements = Object.fromEntries(controls.filter(el => el.name).map(el => [el.name, el]));
        form.reportValidity = () => true;
        for (const el of controls) {
          el.setCustomValidity = () => {};
          el.closest = () => null;
          el.focus = opts => { focusOptions = opts; };
        }
      }
    },
    confirmSubmit: () => {},
    toast: () => {},
    refresh: async () => {},
    redraw: () => {},
    api: async pathUrl => {
      if (pathUrl.endsWith('/release-verification')) {
        return { rental: approvedRental, rental_verified: true, delivery_prepared: true, verification_mode: 'MANUAL' };
      }
      return {};
    },
  });

  desk.releaseForm(approvedRental);

  const form = dialog.querySelector('form.rental-release-form');
  const scroller = form.querySelector('.rental-flow-scroll');
  scroller.scrollTop = 180;

  form.elements.transactionCode.value = 'R-0324';
  const codeInputEvent = new (dialog.ownerDocument.defaultView.Event)('input', { bubbles: true });
  form.elements.transactionCode.dispatchEvent(codeInputEvent);
  form.querySelector('[data-verify-booking]').click();

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(form.querySelector('[data-release-panel="1"]').hidden, true);
  assert.equal(form.querySelector('[data-release-panel="2"]').hidden, false);
  assert.equal(scroller.scrollTop, 0);
  assert.deepEqual(focusOptions, { preventScroll: true });

  // Verify stylesheet regression guards for edge-to-edge layout and footer alignment
  const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
  const workspaceCss = fs.readFileSync(path.join(srcDir, 'workspace-design.css'), 'utf8');
  const stylesCss = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');

  assert.match(workspaceCss, /#modal\[open\] > \.admin-form\.rental-release-form[^}]*align-items:\s*stretch/);
  assert.match(workspaceCss, /#modal\[open\] > \.admin-form\.rental-release-form[^}]*padding:\s*0/);
  assert.match(workspaceCss, /#modal :is\(\.rental-release-footer,\.transaction-detail-footer\) > \.form-actions[^}]*border:\s*0/);
  assert.match(stylesCss, /\.emergency-terminal-bypass\[hidden\],\s*\.emergency-bypass-drawer\[hidden\][^}]*display:\s*none\s*!important/);
});
