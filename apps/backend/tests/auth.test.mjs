import test from 'node:test';
import assert from 'node:assert/strict';
import {FirebaseSessions,publicUser} from '../src/auth.mjs';

test('Firebase sign-in exchanges an ID token for a secure server session',async()=>{
  const before={project:process.env.FIREBASE_PROJECT_ID,key:process.env.FIREBASE_WEB_API_KEY};
  process.env.FIREBASE_PROJECT_ID='test-project';process.env.FIREBASE_WEB_API_KEY='test-key';
  const calls=[];
  const auth={createSessionCookie:async(token,options)=>{calls.push({token,options});return 'firebase-session';},verifySessionCookie:async token=>token==='firebase-session'?{uid:'firebase-uid'}:Promise.reject(new Error('bad cookie'))};
  const fetcher=async(url,options)=>({ok:true,json:async()=>({idToken:'firebase-id-token',localId:'firebase-uid'})});
  try{
    const sessions=new FirebaseSessions(auth,fetcher),session=await sessions.signIn('owner@example.test','password',false);
    assert.deepEqual(session,{uid:'firebase-uid',cookie:'firebase-session',seconds:8*3600});
    assert.equal(calls[0].options.expiresIn,8*3600*1000);assert.equal((await sessions.verify('firebase-session')).uid,'firebase-uid');
    sessions.revoke('firebase-session');assert.equal(await sessions.verify('firebase-session'),null);
    const remembered=await new FirebaseSessions(auth,fetcher).signIn('owner@example.test','password',true);assert.equal(remembered.seconds,14*86400);
  }finally{
    before.project===undefined?delete process.env.FIREBASE_PROJECT_ID:process.env.FIREBASE_PROJECT_ID=before.project;
    before.key===undefined?delete process.env.FIREBASE_WEB_API_KEY:process.env.FIREBASE_WEB_API_KEY=before.key;
  }
});

test('Firebase rejects invalid credentials without creating a session',async()=>{
  const before={project:process.env.FIREBASE_PROJECT_ID,key:process.env.FIREBASE_WEB_API_KEY};process.env.FIREBASE_PROJECT_ID='test-project';process.env.FIREBASE_WEB_API_KEY='test-key';
  try{const sessions=new FirebaseSessions({},async()=>({ok:false}));assert.equal(await sessions.signIn('owner@example.test','wrong'),null);}finally{before.project===undefined?delete process.env.FIREBASE_PROJECT_ID:process.env.FIREBASE_PROJECT_ID=before.project;before.key===undefined?delete process.env.FIREBASE_WEB_API_KEY:process.env.FIREBASE_WEB_API_KEY=before.key;}
});

test('user response exposes profile fields only',()=>{
  assert.deepEqual(publicUser({id:'uid',full_name:'Owner',email:'owner@example.test',role:'OWNER',password_hash:'secret'}),{id:'uid',name:'Owner',email:'owner@example.test',role:'OWNER'});
});
