import { docData } from './firebase.mjs';
import { serializeLedger } from './payment-ledger.mjs';
import { OPEN_RENTALS } from './rental-calendar.mjs';
import { dateRange, pageLimit, validDay, validDocumentId } from './query-validation.mjs';
import { isStaffRole } from './roles.mjs';

const fail = message => { throw Object.assign(new Error(message), {status:400}); };
const configs = { rentals:{collection:'rentals',code:'rental_code',name:'item_name'}, customers:{collection:'customers',code:'customer_code',name:'full_name'}, maintenance:{collection:'maintenance_records',code:'maintenance_code',name:'item_name'} };
export async function recordPage(db, kind, options = {}) {
  const config = configs[kind]; if (!config) fail('Unknown record list.');
  const limit = pageLimit(options.limit);
  dateRange(options.from,options.to);
  if(options.scheduledDay && (kind!=='rentals' || !validDay(options.scheduledDay)))fail('Choose a valid scheduled rental day.');
  for(const param of ['customerId','itemId'])if(options[param] && !validDocumentId(options[param]))fail('Choose a valid record reference.');
  let query = db.collection(config.collection), order = '__name__';
  if (options.status && options.status !== 'ALL') query = options.status === 'OPEN' && kind === 'rentals' ? query.where('status','in',OPEN_RENTALS) : kind === 'maintenance' && ['OPEN','CLOSED'].includes(options.status) ? query.where('status','in',options.status==='OPEN'?['OPEN','IN_PROGRESS']:['COMPLETED','RETIRED']) : query.where(kind === 'customers' ? 'is_active' : 'status','==',kind === 'customers' ? options.status !== 'INACTIVE' : options.status);
  for (const [param,field] of [['customerId','customer_id'],['itemId','item_id']]) if (options[param]) query=query.where(field,'==',String(options[param]));
  if (options.from || options.to) {
    order = 'created_at';
    if (options.from) query=query.where('created_at','>=',new Date(options.from+'T00:00:00+08:00'));
    if (options.to) query=query.where('created_at','<',new Date(Date.parse(options.to+'T00:00:00+08:00')+86400000));
  }
  if(options.scheduledDay){
    if(options.from || options.to)fail('Clear creation dates when viewing the delivery calendar.');
    order='scheduled_start_at';
    query=query.where(order,'>=',new Date(options.scheduledDay+'T00:00:00+08:00')).where(order,'<',new Date(Date.parse(options.scheduledDay+'T00:00:00+08:00')+86400000));
  }
  if (options.search) {
    const search=String(options.search).trim().slice(0,150);
    // Public references are exact lookups; name searches are prefix queries.
    if (/^(R|CUS[T]?|MAIN[T]?|M)-/i.test(search)) query=query.where(config.code,'==',search.toUpperCase());
    else { if (order !== '__name__') fail('Use a reference when combining search with dates.'); order=kind==='customers'?'search_name':config.name; const term=kind==='customers'?search.toLowerCase().replace(/\s+/g,' '):search; query=query.where(order,'>=',term).where(order,'<=',term+'\uf8ff'); }
  }
  const signature=JSON.stringify([kind,options.status||'',options.from||'',options.to||'',options.scheduledDay||'',options.search||'',options.customerId||'',options.itemId||'',order]);
  query=query.orderBy(order,order==='created_at'?'desc':'asc');
  if (options.cursor) {
    let decoded; try { decoded=JSON.parse(Buffer.from(options.cursor,'base64url').toString()); } catch { fail('Invalid list cursor.'); }
    if (decoded.signature!==signature || !validDocumentId(decoded.id)) fail('Refresh the list after changing its filters.');
    const cursor=await db.collection(config.collection).doc(decoded.id).get(); if (!cursor.exists) fail('The cursor record no longer exists. Refresh the list.');
    query=query.startAfter(cursor);
  }
  const snapshot=await query.limit(limit+1).get(), docs=snapshot.docs.slice(0,limit);
  const records=docs.map(docData);
  if(kind==='rentals')records.forEach(row=>Object.assign(row,{item_id:row.item_id??row.itemId,customer_id:row.customer_id??row.customerId,item_name:row.item_name??row.itemName,customer_name:row.customer_name??row.customerName,created_at:row.created_at??row.startDate,due_at:row.due_at??row.dueDate,rental_fee:row.rental_fee??row.rateFee,payment_method:row.payment_method??row.paymentMethod,status:String(row.status||'').toUpperCase()}));
  return serializeLedger({records,nextCursor:snapshot.size>limit ? Buffer.from(JSON.stringify({id:docs.at(-1).id,signature})).toString('base64url') : null,limit});
}

export async function decoratedRecordPage(db,kind,options={}) {
  const page=await recordPage(db,kind,options);
  if(kind==='customers'){
    const profiles=new Map(await Promise.all([...new Set(page.records.map(row=>row.auth_uid).filter(Boolean))].map(async id=>{const doc=await db.collection('users').doc(id).get();return [id,doc.exists?doc.data():null];})));
    page.records=page.records.filter(row=>!isStaffRole(profiles.get(row.auth_uid)?.role));
    return page;
  }
  const items=[...new Set(page.records.map(row=>row.item_id).filter(Boolean))];
  const names=new Map(await Promise.all(items.map(async id=>{const doc=await db.collection('items').doc(id).get();return [id,doc.exists?doc.data():{}];})));
  page.records.forEach(row=>{const item=names.get(row.item_id)||{};row.item_name ||= item.name || 'Equipment history';row.item_code ||= item.item_code || '';});
  return page;
}
