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
  const db={collection:()=>({get:async()=>({docs:[]})})};
  const result=await loadDashboard(db,new Date('2026-09-15T12:00:00+08:00'));
  assert.deepEqual(result.stats,{active:0,available:0,dueToday:0,overdue:0,fees:0});
  assert.deepEqual(result.rentals,[]);assert.deepEqual(result.items,[]);
  assert.deepEqual(result.revenue['This week'],[0,0,0,0,0,0,0]);
});
