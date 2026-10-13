const fields = { rental: 'rental_code', equipment: 'item_code', customer: 'customer_code', verification: 'request_code', maintenance: 'maintenance_code', rate: 'rate_code', category: 'category_code', terminal: 'terminal_code', account: 'account_code', audit: 'audit_code', condition: 'condition_code', history: 'history_code' };

// References come from the backend. Do not truncate IDs or construct another
// client-specific identifier, since that can identify a different record.
export function recordCode(row, type = 'rental') {
  const value = row?.[fields[type]];
  return typeof value === 'string' && value.trim() ? value.trim() : 'Not assigned';
}

export function relatedCode(model, collection, id, type = 'rental') {
  return recordCode((model?.[collection] || []).find(row => String(row.id) === String(id)), type);
}
