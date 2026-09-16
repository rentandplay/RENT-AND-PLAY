import {pool,connection,validateSchema} from '../src/db.mjs';
let db;
try {
  db=await connection();
  await validateSchema(db);
  const [[result]]=await db.query('SELECT COUNT(*) AS count FROM users');
  console.log(`Connected to ${process.env.DB_NAME || 'rent_and_play_db'}. Schema matches. User accounts: ${result.count}.`);
  if(Number(result.count)===0) console.log('Create your first account with npm run user:create.');
} catch(error) {
  if(error.code==='ER_ACCESS_DENIED_ERROR') console.error('MySQL rejected the login. Set DB_USER and DB_PASSWORD in apps/backend/.env to your Workbench connection credentials.');
  else if(error.code==='ER_BAD_DB_ERROR') console.error('Database not found. Set DB_NAME to the schema name shown in Workbench.');
  else if(error.code==='ECONNREFUSED') console.error('MySQL is not reachable. Check the MySQL service, host, and port.');
  else console.error(error.code || error.message);
  process.exitCode=1;
} finally {db?.release();await pool.end();}
