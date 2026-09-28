import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsRange,calculateAnalytics,manilaDateKey,recordDate,analyticsCsv} from '../src/analytics.js';

const now=new Date('2026-09-25T03:00:00Z');
const fixture={
  categories:[{id:'c1',name:'Sports'},{id:'c2',name:'Games'}],
  items:[
    {id:'i1',name:'Basketball',item_code:'B-1',category_id:'c1',status:'RENTED',is_active:true},
    {id:'i2',name:'Board game',item_code:'G-1',category_id:'c2',status:'AVAILABLE',is_active:true},
    {id:'i3',name:'Net',item_code:'N-1',category_id:'c1',status:'UNDER_MAINTENANCE',is_active:true},
    {id:'i4',name:'Retired game',item_code:'G-2',category_id:'c2',status:'INACTIVE',is_active:false},
    {id:'i5',name:'Volleyball',item_code:'V-1',category_id:'c1',status:'RESERVED_PENDING',is_active:true}
  ],
  transactions:[
    {id:'r1',rental_code:'R-1',item_id:'i1',customer_id:'u1',status:'ACTIVE',confirmed_rental_at:'2026-09-18T16:05:00Z',due_at:'2026-09-24 10:00:00.000',rental_fee:100,deposit_amount:500},
    {id:'r2',rental_code:'R-2',item_id:'i1',customer_id:'u1',status:'COMPLETED',confirmed_rental_at:'2026-09-22 09:00:00.000',confirmed_return_at:'2026-09-24 09:00:00.000',due_at:'2026-09-25 09:00:00.000',rental_fee:200,deposit_amount:500},
    {id:'r3',rental_code:'R-3',item_id:'i2',customer_id:'u2',status:'COMPLETED',confirmed_rental_at:'2026-09-23 09:00:00.000',confirmed_return_at:'2026-09-25 09:00:00.000',due_at:'2026-09-24 09:00:00.000',rental_fee:300,deposit_amount:800},
    {id:'r4',rental_code:'R-4',item_id:'i5',customer_id:'u3',status:'PENDING_VERIFICATION',confirmed_rental_at:null,due_at:'2026-09-27 09:00:00.000',rental_fee:900,deposit_amount:1000},
    {id:'r5',rental_code:'R-5',item_id:'i2',customer_id:'u2',status:'CANCELLED',confirmed_rental_at:'2026-09-23 10:00:00.000',rental_fee:700,deposit_amount:1000},
    {id:'r6',rental_code:'R-6',item_id:'i1',customer_id:'u3',status:'COMPLETED',confirmed_rental_at:'2026-09-18 09:00:00.000',confirmed_return_at:'2026-09-23 09:00:00.000',due_at:'2026-09-24 09:00:00.000',rental_fee:50,deposit_amount:0}
  ],
  maintenance:[
    {item_id:'i3',status:'IN_PROGRESS',started_at:'2026-09-20 10:00:00.000'},
    {item_id:'i3',status:'COMPLETED',started_at:'2026-09-18 10:00:00.000'}
  ]
};

test('Philippine calendar boundaries and date validation',()=>{
  assert.equal(manilaDateKey('2026-09-18T16:05:00Z'),'2026-09-19');
  assert.equal(manilaDateKey('2026-09-18 23:59:00.000'),'2026-09-18');
  assert.equal(recordDate('not a date'),null);
  assert.deepEqual(analyticsRange({period:'7d'},now),{from:'2026-09-19',to:'2026-09-25',days:7,label:'Sep 19, 2026 – Sep 25, 2026'});
  assert.equal(analyticsRange({period:'custom',from:'2026-09-31',to:'2026-09-25'},now).error!==undefined,true);
  assert.equal(analyticsRange({period:'custom',from:'2026-09-24',to:'2026-09-26'},now).error!==undefined,true);
  assert.equal(analyticsRange({period:'custom',from:'2025-01-01',to:'2026-09-25'},now).error!==undefined,true);
});

