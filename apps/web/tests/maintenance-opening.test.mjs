import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceUI } from '../src/workspace-ui.js';
import { createMaintenanceUI } from '../src/maintenance.js';

const unit = { id: 'physical-unit', item_code: 'EQUIP-004', name: 'Bicycle', status: 'AVAILABLE', effective_status: 'AVAILABLE', is_active: true, open_rentals: 0, open_maintenance: 0, updated_at: 'old-version' };
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
function fixture(api) {
  const views = [], forms = [];
  let loadingNode = null, detailNode = null, actionButtons = [];
  const modal = { open: false, scrollTop: 0, close() { this.open = false; }, querySelector: selector => selector === 'form' ? forms.at(-1) : selector === '[data-maintenance-ticket-loading]' ? loadingNode : selector === '.maintenance-detail' ? detailNode : selector === '[data-maintenance-close]' ? { onclick: null } : null, querySelectorAll: selector => selector === '[data-maintenance-action]' ? actionButtons : [] };
  const helpers = { api, modal, escape: value => String(value ?? ''), money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded', icon: () => '', toast() {},
    showModal(title, html) {
      if (forms.length) forms.at(-1).isConnected = false;
      if (loadingNode) loadingNode.isConnected = false;
      if (detailNode) detailNode.isConnected = false;
      loadingNode = html.includes('data-maintenance-ticket-loading') ? { isConnected: true } : null;
      detailNode = html.includes('class="maintenance-detail"') ? { isConnected: true } : null;
      actionButtons = [...html.matchAll(/data-maintenance-action="([^"]+)"/g)].map(([, action]) => ({ dataset: { maintenanceAction: action }, onclick: null }));
      const nodes = Object.fromEntries(['[type="submit"]', '[role="alert"]', '[data-maintenance-loading]', '[data-maintenance-retry]', '[data-maintenance-back]'].map(key => [key, { disabled: false, hidden: false, textContent: '' }]));
      const form = { isConnected: true, elements: { itemId: { value: unit.id, disabled: true }, assignedTo: { value: '', disabled: true }, reason: { value: '' }, notes: { value: '' }, condition: { value: 'DAMAGED' }, priority: { value: 'NORMAL' }, targetDate: { value: '' }, photos: { files: [] } }, querySelector: selector => nodes[selector], nodes };
      forms.push(form); views.push({ title, html }); modal.open = true;
    },
    confirmSubmit(form, _options, callback) { form.submit = callback; form.confirmations = 0; form.onsubmit = () => { form.confirmations++; }; }, refresh: async () => {}, redraw() {}, model: () => ({ items: [unit], maintenance: [] }),
  };
  return { helpers, modal, views, forms, get form() { return forms.at(-1); } };
}

test('equipment maintenance opens immediately, checks only its unit and loads staff concurrently', async () => {
  const context = deferred(), staff = deferred(), calls = [];
  const f = fixture(path => { calls.push(path); return path === '/inventory/physical-unit' ? context.promise : staff.promise; });
  const ui = createWorkspaceUI(f.helpers);
  const opening = ui.openMaintenanceForUnit(unit.id, unit);
  assert.equal(f.views[0].title, 'Report equipment issue');
  assert.match(f.views[0].html, /Bicycle · EQUIP-004/);
  assert.match(f.views[0].html, /Issue summary/);
  assert.equal(f.form.nodes['[type="submit"]'].disabled, true);
  assert.deepEqual(calls, ['/inventory/physical-unit', '/maintenance-staff']);
  let prevented = false;
  f.form.onsubmit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(f.form.confirmations, 0);
  f.form.elements.reason.value = 'Rear brake loose';
  staff.resolve({ staff: [] });
  context.resolve({ item: { ...unit, updated_at: 'fresh-version' }, maintenance: [] });
  await opening;
  assert.equal(f.views.length, 1, 'loading must not replace the form or erase a draft');
  assert.equal(f.form.elements.reason.value, 'Rear brake loose');
  assert.equal(f.form.nodes['[type="submit"]'].disabled, false);
  assert.equal(f.form.nodes['[data-maintenance-loading]'].hidden, true);
  f.form.onsubmit({ preventDefault() {} });
  assert.equal(f.form.confirmations, 1);
});

