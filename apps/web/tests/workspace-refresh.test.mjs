import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceUI } from '../src/workspace-ui.js';
import { renderAnalyticsReport } from '../src/analytics-report.js';
import { parseHTML } from 'linkedom';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = { escape, icon: () => '', money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded' };
const model = (auditLogs = []) => ({ customers: [], transactions: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [], auditLogs });
const log = { id: 'audit-1', action: 'ITEM_CREATED', entity_type: 'ITEM', entity_id: 'item-1', entity_label: 'New basketball', actor_name: 'Ana Admin', actor_type: 'USER', created_at: '2026-10-05 18:00:00.000' };
const withRental = (name = 'New basketball', fee = 375.25) => ({ ...model([log]),
  items: [{ id: 'item-1', name, status: 'AVAILABLE', is_active: true, created_at: new Date(Date.now()-400*86400000).toISOString() }],
  transactions: [{ id: 'rental-1', item_id: 'item-1', status: 'COMPLETED', rental_fee: fee,
    confirmed_rental_at: new Date(Date.now()-86400000).toISOString(),
    due_at: new Date(Date.now()-82800000).toISOString(), confirmed_return_at: new Date(Date.now()-82800000).toISOString() }]
});
const kpiValues = html => [...parseHTML(html).document.querySelectorAll('#analytics-panel-performance > .ana-kpis > .ana-kpi > strong')].map(row => row.textContent);

test('invalidating after a saved handoff loads fresh equipment and rental totals instead of cached zero metrics', async () => {
  let current = model(), reads = 0;
  const ui = createWorkspaceUI({ ...helpers, api: async () => { reads++; return structuredClone(current); } });
  await ui.load(); await ui.load(); assert.equal(reads, 1);
  assert.equal(kpiValues(ui.render('Reports', {}))[1], '0');
  current = withRental(); ui.invalidate();
  assert.doesNotMatch(ui.render('Reports', {}), /Updating reports|module-sync-notice/);
  await ui.load(); assert.equal(reads, 2);
  const html = ui.render('Reports', {});
  assert.match(html, /New basketball/);
  assert.match(kpiValues(html)[0], /375\.25/);
  assert.equal(kpiValues(html)[1], '1');
  assert.doesNotMatch(html, /Ana Admin|Item Created|No audit log entries/);
});

test('an earlier request cannot overwrite fresh equipment and fee metrics after cache invalidation', async () => {
  let finishOld, reads = 0;
  const ui = createWorkspaceUI({ ...helpers, api: async () => ++reads === 1 ? new Promise(resolve => { finishOld = resolve; }) : withRental() });
  const old = ui.load(); ui.invalidate(); await ui.load(); finishOld(withRental('Stale basketball',99)); await old;
  const html = ui.render('Reports', {});
  assert.match(html, /New basketball/);
  assert.doesNotMatch(html, /Stale basketball/);
  assert.match(kpiValues(html)[0], /375\.25/);
  assert.equal(kpiValues(html)[1], '1');
  await ui.load(); assert.equal(reads, 2);
});

test('failed loads can retry and a signed-out session cannot restore cached records', async () => {
  let reads = 0;
  const retry = createWorkspaceUI({ ...helpers, api: async () => { if (++reads === 1) throw Error('Unavailable'); return model([log]); } });
  await assert.rejects(retry.load(), /Unavailable/); await retry.load(); assert.equal(reads, 2);
  let finish;
  const ui = createWorkspaceUI({ ...helpers, api: async () => new Promise(resolve => { finish = resolve; }) });
  const pending = ui.load(); ui.reset(); finish({ ...model([log]), settings: { business_name: 'Previous account' } }); await pending;
  assert.deepEqual(ui.business(), {}); assert.match(ui.render('Reports', {}), /Loading reports/);
});

test('the aggregate overview has the same metrics with unavailable empty or populated audit data and exposes no identities', () => {
  const reportHelpers = { escape, paged: rows => ({ rows, footer: '' }), table: (headers, rows) => `<table>${rows}</table>` };
  const base = withRental();
  base.customers = [{ id: 'customer-1', full_name: 'Private Customer', email: 'private@example.test' }];
  base.transactions[0].customer_name = 'Private Customer';
  const noAudit = { ...base }; delete noAudit.auditLogs;
  const states = [noAudit, { ...base, auditLogs: [] }, { ...base, auditLogs: [{ ...log, entity_label: '<script>bad</script>' }] }];
  const rendered = states.map(data => renderAnalyticsReport(data, {}, { section: 'audit', details: {} }, reportHelpers));
  for (const html of rendered) {
    assert.deepEqual(kpiValues(html), kpiValues(rendered[0]));
    assert.match(html, /New basketball/);
    assert.doesNotMatch(html, /Ana Admin|Private Customer|private@example\.test|<script>|&lt;script&gt;|Activity history unavailable|No audit log entries/);
  }
});
