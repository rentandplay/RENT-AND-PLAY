import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceUI } from '../src/workspace-ui.js';
import { renderAnalyticsReport } from '../src/analytics-report.js';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const helpers = { escape, icon: () => '', money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded' };
const model = (auditLogs = []) => ({ customers: [], transactions: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [], auditLogs });
const log = { id: 'audit-1', action: 'ITEM_CREATED', entity_type: 'ITEM', entity_id: 'item-1', entity_label: 'New basketball', actor_name: 'Ana Admin', actor_type: 'USER', created_at: '2026-10-05 18:00:00.000' };

test('invalidating the workspace after an equipment save loads fresh activities instead of cached empty history', async () => {
  let current = model(), reads = 0;
  const ui = createWorkspaceUI({ ...helpers, api: async () => { reads++; return structuredClone(current); } });
  await ui.load(); await ui.load(); assert.equal(reads, 1);
  assert.match(ui.render('Reports', {}), /No audit log entries/);
  current = model([log]); ui.invalidate();
  assert.match(ui.render('Reports', {}), /Loading reports/);
  await ui.load(); assert.equal(reads, 2);
  const html = ui.render('Reports', {});
  assert.match(html, /New basketball/); assert.match(html, /Ana Admin/); assert.match(html, /Item Created/);
  assert.ok(!html.includes('No audit log entries'));
});

test('an earlier request cannot overwrite fresh activity history after cache invalidation', async () => {
  let finishOld, reads = 0;
  const ui = createWorkspaceUI({ ...helpers, api: async () => ++reads === 1 ? new Promise(resolve => { finishOld = resolve; }) : model([log]) });
  const old = ui.load(); ui.invalidate(); await ui.load(); finishOld(model()); await old;
  assert.match(ui.render('Reports', {}), /New basketball/);
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

test('Reports distinguish unavailable audit data from a persisted empty history and escape activity labels', () => {
  const reportHelpers = { escape, paged: rows => ({ rows, footer: '' }), table: (headers, rows) => `<table>${rows}</table>` };
  const unavailable = renderAnalyticsReport({}, {}, { section: 'audit', details: {} }, reportHelpers);
  assert.match(unavailable, /Activity history unavailable/); assert.ok(!unavailable.includes('No audit log entries'));
  assert.match(renderAnalyticsReport(model(), {}, { section: 'audit', details: {} }, reportHelpers), /No audit log entries/);
  const html = renderAnalyticsReport(model([{ ...log, entity_label: '<script>bad</script>' }]), {}, { section: 'audit', details: {} }, reportHelpers);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/); assert.ok(!html.includes('<script>'));
});
