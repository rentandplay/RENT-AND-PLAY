import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const owner = { id: 'owner', role: 'OWNER', name: 'Workspace Owner' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const base = () => ({ customers: [], transactions: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: { business_name: 'Rent & Play' }, terminals: [], verification: [], auditLogs: [] });
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };

async function fixture(patch, initialTargets = null) {
  const originals = new Map(['document', 'window', 'FormData'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const { document, window } = parseHTML('<html><body><main></main></body></html>');
  globalThis.document = document; globalThis.window = window;
  // Node's FormData does not accept HTMLFormElement. Read the real mounted fields
  // with the same successful-control name/value semantics needed by this form.
  globalThis.FormData = class {
    constructor(form) { this.rows = [...form.querySelectorAll('input[name]')].filter(field => !field.disabled).map(field => [field.name, field.value]); }
    *[Symbol.iterator]() { yield* this.rows; }
  };
  let current = base(), redraws = 0;
  if (initialTargets) current.settings.analytics_targets = initialTargets;
  const calls = [], toasts = [];
  const ui = createWorkspaceUI({ escape, icon: () => '', money: value => String(value), formatDate: value => value || '', toast: text => toasts.push(text),
    api: async (path, options = {}) => {
      calls.push({ path, ...options });
      if (options.method === 'PATCH') {
        const response = await patch(JSON.parse(options.body), calls.filter(call => call.method === 'PATCH').length);
        if (response?.settings) current = { ...current, settings: response.settings };
        return response;
      }
      assert.ok(path.startsWith('/workspace?'), path);
      return structuredClone(current);
    }
  });
  ui.render('Reports', owner); await ui.load();
  const main = document.querySelector('main');
  let renderedHTML = ui.render('Reports', owner);
  const redraw = () => { redraws++; const next = ui.render('Reports', owner); if (next !== renderedHTML) { main.innerHTML = next; renderedHTML = next; } };
  main.innerHTML = renderedHTML;
  const form = main.querySelector('#analytics-targets-form');
  assert.ok(form, 'owner target form is rendered through the actual workspace controller');
  let handler;
  const add = form.addEventListener.bind(form);
  form.addEventListener = (type, listener, ...options) => { if (type === 'submit') handler = listener; return add(type, listener, ...options); };
  ui.bind('Reports', owner, redraw);
  const cleanup = () => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
  return { ui, form, main, calls, toasts, redraws: () => redraws,
    set: values => { for (const [name, value] of Object.entries(values)) form.querySelector('[name="' + name + '"]').value = value; },
    submit: () => handler({ preventDefault() {} }), cleanup };
}

test('owner target form sends ratios, preserves zero tolerance, clears blank goals and prevents duplicate submission', async () => {
  const pending = deferred(); let payload;
  const f = await fixture(async value => { payload = value; return pending.promise; });
  try {
    f.set({ monthly_fee_goal: '12500.25', monthly_rental_goal: '', utilization_goal: '35', overdue_rate_alert: '0' });
    const saving = f.submit();
    assert.deepEqual(payload, { monthly_fee_goal: 12500.25, monthly_rental_goal: null, utilization_goal: .35, overdue_rate_alert: 0 });
    assert.equal(f.form.querySelector('[type="submit"]').disabled, true);
    assert.equal(f.form.querySelector('[type="submit"]').textContent, 'Saving…');
    await f.submit();
    assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
    assert.equal(f.calls.find(call => call.method === 'PATCH').path, '/settings/analytics');
    pending.resolve({ settings: { business_name: 'Rent & Play', analytics_targets: payload } });
    await saving;
    assert.equal(f.calls.filter(call => call.path.startsWith('/workspace?')).length, 2, 'save refreshes the workspace from the API');
    assert.equal(f.redraws(), 1);
    assert.deepEqual(f.ui.business().analytics_targets, payload);
    assert.equal(f.main.querySelector('[name="utilization_goal"]').value, '35');
    assert.equal(f.main.querySelector('[name="overdue_rate_alert"]').value, '0');
    assert.equal(f.main.querySelector('[name="monthly_rental_goal"]').value, '');
    assert.ok(f.toasts.includes('Business targets saved for the workspace.'));
  } finally { f.cleanup(); }
});

test('target save failure remains visible, preserves entered values and permits a corrected retry', async () => {
  const retry = deferred();
  const f = await fixture(async (value, attempt) => { if (attempt === 1) throw new Error('Only the owner can save these targets.'); return retry.promise; });
  try {
    f.set({ monthly_fee_goal: '', monthly_rental_goal: '80', utilization_goal: '', overdue_rate_alert: '12.5' });
    await f.submit();
    assert.match(f.form.querySelector('.form-error').textContent, /Only the owner/);
    assert.equal(f.form.querySelector('[type="submit"]').disabled, false);
    assert.equal(f.form.querySelector('[type="submit"]').textContent, 'Save business targets');
    assert.equal(f.form.querySelector('[name="monthly_rental_goal"]').value, '80');
    assert.equal(f.redraws(), 0, 'error leaves the editable form in place');
    const saving = f.submit();
    assert.equal(f.form.querySelector('.form-error').textContent, '');
    const sent = JSON.parse(f.calls.filter(call => call.method === 'PATCH')[1].body);
    assert.deepEqual(sent, { monthly_fee_goal: null, monthly_rental_goal: 80, utilization_goal: null, overdue_rate_alert: .125 });
    retry.resolve({ settings: { business_name: 'Rent & Play', analytics_targets: sent } }); await saving;
    assert.equal(f.redraws(), 1);
    assert.equal(f.main.querySelector('.form-error').textContent, '');
    assert.equal(f.main.querySelector('[name="monthly_rental_goal"]').value, '80');
  } finally { f.cleanup(); }
});

test('saving unchanged targets restores the button when the workspace keeps identical markup', async () => {
  const initial = { monthly_fee_goal: 12000, monthly_rental_goal: 80, utilization_goal: .35, overdue_rate_alert: 0 };
  const f = await fixture(async value => ({ settings: { business_name: 'Rent & Play', analytics_targets: value } }), initial);
  try {
    await f.submit();
    assert.equal(f.main.querySelector('#analytics-targets-form'), f.form, 'same HTML is retained like WorkspaceSection');
    assert.equal(f.form.querySelector('[type="submit"]').disabled, false);
    assert.equal(f.form.querySelector('[type="submit"]').textContent, 'Save business targets');
    await f.submit();
    assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 2, 'unchanged save does not leave the form stuck');
  } finally { f.cleanup(); }
});
