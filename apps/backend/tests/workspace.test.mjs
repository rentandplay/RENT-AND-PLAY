import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCustomer} from '../src/workspace.mjs';

test('customer validation normalizes safe directory fields',()=>{
  assert.deepEqual(validateCustomer({fullName:'  Maria Santos ',code:' cust-001 ',email:' MARIA@EXAMPLE.COM ',phone:' 09171234567 ',address:' Los Baños '}),{full_name:'Maria Santos',customer_code:'CUST-001',email:'maria@example.com',phone:'09171234567',address:'Los Baños'});
});

test('customer validation rejects unsafe or incomplete records',()=>{
  for(const value of [{fullName:'',code:'C-1'},{fullName:'Customer',code:'bad code'},{fullName:'Customer',code:'CUST-1',email:'invalid'}])assert.throws(()=>validateCustomer(value),error=>error.status===400);
});
