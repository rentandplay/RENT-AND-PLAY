import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { lineChart, barChart, bindAnalyticsCharts } from '../src/analytics-charts.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('gradient curves preserve exact flat predictions and the caller’s observations',()=>{
  const data=[{name:'SES forecast',color:'#ee8534',values:[null,9,9,9],dashed:true,area:true}];
  const original=structuredClone(data);
  const {document}=parseHTML(lineChart(['A','B','C','D'],data,{escape,id:'flat-proof',title:'SES'}));
  const path=document.querySelector('[data-ana-stroke]');
  const numbers=path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
  const ys=numbers.filter((_,i)=>i%2);
  assert.ok(ys.every(y=>y===ys[0]),'flat forecasts must remain flat through every control point');
  assert.deepEqual(JSON.parse(document.querySelector('figure').dataset.anaSource).series,data);
  assert.deepEqual(data,original);
  assert.ok(document.querySelector('linearGradient'));
  assert.ok(document.querySelector('[data-ana-replay]'));
});

test('model curves keep missing periods disconnected and show a separate forecast region',()=>{
  const {document}=parseHTML(lineChart(['A','B','C','D'],[{name:'Demand',color:'#709aca',values:[2,null,4,5]}],{escape,id:'gaps-proof',title:'Demand',forecastStart:2,width:360,height:220}));
  assert.equal(document.querySelectorAll('[data-ana-stroke]').length,2);
  assert.ok(document.querySelector('.ana-forecast-wash'));
  assert.equal(document.querySelector('svg[role="img"]').getAttribute('viewBox'),'0 0 360 220');
  assert.ok(!document.toString().includes('NaN'));
});

test('reduced motion keeps all chart data visible and disables replay',()=>{
  const {document,window}=parseHTML('<html><body>'+barChart([{label:'Mon',value:3}],{escape,title:'Demand',id:'reduced-proof'})+'</body></html>');
  const oldRaf=window.requestAnimationFrame,oldMatch=window.matchMedia;
  window.requestAnimationFrame=()=>{throw new Error('Reduced motion must not schedule animation');};
  window.matchMedia=()=>({matches:true});
  try {
    bindAnalyticsCharts(document);
    assert.equal(document.querySelector('figure').dataset.anaMotion,'reduced');
    assert.equal(document.querySelector('[data-ana-replay]').disabled,true);
    assert.ok(Number(document.querySelector('[data-ana-bar]').getAttribute('height'))>0);
  } finally { window.requestAnimationFrame=oldRaf;window.matchMedia=oldMatch; }
});

test('narrow hour charts shorten and rotate labels while keeping the full inspection text',()=>{
  const {document}=parseHTML(barChart([{label:'10 AM–12 PM',value:3},{label:'6 PM–12 AM',value:1}],{escape,title:'Hours',width:317,height:240}));
  assert.equal(document.querySelector('.ana-axis-label').textContent,'10a–12p');
  assert.match(document.querySelector('.ana-axis-label').getAttribute('transform'),/rotate\(-35/);
  assert.equal(JSON.parse(document.querySelector('figure').dataset.anaValues)[0].label,'10 AM–12 PM');
});

test('a replacement before first visibility still animates when it enters the viewport',async()=>{
  const {activateChartMotion,settleChartMotion}=await import('../src/analytics-chart-motion.js');
  const html=barChart([{label:'Mon',value:3}],{escape,title:'Pending chart',id:'pending-visibility-proof'});
  const {document,window}=parseHTML('<html><body>'+html+'</body></html>');
  const observers=[],frames=[];
  const saved={raf:window.requestAnimationFrame,io:window.IntersectionObserver,match:window.matchMedia};
  window.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
  window.matchMedia=()=>({matches:false});
  window.IntersectionObserver=class {constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){}};
  try{
    const first=document.querySelector('figure');activateChartMotion(first);
    settleChartMotion(first);document.body.innerHTML=html;
    const replacement=document.querySelector('figure');activateChartMotion(replacement);
    assert.equal(observers.length,2);
    observers[1].callback([{isIntersecting:true}]);frames.forEach(callback=>callback());
    assert.equal(replacement.dataset.anaMotion,'enter');
    assert.ok(replacement.classList.contains('ana-motion-enter'));
  }finally{window.requestAnimationFrame=saved.raf;window.IntersectionObserver=saved.io;window.matchMedia=saved.match;}
});
