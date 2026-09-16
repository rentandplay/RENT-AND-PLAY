import test from 'node:test';
import assert from 'node:assert/strict';
import {validateItem,assertEditable} from '../src/inventory.mjs';
const valid={code:'sport-001',categoryId:'1',name:'Basketball',condition:'GOOD',rateType:'DAILY',rentalRate:35.50,deposit:100,latePenalty:5};
test('inventory accepts precise PHP prices and normalizes codes without accepting invalid input',()=>{
  assert.equal(validateItem(valid).code,'SPORT-001');
  for(const changes of [{rentalRate:-1},{deposit:Infinity},{latePenalty:1.001},{rateType:'WEEKLY'},{categoryId:'1 OR 1'},{code:'bad code'},{name:''},{description:'a'.repeat(2001)}])assert.throws(()=>validateItem({...valid,...changes}),err=>err.status===400);
});
test('availability actions guard both item status and pending/active rental records',()=>{
  assert.doesNotThrow(()=>assertEditable({status:'AVAILABLE'},0,'archive'));
  for(const [status,count] of [['AVAILABLE',1],['RENTED',0],['RESERVED_PENDING',0]])assert.throws(()=>assertEditable({status},count,'archive'),err=>err.status===409);
});
