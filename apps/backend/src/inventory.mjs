import {createHash,randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import {asDate,dateFields,docData,localDateTime} from './firebase.mjs';
import {DEFAULT_PRICING} from './pricing.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const idValue=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))fail(400,'Invalid equipment ID.');return value;};
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(400,`${label} is required (maximum ${max} characters).`);return value.trim();};
const conditions=['GOOD','FAIR','DAMAGED','NEEDS_INSPECTION'];
const dateKeys=['created_at','updated_at','effective_from','effective_to','changed_at','started_at','completed_at'];
const serialize=record=>dateFields(record,dateKeys);
const rows=snapshot=>snapshot.docs.map(docData);
async function itemRentalDocs(db,id,tx=null) {
  const snapshots=await Promise.all(['item_id','itemId'].map(field=>{const query=db.collection('rentals').where(field,'==',id);return tx?tx.get(query):query.get();}));
  return {docs:[...new Map(snapshots.flatMap(snapshot=>snapshot.docs).map(doc=>[doc.id,doc])).values()]};
}
const newest=(records,key)=>records.sort((a,b)=>(asDate(b[key])?.getTime()||0)-(asDate(a[key])?.getTime()||0));
function validateImageData(value) {
  if(value===undefined)return undefined;
  if(value===null||value==='')return null;
  if(typeof value!=='string'||value.length>250000)fail(400,'Equipment image is too large. Choose a smaller JPG, PNG, or WebP photo.');
  const match=value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)fail(400,'Choose a valid JPG, PNG, or WebP image.');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.toString('base64')!==match[2])fail(400,'Choose a valid JPG, PNG, or WebP image.');
  const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid)fail(400,'The selected image does not match its file type. Choose a JPG, PNG, or WebP photo.');
  return value;
}

export function validateItem(input,{codeRequired=true}={}) {
  if(!input||typeof input!=='object')fail(400,'Equipment details are required.');
  const code=codeRequired?text(input.code,50,'Item code').toUpperCase():null;
  if(codeRequired&&!/^[A-Z0-9][A-Z0-9_-]*$/.test(code))fail(400,'Item code can contain letters, numbers, hyphens, and underscores.');
  const categoryId=idValue(input.categoryId);
  const name=text(input.name,150,'Equipment name');
  if(input.description!==undefined&&(typeof input.description!=='string'||input.description.length>2000))fail(400,'Description must be 2,000 characters or fewer.');
  if(!conditions.includes(input.condition))fail(400,'Choose a valid equipment condition.');
  if(!['DAILY','HOURLY','FLAT'].includes(input.rateType))fail(400,'Choose a valid rental rate type.');
  const amount=(value,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>9999999999.99||Math.abs(value*100-Math.round(value*100))>.0001)fail(400,`${label} must be a nonnegative amount with at most two decimal places.`);return value;};
  const pricingProductId=input.pricingProductId==null||input.pricingProductId===''?null:String(input.pricingProductId);
  if(pricingProductId&&!/^[a-z0-9-]{1,80}$/.test(pricingProductId))fail(400,'Choose a valid client rate sheet product.');
  if(pricingProductId&&!DEFAULT_PRICING.products.some(product=>product.id===pricingProductId))fail(400,'Choose a product from the client rate sheet.');
  return {code,categoryId,name,description:(input.description||'').trim(),condition:input.condition,rateType:input.rateType,rentalRate:amount(input.rentalRate,'Rental rate'),deposit:amount(input.deposit,'Deposit'),latePenalty:amount(input.latePenalty,'Late penalty'),pricingProductId,imageData:validateImageData(input.imageData)};
}
export function equipmentItemCode(sequence) {
  if(!Number.isSafeInteger(sequence)||sequence<1)fail(400,'Equipment code sequence must be a positive whole number.');
  return `RENT-${String(sequence).padStart(3,'0')}`;
}
export function assertEditable(item,openRentals,action) {
  if(openRentals>0||item.reserved_rental_id||['RENTED','RESERVED_PENDING'].includes(String(item.status).toUpperCase()))fail(409,`Cannot ${action} equipment with an active or pending rental. Use the rental/return verification workflow.`);
}

