import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionWorkflow } from '../src/transaction-workflow.js';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = { escape, icon: () => '', money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded' };
const fixture = () => ({ customers: [], transactions: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [], auditLogs: [] });
const active = { id: 'mobile-rental', rental_code: 'R-MOBILE', status: 'ACTIVE', request_source: 'MOBILE_APP', item_name: 'Bike', customer_name: 'Customer', due_at: '2026-10-06 14:00:00', latest_return_request_status: 'PENDING_ADMIN_APPROVAL', mobile_return_request: { reported_condition: 'GOOD', notes: 'Ready for collection' } };

test('Rentals lists mobile admin approval and Returns exposes staff receipt even without a terminal', async () => {
  const data = { ...fixture(), transactions: [active, { ...active, id: 'pending-mobile', status: 'PENDING_ADMIN_APPROVAL' }] };
  const ui = createWorkspaceUI({ ...helpers, api: async () => data }); await ui.load();
  const rentals = ui.render('Rentals', {}), returns = ui.render('Returns', {});
  assert.match(rentals, /Pending admin review/); assert.match(rentals, /pending-mobile/);
  assert.match(returns, /Return desk/); assert.match(returns, /mobile-rental/); assert.match(returns, /Receive return/);
});

test('staff first records physical receipt, then submits inspection and penalty with separate retry keys', async () => {
  let title, html, submit, form, finishRefresh, refreshes = 0;
  const calls = [], data = { ...fixture(), transactions: [active] };
  const modal = { open: false, close() { this.open = false; }, querySelector: () => form };
  const field = value => ({ value, querySelector: () => ({ disabled: false }) });
  const makeForm = () => ({
    isConnected: true, reportValidity: () => true, addEventListener: (_event, callback) => { submit = () => callback({ preventDefault() {} }); },
    elements: { inventoryCode: field('rp-qr-bike'), physicalReceiptConfirmed: field('on'), condition: field('GOOD'), result: field('AVAILABLE'), inspectionNotes: field('All parts checked.'), accessoriesChecked: field('on'), penaltyAmount: field('0'), penaltyReason: field('') },
    querySelectorAll: () => [],
    querySelector: selector => ['[data-inspection-photos]', '[data-photo-preview]'].includes(selector) ? null : { disabled: false, textContent: '', onclick: null },
  });
  const workflow = createTransactionWorkflow({ ...helpers, modal, model: () => data,
    showModal: (heading, body) => { title = heading; html = body; modal.open = true; form = makeForm(); },
    confirmSubmit: (_form, _confirmation, callback) => { submit = callback; },
    api: async (path, options) => {
      calls.push({ path, payload: JSON.parse(options.body) });
      const rental = { ...active, status: path.endsWith('/receipt') ? 'RETURN_PENDING_INSPECTION' : 'COMPLETED', received_at: '2026-10-06T06:00:00Z' };
      data.transactions = [rental]; return { rental };
    },
    refresh: async () => { refreshes++; if (refreshes === 1) await new Promise(resolve => { finishRefresh = resolve; }); }, redraw() {}, toast() {},
  });
  const original = globalThis.FormData;
  globalThis.FormData = class { constructor(form) { this.form = form; } *[Symbol.iterator]() { for (const [name, field] of Object.entries(this.form.elements)) yield [name, field.value]; } };
  try {
    workflow.requestForm('RETURN', active.id);
    assert.equal(title, 'Record physical return'); assert.match(html, /stops overtime before inspection/);
    assert.equal(calls.length, 0);
    const receiving = submit();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(title, 'Inspect and confirm return', 'inspection opens even while workspace refresh is stalled');
    finishRefresh();
    await receiving;
    assert.equal(calls[0].path, '/rentals/mobile-rental/receipt');
    assert.equal(calls[0].payload.physicalReceiptConfirmed, true);
    assert.equal(calls[0].payload.inspection, undefined);
    assert.equal(title, 'Inspect and confirm return'); assert.match(html, /original saved rates/);
    assert.equal(calls.length, 1);
    await submit();
    assert.equal(calls[1].path, '/rentals/mobile-rental/complete-return');
    assert.equal(calls[1].payload.penaltyAmount, 0);
    assert.deepEqual(calls[1].payload.inspection, { condition: 'GOOD', result: 'AVAILABLE', notes: 'All parts checked.', accessoriesChecked: true, photos: [] });
    assert.match(calls[0].payload.requestKey, /^[a-f0-9]{32}$/); assert.notEqual(calls[0].payload.requestKey, calls[1].payload.requestKey);
    assert.equal(refreshes, 2); assert.equal(modal.open, false);
  } finally { globalThis.FormData = original; }
});

test('approved and received bookings stay visible without reporting a running timer or waiting for hardware', async () => {
  const data = { ...fixture(), transactions: [{ ...active, status: 'APPROVED', due_at: null, hold_expires_at: '2026-10-06T06:30:00Z' }, { ...active, id: 'received', status: 'RETURN_PENDING_INSPECTION' }] };
  const ui = createWorkspaceUI({ ...helpers, api: async () => data }); await ui.load();
  const rentals = ui.render('Rentals', {}), returns = ui.render('Returns', {});
  assert.match(rentals, /Awaiting handover/); assert.match(rentals, /Starts at handoff/);
  assert.match(rentals, /All open[^<]*<[^>]*>2</);
  assert.match(rentals, /data-transaction-filter="Awaiting handover"/);
  assert.match(rentals, /data-transaction-filter="Inspection pending"/);
  assert.match(returns, /inspection pending/i); assert.match(returns, /received/);
  assert.doesNotMatch(returns, /Awaiting terminal/);
});

test('openTransaction renders pending extension review CTA and refresh option bypasses stale cache', async () => {
  let modalHtml = '';
  let lookups = 0;
  const stale = {
    ...active,
    latest_return_request_status: null,
    mobile_return_request: null,
    extension_request: null,
  };
  const fresh = {
    ...stale,
    extension_request: {
      status: 'PENDING',
      request_key: 'a'.repeat(32),
      additional_minutes: 180,
      additional_fee: 500,
      original_due_at: '2026-10-06T06:00:00Z',
      requested_due_at: '2026-10-06T09:00:00Z',
      requested_at: '2026-10-06T05:00:00Z',
      quote: { billed_minutes: 180 },
    },
  };
  const modal = {
    open: false,
    close() { this.open = false; },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const ui = createWorkspaceUI({
    ...helpers,
    modal,
    showModal: (_title, html) => { modalHtml = html; modal.open = true; },
    api: async path => {
      if (path === '/rentals/lookup') {
        lookups++;
        return { rental: fresh };
      }
      return { ...fixture(), transactions: [stale] };
    },
  });
  await ui.load();
  await ui.openTransaction(stale.id, { rentalCode: stale.rental_code, refresh: true });
  assert.equal(lookups, 1);
  assert.match(modalHtml, /Extension request pending/);
  assert.match(modalHtml, /data-review-extension/);
  assert.match(modalHtml, /Review extension/);
});

