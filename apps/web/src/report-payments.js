export function createReportPayments({api,escape:e,money}) {
  let key='',range=null,value=null,error='',loading=false,revision=0;
  function render(selected) {
    if(selected.error)return '';
    const next=selected.from+':'+selected.to;
    if(next!==key){key=next;range=selected;value=null;error='';loading=false;revision++;}
    if(!value)return `<section class="panel report-finance"><h3>Charges, collections & expenses</h3><p role="status">${error?e(error):'Loading payment summaries…'}</p>${error?'<button class="secondary" data-report-money-retry>Retry</button>':''}</section>`;
    const {summary,charges}=value,t=summary.totals;
    const metrics=[['Assessed rental charges',charges.totals.final_charges],['Money collected',t.collections],['Refunds recorded',t.refunds],['Expenses paid',t.expenses]];
    const byDay=new Map(charges.daily.map(row=>[row.business_day,row.final_charges])), max=Math.max(1,...summary.daily.flatMap(row=>[Number(row.collections||0),Number(byDay.get(row.business_day)||0)]));
    return `<section class="panel report-finance"><h3>Charges, collections & expenses</h3><p>Assessed rental charges use the handoff date; receipts use the date money was received. Cash is accepted in person and recorded by staff.</p><div class="module-stats">${metrics.map(([label,amount])=>`<article><span>${e(label)}</span><strong>${e(money(amount))}</strong></article>`).join('')}</div><div class="finance-chart report-money-chart" role="img" aria-label="Daily rental fees and money collected">${summary.daily.map(row=>`<div title="${e(row.business_day)} · fees ${e(money(byDay.get(row.business_day)||0))} · collected ${e(money(row.collections||0))}"><span style="height:${Math.max(2,Number(byDay.get(row.business_day)||0)/max*100)}%;background:#7799cb"></span><i style="height:${Math.max(2,Number(row.collections||0)/max*100)}%"></i><small>${e(row.business_day.slice(5))}</small></div>`).join('')}</div><p>Blue: assessed charges · Orange: verified collections. Net collected: <strong>${e(money(t.net_collected))}</strong> · After recorded expenses: <strong>${e(money(t.net_after_expenses))}</strong>.</p><small>${e(summary.basis)}${charges.totals.unknown_charges?` ${e(charges.totals.unknown_charges)} rental(s) have missing saved charges; unknown amounts are excluded.`:''}</small></section>`;
  }
  function bind(redraw) {
    const load=async()=>{if(loading||!range)return;loading=true;const current=revision;try{const query=new URLSearchParams({from:range.from,to:range.to});const [summary,charges]=await Promise.all([api('/finance/summary?'+query),api('/reports/daily?'+query)]);if(current===revision){value={summary,charges};error='';}}catch(problem){if(current===revision)error=problem.message;}finally{if(current===revision){loading=false;redraw();}}};
    if(!value&&!error&&!loading)load();
    document.querySelector('[data-report-money-retry]')?.addEventListener('click',()=>load());
  }
  return {render,bind,reset(){value=null;error='';loading=false;revision++;}};
}
