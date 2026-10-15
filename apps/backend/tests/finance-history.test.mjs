import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFirestore } from './support/memory-firestore.mjs';
import { financeSummary, ledgerPage } from '../src/payment-ledger.mjs';
import { financeRentalPage, confirmHistoricalReceipt } from '../src/finance-rentals.mjs';
import { projectRentalSummary } from '../src/report-summaries.mjs';
import { settleRentalPayment } from '../src/rental-flow.mjs';
import { createApi, createFirebaseServices } from '../src/server.mjs';
import { once } from 'node:events';
import { recordPage } from '../src/record-pages.mjs';
import { mobileRentalList } from '../src/mobile.mjs';

const created = new Date('2026-10-08T02:00:00Z'), now = new Date('2026-10-15T02:00:00Z');
const staff = {id:'owner',full_name:'Owner'};
const rental = {rental_code:'R-0004',status:'COMPLETED',customer_id:'customer',customer_name:'Customer',item_name:'Basketball',rental_fee:50,rental_paid_amount:50,rental_refunded_amount:0,payment_method:'CASH',fee_breakdown:{final_rental_charges:300},created_at:created,confirmed_rental_at:created};
const receipt = {requestKey:'a'.repeat(32),amount:50,paymentMethod:'CASH',occurredAt:'2026-10-08T02:01:00Z',notes:'Original cash receipt verified',confirmed:true};
const fixture = () => memoryFirestore({rentals:{legacy:rental}});
const summary = db => financeSummary(db,{from:'2026-10-01',to:'2026-10-15'},now);

test('five-record pages reach every rental, customer, maintenance and ledger record without duplicates',async()=>{
  const records=Object.fromEntries(Array.from({length:12},(_,i)=>[`record_${String(i).padStart(2,'0')}`,{...rental,occurred_at:new Date(created.getTime()+i*1000)}]));
  const db=memoryFirestore({rentals:records,customers:records,maintenance_records:records,payment_ledger:records});
  for(const kind of ['rentals','customers','maintenance','ledger','finance']){
    let cursor,seen=[],sizes=[];
    do{
      const page=kind==='ledger'?await ledgerPage(db,{cursor}):kind==='finance'?await financeRentalPage(db,{cursor}):await recordPage(db,kind,{cursor});
      const rows=page.entries||page.records;
      sizes.push(rows.length);seen.push(...rows.map(row=>row.id));cursor=page.nextCursor;
      assert.ok(sizes.length<=3,'pagination must terminate');
    }while(cursor);
    assert.deepEqual(sizes,[5,5,2]);assert.equal(new Set(seen).size,12);
  }
});

test('mobile history loads five at a time while all active rentals stay visible',async()=>{
  const records=Object.fromEntries(Array.from({length:12},(_,i)=>[`history_${String(i).padStart(2,'0')}`,rental]));
  for(let i=0;i<6;i++)records[`active_${i}`]={...rental,status:'ACTIVE'};
  const db=memoryFirestore({rentals:records});
  const options={},first=await mobileRentalList(db,{id:'customer'},'',options);
  assert.equal(first.rentals.filter(row=>row.status==='ACTIVE').length,6);
  assert.equal(first.rentals.filter(row=>row.status==='COMPLETED').length,5);
  const seen=first.rentals.filter(row=>row.status==='COMPLETED').map(row=>row.id);
  let cursor=first.nextCursor;
  while(cursor){const page=await mobileRentalList(db,{id:'customer'},'',{cursor});assert.ok(page.rentals.length<=5);seen.push(...page.rentals.map(row=>row.id));cursor=page.nextCursor;assert.ok(seen.length<=12);}
  assert.equal(new Set(seen).size,12);
});

test('historical rental payments appear separately from dated collections without fabricating receipts',async()=>{
  const db=fixture();await projectRentalSummary(db,'legacy',now);
  const totals=await summary(db);
  assert.equal(totals.rental_totals.charges,300);assert.equal(totals.rental_totals.saved_paid,50);
  assert.equal(totals.rental_totals.balance_due,250);assert.equal(totals.rental_totals.unposted_paid,50);
  assert.equal(totals.totals.collections,0);assert.equal(db.records('payment_ledger').length,0);
  const page=await financeRentalPage(db,{from:'2026-10-01',to:'2026-10-15'});
  assert.equal(page.records[0].finance.receipt_status,'RECEIPT_DATE_NEEDED');
  await projectRentalSummary(db,'legacy',now);assert.equal((await summary(db)).rental_totals.saved_paid,50);
});

