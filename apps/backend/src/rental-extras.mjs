import { asDate, docData } from './firebase.mjs';
import { frozenQuote, rentalsForItem } from './transactions.mjs';
import { assertCalendarFree } from './rental-calendar.mjs';
import { queueRentalNotification } from './notifications.mjs';
import { serializeLedger } from './payment-ledger.mjs';
import { allocateRecordCodes } from './record-codes.mjs';
import { returnMaintenanceRecord } from './maintenance.mjs';
import { isStaffRole } from './roles.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const ref = (db,id) => db.collection('rentals').doc(String(id));
const rows = snapshot => snapshot.docs.map(docData);
const key = value => { if (!/^[a-f0-9]{32}$/.test(value || '')) fail(400,'A valid request key is required.'); return value; };
const actorId = actor => String(actor.id || actor);
const audit = (tx,db,actor,id,action,now) => { tx.create(db.collection('audit_logs').doc(),{actor_type:'USER',user_id:actorId(actor),action,entity_type:'RENTAL',entity_id:id,rental_id:id,created_at:now}); tx.set(db.collection('report_jobs').doc(id),{rental_id:id,queued_at:now}); };

export async function updateLocalDelivery(db, actor, id, input, now = new Date()) {
  const operation = key(input.requestKey), action = String(input.action || '').toUpperCase();
  if (!['DEPART','FAIL','RETURN_TO_SHOP'].includes(action)) fail(400,'Choose a valid local delivery action.');
  return serializeLedger(await db.runTransaction(async tx => {
    const doc = await tx.get(ref(db,id)); if (!doc.exists) fail(404,'Rental not found.');
    const rental = docData(doc), itemRef = db.collection('items').doc(String(rental.item_id)), item = await tx.get(itemRef);
    if (rental.delivery_operation_key === operation) return {rental,duplicate:true};
    if (rental.status !== 'APPROVED' || rental.fulfillment_mode === 'SHOP_HANDOVER' || !item.exists || item.data().reserved_rental_id !== id || !['AVAILABLE','RESERVED_PENDING'].includes(item.data().status) || item.data().current_rental_id) fail(409,'Only a reserved local resort delivery can use this action.');
    let changes;
    if (action === 'DEPART') {
      if (rental.delivery_status !== 'PREPARED') fail(409,'Scan and prepare the equipment before departing.');
      if (asDate(rental.hold_expires_at) <= now) fail(409,'This handoff hold expired. Refresh the rental.');
      changes = {delivery_status:'OUT_FOR_DELIVERY',handoff_expires_at:rental.hold_expires_at,hold_expires_at:null,delivery_departure:{at:now,operator_id:actorId(actor),operator_name:actor.full_name || actor.name || actorId(actor)}};
    } else if (action === 'FAIL') {
      if (!['PREPARED','OUT_FOR_DELIVERY'].includes(rental.delivery_status)) fail(409,'Only a prepared or outgoing delivery can be reported as unsuccessful.');
      const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
      if (!reason || reason.length > 1000) fail(400,'Describe why the delivery could not be completed.');
      changes = {delivery_status:'DELIVERY_FAILED',delivery_failure:{at:now,operator_id:actorId(actor),reason}};
    } else {
      if (rental.delivery_status !== 'DELIVERY_FAILED' || input.physicalReceiptConfirmed !== true) fail(409,'Confirm the unsuccessful delivery and that the unit is physically back at the shop.');
      if (input.inventoryCode !== item.data().qr_token && !(typeof input.manualReason==='string' && input.manualReason.trim() && input.inventoryCode===item.data().item_code)) fail(409,'Scan the QR of the exact returning unit, or record a reason for manual equipment-code lookup.');
      if (!['GOOD','FAIR','DAMAGED','NEEDS_INSPECTION'].includes(input.condition)) fail(400,'Choose the inspected equipment condition.');
      const damaged=['DAMAGED','NEEDS_INSPECTION'].includes(input.condition);
      const notes=String(input.notes || input.reason || '').trim().slice(0,2000);
      if(damaged&&!notes)fail(400,'Describe the damage or required inspection.');
      if(damaged){
        const conditionRef=db.collection('item_condition_records').doc(),maintenanceRef=db.collection('maintenance_records').doc();
        const [code]=await allocateRecordCodes(tx,db,['maintenance_records'],now);
        const condition={id:conditionRef.id,condition:input.condition,notes,inspected_at:now,inspected_by:actorId(actor),result:'UNDER_MAINTENANCE'};
        tx.create(conditionRef,{...condition,item_id:item.id,rental_id:id,phase:'DELIVERY_RETURN'});
        tx.create(maintenanceRef,returnMaintenanceRecord(docData(item),id,condition,actor,code,now));
      }
      changes = {status:'CANCELLED',delivery_status:'RETURNED_TO_SHOP',cancelled_at:now,final_reason:rental.delivery_failure.reason,refund_due:Math.max(0,Number(rental.rental_paid_amount || 0)-Number(rental.rental_refunded_amount || 0)),balance_due:0};
      changes.payment_status = changes.refund_due ? 'REFUND_PENDING' : 'PAID';
      tx.update(itemRef,{reserved_rental_id:null,status:damaged?'UNDER_MAINTENANCE':'AVAILABLE',condition_status:input.condition,updated_at:now});
    }
    changes.updated_at = now; changes.delivery_operation_key = operation;
    tx.update(doc.ref,changes); audit(tx,db,actor,id,`LOCAL_DELIVERY_${action}`,now);
    queueRentalNotification(tx,db,{...rental,...changes},`DELIVERY_${action}`,now,{revision:operation});
    return {rental:{...rental,...changes}};
  }));
}

