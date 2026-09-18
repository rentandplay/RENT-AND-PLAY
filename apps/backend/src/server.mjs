import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {FirebaseSessions,publicUser} from './auth.mjs';
import {firebaseAuth,firestore,requireFirebaseConfig} from './firebase.mjs';
import {loadDashboard} from './dashboard.mjs';
import {inventoryList,inventoryDetail,inventoryQr,createItem,updateItem,itemAction} from './inventory.mjs';
import {updateProfile} from './profile.mjs';

const defaultServices={
  async health(){requireFirebaseConfig();await firestore.collection('users').limit(1).get();},
  async getUser(id){const doc=await firestore.collection('users').doc(String(id)).get();return doc.exists?{id:doc.id,...doc.data()}:null;},
  async touchLogin(id){await firestore.collection('users').doc(String(id)).update({last_login_at:new Date()});},
  updateProfile:(id,input)=>updateProfile(firebaseAuth,firestore,id,input),
  dashboard:()=>loadDashboard(firestore),
  inventoryList:()=>inventoryList(firestore),inventoryDetail:id=>inventoryDetail(firestore,id),inventoryQr:id=>inventoryQr(firestore,id),
  createItem:(actor,input)=>createItem(firestore,actor,input),updateItem:(actor,id,input)=>updateItem(firestore,actor,id,input),itemAction:(actor,id,input)=>itemAction(firestore,actor,id,input)
};

export function createApi({services=defaultServices,sessions=new FirebaseSessions()}={}) {
  const attempts=new Map();
  const origins=new Set([process.env.WEB_ORIGIN||'http://127.0.0.1:5173','http://localhost:5173']);
  function send(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value));}
  function cookie(value,seconds,persistent=false){return `rent_play_session=${value}; HttpOnly; SameSite=Strict; Path=/${persistent?`; Max-Age=${seconds}`:''}${process.env.COOKIE_SECURE==='true'?'; Secure':''}`;}
  async function body(req){
    if(!(req.headers['content-type']||'').startsWith('application/json'))throw Object.assign(new Error('JSON body required.'),{status:415});
    let value='';for await(const chunk of req){value+=chunk;if(Buffer.byteLength(value)>8192)throw Object.assign(new Error('Request is too large.'),{status:413});}
    try{return JSON.parse(value);}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400});}
  }
  return http.createServer(async(req,res)=>{
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('rent_play_session='))?.slice('rent_play_session='.length);
    try{
      if(['POST','PATCH','PUT','DELETE'].includes(req.method)&&((req.headers.origin&&!origins.has(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site'))return send(res,403,{error:'Request origin is not allowed.'});
      if(path==='/api/auth/logout'&&req.method==='POST'){if(await sessions.verify(token))sessions.revoke?.(token);return send(res,200,{ok:true},{'Set-Cookie':cookie('',0,true)});}
      if(path==='/api/health'&&req.method==='GET'){await services.health();return send(res,200,{database:true,provider:'firebase'});}
      if(path==='/api/auth/login'&&req.method==='POST'){
        const ip=req.socket.remoteAddress,now=Date.now();for(const [key,value] of attempts)if(now-value.since>900000)attempts.delete(key);
        const entry=attempts.get(ip)||{since:now,count:0};if(entry.count>=10)return send(res,429,{error:'Too many attempts. Try again in 15 minutes.'});attempts.set(ip,{...entry,count:entry.count+1});
        const input=await body(req);if(typeof input?.email!=='string'||typeof input?.password!=='string'||input.email.length>191||input.password.length>1024||!input.password)return send(res,400,{error:'Enter your email and password.'});
        const session=await sessions.signIn(input.email.trim().toLowerCase(),input.password,input.remember===true);
        if(!session)return send(res,401,{error:'Email or password is incorrect.'});
        const user=await services.getUser(session.uid);
        if(!user?.is_active||!['OWNER','OPERATOR'].includes(user.role))return send(res,401,{error:'Email or password is incorrect.'});
        await services.touchLogin(user.id);attempts.delete(ip);
        return send(res,200,{user:publicUser(user)},{'Set-Cookie':cookie(session.cookie,session.seconds,input.remember===true)});
      }
      const inventoryRoute=path.match(/^\/api\/inventory(?:\/([A-Za-z0-9_-]{1,128})(?:\/(qr|actions))?)?$/);
      if((['/api/auth/me','/api/dashboard'].includes(path)&&req.method==='GET')||(path==='/api/profile'&&req.method==='PATCH')||inventoryRoute){
        const claims=await sessions.verify(token);if(!claims)return send(res,401,{error:'Please sign in.'});
        const user=await services.getUser(claims.uid);if(!user?.is_active||!['OWNER','OPERATOR'].includes(user.role))return send(res,401,{error:'Please sign in.'});
        if(path==='/api/auth/me')return send(res,200,{user:publicUser(user)});
        if(path==='/api/profile')return send(res,200,{user:publicUser(await services.updateProfile(user.id,await body(req)))});
        if(inventoryRoute){
          const [,id,action]=inventoryRoute;
          if(req.method==='GET'&&!id)return send(res,200,await services.inventoryList());
          if(req.method==='GET'&&id&&action==='qr')return send(res,200,await services.inventoryQr(id));
          if(req.method==='GET'&&id&&!action)return send(res,200,await services.inventoryDetail(id));
          if(req.method==='POST'&&!id)return send(res,201,await services.createItem(user.id,await body(req)));
          if(req.method==='PATCH'&&id&&!action)return send(res,200,await services.updateItem(user.id,id,await body(req)));
          if(req.method==='POST'&&id&&action==='actions')return send(res,200,await services.itemAction(user.id,id,await body(req)));
          return send(res,405,{error:'Method not allowed.'});
        }
        return send(res,200,await services.dashboard());
      }
      send(res,404,{error:'API endpoint not found.'});
    }catch(error){
      if(error.status)send(res,error.status,{error:error.message});
      else{console.error(`Backend request failed (${error.code||'FIREBASE_ERROR'}).`);send(res,503,{error:'Firebase is unavailable. Check the backend Firebase configuration.'});}
    }
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)createApi().listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Rent & Play backend: http://127.0.0.1:'+(process.env.PORT||3000)));
