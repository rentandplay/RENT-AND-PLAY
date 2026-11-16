import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsCsv } from '../src/analytics.js';
import { calculateDetailedAnalytics } from '../src/analytics-insights.js';

// Parse the saved bytes, including escaped quotes and embedded newlines.
function parseCsv(text) {
  const rows=[]; let row=[],cell='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"'){cell+='"';i++;} else quoted=!quoted; }
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  row.push(cell);rows.push(row);return rows;
}
const block=(rows,title)=>{const at=rows.findIndex(row=>row[0].includes(`=== ${title}`));assert.ok(at>=0,title);const next=rows.findIndex((row,i)=>i>at&&row[0].includes('=== '));return rows.slice(at+1,next<0?rows.length:next);};
const value=(rows,key)=>rows.find(row=>row[0]===key);
const now=new Date('2026-11-15T04:00:00Z');
const selection={period:'custom',from:'2025-11-01',to:'2026-10-31',groupBy:'monthly'};
function fixture(){
  return {items:[{id:'ball',name:'Ball, "blue"\nset',category_id:'sports',is_active:true,created_at:'2024-01-01'}],categories:[{id:'sports',name:'Sports'}],settings:{analytics_targets:{monthly_fee_goal:1000,monthly_rental_goal:10,utilization_goal:.12}},transactions:Array.from({length:12},(_,m)=>Array.from({length:m+1},(_,i)=>({id:`${m}-${i}`,item_id:'ball',status:'COMPLETED',confirmed_rental_at:new Date(Date.UTC(2025,10+m,5,1+i)).toISOString(),received_at:new Date(Date.UTC(2025,10+m,5,2+i)).toISOString(),due_at:new Date(Date.UTC(2025,10+m,5,3+i)).toISOString(),rental_fee:100}))).flat()};
}

test('parsed CSV totals reconcile across trends, categories and equipment including multiline labels',()=>{
  const model=fixture();
  model.transactions.push({id:'cancelled',item_id:'ball',status:'CANCELLED',confirmed_rental_at:'2026-10-05T01:00:00Z',rental_fee:9999});
  const result=calculateDetailedAnalytics(model,selection,now),rows=parseCsv(analyticsCsv(result,model,selection));
  assert.equal(value(block(rows,'KEY PERFORMANCE'), 'Confirmed rentals')[1],'78');
  assert.equal(value(block(rows,'KEY PERFORMANCE'), 'Confirmed rental fees (PHP)')[1],'7800');
  const trend=block(rows,'HISTORICAL DEMAND TREND').filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row[0]));
  assert.equal(trend.reduce((n,row)=>n+Number(row[3]),0),7800);
  assert.equal(trend.reduce((n,row)=>n+Number(row[4]),0),78);
  assert.equal(value(block(rows,'CATEGORY FEES'), 'Sports')[1],'7800');
  const equipment=value(block(rows,'EQUIPMENT PERFORMANCE'),model.items[0].name);
  assert.equal(equipment[5],'78');assert.equal(equipment[6],'7800');
  const target=value(block(rows,'OWNER DEFINED TARGETS'),'utilization');
  assert.equal(target[1],'%');assert.equal(Number(target[3]),12);
});

test('CSV distinguishes the focused linear headline from the moving-average period baseline',()=>{
  const model=fixture(),result=calculateDetailedAnalytics(model,selection,now);
  const rows=parseCsv(analyticsCsv(result,model,selection,{section:'forecast',forecastModel:'linear',forecastMetric:'rentals'}));
  const context=block(rows,'FORECAST HEADLINE CONTEXT');
  assert.equal(value(context,'Forecast headline method')[1],'Linear Regression Trend');
  assert.equal(Number(value(context,'Headline estimated rentals')[1]),42);
  assert.equal(Number(value(context,'Headline estimated rental fees (PHP)')[1]),4200);
  const baseline=block(rows,'FORECAST (DEMAND');
  assert.equal(value(baseline,'Projection basis')[1],'Moving-average baseline');
  const periods=baseline.filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row[0]));
  assert.equal(periods.reduce((n,row)=>n+Number(row[4]),0),28.5);
});

test('CSV labels demo mode even with no matching rentals and keeps missing values distinct from zero',()=>{
  const model={items:[],transactions:[],demo_data:{active:true}};
  const rows=parseCsv(analyticsCsv(calculateDetailedAnalytics(model,selection,now),model,selection));
  assert.match(value(rows,'Dataset notice')[1],/synthetic/);
  assert.equal(value(rows,'Synthetic rentals in this selection')[1],'0');
  assert.equal(value(block(rows,'KEY PERFORMANCE'),'Confirmed rentals')[1],'0');
  assert.equal(value(block(rows,'KEY PERFORMANCE'),'Utilization (%)')[1],'Not enough data');
});

test('CSV preserves ledger deductions and a negative net while rejecting mismatched ledger dates',()=>{
  const model=fixture();model.financeSummary={from:selection.from,to:selection.to,totals:{collections:200,refunds:50,expenses:200}};
  let rows=parseCsv(analyticsCsv(calculateDetailedAnalytics(model,selection,now),model,selection));
  let cash=block(rows,'FEE COMPOSITION OR CASH MOVEMENT');
  assert.equal(value(cash,'Source')[1],'ledger');
  assert.ok(cash.some(row=>Number(row[2])===-50&&row[1]==='total'));
  model.financeSummary.from='2026-01-01';
  rows=parseCsv(analyticsCsv(calculateDetailedAnalytics(model,selection,now),model,selection));
  cash=block(rows,'FEE COMPOSITION OR CASH MOVEMENT');
  assert.equal(value(cash,'Source')[1],'rentals');
  assert.equal(value(cash,'Recorded fees')[2],'7800');
});