export async function requestRentalExtension(db, actor, id, input, now = new Date(), quoteOnly = false) {
  const operation = key(input.requestKey), minutes = Number(input.additionalMinutes);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 10080) fail(400,'Choose an extension of 15 minutes to 7 days.');
  return serializeLedger(await db.runTransaction(async tx => {
    const doc = await tx.get(ref(db,id)); if (!doc.exists) fail(404,'Rental not found.');
    const rental = docData(doc);
    const staff=isStaffRole(actor.role);
    if (!staff && String(rental.customer_id || rental.customerId) !== actorId(actor)) fail(403,'You can only extend your own rental.');
    if(staff && !quoteOnly && input.customerRequestedExtension!==true)fail(400,'Confirm that the customer requested and agreed to the additional rental time and charge.');
    const operationRef=db.collection('rental_extension_operations').doc(`${id}_${operation}`),saved=await tx.get(operationRef);
    const previous=saved.exists?saved.data():rental.extension_request?.request_key===operation?rental.extension_request:(rental.extension_history||[]).find(row=>row.request_key===operation);
    if(previous){if(previous.additional_minutes!==minutes || !quoteOnly && previous.additional_fee!==input.expectedAdditionalFee)fail(409,'This key belongs to another extension.');return quoteOnly?{quote:{additional_fee:previous.additional_fee,billed_minutes:previous.quote.billed_minutes,due_at:previous.requested_due_at},duplicate:true}:{rental,duplicate:true};}
    if (rental.status !== 'ACTIVE' || rental.received_at || rental.latest_return_request_status === 'PENDING_ADMIN_APPROVAL' || asDate(rental.due_at) <= now) fail(409,'Request an extension before the due time and before arranging a return.');
    if (rental.extension_request?.status === 'PENDING') fail(409,'The operator is already reviewing your extension.');
    const item = await tx.get(db.collection('items').doc(String(rental.item_id))), related = await rentalsForItem(tx,db,rental.item_id);
    if (!item.exists) fail(409,'The assigned unit needs review.');
    const quote = await frozenQuote(tx,db,docData(item),{mode:'TIMED',durationMinutes:minutes,startAt:asDate(rental.due_at).toISOString()},now,true);
    assertCalendarFree(rows(related),asDate(rental.due_at),asDate(quote.due_at),now,id);
    if (quoteOnly) return {quote:{additional_fee:quote.rental_fee,billed_minutes:quote.billed_minutes,due_at:quote.due_at}};
    if (input.expectedAdditionalFee !== quote.rental_fee) fail(409,'Review and agree to the extension price before submitting the request.');
    const request = {request_key:operation,status:'PENDING',additional_minutes:minutes,original_due_at:asDate(rental.due_at),requested_due_at:asDate(quote.due_at),additional_fee:quote.rental_fee,quote,requested_at:now,requested_by:actorId(actor)};
    tx.create(operationRef,{...request,rental_id:id});
    tx.update(doc.ref,{extension_request:request,updated_at:now});
    // Lock calendar writers for this physical unit; the request alone does not reserve the extra time.
    tx.update(item.ref,{schedule_revision:Number(item.data().schedule_revision || 0)+1});
    queueRentalNotification(tx,db,rental,'EXTENSION_REQUESTED',now,{audience:'STAFF',revision:operation});
    audit(tx,db,actor,id,'RENTAL_EXTENSION_REQUESTED',now);
    return {rental:{...rental,extension_request:request}};
  }));
}

