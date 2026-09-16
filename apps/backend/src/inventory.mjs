import {randomUUID} from 'node:crypto';
import QRCode from 'qrcode';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const idValue=value=>{if(!/^[1-9]\d*$/.test(String(value)))fail(400,'Invalid equipment ID.');return String(value);};
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(400,`${label} is required (maximum ${max} characters).`);return value.trim();};
const conditions=['GOOD','FAIR','DAMAGED','NEEDS_INSPECTION'];
export function validateItem(input) {
  if(!input || typeof input!=='object')fail(400,'Equipment details are required.');
  const code=text(input.code,50,'Item code').toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9_-]*$/.test(code))fail(400,'Item code can contain letters, numbers, hyphens, and underscores.');
  const categoryId=idValue(input.categoryId);
  const name=text(input.name,150,'Equipment name');
  if(input.description!==undefined && (typeof input.description!=='string'||input.description.length>2000))fail(400,'Description must be 2,000 characters or fewer.');
  if(!conditions.includes(input.condition))fail(400,'Choose a valid equipment condition.');
  if(!['DAILY','HOURLY','FLAT'].includes(input.rateType))fail(400,'Choose a valid rental rate type.');
  const amount=(value,label)=>{
    if(typeof value!=='number' || !Number.isFinite(value) || value<0 || value>9999999999.99 || Math.abs(value*100-Math.round(value*100))>.0001)fail(400,`${label} must be a nonnegative amount with at most two decimal places.`);
    return value;
  };
  return {code,categoryId,name,description:(input.description||'').trim(),condition:input.condition,rateType:input.rateType,
    rentalRate:amount(input.rentalRate,'Rental rate'),deposit:amount(input.deposit,'Deposit'),latePenalty:amount(input.latePenalty,'Late penalty')};
}
export function assertEditable(item,openRentals,action) {
  if(openRentals>0 || ['RENTED','RESERVED_PENDING'].includes(item.status))fail(409,`Cannot ${action} equipment with an active or pending rental. Use the rental/return verification workflow.`);
}
const selectItems=`SELECT i.*,c.name AS category,rate.rate_type,rate.rental_rate,rate.deposit_amount,rate.late_penalty_rate,
  (SELECT COUNT(*) FROM rentals r WHERE r.item_id=i.id AND r.status IN ('ACTIVE','PENDING_VERIFICATION')) AS open_rentals,
  (SELECT COUNT(*) FROM maintenance_records m WHERE m.item_id=i.id AND m.status IN ('OPEN','IN_PROGRESS')) AS open_maintenance
  FROM items i JOIN item_categories c ON c.id=i.category_id
  LEFT JOIN item_rates rate ON rate.id=(SELECT ir.id FROM item_rates ir WHERE ir.item_id=i.id
  AND ir.is_active=1 AND ir.effective_from<=NOW(3) AND (ir.effective_to IS NULL OR ir.effective_to>NOW(3))
  ORDER BY ir.effective_from DESC,ir.id DESC LIMIT 1)`;
const mapItem=i=>({...i,id:String(i.id),category_id:String(i.category_id),
  effective_status:!i.is_active?'INACTIVE':i.status==='AVAILABLE'&&Number(i.open_rentals)>0?'RESERVED_PENDING':i.status});

