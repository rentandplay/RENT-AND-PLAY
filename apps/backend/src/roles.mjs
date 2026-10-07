export function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase();
  if (role === 'OWNER' || role === 'SUPER_ADMIN') return 'OWNER';
  if (role === 'ADMIN' || role === 'OPERATOR') return 'ADMIN';
  if (role === 'USER' || role === 'CUSTOMER') return 'USER';
  return '';
}

export const isStaffRole = role => ['ADMIN', 'OWNER'].includes(normalizeRole(role));
export const isOwnerRole = role => normalizeRole(role) === 'OWNER';
export const isCustomerRole = role => normalizeRole(role) === 'USER';