test('confirmed fees exclude deposits and pending/cancelled rentals',()=>{
  const result=calculateAnalytics(fixture,{period:'7d'},now);
  assert.equal(result.totals.fees,600);
  assert.equal(result.totals.rentals,3);
  assert.equal(result.totals.averageFee,200);
  assert.equal(result.totals.returns,3);
  assert.equal(result.totals.onTimeReturns,2);
  assert.equal(result.totals.onTimeSamples,3);
  assert.equal(result.totals.onTimeRate,2/3);
  assert.equal(result.totals.overdueNow,1);
  assert.equal(result.totals.repeatCustomers,1);
  assert.equal(result.totals.repeatCustomerRate,.5);
  assert.equal(result.totals.maintenanceStarted,1);
  assert.deepEqual(result.equipmentStatus,{Available:1,Rented:1,Pending:1,Maintenance:1,Archived:1});
  assert.deepEqual(result.categoryRevenue.map(({name,fees})=>[name,fees]),[['Sports',300],['Games',300]]);
  assert.deepEqual(result.equipment.map(({id,rentals})=>[id,rentals]),[['i1',2],['i2',1]]);
  assert.equal(result.trend.reduce((sum,bucket)=>sum+bucket.fees,0),600);
  assert.equal(result.trend[0].rentals,1);
});

test('category and equipment filters apply consistently',()=>{
  const category=calculateAnalytics(fixture,{period:'7d',categoryId:'c1'},now);
  assert.equal(category.totals.fees,300);
  assert.equal(category.totals.rentals,2);
  assert.equal(category.totals.returns,2);
  assert.equal(category.totals.maintenanceStarted,1);
  assert.deepEqual(category.equipmentStatus,{Available:0,Rented:1,Pending:1,Maintenance:1,Archived:0});
  const equipment=calculateAnalytics(fixture,{period:'7d',categoryId:'c1',itemId:'i1'},now);
  assert.equal(equipment.totals.fees,300);
  assert.equal(equipment.totals.maintenanceStarted,0);
  assert.deepEqual(equipment.equipmentStatus,{Available:0,Rented:1,Pending:0,Maintenance:0,Archived:0});
});

test('empty reports have safe zero values and longer periods use weekly buckets',()=>{
  const empty=calculateAnalytics({items:[],transactions:[],maintenance:[],categories:[]},{period:'7d'},now);
  assert.equal(empty.totals.fees,0);
  assert.equal(empty.totals.onTimeRate,null);
  assert.equal(empty.totals.repeatCustomerRate,null);
  assert.equal(empty.trend.length,7);
  const longer=calculateAnalytics(fixture,{period:'90d'},now);
  assert.equal(longer.trend.length,14);
  assert.equal(longer.trend[1].from,'2026-06-29'); // Monday; first bucket is a partial week.
  assert.equal(longer.trend.reduce((sum,bucket)=>sum+bucket.rentals,0),4);
});

