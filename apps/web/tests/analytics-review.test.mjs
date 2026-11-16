import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderAnalyticsReport } from '../src/analytics-report.js';
import { sourceEvidence } from '../src/analytics-review.js';
import { calculateDetailedAnalytics } from '../src/analytics-insights.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const helpers = {escape,now:new Date('2026-11-16T04:00:00Z'),paged:rows=>({rows:rows.slice(0,1),footer:'<p>Page one</p>'}),table:(headers,rows)=>`<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`};
const model = {items:[{id:'i',name:'<Bike>',is_active:true,created_at:'2025-01-01T00:00:00Z'}],transactions:[
  {id:'a',rental_code:'R-001',item_id:'i',status:'COMPLETED',confirmed_rental_at:'2026-11-14T02:00:00Z',confirmed_return_at:'2026-11-14T03:00:00Z',due_at:'2026-11-14T04:00:00Z',rental_fee:'123.45',customer_name:'Private Customer',customer_email:'private@example.test'},
  {id:'b',rental_code:'R-002',item_id:'i',status:'ACTIVE',confirmed_rental_at:'2026-11-15T02:00:00Z',due_at:'2026-11-15T04:00:00Z',rental_fee:50},
  {id:'c',item_id:'i',status:'CANCELLED',confirmed_rental_at:'2026-11-15T02:00:00Z',rental_fee:9999}
]};

test('record evidence reconciles all included rows before pagination without customer details',()=>{
  const result=calculateDetailedAnalytics(model,{period:'30d'},helpers.now);
  const html=sourceEvidence(result,model,{...helpers,canViewSourceRecords:true});
  const {document}=parseHTML(html);
  assert.match(html,/2 confirmed handoffs/);
  assert.match(html,/173\.45/);
  assert.equal(document.querySelectorAll('tbody tr').length,1);
  assert.equal(document.querySelector('[data-record-type="rental"]').dataset.recordId,'b');
  assert.doesNotMatch(html,/Private Customer|private@example|9,999/);
  assert.equal(document.querySelector('bike'),null);
});

test('review details escape owner text and are readable without owner edit access',()=>{
  const settings={analytics_targets:{review_plan:{objective:'<img src=x>',responsible_role:'Owner',review_on:'2026-12-01'}}};
  const html=renderAnalyticsReport({...model,settings},{period:'365d'},{section:'recommendations'},{...helpers,canManageTargets:false});
  const {document}=parseHTML(html);
  assert.equal(document.querySelector('img'),null);
  assert.equal(document.querySelector('#analytics-targets-form'),null);
  assert.match(document.querySelector('.ana-owner-plan').textContent,/<img src=x>/);
  assert.match(html,/Suggested responsibility/);
  assert.match(html,/Owner to assign|Owner/);
});
