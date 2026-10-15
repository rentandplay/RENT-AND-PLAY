import test from 'node:test';
import assert from 'node:assert/strict';
import { financeDateRange, createFinanceUI } from '../src/finance-ui.js';
const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const data = {daily:[{business_day:'2026-10-15',collections:0}],totals:{collections:0,cash_collections:0,qr_collections:0,refunds:0,expenses:0,net_after_expenses:0,cash_net_movement:0},rental_totals:{charges:300,saved_paid:50,balance_due:250,refund_due:0,unposted_paid:50,unposted_count:1}};
const row = {id:'rental',rental_code:'R-0003',item_name:'Basketball',customer_name:'Customer',created_at:'2026-10-08T00:00:00Z',status:'COMPLETED',finance:{charges:300,saved_paid:50,balance_due:250,refund_due:0,unposted_paid:50,receipt_status:'RECEIPT_DATE_NEEDED'}};
const helpers = api => ({api,escape,money:value=>`PHP ${value}`,formatDate:value=>value});
test('finance defaults cover 30 Manila calendar days and handle midnight and month boundaries',()=>{
  assert.deepEqual(financeDateRange('30',new Date('2026-10-14T17:00:00Z')),{from:'2026-09-16',to:'2026-10-15'});
  assert.deepEqual(financeDateRange('month',new Date('2026-09-30T17:00:00Z')),{from:'2026-10-01',to:'2026-10-01'});
  assert.deepEqual(financeDateRange('today',new Date('2026-10-15T01:00:00Z')),{from:'2026-10-15',to:'2026-10-15'});
});
test('finance shows existing rental payments and balances while zero receipts use an explanatory empty chart',async()=>{
  const ui=createFinanceUI(helpers(async path=>{if(path.startsWith('/finance/summary'))return data;assert.equal(new URL(path,'http://localhost').searchParams.get('limit'),'5');return {records:[row]};}));
  assert.match(ui.render(),/Loading rental payments/);assert.doesNotMatch(ui.render(),/finance-metric accent/);
  await ui.refresh();const html=ui.render();
  assert.match(html,/Saved rental payments/);assert.match(html,/PHP 50/);assert.match(html,/PHP 250/);
  assert.match(html,/Add receipt date/);assert.match(html,/No dated receipts in this period/);assert.doesNotMatch(html,/class="finance-bars"/);
  assert.match(html,/5 per page/);
});
test('finance failures do not display fabricated zero totals and a successful retry recovers',async()=>{
  let fail=true;const ui=createFinanceUI(helpers(async path=>{if(fail)throw new Error('Payments unavailable');return path.startsWith('/finance/summary')?data:{records:[]};}));
  await ui.refresh();assert.match(ui.render(),/Payments unavailable/);assert.doesNotMatch(ui.render(),/finance-metric accent/);
  fail=false;await ui.refresh();assert.match(ui.render(),/Saved rental payments/);
});
