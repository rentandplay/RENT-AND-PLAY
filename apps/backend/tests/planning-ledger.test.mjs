import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFirestore } from './support/memory-firestore.mjs';
import { createBooking,reviewBooking,prepareRentalDelivery,releaseBooking,verifyReleaseCodes,lookupRental,settleRentalPayment,cancelBooking,expireRentalHolds } from '../src/rental-flow.mjs';
import { updateLocalDelivery,requestRentalExtension,reviewRentalExtension } from '../src/rental-extras.mjs';
import { financeSummary,createExpense,ledgerPage } from '../src/payment-ledger.mjs';
import { recordPage } from '../src/record-pages.mjs';
import { projectRentalSummary,rentalDailySummary } from '../src/report-summaries.mjs';
import { createApi,createFirebaseServices } from '../src/server.mjs';
import { once } from 'node:events';
const now=new Date('2026-10-14T02:00:00Z'), at=min=>new Date(now.getTime()+min*60000), k=char=>char.repeat(32), staff={id:'staff',name:'Operator'}, customer={id:'customer',full_name:'Customer'};
const input={itemId:'bike',durationMinutes:60,deliveryLocation:'Lakewood resort',requestKey:k('a')};
const inspection={condition:'GOOD',result:'AVAILABLE',accessoriesChecked:true};
function fixture(){return memoryFirestore({customers:{customer:{full_name:'Customer',is_active:true}},items:{bike:{name:'Bicycle',item_code:'EQUIP-001',qr_token:'bike-qr',status:'AVAILABLE',is_active:true}},item_rates:{rate:{item_id:'bike',rate_type:'HOURLY',rental_rate:100,late_penalty_rate:20,is_active:true,effective_from:at(-100)}}});}
async function active(db){const {rental}=await createBooking(db,customer,input,now);await reviewBooking(db,staff,rental.id,{action:'APPROVE'},at(1));await prepareRentalDelivery(db,staff,rental.id,{inventoryCode:'bike-qr'},at(2));await releaseBooking(db,staff,rental.id,{requestKey:k('b'),transactionCode:rental.booking_qr_token,customerVerified:true,paymentVerified:true,inspection},at(3));return rental;}
test('scheduled rental reserves an interval, leaves current stock free, and rejects overlapping requests',async()=>{
 const db=fixture(), payload={...input,scheduledStartAt:at(180).toISOString()};
 const {rental}=await createBooking(db,customer,payload,now);
 assert.equal(db.data('items','bike').reserved_rental_id,undefined);
 await reviewBooking(db,staff,rental.id,{action:'APPROVE'},at(1));
 await assert.rejects(prepareRentalDelivery(db,staff,rental.id,{inventoryCode:'bike-qr'},at(2)),e=>e.status===409);
 await assert.rejects(createBooking(db,customer,{...payload,requestKey:k('c')},at(2)),e=>e.status===409);
 const immediate=await createBooking(db,customer,{...input,requestKey:k('d')},at(2));assert.ok(immediate.rental.id);
 await cancelBooking(db,customer,immediate.rental.id,at(3));
 await prepareRentalDelivery(db,staff,rental.id,{inventoryCode:'bike-qr'},at(175));
 assert.equal(db.data('items','bike').reserved_rental_id,rental.id);
});
test('physical cash handoff and retries produce one immutable receipt and one daily total',async()=>{
 const db=fixture(), rental=await active(db);assert.equal(db.records('payment_ledger').length,1);
 await releaseBooking(db,staff,rental.id,{requestKey:k('b')},at(4));assert.equal(db.records('payment_ledger').length,1);
 const summary=await financeSummary(db,{from:'2026-10-14',to:'2026-10-14'},now);assert.equal(summary.totals.cash_collections,100);assert.equal(summary.totals.collections,100);
 await createExpense(db,staff,{requestKey:k('e'),amount:20,paymentMethod:'CASH',category:'SUPPLIES',notes:'Paper'},at(5));
 await createExpense(db,staff,{requestKey:k('e'),amount:20,paymentMethod:'CASH',category:'SUPPLIES',notes:'Paper'},at(6));
 assert.equal((await financeSummary(db,{from:'2026-10-14',to:'2026-10-14'},now)).totals.cash_net_movement,80);
});
test('extension quotes additional charges; approval rechecks next reservation; collection is separate',async()=>{
 const db=fixture(), rental=await active(db);
 const request=await requestRentalExtension(db,customer,rental.id,{requestKey:k('e'),additionalMinutes:60,expectedAdditionalFee:100},at(5));assert.equal(request.rental.extension_request.additional_fee,100);
 await reviewRentalExtension(db,staff,rental.id,{action:'APPROVE',requestKey:k('e')},at(6));assert.equal(db.data('rentals',rental.id).balance_due,100);
 await settleRentalPayment(db,staff,rental.id,{requestKey:k('f'),paymentAmount:100,notes:'Cash received in person'},at(7));assert.equal(db.records('payment_ledger').length,2);
 await requestRentalExtension(db,customer,rental.id,{requestKey:k('a'),additionalMinutes:60,expectedAdditionalFee:100},at(8));
 await createBooking(db,customer,{...input,requestKey:k('c'),scheduledStartAt:at(140).toISOString()},at(9));
 await assert.rejects(reviewRentalExtension(db,staff,rental.id,{action:'APPROVE',requestKey:k('a')},at(10)),e=>e.status===409);
 assert.equal(db.data('rentals',rental.id).extension_request.status,'PENDING');
});
test('delivery in operator custody cannot expire or be cancelled before physical shop receipt',async()=>{
 const db=fixture(), {rental}=await createBooking(db,customer,input,now);await reviewBooking(db,staff,rental.id,{action:'APPROVE'},at(1));await prepareRentalDelivery(db,staff,rental.id,{inventoryCode:'bike-qr'},at(2));
 await updateLocalDelivery(db,staff,rental.id,{action:'DEPART',requestKey:k('d')},at(3));await expireRentalHolds(db,at(200));assert.equal(db.data('items','bike').reserved_rental_id,rental.id);
 await assert.rejects(cancelBooking(db,customer,rental.id,at(201)),e=>e.status===409);
 await updateLocalDelivery(db,staff,rental.id,{action:'FAIL',requestKey:k('e'),reason:'Customer unreachable'},at(202));
 await assert.rejects(updateLocalDelivery(db,staff,rental.id,{action:'RETURN_TO_SHOP',requestKey:k('f'),physicalReceiptConfirmed:true,inventoryCode:'wrong',condition:'GOOD'},at(203)),e=>e.status===409);
 await updateLocalDelivery(db,staff,rental.id,{action:'RETURN_TO_SHOP',requestKey:k('f'),physicalReceiptConfirmed:true,inventoryCode:'bike-qr',condition:'GOOD'},at(204));assert.equal(db.data('items','bike').reserved_rental_id,null);
});
test('paged records are bounded and filter cursors cannot be reused; summaries are idempotent',async()=>{
 const db=fixture(), rental=await active(db);await projectRentalSummary(db,rental.id,at(5));await projectRentalSummary(db,rental.id,at(6));assert.equal((await rentalDailySummary(db,'2026-10-14','2026-10-14')).totals.fees,100);
 for(let i=0;i<6;i++)await db.collection('customers').doc(`c${i}`).set({full_name:`Person ${i}`,is_active:true});
 const page=await recordPage(db,'customers',{limit:2});assert.equal(page.records.length,2);assert.ok(page.nextCursor);
 assert.equal((await recordPage(db,'customers',{limit:2,cursor:page.nextCursor})).records.length,2);
 await assert.rejects(recordPage(db,'customers',{limit:2,cursor:page.nextCursor,status:'INACTIVE'}),e=>e.status===400);
 assert.equal((await ledgerPage(db,{limit:1})).entries.length,1);
});

