import test from 'node:test';
import assert from 'node:assert/strict';
import { manilaDateTimeInput, manilaDateTimeIso } from '../src/date-time.js';
import { pageForPath, pageRoutes } from '../src/workspace-navigation.js';
import { createTransactionWorkflow, handoffChoices } from '../src/transaction-workflow.js';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = { escape, icon: () => '', money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded' };
const model = () => ({ customers: [], transactions: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [], auditLogs: [] });

function handoffFixture() {
  let current = { ...model(), transactions: [{ id: 'rental', rental_code: 'R-1', status: 'ACTIVE', rental_fee: 150 }], verification: [{ id: 'request', rental_id: 'rental', transaction_type: 'RETURN', status: 'PENDING', verification_code: '123456', terminal_id: 'terminal', penalty_amount: 50, penalty_reason: 'Missing piece', inspection: { condition: 'DAMAGED', result: 'UNDER_MAINTENANCE', notes: 'A damaged piece' } }] };
  const error = { textContent: '' }, button = { disabled: false, isConnected: true, textContent: '', addEventListener() {}, setAttribute() {}, removeAttribute() {} };
  const panel = { innerHTML: '', querySelector: selector => selector === '[data-handoff-error]' ? error : button };
  const title = { textContent: '' };
  const modal = { open: false, activePanel: null, querySelector: selector => selector === '[data-handoff-request]' ? modal.activePanel : selector === 'h2' ? title : button, querySelectorAll: () => [], setAttribute() {} };
  let sync = async () => {}, refreshes = 0;
  const workflow = createTransactionWorkflow({ ...helpers, modal, model: () => current,
    showModal: (heading, body) => { modal.open = true; modal.activePanel = panel; title.textContent = heading; panel.innerHTML = body; },
    refresh: async () => { refreshes++; await sync(); }, redraw() {} });
  return { workflow, modal, panel, title, error, button, setModel: value => { current = value; }, setSync: value => { sync = value; }, model: () => current, refreshes: () => refreshes };
}

test('an open handoff dialog refreshes terminal confirmation and final fees without resubmitting', async () => {
  const s = handoffFixture();
  s.workflow.verificationDetails('request');
  assert.match(s.panel.innerHTML, /Check confirmation/);
  assert.match(s.panel.innerHTML, /PHP 50/); assert.match(s.panel.innerHTML, /Missing piece/); assert.match(s.panel.innerHTML, /A damaged piece/);
  s.setSync(async () => s.setModel({ ...s.model(), transactions: [{ id: 'rental', status: 'COMPLETED', fee_breakdown: { rental_fee: 150, penalty_amount: 50, final_rental_charges: 200 } }], verification: [{ ...s.model().verification[0], status: 'CONFIRMED', confirmed_terminal_id: 'terminal', confirmed_at: '2026-10-05T13:00:00Z' }] }));
  assert.equal(await s.workflow.refreshPendingHandoff(), true);
  assert.equal(s.title.textContent, 'Return confirmed');
  assert.match(s.panel.innerHTML, /PHP 200/); assert.match(s.panel.innerHTML, /CONFIRMED/);
  assert.ok(!s.panel.innerHTML.includes('Check confirmation'));
  assert.equal(await s.workflow.refreshPendingHandoff(), false);
  assert.equal(s.refreshes(), 1);
});

test('handoff refresh errors retain the request and late refreshes cannot overwrite an inspection form', async () => {
  const s = handoffFixture(); s.workflow.verificationDetails('request');
  const original = s.panel.innerHTML;
  s.setSync(async () => { throw new Error('Network unavailable'); });
  await s.workflow.refreshPendingHandoff();
  assert.match(s.error.textContent, /Network unavailable/); assert.equal(s.panel.innerHTML, original); assert.equal(s.button.disabled, false);
  let resolve;
  s.setSync(() => new Promise(done => { resolve = done; }));
  const pending = s.workflow.refreshPendingHandoff();
  assert.equal(await s.workflow.refreshPendingHandoff(), false);
  s.modal.activePanel = null; s.title.textContent = 'Return inspection'; resolve(); await pending;
  assert.equal(s.title.textContent, 'Return inspection'); assert.equal(s.panel.innerHTML, original);
});

test('every workspace URL resolves to its intended page, including a trailing slash', () => {
  for (const [page, route] of Object.entries(pageRoutes)) {
    assert.equal(pageForPath(route), page);
    assert.equal(pageForPath(route + '/'), page);
  }
  assert.equal(pageForPath('/unknown'), 'Dashboard');
});

test('quote and checkout dates use Philippine time across midnight regardless of browser timezone', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Manila']) {
      process.env.TZ = timezone;
      assert.equal(manilaDateTimeInput('2026-10-05T18:30:00Z'), '2026-10-06T02:30');
      assert.equal(manilaDateTimeIso('2026-10-06T02:30'), '2026-10-05T18:30:00.000Z');
      assert.equal(manilaDateTimeIso('2028-02-29T12:00'), '2028-02-29T04:00:00.000Z');
    }
    assert.equal(manilaDateTimeIso(''), undefined);
    for (const date of ['2026-02-30T12:00', '2026-13-01T12:00', '2026-10-05T24:00', 'not a date']) assert.throws(() => manilaDateTimeIso(date), /valid date and time/);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('handoffs exclude archived customers, reserved equipment, unconfigured terminals, and pending return duplicates', () => {
  const data = { items: [{ id: 'free', status: 'AVAILABLE' }, { id: 'reserved', status: 'AVAILABLE' }, { id: 'archived', status: 'AVAILABLE', is_active: false }, { id: 'broken', status: 'UNDER_MAINTENANCE' }],
    customers: [{ id: 'active' }, { id: 'archived', is_active: false }], terminals: [{ id: 'ready', credentials_configured: true }, { id: 'missing-key' }, { id: 'inactive', credentials_configured: true, is_active: false }],
    transactions: [{ id: 'rental-1', item_id: 'reserved', status: 'PENDING_VERIFICATION' }, { id: 'rental-2', status: 'ACTIVE' }, { id: 'rental-3', status: 'ACTIVE' }, { id: 'rental-4', status: 'COMPLETED' }],
    verification: [{ rental_id: 'rental-2', type: 'RETURN', status: 'PENDING' }, { rental_id: 'rental-3', transaction_type: 'RETURN', status: 'EXPIRED' }] };
  const choices = handoffChoices(data);
  for (const [key, expected] of Object.entries({ items: ['free'], customers: ['active'], terminals: ['ready'], rentals: ['rental-3'] })) assert.deepEqual(choices[key].map(row => row.id), expected);
  assert.deepEqual(handoffChoices({}), { items: [], customers: [], terminals: [], rentals: [] });
});

test('due today shows upcoming returns separately from already overdue rentals on the same day', async () => {
  const now = new Date(), start = new Date(now.getTime() - 3600000), overdue = new Date(now.getTime() - 60000);
  const upcoming = new Date(now.getTime() + 60000);
  const ui = createWorkspaceUI({ ...helpers, api: async () => ({ ...model(), transactions: [
    { id: 'late', rental_code: 'OVERDUE-RECORD', item_name: 'Late item', customer_name: 'Customer', status: 'ACTIVE', confirmed_rental_at: start.toISOString(), due_at: overdue.toISOString() },
    { id: 'upcoming', rental_code: 'UPCOMING-RECORD', item_name: 'Upcoming item', customer_name: 'Customer', status: 'ACTIVE', confirmed_rental_at: start.toISOString(), due_at: upcoming.toISOString() }
  ] }) });
  await ui.load();
  const html = ui.render('Rentals', {});
  const sameManilaDay = manilaDateTimeInput(now).slice(0, 10) === manilaDateTimeInput(upcoming).slice(0, 10);
  assert.ok(html.includes(`data-transaction-filter="Due today" aria-pressed="false">Due today<span>${sameManilaDay ? 1 : 0}</span>`));
  assert.ok(html.includes('data-transaction-filter="Overdue" aria-pressed="false">Overdue<span>1</span>'));
});

test('transaction popularity counts confirmed rentals and excludes cancelled or unconfirmed requests', async () => {
  const ui = createWorkspaceUI({ ...helpers, api: async () => ({ ...model(), transactions: [
    { id: 'confirmed', item_name: 'Actually rented', status: 'COMPLETED', confirmed_rental_at: '2026-10-05T10:00:00Z' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `cancelled-${i}`, item_name: 'Never handed over', status: 'CANCELLED' })),
    { id: 'pending', item_name: 'Awaiting release', status: 'PENDING_VERIFICATION' }
  ] }) });
  await ui.load();
  const html = ui.render('Transaction History', {}), insight = html.slice(html.indexOf('class="popular-items"'), html.indexOf('class="panel history-insight-card history-workflow-card"'));
  assert.match(insight, /Actually rented/);
  assert.ok(!insight.includes('Never handed over')); assert.ok(!insight.includes('Awaiting release'));
});

