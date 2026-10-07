import {asDate,docData} from './firebase.mjs';
import {publicTerminal,serializeTransaction} from './transactions.mjs';

export function databaseDate(value) {return asDate(value);}
export const dateKey = date => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function rentalStatus(row,now=new Date()) {
  if(row.status!=='ACTIVE')return row.status==='APPROVED'?'Awaiting pickup':row.status==='RETURN_PENDING_INSPECTION'?'Inspection pending':row.status==='PENDING_ADMIN_APPROVAL'?'Pending admin review':row.status==='PENDING_VERIFICATION'?'Pending':row.status;
  const due=databaseDate(row.due_at);
  if(due<now)return 'Overdue';
  return dateKey(due)===dateKey(now)?'Due today':'Active';
}
export function revenueWeeks(rows,now=new Date()) {
  const localToday=new Date(`${dateKey(now)}T00:00:00+08:00`);
  const localDay=new Date(localToday.getTime()+8*3600000).getUTCDay();
  const monday=localToday.getTime()-((localDay+6)%7)*86400000;
  const result={'This week':Array(7).fill(0),'Last week':Array(7).fill(0)};
  for(const row of rows){
    if(!['ACTIVE','RETURN_PENDING_INSPECTION','COMPLETED'].includes(row.status)||!row.confirmed_rental_at)continue;
    const index=Math.floor((databaseDate(row.confirmed_rental_at).getTime()-monday)/86400000);
    if(index>=0&&index<7)result['This week'][index]+=Number(row.rental_fee||0);
    if(index>=-7&&index<0)result['Last week'][index+7]+=Number(row.rental_fee||0);
  }
  return result;
}

const rows=snapshot=>snapshot.docs.map(docData);
export async function loadDashboard(db,now=new Date()) {
  const names=['items','item_categories','item_rates','customers','rentals','verification_requests','terminals'];
  const snapshots=await Promise.all(names.map(name=>db.collection(name).get()));
  const source=Object.fromEntries(names.map((name,index)=>[name,rows(snapshots[index])]));
  const categoriesById=new Map(source.item_categories.map(category=>[category.id,category]));
  const itemsById=new Map(source.items.map(item=>[item.id,item]));
  const customersById=new Map(source.customers.map(customer=>[customer.id,customer]));
  const terminalsById=new Map(source.terminals.map(terminal=>[terminal.id,terminal]));
  const rentalsById=new Map(source.rentals.map(rental=>[rental.id,rental]));
  const currentRate=itemId=>source.item_rates.filter(rate=>String(rate.item_id)===itemId&&rate.is_active!==false&&asDate(rate.effective_from)<=now&&(!rate.effective_to||asDate(rate.effective_to)>now)).sort((a,b)=>asDate(b.effective_from)-asDate(a.effective_from))[0];
  const open=source.rentals.filter(rental=>['PENDING_VERIFICATION','PENDING_ADMIN_APPROVAL','APPROVED','ACTIVE','RETURN_PENDING_INSPECTION'].includes(rental.status)).sort((a,b)=>asDate(a.due_at)-asDate(b.due_at));
  const reserved=new Set(open.filter(rental=>['PENDING_VERIFICATION','PENDING_ADMIN_APPROVAL','APPROVED'].includes(rental.status)).map(rental=>String(rental.item_id)));
  const items=source.items.filter(item=>item.is_active!==false).map(item=>{
    const {image_data,...itemFields}=item;
    const rate=currentRate(item.id)||{};
    return {...itemFields,category:categoriesById.get(String(item.category_id))?.name||'Uncategorized',rental_rate:rate.rental_rate??null,rate_type:rate.rate_type??null,status:item.status==='AVAILABLE'&&reserved.has(item.id)?'RESERVED_PENDING':item.status};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  const rentals=open.map(rental=>{
    const item=itemsById.get(String(rental.item_id))||{};
    const customer=customersById.get(String(rental.customer_id))||{};
    return {...rental,item_name:item.name||'Unknown equipment',item_code:item.item_code||'',customer:customer.full_name||'Unknown customer',displayStatus:rentalStatus(rental,now)};
  });
  const pending=source.verification_requests.filter(request=>request.status==='PENDING').map(request=>{
    const rental=rentalsById.get(String(request.rental_id))||{};
    const item=itemsById.get(String(rental.item_id))||{};
    const customer=customersById.get(String(rental.customer_id))||{};
    const terminal=terminalsById.get(String(request.terminal_id))||{};
    return {...request,terminal_code:terminal.terminal_code||'',item_code:item.item_code||'',item_name:item.name||'Unknown equipment',customer:customer.full_name||'Unknown customer'};
  }).sort((a,b)=>asDate(a.requested_at)-asDate(b.requested_at));
  const terminals=source.terminals.filter(terminal=>terminal.is_active!==false).map(terminal=>({...publicTerminal(terminal),online:terminal.status==='ONLINE'&&!!terminal.last_seen_at&&now-asDate(terminal.last_seen_at)<90000}));
  const active=rentals.filter(rental=>rental.status==='ACTIVE');
  const categories=source.item_categories.map(category=>({name:category.name,count:items.filter(item=>String(item.category_id)===category.id).length})).sort((a,b)=>a.name.localeCompare(b.name));
  const serialize=serializeTransaction;
  return {
    items:items.map(serialize),customers:source.customers.filter(c=>c.is_active!==false).sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(serialize),categories,
    rentals:rentals.map(serialize),pending:pending.map(serialize),terminals:terminals.map(serialize),revenue:revenueWeeks(source.rentals,now),
    stats:{active:active.length,available:items.filter(item=>item.status==='AVAILABLE'&&!reserved.has(item.id)).length,dueToday:active.filter(r=>rentalStatus(r,now)==='Due today').length,overdue:rentals.filter(r=>r.displayStatus==='Overdue').length,fees:active.reduce((total,r)=>total+Number(r.rental_fee||0),0)},
    refreshedAt:now.toISOString()
  };
}
