export const pageRoutes = Object.freeze({ Dashboard: '/', Inventory: '/equipment', Customers: '/customers', 'Rates & Fees': '/rates', Rentals: '/rentals', Returns: '/returns', 'Transaction History': '/transactions', Maintenance: '/maintenance', 'ESP32 terminal': '/verification', Reports: '/reports', Settings: '/settings', Profile: '/profile' });
export const routePages = Object.fromEntries(Object.entries(pageRoutes).map(([page, route]) => [route, page]));

export function pageForPath(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return routePages[normalized] || 'Dashboard';
}

export const pageInfo = Object.freeze({
  Dashboard: ['Today at a glance', 'Track equipment, upcoming returns, and the handoffs that need your attention.', 'grid'],
  Inventory: ['Your equipment collection', 'Manage availability, condition, pricing, and QR labels in one place.', 'box'],
  Customers: ['People behind the play', 'Keep contact details close and follow every customer’s rental history.', 'users'],
  'Rates & Fees': ['Clear prices, easier rentals', 'Manage rental rates and deposits, then preview what a customer will pay.', 'money'],
  Rentals: ['Keep every rental on track', 'Prepare new rentals and follow up on equipment that is due or overdue.', 'clock'],
  Returns: ['Ready for the next rental', 'Record return inspections and review completed equipment handoffs.', 'box'],
  'Transaction History': ['Every rental, one record', 'Find past transactions, saved charges, and their complete verification history.', 'clock'],
  Maintenance: ['Keep your collection ready', 'Track inspections and repairs, and return serviced equipment to the collection.', 'settings'],
  'ESP32 terminal': ['Your counter handoffs', 'Review inspections and monitor requests awaiting physical terminal confirmation.', 'chip'],
  Reports: ['See how your business is doing', 'Explore rental performance, equipment use, and service trends.', 'chart'],
  Settings: ['Make this workspace yours', 'Manage business details, appearance, and your workspace preferences.', 'settings'],
  Profile: ['Your workspace account', 'Keep your name and sign-in details up to date.', 'users']
});
