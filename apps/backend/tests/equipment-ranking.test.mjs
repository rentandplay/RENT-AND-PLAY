import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {memoryFirestore} from './support/memory-firestore.mjs';
import {projectRentalSummary} from '../src/report-summaries.mjs';
import {equipmentRentalRanking} from '../src/equipment-ranking.mjs';
import {loadWorkspace} from '../src/workspace.mjs';
import {createApi,createFirebaseServices} from '../src/server.mjs';

const now=new Date('2026-10-15T04:00:00Z'),date=new Date('2026-10-07T02:00:00Z');
const items={bike:{name:'Bicycle',stock_group_id:'bike',is_active:true},sibling:{name:'Bicycle',stock_group_id:'bike',is_active:false},ball:{name:'Basketball',is_active:true}};
function fixture(){
  const rentals={};
  for(let i=0;i<12;i++)rentals['r'+String(i).padStart(2,'0')]={rental_code:'R-'+String(i+1).padStart(4,'0'),item_id:i<9?(i%2?'sibling':'bike'):'ball',status:i<5?'REJECTED':i<11?'COMPLETED':'APPROVED',created_at:date,confirmed_rental_at:date,rental_fee:100};
  return memoryFirestore({items,rentals,users:{owner:{role:'OWNER',is_active:true},operator:{role:'OPERATOR',is_active:true}}});
}
const project=async db=>{for(const row of db.records('rentals'))await projectRentalSummary(db,row.id,now);};
const rank=db=>equipmentRentalRanking(db,db.records('items'),{},now);

test('ranking includes confirmed rentals beyond every five-record page and combines archived sibling units',async()=>{
  const db=fixture();await project(db);
  const first=await loadWorkspace(db,'OWNER',now,{view:'Transaction History'});
  assert.equal(first.transactions.length,5);assert.ok(first.transactions.every(row=>row.status==='REJECTED'));
  assert.equal(first.rental_ranking.total_rentals,6);
  assert.deepEqual(first.rental_ranking.rows.map(row=>[row.name,row.rentals]),[['Bicycle',4],['Basketball',2]]);
  const next=await loadWorkspace(db,'OWNER',now,{view:'Transaction History',filters:{cursor:first.page_meta.nextCursor}});
  assert.deepEqual(next.rental_ranking,first.rental_ranking);
  const report=await loadWorkspace(db,'OWNER',now,{view:'Reports',filters:{from:'2026-10-01',to:'2026-10-15'}});
  assert.equal(report.page_meta,null);assert.equal(report.view_meta.view,'Reports');
  assert.equal(report.transactions.filter(row=>row.status==='COMPLETED').length,6);
});

test('corrections, reassignment and deletion reverse their old counts once without altering rentals or payments',async()=>{
  const db=fixture();await project(db);await project(db);assert.equal((await rank(db)).total_rentals,6);
  await db.collection('rentals').doc('r05').update({status:'REJECTED'});await projectRentalSummary(db,'r05',now);
  await db.collection('rentals').doc('r06').update({item_id:'ball'});await projectRentalSummary(db,'r06',now);
  const batch=db.batch();batch.delete(db.collection('rentals').doc('r07'));await batch.commit();
  await projectRentalSummary(db,'r07',now);await projectRentalSummary(db,'r07',now);
  assert.deepEqual((await rank(db)).rows.map(row=>[row.name,row.rentals]),[['Basketball',3],['Bicycle',1]]);
  assert.equal(db.records('payment_ledger').length,0);
});

test('ranking periods use Manila confirmation dates and ignore requests, missing dates and future confirmations',async()=>{
  const db=memoryFirestore({items,rentals:{
    before:{item_id:'bike',status:'COMPLETED',confirmed_rental_at:new Date('2026-10-07T15:59:59Z')},
    after:{item_id:'ball',status:'COMPLETED',confirmed_rental_at:new Date('2026-10-07T16:00:00Z')},
    missing:{item_id:'bike',status:'COMPLETED'},
    expired:{item_id:'bike',status:'EXPIRED',confirmed_rental_at:date},
    future:{item_id:'bike',status:'ACTIVE',confirmed_rental_at:new Date('2026-10-20T00:00:00Z')}
  }});await project(db);
  const first=await equipmentRentalRanking(db,db.records('items'),{from:'2026-10-07',to:'2026-10-07'},now);
  const next=await equipmentRentalRanking(db,db.records('items'),{from:'2026-10-08',to:'2026-10-08'},now);
  assert.deepEqual(first.rows.map(row=>row.name),['Bicycle']);assert.deepEqual(next.rows.map(row=>row.name),['Basketball']);
  assert.equal((await rank(db)).total_rentals,2);
});

test('equal counts use equipment names, remain correct after renaming, and read only derived summaries',async()=>{
  const db=fixture();await project(db);
  for(const id of ['r05','r06']){await db.collection('rentals').doc(id).update({status:'REJECTED'});await projectRentalSummary(db,id,now);}
  const reader={collection:name=>{assert.notEqual(name,'rentals');return db.collection(name);}};
  const first=await equipmentRentalRanking(reader,db.records('items'),{},now);
  assert.deepEqual(first.rows.map(row=>row.name),['Basketball','Bicycle']);
  await db.collection('items').doc('bike').update({name:'A bicycle'});
  assert.equal((await rank(db)).rows[0].name,'A bicycle');
  await assert.rejects(equipmentRentalRanking(db,[],{from:'2026-10-20',to:'2026-10-01'},now));
});

test('web owner and mobile operator receive the same full ranking through their protected workspace',async t=>{
  const db=fixture();await project(db);
  const services=createFirebaseServices({db,now:()=>now,auth:{verifyIdToken:async uid=>({uid})}});
  const server=createApi({services,expiryWorker:false,notificationWorker:false,sessions:{verify:async()=>({uid:'owner'})}});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api/workspace?view=Transaction%20History`;
  const web=await fetch(url).then(res=>res.json()),mobile=await fetch(url,{headers:{authorization:'Bearer operator'}}).then(res=>res.json());
  assert.equal(web.transactions.length,5);assert.equal(mobile.rental_ranking.total_rentals,6);
  assert.deepEqual(mobile.rental_ranking,web.rental_ranking);
});

test('a queued projection repair invalidates the cached ranking immediately',async()=>{
  const db=fixture();await project(db);
  const services=createFirebaseServices({db,now:()=>now});
  assert.equal((await services.workspace('OWNER',{view:'Transaction History'})).rental_ranking.total_rentals,6);
  await db.collection('rentals').doc('r11').update({status:'COMPLETED'});
  await db.collection('report_jobs').doc('r11').set({rental_id:'r11'});
  await services.processReportJobs();
  assert.equal((await services.workspace('OWNER',{view:'Transaction History'})).rental_ranking.total_rentals,7);
});
