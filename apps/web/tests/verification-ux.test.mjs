import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const helpers = { escape: value => String(value ?? ''), icon: () => '', money: value => `PHP ${value}`, formatDate: String };
const snapshot = overrides => ({ transactions: [], verification: [], terminals: [], customers: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, ...overrides });

test('background verification refresh keeps loaded content stable without announcing routine loading', async () => {
  let finish, delayed = false;
  const data = snapshot({ terminals: [{ id: 'term', terminal_code: 'TERM-01', name: 'Saved counter', status: 'ONLINE', last_seen_at: new Date().toISOString() }] });
  const ui = createWorkspaceUI({ ...helpers, api: () => delayed ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(data) });
  assert.match(ui.render('ESP32 terminal', {}), /module-loading/);
  await ui.load();
  delayed = true;
  const refreshing = ui.refresh();
  const html = ui.render('ESP32 terminal', {});
  assert.match(html, /Saved counter/);
  assert.doesNotMatch(html, /module-sync-notice|module-loading|Updating esp32|session-spinner/);
  finish(data); await refreshing;
  assert.doesNotMatch(ui.render('ESP32 terminal', {}), /module-sync-notice/);
});

test('an offline empty terminal is not described as ready and hardware tests have no rental action', async () => {
  const data = snapshot({ terminals: [{ id: 'term', name: 'Counter', status: 'OFFLINE' }], verification: [{ id: 'test', request_code: 'V-9999', rental_id: 'test-rental', rental_code: 'R-9999', transaction_type: 'RENTAL', verification_code: 'TEST', status: 'CONFIRMED', requested_at: '2026-11-08T12:00:00Z' }] });
  const ui = createWorkspaceUI({ ...helpers, api: async () => data });
  await ui.load();
  const html = ui.render('ESP32 terminal', {});
  assert.match(html, /terminal offline/);
  assert.doesNotMatch(html, /Idle &amp; Ready|ONLINE &amp; POLLING/);
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  assert.ok(document.querySelector('.type-pill.hardware-test'));
  assert.equal(document.querySelector('[data-transaction-detail]'), null);
  assert.equal(document.querySelector('[data-terminal-guide]').hasAttribute('open'), false);
  assert.ok(document.querySelector('[data-terminal-device] #btn-terminal-test-ping'));
});

test('failed refresh remains visible with saved verification data and retry', async () => {
  let fail = false;
  const ui = createWorkspaceUI({ ...helpers, api: async () => {
    if (fail) throw Error('Connection unavailable');
    return snapshot({ terminals: [{ id: 'term', name: 'Saved counter' }] });
  } });
  await ui.load(); fail = true;
  await assert.rejects(ui.refresh());
  const html = ui.render('ESP32 terminal', {});
  assert.match(html, /Saved counter/);
  assert.match(html, /Connection unavailable/);
  assert.match(html, /last successfully loaded records/);
  assert.match(html, /Try again/);
});
