import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { calculateDetailedAnalytics } from '../src/analytics-insights.js';
import { simulateWhatIfScenario, buildLateReturnDecisionTree, buildWaterfallAnalysis, computeHistogramStats, DURATION_BINS, buildForecastComparison } from '../src/analytics-models.js';
import { renderAnalyticsReport } from '../src/analytics-report.js';
import { histogramChart, waterfallChart } from '../src/analytics-charts.js';

const now=new Date('2026-11-15T04:00:00Z');
const selection={period:'custom',from:'2025-11-01',to:'2026-10-31',groupBy:'monthly'};
const helpers={now,escape:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),paged:rows=>({rows,footer:''}),table:(heads,rows)=>`<table><thead>${heads.map(h=>`<th>${h}</th>`).join('')}</thead><tbody>${rows}</tbody></table>`};
function rental(id,item_id,start,fee=100) {
  const at=new Date(start);
  return {id,item_id,customer_id:'c'+id,status:'COMPLETED',rental_fee:fee,confirmed_rental_at:at.toISOString(),received_at:new Date(+at+3600000).toISOString(),due_at:new Date(+at+7200000).toISOString(),fulfillment_mode:'WALK_IN'};
}
function fixture() {
  return {items:[{id:'a',name:'Ball',category_id:'sports',is_active:true,created_at:'2024-01-01'},{id:'b',name:'Controller',category_id:'games',is_active:true,created_at:'2024-01-01'}],categories:[{id:'sports',name:'Sports'},{id:'games',name:'Games'}],transactions:Array.from({length:12},(_,i)=>rental(String(i),'a',new Date(Date.UTC(2025,10+i,5)),100+i*10)),maintenance:[{id:'m',item_id:'b',status:'COMPLETED',started_at:'2026-10-05T00:00:00Z',completed_at:'2026-10-06T00:00:00Z',notes:'broken controller'}],settings:{analytics_targets:{monthly_fee_goal:12000,monthly_rental_goal:20,utilization_goal:.5,overdue_rate_alert:.2}}};
}

test('monthly comparison scores complete history using only the six earlier months for each prediction',()=>{
  const result=calculateDetailedAnalytics(fixture(),selection,now);
  const fc=result.forecast;
  assert.equal(fc.history.length,6);
  assert.equal(fc.evaluationHistory.length,12);
  assert.equal(fc.comparison.evalSamples,4);
  for(const model of fc.comparison.models) assert.ok(Number.isFinite(model.maeRentals)&&Number.isFinite(model.maeFees));
  for(const row of fc.comparison.evaluation.fees) {
    assert.equal(row.trainingEnd,row.index-1);
    assert.equal(row.trainingStart,row.index-6);
    const expected=fc.evaluationHistory.slice(row.index-6,row.index).reduce((s,b)=>s+b.fees,0)/6;
    assert.equal(row.ma,expected);
  }
  const actualMean=fc.comparison.evaluation.fees.reduce((s,r)=>s+Math.abs(r.actual-r.ma),0)/4;
  assert.equal(fc.comparison.models[0].maeFees,Math.round(actualMean*100)/100);
  const changed=fixture();changed.transactions.at(-1).rental_fee=99999;
  const revised=calculateDetailedAnalytics(changed,selection,now).forecast.comparison.evaluation.fees;
  assert.equal(revised.at(-1).ma,fc.comparison.evaluation.fees.at(-1).ma,'held-out value cannot affect its own estimate');
});

test('weekly model evaluation becomes available with enough earlier full weeks',()=>{
  const model=fixture();
  model.transactions=Array.from({length:90},(_,i)=>rental(String(i),'a',new Date(Date.UTC(2026,6,1+i))));
  const result=calculateDetailedAnalytics(model,{period:'custom',from:'2026-07-01',to:'2026-10-01',groupBy:'weekly'},now);
  assert.ok(result.forecast.comparison.evalSamples>=3);
  assert.ok(result.forecast.comparison.models.every(m=>m.maeRentals!==null));
  for(const row of result.forecast.comparison.evaluation.rentals) assert.equal(row.trainingEnd-row.trainingStart+1,8);
});

test('linear forecast advances over the incomplete month before the first projected date',()=>{
  const history=Array.from({length:6},(_,i)=>({from:`2026-0${i+1}-01`,to:`2026-0${i+1}-28`,rentals:i+1,fees:(i+1)*10}));
  const comparison=buildForecastComparison({groupBy:'monthly',forecast:{available:true,history,points:[{from:'2026-08-01',rentals:3.5,fees:35}]}});
  assert.equal(comparison.models.find(m=>m.key==='linear').fees[0],80);
  assert.equal(comparison.models.find(m=>m.key==='linear').rentals[0],8);
});

