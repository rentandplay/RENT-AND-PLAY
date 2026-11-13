import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { combinationChart, horizontalBarChart, categoryDonut, demandHeatmap, bindAnalyticsCharts, updateAnalyticsChart } from '../src/analytics-charts.js';

function mount(html) {
  const {document,window}=parseHTML(`<html><body><main>${html}</main></body></html>`);
  bindAnalyticsCharts(document);
  const fire=(node,type,key)=>{const event=new window.Event(type,{bubbles:true,cancelable:true});if(key)event.key=key;node.dispatchEvent(event);};
  return {document,fire,read:()=>document.querySelector('[data-ana-readout]').textContent};
}

test('category shares include the long tail, escape labels and never invent a share for zero totals',()=>{
 const rows=Array.from({length:8},(_,i)=>({label:i?'Category '+i:'<img src=x>',value:8-i}));
 const {document}=parseHTML(categoryDonut(rows,{currency:true}));
 assert.equal(document.querySelectorAll('img').length,0);
 assert.equal(document.querySelectorAll('circle').length,6);
 const shares=[...document.querySelectorAll('circle')].map(n=>Number(n.getAttribute('stroke-dasharray').split(' ')[0]));
 assert.ok(Math.abs(shares.reduce((a,b)=>a+b,0)-100)<1e-9);
 assert.match(document.querySelector('figcaption').textContent,/Other categories/);
 assert.doesNotMatch(categoryDonut([{label:'None',value:0}]),/circle|100%|NaN/);
});

test('heatmap provides exact accessible counts including zeros and escapes labels',()=>{
 const {document}=parseHTML(demandHeatmap(['<img src=x>'],['Morning'],[[3]]));
 assert.equal(document.querySelector('img'),null);
 assert.equal(document.querySelector('td').textContent,'3');
 assert.match(document.querySelector('td').getAttribute('aria-label'),/3 confirmed handoffs/);
 assert.match(demandHeatmap(['Mon'],['Night'],[[0]]),/ana-heat-0/);
});

test('combination chart preserves zero actuals, missing goals, gaps, and a common zero baseline',()=>{
  const {document}=mount(combinationChart(['Jan','Feb','Mar'],[100,0,80],[120,null,90],{currency:true}));
  const figure=document.querySelector('[data-ana-chart]');
  const values=JSON.parse(figure.dataset.anaValues);
  assert.equal(values[1].rows.length,1,'missing target must not become zero or an invented value');
  assert.equal(values[1].rows[0].value,'₱0');
  assert.equal(document.querySelector('[data-ana-bar="1"]').getAttribute('height'),'0');
  assert.equal(document.querySelectorAll('[data-ana-series="1"] path').length,2,'a gap breaks the target line');
  assert.match(document.querySelector('desc').textContent,/same Philippine peso scale starting at zero/);
  const noGoal=mount(combinationChart(['Jan'],[25],[null]));
  assert.equal(noGoal.document.querySelectorAll('[data-ana-toggle]').length,1);
  assert.doesNotMatch(noGoal.document.querySelector('figcaption').textContent,/Target/);
});

test('combination chart supports exact values, keyboard pinning, legends, and in-place updates',()=>{
  const {document,fire,read}=mount(combinationChart(['Jan','Feb'],[100,200],[150,150],{id:'business',currency:true,previousValues:[80,90]}));
  const plot=document.querySelector('[data-ana-plot]');
  fire(plot,'keydown','Home'); assert.match(read(),/Jan.*Actual.*₱100.*Target.*₱150.*Previous period.*₱80/);
  fire(plot,'keydown','Enter'); fire(document.querySelector('[data-ana-point="1"]'),'pointerenter');
  assert.match(read(),/^Jan/);
  fire(plot,'keydown','Escape'); fire(document.querySelector('[data-ana-toggle="1"]'),'click');
  assert.equal(document.querySelector('[data-ana-series="1"]').style.display,'none');
  const {document:next}=parseHTML(combinationChart(['Jan','Feb'],[120,210],[160,170],{id:'business',currency:true}));
  const figure=document.querySelector('[data-ana-chart]'),svg=figure.querySelector('svg');
  assert.equal(updateAnalyticsChart(figure,next.querySelector('figure')),true);
  assert.equal(figure.querySelector('svg'),svg,'keep the mounted chart SVG');
  fire(figure.querySelector('[data-ana-point="1"]'),'click');
  assert.match(read(),/Feb.*₱210.*₱170/);
  assert.doesNotMatch(read(),/Previous period/);
});

