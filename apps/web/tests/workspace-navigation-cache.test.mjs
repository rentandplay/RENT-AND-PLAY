import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createWorkspaceUI } from '../src/workspace-ui.js';
import { createReportPayments } from '../src/report-payments.js';
import { createInventory } from '../src/inventory.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const helpers = { escape, icon: () => '', money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded' };
const user = { id: 'owner', role: 'OWNER' };
const snapshot = path => {
  const params = new URL(path, 'http://localhost').searchParams;
  return { customers: [], transactions: [], items: [], categories: [], rates: [], maintenance: [], users: [], terminals: [], verification: [], auditLogs: [],
    settings: { business_name: params.get('view') }, pricing: { products: [], rules: {} },
    view_meta: { view: params.get('view'), from: params.get('from'), to: params.get('to') } };
};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('revisiting a loaded page renders immediately and makes zero additional requests', async () => {
  const calls = [];
  const ui = createWorkspaceUI({ ...helpers, api: async path => { calls.push(path); return snapshot(path); } });
  for (const page of ['Reports', 'Customers', 'Rates & Fees', 'Reports', 'Customers', 'Rates & Fees']) {
    ui.render(page, user); await ui.load();
    assert.doesNotMatch(ui.render(page, user), /module-loading|module-load-error/);
    assert.equal(ui.business().business_name, page);
  }
  assert.equal(calls.length, 3, 'one request per visited page, rather than one per navigation');
});

test('a stale cached page stays visible while a deduplicated background request refreshes it', async () => {
  let now = 1000, pending;
  const calls = [];
  const ui = createWorkspaceUI({ ...helpers, nowMs: () => now, api: path => { calls.push(path); return pending ? pending.promise : Promise.resolve(snapshot(path)); } });
  ui.render('Reports', user); await ui.load();
  ui.render('Customers', user); await ui.load();
  now += 31000; pending = deferred();
  assert.doesNotMatch(ui.render('Reports', user), /module-loading/);
  const first = ui.load(), second = ui.load();
  assert.equal(calls.length, 3);
  assert.equal(ui.business().business_name, 'Reports');
  pending.resolve({ ...snapshot(calls.at(-1)), settings: { business_name: 'Updated report' } });
  await Promise.all([first, second]);
  assert.equal(ui.business().business_name, 'Updated report');
});

test('navigation does not wait for another page and late responses cannot replace the active page', async () => {
  const reports = deferred(), customers = deferred(), paths = [];
  const ui = createWorkspaceUI({ ...helpers, api: path => { paths.push(path); return path.includes('view=Reports') ? reports.promise : customers.promise; } });
  ui.render('Reports', user); const old = ui.load();
  ui.render('Customers', user); const current = ui.load();
  assert.equal(paths.length, 2, 'both pages start without serializing behind the first request');
  customers.resolve(snapshot(paths[1])); await current;
  reports.resolve(snapshot(paths[0])); await old;
  assert.equal(ui.business().business_name, 'Customers');
  assert.doesNotMatch(ui.render('Reports', user), /module-loading/);
  assert.equal(ui.business().business_name, 'Reports', 'late response is still cached for a later visit');
});

test('hover prefetch is shared with navigation without altering the current page', async () => {
  let reads = 0, path;
  const pending = deferred();
  const ui = createWorkspaceUI({ ...helpers, api: next => { reads++; path = next; return pending.promise; } });
  const preload = ui.prefetch('Reports');
  assert.deepEqual(ui.business(), {});
  ui.render('Reports', user); const load = ui.load();
  assert.equal(reads, 1);
  pending.resolve(snapshot(path)); await Promise.all([preload, load]);
  assert.doesNotMatch(ui.render('Reports', user), /module-loading/);
});

test('sign-in preloading makes the first visit to every workspace page render without another request', async () => {
  let reads = 0, active = 0, peak = 0;
  const ui = createWorkspaceUI({ ...helpers, whenIdle: async () => {}, api: async path => {
    reads++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    return path.startsWith('/finance/') ? { daily: [], totals: {}, rental_totals: {}, records: [] } : snapshot(path);
  } });
  ui.render('Reports', user); await ui.load();
  await ui.preloadPages({ skipViews: ['Reports'] });
  const warmedReads = reads;
  for (const page of ['Customers', 'Rentals', 'Returns', 'Rates & Fees', 'Maintenance', 'Settings', 'Transaction History', 'ESP32 terminal', 'Reports', 'Payments']) {
    assert.doesNotMatch(ui.render(page, user), /module-loading|Loading rental payments/);
    if (page !== 'Payments') await ui.load();
  }
  assert.equal(reads, warmedReads, 'first clicks reuse data obtained in advance');
  assert.ok(peak <= 3, 'two background workers, with the cash worker issuing two related queries');
});

