import {createHash} from 'node:crypto';
import {asDate,docData} from './firebase.mjs';
import {businessDay} from './payment-ledger.mjs';
import {dateRange} from './query-validation.mjs';

const key = value => createHash('sha256').update(value).digest('hex');
export function equipmentRentalContribution(rental, now = new Date()) {
  const at=asDate(rental?.confirmed_rental_at);
  if(!rental || !['ACTIVE','RETURN_PENDING_INSPECTION','COMPLETED'].includes(String(rental.status).toUpperCase()) || !at || !Number.isFinite(at.getTime()) || at>now) return null;
  const itemId=rental.item_id || rental.itemId || null, name=rental.item_name || rental.itemName || 'Unknown equipment';
  const fee=Number(rental.rental_fee ?? rental.rateFee);
  return {key:key(String(itemId || rental.stock_group_id || 'unknown:'+name)),item_id:itemId,stock_group_id:rental.stock_group_id || null,item_name:name,day:businessDay(at),rentals:1,fees:Number.isFinite(fee)&&fee>=0?Math.round(fee*100)/100:0};
}

// Stage all reads before the parent projection writes anything. Updating the
// same rental again only applies its difference, including deletion/correction.
export async function planEquipmentRanking(tx,db,before,after,now) {
  const changes=new Map();
  for(const [row,direction] of [[before,-1],[after,1]]) {
    if(!row)continue;
    for(const [collection,id] of [['equipment_rental_totals',row.key],['equipment_rental_daily',key(row.day+':'+row.key)]]) {
      const path=collection+'/'+id;
      if(!changes.has(path))changes.set(path,{ref:db.collection(collection).doc(id),row,daily:collection.endsWith('_daily'),rentals:0,fees:0});
      const change=changes.get(path);change.row=row;change.rentals+=direction;change.fees+=direction*row.fees;
    }
  }
  const entries=[...changes.values()],docs=await Promise.all(entries.map(change=>tx.get(change.ref)));
  return ()=>entries.forEach((change,index)=>{
    const saved=docs[index].exists?docs[index].data():{},row=change.row;
    tx.set(change.ref,{equipment_key:row.key,item_id:row.item_id,stock_group_id:row.stock_group_id,item_name:row.item_name,...(change.daily?{business_day:row.day}:{}),rentals:Number(saved.rentals||0)+change.rentals,fees:Math.round((Number(saved.fees||0)+change.fees)*100)/100,updated_at:now});
  });
}

export async function equipmentRentalRanking(db,items=[],options={},now=new Date()) {
  const {from,to}=options;dateRange(from,to);
  let query=db.collection(from || to?'equipment_rental_daily':'equipment_rental_totals');
  if(from || to){if(from)query=query.where('business_day','>=',from);query=query.where('business_day','<=',to || businessDay(now));}
  const snapshot=await query.get(),catalog=new Map(items.map(item=>[String(item.id),item])),groups=new Map();
  for(const doc of snapshot.docs){
    const row=docData(doc);if(!(row.rentals>0))continue;
    const item=catalog.get(String(row.item_id)),groupId=String(item?.stock_group_id || row.stock_group_id || row.item_id || row.equipment_key || doc.id);
    if(!groups.has(groupId)){
      const units=items.filter(unit=>String(unit.stock_group_id || unit.id)===groupId),live=units.filter(unit=>unit.is_active!==false);
      const representative=live.find(unit=>String(unit.id)===groupId) || live[0] || units.find(unit=>String(unit.id)===groupId) || units[0];
      groups.set(groupId,{stock_group_id:groupId,item_id:representative?.id || null,name:representative?.name || row.item_name || 'Unknown equipment',rentals:0,fees:0});
    }
    const group=groups.get(groupId);group.rentals+=row.rentals;group.fees=Math.round((group.fees+row.fees)*100)/100;
  }
  const rows=[...groups.values()].sort((a,b)=>b.rentals-a.rentals || a.name.localeCompare(b.name) || a.stock_group_id.localeCompare(b.stock_group_id));
  return {from:from || null,to:to || null,total_rentals:rows.reduce((sum,row)=>sum+row.rentals,0),equipment_count:rows.length,rows,scope:'ALL_PAGES',date_basis:'CONFIRMED_RENTAL_DATE'};
}
