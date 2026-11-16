import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { calculateDetailedAnalytics } from '../src/analytics-insights.js';
import { renderAnalyticsReport } from '../src/analytics-report.js';
import { renderEquipmentTrendDetail, renderSparklineDetail } from '../src/analytics-workspace.js';
import { createWorkspaceUI } from '../src/workspace-ui.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selection={period:'custom',from:'2026-09-01',to:'2026-11-15',groupBy:'monthly'};
const now=new Date('2026-11-16T04:00:00Z');
const rental=(id,item_id,at)=>({id,item_id,status:'COMPLETED',confirmed_rental_at:at,received_at:at,due_at:at,rental_fee:100});
const fixture=()=>({customers:[],users:[],settings:{},rates:[],maintenance:[],terminals:[],verification:[],auditLogs:[],categories:[{id:'cards',name:'Cards'},{id:'sports',name:'Sports'}],items:[
  {id:'a',name:'<Uno>',stock_group_id:'a',category_id:'cards',is_active:true,created_at:'2025-01-01'},
  {id:'a2',name:'<Uno>',stock_group_id:'a',category_id:'cards',is_active:true,created_at:'2025-01-01'},
  {id:'b',name:'Bike',category_id:'sports',is_active:true,created_at:'2025-01-01'}
],transactions:[rental('1','a','2026-09-02T01:00:00Z'),rental('2','a2','2026-09-02T02:00:00Z'),rental('3','a','2026-11-01T01:00:00Z'),rental('4','b','2026-10-01T01:00:00Z')]});
const helpers={escape,now,paged:rows=>({rows,footer:''}),table:(head,rows)=>`<table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`};

test('expanded equipment trend preserves grouped unit counts, zero months and exact selected dates',()=>{
  const result=calculateDetailedAnalytics(fixture(),{...selection,categoryId:'cards'},now);
  const detail=renderEquipmentTrendDetail(result,'a',escape);
  const {document}=parseHTML(detail.html);
  assert.equal(document.querySelector('uno'),null);
  assert.deepEqual([...document.querySelectorAll('tbody tr')].map(row=>[...row.children].map(cell=>cell.textContent)),[
    ['Sep 2026','2026-09-01','2026-09-30','2'],
    ['Oct 2026','2026-10-01','2026-10-31','0'],
    ['Nov 2026','2026-11-01','2026-11-15','1']
  ]);
  assert.equal(document.querySelector('tfoot td').textContent,'3');
  const payload=JSON.parse(document.querySelector('[data-ana-source]').dataset.anaSource);
  assert.deepEqual(payload.series[0].values,[2,0,1]);
  assert.equal(payload.options.integerTicks,true);
  assert.equal(renderEquipmentTrendDetail(result,'b',escape),null,'an out-of-scope item cannot be opened');
  const main=parseHTML(renderAnalyticsReport(fixture(),selection,{section:'performance'},helpers)).document;
  const button=main.querySelector('[data-equipment-trend="a"]');
  assert.equal(button.getAttribute('aria-haspopup'),'dialog');
  assert.match(button.getAttribute('aria-label'),/<Uno>/);
});

test('single-period and idle equipment have real zero counts without fabricated trend points',()=>{
  const result=calculateDetailedAnalytics(fixture(),{period:'custom',from:'2026-10-01',to:'2026-10-31',groupBy:'monthly',itemId:'a'},now);
  const {document}=parseHTML(renderEquipmentTrendDetail(result,'a',escape).html);
  assert.equal(document.querySelector('tbody tr td:last-child').textContent,'0');
  assert.match(document.querySelector('.ana-equipment-trend-detail').textContent,/No recorded activity/);
  assert.equal(document.querySelectorAll('tbody tr').length,1);
});

