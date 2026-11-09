import {updateAnalyticsChart,bindAnalyticsCharts} from './analytics-charts.js';

// Patch derived values around the existing chart; do not redraw the reports page.
export function updateForecastWorkspace(root,html) {
  const holder=root.ownerDocument.createElement('div'); holder.innerHTML=html;
  const current=root.querySelector('#analytics-panel-forecast'),next=holder.querySelector('#analytics-panel-forecast');
  const chart=current?.querySelector('[aria-labelledby="forecast-trend-title"]'),nextChart=next?.querySelector('[aria-labelledby="forecast-trend-title"]');
  if(!chart||!nextChart) return false;
  const outlook=current.querySelector('.ana-outlook-panel'),nextOutlook=next.querySelector('.ana-outlook-panel');
  const before=outlook.getBoundingClientRect?.().top;
  let scroller=outlook.parentElement;
  const view=root.ownerDocument.defaultView;
  while(scroller&&!(scroller.scrollHeight>scroller.clientHeight&&/auto|scroll/.test(view?.getComputedStyle?.(scroller)?.overflowY||''))) scroller=scroller.parentElement;
  for(const selector of ['.ana-summary','.ana-forecast-kpis','.ana-forecast-evidence .ana-facts']) {
    const old=current.querySelector(selector),fresh=next.querySelector(selector);if(old&&fresh)old.innerHTML=fresh.innerHTML;
  }
  const title=outlook.querySelector('.ana-panel-head > div'),freshTitle=nextOutlook.querySelector('.ana-panel-head > div');
  if(title&&freshTitle) title.innerHTML=freshTitle.innerHTML;
  outlook.querySelector('.ana-model-behavior').innerHTML=nextOutlook.querySelector('.ana-model-behavior').innerHTML;
  for(const control of outlook.querySelectorAll('[data-forecast-model],[data-forecast-scenario],[data-analytics-metric]')) {
    const fresh=nextOutlook.querySelector('#'+control.id);
    if(fresh) {control.setAttribute('aria-pressed',fresh.getAttribute('aria-pressed'));control.disabled=fresh.disabled;}
  }
  for(const detail of current.querySelectorAll('[data-analytics-detail]')) {
    const fresh=next.querySelector(`[data-analytics-detail="${detail.dataset.analyticsDetail}"]`);
    const content=detail.querySelector('.ana-disclosure-content'),freshContent=fresh?.querySelector('.ana-disclosure-content');
    if(content&&freshContent) content.innerHTML=freshContent.innerHTML;
  }
  const mix=current.querySelector('.ana-forecast-mix'),freshMix=next.querySelector('.ana-forecast-mix');
  if(mix&&freshMix) {
    const rows=mix.querySelectorAll('tbody tr'),freshRows=freshMix.querySelectorAll('tbody tr');
    rows.forEach((row,i)=>{const cell=row.querySelector('td:last-child'),freshCell=freshRows[i]?.querySelector('td:last-child');if(cell&&freshCell)cell.innerHTML=freshCell.innerHTML;});
    mix.querySelector('.ana-note').textContent=freshMix.querySelector('.ana-note').textContent;
  }
  updateAnalyticsChart(chart,nextChart);
  bindAnalyticsCharts(current);
  const after=outlook.getBoundingClientRect?.().top;
  if(Number.isFinite(before)&&Number.isFinite(after)&&Math.abs(after-before)>.5) {
    if(scroller)scroller.scrollTop+=after-before;
    else view?.scrollBy?.({top:after-before,behavior:'instant'});
  }
  return true;
}
