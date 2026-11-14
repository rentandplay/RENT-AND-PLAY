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
  assert.deepEqual(publicUser({id:'uid',full_name:'Owner',email:'owner@example.test',role:'OWNER',password_hash:'secret'}),{id:'uid',name:'Owner',email:'owner@example.test',role:'OWNER',mustChangePassword:false});
});

test('remembered Firebase sessions reconstruct remember status and expiry from token claims across restarts', async () => {
  const iat = Math.floor(Date.now() / 1000);
  const rememberedExp = iat + 14 * 86400;
  const standardExp = iat + 8 * 3600;
  const auth = {
    verifySessionCookie: async token => token === 'remembered-token'
      ? { uid: 'owner-1', iat, exp: rememberedExp }
      : { uid: 'owner-1', iat, exp: standardExp }
  };
  const sessions = new FirebaseSessions(auth);
  const rememberedClaims = await sessions.verify('remembered-token');
  const rememberedEntry = sessions.recordSession('owner-1', 'remembered-token', { userAgent: 'Chrome/130.0 Windows', ip: '127.0.0.1', claims: rememberedClaims });
  assert.equal(rememberedEntry.remember, true);
  assert.equal(rememberedEntry.expiresAt, new Date(rememberedExp * 1000).toISOString());

  const list = sessions.listSessions('owner-1', 'standard-token', { claims: await sessions.verify('standard-token') });
  const rememberedRow = list.find(s => !s.is_current);
  const currentRow = list.find(s => s.is_current);
  assert.equal(rememberedRow.remember, true);
  assert.equal(currentRow.remember, false);
});
