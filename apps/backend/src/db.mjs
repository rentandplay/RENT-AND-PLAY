import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'rent_and_play_db',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  connectionLimit: 5,
  connectTimeout: 5000,
  dateStrings: true,
  decimalNumbers: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  timezone: '+08:00',
  multipleStatements: false
});

export async function connection() {
  const db = await pool.getConnection();
  try { await db.query("SET time_zone = '+08:00'"); return db; }
  catch (error) { db.release(); throw error; }
}

export const requiredSchema = {
  users: ['id','full_name','email','password_hash','role','is_active','last_login_at'],
  customers: ['id','customer_code','full_name','is_active'],
  item_categories: ['id','name'],
  items: ['id','item_code','category_id','name','status','is_active'],
  item_rates: ['id','item_id','rental_rate','rate_type','is_active','effective_from','effective_to'],
  rentals: ['id','rental_code','customer_id','item_id','status','due_at','confirmed_rental_at','rental_fee','deposit_amount'],
  verification_requests: ['id','verification_code','transaction_type','rental_id','terminal_id','status','display_status','requested_at','expires_at'],
  terminals: ['id','terminal_code','name','status','last_seen_at','is_active']
};
export async function validateSchema(db) {
  const [rows] = await db.execute('SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?', [process.env.DB_NAME || 'rent_and_play_db']);
  const missing = [];
  for (const [table, columns] of Object.entries(requiredSchema)) {
    for (const column of columns) if (!rows.some(r => r.TABLE_NAME === table && r.COLUMN_NAME === column)) missing.push(`${table}.${column}`);
  }
  if (missing.length) throw new Error(`Schema mismatch. Missing: ${missing.join(', ')}`);
}