const operational={
  categories:[{id:'sports',name:'Sports'},{id:'games',name:'Games'}],
  items:[
    {id:'a',name:'Ball',item_code:'A',category_id:'sports',created_at:'2026-09-19',is_active:true,status:'RENTED'},
    {id:'b',name:'Board',item_code:'B',category_id:'games',created_at:'2026-09-21',is_active:true,status:'AVAILABLE'},
    {id:'c',name:'Unused set',item_code:'C',category_id:'sports',created_at:'2026-09-19',is_active:true,status:'UNDER_MAINTENANCE'},
    {id:'d',name:'Archived',item_code:'D',category_id:'sports',created_at:'2026-09-19',is_active:false,status:'INACTIVE'},
    {id:'future',name:'Added later',item_code:'E',category_id:'games',created_at:'2026-09-23',is_active:true,status:'AVAILABLE'}
  ],
  transactions:[
    {id:'before',item_id:'a',customer_id:'u1',status:'COMPLETED',confirmed_rental_at:'2026-09-19 12:00:00',confirmed_return_at:'2026-09-20 12:00:00',due_at:'2026-09-20 12:00:00',rental_fee:500},
    {id:'overlap',item_id:'a',customer_id:'u1',status:'COMPLETED',confirmed_rental_at:'2026-09-20 10:00:00',confirmed_return_at:'2026-09-21 12:00:00',due_at:'2026-09-21 10:00:00',rental_fee:100},
    {id:'active',item_id:'a',customer_id:'u1',status:'ACTIVE',confirmed_rental_at:'2026-09-21 20:00:00',due_at:'2026-09-21 22:00:00',rental_fee:50},
    {id:'board',item_id:'b',customer_id:'u2',status:'COMPLETED',confirmed_rental_at:'2026-09-21 06:00:00',confirmed_return_at:'2026-09-21 18:00:00',due_at:'2026-09-22 06:00:00',rental_fee:.1},
    {id:'archived',item_id:'d',customer_id:'u3',status:'COMPLETED',confirmed_rental_at:'2026-09-19 00:00:00',confirmed_return_at:'2026-09-22 00:00:00',due_at:'2026-09-22 00:00:00',rental_fee:100}
  ],
  statusHistory:[{item_id:'d',old_status:'AVAILABLE',new_status:'INACTIVE',changed_at:'2026-09-21 00:00:00'}],
  maintenance:[
    {item_id:'c',status:'COMPLETED',started_at:'2026-09-19 22:00:00',completed_at:'2026-09-20 06:00:00'},
    {item_id:'c',status:'COMPLETED',started_at:'2026-09-20 04:00:00',completed_at:'2026-09-20 10:00:00'},
    {item_id:'c',status:'IN_PROGRESS',started_at:'2026-09-21 12:00:00'}
  ],
  terminals:[{id:'t1',name:'Counter',terminal_code:'ESP-1'}],
  verification:[
    {id:'v1',rental_id:'overlap',terminal_id:'t1',status:'CONFIRMED',transaction_type:'RENTAL',requested_at:'2026-09-20 09:59:30',confirmed_at:'2026-09-20 10:00:00'},
    {id:'v2',rental_id:'overlap',terminal_id:'t1',status:'CONFIRMED',transaction_type:'RETURN',requested_at:'2026-09-21 11:58:00',confirmed_at:'2026-09-21 12:00:00'},
    {id:'v3',rental_id:'board',terminal_id:'t1',status:'CONFIRMED',transaction_type:'RENTAL',requested_at:'2026-09-21 05:59:00'},
    {id:'expired',rental_id:'overlap',terminal_id:'t1',status:'EXPIRED',requested_at:'2026-09-20 09:00:00',confirmed_at:'2026-09-20 10:00:00'},
    {id:'invalid',rental_id:'overlap',terminal_id:'t1',status:'CONFIRMED',requested_at:'2026-09-20 11:00:00',confirmed_at:'2026-09-20 10:00:00'},
    {id:'missing',rental_id:'overlap',terminal_id:'t1',status:'CONFIRMED',requested_at:'2026-09-20 09:00:00'},
    {id:'no-terminal',rental_id:'overlap',status:'CONFIRMED',requested_at:'2026-09-20 09:00:00',confirmed_at:'2026-09-20 10:00:00'}
  ]
};
const historical={period:'custom',from:'2026-09-20',to:'2026-09-21',groupBy:'daily'};

test('utilization merges overlapping rentals, clips boundaries and removes archived time',()=>{
  const result=calculateAnalytics(operational,historical,now),rows=new Map(result.performance.map(row=>[row.id,row]));
  assert.equal(rows.get('a').rentedHours,40);
  assert.equal(rows.get('a').observedHours,48);
  assert.equal(rows.get('a').utilization,40/48);
  assert.equal(rows.get('b').observedHours,24);
  assert.equal(rows.get('b').utilization,.5);
  assert.equal(rows.get('d').observedHours,24);
  assert.equal(rows.get('d').rentedHours,24);
  assert.equal(result.totals.utilization,76/144);
  assert.equal(rows.has('future'),false);
  assert.deepEqual(result.leastRented.map(row=>row.id),['c','b','a']);
  assert.equal(result.leastRented[0].rentals,0);
  assert.deepEqual(result.revenueEquipment.map(row=>row.fees),[150,.1]);
});

test('maintenance counts starts separately from merged downtime and respects historical cutoff',()=>{
  const result=calculateAnalytics(operational,historical,now);
  assert.equal(result.totals.maintenanceStarted,2);
  assert.equal(result.totals.downtimeHours,22);
  assert.equal(result.maintenanceFrequency[0].id,'c');
  assert.equal(result.maintenanceDowntime[0].downtimeHours,22);
});

