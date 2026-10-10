const DAY=86400000,HOUR=3600000;
const manilaFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'});
const labelFormatter=new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',month:'short',day:'numeric'});
const monthFormatter=new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',month:'short',year:'numeric'});

export function recordDate(value) {
  if(!value)return null;
  if(value instanceof Date)return Number.isNaN(value.getTime())?null:value;
  if(typeof value?.toDate==='function')return recordDate(value.toDate());
  if(typeof value!=='string')return null;
  const local=/^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(value);
  if(local&&!validDateKey(local[1]))return null;
  const normalized=local?value.replace(' ','T')+(value.length===10?'T00:00:00':'')+'+08:00':value;
  const parsed=new Date(normalized);
  return Number.isNaN(parsed.getTime())?null:parsed;
}

export function manilaDateKey(value) {
  const date=recordDate(value);if(!date)return null;
  const parts=Object.fromEntries(manilaFormatter.formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const shiftDate=(key,days)=>{const date=new Date(`${key}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
const labelDate=key=>labelFormatter.format(new Date(`${key}T00:00:00Z`));
function validDateKey(key){if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;const date=new Date(`${key}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===key;}
const cents=value=>{const number=Number(value);return Number.isFinite(number)&&number>0?Math.round(number*100):0;};
const ms=value=>recordDate(value)?.getTime()??null;
const average=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);if(!sorted.length)return null;const index=(sorted.length-1)*p,lower=Math.floor(index);return sorted[lower]+(sorted[Math.ceil(index)]-sorted[lower])*(index-lower);};
const ratio=(n,d)=>d>0?n/d:null;

export function analyticsRange(selection={},now=new Date()) {
  const today=manilaDateKey(now),period=selection.period||'30d';
  let from,to=today,days;
  if(period==='custom'){
    from=selection.from;to=selection.to;
    if(!validDateKey(from)||!validDateKey(to)||from>to||to>today)return {error:'Choose a valid date range ending today or earlier.'};
    days=Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/DAY)+1;
    if(days>366)return {error:'Choose a date range of 366 days or less.'};
  }else{days=({'7d':7,'30d':30,'90d':90,'365d':365})[period]||30;from=shiftDate(today,1-days);}
  return {from,to,days,label:`${labelDate(from)}, ${from.slice(0,4)} – ${labelDate(to)}, ${to.slice(0,4)}`};
}

