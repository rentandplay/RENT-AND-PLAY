import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createItem, inventoryList, setItemQuantity, updateItem } from '../src/inventory.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const input={categoryId:'sports',name:'Rental bike',description:'Bike for rent',condition:'GOOD',rateType:'HOURLY',rentalRate:50,latePenalty:10,quantity:3};

test('stock quantity keeps physical unit history and protects rented units',async()=>{
  const db=memoryFirestore({item_categories:{sports:{name:'Sports'}}});
  const created=await createItem(db,'admin',input),groupId=created.stock_group_id;
  let units=(await inventoryList(db)).items.filter(item=>item.stock_group_id===groupId);
  assert.equal(units.length,3);
  assert.ok(units.every(item=>item.available_quantity===3&&item.total_quantity===3));

  await setItemQuantity(db,'admin',groupId,{quantity:2,version:units[0].updated_at});
  units=(await inventoryList(db)).items.filter(item=>item.stock_group_id===groupId);
  assert.equal(units.filter(item=>item.is_active!==false).length,2);
  assert.ok(units.every(item=>item.available_quantity===2&&item.total_quantity===2));

  const rented=units.find(item=>item.is_active!==false);
  await db.collection('items').doc(rented.id).update({status:'RENTED',current_rental_id:'active-rental'});
  await db.collection('rentals').doc('active-rental').set({item_id:rented.id,status:'ACTIVE'});
  await setItemQuantity(db,'admin',groupId,{quantity:1});
  await assert.rejects(setItemQuantity(db,'admin',groupId,{quantity:0}),error=>error.status===409);

  await db.collection('items').doc(rented.id).update({status:'AVAILABLE',current_rental_id:null});
  await db.collection('rentals').doc('active-rental').update({status:'COMPLETED'});
  await setItemQuantity(db,'admin',groupId,{quantity:0});
  await setItemQuantity(db,'admin',groupId,{quantity:2});
  units=(await inventoryList(db)).items.filter(item=>item.stock_group_id===groupId);
  assert.equal(units.filter(item=>item.is_active!==false).length,2);
  assert.equal(new Set(units.map(item=>item.item_code)).size,5);
  assert.ok(units.filter(item=>item.is_active!==false).every(item=>item.available_quantity===2&&item.total_quantity===2));
});

test('legacy single units and edited stock groups remain adjustable',async()=>{
  const db=memoryFirestore({
    item_categories:{sports:{name:'Sports'}},
    items:{legacy:{name:'Legacy bike',category_id:'sports',item_code:'EQUIP-010',status:'AVAILABLE',condition_status:'GOOD',is_active:true}},
    item_rates:{legacy_rate:{item_id:'legacy',rate_type:'HOURLY',rental_rate:50,late_penalty_rate:10,is_active:true,effective_from:new Date()}}
  });
  await setItemQuantity(db,'admin','legacy',{quantity:3});
  let items=(await inventoryList(db)).items.filter(item=>item.stock_group_id==='legacy');
  assert.equal(items.filter(item=>item.is_active!==false).length,3);
  await setItemQuantity(db,'admin','legacy',{quantity:3});
  assert.equal((await inventoryList(db)).items.filter(item=>item.stock_group_id==='legacy'&&item.is_active!==false).length,3);

  const created=await createItem(db,'admin',input),base=(await inventoryList(db)).items.find(item=>item.id===created.id);
  await updateItem(db,'admin',base.id,{categoryId:'sports',name:'Refitted bike',description:'Updated unit',condition:'GOOD',rateType:'HOURLY',rentalRate:65,latePenalty:10,version:base.updated_at});
  const edited=(await inventoryList(db)).items.find(item=>item.id===base.id),newGroup=edited.stock_group_id;
  assert.notEqual(newGroup,created.stock_group_id);
  await setItemQuantity(db,'admin',newGroup,{quantity:2});
  items=(await inventoryList(db)).items;
  assert.equal(items.filter(item=>item.stock_group_id===newGroup&&item.is_active!==false).length,2);
  assert.equal(items.filter(item=>item.stock_group_id===created.stock_group_id&&item.is_active!==false).length,2);
});
