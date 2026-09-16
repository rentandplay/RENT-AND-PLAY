export function databaseDate(value) {
  if (!value) return null;
  return new Date(String(value).replace(' ', 'T') + '+08:00');
}
export const dateKey = date => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function rentalStatus(row, now = new Date()) {
  if (row.status !== 'ACTIVE') return row.status === 'PENDING_VERIFICATION' ? 'Pending' : row.status;
  const due = databaseDate(row.due_at);
  if (due < now) return 'Overdue';
  return dateKey(due) === dateKey(now) ? 'Due today' : 'Active';
}
export function revenueWeeks(rows, now = new Date()) {
  const localToday = new Date(`${dateKey(now)}T00:00:00+08:00`);
  const localDay = new Date(localToday.getTime() + 8*3600000).getUTCDay();
  const monday = localToday.getTime() - ((localDay + 6) % 7)*86400000;
  const result = {'This week':Array(7).fill(0),'Last week':Array(7).fill(0)};
  for (const row of rows) {
    if (!['ACTIVE','COMPLETED'].includes(row.status) || !row.confirmed_rental_at) continue;
    const index = Math.floor((databaseDate(row.confirmed_rental_at).getTime() - monday)/86400000);
    if(index >= 0 && index < 7) result['This week'][index] += Number(row.rental_fee);
    if(index >= -7 && index < 0) result['Last week'][index+7] += Number(row.rental_fee);
  }
  return result;
}

export async function loadDashboard(db, now = new Date()) {
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  try {
    const [items] = await db.query(`SELECT i.id, i.item_code, i.name, i.status, c.name AS category,
      rate.rental_rate, rate.rate_type FROM items i JOIN item_categories c ON c.id=i.category_id
      LEFT JOIN item_rates rate ON rate.id=(SELECT ir.id FROM item_rates ir WHERE ir.item_id=i.id
        AND ir.is_active=1 AND ir.effective_from<=NOW(3) AND (ir.effective_to IS NULL OR ir.effective_to>NOW(3))
        ORDER BY ir.effective_from DESC, ir.id DESC LIMIT 1)
      WHERE i.is_active=1 ORDER BY i.name`);
    const [customers] = await db.query('SELECT id, customer_code, full_name FROM customers WHERE is_active=1 ORDER BY full_name');
    const [categories] = await db.query('SELECT c.name, COUNT(i.id) AS count FROM item_categories c LEFT JOIN items i ON i.category_id=c.id AND i.is_active=1 GROUP BY c.id,c.name ORDER BY c.id');
    const [rentals] = await db.query(`SELECT r.id, r.rental_code, r.item_id, i.name AS item_name,
      i.item_code, c.full_name AS customer, r.status, r.due_at, r.rental_fee, r.deposit_amount,
      r.confirmed_rental_at FROM rentals r JOIN items i ON i.id=r.item_id JOIN customers c ON c.id=r.customer_id
      WHERE r.status IN ('PENDING_VERIFICATION','ACTIVE') ORDER BY r.due_at`);
    const [pending] = await db.query(`SELECT v.verification_code, v.transaction_type, v.display_status,
      v.requested_at, v.expires_at, t.terminal_code, i.item_code, i.name AS item_name,
      c.full_name AS customer FROM verification_requests v JOIN terminals t ON t.id=v.terminal_id
      JOIN rentals r ON r.id=v.rental_id JOIN items i ON i.id=r.item_id JOIN customers c ON c.id=r.customer_id
      WHERE v.status='PENDING' ORDER BY v.requested_at`);
    const [terminals] = await db.query('SELECT terminal_code, name, status, last_seen_at FROM terminals WHERE is_active=1 ORDER BY id');
    const [revenue] = await db.query("SELECT status, confirmed_rental_at, rental_fee FROM rentals WHERE status IN ('ACTIVE','COMPLETED') AND confirmed_rental_at >= DATE_SUB(NOW(3), INTERVAL 15 DAY)");
    await db.commit();
    const active = rentals.filter(r => r.status === 'ACTIVE');
    const mapped = rentals.map(r=>({...r, displayStatus:rentalStatus(r,now)}));
    const reserved = new Set(rentals.filter(r=>r.status==='PENDING_VERIFICATION').map(r=>String(r.item_id)));
    return {
      items:items.map(i=>({...i,status:i.status==='AVAILABLE'&&reserved.has(String(i.id))?'RESERVED_PENDING':i.status})),
      customers,categories,rentals:mapped,pending,
      terminals:terminals.map(t=>({...t,online:t.status==='ONLINE'&&!!t.last_seen_at&&now-databaseDate(t.last_seen_at)<90000})),
      revenue:revenueWeeks(revenue,now),
      stats:{active:active.length,available:items.filter(i=>i.status==='AVAILABLE'&&!reserved.has(String(i.id))).length,
        dueToday:active.filter(r=>dateKey(databaseDate(r.due_at))===dateKey(now)).length,
        overdue:mapped.filter(r=>r.displayStatus==='Overdue').length,
        fees:active.reduce((total,r)=>total+Number(r.rental_fee),0)},
      refreshedAt:now.toISOString()
    };
  } catch(error) { await db.rollback(); throw error; }
}
