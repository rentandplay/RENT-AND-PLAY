import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspace } from '../src/workspace.mjs';
import { createSupabaseFirestore, encodeSupabaseValue } from '../src/supabase.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';
import { calculateAnalytics } from '../../web/src/analytics.js';
import { calculateDetailedAnalytics } from '../../web/src/analytics-insights.js';

const now=new Date('2026-11-13T12:00:00Z');
const item={name:'Basketball',item_code:'BALL-001',is_active:true,status:'AVAILABLE',created_at:new Date('2023-01-01T00:00:00+08:00')};
const completed=(start,end,fee=100)=>({item_id:'ball',customer_id:'customer',status:'COMPLETED',rental_fee:fee,confirmed_rental_at:new Date(start),confirmed_return_at:new Date(end),due_at:new Date(end),created_at:new Date(start)});

test('Reports retains the full preceding 365-day period for comparisons',async()=>{
  const db=memoryFirestore({items:{ball:item},rentals:{
    previous:completed('2024-12-01T08:00:00+08:00','2024-12-01T09:00:00+08:00',100),
    current:completed('2026-05-01T08:00:00+08:00','2026-05-01T09:00:00+08:00',200)
  }});
  const selection={period:'custom',from:'2025-11-14',to:'2026-11-13',groupBy:'monthly'};
  const workspace=await loadWorkspace(db,'OWNER',now,{view:'Reports',filters:selection});
  const result=calculateDetailedAnalytics(workspace,selection,now);
  assert.equal(workspace.transactions.length,2);
  assert.equal(result.totals.rentals,1);
  assert.equal(result.comparison.previous.totals.rentals,1);
  assert.equal(result.comparison.previous.totals.fees,100);
  assert.equal(result.comparison.fees.percent,1,'200 versus 100 is a real 100% increase, not a zero-baseline artifact');
});

test('historical Reports retains pre-range carryovers, in-range returns, and today\'s overdue rentals',async()=>{
  const db=memoryFirestore({items:{ball:item},rentals:{
    carryover:completed('2025-08-01T00:00:00+08:00','2026-01-09T00:00:00+08:00',300),
    overdue:{item_id:'ball',customer_id:'customer',status:'ACTIVE',rental_fee:100,created_at:new Date('2026-10-01T00:00:00+08:00'),confirmed_rental_at:new Date('2026-10-01T00:00:00+08:00'),due_at:new Date('2026-10-02T00:00:00+08:00')},
    approved:{item_id:'ball',status:'APPROVED',created_at:new Date('2026-11-12T00:00:00+08:00')}
  }});
  const selection={period:'custom',from:'2026-01-01',to:'2026-01-31',groupBy:'daily'};
  const workspace=await loadWorkspace(db,'OWNER',now,{view:'Reports',filters:selection});
  const result=calculateAnalytics(workspace,selection,now);
  assert.deepEqual(new Set(workspace.transactions.map(row=>row.id)),new Set(['carryover','overdue','approved']));
  assert.equal(result.totals.rentals,0,'a pre-range handoff does not become a new rental');
  assert.equal(result.totals.returns,1,'a physical return inside the period remains measurable');
  assert.equal(result.totals.onTimeRate,1);
  assert.equal(result.totals.rentedHours,8*24,'the carryover contributes its clipped Jan 1–9 rental interval');
  assert.equal(result.totals.overdueNow,1,'live overdue is independent of the historical date filter');
  assert.equal(result.equipmentStatus.Pending,1,'unconfirmed approved rentals still inform the live availability snapshot');
});

test('Reports receives more than 1000 rentals through the actual Supabase aggregate adapter',async()=>{
  const rentals=Array.from({length:1205},(_,i)=>({id:`rental-${String(i).padStart(4,'0')}`,version:1,data:encodeSupabaseValue(completed('2024-01-01T08:00:00+08:00','2024-01-01T09:00:00+08:00'))}));
  const calls=[];
  const db=createSupabaseFirestore({url:'https://test.supabase.co',serviceRoleKey:'test-service-key',fetcher:async(url,options)=>{
    const method=url.split('/').at(-1),body=JSON.parse(options.body);calls.push({method,body});
    const payload=method==='app_get_doc'?{exists:false}:body.p_collection==='rentals'?rentals:body.p_collection==='items'?[{id:'ball',version:1,data:encodeSupabaseValue(item)}]:[];
    return {ok:true,status:200,json:async()=>payload};
  }});
  const workspace=await loadWorkspace(db,'OWNER',now,{view:'Reports',filters:{from:'2026-01-01',to:'2026-01-31'}});
  assert.equal(workspace.transactions.length,1205);
  assert.ok(workspace.transactions.some(row=>row.id==='rental-0000'));
  assert.ok(workspace.transactions.some(row=>row.id==='rental-1204'));
  assert.equal(workspace.transactions[0].confirmed_rental_at,'2024-01-01 08:00:00.000');
  const reads=calls.filter(row=>row.method==='app_list_docs'&&row.body.p_collection==='rentals');
  assert.equal(reads.length,1);
  assert.deepEqual(reads[0].body,{p_collection:'rentals'},'the aggregate endpoint has no page limit');
});
