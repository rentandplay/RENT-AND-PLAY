import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/server.mjs';
import {hashPassword} from '../src/auth.mjs';
import {pool} from '../src/db.mjs';

test('API protects dashboard, checks database password, uses HttpOnly sessions, and revokes logout',async()=>{
  const hash=await hashPassword('test-password-with-length');
  const row={id:1,full_name:'Test Owner',email:'owner@example.test',role:'OWNER',is_active:1,password_hash:hash};
  const executed=[];
  const db={execute:async(sql,params)=>{executed.push({sql,params});return sql.startsWith('SELECT')?[[row]]:[{}];},release:()=>{}};
  const server=createApi({getConnection:async()=>db,checkSchema:async()=>{},dashboard:async()=>({stats:{active:0}})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base+'/api/dashboard')).status,401);
    assert.equal((await fetch(base+'/api/inventory')).status,401);
    assert.equal((await fetch(base+'/api/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    const login=async(password,headers={})=>fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({email:row.email,password})});
    assert.equal((await login('incorrect')).status,401);
    assert.equal((await login('test-password-with-length',{Origin:'https://untrusted.example'})).status,403);
    const response=await login('test-password-with-length');
    assert.equal(response.status,200);
    const setCookie=response.headers.get('set-cookie');
    assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);
    const cookie=setCookie.split(';')[0];
    assert.equal((await fetch(base+'/api/inventory/1',{method:'PATCH',headers:{Cookie:cookie,Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await response.json()).user.password_hash,undefined);
    const dashboard=await fetch(base+'/api/dashboard',{headers:{Cookie:cookie}});
    assert.equal(dashboard.status,200);
    row.is_active=0;
    assert.equal((await fetch(base+'/api/dashboard',{headers:{Cookie:cookie}})).status,401);
    row.is_active=1;
    const next=await login('test-password-with-length');
    const nextCookie=next.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers:{Cookie:nextCookie}})).status,200);
    assert.equal((await fetch(base+'/api/auth/me',{headers:{Cookie:nextCookie}})).status,401);
    assert.ok(executed.some(e=>e.sql.includes('email=?')&&e.params[0]===row.email));
  } finally {await new Promise(resolve=>server.close(resolve));await pool.end();}
});