const currentRate=(rates,now=new Date())=>newest(rates.filter(rate=>rate.is_active!==false&&asDate(rate.effective_from)<=now&&(!rate.effective_to||asDate(rate.effective_to)>now)),'effective_from')[0];
const openRentals=rentals=>rentals.filter(rental=>['ACTIVE','APPROVED','RETURN_PENDING_INSPECTION','PENDING_VERIFICATION','PENDING_ADMIN_APPROVAL','PENDING_ESP32_RENT'].includes(String(rental.status||'').toUpperCase()));
const openMaintenance=records=>records.filter(record=>['OPEN','IN_PROGRESS'].includes(record.status));
const mapItem=(item,category,rates,rentals,maintenance)=>{
  const rate=currentRate(rates)||{};
  const open=openRentals(rentals).length;
  const status=String(item.status||'UNAVAILABLE').toUpperCase();
  return serialize({...item,id:String(item.id),status,category_id:String(item.category_id),category:category?.name||item.category||'Uncategorized',rate_type:rate.rate_type??null,rental_rate:rate.rental_rate??null,deposit_amount:rate.deposit_amount??null,late_penalty_rate:rate.late_penalty_rate??null,pricing_product_id:item.pricing_product_id||null,open_rentals:open,open_maintenance:openMaintenance(maintenance).length,effective_status:item.is_active===false?'INACTIVE':status==='AVAILABLE'&&(open>0||item.reserved_rental_id)?'RESERVED_PENDING':status});
};

export async function inventoryList(db) {
  const [itemSnap,categorySnap,rateSnap,rentalSnap,maintenanceSnap]=await Promise.all(['items','item_categories','item_rates','rentals','maintenance_records'].map(name=>db.collection(name).get()));
  const items=rows(itemSnap),categories=rows(categorySnap),rates=rows(rateSnap),rentals=rows(rentalSnap),maintenance=rows(maintenanceSnap);
  const byId=new Map(categories.map(category=>[category.id,category]));
  return {items:items.map(item=>mapItem(item,byId.get(String(item.category_id)),rates.filter(r=>String(r.item_id)===item.id),rentals.filter(r=>String(r.item_id??r.itemId)===item.id),maintenance.filter(r=>String(r.item_id)===item.id))).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))),categories:categories.sort((a,b)=>a.name.localeCompare(b.name))};
}