test('sign-out cancels queued preloading and ignores snapshots that finish afterward', async () => {
  const pending = [], paths = [];
  const ui = createWorkspaceUI({ ...helpers, whenIdle: async () => {}, api: path => {
    const request = deferred(); paths.push(path); pending.push(request); return request.promise;
  } });
  const preload = ui.preloadPages();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(paths.length, 2);
  ui.reset(); pending.forEach((request, index) => request.resolve(snapshot(paths[index]))); await preload;
  assert.equal(paths.length, 2); assert.deepEqual(ui.business(), {});
  assert.match(ui.render('Reports', user), /module-loading/);
});

test('writes invalidate snapshots and sign-out discards every cached page and in-flight result', async () => {
  let reads = 0;
  const ui = createWorkspaceUI({ ...helpers, api: async path => { reads++; return snapshot(path); } });
  ui.render('Reports', user); await ui.load(); ui.render('Customers', user); await ui.load();
  ui.invalidate(); ui.render('Reports', user); await ui.load(); assert.equal(reads, 3);
  ui.reset(); assert.deepEqual(ui.business(), {});
  assert.match(ui.render('Customers', user), /module-loading/); await ui.load(); assert.equal(reads, 4);
});

test('filter changes use the correct cached query and local analytics controls make no new workspace reads', async () => {
  const { document } = parseHTML('<html><body></body></html>');
  const original = globalThis.document; globalThis.document = document;
  try {
    let reads = 0;
    const ui = createWorkspaceUI({ ...helpers, api: async path => { reads++; return snapshot(path); } });
    ui.setReportSection('forecast'); ui.render('Reports', user); await ui.load();
    document.body.innerHTML = ui.render('Reports', user); ui.bind('Reports', user, () => {});
    const category = document.querySelector('#analytics-category');
    category.dispatchEvent(new document.defaultView.Event('change'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 1);
    const period = document.querySelector('#analytics-period');
    [...period.options].find(option => option.value === '7d').selected = true;
    period.dispatchEvent(new document.defaultView.Event('change'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 2, 'a different date window actually requires server data');
  } finally { globalThis.document = original; }
});

test('cash queries run only when the cash breakdown is expanded', async () => {
  const { document, window } = parseHTML('<html><body><details data-analytics-detail="money"></details></body></html>');
  const original = globalThis.document; globalThis.document = document;
  try {
    const calls = [], pending = deferred();
    const report = createReportPayments({ ...helpers, api: path => { calls.push(path); return pending.promise; } });
    report.render({ from: '2026-10-01', to: '2026-10-30' }); report.bind(() => {});
    assert.equal(calls.length, 0);
    const detail = document.querySelector('details'); detail.open = true; detail.dispatchEvent(new window.Event('toggle'));
    assert.equal(calls.length, 2);
    detail.dispatchEvent(new window.Event('toggle')); assert.equal(calls.length, 2);
    pending.resolve({ daily: [], basis: 'Receipts', totals: {} });
    await new Promise(resolve => setImmediate(resolve));
  } finally { globalThis.document = original; }
});

test('equipment refresh reuses recent data, while saves and force refresh bypass it', async () => {
  let now = 0; const calls = [];
  const inventory = createInventory({ ...helpers, nowMs: () => now, api: async path => { calls.push(path); return path === '/inventory' ? { items: [], categories: [] } : { products: [] }; } });
  await inventory.refresh(); await inventory.refresh();
  assert.equal(calls.filter(path => path === '/inventory').length, 1);
  assert.equal(calls.filter(path => path === '/pricing').length, 1);
  inventory.invalidate(); await inventory.refresh(); assert.equal(calls.filter(path => path === '/inventory').length, 2);
  await inventory.refresh({ force: true }); assert.equal(calls.filter(path => path === '/inventory').length, 3);
  now += 31000; await inventory.refresh(); assert.equal(calls.filter(path => path === '/inventory').length, 4);
});


test('simultaneous live and polling refreshes share one request without blocking another page', async () => {
  const requests = [];
  const ui = createWorkspaceUI({ ...helpers, api: path => {
    const pending = deferred(); requests.push({ path, pending }); return pending.promise;
  } });
  ui.render('Rentals', user);
  const first = ui.refresh(), second = ui.refresh();
  assert.equal(first, second);
  assert.equal(requests.length, 1);
  ui.render('Returns', user);
  const otherPage = ui.refresh();
  assert.equal(requests.length, 2);
  requests[1].pending.resolve(snapshot(requests[1].path)); await otherPage;
  requests[0].pending.resolve(snapshot(requests[0].path)); await first;
  assert.equal(ui.business().business_name, 'Returns');
});