export async function inventoryList(db) {
  const [items]=await db.query(selectItems+' ORDER BY i.name,i.id');
  const [categories]=await db.query('SELECT id,name FROM item_categories ORDER BY name');
  return {items:items.map(mapItem),categories};
}
export async function inventoryDetail(db,id) {
  id=idValue(id);
  const [items]=await db.execute(selectItems+' WHERE i.id=?',[id]);
  if(!items[0])fail(404,'Equipment not found.');
  const [history]=await db.execute('SELECT old_status,new_status,source,changed_at FROM item_status_history WHERE item_id=? ORDER BY changed_at DESC,id DESC LIMIT 20',[id]);
  const [maintenance]=await db.execute('SELECT id,status,reason,details,started_at,completed_at FROM maintenance_records WHERE item_id=? ORDER BY started_at DESC,id DESC LIMIT 20',[id]);
  const [rates]=await db.execute('SELECT rate_type,rental_rate,deposit_amount,late_penalty_rate,effective_from,effective_to,is_active FROM item_rates WHERE item_id=? ORDER BY effective_from DESC,id DESC LIMIT 10',[id]);
  return {item:mapItem(items[0]),history,maintenance,rates};
}
export async function inventoryQr(db,id) {
  const {item}=await inventoryDetail(db,id);
  return {svg:await QRCode.toString(item.qr_token,{type:'svg',errorCorrectionLevel:'M',margin:4,width:240}),token:item.qr_token,code:item.item_code,name:item.name};
}
async function audit(db,actor,id,action,before,after) {
  await db.execute("INSERT INTO audit_logs(user_id,actor_type,action,entity_type,entity_id,old_values,new_values) VALUES(?,'USER',?,'ITEM',?,?,?)",
    [actor,action,id, before?JSON.stringify(before):null,JSON.stringify(after)]);
}
async function statusHistory(db,actor,id,oldStatus,newStatus,reference) {
  if(oldStatus===newStatus)return;
  await db.execute("INSERT INTO item_status_history(item_id,old_status,new_status,source,reference_type,changed_by) VALUES(?,?,?,'WEB',?,?)",[id,oldStatus,newStatus,reference,actor]);
}
async function insertRate(db,actor,id,item) {
  await db.execute('INSERT INTO item_rates(item_id,rate_type,rental_rate,deposit_amount,late_penalty_rate,created_by) VALUES(?,?,?,?,?,?)',
    [id,item.rateType,item.rentalRate,item.deposit,item.latePenalty,actor]);
}
async function transaction(db,operation) {
  await db.beginTransaction();
  try {const value=await operation();await db.commit();return value;}
  catch(error){await db.rollback();
    if(error.code==='ER_DUP_ENTRY')fail(409,'That item code already exists. Choose a unique code.');
    if(error.code==='ER_LOCK_DEADLOCK'||error.code==='ER_LOCK_WAIT_TIMEOUT')fail(409,'Equipment is being updated. Refresh and try again.');
    throw error;
  }
}
async function lockItem(db,id,version) {
  id=idValue(id);
  const [rows]=await db.execute('SELECT * FROM items WHERE id=? FOR UPDATE',[id]);
  if(!rows[0])fail(404,'Equipment not found.');
  if(typeof version!=='string' || version!==rows[0].updated_at)fail(409,'This equipment changed since you opened it. Refresh and try again.');
  const [rentals]=await db.execute("SELECT id FROM rentals WHERE item_id=? AND status IN ('ACTIVE','PENDING_VERIFICATION') FOR UPDATE",[id]);
  return {item:rows[0],openRentals:rentals.length,id};
}
async function checkCategory(db,id) {
  const [rows]=await db.execute('SELECT id FROM item_categories WHERE id=?',[id]);
  if(!rows.length)fail(400,'The selected category does not exist.');
}
export async function createItem(db,actor,input) {
  const item=validateItem(input);
  if(!['GOOD','FAIR'].includes(item.condition))fail(400,'New equipment must be in good or fair condition. Record maintenance after adding damaged equipment.');
  return transaction(db,async()=>{
    await checkCategory(db,item.categoryId);
    const [result]=await db.execute("INSERT INTO items(item_code,category_id,name,description,qr_token,condition_status,status,is_active) VALUES(?,?,?,?,?,?,'AVAILABLE',1)",
      [item.code,item.categoryId,item.name,item.description,'RENTPLAY:'+randomUUID(),item.condition]);
    const id=String(result.insertId);
    await insertRate(db,actor,id,item);
    await statusHistory(db,actor,id,null,'AVAILABLE','CREATED');
    await audit(db,actor,id,'ITEM_CREATED',null,item);
    return {id};
  });
}
export async function updateItem(db,actor,id,input) {
  const next=validateItem(input);
  return transaction(db,async()=>{
    const locked=await lockItem(db,id,input.version);const current=locked.item;
    if(!current.is_active)fail(409,'Restore archived equipment before editing it.');
    if(next.condition!==current.condition_status)assertEditable(current,locked.openRentals,'change the condition of');
    if(current.status==='AVAILABLE'&&!['GOOD','FAIR'].includes(next.condition))fail(400,'Start maintenance before marking equipment damaged or needing inspection.');
    await checkCategory(db,next.categoryId);
    const [rates]=await db.execute(`SELECT * FROM item_rates WHERE item_id=? AND is_active=1 AND effective_from<=NOW(3)
      AND (effective_to IS NULL OR effective_to>NOW(3)) ORDER BY effective_from DESC,id DESC LIMIT 1 FOR UPDATE`,[locked.id]);
    const rate=rates[0];
    const rateChanged=!rate || rate.rate_type!==next.rateType || Number(rate.rental_rate)!==next.rentalRate || Number(rate.deposit_amount)!==next.deposit || Number(rate.late_penalty_rate)!==next.latePenalty;
    if(rateChanged) {
      await db.execute('UPDATE item_rates SET is_active=0,effective_to=NOW(3) WHERE item_id=? AND is_active=1 AND effective_from<=NOW(3) AND (effective_to IS NULL OR effective_to>NOW(3))',[locked.id]);
      await insertRate(db,actor,locked.id,next);
    }
    await db.execute('UPDATE items SET item_code=?,category_id=?,name=?,description=?,condition_status=?,updated_at=GREATEST(NOW(3),DATE_ADD(updated_at,INTERVAL 1000 MICROSECOND)) WHERE id=?',
      [next.code,next.categoryId,next.name,next.description,next.condition,locked.id]);
    await audit(db,actor,locked.id,'ITEM_UPDATED',current,{...next,rateChanged});
    return {id:locked.id};
  });
}
export async function itemAction(db,actor,id,input) {
  if(!input || !['maintenance','complete-maintenance','archive','restore'].includes(input.action))fail(400,'Choose a valid inventory action.');
  return transaction(db,async()=>{
    const locked=await lockItem(db,id,input.version);const {item,openRentals}=locked;
    assertEditable(item,openRentals,input.action==='archive'?'archive':'change the availability of');
    const [maintenance]=await db.execute("SELECT id FROM maintenance_records WHERE item_id=? AND status IN ('OPEN','IN_PROGRESS') FOR UPDATE",[locked.id]);
    let status=item.status,active=item.is_active,condition=item.condition_status;
    if(input.action==='maintenance') {
      if(!active || status!=='AVAILABLE' || maintenance.length)fail(409,'Only available equipment without an open maintenance record can enter maintenance.');
      const reason=text(input.reason,255,'Maintenance reason');
      if(!conditions.includes(input.condition))fail(400,'Choose a valid condition.');
      condition=input.condition;status='UNDER_MAINTENANCE';
      await db.execute("INSERT INTO maintenance_records(item_id,status,reason,created_by) VALUES(?,'IN_PROGRESS',?,?)",[locked.id,reason,actor]);
    }
    if(input.action==='complete-maintenance') {
      if(!active || status!=='UNDER_MAINTENANCE')fail(409,'This equipment is not under maintenance.');
      if(!['GOOD','FAIR'].includes(input.condition))fail(400,'Equipment must be in good or fair condition before becoming available.');
      const notes=text(input.reason,2000,'Inspection notes');
      condition=input.condition;status='AVAILABLE';
      await db.execute("UPDATE maintenance_records SET status='COMPLETED',completed_at=NOW(3),details=? WHERE item_id=? AND status IN ('OPEN','IN_PROGRESS')",[notes,locked.id]);
      // Preserve inspection evidence even for a pre-existing maintenance status without a record.
      if(!maintenance.length)await db.execute("INSERT INTO maintenance_records(item_id,status,reason,details,completed_at,created_by) VALUES(?,'COMPLETED','Equipment inspection',?,NOW(3),?)",[locked.id,notes,actor]);
    }
    if(input.action==='archive') {
      if(!active)fail(409,'Equipment is already archived.');
      if(status==='UNDER_MAINTENANCE'||maintenance.length)fail(409,'Complete maintenance before archiving equipment.');
      active=0;status='INACTIVE';
    }
    if(input.action==='restore') {
      if(active)fail(409,'Equipment is already active.');
      if(maintenance.length || !['GOOD','FAIR'].includes(condition))fail(409,'Equipment needs inspection before it can be restored.');
      active=1;status='AVAILABLE';
    }
    await db.execute('UPDATE items SET status=?,is_active=?,condition_status=?,updated_at=GREATEST(NOW(3),DATE_ADD(updated_at,INTERVAL 1000 MICROSECOND)) WHERE id=?',[status,active,condition,locked.id]);
    await statusHistory(db,actor,locked.id,item.status,status,input.action.toUpperCase());
    await audit(db,actor,locked.id,'ITEM_'+input.action.replaceAll('-','_').toUpperCase(),item,{status,is_active:active,condition_status:condition,reason:input.reason || null});
    return {id:locked.id};
  });
}
