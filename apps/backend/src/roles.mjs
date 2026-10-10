export function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase();
  if (role === 'OWNER' || role === 'SUPER_ADMIN') return 'OWNER';
  if (role === 'ADMIN' || role === 'OPERATOR') return 'OPERATOR';
  if (role === 'USER' || role === 'CUSTOMER') return 'CUSTOMER';
  return '';
}

export const isStaffRole = role => ['OPERATOR', 'OWNER'].includes(normalizeRole(role));
export const isOwnerRole = role => normalizeRole(role) === 'OWNER';
export const isCustomerRole = role => normalizeRole(role) === 'CUSTOMER';