test('a cancelled maintenance form stays closed when slow responses finish', async () => {
  const context = deferred();
  const f = fixture(path => path === '/maintenance-staff' ? Promise.resolve({ staff: [] }) : context.promise);
  const ui = createMaintenanceUI(f.helpers), opening = ui.reportForm(unit.id, unit);
  f.form.nodes['[data-maintenance-back]'].onclick();
  context.resolve({ item: unit, maintenance: [] });
  await opening;
  assert.equal(f.modal.open, false);
  assert.equal(f.views.length, 1);
  assert.equal(f.form.nodes['[type="submit"]'].disabled, true);
});

test('loading failures preserve the draft and retry without another modal or repeated staff read', async () => {
  let attempts = 0, staffReads = 0;
  const f = fixture(async path => {
    if (path === '/maintenance-staff') { staffReads++; return { staff: [] }; }
    if (++attempts === 1) throw Error('Connection unavailable. Try again.');
    return { item: { ...unit, updated_at: 'fresh-version' }, maintenance: [] };
  });
  const ui = createMaintenanceUI(f.helpers);
  const opening = ui.reportForm(unit.id, unit);
  f.form.elements.reason.value = 'Tyre punctured';
  await opening;
  assert.match(f.form.nodes['[role="alert"]'].textContent, /Connection unavailable/);
  assert.equal(f.form.nodes['[data-maintenance-retry]'].hidden, false);
  assert.equal(f.form.nodes['[type="submit"]'].disabled, true);
  await f.form.nodes['[data-maintenance-retry]'].onclick();
  assert.equal(f.views.length, 1);
  assert.equal(f.form.elements.reason.value, 'Tyre punctured');
  assert.equal(staffReads, 1);
  assert.equal(f.form.nodes['[type="submit"]'].disabled, false);
});

test('fresh availability locks block a report even when equipment details were available', async () => {
  const f = fixture(async path => path === '/maintenance-staff' ? { staff: [] } : { item: { ...unit, effective_status: 'RESERVED_PENDING', open_rentals: 1 }, maintenance: [] });
  await createMaintenanceUI(f.helpers).reportForm(unit.id, unit);
  assert.match(f.form.nodes['[role="alert"]'].textContent, /unavailable/);
  assert.equal(f.form.nodes['[type="submit"]'].disabled, true);
});

test('reports submit the refreshed unit revision and open an existing ticket instead of duplicating it', async () => {
  const writes = [], ticket = { id: 'ticket', maintenance_code: 'M-0001', item_id: unit.id, item_name: 'Bicycle', item_code: 'EQUIP-004', status: 'IN_PROGRESS', workflow_stage: 'REPORTED', reason: 'Brake loose' };
  const f = fixture(async (path, options) => {
    if (path === '/maintenance-staff') return { staff: [] };
    if (path === '/inventory/physical-unit') return { item: { ...unit, updated_at: 'fresh-version' }, maintenance: [] };
    if (path === '/maintenance') { writes.push(JSON.parse(options.body)); return { maintenance: ticket }; }
    return { maintenance: ticket, item: unit };
  });
  const ui = createMaintenanceUI(f.helpers);
  await ui.reportForm(unit.id, unit);
  f.form.elements.reason.value = 'Brake loose';
  const original = globalThis.FormData;
  globalThis.FormData = class { constructor(form) { this.form = form; } *[Symbol.iterator]() { for (const [name, field] of Object.entries(this.form.elements)) if ('value' in field) yield [name, field.value]; } };
  try { await f.form.submit(); } finally { globalThis.FormData = original; }
  assert.equal(writes[0].version, 'fresh-version');
  assert.equal(writes[0].itemId, unit.id);
  assert.equal(f.views.at(-1).title, 'Maintenance ticket', f.views.at(-1).html);

  const existing = fixture(async path => path === '/maintenance-staff' ? { staff: [] } : path.startsWith('/inventory/') ? { item: { ...unit, open_maintenance: 1 }, maintenance: [ticket] } : { maintenance: ticket, item: unit });
  await createMaintenanceUI(existing.helpers).reportForm(unit.id, unit);
  assert.equal(existing.views.at(-1).title, 'Maintenance ticket');
  assert.match(existing.views.at(-1).html, /M-0001/);
});

