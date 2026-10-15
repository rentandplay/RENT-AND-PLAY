import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceUI} from '../src/workspace-ui.js';
import {calculateDetailedAnalytics} from '../src/analytics-insights.js';

const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const base={customers:[],transactions:[],items:[],categories:[],rates:[],maintenance:[],users:[],settings:{},terminals:[],verification:[],auditLogs:[]};
const helpers={escape,icon:()=>'',money:value=>'PHP '+value,formatDate:String};
const ranking={total_rentals:12,equipment_count:2,rows:[{item_id:'bike',name:'Bicycle',rentals:10},{item_id:'ball',name:'Basketball',rentals:2}]};

test('history displays the complete server ranking independently of the five loaded rows',async()=>{
  const ui=createWorkspaceUI({...helpers,api:async()=>({...base,transactions:Array.from({length:5},(_,i)=>({id:String(i),item_name:'Unconfirmed item',status:'REJECTED'})),rental_ranking:ranking,page_meta:{kind:'rentals',limit:5}})});
  ui.render('Transaction History',{});await ui.load();const html=ui.render('Transaction History',{});
  assert.match(html,/12 confirmed rentals across 2 equipment types/);assert.match(html,/Across all physical units/);
  assert.match(html,/Loaded transactions/);assert.doesNotMatch(html,/Confirmed rentals in this view/);
  const list=html.split('<ol class="equipment-leaderboard">')[1].split('</ol>')[0];
  assert.match(list,/Bicycle/);assert.doesNotMatch(list,/Unconfirmed item/);
});

test('navigating from paginated history never renders those records as a complete analytics report',async()=>{
  const calls=[];const ui=createWorkspaceUI({...helpers,api:async path=>{const view=new URL(path,'http://local').searchParams.get('view');calls.push(view);return {...base,view_meta:{view,from:new URL(path,'http://local').searchParams.get('from'),to:new URL(path,'http://local').searchParams.get('to')},page_meta:view==='Transaction History'?{kind:'rentals',limit:5}:null,rental_ranking:ranking};}});
  ui.render('Transaction History',{});await ui.load();assert.match(ui.render('Reports',{}),/Loading reports/);
  await ui.load();assert.deepEqual(calls,['Transaction History','Reports']);assert.doesNotMatch(ui.render('Reports',{}),/Analytics needs complete report records/);
});

test('analytics rejects rental table pages and ranks equal counts alphabetically across physical units',()=>{
  const now=new Date('2026-10-15T04:00:00Z'),items=[{id:'bike',name:'Bicycle',stock_group_id:'bike'},{id:'old',name:'Bicycle',stock_group_id:'bike',is_active:false},{id:'ball',name:'Basketball'}];
  const transactions=['bike','old','ball','ball'].map((item_id,i)=>({id:String(i),item_id,status:'COMPLETED',confirmed_rental_at:'2026-10-08T00:00:00Z',rental_fee:item_id==='ball'?1:500}));
  assert.match(calculateDetailedAnalytics({items,transactions,page_meta:{kind:'rentals'}},{period:'30d'},now).error,/complete report records/);
  const result=calculateDetailedAnalytics({items,transactions},{period:'30d'},now);
  assert.equal(result.totals.rentals,4);assert.deepEqual(result.topEquipment.map(row=>[row.name,row.rentals]),[['Basketball',2],['Bicycle',2]]);
});

test('changing the ranking period hides old-period totals until the new complete summary arrives',async()=>{
  const prior=globalThis.document,handlers={};let finish,request;
  globalThis.document={querySelector:selector=>selector==='#history-ranking-period'?{addEventListener:(_,callback)=>{handlers.period=callback;}}:null,querySelectorAll:()=>[]};
  try{
    let calls=0;const ui=createWorkspaceUI({...helpers,api:async path=>{if(++calls===1)return {...base,rental_ranking:ranking};request=new URL(path,'http://local').searchParams;return new Promise(resolve=>{finish=resolve;});}});
    ui.render('Transaction History',{});await ui.load();ui.bind('Transaction History',{},()=>{});
    const changing=handlers.period({target:{value:'30d'}});
    assert.match(ui.render('Transaction History',{}),/Loading complete ranking/);assert.doesNotMatch(ui.render('Transaction History',{}),/12 confirmed rentals/);
    finish({...base,rental_ranking:{...ranking,from:request.get('rankingFrom'),to:request.get('rankingTo'),total_rentals:3}});await changing;
    assert.match(ui.render('Transaction History',{}),/3 confirmed rentals/);
  }finally{globalThis.document=prior;}
});