export async function reviewRentalExtension(db, actor, id, input, now = new Date()) {
  const action = String(input.action || '').toUpperCase();
  if (!['APPROVE','REJECT'].includes(action)) fail(400,'Choose approve or reject.');
  return serializeLedger(await db.runTransaction(async tx => {
    const doc = await tx.get(ref(db,id)); if (!doc.exists) fail(404,'Rental not found.');
    const rental = docData(doc), request = rental.extension_request;
    if (!request || input.requestKey !== request.request_key) fail(409,'Refresh the current extension request before reviewing it.');
    if (request.status !== 'PENDING') { if (request.status === (action === 'APPROVE' ? 'APPROVED' : 'REJECTED')) return {rental,duplicate:true}; fail(409,'This extension was already reviewed.'); }
    if (action === 'APPROVE' && (rental.status !== 'ACTIVE' || rental.received_at || rental.latest_return_request_status==='PENDING_ADMIN_APPROVAL' || asDate(rental.due_at) <= now || asDate(rental.due_at).getTime() !== asDate(request.original_due_at).getTime())) fail(409,'The rental is no longer eligible for this extension.');
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0,1000) : '';
    if (action === 'REJECT' && !reason) fail(400,'Explain why the extension is rejected.');
    const changes = {extension_request:{...request,status:action === 'APPROVE' ? 'APPROVED' : 'REJECTED',reviewed_at:now,reviewed_by:actorId(actor),reason:reason || null},updated_at:now};
    if (action === 'APPROVE') {
      const item = await tx.get(db.collection('items').doc(String(rental.item_id))), related = await rentalsForItem(tx,db,rental.item_id);
      assertCalendarFree(rows(related),asDate(rental.due_at),asDate(request.requested_due_at),now,id);
      const fee = Math.round((Number(rental.rental_fee)+Number(request.additional_fee))*100)/100;
      Object.assign(changes,{due_at:asDate(request.requested_due_at),rental_fee:fee,balance_due:Math.max(0,fee-Number(rental.rental_paid_amount || 0)),payment_status:fee>Number(rental.rental_paid_amount || 0)?'BALANCE_DUE':'PAID',fee_breakdown:{...rental.fee_breakdown,rental_fee:fee,due_at:asDate(request.requested_due_at),requested_minutes:Number(rental.fee_breakdown.requested_minutes)+request.additional_minutes,billed_minutes:Number(rental.fee_breakdown.billed_minutes)+Number(request.quote.billed_minutes),rate_components:[...(rental.fee_breakdown.rate_components || []),...(request.quote.rate_components || []).map(component=>({...component,label:`Extension · ${component.label}`}))]},extension_history:[...(rental.extension_history || []),changes.extension_request]});
      tx.update(item.ref,{schedule_revision:Number(item.data().schedule_revision || 0)+1});
    }
    tx.update(doc.ref,changes); audit(tx,db,actor,id,`RENTAL_EXTENSION_${action}`,now);
    tx.set(db.collection('rental_extension_operations').doc(`${id}_${request.request_key}`),{...changes.extension_request,rental_id:id},{merge:true});
    queueRentalNotification(tx,db,{...rental,...changes},`EXTENSION_${action}`,now,{revision:request.request_key,reason});
    return {rental:{...rental,...changes}};
  }));
}