const categoryKey=name=>String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
export async function createItemCategory(db,actor,input) {
  if(!input||typeof input!=='object'||typeof input.name!=='string')fail(400,'Category name is required.');
  const name=input.name.trim().normalize('NFKC').replace(/\s+/g,' ');
  if(!name||name.length>60)fail(400,'Category name is required (maximum 60 characters).');
  if(!/^[\p{L}\p{N}](?:[\p{L}\p{N} &'’()./-]*[\p{L}\p{N}])?$/u.test(name))fail(400,'Use letters, numbers, spaces, or simple punctuation for the category name.');
  const normalized=categoryKey(name),existing=await db.collection('item_categories').get();
  if(existing.docs.some(doc=>categoryKey(doc.data().name||'')===normalized))fail(409,'A category with this name already exists.');
  const id='category_'+createHash('sha256').update(normalized).digest('hex').slice(0,32);
  const categoryRef=db.collection('item_categories').doc(id),auditRef=db.collection('audit_logs').doc();
  await db.runTransaction(async tx=>{
    const current=await tx.get(categoryRef);
    if(current.exists)fail(409,'A category with this name already exists.');
    const now=new Date();
    tx.create(categoryRef,{name,created_at:now,created_by:String(actor)});
    tx.create(auditRef,{user_id:String(actor),actor_type:'USER',action:'ITEM_CATEGORY_CREATED',entity_type:'ITEM_CATEGORY',entity_id:id,old_values:null,new_values:{name},created_at:now});
  });
  return {id,name};
}

export async function deleteItemCategory(db,actor,id) {
  id=idValue(id);
  const categoryRef=db.collection('item_categories').doc(id),auditRef=db.collection('audit_logs').doc();
  await db.runTransaction(async tx=>{
    const [categoryDoc,itemSnapshot,categorySnapshot]=await Promise.all([
      tx.get(categoryRef),
      tx.get(db.collection('items').where('category_id','==',id)),
      tx.get(db.collection('item_categories'))
    ]);
    if(!categoryDoc.exists)fail(404,'Category not found. Refresh and try again.');
    if(categorySnapshot.size<=1)fail(409,'Keep at least one equipment category. Add another category before removing this one.');
    if(!itemSnapshot.empty)fail(409,`Cannot remove this category while ${itemSnapshot.size} equipment item${itemSnapshot.size===1?'':'s'} use it. Move them to another category first.`);
    const category=categoryDoc.data(),now=new Date();
    tx.delete(categoryRef);
    tx.create(auditRef,{user_id:String(actor),actor_type:'USER',action:'ITEM_CATEGORY_DELETED',entity_type:'ITEM_CATEGORY',entity_id:id,old_values:{name:category.name},new_values:{deleted:true},created_at:now});
  });
  return {id,deleted:true};
}

async function itemParts(db,id) {
  id=idValue(id);
  const itemRef=db.collection('items').doc(id);
  const [itemDoc,rates,rentals,maintenance,history,categories]=await Promise.all([
    itemRef.get(),db.collection('item_rates').where('item_id','==',id).get(),itemRentalDocs(db,id),db.collection('maintenance_records').where('item_id','==',id).get(),db.collection('item_status_history').where('item_id','==',id).get(),db.collection('item_categories').get()
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
  const token=await ensureQrToken(db,item);
  const qr=QRCode.create(token,{errorCorrectionLevel:'M'});
  return {svg:await QRCode.toString(token,{type:'svg',errorCorrectionLevel:'M',margin:4,width:240}),matrix:{size:qr.modules.size,data:Array.from(qr.modules.data),margin:4},token,code:item.item_code,name:item.name};
}

async function ensureQrToken(db,item) {
  if(typeof item.qr_token==='string'&&item.qr_token)return item.qr_token;
  const itemRef=db.collection('items').doc(item.id);let token;
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(itemRef);if(!snapshot.exists)fail(404,'Equipment not found.');
    token=snapshot.data().qr_token;
    if(typeof token!=='string'||!token){token='RENTPLAY:'+randomUUID();tx.update(itemRef,{qr_token:token});}
  });
  return token;
}

export async function inventoryQrLabels(db) {
  const items=rows(await db.collection('items').get());
  return {items:await Promise.all(items.map(async item=>{
    const token=await ensureQrToken(db,item);
    return {id:item.id,svg:await QRCode.toString(token,{type:'svg',errorCorrectionLevel:'M',margin:4,width:240}),code:item.item_code,name:item.name};
  }))};
}

const audit=(db,actor,id,action,before,after,now)=>({ref:db.collection('audit_logs').doc(),data:{user_id:String(actor),actor_type:'USER',action,entity_type:'ITEM',entity_id:id,old_values:before||null,new_values:after,created_at:now}});
const statusRecord=(db,actor,id,oldStatus,newStatus,reference,now)=>oldStatus===newStatus?null:{ref:db.collection('item_status_history').doc(),data:{item_id:id,old_status:oldStatus||null,new_status:newStatus,source:'WEB',reference_type:reference,changed_by:String(actor),changed_at:now}};
const rateRecord=(actor,id,item,now)=>({item_id:id,rate_type:item.rateType,rental_rate:item.rentalRate,deposit_amount:item.deposit,late_penalty_rate:item.latePenalty,created_by:String(actor),is_active:true,effective_from:now,effective_to:null});

export async function createItem(db,actor,input) {
  const item=validateItem(input,{codeRequired:false});
  if(!['GOOD','FAIR'].includes(item.condition))fail(400,'New equipment must be in good or fair condition. Record maintenance after adding damaged equipment.');
  const itemRef=db.collection('items').doc(),categoryRef=db.collection('item_categories').doc(item.categoryId),rateRef=db.collection('item_rates').doc(),counterRef=db.collection('counters').doc('item_codes_RENT');
  let generatedCode='';
  await db.runTransaction(async tx=>{
    const [categoryDoc,counterDoc]=await Promise.all([tx.get(categoryRef),tx.get(counterRef)]);
    if(!categoryDoc.exists)fail(400,'The selected category does not exist.');
    const storedSequence=Number(counterDoc.data()?.next_sequence||1),start=Number.isSafeInteger(storedSequence)?Math.max(1,storedSequence):1;
    const candidates=Array.from({length:25},(_,index)=>({sequence:start+index,code:equipmentItemCode(start+index)}));
    const codeRefs=candidates.map(candidate=>db.collection('item_codes').doc(candidate.code)),codeDocs=await Promise.all(codeRefs.map(ref=>tx.get(ref))),available=codeDocs.findIndex(doc=>!doc.exists);
    if(available<0)fail(409,'Could not allocate an equipment code. Try again.');
    const chosen=candidates[available],codeRef=codeRefs[available];generatedCode=chosen.code;
    const now=new Date(),id=itemRef.id;
    tx.create(codeRef,{item_id:id,created_at:now});
    tx.set(counterRef,{next_sequence:chosen.sequence+1,updated_at:now},{merge:true});
    tx.create(itemRef,{item_code:generatedCode,qrCode:generatedCode,category_id:item.categoryId,name:item.name,description:item.description,pricing_product_id:item.pricingProductId,...(item.imageData?{image_data:item.imageData}:{}),qr_token:'RENTPLAY:'+randomUUID(),condition_status:item.condition,status:'AVAILABLE',is_active:true,created_at:now,updated_at:now});
    tx.create(rateRef,rateRecord(actor,id,item,now));
    const {imageData,...auditItem}=item,history=statusRecord(db,actor,id,null,'AVAILABLE','CREATED',now),log=audit(db,actor,id,'ITEM_CREATED',null,{...auditItem,code:generatedCode,imageAdded:!!imageData},now);
    tx.create(history.ref,history.data);tx.create(log.ref,log.data);
  });
  return {id:itemRef.id,code:generatedCode};
}

export async function updateItem(db,actor,id,input) {
  id=idValue(id);const next=validateItem(input,{codeRequired:false}),itemRef=db.collection('items').doc(id);
  await db.runTransaction(async tx=>{
    const itemDoc=await tx.get(itemRef);if(!itemDoc.exists)fail(404,'Equipment not found.');
    const current={id,...itemDoc.data()};
    const categoryRef=db.collection('item_categories').doc(next.categoryId);
    const [categoryDoc,rentalsSnap,ratesSnap]=await Promise.all([tx.get(categoryRef),itemRentalDocs(db,id,tx),tx.get(db.collection('item_rates').where('item_id','==',id))]);
    if(typeof input.version!=='string'||input.version!==localDateTime(current.updated_at))fail(409,'This equipment changed since you opened it. Refresh and try again.');
    if(!categoryDoc.exists)fail(400,'The selected category does not exist.');
    if(current.is_active===false)fail(409,'Restore archived equipment before editing it.');
    const opened=openRentals(rows(rentalsSnap)).length;
    if(opened>0&&next.pricingProductId!==(current.pricing_product_id||null))fail(409,'Wait until the open rental is returned before changing its rate sheet product.');
    if(next.condition!==current.condition_status)assertEditable(current,opened,'change the condition of');
    if(String(current.status).toUpperCase()==='AVAILABLE'&&!['GOOD','FAIR'].includes(next.condition))fail(400,'Start maintenance before marking equipment damaged or needing inspection.');
    const now=new Date(),rate=currentRate(rows(ratesSnap));
    const rateChanged=!rate||rate.rate_type!==next.rateType||Number(rate.rental_rate)!==next.rentalRate||Number(rate.deposit_amount)!==next.deposit||Number(rate.late_penalty_rate)!==next.latePenalty;
    if(rateChanged){for(const old of rows(ratesSnap).filter(r=>r.is_active!==false))tx.update(db.collection('item_rates').doc(old.id),{is_active:false,effective_to:now});tx.create(db.collection('item_rates').doc(),rateRecord(actor,id,next,now));}
    const changes={category_id:next.categoryId,name:next.name,description:next.description,pricing_product_id:next.pricingProductId,condition_status:next.condition,updated_at:now};
    if(next.imageData!==undefined)changes.image_data=next.imageData;
    tx.update(itemRef,changes);
    const {image_data:currentImage,...auditCurrent}=current,{imageData,...auditNext}=next,imageChanged=imageData!==undefined&&(imageData||null)!==(currentImage||null);
    const log=audit(db,actor,id,'ITEM_UPDATED',auditCurrent,{...auditNext,code:current.item_code,rateChanged,imageChanged},now);tx.create(log.ref,log.data);
  });
  return {id};
}

export async function itemAction(db,actor,id,input) {
  id=idValue(id);if(!input||!['maintenance','complete-maintenance','archive','restore'].includes(input.action))fail(400,'Choose a valid inventory action.');
  const itemRef=db.collection('items').doc(id);
  await db.runTransaction(async tx=>{
    const itemDoc=await tx.get(itemRef);if(!itemDoc.exists)fail(404,'Equipment not found.');
    const item={id,...itemDoc.data()};
    const [rentalsSnap,maintenanceSnap]=await Promise.all([itemRentalDocs(db,id,tx),tx.get(db.collection('maintenance_records').where('item_id','==',id))]);
    if(typeof input.version!=='string'||input.version!==localDateTime(item.updated_at))fail(409,'This equipment changed since you opened it. Refresh and try again.');
    const rentalCount=openRentals(rows(rentalsSnap)).length,maintenance=openMaintenance(rows(maintenanceSnap));
    assertEditable(item,rentalCount,input.action==='archive'?'archive':'change the availability of');
    let status=String(item.status).toUpperCase(),active=item.is_active!==false,condition=item.condition_status;const now=new Date();
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
    const {image_data,...auditItem}=item,history=statusRecord(db,actor,id,item.status,status,input.action.toUpperCase(),now),log=audit(db,actor,id,'ITEM_'+input.action.replaceAll('-','_').toUpperCase(),auditItem,{status,is_active:active,condition_status:condition,reason:input.reason||null},now);
    if(history)tx.create(history.ref,history.data);tx.create(log.ref,log.data);
  });
  return {id};
}

export async function deleteArchivedItem(db,actor,id,input) {
  id=idValue(id);
  if(!input||typeof input.version!=='string'||!input.version)fail(400,'Refresh the equipment details before deleting this item.');
  const itemRef=db.collection('items').doc(id);
  await db.runTransaction(async tx=>{
    const itemDoc=await tx.get(itemRef);
    if(!itemDoc.exists)fail(404,'Equipment not found.');
    const item={id,...itemDoc.data()};
    const [rentalsSnap,maintenanceSnap]=await Promise.all([itemRentalDocs(db,id,tx),tx.get(db.collection('maintenance_records').where('item_id','==',id))]);
    if(input.version!==localDateTime(item.updated_at))fail(409,'This equipment changed since you opened it. Refresh and try again.');
    if(item.is_active!==false)fail(409,'Archive this equipment before permanently deleting it.');
    if(openRentals(rows(rentalsSnap)).length)fail(409,'Equipment with an active or pending rental cannot be deleted.');
    if(openMaintenance(rows(maintenanceSnap)).length)fail(409,'Complete maintenance before deleting this equipment.');
    const auditRef=db.collection('audit_logs').doc(),now=new Date();
    tx.delete(itemRef);
    const {image_data,...auditItem}=item;
    tx.create(auditRef,{user_id:String(actor),actor_type:'USER',action:'ITEM_DELETED',entity_type:'ITEM',entity_id:id,old_values:auditItem,new_values:{deleted:true,item_code:item.item_code,name:item.name},created_at:now});
  });
  return {id,deleted:true};
}
