import {randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import {asDate,dateFields,docData,localDateTime} from './firebase.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const idValue=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))fail(400,'Invalid equipment ID.');return value;};
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(400,`${label} is required (maximum ${max} characters).`);return value.trim();};
const conditions=['GOOD','FAIR','DAMAGED','NEEDS_INSPECTION'];
const dateKeys=['created_at','updated_at','effective_from','effective_to','changed_at','started_at','completed_at'];
const serialize=record=>dateFields(record,dateKeys);
const rows=snapshot=>snapshot.docs.map(docData);
const newest=(records,key)=>records.sort((a,b)=>(asDate(b[key])?.getTime()||0)-(asDate(a[key])?.getTime()||0));

export function validateItem(input) {
  if(!input||typeof input!=='object')fail(400,'Equipment details are required.');
  const code=text(input.code,50,'Item code').toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9_-]*$/.test(code))fail(400,'Item code can contain letters, numbers, hyphens, and underscores.');
  const categoryId=idValue(input.categoryId);
  const name=text(input.name,150,'Equipment name');
  if(input.description!==undefined&&(typeof input.description!=='string'||input.description.length>2000))fail(400,'Description must be 2,000 characters or fewer.');
  if(!conditions.includes(input.condition))fail(400,'Choose a valid equipment condition.');
  if(!['DAILY','HOURLY','FLAT'].includes(input.rateType))fail(400,'Choose a valid rental rate type.');
  const amount=(value,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>9999999999.99||Math.abs(value*100-Math.round(value*100))>.0001)fail(400,`${label} must be a nonnegative amount with at most two decimal places.`);return value;};
  return {code,categoryId,name,description:(input.description||'').trim(),condition:input.condition,rateType:input.rateType,rentalRate:amount(input.rentalRate,'Rental rate'),deposit:amount(input.deposit,'Deposit'),latePenalty:amount(input.latePenalty,'Late penalty')};
}
export function assertEditable(item,openRentals,action) {
  if(openRentals>0||['RENTED','RESERVED_PENDING'].includes(item.status))fail(409,`Cannot ${action} equipment with an active or pending rental. Use the rental/return verification workflow.`);
}

const currentRate=(rates,now=new Date())=>newest(rates.filter(rate=>rate.is_active!==false&&asDate(rate.effective_from)<=now&&(!rate.effective_to||asDate(rate.effective_to)>now)),'effective_from')[0];
const openRentals=rentals=>rentals.filter(rental=>['ACTIVE','PENDING_VERIFICATION'].includes(rental.status));
const openMaintenance=records=>records.filter(record=>['OPEN','IN_PROGRESS'].includes(record.status));
const mapItem=(item,category,rates,rentals,maintenance)=>{
  const rate=currentRate(rates)||{};
  const open=openRentals(rentals).length;
  return serialize({...item,id:String(item.id),category_id:String(item.category_id),category:category?.name||'Uncategorized',rate_type:rate.rate_type??null,rental_rate:rate.rental_rate??null,deposit_amount:rate.deposit_amount??null,late_penalty_rate:rate.late_penalty_rate??null,open_rentals:open,open_maintenance:openMaintenance(maintenance).length,effective_status:item.is_active===false?'INACTIVE':item.status==='AVAILABLE'&&open>0?'RESERVED_PENDING':item.status});
};

export async function inventoryList(db) {
  const [itemSnap,categorySnap,rateSnap,rentalSnap,maintenanceSnap]=await Promise.all(['items','item_categories','item_rates','rentals','maintenance_records'].map(name=>db.collection(name).get()));
  const items=rows(itemSnap),categories=rows(categorySnap),rates=rows(rateSnap),rentals=rows(rentalSnap),maintenance=rows(maintenanceSnap);
  const byId=new Map(categories.map(category=>[category.id,category]));
  return {items:items.map(item=>mapItem(item,byId.get(String(item.category_id)),rates.filter(r=>String(r.item_id)===item.id),rentals.filter(r=>String(r.item_id)===item.id),maintenance.filter(r=>String(r.item_id)===item.id))).sort((a,b)=>a.name.localeCompare(b.name)),categories:categories.sort((a,b)=>a.name.localeCompare(b.name))};
}

