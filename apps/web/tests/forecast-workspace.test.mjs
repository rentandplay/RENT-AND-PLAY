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
const render=model=>renderAnalyticsReport(data,selection,{section:'forecast',forecastModel:model},helpers);

test('model changes preserve the chart, SVG, controls, historical geometry and shared scale',()=>{
  const {document,window}=parseHTML('<html><body>'+render('seasonal')+'</body></html>');
  bindAnalyticsCharts(document);
  const root=document.querySelector('.analytics-workspace'),chart=root.querySelector('[aria-labelledby="forecast-trend-title"]'),svg=chart.querySelector('.ana-plot>svg'),panel=root.querySelector('.ana-outlook-panel');
  const button=root.querySelector('#analytics-model-ses'),history=chart.querySelector('[data-ana-stroke="0-0"]').getAttribute('d');
  const domain=JSON.parse(chart.dataset.anaSource).options.domainMax;
  for(const model of ['ses','wma','linear','seasonal','ses']) {
    assert.equal(updateForecastWorkspace(root,render(model)),true);
    assert.equal(root.querySelector('[aria-labelledby="forecast-trend-title"]'),chart);
    assert.equal(chart.querySelector('.ana-plot>svg'),svg);
    assert.equal(root.querySelector('.ana-outlook-panel'),panel);
    assert.equal(root.querySelector('#analytics-model-ses'),button);
    assert.equal(chart.querySelector('[data-ana-stroke="0-0"]').getAttribute('d'),history);
    assert.equal(JSON.parse(chart.dataset.anaSource).options.domainMax,domain);
    assert.equal(root.querySelector('#analytics-model-'+model).getAttribute('aria-pressed'),'true');
  }
  const legend=chart.querySelector('[data-ana-toggle="0"]');
  legend.click(); assert.equal(legend.getAttribute('aria-pressed'),'false');
  legend.click(); assert.equal(legend.getAttribute('aria-pressed'),'true');
  chart.querySelector('[data-ana-point="21"]').dispatchEvent(new window.Event('pointerenter'));
  assert.match(chart.querySelector('[data-ana-readout]').textContent,/SES/);
});

test('handoff connects the visible endpoints without inventing an observed value for today',()=>{
  const {document}=parseHTML(render('seasonal'));
  const chart=document.querySelector('[aria-labelledby="forecast-trend-title"]'),source=JSON.parse(chart.dataset.anaSource),handoff=source.options.handoff;
  assert.ok(chart.querySelector('.ana-handoff-line'));
  assert.equal(chart.querySelector('.ana-excluded-label').textContent,'Today incomplete');
  assert.equal(source.series[0].values[handoff.excludedIndex],null);
  assert.equal(source.series[1].values[handoff.excludedIndex],null);
  assert.equal(JSON.parse(chart.dataset.anaValues)[handoff.excludedIndex].rows.length,0);
});

test('switching models retains a zoomed forecast window and its live inspection values',()=>{
  const {document,window}=parseHTML('<html><body>'+render('seasonal')+'</body></html>');bindAnalyticsCharts(document);
  const root=document.querySelector('.analytics-workspace');
  const zoom=root.querySelector('[data-ana-zoom]');[...zoom.options].find(o=>o.value==='7').selected=true;zoom.dispatchEvent(new window.Event('change'));
  const chart=root.querySelector('[aria-labelledby="forecast-trend-title"]'),svg=chart.querySelector('.ana-plot>svg');
  updateForecastWorkspace(root,render('wma'));
  assert.equal(chart.querySelector('.ana-plot>svg'),svg);
  assert.equal(chart.querySelector('[data-ana-zoom]').value,'7');
  assert.equal(chart.querySelectorAll('[data-ana-point]').length,7);
  assert.equal(chart.querySelector('.ana-handoff-line'),null);
  chart.querySelector('[data-ana-point="0"]').dispatchEvent(new window.Event('pointerenter'));
  assert.match(chart.querySelector('[data-ana-readout]').textContent,/WMA/);
});
