import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { connection, validateSchema } from './db.mjs';
import { Sessions, publicUser, verifyPassword, hashPassword } from './auth.mjs';
import { loadDashboard } from './dashboard.mjs';
import {inventoryList,inventoryDetail,inventoryQr,createItem,updateItem,itemAction} from './inventory.mjs';

export function createApi({getConnection=connection,checkSchema=validateSchema,dashboard=loadDashboard}={}) {
  const sessions = new Sessions();
  const attempts = new Map();
  const origins = new Set([process.env.WEB_ORIGIN || 'http://127.0.0.1:5173','http://localhost:5173']);
  const dummyHash = hashPassword('not-a-real-account');
  function send(res, status, value, headers={}) {
    res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
    res.end(JSON.stringify(value));
  }
  function cookie(token, seconds, persistent=false) {
    return `rent_play_session=${token}; HttpOnly; SameSite=Strict; Path=/${persistent?`; Max-Age=${seconds}`:''}${process.env.COOKIE_SECURE==='true'?'; Secure':''}`;
  }
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON body required.'),{status:415});
    let text='';
    for await(const chunk of req) {
      text+=chunk;
      if(Buffer.byteLength(text)>8192) throw Object.assign(new Error('Request is too large.'),{status:413});
    }
    try { return JSON.parse(text); } catch {throw Object.assign(new Error('Invalid JSON.'),{status:400});}
  }
  return http.createServer(async(req,res)=>{
    const path = new URL(req.url,'http://127.0.0.1').pathname;
    const token = (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith('rent_play_session='))?.slice('rent_play_session='.length);
    let db;
    try {
      if(['POST','PATCH','PUT','DELETE'].includes(req.method) && ((req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site']==='cross-site')) return send(res,403,{error:'Request origin is not allowed.'});
      if(path==='/api/auth/logout' && req.method==='POST') {
        sessions.delete(token);
        return send(res,200,{ok:true},{'Set-Cookie':cookie('',0,true)});
      }
      if(path==='/api/health' && req.method==='GET') {
        db=await getConnection(); await checkSchema(db);
        return send(res,200,{database:true});
      }
      if(path==='/api/auth/login' && req.method==='POST') {
        const ip=req.socket.remoteAddress;
        const now=Date.now();
        for(const [key,value] of attempts) if(now-value.since>900000) attempts.delete(key);
        const entry=attempts.get(ip)||{since:now,count:0};
        if(entry.count>=10) return send(res,429,{error:'Too many attempts. Try again in 15 minutes.'});
        attempts.set(ip,{...entry,count:entry.count+1});
        const input=await body(req);
        if(typeof input?.email!=='string' || typeof input?.password!=='string' || input.email.length>191 || input.password.length>1024 || !input.password) return send(res,400,{error:'Enter your email and password.'});
        db=await getConnection();
        const [rows]=await db.execute('SELECT id,full_name,email,password_hash,role,is_active FROM users WHERE email=? LIMIT 1',[input.email.trim().toLowerCase()]);
        const user=rows[0];
        const valid=await verifyPassword(input.password,user?.password_hash || await dummyHash);
        if(!valid || !user?.is_active || !['OWNER','OPERATOR'].includes(user.role)) return send(res,401,{error:'Email or password is incorrect.'});
        await db.execute('UPDATE users SET last_login_at=NOW(3) WHERE id=?',[user.id]);
        sessions.delete(token);
        const session=sessions.create(String(user.id),input.remember===true);
        attempts.delete(ip);
        return send(res,200,{user:publicUser(user)},{'Set-Cookie':cookie(session.token,session.seconds,input.remember===true)});
      }
      const inventoryRoute=path.match(/^\/api\/inventory(?:\/([1-9]\d*)(?:\/(qr|actions))?)?$/);
      if((['/api/auth/me','/api/dashboard'].includes(path) && req.method==='GET') || inventoryRoute) {
        const session=sessions.get(token);
        if(!session) return send(res,401,{error:'Please sign in.'});
        db=await getConnection();
        const [rows]=await db.execute('SELECT id,full_name,email,role,is_active FROM users WHERE id=? LIMIT 1',[session.userId]);
        const user=rows[0];
        if(!user?.is_active || !['OWNER','OPERATOR'].includes(user.role)) {sessions.delete(token);return send(res,401,{error:'Please sign in.'});}
        if(path==='/api/auth/me') return send(res,200,{user:publicUser(user)});
        if(inventoryRoute) {
          const [,id,action]=inventoryRoute;
          if(req.method==='GET'&&!id)return send(res,200,await inventoryList(db));
          if(req.method==='GET'&&id&&action==='qr')return send(res,200,await inventoryQr(db,id));
          if(req.method==='GET'&&id&&!action)return send(res,200,await inventoryDetail(db,id));
          if(req.method==='POST'&&!id)return send(res,201,await createItem(db,user.id,await body(req)));
          if(req.method==='PATCH'&&id&&!action)return send(res,200,await updateItem(db,user.id,id,await body(req)));
          if(req.method==='POST'&&id&&action==='actions')return send(res,200,await itemAction(db,user.id,id,await body(req)));
          return send(res,405,{error:'Method not allowed.'});
        }
        return send(res,200,await dashboard(db));
      }
      send(res,404,{error:'API endpoint not found.'});
    } catch(error) {
      if(error.status) send(res,error.status,{error:error.message});
      else {
        console.error(`Backend request failed (${error.code || 'DATABASE_OR_SCHEMA_ERROR'}).`);
        send(res,503,{error:'Database unavailable. Check the MySQL connection and backend .env settings.'});
      }
    } finally {db?.release();}
  });
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  createApi().listen(Number(process.env.PORT || 3000),'127.0.0.1',()=>console.log('Rent & Play backend: http://127.0.0.1:'+(process.env.PORT || 3000)));
}
