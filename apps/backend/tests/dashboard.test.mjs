import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseDate,rentalStatus,revenueWeeks,loadDashboard} from '../src/dashboard.mjs';

test('due alerts use Philippine time and never mark pending requests overdue',()=>{
  const now=new Date('2026-09-15T04:00:00Z');
  assert.equal(databaseDate('2026-09-15 12:00:00.000').toISOString(),now.toISOString());
  assert.equal(rentalStatus({status:'ACTIVE',due_at:'2026-09-15 10:00:00'},now),'Overdue');
  assert.equal(rentalStatus({status:'ACTIVE',due_at:'2026-09-15 18:00:00'},now),'Due today');
  assert.equal(rentalStatus({status:'ACTIVE',due_at:'2026-09-16 01:00:00'},now),'Active');
  assert.equal(rentalStatus({status:'PENDING_VERIFICATION',due_at:'2026-09-14 01:00:00'},now),'Pending');
});
test('weekly fee buckets respect Monday midnight in Manila and exclude pending requests',()=>{
  const rows=[
    {status:'COMPLETED',confirmed_rental_at:'2026-09-13 23:59:59',rental_fee:100},
    {status:'ACTIVE',confirmed_rental_at:'2026-09-14 00:00:00',rental_fee:200},
    {status:'ACTIVE',confirmed_rental_at:'2026-09-15 12:00:00',rental_fee:350},
    {status:'PENDING_VERIFICATION',confirmed_rental_at:null,rental_fee:999}
  ];
  assert.deepEqual(revenueWeeks(rows,new Date('2026-09-15T12:00:00+08:00')),
    {'This week':[200,350,0,0,0,0,0],'Last week':[0,0,0,0,0,0,100]});
});
test('an empty database produces zero cards and empty lists rather than sample records',async()=>{
  const db=(await import('./support/memory-firestore.mjs')).memoryFirestore();
  const result=await loadDashboard(db,new Date('2026-09-15T12:00:00+08:00'));
  assert.deepEqual(result.stats,{active:0,available:0,dueToday:0,overdue:0,fees:0});
  assert.deepEqual(result.rentals,[]);assert.deepEqual(result.items,[]);
  assert.deepEqual(result.revenue['This week'],[0,0,0,0,0,0,0]);
  assert.deepEqual(result.collections,{
    businessDay:'2026-09-15',
    total:0,
    cash:0,
    qr:0,
    refunds:0,
    expenses:0,
    netCollected:0,
    netAfterExpenses:0,
    cashNetMovement:0,
    entryCount:0
  });
});

test('dashboard exposes dated fee and rental history with a real coverage start for the pulse', async () => {
  const { memoryFirestore } = await import('./support/memory-firestore.mjs');
  const db = memoryFirestore({
    items: { one: { name:'Bicycle', is_active:true, status:'AVAILABLE', created_at:'2026-09-01T00:00:00+08:00' } },
    rental_daily: { '2026-09-14': { business_day:'2026-09-14', rentals:4, fees:800 } }
  });
  const result = await loadDashboard(db, new Date('2026-09-15T12:00:00+08:00'));
  assert.equal(result.analyticsHistory.coverageStart, '2026-09-01');
  assert.deepEqual(result.analyticsHistory.daily, [{ date:'2026-09-14', fees:800, rentals:4 }]);
});

test('dashboard reports active demo metadata separately from actual current inventory', async () => {
  const {memoryFirestore}=await import('./support/memory-firestore.mjs');
  const db=memoryFirestore({report_summary_state:{presentation_demo:{active:true,status:'ready',record_count:293}}});
  const result=await loadDashboard(db,new Date('2026-11-09T00:00:00+08:00'));
  assert.equal(result.demo_data.record_count,293);
  assert.equal(result.stats.active,0);
  assert.equal(result.items.length,0);
});
test('loadDashboard exposes Manila business-day Cash vs QR collections and drawer movement',async()=>{
  const {memoryFirestore}=await import('./support/memory-firestore.mjs');
  const db=memoryFirestore({
    financial_daily:{
      '2026-09-14':{business_day:'2026-09-14',collections:900,cash_collections:900,qr_collections:0,entry_count:3},
      '2026-09-15':{business_day:'2026-09-15',collections:1250,cash_collections:500,qr_collections:750,refunds:50,cash_refunds:50,expenses:120,cash_expenses:120,entry_count:4}
    }
  });
  const result=await loadDashboard(db,new Date('2026-09-14T16:30:00Z')); // 2026-09-15 00:30 Manila
  assert.deepEqual(result.collections,{
    businessDay:'2026-09-15',
    total:1250,
    cash:500,
    qr:750,
    refunds:50,
    expenses:120,
    netCollected:1200,
    netAfterExpenses:1080,
    cashNetMovement:330,
    entryCount:4
  });
});