async function itemParts(db,id) {
  id=idValue(id);
  const itemRef=db.collection('items').doc(id);
  const [itemDoc,rates,rentals,maintenance,history,categories]=await Promise.all([
    itemRef.get(),db.collection('item_rates').where('item_id','==',id).get(),db.collection('rentals').where('item_id','==',id).get(),db.collection('maintenance_records').where('item_id','==',id).get(),db.collection('item_status_history').where('item_id','==',id).get(),db.collection('item_categories').get()
  ]);
  if(!itemDoc.exists)fail(404,'Equipment not found.');
  const item=docData(itemDoc),category=rows(categories).find(c=>c.id===String(item.category_id));
  return {id,item,itemRef,rateRows:rows(rates),rentalRows:rows(rentals),maintenanceRows:rows(maintenance),historyRows:rows(history),category};
}
export async function inventoryDetail(db,id) {
  const part=await itemParts(db,id);
  return {item:mapItem(part.item,part.category,part.rateRows,part.rentalRows,part.maintenanceRows),history:newest(part.historyRows,'changed_at').slice(0,20).map(serialize),maintenance:newest(part.maintenanceRows,'started_at').slice(0,20).map(serialize),rates:newest(part.rateRows,'effective_from').slice(0,10).map(serialize)};
}
export async function inventoryQr(db,id) {
  const {item}=await inventoryDetail(db,id);
  return {svg:await QRCode.toString(item.qr_token,{type:'svg',errorCorrectionLevel:'M',margin:4,width:240}),token:item.qr_token,code:item.item_code,name:item.name};
}

const audit=(db,actor,id,action,before,after,now)=>({ref:db.collection('audit_logs').doc(),data:{user_id:String(actor),actor_type:'USER',action,entity_type:'ITEM',entity_id:id,old_values:before||null,new_values:after,created_at:now}});
const statusRecord=(db,actor,id,oldStatus,newStatus,reference,now)=>oldStatus===newStatus?null:{ref:db.collection('item_status_history').doc(),data:{item_id:id,old_status:oldStatus||null,new_status:newStatus,source:'WEB',reference_type:reference,changed_by:String(actor),changed_at:now}};
const rateRecord=(actor,id,item,now)=>({item_id:id,rate_type:item.rateType,rental_rate:item.rentalRate,deposit_amount:item.deposit,late_penalty_rate:item.latePenalty,created_by:String(actor),is_active:true,effective_from:now,effective_to:null});

export async function createItem(db,actor,input) {
  const item=validateItem(input);
  if(!['GOOD','FAIR'].includes(item.condition))fail(400,'New equipment must be in good or fair condition. Record maintenance after adding damaged equipment.');
  const itemRef=db.collection('items').doc(),codeRef=db.collection('item_codes').doc(item.code),categoryRef=db.collection('item_categories').doc(item.categoryId),rateRef=db.collection('item_rates').doc();
  await db.runTransaction(async tx=>{
    const [codeDoc,categoryDoc]=await Promise.all([tx.get(codeRef),tx.get(categoryRef)]);
    if(codeDoc.exists)fail(409,'That item code already exists. Choose a unique code.');
    if(!categoryDoc.exists)fail(400,'The selected category does not exist.');
    const now=new Date(),id=itemRef.id;
    tx.create(codeRef,{item_id:id,created_at:now});
    tx.create(itemRef,{item_code:item.code,category_id:item.categoryId,name:item.name,description:item.description,qr_token:'RENTPLAY:'+randomUUID(),condition_status:item.condition,status:'AVAILABLE',is_active:true,created_at:now,updated_at:now});
    tx.create(rateRef,rateRecord(actor,id,item,now));
    const history=statusRecord(db,actor,id,null,'AVAILABLE','CREATED',now),log=audit(db,actor,id,'ITEM_CREATED',null,item,now);
    tx.create(history.ref,history.data);tx.create(log.ref,log.data);
  });
  return {id:itemRef.id};
}

export async function updateItem(db,actor,id,input) {
  id=idValue(id);const next=validateItem(input),itemRef=db.collection('items').doc(id);
  await db.runTransaction(async tx=>{
    const itemDoc=await tx.get(itemRef);if(!itemDoc.exists)fail(404,'Equipment not found.');
    const current={id,...itemDoc.data()};
    const categoryRef=db.collection('item_categories').doc(next.categoryId),newCodeRef=db.collection('item_codes').doc(next.code);
    const [categoryDoc,codeDoc,rentalsSnap,ratesSnap]=await Promise.all([tx.get(categoryRef),tx.get(newCodeRef),tx.get(db.collection('rentals').where('item_id','==',id)),tx.get(db.collection('item_rates').where('item_id','==',id))]);
    if(typeof input.version!=='string'||input.version!==localDateTime(current.updated_at))fail(409,'This equipment changed since you opened it. Refresh and try again.');
    if(!categoryDoc.exists)fail(400,'The selected category does not exist.');
    if(codeDoc.exists&&codeDoc.data().item_id!==id)fail(409,'That item code already exists. Choose a unique code.');
    if(current.is_active===false)fail(409,'Restore archived equipment before editing it.');
    const opened=openRentals(rows(rentalsSnap)).length;
    if(next.condition!==current.condition_status)assertEditable(current,opened,'change the condition of');
    if(current.status==='AVAILABLE'&&!['GOOD','FAIR'].includes(next.condition))fail(400,'Start maintenance before marking equipment damaged or needing inspection.');
    const now=new Date(),rate=currentRate(rows(ratesSnap));
    const rateChanged=!rate||rate.rate_type!==next.rateType||Number(rate.rental_rate)!==next.rentalRate||Number(rate.deposit_amount)!==next.deposit||Number(rate.late_penalty_rate)!==next.latePenalty;
    if(current.item_code!==next.code){tx.create(newCodeRef,{item_id:id,created_at:now});tx.delete(db.collection('item_codes').doc(current.item_code));}
    if(rateChanged){for(const old of rows(ratesSnap).filter(r=>r.is_active!==false))tx.update(db.collection('item_rates').doc(old.id),{is_active:false,effective_to:now});tx.create(db.collection('item_rates').doc(),rateRecord(actor,id,next,now));}
    tx.update(itemRef,{item_code:next.code,category_id:next.categoryId,name:next.name,description:next.description,condition_status:next.condition,updated_at:now});
    const log=audit(db,actor,id,'ITEM_UPDATED',current,{...next,rateChanged},now);tx.create(log.ref,log.data);
  });
  return {id};
}