test('inventory scanner and handoff preflight choose the current rental with multiple future reservations',async()=>{
 const db=fixture();
 for(const [char,minute]of [['c',180],['d',300]]){const result=await createBooking(db,customer,{...input,requestKey:k(char),scheduledStartAt:at(minute).toISOString()},now);await reviewBooking(db,staff,result.rental.id,{action:'APPROVE'},at(1));}
 const {rental}=await createBooking(db,customer,input,at(2));await reviewBooking(db,staff,rental.id,{action:'APPROVE'},at(3));await prepareRentalDelivery(db,staff,rental.id,{inventoryCode:'bike-qr'},at(4));
 const preflight=await verifyReleaseCodes(db,staff,rental.id,{transactionCode:rental.booking_qr_token,inventoryCode:'bike-qr'},at(5));assert.ok(preflight);
 await releaseBooking(db,staff,rental.id,{requestKey:k('b'),transactionCode:rental.booking_qr_token,customerVerified:true,paymentVerified:true,inspection},at(6));
 assert.equal((await lookupRental(db,{kind:'INVENTORY',code:'bike-qr'},at(7))).rental.id,rental.id);
});

test('partial receipts and late transfers record real money without approving or reviving rentals',async()=>{
 const db=fixture(),{rental}=await createBooking(db,customer,input,now);
 const receipt={requestKey:k('e'),paymentAmount:40,paymentMethod:'QR',reference:'TRANSFER-1',notes:'Confirmed transfer'};
 await settleRentalPayment(db,staff,rental.id,receipt,at(1));assert.equal(db.data('rentals',rental.id).status,'PENDING_ADMIN_APPROVAL');assert.equal(db.data('rentals',rental.id).balance_due,60);
 await assert.rejects(settleRentalPayment(db,staff,rental.id,{...receipt,paymentMethod:'CASH'},at(2)),e=>e.status===409);
 await cancelBooking(db,customer,rental.id,at(3));
 await settleRentalPayment(db,staff,rental.id,{...receipt,requestKey:k('f'),paymentAmount:20,reference:'TRANSFER-2'},at(4));
 assert.equal(db.data('rentals',rental.id).status,'CANCELLED');assert.equal(db.data('rentals',rental.id).refund_due,60);assert.equal(db.data('items','bike').reserved_rental_id,null);
 await settleRentalPayment(db,staff,rental.id,{requestKey:k('a'),rentalRefundAmount:60,paymentMethod:'CASH',notes:'Refund handed to customer'},at(5));
 assert.equal(db.data('rentals',rental.id).refund_due,0);const totals=(await financeSummary(db,{from:'2026-10-14',to:'2026-10-14'})).totals;assert.equal(totals.collections,60);assert.equal(totals.refunds,60);
});