test('store-wide target attainment is absent for both equipment and category filters',()=>{
  for(const scope of [{itemId:'a'},{categoryId:'sports'}]) {
    const {document}=parseHTML(renderAnalyticsReport(fixture(),{...selection,...scope},{section:'performance'},helpers));
    assert.equal(document.querySelector('.ana-targets-progress'),null);
    assert.match(document.documentElement.textContent,/Store-wide targets do not apply/);
  }
});

test('maintenance, customer history and late-risk samples obey equipment/category and historical cutoff',()=>{
  const model=fixture();
  model.transactions.push(...Array.from({length:20},(_,i)=>rental('b'+i,'b','2026-10-04T00:00:00Z')));
  model.transactions.push(...Array.from({length:20},(_,i)=>rental('future'+i,'a','2026-11-12T00:00:00Z')));
  for(const scope of [{itemId:'a'},{categoryId:'sports'}]) {
    const r=calculateDetailedAnalytics(model,{...selection,...scope},now);
    assert.equal(r.maintenanceIssues.totalLogs,0);
    assert.equal(r.customerSegments.totalCustomers,12);
    assert.equal(r.lateRiskTree.samples,12);
    assert.equal(r.insightScope.through,'2026-10-31');
  }
});

test('adding units changes capacity without inventing demand and uses actual stock-group unit counts',()=>{
  const source={groups:[{id:'a',name:'Ball',unitCount:10,rentals:100,fees:1000,utilization:.5}],totals:{rentals:100,fees:1000,utilization:.5}};
  const before=structuredClone(source);
  const sim=simulateWhatIfScenario(source,{targetGroupId:'a',extraUnits:1});
  assert.equal(sim.currentUnits,10);
  assert.equal(sim.projectedRentals,100);
  assert.equal(sim.projectedFees,1000);
  assert.equal(sim.projectedUtilization,.4545);
  assert.deepEqual(source,before);
  source.groups.push({id:'b',unitCount:5});
  assert.equal(simulateWhatIfScenario(source,{}).currentUnits,15);
  const capped=simulateWhatIfScenario({groups:[{...source.groups[0],utilization:.9}],totals:{}},{targetGroupId:'a',demandShiftPct:50});
  assert.equal(capped.capacityLimited,true);
  assert.equal(capped.projectedRentals,111.1);
  assert.equal(capped.projectedUtilization,1);
  assert.match(capped.formulaNote,/not fitted to business data/);
});

test('late-risk validation uses the same depth-2 rules, and negative branches match active rentals',()=>{
  const rows=Array.from({length:40},(_,i)=>{
    const type=i<30?i%3:(i%2);
    const row=rental(String(i),'a',new Date(Date.UTC(2026,8,i+1)));
    row.fulfillment_mode=type===2?'WALK_IN':'DELIVERY';
    row.fee_breakdown={package_kind:type===1?'HOURLY':'WHOLE_STAY'};
    row.received_at=new Date(Date.parse(row.confirmed_rental_at)+(type===0?3:1)*3600000).toISOString();
    return row;
  });
  rows.push({...rental('active','a','2026-11-15T01:00:00Z'),status:'ACTIVE',received_at:null,due_at:'2026-11-15T12:00:00Z',fulfillment_mode:'DELIVERY',fee_breakdown:{package_kind:'WHOLE_STAY'}});
  const tree=buildLateReturnDecisionTree(rows,[],[],now);
  assert.equal(tree.rules.length,3);
  assert.equal(tree.validation.trainingCount,30);
  assert.equal(tree.validation.holdoutCount,10);
  assert.equal(tree.validation.accuracy,1);
  assert.deepEqual(tree.validation.confusion,{tp:5,fp:0,fn:0,tn:5});
  assert.ok(tree.validation.trainingThrough<tree.validation.testFrom);
  assert.equal(tree.activeSummary.elevatedCount,1);
  assert.equal(tree.rules.reduce((s,r)=>s+r.samples,0),40);
});

test('late-risk rejects invalid due dates, ignores physical receipts after cutoff, and stops scoring returned units',()=>{
  const rows=Array.from({length:16},(_,i)=>({...rental(String(i),'a','2026-10-01T00:00:00Z'),received_at:'2026-10-01T04:00:00Z'}));
  rows.push({...rental('pending','a','2026-11-15T00:00:00Z'),status:'RETURN_PENDING_INSPECTION'});
  rows.push({...rental('bad','a','2026-11-15T00:00:00Z'),due_at:'2026-11-14T00:00:00Z'});
  const tree=buildLateReturnDecisionTree(rows,[],[],now);
  assert.equal(tree.samples,17);
  assert.equal(tree.activeSummary.activeCount,0);
});

