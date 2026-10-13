import {createHash} from 'node:crypto';
import QRCode from 'qrcode';
import {asDate,dateFields,docData,localDateTime} from './firebase.mjs';
import {DEFAULT_PRICING} from './pricing.mjs';
import {createMaintenance} from './maintenance.mjs';
import {isOpenMaintenance,healthyUnit} from './maintenance-state.mjs';

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
  const quantity=input.quantity===undefined?1:Number(input.quantity);
  if(!Number.isInteger(quantity)||quantity<1||quantity>50)fail(400,'Equipment quantity must be a whole number from 1 to 50.');
  if(input.description!==undefined&&(typeof input.description!=='string'||input.description.length>2000))fail(400,'Description must be 2,000 characters or fewer.');
  if(!conditions.includes(input.condition))fail(400,'Choose a valid equipment condition.');
  const amount=(value,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>9999999999.99||Math.abs(value*100-Math.round(value*100))>.0001)fail(400,`${label} must be a nonnegative amount with at most two decimal places.`);return value;};
  let customRateOptions=[];
  if(input.customRateOptions!==undefined&&input.customRateOptions!==null){
    if(!Array.isArray(input.customRateOptions)||input.customRateOptions.length>8)fail(400,'Add no more than eight custom rental rates.');
    if(input.customRateOptions.length){
    const ids=new Set(),labels=new Set();
    customRateOptions=input.customRateOptions.map((row,index)=>{
      if(!row||typeof row!=='object'||Array.isArray(row))fail(400,'Each custom rental rate must include a label, duration, type, and price.');
      const label=text(row.label,80,'Rate label'),normalizedLabel=label.toLocaleLowerCase('en-US');
      if(labels.has(normalizedLabel))fail(400,'Rate labels must be unique.');labels.add(normalizedLabel);
      const id=typeof row.id==='string'&&/^[a-z0-9-]{1,80}$/.test(row.id)?row.id:`rate-${index+1}`;
      if(ids.has(id))fail(400,'Rate option IDs must be unique.');ids.add(id);
      if(!['SHORT','HOURLY','BLOCK','PACKAGE'].includes(row.kind))fail(400,'Choose a valid custom rate method.');
      if(row.kind==='HOURLY')fail(400,'Set the regular hourly rate in Traditional rate basis instead of adding another hourly option.');
      const durationMinutes=Number(row.duration_minutes??row.durationMinutes);
      if(!Number.isInteger(durationMinutes)||durationMinutes<1||durationMinutes>10080)fail(400,'Each custom rate duration must be between 1 minute and 7 days.');
      return {id,label,kind:row.kind,duration_minutes:durationMinutes,amount:amount(row.amount,'Custom rental rate')};
    });
    }
  }
  const rateType=['DAILY','HOURLY','FLAT'].includes(input.rateType)?input.rateType:null;
  if(!rateType)fail(400,'Choose a valid rental rate type.');
  const rentalRate=amount(input.rentalRate,'Rental rate');
  if(customRateOptions.some(row=>row.kind==='PACKAGE')&&rateType!=='HOURLY')fail(400,'Special/package choices need an hourly traditional rate.');
  const pricingProductId=input.pricingProductId==null||input.pricingProductId===''?null:String(input.pricingProductId);
  if(pricingProductId&&!/^[a-z0-9-]{1,80}$/.test(pricingProductId))fail(400,'Choose a valid client rate sheet product.');
  if(pricingProductId&&!DEFAULT_PRICING.products.some(product=>product.id===pricingProductId))fail(400,'Choose a product from the client rate sheet.');
  if(pricingProductId&&customRateOptions.length)fail(400,'Choose either customer rate options or a shared pricing product.');
  return {code,categoryId,name,description:(input.description||'').trim(),condition:input.condition,quantity,rateType,rentalRate,latePenalty:amount(input.latePenalty,'Late penalty'),pricingProductId,customRateOptions,imageData:validateImageData(input.imageData)};
}
export function equipmentItemCode(sequence) {
  if(!Number.isSafeInteger(sequence)||sequence<1)fail(400,'Equipment code sequence must be a positive whole number.');
  return `EQUIP-${String(sequence).padStart(3,'0')}`;
}
export function assertEditable(item,openRentals,action) {
  if(openRentals>0||item.reserved_rental_id||['RENTED','RESERVED_PENDING','UNDER_INSPECTION'].includes(String(item.status).toUpperCase()))fail(409,`Cannot ${action} equipment with an active or pending rental. Use the rental/return verification workflow.`);
}

