import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {calculateDetailedAnalytics} from '../src/analytics-insights.js';
import {suggestAnalyticsGoals} from '../src/analytics-targets.js';
import {renderAnalyticsActionDetail} from '../src/analytics-review.js';
import {renderAnalyticsReport} from '../src/analytics-report.js';

const now=new Date('2026-11-17T04:00:00Z');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const helpers={escape,now,canViewSourceRecords:true,canManageTargets:true,paged:rows=>({rows:rows.slice(0,5),footer:''}),table:(heads,rows)=>`<table><thead><tr>${heads.map(head=>`<th>${head}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`};
const selection={period:'365d',groupBy:'monthly'};
function fixture(){
 const items=[{id:'a',stock_group_id:'a',name:'Cards',category_id:'cards',created_at:'2024-01-01',is_active:true},{id:'a2',stock_group_id:'a',name:'Cards',category_id:'cards',created_at:'2024-01-01',is_active:true},{id:'b',name:'Bike',category_id:'sports',created_at:'2024-01-01',is_active:true}];
 const transactions=Array.from({length:12},(_,i)=>({id:'r'+i,item_id:i%2?'a2':'a',status:'COMPLETED',confirmed_rental_at:new Date(Date.UTC(2025,11+i,2)).toISOString(),due_at:new Date(Date.UTC(2025,11+i,2,4)).toISOString(),received_at:new Date(Date.UTC(2025,11+i,2,5)).toISOString(),rental_fee:100}));
 transactions.push({id:'old-active',item_id:'a',status:'ACTIVE',confirmed_rental_at:'2026-01-01T04:00:00Z',due_at:'2026-01-02T04:00:00Z',rental_fee:100},{id:'bike-active',item_id:'b',status:'ACTIVE',confirmed_rental_at:'2026-11-16T01:00:00Z',due_at:'2026-11-16T03:00:00Z',rental_fee:500});
 return {items,transactions,settings:{analytics_targets:{monthly_fee_goal:2000,monthly_rental_goal:70}},verification:transactions.slice(1,7).map((r,i)=>({id:'v'+i,rental_id:r.id,terminal_id:'counter',status:'CONFIRMED',requested_at:new Date(Date.parse(r.confirmed_rental_at)-[20,60,90,120,30,80][i]*1000).toISOString(),confirmed_at:r.confirmed_rental_at})),maintenance:[{id:'m1',item_id:'a2',status:'COMPLETED',started_at:'2026-10-05T01:00:00Z',completed_at:'2026-10-05T02:00:00Z'},{id:'m2',item_id:'a2',status:'COMPLETED',started_at:'2026-10-06T01:00:00Z',completed_at:'2026-10-06T02:00:00Z'}]};
}

test('historical goal drafts use complete months, exact cents and the selected scope without altering owner settings',()=>{
 const model=fixture(),before=structuredClone(model.settings);
 const result=calculateDetailedAnalytics(model,{...selection,itemId:'a'},now);
 const suggestion=suggestAnalyticsGoals(result);
 assert.equal(suggestion.available,true);
 assert.equal(suggestion.months,6);
 assert.equal(suggestion.from,'2026-05-01');assert.equal(suggestion.to,'2026-10-31');
 assert.equal(suggestion.monthly_fee_goal,100);assert.equal(suggestion.monthly_rental_goal,1);
 assert.equal(suggestion.scoped,true);assert.deepEqual(model.settings,before);
 assert.equal(suggestAnalyticsGoals(calculateDetailedAnalytics(model,{period:'90d',groupBy:'daily'},now)).available,false);
});

test('direct priority evidence reconciles the displayed counts and scopes live overdue separately from selected-period returns',()=>{
 const model=fixture(),result=calculateDetailedAnalytics(model,{period:'90d',groupBy:'daily',itemId:'a'},now);
 assert.equal(result.evidence.overdueNow.length,result.totals.overdueNow);
 assert.equal(result.evidence.lateReturns.length,result.totals.overdueRentals);
 assert.deepEqual(result.evidence.overdueNow.map(row=>row.id),['old-active']);
 const detail=renderAnalyticsActionDetail(result,model,'overdue-now',helpers);
 const document=parseHTML(detail.html).document;
 assert.equal(document.querySelectorAll('tbody tr').length,1);
 assert.equal(document.querySelector('[data-record-type="transaction"]').dataset.recordId,'old-active');
 assert.equal(renderAnalyticsActionDetail(result,model,'overdue-now',{...helpers,canViewSourceRecords:false}),null);
 const yearly=calculateDetailedAnalytics(model,selection,now);
 assert.equal(yearly.evidence.slowConfirmations.length,4);
 assert.ok(yearly.evidence.slowConfirmations.every(row=>row.seconds>=60));
 const services=renderAnalyticsActionDetail(yearly,model,'service-a',helpers);
 assert.equal(parseHTML(services.html).document.querySelectorAll('tbody tr').length,2);
});

test('short date filters retain real zero buckets and reconcile grouped trends with confirmed records',()=>{
 const model=fixture();
 for(const period of ['7d','30d','90d','365d'])for(const groupBy of ['daily','weekly','monthly']){
  const result=calculateDetailedAnalytics(model,{period,groupBy},now);
  assert.equal(result.trend.reduce((sum,row)=>sum+row.rentals,0),result.totals.rentals);
  assert.equal(result.trend.reduce((sum,row)=>sum+Math.round(row.fees*100),0),Math.round(result.totals.fees*100));
  assert.ok(result.totals.rentals>0,period+' '+groupBy);
 }
});

test('owner report keeps long tables collapsed and omits sample issues while showing explicit comparison windows',()=>{
 const html=renderAnalyticsReport(fixture(),selection,{section:'performance'},helpers);
 const document=parseHTML(html).document;
 assert.equal(document.querySelector('[data-ana-disclosure="source-records"]').hasAttribute('open'),false);
 assert.equal(document.querySelector('[data-ana-disclosure="targets"]').hasAttribute('open'),false);
 assert.ok(document.querySelector('[data-analytics-info="metrics"]'));
 assert.match(document.querySelector('.ana-delta').textContent,/previous 365 days/);
 assert.doesNotMatch(html,/Design preview only|1 example rental/);
});