test('horizontal equipment comparison is zero based, preserves missing prior values, and escapes labels',()=>{
  const label='PS5 <img src=x onerror=alert(1)> with wireless controllers';
  const {document,fire,read}=mount(horizontalBarChart([{label,value:0,previous:4},{label:'Basketball',value:7,previous:null}],{title:'Rental counts',width:320}));
  assert.equal(document.querySelector('[data-horizontal-bar="0"]').getAttribute('width'),'0');
  assert.equal(document.querySelectorAll('img').length,0);
  const points=document.querySelectorAll('[data-ana-point]');
  fire(points[0],'keydown','Enter'); assert.ok(read().includes(label)); assert.match(read(),/Selected period 0.*Previous period 4/);
  fire(points[0],'keydown','Escape'); fire(points[1],'focus');
  assert.match(read(),/Basketball.*Selected period 7/); assert.doesNotMatch(read(),/Previous period/);
  assert.ok(Number(document.querySelector('svg').getAttribute('viewBox').split(' ')[3])>=221);
  assert.equal(document.querySelector('[data-ana-replay]'),null,'static horizontal bars need no decorative replay control');
});

test('responsive chart rendering retains combination and horizontal chart types',()=>{
  for(const html of [combinationChart(['Jan'],[5],[8]),horizontalBarChart([{label:'Ball',value:4,previous:3}])]) {
    const {document}=parseHTML(`<html><body><main>${html}</main></body></html>`);
    const figure=document.querySelector('figure'),type=JSON.parse(figure.dataset.anaSource).type;
    const plot=figure.querySelector('[data-ana-plot]'),svg=plot.querySelector('svg');
    plot.getBoundingClientRect=()=>({width:320});svg.getBoundingClientRect=()=>({height:270});
    Object.defineProperty(plot,'clientWidth',{value:320});
    bindAnalyticsCharts(document);
    const next=document.querySelector('figure'),source=JSON.parse(next.dataset.anaView);
    assert.equal(source.type,type);assert.equal(source.options.width,320);
    if(type==='horizontal') assert.equal(source.options.height,145,'responsive row charts use row height, not inherited SVG aspect ratio');
    assert.ok(next.querySelectorAll('[data-ana-point]').length>0);
  }
});

test('long trend charts let the user inspect a short window without changing totals or target alignment',()=>{
 const labels=Array.from({length:60},(_,i)=>'Day '+(i+1));
 const {document,fire,read}=mount(combinationChart(labels,labels.map((_,i)=>i+1),labels.map(()=>20),{currency:true}));
 let chart=document.querySelector('figure');const original=chart.dataset.anaSource;
 let zoom=chart.querySelector('[data-ana-zoom]');
 [...zoom.options].find(o=>o.value==='14').selected=true;fire(zoom,'change');
 chart=document.querySelector('figure');
 assert.equal(chart.querySelectorAll('[data-ana-point]').length,14);
 fire(chart.querySelector('[data-ana-plot]'),'keydown','Home');
 assert.match(read(),/Day 47.*Actual.*₱47.*Target.*₱20/);
 assert.equal(chart.dataset.anaSource,original,'chart view never changes report data');
 zoom=chart.querySelector('[data-ana-zoom]');
 [...zoom.options].find(o=>o.value==='0').selected=true;fire(zoom,'change');
 chart=document.querySelector('figure');
 assert.equal(chart.querySelectorAll('[data-ana-point]').length,60);
});

test('utilization bars retain percentage units and fractional values on resize',()=>{
 const {document,fire,read}=mount(horizontalBarChart([{label:'Bike',value:2.37},{label:'Idle',value:0}],{percentage:true,valueLabel:'Utilization'}));
 const figure=document.querySelector('figure');
 assert.equal(JSON.parse(figure.dataset.anaSource).options.percentage,true);
 fire(figure.querySelector('[data-ana-point="0"]'),'focus');
 assert.match(read(),/2.37%/);
 assert.match(figure.querySelector('svg').textContent,/%/);
});
