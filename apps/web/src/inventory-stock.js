const active = item => item.is_active !== false;
const state = item => item.effective_status || item.status || 'UNAVAILABLE';
const unitOrder = (a, b) => String(a.item_code || a.id).localeCompare(String(b.item_code || b.id), undefined, { numeric: true });

// Keep physical units for QR scanning and inspections, but show the catalog
// once per stock group. Never add the repeated API totals for individual units.
export function groupInventory(items, scope = 'active') {
  const groups = new Map();
  for (const item of items) {
    const key = String(item.stock_group_id || item.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups].flatMap(([key, members]) => {
    const units = [...members].sort(unitOrder), live = units.filter(active);
    const visible = scope === 'archived' ? units.filter(item => !active(item)) : live;
    if (!visible.length) return [];
    const representative = visible.find(item => String(item.id) === key) || visible[0];
    const catalog = live.find(item => String(item.id) === key) || live[0] || representative;
    const counts = {};
    for (const item of visible) counts[state(item)] = (counts[state(item)] || 0) + 1;
    const conditions = [...new Set(visible.map(item => item.condition_status || 'Not recorded'))];
    return [{
      ...catalog,
      id: representative.id,
      updated_at: representative.updated_at,
      is_active: scope !== 'archived',
      stock_group_id: key,
      units,
      visible_units: visible,
      is_stock_group: true,
      total_quantity: live.length,
      available_quantity: live.filter(item => state(item) === 'AVAILABLE').length,
      reserved_quantity: live.filter(item => state(item) === 'RESERVED_PENDING').length,
      rented_quantity: live.filter(item => ['RENTED', 'UNDER_INSPECTION'].includes(state(item))).length,
      maintenance_quantity: live.filter(item => state(item) === 'UNDER_MAINTENANCE').length,
      archived_quantity: units.length - live.length,
      retired_quantity: units.filter(item => String(item.status).toUpperCase() === 'RETIRED').length,
      effective_status: Object.keys(counts).length === 1 ? Object.keys(counts)[0] : 'MIXED',
      condition_status: conditions.length === 1 ? conditions[0] : 'MIXED',
      status_counts: counts,
      open_rentals: live.reduce((sum, item) => sum + Number(item.open_rentals || 0), 0),
      open_maintenance: live.reduce((sum, item) => sum + Number(item.open_maintenance || 0), 0)
    }];
  });
}

export function stockMatchesStatus(group, status) {
  return status === 'all' || group.visible_units.some(item => state(item) === status);
}

export function stockMatchesSearch(group, search) {
  const term = search.trim().toLowerCase();
  return !term || [group.name, group.category, group.description].some(value => String(value || '').toLowerCase().includes(term)) || group.visible_units.some(item => [item.name, item.item_code, item.category, item.description].some(value => String(value || '').toLowerCase().includes(term)));
}

export function inventoryStockCounts(items) {
  const units = items.filter(active);
  return [units.length, units.filter(item => state(item) === 'AVAILABLE').length, units.filter(item => ['RENTED', 'RESERVED_PENDING', 'UNDER_INSPECTION'].includes(state(item))).length, units.filter(item => state(item) === 'UNDER_MAINTENANCE').length];
}
