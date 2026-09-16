import {randomBytes} from 'node:crypto';
import {connection,pool,validateSchema} from '../src/db.mjs';
import {hashPassword} from '../src/auth.mjs';

// First-account setup only. No predefined password, table replacement, or account reset.
let db,locked=false;
try {
  db=await connection();
  await validateSchema(db);
  const [[lock]]=await db.query("SELECT GET_LOCK('rent_play_first_owner',5) AS acquired");
  if(Number(lock.acquired)!==1)throw new Error('Another account setup is running.');
  locked=true;
  await db.beginTransaction();
  const [[existing]]=await db.query('SELECT COUNT(*) AS count FROM users');
  if(Number(existing.count)!==0)throw new Error('An account already exists. No account was changed.');
  const email='owner@rentandplay.local';
  const password='RP-'+randomBytes(9).toString('base64url');
  const hash=await hashPassword(password);
  await db.execute("INSERT INTO users(full_name,email,password_hash,role,is_active) VALUES(?,?,?,'OWNER',1)",['Reynold Pastor',email,hash]);
  await db.commit();
  console.log(JSON.stringify({email,password}));
}catch(error){
  if(db)await db.rollback();
  console.error(error.code || error.message);
  process.exitCode=1;
}finally{
  if(locked)await db.query("SELECT RELEASE_LOCK('rent_play_first_owner')");
  db?.release();await pool.end();
}