test('historical confirmation journals its original day once and never increases rental paid amounts',async()=>{
  const db=fixture();await confirmHistoricalReceipt(db,staff,'legacy',receipt,now);await projectRentalSummary(db,'legacy',now);
  assert.equal(db.data('rentals','legacy').rental_paid_amount,50);assert.equal(db.data('rentals','legacy').status,'COMPLETED');
  const entries=await ledgerPage(db,{from:'2026-10-08',to:'2026-10-08'});
  assert.equal(entries.entries.length,1);assert.equal(entries.entries[0].occurred_at,receipt.occurredAt.replace('Z','.000Z'));
  assert.equal(entries.entries[0].recorded_at,now.toISOString());
  assert.equal((await summary(db)).rental_totals.unposted_paid,0);
  assert.equal((await confirmHistoricalReceipt(db,staff,'legacy',receipt,now)).duplicate,true);
  await assert.rejects(confirmHistoricalReceipt(db,staff,'legacy',{...receipt,requestKey:'b'.repeat(32)},now),error=>error.status===409);
  await settleRentalPayment(db,staff,'legacy',{requestKey:'c'.repeat(32),paymentAmount:100,paymentMethod:'CASH',notes:'Balance paid today'},now);
  await projectRentalSummary(db,'legacy',now);
  assert.equal(db.data('rentals','legacy').rental_paid_amount,150);assert.equal((await summary(db)).rental_totals.unposted_paid,0);
  assert.equal((await financeSummary(db,{from:'2026-10-15',to:'2026-10-15'},now)).totals.collections,100);
});

test('historical confirmation rejects guessed dates, stale amounts and QR receipts without evidence',async()=>{
  const db=fixture();
  for(const patch of [{amount:300},{confirmed:false},{occurredAt:'2026-10-20T00:00:00Z'},{occurredAt:'2026-10-01T00:00:00Z'},{paymentMethod:'QR',reference:''}]) {
    await assert.rejects(confirmHistoricalReceipt(db,staff,'legacy',{...receipt,...patch},now));
  }
  assert.equal(db.records('payment_ledger').length,0);
  const results=await Promise.allSettled(['a','b'].map(key=>confirmHistoricalReceipt(db,staff,'legacy',{...receipt,requestKey:key.repeat(32)},now)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(db.records('payment_ledger').length,1);
});

test('removing an incorrect rental reverses both charge and financial projections exactly once',async()=>{
  const db=fixture();await projectRentalSummary(db,'legacy',now);
  const batch=db.batch();batch.delete(db.collection('rentals').doc('legacy'));await batch.commit();
  await projectRentalSummary(db,'legacy',now);await projectRentalSummary(db,'legacy',now);
  assert.equal((await summary(db)).rental_totals.charges,0);assert.equal((await summary(db)).rental_totals.saved_paid,0);
  assert.equal(db.data('rental_daily','2026-10-08').final_charges,0);assert.equal(db.data('customer_report_summaries','customer').rentals,0);
});

test('missing historical payment amounts remain unknown and rental payment pages stay bounded',async()=>{
  const db=fixture();await db.collection('rentals').doc('unknown').set({...rental,rental_code:'R-0005',rental_paid_amount:null});
  await projectRentalSummary(db,'unknown',now);
  assert.equal((await summary(db)).rental_totals.unknown_payments,1);
  const first=await financeRentalPage(db,{limit:1});assert.equal(first.records.length,1);assert.ok(first.nextCursor);
  const next=await financeRentalPage(db,{limit:1,cursor:first.nextCursor});assert.equal(next.records.length,1);
  assert.equal(next.records[0].finance.saved_paid,null);
});

test('owner and mobile operator share historical receipts and freshly invalidated financial summaries',async t=>{
  const db=fixture();for(const [id,role] of [['owner','OWNER'],['operator','OPERATOR']])await db.collection('users').doc(id).set({full_name:id,role,is_active:true});
  await projectRentalSummary(db,'legacy',now);
  const services=createFirebaseServices({db,now:()=>now,auth:{verifyIdToken:async uid=>({uid})}});
  const server=createApi({services,expiryWorker:false,notificationWorker:false,sessions:{verify:async()=>({uid:'owner'})}});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api/finance`,query='?from=2026-10-01&to=2026-10-15';
  const before=await fetch(base+'/summary'+query).then(res=>res.json());assert.equal(before.rental_totals.unposted_paid,50);
  const posted=await fetch(base+'/rentals/legacy/receipt-history',{method:'POST',headers:{authorization:'Bearer operator','content-type':'application/json'},body:JSON.stringify(receipt)});
  assert.equal(posted.status,200);assert.equal(db.data('rentals','legacy').rental_paid_amount,50);
  const after=await fetch(base+'/summary'+query).then(res=>res.json());assert.equal(after.rental_totals.unposted_paid,0);assert.equal(after.totals.collections,50);
  const page=await fetch(base+'/rentals'+query,{headers:{authorization:'Bearer operator'}}).then(res=>res.json());assert.equal(page.records[0].finance.receipt_status,'RECORDED');
});
