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
  for(const selector of ['.ana-summary','.ana-forecast-kpis','.ana-forecast-evidence']) {
    const old=current.querySelector(selector),fresh=next.querySelector(selector);if(old&&fresh)old.innerHTML=fresh.innerHTML;
  }
  const title=outlook.querySelector('.ana-panel-head > div'),freshTitle=nextOutlook.querySelector('.ana-panel-head > div');
  if(title&&freshTitle) title.innerHTML=freshTitle.innerHTML;
  outlook.querySelector('.ana-model-behavior').innerHTML=nextOutlook.querySelector('.ana-model-behavior').innerHTML;
  const interpretation=outlook.querySelector('.ana-interpretation'),freshInterpretation=nextOutlook.querySelector('.ana-interpretation');
  if(interpretation&&freshInterpretation) interpretation.innerHTML=freshInterpretation.innerHTML;
  for(const control of outlook.querySelectorAll('[data-analytics-metric], [data-forecast-model]')) {
    const fresh=nextOutlook.querySelector('#'+control.id);
    if(fresh) {control.setAttribute('aria-pressed',fresh.getAttribute('aria-pressed'));control.disabled=fresh.disabled;}
  }
  const openDetails=new Set([...current.querySelectorAll('[data-ana-disclosure][open]')].map(detail=>detail.dataset.anaDisclosure));
  const expandedCollapses = new Set(
    [...current.querySelectorAll('[data-ana-collapse][aria-expanded="true"]')].map(btn => btn.dataset.anaCollapse)
  );
  for(const detail of current.querySelectorAll('[data-analytics-detail]')) {
    const fresh=next.querySelector(`[data-analytics-detail="${detail.dataset.analyticsDetail}"]`);
    const content=detail.querySelector('.ana-disclosure-content'),freshContent=fresh?.querySelector('.ana-disclosure-content');
    if(!content||!freshContent) continue;
    if(detail.dataset.analyticsDetail==='projection'&&content.querySelector('.ana-forecast-mix')&&freshContent.querySelector('.ana-forecast-mix')) {
      const periodScroll=[...content.children].find(el=>el.classList?.contains('admin-table-scroll'));
      const freshScroll=[...freshContent.children].find(el=>el.classList?.contains('admin-table-scroll'));
      if(periodScroll&&freshScroll) periodScroll.innerHTML=freshScroll.innerHTML;
      continue;
    }
    content.innerHTML=freshContent.innerHTML;
  }
  current.querySelectorAll('[data-ana-disclosure]').forEach(detail=>{if(openDetails.has(detail.dataset.anaDisclosure))detail.setAttribute('open','');});
  const collapseHint = (button, isOpen) => {
    const noun = button.classList.contains('is-section') ? 'insights' : 'notes';
    return `${isOpen ? 'Hide' : 'Show'} ${noun}`;
  };
  expandedCollapses.forEach(key => {
    const btn = current.querySelector(`[data-ana-collapse="${key}"]`);
    const target = btn ? current.querySelector('#' + btn.getAttribute('aria-controls')) : null;
    if (btn && target) {
      btn.setAttribute('aria-expanded', 'true');
      target.removeAttribute('hidden');
      const hint = btn.querySelector('.ana-collapse-hint');
      if (hint) hint.textContent = collapseHint(btn, true);
    }
  });
  current.querySelectorAll('[data-ana-collapse]').forEach(button => {
    button.onclick = () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      const nextOpen = !open;
      button.setAttribute('aria-expanded', String(nextOpen));
      const body = current.querySelector('#' + button.getAttribute('aria-controls'));
      if (body) body.toggleAttribute('hidden', open);
      const hint = button.querySelector('.ana-collapse-hint');
      if (hint) hint.textContent = collapseHint(button, nextOpen);
    };
  });
  const mix=current.querySelector('.ana-forecast-mix'),freshMix=next.querySelector('.ana-forecast-mix');
  if(mix&&freshMix) {
    const mixSub = mix.querySelector('.ana-panel-head p'), freshSub = freshMix.querySelector('.ana-panel-head p');
    if (mixSub && freshSub) mixSub.textContent = freshSub.textContent;
    const mixBtn = mix.querySelector('[data-forecast-mix-toggle]'), freshBtn = freshMix.querySelector('[data-forecast-mix-toggle]');
    if (mixBtn && freshBtn) {
      mixBtn.setAttribute('aria-pressed', freshBtn.getAttribute('aria-pressed'));
      mixBtn.textContent = freshBtn.textContent;
    }
    const mixVisual = mix.querySelector('.ana-equipment-demand-visual'), freshVisual = freshMix.querySelector('.ana-equipment-demand-visual');
    if (mixVisual && freshVisual) mixVisual.innerHTML = freshVisual.innerHTML;
    const headCell=mix.querySelector('thead th:last-child'),freshHeadCell=freshMix.querySelector('thead th:last-child');
    if(headCell&&freshHeadCell) headCell.textContent=freshHeadCell.textContent;
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