const currentRate=(rates,now=new Date())=>newest(rates.filter(rate=>rate.is_active!==false&&asDate(rate.effective_from)<=now&&(!rate.effective_to||asDate(rate.effective_to)>now)),'effective_from')[0];
const openRentals=rentals=>rentals.filter(rental=>['ACTIVE','APPROVED','RETURN_PENDING_INSPECTION','PENDING_VERIFICATION','PENDING_ADMIN_APPROVAL','PENDING_ESP32_RENT'].includes(String(rental.status||'').toUpperCase()));
const openMaintenance=records=>records.filter(isOpenMaintenance);
const stockVersion=units=>createHash('sha256').update(JSON.stringify(units.map(unit=>[String(unit.id),localDateTime(unit.updated_at),String(unit.status||'UNAVAILABLE').toUpperCase(),unit.is_active!==false,unit.condition_status||null,unit.name||'',String(unit.category_id),unit.reserved_rental_id||null,unit.current_rental_id||null]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
const mapItem=(item,category,rates,rentals,maintenance)=>{
  const rate=currentRate(rates)||{};
  const open=openRentals(rentals).length;
  const status=String(item.status||'UNAVAILABLE').toUpperCase();
  const maintenanceCount=openMaintenance(maintenance).length;
  const effectiveStatus=item.is_active===false?(status==='RETIRED'?'RETIRED':'INACTIVE'):status==='AVAILABLE'&&(open>0||item.reserved_rental_id)?'RESERVED_PENDING':status==='AVAILABLE'&&(maintenanceCount||!healthyUnit(item))?'UNDER_MAINTENANCE':status;
  return serialize({...item,id:String(item.id),stock_group_id:String(item.stock_group_id||item.id),status,category_id:String(item.category_id),category:category?.name||item.category||'Uncategorized',rate_type:rate.rate_type??null,rental_rate:rate.rental_rate??null,late_penalty_rate:rate.late_penalty_rate??null,pricing_product_id:item.pricing_product_id||null,open_rentals:open,open_maintenance:maintenanceCount,effective_status:effectiveStatus});
};

export async function inventoryList(db) {
  // Availability needs open reservations, not every completed rental or repair.
  // Include the lowercase statuses written by the earlier mobile app.
  const statuses=['ACTIVE','APPROVED','RETURN_PENDING_INSPECTION','PENDING_VERIFICATION','PENDING_ADMIN_APPROVAL','PENDING_ESP32_RENT'];
  const [itemSnap,categorySnap,rateSnap,rentalSnap,maintenanceSnap]=await Promise.all([
    ...['items','item_categories','item_rates'].map(name=>db.collection(name).get()),
    db.collection('rentals').where('status','in',[...statuses,...statuses.map(status=>status.toLowerCase())]).get(),
    db.collection('maintenance_records').where('status','in',['OPEN','IN_PROGRESS','open','in_progress']).get()
  ]);
  const items=rows(itemSnap),categories=rows(categorySnap),rates=rows(rateSnap),rentals=rows(rentalSnap),maintenance=rows(maintenanceSnap);
  const byId=new Map(categories.map(category=>[category.id,category]));
  const mapped=items.map(item=>mapItem(item,byId.get(String(item.category_id)),rates.filter(r=>String(r.item_id)===item.id),rentals.filter(r=>String(r.item_id??r.itemId)===item.id),maintenance.filter(r=>String(r.item_id)===item.id)));
  const groups=new Map();
  for(const item of mapped){const key=item.stock_group_id||item.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  for(const units of groups.values()){
    const active=units.filter(unit=>unit.is_active!==false),counts={available:0,reserved:0,rented:0,maintenance:0};
    for(const unit of active){const state=String(unit.effective_status||unit.status).toUpperCase();if(state==='AVAILABLE')counts.available++;else if(state==='RESERVED_PENDING')counts.reserved++;else if(['RENTED','UNDER_INSPECTION'].includes(state))counts.rented++;else if(state==='UNDER_MAINTENANCE')counts.maintenance++;}
    const version=stockVersion(units);
    for(const unit of units)Object.assign(unit,{available_quantity:counts.available,total_quantity:active.length,reserved_quantity:counts.reserved,rented_quantity:counts.rented,maintenance_quantity:counts.maintenance,stock_version:version});
  }
  return {items:mapped.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))),categories:categories.sort((a,b)=>a.name.localeCompare(b.name))};
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
  const {items}=await inventoryList(db),listed=items.find(item=>item.id===String(id));
  return {item:listed||mapItem(part.item,part.category,part.rateRows,part.rentalRows,part.maintenanceRows),units:items.filter(item=>item.stock_group_id===(listed?.stock_group_id||String(id))),history:newest(part.historyRows,'changed_at').slice(0,20).map(serialize),maintenance:newest(part.maintenanceRows,'started_at').slice(0,20).map(serialize),rates:newest(part.rateRows,'effective_from').slice(0,10).map(serialize)};
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
    if(typeof token!=='string'||!token){token=snapshot.data().item_code||snapshot.data().qrCode;if(typeof token!=='string'||!token)fail(409,'Equipment needs an item code before its QR label can be created.');tx.update(itemRef,{qr_token:token});}
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
const rateRecord=(actor,id,item,now)=>({item_id:id,rate_type:item.rateType,rental_rate:item.rentalRate,late_penalty_rate:item.latePenalty,custom_rate_options:item.customRateOptions||[],custom_rate_options_version:2,created_by:String(actor),is_active:true,effective_from:now,effective_to:null});

export async function createItem(db,actor,input) {
  const item=validateItem(input,{codeRequired:false});
  if(!['GOOD','FAIR'].includes(item.condition))fail(400,'New equipment must be in good or fair condition. Record maintenance after adding damaged equipment.');
  const itemRefs=Array.from({length:item.quantity},()=>db.collection('items').doc()),rateRefs=itemRefs.map(()=>db.collection('item_rates').doc());
  const stockGroupId=itemRefs[0].id,categoryRef=db.collection('item_categories').doc(item.categoryId),counterRef=db.collection('counters').doc('item_codes_EQUIP');
  const generatedCodes=[];
  await db.runTransaction(async tx=>{
    const [categoryDoc,counterDoc]=await Promise.all([tx.get(categoryRef),tx.get(counterRef)]);
    if(!categoryDoc.exists)fail(400,'The selected category does not exist.');
    const storedSequence=Number(counterDoc.data()?.next_sequence||1),start=Number.isSafeInteger(storedSequence)?Math.max(1,storedSequence):1;
    const candidates=Array.from({length:item.quantity+25},(_,index)=>({sequence:start+index,code:equipmentItemCode(start+index)}));
    const codeRefs=candidates.map(candidate=>db.collection('item_codes').doc(candidate.code)),codeDocs=await Promise.all(codeRefs.map(ref=>tx.get(ref)));
    const available=candidates.map((candidate,index)=>!codeDocs[index].exists?candidate:null).filter(Boolean).slice(0,item.quantity);
    if(available.length<item.quantity)fail(409,'Could not allocate unique equipment codes for the requested quantity. Try again.');
    const now=new Date();generatedCodes.splice(0,generatedCodes.length,...available.map(candidate=>candidate.code));
    available.forEach((chosen,index)=>{
      const id=itemRefs[index].id,generatedCode=chosen.code;
      tx.create(codeRefs[candidates.indexOf(chosen)],{item_id:id,stock_group_id:stockGroupId,created_at:now});
      tx.create(itemRefs[index],{stock_group_id:stockGroupId,item_code:generatedCode,qrCode:generatedCode,category_id:item.categoryId,name:item.name,description:item.description,pricing_product_id:item.pricingProductId,custom_rate_options_version:2,...(item.customRateOptions?.length?{custom_rate_options:item.customRateOptions}:{}),...(item.imageData?{image_data:item.imageData}:{}),qr_token:generatedCode,condition_status:item.condition,status:'AVAILABLE',is_active:true,created_at:now,updated_at:now});
      tx.create(rateRefs[index],rateRecord(actor,id,item,now));
      const {imageData,quantity,...auditItem}=item,history=statusRecord(db,actor,id,null,'AVAILABLE','CREATED',now),log=audit(db,actor,id,'ITEM_CREATED',null,{...auditItem,stock_group_id:stockGroupId,code:generatedCode,imageAdded:!!imageData},now);
      tx.create(history.ref,history.data);tx.create(log.ref,log.data);
    });
    tx.set(counterRef,{next_sequence:available.at(-1).sequence+1,updated_at:now},{merge:true});
  });
  return {id:itemRefs[0].id,code:generatedCodes[0],stock_group_id:stockGroupId,quantity:item.quantity,ids:itemRefs.map(ref=>ref.id),codes:generatedCodes};
}

export async function setItemQuantity(db,actor,id,input) {
  return saveStockGroup(db,actor,id,input);
}

// Common equipment details and its physical stock are committed together. Unit
// codes, condition, rental links, and history stay attached to the same group.
async function saveStockGroup(db,actor,id,input,next=null) {
  id=idValue(id);
  const quantity=typeof input?.quantity==='number'||typeof input?.quantity==='string'&&input.quantity.trim()?Number(input.quantity):NaN;
  if(!Number.isInteger(quantity)||quantity<0||quantity>50)fail(400,'Equipment stock must be a whole number from 0 to 50.');
  const itemRef=db.collection('items').doc(id),counterRef=db.collection('counters').doc('item_codes_EQUIP');
  const additions=Array.from({length:50},()=>db.collection('items').doc());
  let result;
  await db.runTransaction(async tx=>{
    let itemDoc=await tx.get(itemRef),stockGroupId=itemDoc.exists?String(itemDoc.data().stock_group_id||id):id;
    let groupSnapshot;
    if(itemDoc.exists){groupSnapshot=await tx.get(db.collection('items').where('stock_group_id','==',stockGroupId));}
    else{
      groupSnapshot=await tx.get(db.collection('items').where('stock_group_id','==',stockGroupId));
      itemDoc=groupSnapshot.docs[0]||null;
      if(!itemDoc)fail(404,'Equipment not found.');
    }
    const baseDoc=itemDoc.id===stockGroupId?itemDoc:await tx.get(db.collection('items').doc(stockGroupId));
    const counterDoc=await tx.get(counterRef);
    const unitDocs=[...groupSnapshot.docs];
    if(baseDoc.exists&&String(baseDoc.data().stock_group_id||baseDoc.id)===stockGroupId&&!unitDocs.some(doc=>doc.id===baseDoc.id))unitDocs.push(baseDoc);
    if(!unitDocs.some(doc=>doc.id===itemDoc.id))unitDocs.push(itemDoc);
    const selected={id:itemDoc.id,...itemDoc.data()},units=unitDocs.map(doc=>({doc,item:{id:doc.id,...doc.data()}}));
    const active=units.filter(({item})=>item.is_active!==false),currentQuantity=active.length;
    if(input?.version!==undefined&&input.version!==localDateTime(selected.updated_at))fail(409,'This equipment changed since you opened it. Refresh and try again.');
    if((next||input?.stockVersion!==undefined)&&input?.stockVersion!==stockVersion(units.map(entry=>entry.item)))fail(409,'This equipment stock changed since you opened it. Refresh and try again.');
    const now=new Date();
    let details=[];
    if(next){
      const categoryDoc=await tx.get(db.collection('item_categories').doc(next.categoryId));
      if(!categoryDoc.exists)fail(400,'The selected category does not exist.');
      details=await Promise.all((active.length?active:[units.find(entry=>entry.item.id===selected.id)]).map(async entry=>{
        const [rentalSnap,ratesSnap,maintenanceSnap]=await Promise.all([itemRentalDocs(db,entry.item.id,tx),tx.get(db.collection('item_rates').where('item_id','==',entry.item.id)),tx.get(db.collection('maintenance_records').where('item_id','==',entry.item.id))]);
        const current=entry.item,opened=openRentals(rows(rentalSnap)).length,condition=active.length>1?current.condition_status:next.condition;
        if(next.pricingProductId!==(current.pricing_product_id||null))assertEditable(current,opened,'change the rate sheet product of');
        if(condition!==current.condition_status)assertEditable(current,opened,'change the condition of');
        if(String(current.status).toUpperCase()==='AVAILABLE'&&!['GOOD','FAIR'].includes(condition)&&!openMaintenance(rows(maintenanceSnap)).length)fail(400,'Start maintenance before marking equipment damaged or needing inspection.');
        const rateRows=rows(ratesSnap),rate=currentRate(rateRows),rateChanged=!rate||rate.rate_type!==next.rateType||Number(rate.rental_rate)!==next.rentalRate||Number(rate.late_penalty_rate)!==next.latePenalty||JSON.stringify(next.customRateOptions||[])!==JSON.stringify(current.custom_rate_options||[]);
        const changes={stock_group_id:stockGroupId,category_id:next.categoryId,name:next.name,description:next.description,pricing_product_id:next.pricingProductId,custom_rate_options:next.customRateOptions||[],custom_rate_options_version:2,condition_status:condition,updated_at:now};
        if(next.imageData!==undefined)changes.image_data=next.imageData;
        return {...entry,rateRows,rateChanged,changes};
      }));
    }
    const writeDetails=()=>{
      for(const entry of details){
        if(entry.rateChanged){for(const old of entry.rateRows.filter(rate=>rate.is_active!==false))tx.update(db.collection('item_rates').doc(old.id),{is_active:false,effective_to:now});tx.create(db.collection('item_rates').doc(),rateRecord(actor,entry.item.id,next,now));}
        tx.update(entry.doc.ref,entry.changes);
        const {image_data,...before}=entry.item,{image_data:nextImage,...after}=entry.changes;
        const log=audit(db,actor,entry.item.id,'ITEM_UPDATED',before,{...after,rateChanged:entry.rateChanged,imageChanged:next.imageData!==undefined&&(next.imageData||null)!==(image_data||null),stock_group_id:stockGroupId},now);tx.create(log.ref,log.data);
      }
    };
    if(quantity===currentQuantity){writeDetails();result={id,stock_group_id:stockGroupId,quantity:currentQuantity};return;}
    if(quantity<currentQuantity){
      const available=active.filter(({item})=>String(item.status).toUpperCase()==='AVAILABLE'&&!item.reserved_rental_id&&healthyUnit(item)).sort((a,b)=>Number(a.item.id===stockGroupId)-Number(b.item.id===stockGroupId));
      const checks=await Promise.all(available.map(async entry=>{
        const [rentalSnap,maintenanceSnap]=await Promise.all([
          itemRentalDocs(db,entry.item.id,tx),tx.get(db.collection('maintenance_records').where('item_id','==',entry.item.id))
        ]);
        return {...entry,hasOpenRental:openRentals(rows(rentalSnap)).length>0,hasOpenMaintenance:openMaintenance(rows(maintenanceSnap)).length>0};
      }));
      const removable=checks.filter(entry=>!entry.hasOpenRental&&!entry.hasOpenMaintenance).slice(0,currentQuantity-quantity);
      if(removable.length<currentQuantity-quantity){
        const minimum=currentQuantity-checks.filter(entry=>!entry.hasOpenRental&&!entry.hasOpenMaintenance).length;
        fail(409,`Stock cannot be lower than ${minimum}; the remaining units are rented, reserved, or under maintenance.`);
      }
      writeDetails();
      for(const entry of removable){
        tx.update(entry.doc.ref,{status:'INACTIVE',is_active:false,stock_inactive_reason:'QUANTITY_REDUCED',updated_at:now});
        const history=statusRecord(db,actor,entry.item.id,entry.item.status,'INACTIVE','QUANTITY_REDUCED',now),log=audit(db,actor,entry.item.id,'ITEM_QUANTITY_REDUCED',entry.item,{status:'INACTIVE',is_active:false,stock_group_id:stockGroupId},now);
        if(history)tx.create(history.ref,history.data);tx.create(log.ref,log.data);
      }
      result={id,stock_group_id:stockGroupId,quantity};
      return;
    }

    const count=quantity-currentQuantity,templateEntry=active.find(({item})=>String(item.status).toUpperCase()==='AVAILABLE')||active[0]||units[0];
    if(!templateEntry)fail(409,'Equipment stock details are missing. Refresh inventory and try again.');
    const template=templateEntry.item,categoryRef=db.collection('item_categories').doc(String(template.category_id));
    const [categoryDoc,rateSnapshot]=await Promise.all([
      tx.get(categoryRef),tx.get(db.collection('item_rates').where('item_id','==',template.id))
    ]);
    if(!categoryDoc.exists)fail(409,'The equipment category no longer exists. Refresh inventory and try again.');
    const rate=next?{rate_type:next.rateType,rental_rate:next.rentalRate,late_penalty_rate:next.latePenalty,custom_rate_options:next.customRateOptions}:currentRate(rows(rateSnapshot));
    if(!rate)fail(409,'Set an active rental rate before increasing this equipment quantity.');
    const storedSequence=Number(counterDoc.data()?.next_sequence||1),start=Number.isSafeInteger(storedSequence)?Math.max(1,storedSequence):1;
    const candidates=Array.from({length:count+25},(_,index)=>({sequence:start+index,code:equipmentItemCode(start+index)}));
    const codeRefs=candidates.map(candidate=>db.collection('item_codes').doc(candidate.code)),codeDocs=await Promise.all(codeRefs.map(ref=>tx.get(ref)));
    const available=candidates.map((candidate,index)=>!codeDocs[index].exists?candidate:null).filter(Boolean).slice(0,count);
    if(available.length<count)fail(409,'Could not allocate unique equipment codes for the requested quantity. Try again.');
    writeDetails();
    const {id:templateId,...templateFields}=template;
    available.forEach((candidate,index)=>{
      const unitRef=additions[index],rateRef=db.collection('item_rates').doc(),codeRef=codeRefs[candidates.indexOf(candidate)],code=candidate.code;
      const catalog=next?{category_id:next.categoryId,name:next.name,description:next.description,pricing_product_id:next.pricingProductId,custom_rate_options:next.customRateOptions||[],custom_rate_options_version:2,image_data:next.imageData===undefined?template.image_data:next.imageData}:template;
      const created={stock_group_id:stockGroupId,item_code:code,qrCode:code,qr_token:code,category_id:catalog.category_id,name:catalog.name,description:catalog.description||'',pricing_product_id:catalog.pricing_product_id||null,custom_rate_options:catalog.custom_rate_options||[],custom_rate_options_version:catalog.custom_rate_options_version||1,...(catalog.image_data?{image_data:catalog.image_data}:{}),condition_status:next&&active.length<=1&&['GOOD','FAIR'].includes(next.condition)?next.condition:'GOOD',status:'AVAILABLE',is_active:true,created_at:now,updated_at:now};
      tx.create(codeRef,{item_id:unitRef.id,stock_group_id:stockGroupId,created_at:now});
      tx.create(unitRef,created);tx.create(rateRef,{...rateRecord(actor,unitRef.id,{rateType:rate.rate_type,rentalRate:Number(rate.rental_rate),latePenalty:Number(rate.late_penalty_rate),customRateOptions:rate.custom_rate_options||[]},now),custom_rate_options_version:created.custom_rate_options_version});
      const history=statusRecord(db,actor,unitRef.id,null,'AVAILABLE','QUANTITY_INCREASED',now),log=audit(db,actor,unitRef.id,'ITEM_QUANTITY_INCREASED',null,{...templateFields,id:unitRef.id,stock_group_id:stockGroupId,code},now);
      tx.create(history.ref,history.data);tx.create(log.ref,log.data);
    });
    tx.set(counterRef,{next_sequence:available.at(-1).sequence+1,updated_at:now},{merge:true});
    result={id,stock_group_id:stockGroupId,quantity};
  });
  return result;
}

export async function updateItem(db,actor,id,input) {
  if(input?.scope==='stock')return saveStockGroup(db,actor,id,input,validateItem({...input,quantity:1},{codeRequired:false}));
  id=idValue(id);const next=validateItem(input,{codeRequired:false}),itemRef=db.collection('items').doc(id),splitStockGroupId=db.collection('stock_groups').doc().id;
  await db.runTransaction(async tx=>{
    const itemDoc=await tx.get(itemRef);if(!itemDoc.exists)fail(404,'Equipment not found.');
    const current={id,...itemDoc.data()};
    const categoryRef=db.collection('item_categories').doc(next.categoryId);
    const groupId=String(current.stock_group_id||id);
    const [categoryDoc,rentalsSnap,ratesSnap,groupSnapshot]=await Promise.all([tx.get(categoryRef),itemRentalDocs(db,id,tx),tx.get(db.collection('item_rates').where('item_id','==',id)),tx.get(db.collection('items').where('stock_group_id','==',groupId))]);
    if(typeof input.version!=='string'||input.version!==localDateTime(current.updated_at))fail(409,'This equipment changed since you opened it. Refresh and try again.');
    if(!categoryDoc.exists)fail(400,'The selected category does not exist.');
    if(current.is_active===false)fail(409,'Restore archived equipment before editing it.');
    const opened=openRentals(rows(rentalsSnap)).length;
    if(opened>0&&next.pricingProductId!==(current.pricing_product_id||null))fail(409,'Wait until the open rental is returned before changing its rate sheet product.');
    if(next.condition!==current.condition_status)assertEditable(current,opened,'change the condition of');
    if(String(current.status).toUpperCase()==='AVAILABLE'&&!['GOOD','FAIR'].includes(next.condition))fail(400,'Start maintenance before marking equipment damaged or needing inspection.');
    const now=new Date(),rate=currentRate(rows(ratesSnap));
    const customRatesChanged=JSON.stringify(next.customRateOptions||[])!==JSON.stringify(current.custom_rate_options||[]);
    const rateChanged=!rate||rate.rate_type!==next.rateType||Number(rate.rental_rate)!==next.rentalRate||Number(rate.late_penalty_rate)!==next.latePenalty||customRatesChanged;
    const groupedUnits=groupSnapshot.docs.length?groupSnapshot.docs:[itemDoc],hasSiblings=groupedUnits.some(doc=>doc.id!==id);
    const splitFromGroup=hasSiblings&&(next.name!==current.name||next.categoryId!==String(current.category_id)||next.pricingProductId!==(current.pricing_product_id||null)||rateChanged||next.imageData!==undefined&&(next.imageData||null)!==(current.image_data||null));
    if(rateChanged){for(const old of rows(ratesSnap).filter(r=>r.is_active!==false))tx.update(db.collection('item_rates').doc(old.id),{is_active:false,effective_to:now});tx.create(db.collection('item_rates').doc(),rateRecord(actor,id,next,now));}
    const changes={category_id:next.categoryId,name:next.name,description:next.description,pricing_product_id:next.pricingProductId,custom_rate_options:next.customRateOptions||[],custom_rate_options_version:2,condition_status:next.condition,updated_at:now};
    if(splitFromGroup)changes.stock_group_id=splitStockGroupId;
    if(next.imageData!==undefined)changes.image_data=next.imageData;
    tx.update(itemRef,changes);
    const {image_data:currentImage,...auditCurrent}=current,{imageData,...auditNext}=next,imageChanged=imageData!==undefined&&(imageData||null)!==(currentImage||null);
    const log=audit(db,actor,id,'ITEM_UPDATED',auditCurrent,{...auditNext,code:current.item_code,rateChanged,imageChanged,stock_group_id:splitFromGroup?splitStockGroupId:groupId,splitFromStockGroup:splitFromGroup},now);tx.create(log.ref,log.data);
  });
  return {id};
}

export async function itemAction(db,actor,id,input) {
  id=idValue(id);if(!input||!['maintenance','complete-maintenance','archive','restore'].includes(input.action))fail(400,'Choose a valid inventory action.');
  if(input.action==='maintenance')return createMaintenance(db,actor,{...input,itemId:id});
  if(input.action==='complete-maintenance')fail(409,'Open the maintenance ticket, send the repaired unit for inspection, and complete its safety checklist.');
  const itemRef=db.collection('items').doc(id);
  await db.runTransaction(async tx=>{
    const itemDoc=await tx.get(itemRef);if(!itemDoc.exists)fail(404,'Equipment not found.');
    const item={id,...itemDoc.data()};
    const [rentalsSnap,maintenanceSnap]=await Promise.all([itemRentalDocs(db,id,tx),tx.get(db.collection('maintenance_records').where('item_id','==',id))]);
    if(typeof input.version!=='string'||input.version!==localDateTime(item.updated_at))fail(409,'This equipment changed since you opened it. Refresh and try again.');
    const rentalCount=openRentals(rows(rentalsSnap)).length,maintenance=openMaintenance(rows(maintenanceSnap));
    assertEditable(item,rentalCount,input.action==='archive'?'archive':'change the availability of');
    let status=String(item.status).toUpperCase(),active=item.is_active!==false,condition=item.condition_status;const now=new Date();
    if(input.action==='archive'){if(!active)fail(409,'Equipment is already archived.');if(status==='UNDER_MAINTENANCE'||maintenance.length)fail(409,'Complete maintenance before archiving equipment.');active=false;status='INACTIVE';}
    if(input.action==='restore'){if(status==='RETIRED')fail(409,'Retired units stay in history. Add replacement stock instead of restoring a retired unit.');if(active)fail(409,'Equipment is already active.');if(maintenance.length||!['GOOD','FAIR'].includes(condition))fail(409,'Equipment needs inspection before it can be restored.');active=true;status='AVAILABLE';}
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