test('a root-only late-risk rule scores active rentals, and validation excludes outcomes not known in time',()=>{
  const rows=Array.from({length:20},(_,i)=>({...rental(String(i),'a',new Date(Date.UTC(2026,8,1+i))),received_at:'2026-11-01T00:00:00Z'}));
  rows.push({...rental('active','a','2026-11-15T00:00:00Z'),status:'ACTIVE',received_at:null,due_at:'2026-11-15T12:00:00Z'});
  const tree=buildLateReturnDecisionTree(rows,[],[],now);
  assert.equal(tree.rules.length,1);
  assert.equal(tree.rules[0].lateRate,1);
  assert.equal(tree.activeSummary.elevatedCount,1);
  assert.equal(tree.validation,null,'September outcomes received in November cannot train a September holdout');
});

test('charges-only waterfall never infers collections and ledger waterfalls reconcile zero and negative net',()=>{
  const fee=buildWaterfallAnalysis({confirmed:[{rental_fee:100,balance_due:0,fee_breakdown:{overtime_fee:30}}]});
  assert.equal(fee.steps.at(-1).amount,100);
  assert.equal(fee.summary.collections,null);
  assert.doesNotMatch(fee.title,/collected/i);
  const negative=buildWaterfallAnalysis({financeSummary:{totals:{collections:100,refunds:150,expenses:50,net_after_expenses:999}}});
  assert.equal(negative.summary.netAfterExpenses,-100);
  const {document}=parseHTML(waterfallChart(negative.steps));
  const values=JSON.parse(document.querySelector('figure').dataset.anaValues);
  assert.equal(values.at(-1).rows[0].value,'−₱100');
  const zero=buildWaterfallAnalysis({financeSummary:{totals:{collections:0,refunds:0,expenses:0}}});
  assert.equal(zero.source,'ledger');
  const zeroDom=parseHTML(waterfallChart(zero.steps)).document;
  assert.equal(zeroDom.querySelector('[data-ana-bar="w-0"]').getAttribute('height'),'0');
});

test('cash waterfall requires a ledger matching the report dates and labels movement rather than closing balance',()=>{
  const model=fixture();
  model.financeSummary={from:'2026-01-01',to:'2026-01-31',totals:{collections:500,refunds:100,expenses:50}};
  assert.equal(calculateDetailedAnalytics(model,selection,now).waterfall.source,'rentals');
  model.financeSummary.from=selection.from;model.financeSummary.to=selection.to;
  const result=calculateDetailedAnalytics(model,selection,now).waterfall;
  assert.equal(result.source,'ledger');
  assert.equal(result.steps.at(-1).label,'Net cash movement');
  assert.equal(result.steps.at(-1).end,350);
  delete model.financeSummary.from;
  assert.equal(calculateDetailedAnalytics(model,selection,now).waterfall.source,'rentals');
});

test('frequency ranges expose ties without claiming an exact mode or misleading interval widths',()=>{
  const stats=computeHistogramStats([1,3,6,10,30],DURATION_BINS);
  assert.equal(stats.modeBins.length,5);
  assert.equal(stats.bins.reduce((s,b)=>s+b.count,0),stats.count);
  const {document}=parseHTML(histogramChart(stats.bins,{stats}));
  assert.match(document.querySelector('desc').textContent,/Frequency bar chart/);
  assert.match(document.documentElement.textContent,/not an exact numerical mode/);
  assert.equal(computeHistogramStats([1],DURATION_BINS).stdDev,null);
});

test('core totals reconcile with all descriptive chart dimensions including numeric-string fees',()=>{
  const model=fixture();
  model.transactions.push({...rental('extra','b','2026-10-06T00:00:00Z','100.25'),payment_method:'CASH',fulfillment_mode:'DELIVERY'});
  const r=calculateDetailedAnalytics(model,selection,now);
  for(const rows of [r.trend,r.groups,r.categoryComparison,r.weekdays,r.hours]) {
    assert.equal(rows.reduce((s,row)=>s+row.rentals,0),r.totals.rentals);
    assert.ok(Math.abs(rows.reduce((s,row)=>s+row.fees,0)-r.totals.fees)<1e-8);
  }
  assert.equal(r.pivot.totals.total.fees,r.totals.fees);
  assert.equal(r.waterfall.summary.totalFees,r.totals.fees);
  assert.equal(r.channelTrends.totals.counterFees+r.channelTrends.totals.deliveryFees,r.totals.fees);
  assert.equal(r.demandMatrix.flat().reduce((a,b)=>a+b,0),r.totals.rentals);
});

test('category matrix uses the shared stock-group category even when a sibling has an older category',()=>{
  const model=fixture();
  model.items.push({id:'sibling',name:'Ball copy',stock_group_id:'a',category_id:'games',is_active:true,created_at:'2024-01-01'});
  model.transactions.push(rental('sibling','sibling','2026-10-04T00:00:00Z',250));
  const r=calculateDetailedAnalytics(model,{...selection,categoryId:'sports'},now);
  assert.equal(r.pivot.rows.length,1);
  assert.equal(r.pivot.rows[0].category,'Sports');
  assert.equal(r.pivot.rows[0].total.fees,r.totals.fees);
});