test('overdue, on-time, duration and repeat rates have explicit independent samples',()=>{
  const {totals:t}=calculateAnalytics(operational,historical,now);
  assert.equal(t.dueRentals,3);
  assert.equal(t.overdueRate,2/3);
  assert.equal(t.onTimeRate,2/3);
  assert.equal(t.durationSamples,3);
  assert.equal(t.averageDurationHours,(24+26+12)/3);
  assert.equal(t.repeatCustomerRate,.5);
  assert.equal(t.fees,150.1);
  const filtered=calculateAnalytics(operational,{...historical,categoryId:'games'},now);
  assert.equal(filtered.totals.overdueRate,null);
  assert.equal(filtered.totals.onTimeRate,1);
  assert.equal(filtered.totals.averageDurationHours,12);
  assert.equal(filtered.totals.repeatCustomerRate,0);
});

test('terminal timing measures confirmed requests and supports only explicit linked event types',()=>{
  const result=calculateAnalytics(operational,historical,now);
  assert.equal(result.totals.verificationCount,3);
  assert.equal(result.totals.verificationSeconds,70);
  assert.equal(result.totals.verificationMedianSeconds,60);
  assert.equal(result.totals.verificationP95Seconds,114);
  assert.equal(result.linkedConfirmationTimes,1);
  assert.equal(result.terminalPerformance[0].code,'ESP-1');
  assert.equal(result.quality.find(row=>row.text.startsWith('confirmed verification')).count,3);
  assert.equal(calculateAnalytics(operational,{...historical,itemId:'b'},now).totals.verificationSeconds,60);
});

test('monthly trends use Philippine month boundaries and maintain cent precision',()=>{
  const data={transactions:[
    {item_id:'x',status:'COMPLETED',confirmed_rental_at:'2026-12-31T15:59:59Z',rental_fee:.1},
    {item_id:'x',status:'ACTIVE',confirmed_rental_at:'2026-12-31T16:00:00Z',rental_fee:.2},
    {item_id:'x',status:'ACTIVE',confirmed_rental_at:'2027-01-01 10:00:00',rental_fee:.1}
  ]};
  const result=calculateAnalytics(data,{period:'custom',from:'2026-12-30',to:'2027-01-02',groupBy:'monthly'},new Date('2027-01-10T00:00:00Z'));
  assert.deepEqual(result.trend.map(row=>[row.label,row.rentals,row.fees]),[['Dec 2026',1,.1],['Jan 2027',2,.3]]);
  assert.equal(result.totals.fees,.4);
  assert.equal(calculateAnalytics(data,{period:'365d'},new Date('2027-01-10T00:00:00Z')).groupBy,'monthly');
});

test('unavailable timestamps produce missing-data notes rather than invented averages',()=>{
  const data={items:[{id:'x',name:'Archived without history',is_active:false}],transactions:[{id:'r',item_id:'x',status:'COMPLETED',confirmed_return_at:'2026-09-21',rental_fee:100}],maintenance:[{item_id:'x',status:'COMPLETED',started_at:'2026-09-20'}]};
  const result=calculateAnalytics(data,historical,now);
  assert.equal(result.totals.averageDurationHours,null);
  assert.equal(result.totals.utilization,null);
  assert.equal(result.totals.verificationSeconds,null);
  assert.equal(result.totals.onTimeRate,null);
  assert.equal(result.totals.downtimeHours,0);
  assert.ok(result.quality.length>=4);
  assert.equal(recordDate('2026-02-30'),null);
  const future=calculateAnalytics({transactions:[{status:'ACTIVE',confirmed_rental_at:'2026-09-25 19:00:00',rental_fee:100}]},{period:'7d'},now);
  assert.equal(future.totals.rentals,0);
});

test('full CSV follows filters, preserves zeros and neutralizes spreadsheet formulas',()=>{
  const data=structuredClone(operational);data.items[2].name='  =HYPERLINK("bad")';
  const selection={...historical,categoryId:'sports'},result=calculateAnalytics(data,selection,now),csv=analyticsCsv(result,data,selection);
  assert.ok(csv.startsWith('\uFEFF'));
  for(const section of ['TREND','EQUIPMENT PERFORMANCE','CATEGORY FEES','TERMINAL VERIFICATION','DATA COVERAGE','CONFIRMED RENTALS'])assert.ok(csv.includes(section));
  assert.ok(csv.includes('"\'  =HYPERLINK(""bad"")"'));
  assert.ok(!csv.includes('"Board"'));
  assert.ok(csv.includes('"Average rental duration (hours)"'));
});