test('failed initial loads show an actionable retry and successful retries recover the page', async () => {
  let reads = 0, retry, redraws = 0;
  const button = { disabled: false, textContent: '', addEventListener: (_, callback) => { retry = callback; } };
  const previous = globalThis.document;
  globalThis.document = { querySelector: selector => selector === '#module-retry' ? button : null };
  try {
    const ui = createWorkspaceUI({ ...helpers, api: async () => { if (++reads === 1) throw new Error('Connection <interrupted>'); return model(); } });
    await assert.rejects(ui.load(), /interrupted/);
    const html = ui.render('Customers', {});
    assert.match(html, /Couldn’t load this page/); assert.match(html, /Connection &lt;interrupted&gt;/); assert.match(html, /id="module-retry"/);
    ui.bind('Customers', {}, () => { redraws++; });
    assert.equal(reads, 1, 'a failed page must wait for explicit retry, without a request loop');
    retry({ currentTarget: button }); assert.equal(button.disabled, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 2); assert.equal(redraws, 1);
    assert.match(ui.render('Customers', {}), /Add your first customer/);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});

test('refresh failure retains visible records, labels them stale, and clears the notice after recovery', async () => {
  let fail = false;
  const data = { ...model(), customers: [{ id: 'customer', full_name: 'Saved customer', customer_code: 'CUST-01' }] };
  const ui = createWorkspaceUI({ ...helpers, api: async () => { if (fail) throw new Error('Temporary outage'); return data; } });
  await ui.load(); fail = true;
  await assert.rejects(ui.refresh(), /Temporary outage/);
  const html = ui.render('Customers', {});
  assert.match(html, /Saved customer/); assert.match(html, /last successfully loaded records/); assert.match(html, /Try again/);
  fail = false; await ui.refresh();
  assert.ok(!ui.render('Customers', {}).includes('last successfully loaded records'));
});

test('pricing editor preserves saved service hours when changing unrelated prices', async () => {
  const previous = globalThis.document;
  let openPricing, shown;
  const form = {}, close = {};
  globalThis.document = { querySelector: selector => selector === '#rate-catalog-edit' ? { addEventListener: (_, callback) => { openPricing = callback; } } : null, querySelectorAll: () => [] };
  try {
    const ui = createWorkspaceUI({ ...helpers, api: async () => ({ ...model(), pricing: { products: [], rules: { opens_at: '09:30', closes_at: '18:45', order_phone: '09000000000' } } }),
      showModal: (_, html) => { shown = html; }, modal: { querySelector: selector => selector === '[data-close]' ? close : form }, confirmSubmit: () => {} });
    await ui.load(); ui.bind('Rates & Fees', {}, () => {}); openPricing();
    assert.match(shown, /name="opensAt" type="time" value="09:30"/); assert.match(shown, /name="closesAt" type="time" value="18:45"/);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
