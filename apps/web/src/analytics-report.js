import {calculateAnalytics,manilaDateKey} from './analytics.js';
import {recordAttrs} from './record-links.js';

const cash=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2,maximumFractionDigits:2}).format(value||0);
const number=value=>new Intl.NumberFormat('en-PH',{maximumFractionDigits:1}).format(value||0);
const count=(value,noun)=>`${number(value)} ${noun}${value===1?'':'s'}`;
const percent=value=>value===null?'—':`${number(value*100)}%`;
const hours=value=>value===null?'—':`${number(value)} h`;
const elapsed=seconds=>seconds===null?'—':seconds<60?`${number(seconds)} sec`:seconds<3600?`${number(seconds/60)} min`:`${number(seconds/3600)} h`;

export const analyticsDefinitions=[
  ['Revenue trend','Sum of recorded rental fees for ACTIVE or COMPLETED rentals, grouped by rental confirmation date. Pending requests and cancelled rentals are excluded. This measures charges, not verified cash payments.'],
  ['Rentals trend','Number of confirmed rentals by day, calendar week (Monday–Sunday), or calendar month. The first and last buckets can be partial periods.'],
  ['Equipment utilization','Rented hours ÷ observed calendar hours × 100. Rental intervals are clipped to the period and overlapping records are counted once per item. Observation starts at the later of item creation or period start; recorded archived intervals are removed. Nights and maintenance hours remain in the denominator. Missing creation dates use period start and are noted below.'],
  ['Most rented equipment','Top five items by confirmed rental count in the period. Ties use rental fees, then equipment name.'],
  ['Least rented equipment','Lowest confirmed rental counts among equipment active now and already added by the period cutoff. Includes zero-rental items. Archived items are excluded.'],
  ['Revenue per equipment','Recorded rental fees summed per item. The highest-revenue ranking sorts by fees; the equipment table includes every matching item.'],
  ['Revenue per category','Recorded rental fees grouped by the equipment’s current category. Historical category changes are not reconstructed.'],
  ['Overdue rate','Late or still-overdue rentals ÷ valid rentals due in the selected period by its cutoff × 100. A late return is after its due time. Active rentals are late once due time passes. This uses recorded due dates without a grace allowance.'],
  ['On-time return rate','Returns at or before their due time ÷ completed returns with valid due dates × 100. Uses return dates in the period, so its sample differs from the overdue-rate sample.'],
  ['Average rental duration','Average of return confirmation time minus rental confirmation time for completed returns in the period. Measures the full rental duration; active rentals and invalid dates are excluded.'],
  ['Repeat customer rate','Customers with at least two confirmed rentals ÷ customers with at least one confirmed rental in the period × 100. Measures repeat activity within the chosen period.'],
  ['Maintenance frequency','Number of maintenance records started per item in the period. Includes inspections and preventive care; it is not a count of equipment failures.'],
  ['Maintenance downtime','Hours under maintenance within the period, merged per item to avoid double counting. Ongoing work stops at the period cutoff or current time. Fleet downtime is item-hours: two items unavailable for one hour equal two item-hours.'],
  ['Terminal verification time','Average elapsed time from request to confirmation for CONFIRMED terminal requests completed in the period. Includes queue and operator wait time. If the request has no confirmation timestamp, a matching rental/return confirmation is used when available. Missing or inconsistent times are excluded. Median is the middle value; P95 is the interpolated 95th percentile.']
];

