import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {renderAnalyticsReport} from '../src/analytics-report.js';
import {bindAnalyticsCharts} from '../src/analytics-charts.js';
import {updateForecastWorkspace} from '../src/forecast-workspace.js';

const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=new Date('2026-11-09T04:00:00Z');
const data={items:[{id:'bike',name:'Bike',created_at:'2026-07-01',is_active:true,status:'AVAILABLE'}],transactions:Array.from({length:49},(_,i)=>({id:'r-'+i,item_id:'bike',customer_id:'c',status:'COMPLETED',confirmed_rental_at:new Date(now.getTime()-(i+1)*86400000).toISOString(),rental_fee:100+i}))};
const helpers={escape,now,paged:rows=>({rows,footer:''}),table:(heads,rows)=>`<table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`};
const selection={period:'90d',groupBy:'daily'};
const render=metric=>renderAnalyticsReport(data,selection,{section:'forecast',forecastMetric:metric},helpers);

test('metric changes preserve the forecast chart and controls and update units',()=>{
 const {document,window}=parseHTML('<html><body>'+render('rentals')+'</body></html>');
 bindAnalyticsCharts(document);
 const root=document.querySelector('.analytics-workspace'),chart=root.querySelector('[aria-labelledby="forecast-trend-title"]'),svg=chart.querySelector('.ana-plot>svg');
 const button=root.querySelector('#analytics-metric-forecast-fees');
 for(const metric of ['fees','rentals','fees']) {
  assert.equal(updateForecastWorkspace(root,render(metric)),true);
  assert.equal(root.querySelector('[aria-labelledby="forecast-trend-title"]'),chart);
  assert.equal(chart.querySelector('.ana-plot>svg'),svg);
  assert.equal(root.querySelector('#analytics-metric-forecast-fees'),button);
  assert.equal(root.querySelector('#analytics-metric-forecast-'+metric).getAttribute('aria-pressed'),'true');
  assert.equal(JSON.parse(chart.dataset.anaSource).options.currency,metric==='fees');
 }
 chart.querySelector('[data-ana-point="21"]').dispatchEvent(new window.Event('pointerenter'));
 assert.match(chart.querySelector('[data-ana-readout]').textContent,/Moving average/);
});

test('handoff connects the visible endpoints without inventing an observed value for today',()=>{
  const {document}=parseHTML(render('rentals'));
  const chart=document.querySelector('[aria-labelledby="forecast-trend-title"]'),source=JSON.parse(chart.dataset.anaSource),handoff=source.options.handoff;
  assert.ok(chart.querySelector('.ana-handoff-line'));
  assert.equal(chart.querySelector('.ana-excluded-label').textContent,'Today incomplete');
  assert.equal(source.series[0].values[handoff.excludedIndex],null);
  assert.equal(source.series[1].values[handoff.excludedIndex],null);
  assert.equal(JSON.parse(chart.dataset.anaValues)[handoff.excludedIndex].rows.length,0);
});

test('switching metrics retains a zoomed forecast window and its live inspection values',()=>{
  const {document,window}=parseHTML('<html><body>'+render('rentals')+'</body></html>');bindAnalyticsCharts(document);
  const root=document.querySelector('.analytics-workspace');
  const zoom=root.querySelector('[data-ana-zoom]');[...zoom.options].find(o=>o.value==='7').selected=true;zoom.dispatchEvent(new window.Event('change'));
  const chart=root.querySelector('[aria-labelledby="forecast-trend-title"]'),svg=chart.querySelector('.ana-plot>svg');
  updateForecastWorkspace(root,render('fees'));
  assert.equal(chart.querySelector('.ana-plot>svg'),svg);
  assert.equal(chart.querySelector('[data-ana-zoom]').value,'7');
  assert.equal(chart.querySelectorAll('[data-ana-point]').length,7);
  assert.equal(chart.querySelector('.ana-handoff-line'),null);
  chart.querySelector('[data-ana-point="0"]').dispatchEvent(new window.Event('pointerenter'));
  assert.match(chart.querySelector('[data-ana-readout]').textContent,/Moving average/);
});

test('forecast connects recorded points directly without smoothing artificial peaks',()=>{
 const {document}=parseHTML(render('rentals'));
 const source=JSON.parse(document.querySelector('[aria-labelledby="forecast-trend-title"]').dataset.anaSource);
 assert.equal(source.options.straight,true);
 for(const line of document.querySelectorAll('[data-ana-stroke]')) assert.doesNotMatch(line.getAttribute('d'),/ C/);
});

test('historical review switches units with the forecast while keeping the review visible',()=>{
 const {document}=parseHTML('<html><body>'+render('rentals')+'</body></html>');bindAnalyticsCharts(document);
 const root=document.querySelector('.analytics-workspace'),detail=root.querySelector('[data-analytics-detail="forecast-review"]');
 assert.equal(detail.tagName,'SECTION');
 let chart=detail.querySelector('[data-ana-chart]');
 assert.equal(JSON.parse(chart.dataset.anaSource).options.currency,false);
 updateForecastWorkspace(root,render('fees'));
 chart=detail.querySelector('[data-ana-chart]');
 assert.equal(JSON.parse(chart.dataset.anaSource).options.currency,true);
 assert.equal(detail.hasAttribute('hidden'),false);
 assert.equal(root.querySelectorAll('details,summary').length,0);
 assert.match(detail.textContent,/reconstructed|reconstructed/i);
});
