export function createRentalNotifications({ api, onChange = () => {}, onAlert = () => {} }) {
  let account = null, generation = 0, pending = false, initialized = false, error = '', nextCursor = null, hasOlder = false;
  let rows = new Map(), seen = new Set(), readLocally = new Set(), revision = null;
  const state = () => ({ notifications: [...rows.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id.localeCompare(a.id)),
    unreadCount: [...rows.values()].filter(row => !row.is_read).length, loading: pending && !initialized, error, nextCursor });
  async function refresh({ older = false } = {}) {
    if (!account || pending || older && !nextCursor) return;
    const version = generation; pending = true;
    try {
      const response = await api(`/notifications${older ? `?before=${encodeURIComponent(nextCursor)}` : revision ? `?since=${encodeURIComponent(revision)}` : ''}`);
      if (version !== generation) return;
      if (response.unchanged) { error = ''; return; }
      if (!older) revision = response.revision || null;
      const incoming = response.notifications || [];
      const arrivals = initialized && !older ? incoming.filter(row => !row.is_read && !seen.has(row.id)) : [];
      if (!older && !hasOlder) rows = new Map();
      incoming.forEach(row => { rows.set(row.id, readLocally.has(row.id) ? { ...row, is_read: true } : row); seen.add(row.id); });
      if (older) hasOlder = true;
      if (older || !hasOlder) nextCursor = response.next_cursor || null;
      initialized = true; error = '';
      if (arrivals.length) onAlert(arrivals[0], arrivals.length);
    } catch (problem) { if (version === generation) error = problem.message || 'Could not load notifications.'; }
    finally { if (version === generation) { pending = false; onChange(state()); } }
  }
  function setAccount(id) {
    if (id === account) return;
    account = id || null; generation++; pending = false; initialized = false; error = ''; nextCursor = null; hasOlder = false;
    rows = new Map(); seen = new Set(); readLocally = new Set(); revision = null; onChange(state());
    if (account) refresh();
  }
  async function markRead(ids) {
    const version = generation, selected = ids.filter(id => rows.has(id) && !rows.get(id).is_read);
    for (let index = 0; index < selected.length; index += 60) {
      const chunk = selected.slice(index, index + 60);
      await api('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: chunk }) });
      if (version !== generation) return;
      chunk.forEach(id => { readLocally.add(id); if (rows.has(id)) rows.set(id, { ...rows.get(id), is_read: true }); });
      onChange(state());
    }
  }
  return { state, setAccount, refresh, markRead };
}

export function renderRentalNotifications(state, { escape: e, formatDate }) {
  return state.notifications.map(row => `<button type="button" class="${row.is_read ? '' : 'notification-unread'}" data-rental-notification="${e(row.id)}" data-notification-rental="${e(row.rental_id)}"><span class="notification-mark ${row.type.includes('REJECTED') ? 'overdue-mark' : 'pending-mark'}">${row.type.includes('REJECTED') ? '!' : '•'}</span><span><strong>${e(row.title)}</strong><small>${e(row.message)}</small><small class="notification-time">${e(row.rental_code)} · ${e(formatDate(row.created_at))}${row.is_read ? '' : ' · Unread'}</small></span></button>`).join('');
}
