import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinanceUI} from '../src/finance-ui.js';
import {createRentalPlanning} from '../src/rental-planning.js';
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const summary=n=>({totals:{collections:n,cash_collections:n,qr_collections:0,refunds:0,expenses:0,net_collected:n,cash_net_movement:n,net_after_expenses:n},rental_totals:{},daily:[{business_day:'2026-10-15',collections:n}],basis:'Recorded receipts only'});
test('changed payment dates cannot be overwritten by an older in-flight summary or ledger',async()=>{
 const pending=[],handlers={};const prior=globalThis.document;
 globalThis.document={querySelector:selector=>({addEventListener:(event,handler)=>handlers[selector]=handler}),querySelectorAll:()=>[]};
 try{
  const ui=createFinanceUI({api:path=>new Promise(resolve=>pending.push({path,resolve})),escape,money:n=>'PHP '+n,formatDate:String});
  const first=ui.refresh();ui.bind(()=>{});handlers['#finance-from']({target:{value:'2026-01-01'}});
  assert.equal(pending.length,4);pending[2].resolve(summary(40));pending[3].resolve({records:[],nextCursor:null});await Promise.resolve();await Promise.resolve();
  pending[0].resolve(summary(999));pending[1].resolve({records:[{rental_code:'old-row'}]});await first;
  assert.match(ui.render(),/PHP 40/);assert.doesNotMatch(ui.render(),/PHP 999|old-row/);
 }finally{globalThis.document=prior;}
});
test('the calendar escapes records, exposes a day filter and shows the selected scheduled time',()=>{
 const ui=createRentalPlanning({escape,formatDate:String});const html=ui.calendar([{id:'rental',rental_code:'R-0001',item_name:'<script>',customer_name:'Customer',status:'APPROVED',scheduled_start_at:'2026-10-15T02:00:00Z',delivery_location:'Lakewood'}],'2026-10-15');
 assert.match(html,/id="delivery-calendar-day" value="2026-10-15"/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Confirmed schedule/);assert.doesNotMatch(html,/<script>/);
});
