import test from 'node:test';
import assert from 'node:assert/strict';
import { planPresentationDemo, demoFingerprint } from '../src/presentation-demo.mjs';
import { encodeSupabaseValue, decodeSupabaseValue } from '../src/supabase.mjs';

const now = new Date('2026-11-09T00:00:00+08:00');
const input = { now, days:49,
  items:Array.from({length:10}, (_, i)=>({ id:'unit-'+i, name:'Bicycle', item_code:'EQUIP-'+i, status:'AVAILABLE', is_active:true, pricing_product_id:'bike', created_at:new Date('2026-09-01') })),
  customers:[{id:'one',full_name:'Test one'},{id:'two',full_name:'Test two'}],
  pricing:{products:[{id:'bike',name:'Bicycle',overtime_rate_per_hour:100,rate_options:[{id:'hour',kind:'HOURLY',label:'Per hour',amount:100,duration_minutes:60}]}]} };

test('presentation records are deterministic, completed, tagged and use existing references without changing inputs', () => {
  const before = structuredClone(input), a=planPresentationDemo(input), b=planPresentationDemo(input);
  assert.deepEqual(input,before);
  assert.deepEqual(a,b);
  assert.equal(a.days,49);
  assert.equal(new Set(a.rentals.map(row=>row.id)).size,a.rentals.length);
  assert.ok(a.rentals.length>200);
  for(const row of a.rentals) {
    assert.ok(row.is_demo && row.demo_batch_id===a.batchId);
    assert.equal(row.status,'COMPLETED');
    assert.ok(input.items.some(item=>item.id===row.item_id));
    assert.ok(input.customers.some(customer=>customer.id===row.customer_id));
    assert.ok(row.confirmed_rental_at<row.received_at && row.received_at<now);
    assert.equal(row.rental_paid_amount,0);
    assert.equal(row.rental_fee,row.fee_breakdown.rate_components[0].total_amount);
    assert.equal(row.balance_due,row.fee_breakdown.final_rental_charges);
  }
});

test('demo allocation respects stock creation, existing custody and generated non-overlapping intervals', () => {
  const existing={ item_id:'unit-0',status:'ACTIVE',confirmed_rental_at:new Date('2026-09-01') };
  const items=structuredClone(input.items);items[1].created_at=new Date('2026-11-01');items[2].is_active=false;items[3].status='UNDER_MAINTENANCE';
  const plan=planPresentationDemo({...input,items,existingRentals:[existing]});
  const occupied=new Map();
  for(const row of plan.rentals) {
    assert.ok(!['unit-0','unit-2','unit-3'].includes(row.item_id));
    assert.ok(row.confirmed_rental_at>=items.find(item=>item.id===row.item_id).created_at);
    const intervals=occupied.get(row.item_id)||[];
    assert.ok(intervals.every(([left,right])=>row.received_at<=left || row.confirmed_rental_at>=right));
    intervals.push([row.confirmed_rental_at,row.received_at]);occupied.set(row.item_id,intervals);
  }
});

test('demo recovery fingerprint survives Supabase JSON ordering and detects meaningful edits', () => {
  const row=planPresentationDemo(input).rentals[0];
  const decoded=decodeSupabaseValue(JSON.parse(JSON.stringify(encodeSupabaseValue(row))));
  decoded.fee_breakdown=Object.fromEntries(Object.entries(decoded.fee_breakdown).reverse());
  assert.equal(demoFingerprint(decoded),row.seed_fingerprint);
  decoded.rental_paid_amount=1;
  assert.notEqual(demoFingerprint(decoded),row.seed_fingerprint);
  assert.throws(()=>planPresentationDemo({...input,customers:[]}),/test customer/);
});