test('every KPI sparkline has its exact source dates and values and avoids nested buttons',()=>{
  for(const section of ['performance','forecast']) {
    const model=fixture(),result=calculateDetailedAnalytics(model,selection,now);
    const {document}=parseHTML(renderAnalyticsReport(model,selection,{section},helpers));
    const sparks=[...document.querySelectorAll('.ana-kpi-spark svg')];
    assert.equal(sparks.length,2,section);
    assert.equal(document.querySelector('button button'),null);
    for(const svg of sparks) {
      const button=svg.closest('button');
      assert.equal(button.getAttribute('aria-haspopup'),'dialog');
      const payload=JSON.parse(button.dataset.analyticsSpark);
      const metric=payload.unit==='PHP'?'fees':'rentals';
      const source=section==='performance'?result.trend:result.forecast.history.slice(-6);
      assert.deepEqual(payload.periods.map(row=>row.value),source.map(row=>row[metric]));
      assert.deepEqual(payload.periods.map(row=>[row.from,row.to]),source.map(row=>[row.from,row.to]));
      const detail=renderSparklineDetail(payload,escape);
      assert.ok(detail);
      if(section==='forecast')assert.match(detail.html,/past|history/);
      if(metric==='fees')assert.match(detail.html,/RENTAL FEES \(PHP\)/);
    }
  }
});

test('clicking a rendered sparkline opens an interactive modal through the workspace controller and closes it',async()=>{
  const originals=new Map(['document','window'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const {document,window}=parseHTML('<html><body><main></main><dialog id="modal"></dialog></body></html>');
  globalThis.document=document;globalThis.window=window;
  try {
    const model=fixture(),at=new Date(Date.now()-86400000).toISOString();
    model.transactions=[rental('1','a',at),rental('2','a2',at),rental('3','b',at)];
    const modal=document.querySelector('#modal');let openedTitle='';
    modal.close=()=>{modal.removeAttribute('open');modal.dispatchEvent(new window.Event('close'));};
    const ui=createWorkspaceUI({escape,icon:()=>'',money:String,formatDate:String,toast:()=>{},modal,showModal:(title,html)=>{openedTitle=title;modal.innerHTML=html;modal.setAttribute('open','');},api:async()=>structuredClone(model)});
    const owner={id:'owner',role:'OWNER'};
    ui.render('Reports',owner);await ui.load();
    document.querySelector('main').innerHTML=ui.render('Reports',owner);
    ui.bind('Reports',owner,()=>{});
    document.querySelector('[data-equipment-trend="a"]').click();
    assert.equal(openedTitle,'<Uno> rental trend');
    assert.equal(modal.querySelector('tfoot td').textContent,'2');
    assert.equal(modal.querySelector('[data-ana-chart]').dataset.anaBound,'true');
    modal.querySelector('[data-equipment-trend-close]').click();
    assert.equal(modal.hasAttribute('open'),false);
    const kpiSpark=document.querySelector('[data-analytics-spark]');
    const payload=JSON.parse(kpiSpark.dataset.analyticsSpark);
    kpiSpark.click();
    assert.equal(openedTitle,payload.title);
    assert.equal(modal.hasAttribute('open'),true);
    assert.match(modal.querySelector('tfoot td').textContent,/300/);
    modal.close();
    ui.setReportSection('forecast');
    document.querySelector('main').innerHTML=ui.render('Reports',owner);
    ui.bind('Reports',owner,()=>{});
    const forecastSpark=document.querySelector('[data-analytics-spark]');
    forecastSpark.click();
    assert.match(openedTitle,/Recorded.*history/);
    assert.equal(modal.querySelector('[data-ana-chart]').dataset.anaBound,'true');
    const escapeEvent=new window.Event('keydown',{bubbles:true,cancelable:true});
    escapeEvent.key='Escape';modal.querySelector('[data-ana-plot]').dispatchEvent(escapeEvent);
    assert.equal(modal.hasAttribute('open'),false,'Escape closes details even when the chart has focus');
  } finally {
    for(const [key,descriptor] of originals) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