test('slow ticket details show loading immediately and do not reopen after close', async () => {
  const ticket = deferred(), f = fixture(() => ticket.promise), ui = createMaintenanceUI(f.helpers);
  const opening = ui.details('ticket');
  assert.equal(f.views[0].title, 'Loading maintenance ticket');
  assert.match(f.views[0].html, /role="status"/);
  f.modal.close();
  ticket.resolve({ maintenance: { id: 'ticket', status: 'IN_PROGRESS', workflow_stage: 'REPORTED' }, item: unit });
  await opening;
  assert.equal(f.views.length, 1);
  assert.equal(f.modal.open, false);
});

test('a ticket response cannot replace a different dialog opened while it loads', async () => {
  const ticket = deferred(), f = fixture(() => ticket.promise), ui = createMaintenanceUI(f.helpers);
  const opening = ui.details('ticket');
  f.helpers.showModal('Rental details', '<p>Rental content</p>');
  ticket.resolve({ maintenance: { id: 'ticket', status: 'IN_PROGRESS', workflow_stage: 'REPORTED' }, item: unit });
  await opening;
  assert.equal(f.views.at(-1).title, 'Rental details');
  assert.equal(f.views.length, 2);
});

test('closing an update while staff loads does not reopen its form', async () => {
  const staff = deferred(), ticket = { id: 'ticket', status: 'IN_PROGRESS', workflow_stage: 'REPORTED', item_code: 'EQUIP-004' };
  const f = fixture(path => path === '/maintenance-staff' ? staff.promise : Promise.resolve({ maintenance: ticket, item: unit }));
  const ui = createMaintenanceUI(f.helpers);
  await ui.details('ticket');
  assert.equal(f.views.at(-1).title, 'Maintenance ticket', f.views.at(-1).html);
  const openUpdate = f.modal.querySelectorAll('[data-maintenance-action]').find(button => button.dataset.maintenanceAction === 'update').onclick();
  f.modal.close();
  staff.resolve({ staff: [] });
  await openUpdate;
  assert.equal(f.views.at(-1).title, 'Maintenance ticket');
  assert.equal(f.modal.open, false);
});

test('a saved ticket refreshes data without reopening a form the admin closed', async () => {
  const response = deferred(), f = fixture(async (path) => path === '/maintenance-staff' ? { staff: [] } : path === '/inventory/physical-unit' ? { item: { ...unit, updated_at: 'fresh-version' }, maintenance: [] } : response.promise);
  const ui = createMaintenanceUI(f.helpers);
  await ui.reportForm(unit.id, unit);
  f.form.elements.reason.value = 'Rear brake loose';
  const original = globalThis.FormData;
  globalThis.FormData = class { constructor(form) { this.form = form; } *[Symbol.iterator]() { for (const [name, field] of Object.entries(this.form.elements)) if ('value' in field) yield [name, field.value]; } };
  try {
    const saving = f.form.submit();
    await Promise.resolve();
    f.modal.close();
    response.resolve({ maintenance: { id: 'ticket' } });
    await saving;
  } finally { globalThis.FormData = original; }
  assert.equal(f.modal.open, false);
  assert.equal(f.views.length, 1);
});
