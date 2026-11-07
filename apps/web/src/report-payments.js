import { lineChart } from './analytics-charts.js';

export function createReportPayments({api,escape:e,money}) {
  let key='',range=null,value=null,error='',loading=false,revision=0;
  function render(selected) {
    if(selected.error)return '';
    const next=selected.from+':'+selected.to;
    if(next!==key){key=next;range=selected;value=null;error='';loading=false;revision++;}
    if(!value)return `<section class="panel report-finance"><h3>Charges, collections & expenses</h3><p role="status">${error?e(error):'Loading payment summaries…'}</p>${error?'<button class="secondary" data-report-money-retry>Retry</button>':''}</section>`;
    const {summary,charges}=value,t=summary.totals;
    const metrics=[['Assessed rental charges',charges.totals.final_charges],['Money collected',t.collections],['Refunds recorded',t.refunds],['Expenses paid',t.expenses]];
    const byDay = new Map(charges.daily.map(row => [row.business_day, Number(row.final_charges || 0)]));
    const days = [...new Set([...summary.daily.map(row => row.business_day), ...charges.daily.map(row => row.business_day)])].sort();
    const collections = new Map(summary.daily.map(row => [row.business_day, Number(row.collections || 0)]));
    return `<section class="report-finance ana-panel"><header class="ana-panel-head"><div><h3>Charges, collections & expenses</h3><p>Store-wide totals for the date range. Category and equipment filters do not apply to this cash summary.</p></div></header><div class="ana-kpis">${metrics.map(([label,amount])=>`<article class="ana-kpi"><span>${e(label)}</span><strong>${e(money(amount))}</strong></article>`).join('')}</div>${lineChart(days, [{ name: 'Assessed charges', values: days.map(day => byDay.get(day) || 0), color: '#709aca' }, { name: 'Money collected', values: days.map(day => collections.get(day) || 0), color: '#ee8534' }], { escape: e, id: 'cash-trend', title: 'Daily charges and collections', currency: true })}<div class="ana-chart-facts"><span>Net collected <b>${e(money(t.net_collected))}</b></span><span>After recorded expenses <b>${e(money(t.net_after_expenses))}</b></span></div><p class="ana-note">Charges use the handoff date; receipts use the collection date. Cash after expenses is not a profit calculation. ${e(summary.basis)}${charges.totals.unknown_charges?` ${e(charges.totals.unknown_charges)} rental(s) have missing saved charges; unknown amounts are excluded.`:''}</p></section>`;
  }
  function bind(redraw) {
    const load=async()=>{if(loading||!range)return;loading=true;const current=revision;try{const query=new URLSearchParams({from:range.from,to:range.to});const [summary,charges]=await Promise.all([api('/finance/summary?'+query),api('/reports/daily?'+query)]);if(current===revision){value={summary,charges};error='';}}catch(problem){if(current===revision)error=problem.message;}finally{if(current===revision){loading=false;redraw();}}};
    const detail = document.querySelector('[data-analytics-detail="money"]');
    if (detail?.open && !value && !error && !loading) load();
    detail?.addEventListener('toggle', () => { if (detail.open && !value && !error) load(); });
    document.querySelector('[data-report-money-retry]')?.addEventListener('click',()=>load());
  }
  return {render,bind,reset(){value=null;error='';loading=false;revision++;}};
}
