import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {hashPassword,verifyPassword,Sessions,publicUser} from '../src/auth.mjs';

test('passwords are salted and wrong passwords or malformed hashes fail',async()=>{
  const a=await hashPassword('a-long-test-password');
  const b=await hashPassword('a-long-test-password');
  assert.notEqual(a,b);
  assert.equal(await verifyPassword('a-long-test-password',a),true);
  assert.equal(await verifyPassword('wrong',a),false);
  assert.equal(await verifyPassword('anything','plain-text-password'),false);
  assert.equal(await verifyPassword('anything','scrypt$bad$bad'),false);
});
test('existing bcrypt password hashes are supported',async()=>{
  const hash=await bcrypt.hash('existing-account-password',10);
  assert.equal(await verifyPassword('existing-account-password',hash),true);
  assert.equal(await verifyPassword('wrong-password',hash),false);
});
test('sessions require an issued token and logout invalidates it',()=>{
  const sessions=new Sessions();
  assert.equal(sessions.get('true'),null);
  const session=sessions.create('42');
  assert.equal(session.token.length,64);
  assert.equal(sessions.get(session.token).userId,'42');
  assert.equal(session.seconds,8*3600);
  assert.equal(sessions.create('42',true).seconds,30*86400);
  sessions.delete(session.token);
  assert.equal(sessions.get(session.token),null);
});
test('user response never contains password hash',()=>{
  assert.deepEqual(publicUser({id:1,full_name:'Owner',email:'owner@example.test',role:'OWNER',password_hash:'secret'}),{id:'1',name:'Owner',email:'owner@example.test',role:'OWNER'});
});