export async function itemAction(db,actor,id,input) {
  id=idValue(id);if(!input||!['maintenance','complete-maintenance','archive','restore'].includes(input.action))fail(400,'Choose a valid inventory action.');
  const itemRef=db.collection('items').doc(id);
  await db.runTransaction(async tx=>{
    const itemDoc=await tx.get(itemRef);if(!itemDoc.exists)fail(404,'Equipment not found.');
    const item={id,...itemDoc.data()};
    const [rentalsSnap,maintenanceSnap]=await Promise.all([tx.get(db.collection('rentals').where('item_id','==',id)),tx.get(db.collection('maintenance_records').where('item_id','==',id))]);
    if(typeof input.version!=='string'||input.version!==localDateTime(item.updated_at))fail(409,'This equipment changed since you opened it. Refresh and try again.');
    const rentalCount=openRentals(rows(rentalsSnap)).length,maintenance=openMaintenance(rows(maintenanceSnap));
    assertEditable(item,rentalCount,input.action==='archive'?'archive':'change the availability of');
    let status=item.status,active=item.is_active!==false,condition=item.condition_status;const now=new Date();
    if(input.action==='maintenance'){
      if(!active||status!=='AVAILABLE'||maintenance.length)fail(409,'Only available equipment without an open maintenance record can enter maintenance.');
      const reason=text(input.reason,255,'Maintenance reason');if(!conditions.includes(input.condition))fail(400,'Choose a valid condition.');
      condition=input.condition;status='UNDER_MAINTENANCE';tx.create(db.collection('maintenance_records').doc(),{item_id:id,status:'IN_PROGRESS',reason,details:null,started_at:now,completed_at:null,created_by:String(actor)});
    }
    if(input.action==='complete-maintenance'){
      if(!active||status!=='UNDER_MAINTENANCE')fail(409,'This equipment is not under maintenance.');
      if(!['GOOD','FAIR'].includes(input.condition))fail(400,'Equipment must be in good or fair condition before becoming available.');
      const notes=text(input.reason,2000,'Inspection notes');condition=input.condition;status='AVAILABLE';
      for(const record of maintenance){tx.update(db.collection('maintenance_records').doc(record.id),{status:'COMPLETED',completed_at:now,details:notes});}
      if(!maintenance.length)tx.create(db.collection('maintenance_records').doc(),{item_id:id,status:'COMPLETED',reason:'Equipment inspection',details:notes,started_at:now,completed_at:now,created_by:String(actor)});
    }
    if(input.action==='archive'){if(!active)fail(409,'Equipment is already archived.');if(status==='UNDER_MAINTENANCE'||maintenance.length)fail(409,'Complete maintenance before archiving equipment.');active=false;status='INACTIVE';}
    if(input.action==='restore'){if(active)fail(409,'Equipment is already active.');if(maintenance.length||!['GOOD','FAIR'].includes(condition))fail(409,'Equipment needs inspection before it can be restored.');active=true;status='AVAILABLE';}
    tx.update(itemRef,{status,is_active:active,condition_status:condition,updated_at:now});
    const history=statusRecord(db,actor,id,item.status,status,input.action.toUpperCase(),now),log=audit(db,actor,id,'ITEM_'+input.action.replaceAll('-','_').toUpperCase(),item,{status,is_active:active,condition_status:condition,reason:input.reason||null},now);
    if(history)tx.create(history.ref,history.data);tx.create(log.ref,log.data);
  });
  return {id};
}