export function renderAnalyticsReport(model,selection,view,h) {
  const {escape:e,paged,table}=h;
  const result=calculateAnalytics(model,selection),today=manilaDateKey(new Date());
  const empty=(title,text)=>`<div class="analytics-empty"><strong>${e(title)}</strong><p>${e(text)}</p></div>`;
  const head=(title,description,extra='')=>`<div class="analytics-panel-head"><div><h3>${title}</h3><p>${description}</p></div>${extra}</div>`;
  const card=(title,value,note)=>`<article class="panel"><span>${title}</span><strong>${value}</strong><small>${note}</small></article>`;
  const choices=(options,value)=>options.map(([id,label])=>`<option value="${e(id)}" ${id===value?'selected':''}>${e(label)}</option>`).join('');
  const items=(model.items||[]).filter(item=>!selection.categoryId||String(item.category_id)===selection.categoryId).sort((a,b)=>a.name.localeCompare(b.name));
  const header='';
  const filters=`<section class="panel analytics-filters" aria-label="Analytics filters">
    <label>Period<select id="analytics-period">${choices([['7d','Last 7 days'],['30d','Last 30 days'],['90d','Last 90 days'],['365d','Last 365 days'],['custom','Custom dates']],selection.period)}</select></label>
    ${selection.period==='custom'?`<label>From<input id="analytics-from" type="date" value="${e(selection.from)}" max="${today}"/></label><label>To<input id="analytics-to" type="date" value="${e(selection.to)}" max="${today}"/></label>`:''}
    <label>Trend grouping<select id="analytics-group">${choices([['auto','Automatic'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']],selection.groupBy||'auto')}</select></label>
    <label>Category<select id="analytics-category"><option value="">All categories</option>${choices((model.categories||[]).map(row=>[String(row.id),row.name]),selection.categoryId)}</select></label>
    <label>Equipment<select id="analytics-item"><option value="">All equipment</option>${choices(items.map(row=>[String(row.id),`${row.name} · ${row.item_code}`]),selection.itemId)}</select></label>
    <div class="analytics-filter-actions"><button class="primary" id="report-export" ${result.error?'disabled':''}>Export analytics CSV</button></div>
  </section>`;
  if(result.error)return `${header}${filters}<div class="info-box" role="alert">${e(result.error)}</div>`;
  const {totals:t,range}=result;

  function trendChart(metric) {
    const values=result.trend.map(row=>row[metric]),peak=Math.max(1,...values),maximum=metric==='rentals'?Math.ceil(peak/2)*2:peak,left=64,right=646,top=24,bottom=184;
    const points=values.map((value,index)=>({x:values.length===1?(left+right)/2:left+index*(right-left)/(values.length-1),y:bottom-value/maximum*(bottom-top)}));
    const revenue=metric==='fees',color=revenue?'#e77932':'#4b83c3',format=revenue?cash:number,gradientId=`analytics-${metric}-gradient`;
    const ticks=[0,.25,.5,.75,1],tickLabels=ticks.map(fraction=>`<g><line x1="${left}" x2="${right}" y1="${bottom-fraction*(bottom-top)}" y2="${bottom-fraction*(bottom-top)}" class="analytics-gridline"/><text x="${left-10}" y="${bottom-fraction*(bottom-top)+4}" text-anchor="end" class="analytics-axis-label">${revenue?'₱':''}${new Intl.NumberFormat('en-PH',{notation:'compact',maximumFractionDigits:1}).format(maximum*fraction)}</text></g>`).join('');
    let plot='';
    if(revenue){
      const line=points.length===1?`M${points[0].x} ${points[0].y}`:points.slice(1).reduce((path,point,index)=>{const previous=points[index],middle=(previous.x+point.x)/2;return `${path} C${middle} ${previous.y},${middle} ${point.y},${point.x} ${point.y}`;},`M${points[0].x} ${points[0].y}`);
      plot=`<path d="${line} L${points.at(-1).x} ${bottom} L${points[0].x} ${bottom} Z" fill="url(#${gradientId})"/><path d="${line}" class="analytics-trend-line analytics-trend-line-revenue"/>${points.length<=31?points.map((point,index)=>values[index]>0?`<circle class="analytics-trend-point analytics-trend-point-revenue" cx="${point.x}" cy="${point.y}" r="4"><title>${e(result.trend[index].label)}: ${format(values[index])}</title></circle>`:'').join(''):''}`;
    }else{
      const width=Math.max(2,Math.min(18,(right-left)/values.length*.62));
      const peakIndex=values.indexOf(Math.max(...values));
      plot=points.map((point,index)=>`<rect class="analytics-trend-bar${index===peakIndex?' is-peak':''}" x="${point.x-width/2}" y="${point.y}" width="${width}" height="${Math.max(0,bottom-point.y)}" rx="${Math.min(6,width/2)}" fill="url(#${gradientId})"><title>${e(result.trend[index].label)}: ${format(values[index])}</title></rect>`).join('');
    }
    const peakIndex=values.indexOf(Math.max(...values)),labels=[...new Set([0,Math.floor((points.length-1)*.25),Math.floor((points.length-1)*.5),Math.floor((points.length-1)*.75),points.length-1])];
    const peakPoint=points[peakIndex],peakValue=values[peakIndex],peakLabel=result.trend[peakIndex].label;
    return `<div class="analytics-chart analytics-chart-polished"><div class="analytics-chart-summary"><div><span class="analytics-chart-key ${revenue?'revenue':'rentals'}"></span><span>${revenue?'Rental fees':'Confirmed rentals'}</span></div><strong>${format(values.reduce((sum,value)=>sum+value,0))}</strong></div><svg viewBox="0 0 660 215" role="img" aria-label="${revenue?'Revenue':'Rentals'} ${result.groupBy} trend. Highest period: ${e(peakLabel)}, ${format(peakValue)}. Exact values are in the trend table below." focusable="false"><defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="${revenue?'.34':'.96'}"/><stop offset="100%" stop-color="${color}" stop-opacity="${revenue?'.015':'.4'}"/></linearGradient></defs>${tickLabels}<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" class="analytics-chart-baseline"/>${plot}${revenue?`<circle class="analytics-trend-peak" cx="${peakPoint.x}" cy="${peakPoint.y}" r="5"><title>Highest period, ${e(peakLabel)}: ${format(peakValue)}</title></circle>`:''}</svg><div class="analytics-chart-labels">${labels.map(index=>`<span>${e(result.trend[index].label)}</span>`).join('')}</div><div class="analytics-chart-foot"><span>Highest period</span><strong>${e(peakLabel)} <b>${format(peakValue)}</b></strong></div></div>`;
  }
  const ranking=(records,value,description)=>records.length?records.slice(0,5).map((row,index)=>`<div class="rank-row" ${recordAttrs('equipment', row.known ? row.id : null, row.name)}><span>${index+1}</span><strong>${e(row.name)}<small>${e(row.code)}</small></strong><em>${value(row)}<small>${description(row)}</small></em></div>`).join(''):empty('No matching activity','Values will appear when matching records are available.');
  const demandRows=result.equipment.slice(0,5),demandMaximum=Math.max(1,...demandRows.map(row=>row.rentals));
  const demandChart=demandRows.length?`<div class="analytics-demand-chart" role="group" aria-label="Top five equipment by confirmed rentals. Bar lengths compare each item with the busiest item.">${demandRows.map((row,index)=>`<div class="analytics-demand-row" ${recordAttrs('equipment', row.known ? row.id : null, row.name)}><div class="analytics-demand-label"><span>${String(index+1).padStart(2,'0')}</span><strong>${e(row.name)}<small>${e(row.code)} · ${cash(row.fees)} fees</small></strong><b>${count(row.rentals,'rental')}</b></div><div class="analytics-demand-track" aria-hidden="true"><span style="width:${row.rentals/demandMaximum*100}%"></span></div></div>`).join('')}</div>`:empty('No equipment rentals yet','Confirmed rental activity will appear here.');
  const categoryView=paged(result.categoryRevenue,'analytics-categories'),feeMaximum=Math.max(1,...result.categoryRevenue.map(row=>row.fees));
  const categoryRows=categoryView.rows.map(row=>`<div class="analytics-category-row"><div><strong>${e(row.name)}</strong><span>${cash(row.fees)} · ${count(row.rentals,'rental')}</span></div><div class="analytics-meter"><span style="width:${row.fees/feeMaximum*100}%"></span></div></div>`).join('');
  const statusColors={Available:'#6cab8d',Rented:'#698cc2',Pending:'#d9aa64',Maintenance:'#a184bd',Archived:'#9aa5b5'};
  const statusTotal=Object.values(result.equipmentStatus).reduce((sum,count)=>sum+count,0);let angle=0;
  const gradient=Object.entries(result.equipmentStatus).map(([name,count])=>{const from=angle;angle+=statusTotal?count/statusTotal*100:0;return `${statusColors[name]} ${from}% ${angle}%`;}).join(',');
  const statusContent=statusTotal?`<div class="analytics-status-layout"><div class="analytics-donut" style="background:conic-gradient(${gradient})"><span>${statusTotal}<small>items</small></span></div><div class="analytics-status-legend">${Object.entries(result.equipmentStatus).map(([name,count])=>`<div><i style="background:${statusColors[name]}"></i><span>${name}</span><strong>${count}</strong></div>`).join('')}</div></div>`:empty('No equipment','Add equipment to see its current status.');
  const sortOptions=[['rentals','Most rentals'],['least','Least rentals'],['fees','Highest rental fees'],['utilization','Highest utilization'],['maintenanceCount','Most maintenance'],['downtimeHours','Longest downtime'],['name','Name A–Z']];
  const sorted=[...result.performance].sort((a,b)=>view.sort==='name'?a.name.localeCompare(b.name):view.sort==='least'?a.rentals-b.rentals||a.name.localeCompare(b.name):(b[view.sort]??-1)-(a[view.sort]??-1)||a.name.localeCompare(b.name));
  const auditAvailable=Array.isArray(model.auditLogs);
  const equipmentView=paged(sorted,'analytics-equipment'),trendView=paged(result.trend,'analytics-trend'),terminalView=paged(result.terminalPerformance,'analytics-terminals'),auditView=paged(auditAvailable?model.auditLogs:[],'analytics-audit');
  const equipmentRows=equipmentView.rows.map(row=>`<tr ${recordAttrs('equipment', row.known ? row.id : null, row.name)}><td><strong>${e(row.name)}</strong><small>${e(row.code)} · ${e(row.category)}${row.active?'':' · Archived / historical'}</small></td><td>${row.rentals}</td><td>${cash(row.fees)}</td><td>${hours(row.rentedHours)}</td><td><strong>${percent(row.utilization)}</strong><small>${row.observedHours===null?'Collection history unavailable':`${number(row.observedHours)} observed h${row.observationAssumed?' · assumed start':''}`}</small></td><td>${row.maintenanceCount}</td><td>${hours(row.downtimeHours)}</td></tr>`).join('');
  const auditRows=auditView.rows.map(row=>{
    const date=row.created_at?new Date(`${String(row.created_at).replace(' ','T')}+08:00`):null;
    const when=date&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}).format(date):'Not recorded';
    const action=String(row.action||'Unknown action').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase());
    return `<tr ${recordAttrs('audit', row.id, 'audit record')}><td>${e(when)}</td><td><strong>${e(row.actor_name||'Unknown user')}</strong><small>${e(row.actor_type||'USER')}</small></td><td>${e(action)}</td><td><strong>${e(row.entity_label||row.entity_type||'Record')}</strong><small>${e(row.entity_type||'Record')} · ${e(row.entity_id||'No record ID')}</small></td></tr>`;
  }).join('');
  const selectedSection=['rental','equipment','service','forecast','recommendations','audit'].includes(view.section)?view.section:'rental';
  const sections=[['rental','Rental performance'],['equipment','Equipment insights'],['service','Service & operations'],['forecast','Forecasts'],['recommendations','Recommendations'],['audit','Audit logs']];
  const forecast=result.forecast,forecastUnit=forecast.groupBy==='daily'?'days':forecast.groupBy==='weekly'?'weeks':'months';
  const forecastRentals=forecast.points.reduce((sum,row)=>sum+row.rentals,0),forecastFees=forecast.points.reduce((sum,row)=>sum+row.fees,0);
  const forecastRows=forecast.points.map(row=>`<tr><td>${e(row.label)}<small>${row.from} – ${row.to}</small></td><td>${number(row.rentals)}</td><td>${cash(Math.round(row.fees))}</td><td>${row.samplePeriods}</td></tr>`).join('');
  const forecastContent=forecast.available?`<div class="analytics-kpis analytics-kpis-two">
      ${card(`Estimated rentals · next ${forecast.horizon} ${forecastUnit}`,number(forecastRentals),`Sum of ${forecast.horizon} reporting-period estimates`)}
      ${card(`Estimated fees · next ${forecast.horizon} ${forecastUnit}`,cash(Math.round(forecastFees)),'Recorded rental fees; estimate rounded to whole pesos')}
    </div>
    <section class="panel analytics-equipment-table">${head('Estimate by period',forecast.method)}${table(['PERIOD','EST. RENTALS','EST. FEES','HISTORICAL SAMPLES'],forecastRows)}</section>
    <p class="analytics-advisory-note">Uses complete periods only and excludes the current partial day, week, or month. Forecast dates follow the selected range, so a custom range ending in the past produces a retrospective projection. The estimate does not account for special events, weather, rate changes, or supply changes.</p>`:empty('Forecast needs more history',forecast.reason);
  const recommendationContent=result.recommendations.length?`<div class="analytics-recommendation-list">${result.recommendations.map(row=>`<article class="panel analytics-recommendation-card"><div class="analytics-recommendation-heading"><span>${e(row.type)}</span><h3>${e(row.title)}</h3></div><p>${e(row.action)}</p><small><strong>Why this appeared:</strong> ${e(row.basis)}</small></article>`).join('')}</div><p class="analytics-advisory-note">These are suggestions from visible rules and recorded data. Review the business context before acting; nothing is changed automatically.</p>`:empty('No recommendation rules matched','This does not guarantee that there are no issues; the selected records did not meet the configured thresholds.');

  return `${header}${filters}
    <p class="analytics-scope">${e(range.label)} · Philippine time · Recorded rental fees. ${range.to===today?'Today is a partial day.':''}</p>
    <div class="analytics-tabs" role="tablist" aria-label="Report sections">${sections.map(([id,label])=>`<button type="button" id="analytics-tab-${id}" role="tab" aria-controls="analytics-panel-${id}" aria-selected="${selectedSection===id}" tabindex="${selectedSection===id?'0':'-1'}" data-analytics-tab="${id}">${label}</button>`).join('')}</div>
    <section class="analytics-tab-panel" id="analytics-panel-rental" role="tabpanel" aria-labelledby="analytics-tab-rental" tabindex="0" data-analytics-panel="rental" ${selectedSection==='rental'?'':'hidden'}>
    <div class="analytics-kpis">
      ${card('Confirmed rental fees',cash(t.fees),'Recorded charges in the selected period')}
      ${card('Confirmed rentals',number(t.rentals),'Based on rental confirmation dates')}
      ${card('Equipment utilization',percent(t.utilization),`${number(t.rentedHours)} rented / ${number(t.observedHours)} observed item-hours`)}
      ${card('Average fee / rental',cash(t.averageFee),'Confirmed fees ÷ confirmed rentals')}
    </div>
    <div class="analytics-pair-grid">
      <section class="panel analytics-panel">${head('Revenue trend',`Confirmed rental fees · ${result.groupBy}`)}${t.rentals?trendChart('fees'):empty('No confirmed rental fees','Confirm a rental in this period to populate the chart.')}</section>
      <section class="panel analytics-panel">${head('Rentals trend',`Confirmed rental count · ${result.groupBy}`)}${t.rentals?trendChart('rentals'):empty('No confirmed rentals','Choose another period or confirm a rental.')}</section>
    </div>
    <details class="panel analytics-values" data-analytics-detail="trend" ${view.details.trend?'open':''}><summary>View exact trend values</summary>${table(['PERIOD','RENTAL FEES','RENTALS'],trendView.rows.map(row=>`<tr><td>${e(row.label)}<small>${row.from} – ${row.to}</small></td><td>${cash(row.fees)}</td><td>${row.rentals}</td></tr>`).join(''))}${trendView.footer}</details>
    </section>
    <section class="analytics-tab-panel" id="analytics-panel-equipment" role="tabpanel" aria-labelledby="analytics-tab-equipment" tabindex="0" data-analytics-panel="equipment" ${selectedSection==='equipment'?'':'hidden'}>
    <div class="analytics-ranking-grid">
      <section class="panel analytics-panel">${head('Most rented equipment','Top 5 by confirmed rental count · bars compare activity')}${demandChart}</section>
      <section class="panel analytics-panel analytics-least">${head('Least rented equipment','Active items, including zero rentals')}${ranking(result.leastRented,row=>count(row.rentals,'rental'),row=>row.rentals===0?'No confirmed rentals in period':cash(row.fees))}</section>
      <section class="panel analytics-panel">${head('Revenue per equipment','Top 5 by recorded rental fees')}${ranking(result.revenueEquipment,row=>cash(row.fees),row=>count(row.rentals,'rental'))}</section>
    </div>
    <section class="panel analytics-equipment-table">
      ${head('Equipment utilization & performance',`${count(result.performance.length,'item')} · 5 per page`,`<label class="analytics-sort">Sort by<select id="analytics-sort">${choices(sortOptions,view.sort)}</select></label>`)}
      ${result.performance.length?table(['EQUIPMENT','RENTALS','RENTAL FEES','RENTED TIME','UTILIZATION','MAINTENANCE','DOWNTIME'],equipmentRows)+equipmentView.footer:empty('No equipment in this period','Choose a different filter or date range.')}
    </section>
    <div class="analytics-pair-grid">
      <section class="panel analytics-panel">${head('Revenue per category','Fees grouped by current equipment category')}${categoryRows||empty('No category fees','Category totals appear after rental confirmation.')}${result.categoryRevenue.length>5?categoryView.footer:''}</section>
      <section class="panel analytics-panel">${head('Equipment right now','Current status, regardless of the date filter')}${statusContent}</section>
    </div>
    </section>
    <section class="analytics-tab-panel" id="analytics-panel-service" role="tabpanel" aria-labelledby="analytics-tab-service" tabindex="0" data-analytics-panel="service" ${selectedSection==='service'?'':'hidden'}>
    <div class="analytics-kpis">
      ${card('Overdue rate',percent(t.overdueRate),`${t.overdueRentals} of ${t.dueRentals} rentals due in period · ${t.overdueNow} overdue now`)}
      ${card('On-time return rate',percent(t.onTimeRate),`${t.onTimeReturns} of ${t.onTimeSamples} returns with valid due dates`)}
      ${card('Average rental duration',hours(t.averageDurationHours),`${t.durationSamples} completed rentals returned in period`)}
      ${card('Repeat customer rate',percent(t.repeatCustomerRate),`${t.repeatCustomers} of ${t.uniqueCustomers} customers rented 2+ times`)}
    </div>
    <div class="analytics-pair-grid">
      <section class="panel analytics-panel">${head('Maintenance frequency',`${count(t.maintenanceStarted,'record')} started · includes inspections`)}${ranking(result.maintenanceFrequency,row=>count(row.maintenanceCount,'record'),row=>`${hours(row.downtimeHours)} downtime`)}</section>
      <section class="panel analytics-panel">${head('Maintenance downtime',`${number(t.downtimeHours)} item-hours unavailable in period`)}${ranking(result.maintenanceDowntime,row=>hours(row.downtimeHours),row=>`${count(row.maintenanceCount,'record')} started`)}</section>
    </div>
    <section class="panel analytics-terminal-panel">
      ${head('Terminal verification time','Request to ESP32 confirmation, including queue and operator wait')}
      <div class="analytics-terminal-stats"><div><span>Average time</span><strong>${elapsed(t.verificationSeconds)}</strong></div><div><span>Median time</span><strong>${elapsed(t.verificationMedianSeconds)}</strong></div><div><span>95th percentile</span><strong>${elapsed(t.verificationP95Seconds)}</strong></div><div><span>Measured confirmations</span><strong>${t.verificationCount}</strong></div></div>
      ${result.terminalPerformance.length?table(['TERMINAL','CONFIRMATIONS','AVERAGE','MEDIAN','P95'],terminalView.rows.map(row=>`<tr ${recordAttrs('terminal', row.id, row.code || row.name)}><td><strong>${e(row.name)}</strong><small>${e(row.code)}</small></td><td>${row.count}</td><td>${elapsed(row.averageSeconds)}</td><td>${elapsed(row.medianSeconds)}</td><td>${elapsed(row.p95Seconds)}</td></tr>`).join(''))+terminalView.footer:empty('No timed confirmations yet','This fills in when a confirmed terminal request has valid request and confirmation times.')}
      ${result.linkedConfirmationTimes?`<p class="analytics-footnote">${result.linkedConfirmationTimes} confirmation times came from their linked rental or return record.</p>`:''}
    </section>
    </section>
    <section class="analytics-tab-panel" id="analytics-panel-audit" role="tabpanel" aria-labelledby="analytics-tab-audit" tabindex="0" data-analytics-panel="audit" ${selectedSection==='audit'?'':'hidden'}>
    <section class="panel analytics-equipment-table">${head('Recent activity','Latest 200 recorded actions by users, terminals, and system processes')}${auditRows?table(['WHEN · PHILIPPINE TIME','ACTOR','ACTION','RECORD'],auditRows)+auditView.footer:auditAvailable?empty('No audit log entries','Recorded system and workspace actions will appear here.'):empty('Activity history unavailable','Refresh to reload activity history. If it remains unavailable, reconnect to the workspace.')}</section>
    </section>
    <section class="analytics-tab-panel" id="analytics-panel-forecast" role="tabpanel" aria-labelledby="analytics-tab-forecast" tabindex="0" data-analytics-panel="forecast" ${selectedSection==='forecast'?'':'hidden'}>
      ${forecastContent}
    </section>
    <section class="analytics-tab-panel" id="analytics-panel-recommendations" role="tabpanel" aria-labelledby="analytics-tab-recommendations" tabindex="0" data-analytics-panel="recommendations" ${selectedSection==='recommendations'?'':'hidden'}>
      <section class="panel analytics-recommendations-panel">${head('Suggested next steps','Rule-based prompts from the current report filters; evidence and thresholds are shown on each suggestion.')}${recommendationContent}</section>
    </section>`;
}