function trendBuckets(range,groupBy) {
  const result=[];
  for(let from=range.from;from<=range.to;){
    let next;
    if(groupBy==='monthly'){const date=new Date(`${from.slice(0,7)}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+1);next=date.toISOString().slice(0,10);}
    else if(groupBy==='weekly'){const day=new Date(`${from}T00:00:00Z`).getUTCDay();next=shiftDate(from,7-((day+6)%7));}
    else next=shiftDate(from,1);
    const to=next>range.to?range.to:shiftDate(next,-1);
    const label=groupBy==='monthly'?monthFormatter.format(new Date(`${from}T00:00:00Z`)):from===to?labelDate(from):`${labelDate(from)}–${labelDate(to)}`;
    result.push({from,to,label,rentals:0,fees:0});from=next;
  }
  return result;
}

function completeTrendBuckets(trend,groupBy,today) {
  return trend.filter(bucket=>{
    if(bucket.to>=today)return false;
    if(groupBy==='daily')return bucket.from===bucket.to;
    const start=new Date(`${bucket.from}T00:00:00Z`),end=new Date(`${bucket.to}T00:00:00Z`);
    const days=Math.round((end-start)/DAY)+1;
    if(groupBy==='weekly')return start.getUTCDay()===1&&end.getUTCDay()===0&&days===7;
    if(start.getUTCDate()!==1)return false;
    const next=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
    next.setUTCDate(next.getUTCDate()-1);
    return next.toISOString().slice(0,10)===bucket.to;
  });
}

function forecastAnalytics(trend,groupBy,range,today) {
  const completed=completeTrendBuckets(trend,groupBy,today);
  const requirements={daily:28,weekly:8,monthly:8},horizons={daily:7,weekly:4,monthly:3};
  const requiredPeriods=requirements[groupBy]||28,horizon=horizons[groupBy]||7;
  const historyWindow=groupBy==='monthly'?completed.slice(-6):completed.slice(-requiredPeriods);
  const base={available:false,groupBy,requiredPeriods,completedPeriods:completed.length,horizon,points:[],method:groupBy==='daily'?'Same-weekday average from up to 4 recent weeks':groupBy==='weekly'?'Average of the last 8 complete weeks':'Average of the last 6 complete months'};
  if(completed.length<requiredPeriods)return {...base,reason:`Need ${requiredPeriods} complete ${groupBy} periods; found ${completed.length}.`};
  if(historyWindow.reduce((sum,row)=>sum+row.rentals,0)<4)return {...base,reason:'Need at least 4 confirmed rentals in the completed history window.'};

  let from=shiftDate(range.to,1);
  if(groupBy==='weekly')while(new Date(`${from}T00:00:00Z`).getUTCDay()!==1)from=shiftDate(from,1);
  if(groupBy==='monthly'){
    const next=new Date(`${range.to.slice(0,7)}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);from=next.toISOString().slice(0,10);
  }
  const points=[];
  for(let index=0;index<horizon;index++){
    let to,label,samples=historyWindow;
    if(groupBy==='daily'){
      to=from;label=labelDate(from);
      const weekday=new Date(`${from}T00:00:00Z`).getUTCDay();
      samples=historyWindow.filter(row=>new Date(`${row.from}T00:00:00Z`).getUTCDay()===weekday).slice(-4);
    }else if(groupBy==='weekly'){
      to=shiftDate(from,6);label=`${labelDate(from)}–${labelDate(to)}`;
    }else{
      const next=new Date(`${from.slice(0,7)}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);next.setUTCDate(next.getUTCDate()-1);
      to=next.toISOString().slice(0,10);label=monthFormatter.format(new Date(`${from}T00:00:00Z`));
    }
    points.push({from,to,label,rentals:average(samples.map(row=>row.rentals))??0,fees:average(samples.map(row=>row.fees))??0,samplePeriods:samples.length});
    from=shiftDate(to,1);
  }
  return {...base,available:true,completedPeriods:historyWindow.length,points};
}

function buildRecommendations(performance,totals,range) {
  const recommendations=[];
  const add=(type,title,action,basis)=>recommendations.push({type,title,action,basis});
  if(totals.dueRentals>=5&&totals.overdueRate!==null&&totals.overdueRate>=.2){
    add('Operations','Review overdue follow-up','Check reminder timing and the return handoff process before changing due-date policies.',`${totals.overdueRentals} of ${totals.dueRentals} valid rentals due in this period were late (${Math.round(totals.overdueRate*100)}%).`);
  }
  if(totals.verificationCount>=5&&totals.verificationP95Seconds>=60){
    add('Operations','Review terminal handoff delays','Check the operator queue and terminal/network conditions; this measure includes both queue and operator wait.',`${totals.verificationCount} confirmations measured; P95 was ${Math.round(totals.verificationP95Seconds)} seconds.`);
  }
  const repeatService=performance.filter(row=>row.known&&row.maintenanceCount>=2).sort((a,b)=>b.maintenanceCount-a.maintenanceCount||b.downtimeHours-a.downtimeHours).slice(0,2);
  for(const row of repeatService)add('Reliability',`Review repeat service for ${row.name}`,'Check whether the recent service records point to a recurring issue or a preventive inspection schedule.',`${row.maintenanceCount} maintenance records started in this period, including inspections; ${row.downtimeHours.toFixed(1)} item-hours of downtime.`);

  const active=performance.filter(row=>row.known&&row.active&&row.status!=='UNDER_MAINTENANCE'&&row.observedHours>0);
  const topCount=Math.max(1,Math.ceil(active.length*.25));
  const highDemand=[...active].sort((a,b)=>b.rentals-a.rentals||b.fees-a.fees||a.name.localeCompare(b.name)).slice(0,topCount).filter(row=>row.rentals>=3);
  for(const row of highDemand)add('Equipment',`Review capacity for ${row.name}`,'Check availability and booking pressure before deciding whether another unit is worthwhile.',`${row.rentals} confirmed rentals in the period; this item is in the top quarter of active equipment by rental count.`);
  if(range.days>=30&&totals.rentals>=5){
    const noDemand=active.filter(row=>row.rentals===0).slice(0,3);
    for(const row of noDemand)add('Equipment',`Review listing for ${row.name}`,'Check visibility, relevance, and rate fit; keep the item available while you review the context.',`No confirmed rentals in ${range.days} days while the item was active for ${row.observedHours.toFixed(0)} observed hours.`);
  }
  return recommendations.slice(0,6);
}

// Merge overlaps so one physical item never contributes the same hour twice.
function mergeIntervals(intervals) {
  const result=[];
  for(const interval of intervals.filter(([start,end])=>end>start).sort((a,b)=>a[0]-b[0])){
    const previous=result.at(-1);
    if(previous&&interval[0]<=previous[1])previous[1]=Math.max(previous[1],interval[1]);else result.push([...interval]);
  }
  return result;
}
const intervalHours=intervals=>mergeIntervals(intervals).reduce((total,[start,end])=>total+(end-start)/HOUR,0);
const intersect=(intervals,windows)=>intervals.flatMap(([start,end])=>windows.map(([left,right])=>[Math.max(start,left),Math.min(end,right)]));

function collectionWindows(item,history,start,end) {
  const created=ms(item.created_at),left=Math.max(start,created??start);
  if(left>=end)return {windows:[],assumed:created===null};
  const events=history.filter(row=>ms(row.changed_at)!==null).sort((a,b)=>ms(a.changed_at)-ms(b.changed_at));
  const previous=events.filter(row=>ms(row.changed_at)<=left).at(-1),next=events.find(row=>ms(row.changed_at)>left);
  if(item.is_active===false&&!previous&&!next?.old_status)return {windows:null,assumed:created===null};
  let active=previous?previous.new_status!=='INACTIVE':next?.old_status?next.old_status!=='INACTIVE':item.is_active!==false;
  let cursor=left;const windows=[];
  for(const event of events.filter(row=>ms(row.changed_at)>left&&ms(row.changed_at)<end)){
    const at=ms(event.changed_at);if(active)windows.push([cursor,at]);cursor=at;active=event.new_status!=='INACTIVE';
  }
  if(active)windows.push([cursor,end]);
  return {windows,assumed:created===null};
}

export function calculateAnalytics(data,selection={},now=new Date()) {
  const range=analyticsRange(selection,now);if(range.error)return {range,error:range.error};
  const start=ms(range.from),end=ms(shiftDate(range.to,1)),asOf=Math.min(end,now.getTime());
  const within=value=>{const at=ms(value);return at!==null&&at>=start&&at<end&&at<=now.getTime();};
  const items=data.items||[],transactions=data.transactions||[],categories=data.categories||[],maintenance=data.maintenance||[];
  const itemMap=new Map(items.map(item=>[String(item.id),item])),rentalMap=new Map(transactions.map(row=>[String(row.id),row]));
  const categoryMap=new Map(categories.map(category=>[String(category.id),category.name]));
  const allowed=id=>{const item=itemMap.get(String(id));return (!selection.itemId||String(id)===String(selection.itemId))&&(!selection.categoryId||String(item?.category_id)===String(selection.categoryId));};
  const selectedItems=items.filter(item=>allowed(item.id));
  const selectedTransactions=transactions.filter(row=>allowed(row.item_id));
  const settled=selectedTransactions.filter(row=>['ACTIVE','RETURN_PENDING_INSPECTION','COMPLETED'].includes(row.status));
  const confirmed=settled.filter(row=>within(row.confirmed_rental_at));
  const physicalReturn = row => row.received_at || row.confirmed_return_at;
  const returns=settled.filter(row=>row.status==='COMPLETED'&&within(physicalReturn(row)));
  const validDue=row=>ms(row.due_at)!==null&&ms(row.confirmed_rental_at)!==null&&ms(row.due_at)>=ms(row.confirmed_rental_at);
  const onTimeSamples=returns.filter(row=>validDue(row)&&ms(physicalReturn(row))>=ms(row.confirmed_rental_at));
  const onTimeReturns=onTimeSamples.filter(row=>ms(physicalReturn(row))<=ms(row.due_at)).length;
  const dueRentals=settled.filter(row=>validDue(row)&&within(row.due_at)&&(row.status==='ACTIVE'||ms(physicalReturn(row))!==null&&ms(physicalReturn(row))>=ms(row.confirmed_rental_at)));
  const overdueRentals=dueRentals.filter(row=>row.status==='COMPLETED'?ms(physicalReturn(row))>ms(row.due_at):ms(row.due_at)<asOf);
  const overdueNow=settled.filter(row=>row.status==='ACTIVE'&&validDue(row)&&ms(row.due_at)<now.getTime()).length;
  const durations=returns.filter(row=>ms(row.confirmed_rental_at)!==null&&ms(physicalReturn(row))>=ms(row.confirmed_rental_at)).map(row=>(ms(physicalReturn(row))-ms(row.confirmed_rental_at))/HOUR);
  const feeTotalCents=confirmed.reduce((total,row)=>total+cents(row.rental_fee),0);
  const customerCounts=new Map();for(const row of confirmed)if(row.customer_id)customerCounts.set(String(row.customer_id),(customerCounts.get(String(row.customer_id))||0)+1);
  const repeatCustomers=[...customerCounts.values()].filter(count=>count>=2).length;
  const performanceMap=new Map(selectedItems.filter(item=>ms(item.created_at)===null||ms(item.created_at)<asOf).map(item=>[String(item.id),{
    id:String(item.id),name:item.name,code:item.item_code||'',category:categoryMap.get(String(item.category_id))||'Uncategorized',
    active:item.is_active!==false,status:item.status||'',known:true,rentals:0,fees:0,maintenanceCount:0,rentedHours:0,downtimeHours:0,observedHours:0,utilization:null
  }]));
  function itemRow(id,source={}){
    const key=String(id);
    if(!performanceMap.has(key))performanceMap.set(key,{id:key,name:source.item_name||'Unknown equipment',code:source.item_code||'',category:'Uncategorized',active:false,status:'',known:false,rentals:0,fees:0,maintenanceCount:0,rentedHours:0,downtimeHours:0,observedHours:null,utilization:null});
    return performanceMap.get(key);
  }
  const categoryTotals=new Map();
  for(const row of confirmed){
    const item=itemRow(row.item_id,row);item.rentals++;item.fees+=cents(row.rental_fee);
    const key=String(itemMap.get(String(row.item_id))?.category_id||'unknown');
    const category=categoryTotals.get(key)||{id:key,name:categoryMap.get(key)||'Uncategorized',rentals:0,fees:0};
    category.rentals++;category.fees+=cents(row.rental_fee);categoryTotals.set(key,category);
  }
  const rentalIntervals=new Map(),maintenanceIntervals=new Map();let invalidRentalIntervals=0,invalidMaintenanceIntervals=0;
  for(const row of settled){
    const left=ms(row.confirmed_rental_at),right=ms(row.received_at)|| (row.status==='ACTIVE'?asOf:ms(physicalReturn(row)));
    if(left===null||right===null||right<left){invalidRentalIntervals++;continue;}
    if(left>=asOf||right<=start)continue;
    const key=String(row.item_id);itemRow(key,row);if(!rentalIntervals.has(key))rentalIntervals.set(key,[]);
    rentalIntervals.get(key).push([Math.max(start,left),Math.min(asOf,right)]);
  }
  const maintenanceSelected=maintenance.filter(row=>allowed(row.item_id)&&['IN_PROGRESS','COMPLETED'].includes(row.status));
  let maintenanceStarted=0;
  for(const row of maintenanceSelected){
    const left=ms(row.started_at),right=row.status==='IN_PROGRESS'?asOf:ms(row.completed_at);
    if(within(row.started_at)){itemRow(row.item_id,row).maintenanceCount++;maintenanceStarted++;}
    if(left===null||right===null||right<left){invalidMaintenanceIntervals++;continue;}
    if(left>=asOf||right<=start)continue;
    const key=String(row.item_id);itemRow(key,row);if(!maintenanceIntervals.has(key))maintenanceIntervals.set(key,[]);
    maintenanceIntervals.get(key).push([Math.max(start,left),Math.min(asOf,right)]);
  }
  let assumedCollectionStart=0,unknownCollectionTime=0;
  for(const row of performanceMap.values()){
    const item=itemMap.get(row.id),rentals=rentalIntervals.get(row.id)||[],care=maintenanceIntervals.get(row.id)||[];
    const observation=item?collectionWindows(item,(data.statusHistory||[]).filter(event=>String(event.item_id)===row.id),start,asOf):{windows:null,assumed:false};
    row.fees/=100;row.downtimeHours=intervalHours(care);
    row.rentedHours=intervalHours(observation.windows?intersect(rentals,observation.windows):rentals);
    row.observedHours=observation.windows?intervalHours(observation.windows):null;
    row.utilization=ratio(row.rentedHours,row.observedHours);row.observationAssumed=observation.assumed;
    if(observation.assumed)assumedCollectionStart++;
    if(observation.windows===null)unknownCollectionTime++;
  }
  const byDemand=(a,b)=>b.rentals-a.rentals||b.fees-a.fees||a.name.localeCompare(b.name);
  const performance=[...performanceMap.values()].sort(byDemand),equipment=performance.filter(row=>row.rentals>0);
  const leastRented=performance.filter(row=>row.known&&row.active).sort((a,b)=>a.rentals-b.rentals||a.fees-b.fees||a.name.localeCompare(b.name));
  const revenueEquipment=equipment.slice().sort((a,b)=>b.fees-a.fees||byDemand(a,b));
  const maintenanceFrequency=performance.filter(row=>row.maintenanceCount>0).sort((a,b)=>b.maintenanceCount-a.maintenanceCount||b.downtimeHours-a.downtimeHours||a.name.localeCompare(b.name));
  const maintenanceDowntime=performance.filter(row=>row.downtimeHours>0).sort((a,b)=>b.downtimeHours-a.downtimeHours||a.name.localeCompare(b.name));
  const categoryRevenue=[...categoryTotals.values()].map(row=>({...row,fees:row.fees/100})).sort((a,b)=>b.fees-a.fees||b.rentals-a.rentals||a.name.localeCompare(b.name));
  const groupBy=['daily','weekly','monthly'].includes(selection.groupBy)?selection.groupBy:range.days>90?'monthly':range.days>31?'weekly':'daily';
  const trend=trendBuckets(range,groupBy);
  for(const row of confirmed){const key=manilaDateKey(row.confirmed_rental_at),bucket=trend.find(value=>key>=value.from&&key<=value.to);if(bucket){bucket.rentals++;bucket.fees+=cents(row.rental_fee);}}
  for(const bucket of trend)bucket.fees/=100;
  const reserved=new Set(selectedTransactions.filter(row=>['PENDING_VERIFICATION','PENDING_ADMIN_APPROVAL','APPROVED'].includes(row.status)).map(row=>String(row.item_id)));
  const equipmentStatus={Available:0,Rented:0,Pending:0,Maintenance:0,Archived:0};
  for(const item of selectedItems){if(item.is_active===false)equipmentStatus.Archived++;else if(item.status==='UNDER_MAINTENANCE')equipmentStatus.Maintenance++;else if(item.status==='RENTED')equipmentStatus.Rented++;else if(['RESERVED_PENDING','UNDER_INSPECTION'].includes(item.status)||reserved.has(String(item.id)))equipmentStatus.Pending++;else equipmentStatus.Available++;}
  const terminalMap=new Map((data.terminals||[]).map(row=>[String(row.id),row])),terminalGroups=new Map(),verificationSamples=[];
  let invalidVerification=0,linkedConfirmationTimes=0;
  for(const request of data.verification||[]){
    if(request.status!=='CONFIRMED')continue;
    const rental=rentalMap.get(String(request.rental_id));
    if(!allowed(rental?.item_id??request.item_id))continue;
    const direct=ms(request.confirmed_at),linked=request.transaction_type==='RENTAL'?ms(rental?.confirmed_rental_at):request.transaction_type==='RETURN'?ms(rental?.confirmed_return_at):null;
    const confirmedAt=direct??linked,requestedAt=ms(request.requested_at);
    if(confirmedAt!==null&&!within(new Date(confirmedAt)))continue;
    if(confirmedAt===null||requestedAt===null||confirmedAt<requestedAt||!request.terminal_id){invalidVerification++;continue;}
    const seconds=(confirmedAt-requestedAt)/1000,key=String(request.terminal_id),terminal=terminalMap.get(key);
    if(direct===null)linkedConfirmationTimes++;
    const group=terminalGroups.get(key)||{id:key,name:terminal?.name||'Unregistered terminal',code:terminal?.terminal_code||key,seconds:[]};
    group.seconds.push(seconds);terminalGroups.set(key,group);verificationSamples.push(seconds);
  }
  const terminalPerformance=[...terminalGroups.values()].map(({seconds,...row})=>({...row,count:seconds.length,averageSeconds:average(seconds),medianSeconds:percentile(seconds,.5),p95Seconds:percentile(seconds,.95)})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const measured=performance.filter(row=>row.observedHours>0),observedHours=measured.reduce((sum,row)=>sum+row.observedHours,0),rentedHours=measured.reduce((sum,row)=>sum+row.rentedHours,0);
  const totals={
    fees:feeTotalCents/100,rentals:confirmed.length,averageFee:confirmed.length?feeTotalCents/100/confirmed.length:0,
    returns:returns.length,onTimeReturns,onTimeSamples:onTimeSamples.length,onTimeRate:ratio(onTimeReturns,onTimeSamples.length),
    overdueNow,overdueRentals:overdueRentals.length,dueRentals:dueRentals.length,overdueRate:ratio(overdueRentals.length,dueRentals.length),
    averageDurationHours:average(durations),durationSamples:durations.length,
    repeatCustomers,uniqueCustomers:customerCounts.size,repeatCustomerRate:ratio(repeatCustomers,customerCounts.size),
    maintenanceStarted,downtimeHours:performance.reduce((sum,row)=>sum+row.downtimeHours,0),
    rentedHours,observedHours,utilization:ratio(rentedHours,observedHours),measuredItems:measured.length,
    verificationSeconds:average(verificationSamples),verificationMedianSeconds:percentile(verificationSamples,.5),verificationP95Seconds:percentile(verificationSamples,.95),verificationCount:verificationSamples.length
  };
  const quality=[
    {count:invalidRentalIntervals,text:'rental records have missing or invalid start/return times and cannot contribute rental hours.'},
    {count:returns.length-onTimeSamples.length,text:'returns have incomplete or inconsistent dates and are excluded from the on-time rate.'},
    {count:invalidMaintenanceIntervals,text:'maintenance records have incomplete or inconsistent dates and cannot contribute downtime.'},
    {count:invalidVerification,text:'confirmed verification records have missing or inconsistent times or terminal details.'},
    {count:assumedCollectionStart,text:'items have no added date; their observed calendar time starts at the selected period start.'},
    {count:unknownCollectionTime,text:'items have insufficient collection history and are excluded from utilization.'}
  ].filter(row=>row.count>0);
  const forecast=forecastAnalytics(trend,groupBy,range,manilaDateKey(now));
  const recommendations=buildRecommendations(performance,totals,range);
  return {range,groupBy,asOf:new Date(asOf).toISOString(),confirmed,returns,trend,equipment,leastRented,revenueEquipment,performance,categoryRevenue,equipmentStatus,maintenanceFrequency,maintenanceDowntime,terminalPerformance,linkedConfirmationTimes,quality,totals,forecast,recommendations};
}

export function analyticsCsv(result,data,selection={}) {
  if(result.error)throw new Error(result.error);
  const t=result.totals,number=value=>value===null?'Not enough data':Math.round(value*10000)/10000;
  const category=(data.categories||[]).find(row=>String(row.id)===String(selection.categoryId)),item=(data.items||[]).find(row=>String(row.id)===String(selection.itemId));
  const forecastRows=result.forecast.available
    ?[['Method',result.forecast.method],['Completed periods used',result.forecast.completedPeriods],['From','To','Label','Estimated rental fees (PHP)','Estimated rentals'],...result.forecast.points.map(row=>[row.from,row.to,row.label,row.fees,row.rentals])]
    :[['Status','Unavailable'],['Reason',result.forecast.reason],['Complete periods found',result.forecast.completedPeriods],['Complete periods required',result.forecast.requiredPeriods]];
  const recommendationRows=result.recommendations.length
    ?result.recommendations.map(row=>[row.type,row.title,row.action,row.basis])
    :[['No recommendation thresholds were met for the selected period.']];
  const rows=[
    ['Rent & Play analytics'],['Period',result.range.from,result.range.to],['Grouping',result.groupBy],['Measured through (UTC)',result.asOf],
    ['Category',category?.name||'All categories'],['Equipment',item?.name||'All equipment'],
    ['Basis','Confirmed rental fees are grouped in Philippine time.'],[],
    ['Metric','Value','Basis'],
    ['Confirmed rental fees (PHP)',t.fees,'Rental confirmed in period'],['Confirmed rentals',t.rentals,'Rental confirmed in period'],
    ['Average fee (PHP)',number(t.averageFee),'Confirmed fees / confirmed rentals'],
    ['Utilization (%)',number(t.utilization===null?null:t.utilization*100),'Rented hours / observed calendar hours'],
    ['On-time return rate (%)',number(t.onTimeRate===null?null:t.onTimeRate*100),`${t.onTimeReturns} / ${t.onTimeSamples} returns with valid due dates`],
    ['Overdue rate (%)',number(t.overdueRate===null?null:t.overdueRate*100),`${t.overdueRentals} / ${t.dueRentals} rentals due in period by cutoff`],
    ['Overdue now',t.overdueNow,'Current active rentals across all dates'],
    ['Average rental duration (hours)',number(t.averageDurationHours),`${t.durationSamples} completed rentals returned in period`],
    ['Repeat customer rate (%)',number(t.repeatCustomerRate===null?null:t.repeatCustomerRate*100),`${t.repeatCustomers} / ${t.uniqueCustomers} customers with confirmed rentals in period`],
    ['Maintenance started',t.maintenanceStarted,'Records started in period; includes inspections'],
    ['Maintenance downtime (item-hours)',number(t.downtimeHours),'Merged time per item within period'],
    ['Average terminal verification (seconds)',number(t.verificationSeconds),`${t.verificationCount} valid confirmations in period`],
    ['Median terminal verification (seconds)',number(t.verificationMedianSeconds)],['P95 terminal verification (seconds)',number(t.verificationP95Seconds)],[],
    ['FORECAST'],...forecastRows,[],
    ['PRESCRIPTIVE RECOMMENDATIONS'],['Type','Recommendation','Suggested action','Evidence'],...recommendationRows,[],
    ['TREND'],['From','To','Label','Rental fees (PHP)','Rentals'],...result.trend.map(row=>[row.from,row.to,row.label,row.fees,row.rentals]),[],
    ['EQUIPMENT PERFORMANCE'],['Equipment','Item code','Category','Active now','Rentals','Rental fees (PHP)','Rented hours','Observed hours','Utilization (%)','Maintenance started','Downtime hours'],
    ...result.performance.map(row=>[row.name,row.code,row.category,row.active?'Yes':'No',row.rentals,row.fees,number(row.rentedHours),number(row.observedHours),number(row.utilization===null?null:row.utilization*100),row.maintenanceCount,number(row.downtimeHours)]),[],
    ['CATEGORY FEES'],['Category','Rental fees (PHP)','Rentals'],...result.categoryRevenue.map(row=>[row.name,row.fees,row.rentals]),[],
    ['TERMINAL VERIFICATION'],['Terminal','Code','Confirmations','Average seconds','Median seconds','P95 seconds'],...result.terminalPerformance.map(row=>[row.name,row.code,row.count,number(row.averageSeconds),number(row.medianSeconds),number(row.p95Seconds)]),[],
    ['DATA COVERAGE'],...result.quality.map(row=>[row.count,row.text]),['Linked confirmation timestamps',result.linkedConfirmationTimes],[],
    ['CONFIRMED RENTALS'],['Rental code','Equipment','Customer','Confirmed rental','Status','Rental fee','Due','Returned'],
    ...result.confirmed.map(row=>[row.rental_code||row.id,row.item_name||(data.items||[]).find(item=>String(item.id)===String(row.item_id))?.name||'Unknown equipment',row.customer_name||'',row.confirmed_rental_at,row.status,row.rental_fee,row.due_at,row.confirmed_return_at])
  ];
  const cell=value=>{const text=String(value??''),safe=/^[\s]*[=+@-]|^[\t\r\n]/.test(text)?"'"+text:text;return '"'+safe.replaceAll('"','""')+'"';};
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