test('an unsuccessful delivery with damage sends only the returned unit to maintenance',async()=>{
 const db=fixture(),{rental}=await createBooking(db,customer,input,now);await reviewBooking(db,staff,rental.id,{action:'APPROVE'},at(1));await prepareRentalDelivery(db,staff,rental.id,{inventoryCode:'bike-qr'},at(2));
 await updateLocalDelivery(db,staff,rental.id,{action:'DEPART',requestKey:k('d')},at(3));assert.equal(db.data('rentals',rental.id).hold_expires_at,null);
 await updateLocalDelivery(db,staff,rental.id,{action:'FAIL',requestKey:k('e'),reason:'Damaged before handoff'},at(4));
 await updateLocalDelivery(db,staff,rental.id,{action:'RETURN_TO_SHOP',requestKey:k('f'),physicalReceiptConfirmed:true,inventoryCode:'bike-qr',condition:'DAMAGED',notes:'Front brake damaged'},at(5));
 assert.equal(db.data('items','bike').status,'UNDER_MAINTENANCE');assert.equal(db.records('maintenance_records').length,1);assert.equal(db.data('rentals',rental.id).confirmed_rental_at,null);
});

test('date and page-size validation reject impossible dates and unbounded reads; calendar uses Philippine day',async()=>{
 const db=fixture();
 await assert.rejects(recordPage(db,'customers',{limit:0}),e=>e.status===400);
 await assert.rejects(recordPage(db,'rentals',{from:'2026-02-30'}),e=>e.status===400);
 await assert.rejects(financeSummary(db,{from:'2026-02-30',to:'2026-03-01'}),e=>e.status===400);
 await assert.rejects(ledgerPage(db,{limit:'1.5'}),e=>e.status===400);
 const {rental}=await createBooking(db,customer,{...input,scheduledStartAt:at(180).toISOString()},now);
 assert.equal((await recordPage(db,'rentals',{scheduledDay:'2026-10-14'})).records[0].id,rental.id);
 assert.equal((await recordPage(db,'rentals',{scheduledDay:'2026-10-13'})).records.length,0);
});

test('staff can assist a walk-in extension only with customer agreement, and old retries cannot request time twice',async()=>{
 const db=fixture(),rental=await active(db),operator={...staff,role:'OPERATOR'};
 const request={requestKey:k('c'),additionalMinutes:60,expectedAdditionalFee:100};
 await assert.rejects(requestRentalExtension(db,operator,rental.id,request,at(5)),e=>e.status===400);
 await requestRentalExtension(db,operator,rental.id,{...request,customerRequestedExtension:true},at(6));await reviewRentalExtension(db,staff,rental.id,{action:'APPROVE',requestKey:k('c')},at(7));
 await requestRentalExtension(db,customer,rental.id,{...request,requestKey:k('d')},at(8));await reviewRentalExtension(db,staff,rental.id,{action:'APPROVE',requestKey:k('d')},at(9));
 const due=db.data('rentals',rental.id).due_at;const replay=await requestRentalExtension(db,operator,rental.id,{...request,customerRequestedExtension:true},at(10));assert.equal(replay.duplicate,true);assert.equal(db.data('rentals',rental.id).due_at.getTime(),due.getTime());assert.equal(db.data('rentals',rental.id).extension_request.request_key,k('d'));assert.equal(db.records('payment_ledger').length,1);
});

