import test from 'node:test';
import assert from 'node:assert/strict';
import {validateItem,assertEditable,equipmentItemCode} from '../src/inventory.mjs';
const valid={code:'sport-001',categoryId:'1',name:'Basketball',condition:'GOOD',rateType:'DAILY',rentalRate:35.50,deposit:100,latePenalty:5};
test('inventory accepts precise PHP prices and normalizes codes without accepting invalid input',()=>{
  assert.equal(validateItem(valid).code,'SPORT-001');
  for(const changes of [{rentalRate:-1},{deposit:Infinity},{latePenalty:1.001},{rateType:'WEEKLY'},{categoryId:'1 OR 1'},{code:'bad code'},{name:''},{description:'a'.repeat(2001)}])assert.throws(()=>validateItem({...valid,...changes}),err=>err.status===400);
});
test('equipment codes use one compact sequence independent of category',()=>{
  assert.equal(equipmentItemCode(1),'RENT-001');
  assert.equal(equipmentItemCode(14),'RENT-014');
  assert.equal(equipmentItemCode(1000),'RENT-1000');
  assert.equal(validateItem({...valid,code:undefined},{codeRequired:false}).code,null);
});
test('availability actions guard both item status and pending/active rental records',()=>{
  assert.doesNotThrow(()=>assertEditable({status:'AVAILABLE'},0,'archive'));
  for(const [status,count] of [['AVAILABLE',1],['RENTED',0],['RESERVED_PENDING',0]])assert.throws(()=>assertEditable({status},count,'archive'),err=>err.status===409);
});
