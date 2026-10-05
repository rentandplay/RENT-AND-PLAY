import test from 'node:test';
import assert from 'node:assert/strict';
import {updateProfile,validateProfile} from '../src/profile.mjs';
import {memoryFirestore} from './support/memory-firestore.mjs';

test('profile validation normalizes editable account details',()=>{
  assert.deepEqual(validateProfile({fullName:'  Reynold Pastor ',email:' RENTANDPLAY0@GMAIL.COM '}),{fullName:'Reynold Pastor',email:'rentandplay0@gmail.com'});
  for(const input of [{fullName:'',email:'owner@example.com'},{fullName:'Owner',email:'invalid'}])assert.throws(()=>validateProfile(input),error=>error.status===400);
});

test('profile update keeps Firebase Auth and Firestore in sync',async()=>{
  const calls=[];
  const auth={getUser:async()=>({displayName:'Old Name',email:'old@example.com'}),updateUser:async(id,value)=>calls.push({id,value})};
  const record={full_name:'Old Name',email:'old@example.com',role:'OWNER',is_active:true};
  const db=memoryFirestore({users:{'uid-1':record}});
  const result=await updateProfile(auth,db,'uid-1',{fullName:'New Name',email:'new@example.com'});
  assert.equal(result.full_name,'New Name');
  assert.equal(result.email,'new@example.com');
  assert.deepEqual(calls[0],{id:'uid-1',value:{displayName:'New Name',email:'new@example.com'}});
});
