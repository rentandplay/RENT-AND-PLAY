import test from 'node:test';
import assert from 'node:assert/strict';
import {firestore} from '../src/firebase.mjs';
import {createItem,inventoryDetail,inventoryQr,updateItem} from '../src/inventory.mjs';

test('Firestore inventory preserves QR tokens and rate history',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
  const category=firestore.collection('item_categories').doc(),actor='test-owner',code='QA-'+Date.now();
  await category.set({name:'Test category',created_at:new Date()});
  const payload={code,categoryId:category.id,name:'Firestore inventory verification',condition:'GOOD',rateType:'DAILY',rentalRate:50.25,deposit:100,latePenalty:5};
  let id;
  try{
    ({id}=await createItem(firestore,actor,payload));
    let detail=await inventoryDetail(firestore,id),token=detail.item.qr_token;
    assert.equal(detail.item.status,'AVAILABLE');assert.equal(detail.item.rental_rate,50.25);
    await assert.rejects(createItem(firestore,actor,payload),error=>error.status===409);
    await updateItem(firestore,actor,id,{...payload,rentalRate:75.5,version:detail.item.updated_at});
    detail=await inventoryDetail(firestore,id);assert.equal(detail.item.rental_rate,75.5);assert.equal(detail.item.qr_token,token);assert.equal(detail.rates.length,2);
    const qr=await inventoryQr(firestore,id);assert.ok(qr.svg.includes('<svg'));assert.equal(qr.token,token);
  }finally{
    const batch=firestore.batch();
    batch.delete(category);batch.delete(firestore.collection('item_codes').doc(code));
    if(id){batch.delete(firestore.collection('items').doc(id));for(const name of ['item_rates','item_status_history','audit_logs']){const snapshot=await firestore.collection(name).where(name==='audit_logs'?'entity_id':'item_id','==',id).get();for(const doc of snapshot.docs)batch.delete(doc.ref);}}
    await batch.commit();
  }
});
