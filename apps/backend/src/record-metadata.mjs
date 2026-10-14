import { asDate } from './firebase.mjs';
import { maintenanceStage } from './maintenance-state.mjs';

// Compatibility metadata only: preserve IDs, QR tokens, prices and payments.
export function recordMetadata(collection, row) {
  const patch={};
  const aliases=collection==='rentals'?{item_id:'itemId',customer_id:'customerId',item_name:'itemName',customer_name:'customerName',due_at:'dueDate',rental_fee:'rateFee',delivery_location:'deliveryLocation',payment_method:'paymentMethod'}:{};
  for(const [field,old]of Object.entries(aliases))if(row[field]==null && row[old]!=null)patch[field]=['due_at'].includes(field)?asDate(row[old]):row[old];
  const created=row.created_at ?? row.createdAt ?? (collection==='maintenance_records'?row.started_at:collection==='rentals'?row.startDate:null);
  if(!row.created_at && created){const date=asDate(created);if(date&&Number.isFinite(date.getTime()))patch.created_at=date;}
  if(collection==='customers'){
    const name=String(row.full_name||row.name||'').trim();
    if(!row.full_name&&name)patch.full_name=name;
    const search=name.toLowerCase().replace(/\s+/g,' ');
    if(row.search_name!==search)patch.search_name=search;
    if(row.is_active==null)patch.is_active=true;
  }
  if(collection==='users' && row.hasAcknowledgedIdRequirement==null && (row.validIdUrl || row.valid_id_url))patch.hasAcknowledgedIdRequirement=true;
  if(['rentals','maintenance_records'].includes(collection)&&row.status){
    const status=String(row.status).toUpperCase();
    if(status!==row.status)patch.status=status;
    if(collection==='maintenance_records'&&!row.workflow_stage)patch.workflow_stage=maintenanceStage(row);
  }
  return Object.fromEntries(Object.entries(patch).filter(([,value])=>value!=null && (!(value instanceof Date)||Number.isFinite(value.getTime()))));
}
