import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const profiles = count => Array.from({ length: count }, (_, index) => ({
  id: `customer-${index + 1}`, full_name: `Customer ${String(index + 1).padStart(3, '0')}`,
  customer_code: `CUST-${String(index + 1).padStart(3, '0')}`, is_active: true
}));
const snapshot = (customers, nextCursor = null) => ({
  customers, transactions: [], items: [], categories: [], rates: [], maintenance: [], users: [], settings: {}, terminals: [], verification: [],
  view_meta: { view: 'Customers' }, page_meta: { kind: 'customers', limit: 100, nextCursor }
});
const helpers = { escape: value => String(value ?? ''), icon: () => '', money: String, formatDate: String };

async function directory(api, check) {
  const originalDocument = globalThis.document;
  const ui = createWorkspaceUI({ ...helpers, api });
  const render = () => {
    globalThis.document = parseHTML(ui.render('Customers', {})).document;
    for (const button of document.querySelectorAll('[data-remote-prev], [data-remote-next]')) {
      button.addEventListener = (_event, listener) => { button.navigate = listener; };
    }
    ui.bind('Customers', {}, render);
  };
  ui.render('Customers', {});
  await ui.load();
  render();
  try { await check({ ui, render, next: () => document.querySelector('[data-remote-next]').navigate(), previous: () => document.querySelector('[data-remote-prev]').navigate() }); }
  finally { globalThis.document = originalDocument; }
}
const names = () => [...document.querySelectorAll('.customer-identity strong')].map(element => element.textContent);
const summary = () => document.querySelector('.customer-directory .module-pagination > span').textContent;

test('nine customers display five then four, with honest ranges, totals and page counts', async () => {
  let reads = 0;
  await directory(async () => { reads++; return snapshot(profiles(9)); }, async ({ next, previous }) => {
    assert.equal(names().length, 5);
    assert.equal(summary(), '1–5 of 9 customers · Page 1 of 2 · 5 per page');
    assert.equal(document.querySelector('.customer-metric strong').textContent, '5');
    assert.ok(document.querySelector('[data-remote-prev]').disabled);
    assert.doesNotMatch(summary(), /100|loaded records/);
    await next();
    assert.deepEqual(names(), profiles(9).slice(5).map(row => row.full_name));
    assert.equal(summary(), '6–9 of 9 customers · Page 2 of 2 · 5 per page');
    assert.equal(document.querySelector('.customer-metric strong').textContent, '4');
    assert.ok(document.querySelector('[data-remote-next]').disabled);
    await previous();
    assert.equal(names().length, 5);
    assert.equal(reads, 1, 'changing display pages reuses the directory snapshot');
  });
});

test('customer navigation crosses server batches without skipping rows and returns to the last display page', async () => {
  const all = profiles(106), calls = [];
  await directory(async path => {
    const cursor = new URL(path, 'http://local').searchParams.get('cursor'); calls.push(cursor);
    return cursor ? snapshot(all.slice(100)) : snapshot(all.slice(0, 100), 'batch-two');
  }, async ({ next, previous }) => {
    for (let index = 0; index < 19; index++) await next();
    assert.deepEqual(names(), all.slice(95, 100).map(row => row.full_name));
    await next();
    assert.deepEqual(names(), all.slice(100, 105).map(row => row.full_name));
    assert.match(summary(), /Page 21/);
    await next();
    assert.deepEqual(names(), [all[105].full_name]);
    await previous(); await previous();
    assert.deepEqual(names(), all.slice(95, 100).map(row => row.full_name));
    assert.match(summary(), /Page 20/);
    assert.deepEqual(calls, [null, 'batch-two', null]);
  });
});

test('failed batch navigation retains the current page and retries the same cursor', async () => {
  let fail = true;
  const all = profiles(11), calls = [];
  await directory(async path => {
    const cursor = new URL(path, 'http://local').searchParams.get('cursor'); calls.push(cursor);
    if (cursor && fail) throw Error('Connection interrupted');
    return cursor ? snapshot(all.slice(10)) : snapshot(all.slice(0, 10), 'batch-two');
  }, async ({ next }) => {
    await next(); await next();
    assert.deepEqual(names(), all.slice(5, 10).map(row => row.full_name));
    assert.match(document.querySelector('.module-sync-notice').textContent, /Connection interrupted/);
    fail = false;
    await next();
    assert.deepEqual(names(), [all[10].full_name]);
    assert.deepEqual(calls, [null, 'batch-two', 'batch-two']);
  });
});