test('web owner cookies and mobile operator tokens access the same ledger; customers cannot read or write it',async t=>{
 const db=fixture();for(const [id,role]of [['owner','OWNER'],['operator','OPERATOR'],['customer','CUSTOMER']])await db.collection('users').doc(id).set({full_name:id,is_active:true,role});
 await db.collection('customers').doc('legacyStaff').set({full_name:'Operator',is_active:true,auth_uid:'operator'});
 const {rental}=await createBooking(db,customer,input,now);
 const services=createFirebaseServices({db,now:()=>now,auth:{verifyIdToken:async uid=>({uid})}});services.health=async()=>{};
 const api=createApi({services,hardwareEnabled:false,expiryWorker:false,notificationWorker:false,sessions:{verify:async token=>token==='owner-cookie'?{uid:'owner'}:null}});api.listen(0,'127.0.0.1');await once(api,'listening');t.after(()=>new Promise(resolve=>api.close(resolve)));
 const url=`http://127.0.0.1:${api.address().port}/api`,ownerHeaders={cookie:'rent_play_session=owner-cookie'},operatorHeaders={authorization:'Bearer operator'};
 const expense=await fetch(url+'/finance/expenses',{method:'POST',headers:{...operatorHeaders,'content-type':'application/json'},body:JSON.stringify({requestKey:k('e'),amount:10,notes:'Actual supplies paid',category:'SUPPLIES',paymentMethod:'CASH'})});assert.equal(expense.status,201);
 const receipt=await fetch(url+`/rentals/${rental.id}/settlement`,{method:'POST',headers:{...ownerHeaders,'content-type':'application/json'},body:JSON.stringify({requestKey:k('f'),paymentAmount:40,notes:'Cash received in person'})});assert.equal(receipt.status,200);
 for(const headers of [ownerHeaders,operatorHeaders]){
   const res=await fetch(url+'/finance/summary?from=2026-10-14&to=2026-10-14',{headers});assert.equal(res.status,200);const summary=await res.json();assert.equal(summary.totals.cash_net_movement,30);
   const ledger=await fetch(url+'/finance/ledger?limit=25',{headers}).then(row=>row.json());assert.equal(ledger.entries.length,2);assert.ok(ledger.entries.every(row=>/^PAY-\d+$/.test(row.ledger_code)&&!row.fingerprint));
 }
 for(const path of ['/finance/summary','/finance/ledger','/records/customers','/records/maintenance','/reports/daily'])assert.equal((await fetch(url+path,{headers:{authorization:'Bearer customer'}})).status,401);
 assert.equal((await fetch(url+'/finance/expenses',{method:'POST',headers:{authorization:'Bearer customer','content-type':'application/json'},body:'{}'})).status,401);
 const page=await fetch(url+'/records/customers',{headers:operatorHeaders}).then(row=>row.json());assert.deepEqual(page.records.map(row=>row.id),['customer']);assert.equal(db.data('rentals',rental.id).status,'PENDING_ADMIN_APPROVAL');
});

test('historical missing dates do not erase customer counts or invent daily receipts, and missing charges stay flagged',async()=>{
 const db=fixture();await db.collection('rentals').doc('legacy').set({customer_id:'customer',item_id:'bike',status:'COMPLETED'});await projectRentalSummary(db,'legacy',now);
 assert.equal(db.data('customer_report_summaries','customer').rentals,1);assert.equal(db.data('customer_report_summaries','customer').completed,1);assert.equal(db.records('rental_daily').length,0);assert.equal(db.records('payment_ledger').length,0);
 await db.collection('rentals').doc('legacy').update({confirmed_rental_at:now});await projectRentalSummary(db,'legacy',now);
 assert.equal((await rentalDailySummary(db,'2026-10-14','2026-10-14')).totals.unknown_charges,1);
});

test('a real legacy deposit refund is journaled without adding deposit charges to current rentals',async()=>{
 const db=fixture(),rental=await active(db);await db.collection('rentals').doc(rental.id).update({status:'CANCELLED',deposit_collected_amount:20,deposit_refunded_amount:0});
 await settleRentalPayment(db,staff,rental.id,{requestKey:k('e'),depositRefundAmount:20,notes:'Historical cash deposit physically returned'},at(5));
 assert.equal((await financeSummary(db,{from:'2026-10-14',to:'2026-10-14'})).totals.refunds,20);assert.equal(db.data('items','bike').status,'RENTED');
});
