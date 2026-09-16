import {createInterface} from 'node:readline/promises';
import {pool,connection,validateSchema} from '../src/db.mjs';
import {hashPassword} from '../src/auth.mjs';

async function hiddenQuestion(prompt) {
  if(!process.stdin.isTTY) throw new Error('Run this command in an interactive VS Code terminal.');
  process.stdout.write(prompt);
  return new Promise((resolve,reject)=>{
    let text='';
    process.stdin.setRawMode(true); process.stdin.resume();
    const cleanup=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',listener);process.stdout.write('\n');};
    const listener=chunk=>{
      for(const char of chunk.toString()) {
        if(char==='\u0003'){cleanup();reject(new Error('Account creation cancelled.'));return;}
        if(char==='\r'||char==='\n'){cleanup();resolve(text);return;}
        if(char==='\u007f'||char==='\b')text=text.slice(0,-1);
        else if(char>=' ' && char!=='\u001b')text+=char;
      }
    };
    process.stdin.on('data',listener);
  });
}
let db, locked=false;
try {
  db=await connection();await validateSchema(db);
  const [[existing]]=await db.query('SELECT COUNT(*) AS count FROM users');
  if(Number(existing.count)!==0)throw new Error('User accounts already exist. This command only creates the first owner and never overwrites accounts.');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  const name=(await rl.question('Owner full name: ')).trim();
  const email=(await rl.question('Login email: ')).trim().toLowerCase();
  rl.close();
  if(!name || name.length>150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>191)throw new Error('Enter a valid name and email.');
  const password=await hiddenQuestion('Choose login password (hidden, minimum 12 characters): ');
  const repeat=await hiddenQuestion('Repeat password: ');
  if(password.length<12 || password.length>1024 || password!==repeat)throw new Error('Passwords must match and contain 12–1024 characters.');
  const hash=await hashPassword(password);
  const [[lock]]=await db.query("SELECT GET_LOCK('rent_play_first_owner', 5) AS acquired");
  if(Number(lock.acquired)!==1)throw new Error('Another account setup is running. Try again.');
  locked=true;
  await db.beginTransaction();
  const [[check]]=await db.query('SELECT COUNT(*) AS count FROM users');
  if(Number(check.count)!==0)throw new Error('An account was created while setup was running. Nothing was overwritten.');
  await db.execute("INSERT INTO users(full_name,email,password_hash,role,is_active) VALUES(?,?,?,'OWNER',1)",[name,email,hash]);
  await db.commit();
  console.log('Owner account created. Sign in on the website with the email and password you chose.');
} catch(error) {
  if(db)await db.rollback();
  console.error(error.code==='ER_ACCESS_DENIED_ERROR'?'Set the MySQL connection credentials in apps/backend/.env first.':error.code || error.message);
  process.exitCode=1;
} finally {
  if(locked)await db.query("SELECT RELEASE_LOCK('rent_play_first_owner')");
  db?.release();await pool.end();
}
