import { createInventory } from './inventory.js';
import { createWorkspaceUI } from './workspace-ui.js';
import { createConfirmationDialog } from './confirmation-dialog.js';
import { bindRecordLinks, recordAttrs } from './record-links.js';
import { pageRoutes, pageForPath, pageInfo } from './workspace-navigation.js';
import { createApiClient } from './api-client.js';
import { createRentalNotifications, renderRentalNotifications } from './notifications.js';
import { bindAccountValidation, emailError, passwordError, passwordMatchError, passwordHelp } from './account-validation.js';
const apiClient = createApiClient();
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const confirmation = createConfirmationDialog({ dialog: document.querySelector('#confirmation-modal'), parentModal: modal, notify: message => toast(message) });
const { confirmAction, confirmSubmit } = confirmation;
let logoutPending = false;
let rememberSession = false;
let invalidateWorkspace = () => {};
const icons = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5l1.5 1.5M5 19l1.5-1.5M17.5 6.5l1.5-1.5"/>',
  moon: '<path d="M20.5 13a9 9 0 0 1-9.5-9.5A9 9 0 1 0 20.5 13Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 3v17h17M8 16v-5M13 16V7M18 16v-8"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5"/><rect x="10" y="10" width="4" height="4"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4"/>', out: '<path d="M10 4H4v16h6M8 12h13m-4-4 4 4-4 4"/>',
  money: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h1M17 12h1"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM14 5l5 5"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>', qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  bluetooth: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>', print: '<path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/><path d="M17 11h.01"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>'
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.box}</svg>`;
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v || 0));
const initials = name => String(name || '').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const symbol = category => /sport/i.test(category) ? '🏀' : /board/i.test(category) ? '🎲' : /card/i.test(category) ? '🃏' : /consol/i.test(category) ? '🎮' : '📦';
const date = v => v ? new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(v)) ? String(v) : String(v).replace(' ', 'T') + '+08:00') : null;
const formatDate = v => date(v) && Number.isFinite(date(v).getTime()) ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(date(v)) : 'Not recorded';
const badge = status => `<span class="badge ${escape(status.toLowerCase().replaceAll(' ', '-'))}">${escape(status)}</span>`;
const stateLabel = status => ({ AVAILABLE: 'Available', RENTED: 'Rented', UNDER_MAINTENANCE: 'Under maintenance', RESERVED_PENDING: 'Pending', INACTIVE: 'Inactive' }[status] || status);
const brand = `<img src="/public/logo.png" alt="Rent and Play logo"/><span>rent<span class="orange">&</span>play<small>RENTAL MANAGEMENT</small></span>`;
const sportArt = `<svg class="sport-art" viewBox="0 0 320 230" aria-hidden="true"><g fill="none" stroke="#efbe8b"><circle cx="188" cy="106" r="100"/><circle cx="188" cy="106" r="80"/><path d="M50 210 280 12M94 230 320 34"/></g><g transform="rotate(-18 187 100)"><circle cx="190" cy="95" r="66" fill="#f99235" stroke="#b7561b" stroke-width="3"/><path d="M124 95h132M190 29v132M144 47c55 10 64 86 9 103M227 41c-53 23-54 87-6 112" stroke="#a74918" stroke-width="3" fill="none"/></g><g transform="rotate(21 92 166)"><rect x="39" y="127" width="109" height="67" rx="29" fill="#223957"/><path d="M62 148v23M50 159h24" stroke="#fff" stroke-width="5"/><circle cx="122" cy="153" r="5" fill="#fb9b50"/><circle cx="112" cy="166" r="5" fill="#91b7aa"/></g><g transform="rotate(14 263 166)"><rect x="236" y="136" width="54" height="54" rx="10" fill="#fff" stroke="#ddc6b0"/><g fill="#203750"><circle cx="249" cy="149" r="3"/><circle cx="277" cy="149" r="3"/><circle cx="263" cy="163" r="3"/><circle cx="249" cy="177" r="3"/><circle cx="277" cy="177" r="3"/></g></g></svg>`;
const navGroups = [
  { id: 'management', label: 'Management', emoji: '📦', items: [['Equipment', 'Inventory'], ['Customers', 'Customers'], ['Rates & Fees', 'Rates & Fees']] },
  { id: 'transactions', label: 'Transactions', emoji: '🔄', items: [['Rentals', 'Rentals'], ['Returns', 'Returns'], ['Transaction History', 'Transaction History']] },
  { id: 'operations', label: 'Operations', emoji: '🔧', items: [['Maintenance', 'Maintenance'], ['ESP32 / Verification', 'ESP32 terminal']] }
];
const navGroupExpanded = Object.fromEntries(navGroups.map(group => [group.id, true]));
try {
  const savedNavGroups = JSON.parse(localStorage.getItem('rent-play-nav-groups') || '{}');
  for (const group of navGroups) if (typeof savedNavGroups[group.id] === 'boolean') navGroupExpanded[group.id] = savedNavGroups[group.id];
} catch { }
const pageLabels = { Inventory: 'Equipment', 'ESP32 terminal': 'ESP32 / Verification' };
const workspacePages = new Set(['Customers', 'Rates & Fees', 'Rentals', 'Returns', 'Transaction History', 'Maintenance', 'Reports', 'Settings', 'ESP32 terminal']);
const dashboardSnapshot = value => value ? JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'refreshedAt'))) : '';
let user = null, data = null, page = pageForPath(location.pathname), filter = 'All rentals', query = '', period = 'This week', category = '', connectionError = '', toastTimer, refreshing = false, manualRefreshPending = false, rentalPage = 0, verificationPage = 0;
let rentalEventSource = null, rentalEventAccount = null, rentalEventsDisabled = false, rentalEventSyncTimer = null, rentalEventSyncing = false, rentalEventSyncPending = false;
const liveRentalPages = new Set(['Rentals', 'Returns', 'Transaction History']);
let profileEditing = false;
let theme = document.documentElement.dataset.theme || 'light';
let sidebarCollapsed = false;
try { sidebarCollapsed = localStorage.getItem('rent-play-sidebar-collapsed') === 'true'; } catch { }

function configureSidebar() {
  const sidebar = document.querySelector('.sidebar'), workspace = document.querySelector('.workspace'), toggle = document.querySelector('#mobile-menu');
  sidebar.id = 'workspace-navigation'; toggle.setAttribute('aria-controls', sidebar.id);
  sidebar.querySelectorAll('nav button,.sidebar-bottom>button').forEach(button => {
    const group = navGroups.find(item => item.id === button.dataset.navGroup);
    const name = group?.label || (button.dataset.page === 'Settings' ? 'Settings' : button.dataset.page || button.textContent.trim()); button.setAttribute('aria-label', name); button.title = name;
    if (button.dataset.page) { button.classList.toggle('active', button.dataset.page === page); if (button.dataset.page === page) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
    for (const node of Array.from(button.childNodes)) if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      const span = document.createElement('span'); span.className = 'sidebar-label'; span.textContent = node.textContent; node.replaceWith(span);
    }
  });
  const backdrop = document.createElement('button'); backdrop.className = 'sidebar-backdrop'; backdrop.setAttribute('aria-label', 'Close navigation'); backdrop.hidden = true; workspace.append(backdrop);
  function update(open = false) {
    const mobile = window.matchMedia('(max-width:720px)').matches;
    workspace.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    sidebar.classList.toggle('open', mobile && open); backdrop.hidden = !(mobile && open);
    sidebar.inert = mobile && !open;
    document.querySelector('.workspace-body').inert = mobile && open;
    toggle.setAttribute('aria-expanded', String(mobile ? open : !sidebarCollapsed));
    const label = mobile ? (open ? 'Close navigation' : 'Open navigation') : (sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    toggle.setAttribute('aria-label', label); toggle.title = label;
  }
  toggle.onclick = () => {
    if (window.matchMedia('(max-width:720px)').matches) {
      const opening = !sidebar.classList.contains('open'); update(opening);
      if (opening) sidebar.querySelector('.active,nav button')?.focus();
    }
    else { sidebarCollapsed = !sidebarCollapsed; try { localStorage.setItem('rent-play-sidebar-collapsed', String(sidebarCollapsed)); } catch { } update(); }
  };
  backdrop.onclick = () => { update(); toggle.focus(); };
  sidebar.onkeydown = event => {
    if (event.key === 'Escape') { update(); toggle.focus(); }
    if (event.key === 'Tab' && sidebar.classList.contains('open')) {
      const controls = [...sidebar.querySelectorAll('a,button,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      const next = event.shiftKey ? controls.at(-1) : controls[0];
      if (event.shiftKey && document.activeElement === controls[0] || !event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); next?.focus(); }
    }
  };
  toggle.onkeydown = event => { if (event.key === 'Escape') update(); };
  window.onresize = () => update(); update();
}

function setTheme(next) {
  theme = next === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('rent-play-theme', theme); } catch {/* Theme still works if storage is unavailable. */ }
  updateThemeControls();
}
function updateThemeControls() {
  const button = document.querySelector('#login-theme');
  if (button) {
    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    button.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    button.setAttribute('aria-label', label); button.title = label;
  }
  const toggle = document.querySelector('#dark-mode');
  if (toggle) toggle.setAttribute('aria-checked', String(theme === 'dark'));
  const status = document.querySelector('#theme-status');
  if (status) status.textContent = theme === 'dark' ? 'Dark mode is on' : 'Light mode is on';
}
function appearanceSettings() {
  return `<section class="appearance-settings" aria-label="Appearance settings"><p>A comfortable workspace, day or night.</p><div class="theme-setting"><span class="theme-setting-icon">${icon('moon')}</span><div><label id="dark-mode-label">Dark mode</label><small>Use a softer, darker palette across your workspace.</small></div><button id="dark-mode" class="theme-switch" type="button" role="switch" aria-labelledby="dark-mode-label" aria-checked="${theme === 'dark'}"><span></span></button></div><div class="theme-preference-note"><span id="theme-status" role="status">${theme === 'dark' ? 'Dark mode is on' : 'Light mode is on'}</span><small>Saved on this browser · Applies to login and dashboard</small></div></section>`;
}

async function api(path, options = {}) {
  let result;
  try { result = await apiClient.request(path, options); }
  catch (error) { if (error.code === 'PASSWORD_CHANGE_REQUIRED' && user) { user.mustChangePassword = true; requiredPasswordChange(); } else if (error.status === 401 && user && !path.startsWith('/auth/')) endSession(); throw error; }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(options.method || 'GET').toUpperCase()) && path !== '/pricing/quote' && !path.startsWith('/notifications') && !path.startsWith('/auth/')) invalidateWorkspace();
  return result;
}
function toast(message) {
  const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}
function goTo(next, replace = false, nextFilter = 'All rentals', nextCategory = '') {
  if (workspacePages.has(next)) invalidateWorkspace();
  page = next; profileEditing = false; category = nextCategory; filter = nextFilter; query = ''; rentalPage = 0; verificationPage = 0;
  const route = pageRoutes[next] || '/'; if (location.pathname !== route) history[replace ? 'replaceState' : 'pushState']({ page: next }, '', route);
  const group = navGroups.find(group => group.items.some(([, target]) => target === next));
  if (group) navGroupExpanded[group.id] = true;
  render(); window.scrollTo(0, 0); document.querySelector('#workspace-content')?.focus({ preventScroll: true });
}
function updateModalLayout() {
  const form = modal.querySelector(':scope > .admin-form:not(.pricing-form):not(.customer-form):not(.rental-release-form)');
  const fields = form ? [...form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea')].filter(field => !field.closest('[hidden]')) : [];
  modal.classList.toggle('modal-compact', Boolean(form) && fields.length <= 4);
}
const modalLayoutObserver = new MutationObserver(updateModalLayout);
modalLayoutObserver.observe(modal, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'type'] });

function showModal(title, body) {
  confirmation.cancel();
  modal.innerHTML = `<div class="modal-heading"><h2>${escape(title)}</h2><button class="icon-button" id="close-modal" aria-label="Close dialog">✕</button></div>${body}`;
  modal.setAttribute('aria-label', title);
  updateModalLayout();
  modal.showModal(); document.querySelector('#close-modal').onclick = () => modal.close();
}
function stopRentalEventStream() {
  rentalEventSource?.close();
  rentalEventSource = null;
  rentalEventAccount = null;
  rentalEventsDisabled = false;
  rentalEventSyncPending = false;
  clearTimeout(rentalEventSyncTimer);
  rentalEventSyncTimer = null;
}
function scheduleRentalEventSync() {
  clearTimeout(rentalEventSyncTimer);
  rentalEventSyncTimer = setTimeout(async () => {
    rentalEventSyncTimer = null;
    if (!user || user.mustChangePassword || logoutPending) return;
    if (!apiClient.canRefresh() || document.visibilityState !== 'visible' || modal.open) {
      rentalEventSyncPending = true;
      return;
    }
    if (rentalEventSyncing) { rentalEventSyncPending = true; return; }
    rentalEventSyncPending = false;
    rentalEventSyncing = true;
    try {
      await rentalNotifications.refresh();
      if (page === 'Dashboard' || page === 'ESP32 terminal') await refresh();
      else if (liveRentalPages.has(page)) {
        const refreshedPage = page;
        const changed = await workspaceUI.refresh();
        if (modal.open) rentalEventSyncPending = true;
        else if (changed && page === refreshedPage && user) render();
      }
    } catch (problem) {
      if (problem.status === 429 || !apiClient.canRefresh()) rentalEventSyncPending = true;
      if (problem.status !== 401) toast(problem.message);
    } finally {
      rentalEventSyncing = false;
      if (rentalEventSyncPending && document.visibilityState === 'visible' && !modal.open && apiClient.canRefresh()) scheduleRentalEventSync();
    }
  }, 180);
}
modal.addEventListener('close', () => {
  if (rentalEventSyncPending) scheduleRentalEventSync();
});
function syncRentalEventStream(accountId) {
  if (rentalEventAccount !== accountId) {
    rentalEventSource?.close();
    rentalEventSource = null;
    rentalEventAccount = accountId;
    rentalEventsDisabled = false;
    rentalEventSyncPending = false;
    clearTimeout(rentalEventSyncTimer);
    rentalEventSyncTimer = null;
  }
  if (!accountId || rentalEventsDisabled || typeof EventSource === 'undefined' || rentalEventSource && rentalEventSource.readyState !== EventSource.CLOSED) return;
  const source = new EventSource('/api/rental-events');
  let receivedReady = false;
  rentalEventSource = source;
  source.addEventListener('ready', () => {
    if (receivedReady) scheduleRentalEventSync();
    receivedReady = true;
  });
  source.addEventListener('rental.changed', scheduleRentalEventSync);
  source.onerror = () => {
    if (rentalEventSource === source && source.readyState === EventSource.CLOSED) {
      rentalEventsDisabled = true;
      rentalEventSource = null;
    }
  };
}
function endSession() {
  if (!user) return;
  confirmation.cancel(); user = null; data = null; connectionError = '';
  stopRentalEventStream();
  rentalNotifications.setAccount(null);
  inventoryController.reset(); workspaceUI.reset(); modal.close(); login('Your session ended. Please sign in again.');
}
function pageHeading() {
  const [caption, description, glyph] = pageInfo[page] || pageInfo.Dashboard;
  return `<header class="page-heading"><div class="page-heading-copy"><span class="page-eyebrow">${escape(caption)}</span><h1>${escape(pageLabels[page] || page)}</h1>${description ? `<p>${escape(description)}</p>` : ''}</div><span class="page-heading-icon" aria-hidden="true">${icon(glyph)}</span></header>`;
}
function sessionLoading() {
  app.innerHTML = `<main class="session-loading" aria-live="polite"><div class="session-loading-card"><img class="session-logo" src="/public/logo.png" alt="Rent and Play"/><div class="session-brand-copy"><strong>rent<span class="orange">&</span>play</strong><small>RENTAL MANAGEMENT</small></div><span class="session-spinner" aria-hidden="true"></span><p>Opening your workspace…</p></div></main>`;
}
function notificationFingerprint() {
  if (!data) return '';
  return [...data.rentals.filter(r => r.displayStatus === 'Overdue').map(r => `r:${r.id}:${r.due_at}`), ...data.pending.map(r => `v:${r.id}:${r.requested_at}`)].sort().join('|');
}
function notificationRows() {
  const overdue = data?.rentals.filter(r => r.displayStatus === 'Overdue') || [], pending = data?.pending || [];
  const state = rentalNotifications.state();
  return `${state.loading ? '<p class="notification-feedback">Loading rental updates…</p>' : ''}${state.error ? `<p class="notification-feedback" role="alert">${escape(state.error)} <button type="button" data-notification-retry>Retry</button></p>` : ''}${renderRentalNotifications(state, { escape, formatDate })}${overdue.map(r => `<button type="button" data-notification-page="Rentals"><span class="notification-mark overdue-mark">!</span><span><strong>Overdue rental · ${escape(r.item_name)}</strong><small>${escape(r.customer)} · Due ${escape(formatDate(r.due_at))}</small></span>${icon('arrow')}</button>`).join('')}${pending.map(r => `<button type="button" data-notification-page="ESP32 terminal"><span class="notification-mark pending-mark">•</span><span><strong>Verification waiting · ${escape(r.item_name)}</strong><small>${escape(r.customer)} · ${escape(r.transaction_type)}</small></span>${icon('arrow')}</button>`).join('')}${state.nextCursor ? '<button type="button" class="notification-load-more" data-notification-older>Load older updates</button>' : ''}${!state.loading && !state.error && !state.notifications.length && !overdue.length && !pending.length ? '<div class="workspace-empty"><h3>You’re all caught up</h3><p>New booking and return updates will appear here.</p></div>' : ''}`;
}
function notificationsMenu(showDot) {
  return `<div class="notification-menu"><button type="button" class="icon-button notification" id="notifications" aria-label="View notifications" aria-expanded="false" aria-controls="notification-dropdown">${icon('bell')}${showDot ? '<i></i>' : ''}</button><section class="notification-dropdown" id="notification-dropdown" aria-label="Notifications" hidden><header class="notification-dropdown-heading"><h2>Notifications</h2><span id="notification-count"></span></header><div class="notification-toolbar"><button type="button" class="text-button" data-notification-mark-read>Mark shown as read</button></div><div class="notification-list"></div></section></div>`;
}
function closeNotifications(restoreFocus = false) {
  const dropdown = document.querySelector('#notification-dropdown'), button = document.querySelector('#notifications');
  if (dropdown) dropdown.hidden = true;
  button?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) button?.focus();
}
function syncNotifications() {
  const dropdown = document.querySelector('#notification-dropdown'), list = dropdown?.querySelector('.notification-list');
  if (!list) return;
  const state = rentalNotifications.state();
  const snapshot = JSON.stringify([state, data?.rentals.filter(r => r.displayStatus === 'Overdue') || [], data?.pending || []]);
  // Keep a focused notification in place until the user leaves it.
  if (list.dataset.snapshot !== snapshot && !list.contains(document.activeElement)) {
    list.innerHTML = notificationRows(); list.dataset.snapshot = snapshot;
  }
  dropdown.querySelector('#notification-count').textContent = state.unreadCount ? `${state.unreadCount} unread` : 'No unread updates';
  dropdown.querySelector('[data-notification-mark-read]').disabled = !state.unreadCount;
  const bell = document.querySelector('#notifications');
  bell.querySelector('.notification-count-badge')?.remove();
  if (state.unreadCount) {
    bell.querySelector('i')?.remove();
    bell.insertAdjacentHTML('beforeend', `<span class="notification-count-badge" aria-label="${state.unreadCount} unread updates">${state.unreadCount > 99 ? '99+' : state.unreadCount}</span>`);
  }
}
function openNotifications() {
  const dropdown = document.querySelector('#notification-dropdown');
  if (!dropdown) return;
  if (!dropdown.hidden) { closeNotifications(); return; }
  syncNotifications(); dropdown.hidden = false;
  rentalNotifications.refresh();
  document.querySelector('#notifications').setAttribute('aria-expanded', 'true');
  try { localStorage.setItem('rent-play-notifications-seen', notificationFingerprint()); } catch { }
  document.querySelector('.notification i')?.remove();
}
modal.addEventListener('click', e => {
  if (e.target !== modal) return;
  const r = modal.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close();
});
function login(message = '') {
  document.title = 'Sign in · Rent & Play';
  app.innerHTML = `<main class="login"><section class="login-story"><a class="brand" href="#">${brand}</a><div class="story-body"><span class="eyebrow">LESS PAPERWORK. MORE PLAY.</span><h1>Good times.<br/>Greatly managed<span class="orange">.</span></h1><p>Your equipment, rentals, and returns.<br/>All together in one happy place.</p><div class="login-art">${sportArt}</div><div class="story-features"><span>${icon('box')} Know what’s available</span><span>${icon('clock')} Stay ahead of due dates</span><span>${icon('chip')} Verify every handoff</span></div></div><footer>Made for Rent & Play <span>Los Baños, Laguna</span></footer></section><section class="login-form-side"><span class="workspace-label">OWNER / OPERATOR WORKSPACE</span><div class="login-form-wrap"><div class="welcome-icon">${icon('grid')}</div><h2>Welcome back!</h2><p>Sign in to manage your rentals.</p><form id="login-form"><label for="email">Email address</label><input id="email" type="email" autocomplete="username" maxlength="254" required/><div class="label-line"><label for="password">Password</label><button class="text-button" type="button" id="forgot">Forgot password?</button></div><div class="password-field"><input id="password" type="password" autocomplete="current-password" placeholder="Enter your password" maxlength="1024" required/><button type="button" id="show-password" aria-label="Show password">${icon('eye')}</button></div><label class="checkbox"><input id="remember" type="checkbox"/> Remember me on this device</label><p id="login-error" role="alert">${escape(message)}</p><button class="primary login-submit" type="submit">Sign in</button></form><p class="login-foot">Your account. Your equipment. Your workspace.</p></div><footer>© ${new Date().getFullYear()} Rent & Play <span>Built for more play.</span></footer></section></main>`;
  const loginHeader = document.createElement('div'); loginHeader.className = 'login-header';
  const workspaceLabel = document.querySelector('.workspace-label'); workspaceLabel.textContent = 'OWNER / OPERATOR WORKSPACE'; workspaceLabel.before(loginHeader);
  loginHeader.append(workspaceLabel);
  const themeButton = document.createElement('button'); themeButton.id = 'login-theme'; themeButton.className = 'theme-button'; themeButton.type = 'button';
  loginHeader.append(themeButton); themeButton.onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark'); updateThemeControls();
  document.querySelector('#show-password').onclick = e => {
    const input = document.querySelector('#password'); input.type = input.type === 'password' ? 'text' : 'password';
    e.currentTarget.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
  };
  document.querySelector('#forgot').onclick = () => {
    showModal('Reset your password', `<p>Enter the email registered to your account. Review the address before requesting the reset link.</p><form id="reset-form" class="admin-form"><label>Account email<input name="email" type="email" autocomplete="email" maxlength="254" value="${escape(document.querySelector('#email').value)}" required/></label><p class="form-error" role="alert"></p><button class="primary" type="submit">Send reset link</button></form>`);
    const form = modal.querySelector('#reset-form');
    bindAccountValidation(form, { email: emailError });
    confirmSubmit(form, () => ({ title: 'Send password reset link?', description: `Request a reset link for ${form.elements.email.value}?`, confirmLabel: 'Send reset link' }), async () => {
      const button = form.querySelector('button'), error = form.querySelector('.form-error'); button.disabled = true; button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Sending…';
      try {
        const result = await api('/auth/password-reset', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        modal.close();
        showModal('Check your email', `<div class="reset-instructions"><p>If an account exists for <strong>${escape(result.email)}</strong>, a reset link has been requested for that address.</p><ol><li>Open the email from Rent & Play. Check your spam folder too.</li><li>Follow the link and choose a new password.</li><li>Return to login and use your new password.</li></ol><button type="button" class="primary" data-reset-close>Back to login</button></div>`);
        modal.querySelector('[data-reset-close]').onclick = () => modal.close();
      } catch (problem) { error.textContent = problem.message; button.disabled = false; button.textContent = 'Send reset link'; }
    });
  };
  const loginValidation = bindAccountValidation(document.querySelector('#login-form'), { email: emailError, password: value => value ? '' : 'Enter your password.' });
  document.querySelector('#login-form').onsubmit = async e => {
    e.preventDefault(); if (!loginValidation.validate()) return;
    const form = e.currentTarget, button = form.querySelector('[type="submit"]'); if (button.disabled) return;
    const body = { email: form.querySelector('#email').value, password: form.querySelector('#password').value, remember: form.querySelector('#remember').checked };
    const loginStarted = performance.now();
    const controls = [...form.querySelectorAll('input, button')]; controls.forEach(control => control.disabled = true);
    button.setAttribute('aria-busy', 'true'); button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Logging in…';
    rememberSession = document.querySelector('#remember').checked;
    document.querySelector('#login-error').textContent = '';
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(body) });
      user = result.user; page = pageForPath(location.pathname); history.replaceState({ page }, '', pageRoutes[page]); await refresh();
    } catch (error) {
      const el = document.querySelector('#login-error'); if (el) el.textContent = error.message;
    } finally {
      // Brief responses still give visible feedback; longer requests add no delay.
      const remaining = 500 - (performance.now() - loginStarted);
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
      controls.forEach(control => control.disabled = false); button.removeAttribute('aria-busy'); button.textContent = 'Sign in';
    }
  };
}

function requiredPasswordChange() {
  if (!user) return;
  document.title = 'Secure your account · Rent & Play';
  rentalNotifications.setAccount(null);
  app.innerHTML = `<main class="password-change-page"><section class="password-change-card"><img class="session-logo" src="/public/logo.png" alt="Rent & Play"/><h1>Secure your account</h1><p>Choose your own password before opening your ${user.role === 'OWNER' ? 'Owner' : 'Operator'} workspace.</p><form id="required-password-form" class="admin-form"><label>Current / temporary password<input name="currentPassword" type="password" autocomplete="current-password" maxlength="1024" required/></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required/><small>${passwordHelp}</small></label><label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" maxlength="128" required/></label><label class="checkbox"><input type="checkbox" id="change-show-passwords"/> Show passwords</label><p class="form-error" role="alert"></p><button class="primary" type="submit">Update password</button><button type="button" class="secondary" id="change-signout">Sign out</button></form></section></main>`;
  const form = document.querySelector('#required-password-form');
  const validation = bindAccountValidation(form, {
    currentPassword: value => value ? '' : 'Enter your current or temporary password.',
    newPassword: value => passwordError(value) || (value === form.elements.currentPassword.value ? 'Choose a different password.' : ''),
    confirmPassword: value => passwordMatchError(form.elements.newPassword.value, value)
  });
  document.querySelector('#change-show-passwords').onchange = event => form.querySelectorAll('[autocomplete$="password"]').forEach(input => input.type = event.target.checked ? 'text' : 'password');
  document.querySelector('#change-signout').onclick = async event => {
    const buttons = [...form.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
    try { await api('/auth/logout', { method: 'POST' }); endSession(); }
    catch (problem) { form.querySelector('.form-error').textContent = problem.message; }
    finally { buttons.forEach(button => button.disabled = false); }
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (!validation.validate()) return;
    const button = form.querySelector('[type="submit"]'); if (button.disabled) return;
    const body = { ...Object.fromEntries(new FormData(form)), remember: rememberSession };
    const controls = [...form.querySelectorAll('input, button')]; controls.forEach(control => control.disabled = true);
    button.setAttribute('aria-busy', 'true'); button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Updating password…';
    form.querySelector('.form-error').textContent = '';
    try {
      const result = await api('/auth/change-password', { method: 'POST', body: JSON.stringify(body) });
      if (result.signInAgain) { endSession(); login('Password updated. Sign in with your new password.'); return; }
      user = result.user; await refresh(); toast('Your password has been updated.');
    } catch (problem) { if (form.isConnected) form.querySelector('.form-error').textContent = problem.message; }
    finally { controls.forEach(control => control.disabled = false); button.removeAttribute('aria-busy'); button.textContent = 'Update password'; }
  };
}
async function refresh({ force = false } = {}) {
  if (user?.mustChangePassword) { requiredPasswordChange(); return; }
  if (!user || refreshing) return;
  const sessionUser = user;
  refreshing = true;
  try {
    const nextData = await api('/dashboard', force ? { headers: { 'Cache-Control': 'no-cache' } } : {}), changed = dashboardSnapshot(data) !== dashboardSnapshot(nextData);
    if (user !== sessionUser) return;
    data = nextData; connectionError = '';
    // Decide after the request completes: navigation can happen while the dashboard is loading.
    // If Equipment is now visible, keep its mounted UI and update just its data.
    const preserveInventory = page === 'Inventory' && !!document.querySelector('#inventory-root');
    if (preserveInventory) {
      syncLiveWorkspaceChrome();
      await inventoryController.refresh();
      syncLiveWorkspaceChrome();
    } else if (!document.querySelector('.workspace') || (changed && ['Dashboard', 'ESP32 terminal'].includes(page))) render();
    else syncLiveWorkspaceChrome();
  }
  catch (error) {
    if (error.status === 401) endSession();
    else {
      connectionError = error.message;
      if (document.querySelector('.workspace')) syncLiveWorkspaceChrome();
      else render();
    }
  } finally { refreshing = false; }
}
function syncLiveWorkspaceChrome() {
  const content = document.querySelector('.content');
  if (!content) return;
  let banner = content.querySelector('.dashboard-connection-banner');
  if (connectionError) {
    if (!banner) { banner = document.createElement('div'); banner.className = 'connection-banner dashboard-connection-banner'; banner.setAttribute('role', 'alert'); content.prepend(banner); }
    banner.textContent = `${connectionError}${data ? ' Showing the last successfully loaded records.' : ''}`;
  } else banner?.remove();
  const updated = content.querySelector('.content-footer span:last-child');
  if (updated) updated.textContent = data ? `Updated ${new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(data.refreshedAt))}` : 'Waiting for database';
  const status = document.querySelector('.demo-status');
  if (status) { status.querySelector('strong').textContent = connectionError ? 'Connection interrupted' : 'Connected workspace'; status.querySelector('small').textContent = data ? 'Cloud Firestore records' : 'Waiting for database'; }
  const rentalCount = document.querySelector('.nav-count');
  if (rentalCount) rentalCount.textContent = data?.rentals?.length ?? '–';
  const notifications = document.querySelector('#notifications'), seen = (() => { try { return localStorage.getItem('rent-play-notifications-seen') || ''; } catch { return ''; } })();
  if (notifications) {
    const shouldShow = !!notificationFingerprint() && notificationFingerprint() !== seen, dot = notifications.querySelector('i');
    if (shouldShow && !dot) notifications.insertAdjacentHTML('beforeend', '<i></i>');
    else if (!shouldShow) dot?.remove();
  }
  syncNotifications();
}
const empty = (heading, message, glyph = 'box') => `<div class="empty-state">${icon(glyph)}<h3>${heading}</h3><p>${message}</p></div>`;
function stat(label, value, note, glyph, color, page, target = '', filter = '') {
  const targetAttribute = target ? `data-target="${escape(target)}"` : '';
  const filterAttribute = filter ? `data-filter="${escape(filter)}"` : '';
  return `<button type="button" class="stat stat-link" data-page="${escape(page)}" ${targetAttribute} ${filterAttribute} aria-label="${escape(`${label}: ${value}. ${note}`)}"><div><span>${escape(label)}</span><span class="stat-icon ${color}">${icon(glyph)}</span></div><strong>${escape(value)}</strong><small>${escape(note)}</small></button>`;
}
function rentalsTable(full = false) {
  const pageSize = 5, allRows = data.rentals.filter(r => (filter === 'All rentals' || r.displayStatus === filter) && `${r.customer} ${r.rental_code} ${r.item_name}`.toLowerCase().includes(query.toLowerCase())), pageCount = Math.max(1, Math.ceil(allRows.length / pageSize)); rentalPage = Math.min(rentalPage, pageCount - 1); const start = rentalPage * pageSize, rows = allRows.slice(start, start + pageSize);
  return `<section class="panel rental-panel" id="rental-panel"><div class="panel-title"><div><h3>${full ? 'Open rental records' : 'Rentals to keep an eye on'}</h3><p>Active rentals and requests awaiting verification.</p></div><div class="rental-panel-actions"><button type="button" class="secondary" id="rental-workflow">${icon('arrow')} Rental workflow</button>${!full ? '<button class="text-button" data-page="Rentals">View all rentals →</button>' : ''}</div></div><div class="table-controls"><div class="tabs">${['All rentals', 'Due today', 'Overdue'].map(x => `<button data-filter="${x}" class="${filter === x ? 'selected' : ''}">${x}${x === 'Overdue' ? `<span>${data.stats.overdue}</span>` : ''}</button>`).join('')}</div><label class="table-search">${icon('search')}<input id="rental-search" placeholder="Search rentals" value="${escape(query)}" aria-label="Search rentals"/></label></div><div class="table-scroll"><table><thead><tr><th>ITEM / RENTAL ID</th><th>CUSTOMER</th><th>DUE DATE</th><th>STATUS</th><th></th></tr></thead><tbody>${rows.map(r => `<tr ${recordAttrs('dashboard-rental', r.id, r.rental_code || r.item_name)}><td><div class="item-cell"><span class="item-symbol">${symbol(data.items.find(i => String(i.id) === String(r.item_id))?.category || '')}</span><div><strong>${escape(r.item_name)}</strong><small>${escape(r.rental_code)}</small></div></div></td><td><span class="mini-avatar">${escape(initials(r.customer))}</span>${escape(r.customer)}</td><td><strong>${escape(formatDate(r.due_at))}</strong><small>Philippine time</small></td><td>${badge(r.displayStatus)}</td><td><button class="row-button" data-rental="${escape(r.id)}" aria-label="View ${escape(r.rental_code)}">${icon('arrow')}</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No open rentals match this view.</td></tr>'}</tbody></table></div><div class="table-footer"><span>${allRows.length ? `${start + 1}–${Math.min(start + pageSize, allRows.length)} of ${allRows.length}` : '0 rentals'} · Page ${allRows.length ? rentalPage + 1 : 0} of ${Math.ceil(allRows.length / pageSize)}</span><div class="inv-pagination"><button class="secondary" id="rental-prev" ${rentalPage ? '' : 'disabled'}>← Previous</button><button class="secondary" id="rental-next" ${start + pageSize < allRows.length ? '' : 'disabled'}>Next →</button></div></div></section>`;
}
function chart() {
  const amounts = data.revenue[period]; const max = Math.max(100, ...amounts); const scale = Math.ceil(max / 100) * 100;
  return `<section class="panel revenue-panel"><div class="panel-title"><div><h3>Confirmed rental fees</h3><p>Grouped by the date each rental was confirmed.</p></div><div class="revenue-actions"><select id="period" aria-label="Revenue period"><option ${period === 'This week' ? 'selected' : ''}>This week</option><option ${period === 'Last week' ? 'selected' : ''}>Last week</option></select><button class="text-button" data-page="Reports">Detailed analytics →</button></div></div><div class="revenue-total">${money(amounts.reduce((a, b) => a + b, 0))}<span>Recorded rental charges</span></div><div class="chart"><div class="axis">${[1, .75, .5, .25, 0].map(x => `<span>${money(scale * x)}</span>`).join('')}</div><div class="bars">${amounts.map((amount, i) => `<div class="bar-column"><div class="bar ${amount === max ? 'highlight' : ''}" style="height:${amount / scale * 100}%" title="${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}: ${money(amount)}"></div><span>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span></div>`).join('')}</div></div>${amounts.every(v => v === 0) ? '<p class="chart-empty">No confirmed rental fees in this period.</p>' : ''}</section>`;
}
function terminal() {
  const t = data.terminals[0]; const queue = t ? data.pending.filter(p => p.terminal_code === t.terminal_code) : [];
  return `<section class="panel terminal-panel"><div class="panel-title"><h3>${icon('chip')} ESP32 terminal</h3><span class="offline-dot">Standby</span></div><div class="device"><span>${escape(t?.terminal_code || 'HARDWARE NOT CONNECTED')}</span><strong>ON STANDBY</strong><small>${escape(t?.name || 'Ready for future hardware setup')}</small><div class="device-led"></div></div><div class="terminal-meta"><span>Saved pending attempts</span><strong>${queue.length}</strong></div><p class="terminal-note">${icon('chip')} Admin confirms current releases and returns. The terminal is reserved for later hardware integration.</p><button class="secondary wide" data-page="ESP32 terminal">View terminal records ${icon('arrow')}</button></section>`;
}
function dashboard() {
  const s = data.stats;
  return `<div class="stats">${stat('Active rentals', s.active, 'Confirmed rentals currently out', 'clock', 'blue', 'Rentals')}${stat('Available items', s.available, 'Ready for their next adventure', 'box', 'green', 'Inventory')}${stat('Due today', s.dueToday, `${s.overdue} overdue rental(s) need attention`, 'bell', 'amber', 'Dashboard', 'rental-panel', 'Due today')}${stat('Rental fees', money(s.fees), 'From current active rentals', 'money', 'purple', 'Rentals')}</div><div class="dashboard-grid"><div class="main-column">${rentalsTable()}${chart()}</div><aside class="right-column">${terminal()}<section class="panel category-panel"><h3>A little of everything</h3><p>Your equipment at a glance.</p>${data.categories.map((c, i) => `<button data-category="${i}"><span class="category-symbol">${symbol(c.name)}</span><span>${escape(c.name)}<small>${c.count} items in inventory</small></span>${icon('arrow')}</button>`).join('') || '<p>No categories recorded.</p>'}</section><div class="counter-tip"><span>✦</span><div><strong>A small counter tip</strong><p>Check item condition before confirming a return.</p></div></div></aside></div>`;
}
function inventory() {
  return `<div id="inventory-root" class="inv-loading-shell" aria-live="polite" aria-busy="true">
    <div class="inv-loading-copy"><span class="inv-loading-spinner" aria-hidden="true"></span><div><strong>Loading your equipment</strong><small>Getting your collection and availability ready…</small></div></div>
    <div class="inv-loading-stats" aria-hidden="true">${Array.from({length:4},()=>`<div class="panel inv-stat inv-skeleton-stat"><span class="inv-skeleton-block inv-skeleton-icon"></span><div><i class="inv-skeleton-block inv-skeleton-label"></i><i class="inv-skeleton-block inv-skeleton-value"></i></div></div>`).join('')}</div>
    <section class="panel inv-collection inv-loading-collection" aria-hidden="true">
      <div class="inv-loading-toolbar"><i class="inv-skeleton-block inv-skeleton-search"></i><div><i class="inv-skeleton-block inv-skeleton-button"></i><i class="inv-skeleton-block inv-skeleton-button short"></i><i class="inv-skeleton-block inv-skeleton-add"></i></div></div>
      <div class="inv-loading-filters"><i class="inv-skeleton-block inv-skeleton-filter"></i><i class="inv-skeleton-block inv-skeleton-filter"></i><i class="inv-skeleton-block inv-skeleton-filter sort"></i><i class="inv-skeleton-block inv-skeleton-reset"></i><i class="inv-skeleton-block inv-skeleton-count"></i></div>
      <div class="inv-loading-table"><div class="inv-loading-table-head"><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i></div>${Array.from({length:5},()=>`<div class="inv-loading-row"><div class="inv-loading-equipment"><i class="inv-skeleton-block inv-skeleton-thumb"></i><div><i class="inv-skeleton-block inv-skeleton-name"></i><i class="inv-skeleton-block inv-skeleton-code"></i></div></div><div><i class="inv-skeleton-block inv-skeleton-status"></i><i class="inv-skeleton-block inv-skeleton-condition"></i></div><i class="inv-skeleton-block inv-skeleton-price"></i></div>`).join('')}</div>
      <div class="inv-loading-footer"><i class="inv-skeleton-block"></i><div><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i></div></div>
    </section>
  </div>`;
}
function profile() {
  const details = profileEditing ? `<section class="panel profile-form-card"><span class="eyebrow">EDIT PROFILE</span><h2>Update your details</h2><p>Your name appears throughout the workspace. Your email is also your Firebase login.</p><form id="profile-form" class="profile-form"><label>Full name<input name="fullName" value="${escape(user.name)}" minlength="2" maxlength="150" autocomplete="name" required/></label><label>Login email<input name="email" type="email" value="${escape(user.email)}" maxlength="254" autocomplete="email" required/></label><label>Role<input value="${escape(user.role)}" disabled/><small>Account roles are managed separately for security.</small></label><p class="profile-error" role="alert"></p><div class="profile-actions"><button class="secondary" id="profile-cancel" type="button">Cancel</button><button class="primary" type="submit">Save changes</button></div></form></section>` : `<section class="panel profile-overview"><div class="profile-overview-heading"><button class="primary" id="profile-edit" type="button">Edit profile</button></div><dl class="profile-details"><div><dt>Full name</dt><dd>${escape(user.name)}</dd></div><div><dt>Login email</dt><dd>${escape(user.email)}</dd></div><div><dt>Account role</dt><dd>${escape(user.role)}</dd></div><div><dt>Account status</dt><dd><span class="profile-active">Active</span></dd></div></dl><div class="profile-note"><strong>Login details</strong><p>If you change the email address, use the new email the next time you sign in.</p></div></section>`;
  return `<div class="profile-layout"><section class="panel profile-card"><span class="profile-avatar">${escape(initials(user.name))}</span><h2>${escape(user.name)}</h2><p>${escape(user.email)}</p><span class="profile-role">${escape(user.role)}</span><small>Account ID</small><code>${escape(user.id)}</code></section>${details}</div>`;
}
function render() {
  if (!user) return;
  if (user.mustChangePassword) { stopRentalEventStream(); requiredPasswordChange(); return; }
  syncRentalEventStream(user.id);
  rentalNotifications.setAccount(user.id);
  const existingInventory = page === 'Inventory' ? document.querySelector('#inventory-root') : null;
  const previousFocus = app.contains(document.activeElement) ? document.activeElement : null;
  const focusId = previousFocus?.id || '';
  const scrollX = window.scrollX, scrollY = window.scrollY, sidebarScroll = document.querySelector('.sidebar')?.scrollTop;
  let selection = null;
  try { if (previousFocus && typeof previousFocus.selectionStart === 'number') selection = [previousFocus.selectionStart, previousFocus.selectionEnd]; } catch { }
  const body = !data ? `<section class="panel">${empty('Waiting for your database', 'Check the backend connection, then select Refresh.')}</section>` : page === 'Dashboard' ? dashboard() : page === 'Inventory' ? inventory() : page === 'Profile' ? profile() : workspacePages.has(page) ? workspaceUI.render(page, user, appearanceSettings()) : `<section class="panel">${empty('Page unavailable', 'Choose another workspace section.')}</section>`;
  const groupedNav = navGroups.map(group => {
    const expanded = navGroupExpanded[group.id];
    return `<section class="nav-section"><button type="button" id="nav-group-toggle-${group.id}" class="nav-section-title" data-nav-group="${group.id}" aria-expanded="${expanded}" aria-controls="nav-group-${group.id}"><span class="nav-emoji" aria-hidden="true">${group.emoji}</span><span class="sidebar-label">${group.label}</span><span class="nav-group-chevron">${icon('chevron')}</span></button><div class="nav-section-items" id="nav-group-${group.id}" ${expanded ? '' : 'hidden'}>${group.items.map(([label, target]) => `<button data-page="${target}" class="nav-child ${page === target ? 'active' : ''}"><span class="sidebar-label">${label}</span>${target === 'Rentals' ? `<span class="nav-count">${data?.rentals?.length ?? '–'}</span>` : ''}</button>`).join('')}</div></section>`;
  }).join('');
  const displayPage = pageLabels[page] || page;
  document.title = `${displayPage} · Rent & Play`;
  let notificationsSeen = ''; try { notificationsSeen = localStorage.getItem('rent-play-notifications-seen') || ''; } catch { }
  const showNotificationDot = !!notificationFingerprint() && notificationFingerprint() !== notificationsSeen;
  app.innerHTML = `<a class="skip-link" href="#workspace-content">Skip to main content</a><div class="workspace"><aside class="sidebar"><a class="brand" href="/" data-page="Dashboard" aria-label="Rent & Play home">${brand}</a><div class="store"><span class="store-icon">${icon('box')}</span><div><strong>Rent & Play</strong><small>Los Baños, Laguna</small></div></div><nav><button data-page="Dashboard" class="nav-root ${page === 'Dashboard' ? 'active' : ''}"><span class="nav-emoji" aria-hidden="true">🏠</span><span class="sidebar-label">Dashboard</span></button>${groupedNav}<button data-page="Reports" class="nav-root ${page === 'Reports' ? 'active' : ''}"><span class="nav-emoji" aria-hidden="true">📊</span><span class="sidebar-label">Reports</span></button></nav><div class="sidebar-bottom"><button data-page="Settings"><span class="nav-emoji" aria-hidden="true">⚙️</span> Settings</button><button id="logout"><span class="nav-emoji" aria-hidden="true">🚪</span> Logout</button><div class="demo-status"><span></span><div><strong>${connectionError ? 'Connection interrupted' : 'Connected workspace'}</strong><small>${data ? 'Cloud Firestore records' : 'Waiting for database'}</small></div></div><div class="operator"><span class="avatar">${escape(initials(user.name))}</span><div><strong>${escape(user.name)}</strong><small>${escape(user.role)}</small></div></div></div></aside><div class="workspace-body"><header class="topbar"><button class="icon-button menu-toggle" id="mobile-menu" aria-label="Toggle navigation">${icon('menu')}</button><div class="breadcrumb"><span class="breadcrumb-current">${escape(displayPage)}</span></div><div class="top-actions"><button class="text-button" id="refresh" ${manualRefreshPending ? 'disabled aria-busy="true"' : ''}>${manualRefreshPending ? 'Refreshing…' : 'Refresh'}</button>${notificationsMenu(showNotificationDot)}<div class="profile-menu"><button class="profile-menu-toggle" id="profile-menu-toggle" type="button" aria-label="Open account menu" aria-haspopup="menu" aria-expanded="false"><span class="avatar small">${escape(initials(user.name))}</span><span class="profile-menu-chevron" aria-hidden="true">▾</span></button><div class="profile-dropdown" id="profile-dropdown" role="menu" hidden><div class="profile-dropdown-user"><strong>${escape(user.name)}</strong><small>${escape(user.email)}</small></div><button data-page="Profile" role="menuitem">${icon('users')} View profile</button><button data-page="Settings" role="menuitem">${icon('settings')} Settings</button><button data-action="logout" class="profile-dropdown-logout" role="menuitem">${icon('out')} Logout</button></div></div></div></header><main class="content" id="workspace-content" tabindex="-1">${pageHeading()}${connectionError ? `<div class="connection-banner dashboard-connection-banner" role="alert">${escape(connectionError)}${data ? ' Showing the last successfully loaded records.' : ''}</div>` : ''}${body}<footer class="content-footer"><span>© ${new Date().getFullYear()} Rent & Play</span><span>${data ? `Updated ${new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(data.refreshedAt))}` : 'Waiting for database'}</span></footer></main></div></div>`;
  if (existingInventory) document.querySelector('#inventory-root')?.replaceWith(existingInventory);
  const business = workspaceUI.business();
  if (business.business_name) document.querySelector('.store strong').textContent = business.business_name;
  if (business.location) document.querySelector('.store small').textContent = business.location;
  const operatorCard = document.querySelector('.operator');
  if (operatorCard) { operatorCard.dataset.page = 'Profile'; operatorCard.tabIndex = 0; operatorCard.setAttribute('role', 'button'); operatorCard.setAttribute('aria-label', 'Open profile'); }
  const helpPanel = document.querySelector('.help-panel');
  bind(); updateThemeControls();
  const restoredFocus = focusId ? document.getElementById(focusId) : null;
  if (restoredFocus && app.contains(restoredFocus)) {
    restoredFocus.focus({ preventScroll: true });
    if (selection && restoredFocus.setSelectionRange) restoredFocus.setSelectionRange(...selection);
  }
  if (sidebarScroll !== undefined) { const sidebar = document.querySelector('.sidebar'); if (sidebar) sidebar.scrollTop = sidebarScroll; }
  if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
}
function bind() {
  if (page === 'Inventory' && data) inventoryController.mount(document.querySelector('#inventory-root'), category);
  const themeSwitch = document.querySelector('#dark-mode');
  if (themeSwitch) themeSwitch.onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  document.querySelectorAll('[data-page]').forEach(el => { el.onclick = event => { event.preventDefault(); goTo(el.dataset.page, false, el.dataset.filter || 'All rentals'); if (el.dataset.target) requestAnimationFrame(() => document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }; if (el.getAttribute('role') === 'button') el.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); el.click(); } }; });
  document.querySelectorAll('[data-nav-group]').forEach(button => button.onclick = () => {
    const id = button.dataset.navGroup;
    if (sidebarCollapsed && !window.matchMedia('(max-width:720px)').matches) { sidebarCollapsed = false; navGroupExpanded[id] = true; try { localStorage.setItem('rent-play-sidebar-collapsed', 'false'); } catch { } }
    else navGroupExpanded[id] = !navGroupExpanded[id];
    try { localStorage.setItem('rent-play-nav-groups', JSON.stringify(navGroupExpanded)); } catch { }
    const sidebar = document.querySelector('.sidebar'), scrollTop = sidebar?.scrollTop || 0;
    render();
    const nextSidebar = document.querySelector('.sidebar'); if (nextSidebar) nextSidebar.scrollTop = scrollTop;
    document.getElementById(`nav-group-toggle-${id}`)?.focus();
  });
  document.querySelectorAll('[data-category]').forEach(el => el.onclick = () => { goTo('Inventory', false, 'All rentals', data.categories[Number(el.dataset.category)].name); });
  document.querySelector('#refresh').onclick = async () => {
    if (manualRefreshPending) return;
    manualRefreshPending = true;
    const button = document.querySelector('#refresh'); button.disabled = true; button.textContent = 'Refreshing…'; button.setAttribute('aria-busy', 'true');
    const refreshedPage = page;
    try {
      await refresh({ force: true });
      if (user && workspacePages.has(refreshedPage)) await workspaceUI.refresh();
      if (user && page === refreshedPage && !modal.open) render();
    } catch (problem) { if (user && page === refreshedPage && !modal.open) render(); toast(problem.message); }
    finally { manualRefreshPending = false; const current = document.querySelector('#refresh'); if (current) { current.disabled = false; current.textContent = 'Refresh'; current.removeAttribute('aria-busy'); } }
  };
  const accountMenu = document.querySelector('.profile-menu'), accountToggle = document.querySelector('#profile-menu-toggle'), accountDropdown = document.querySelector('#profile-dropdown');
  const closeAccountMenu = () => { accountDropdown.hidden = true; accountToggle.setAttribute('aria-expanded', 'false'); };
  accountToggle.onclick = event => { event.stopPropagation(); closeNotifications(); const opening = accountDropdown.hidden; accountDropdown.hidden = !opening; accountToggle.setAttribute('aria-expanded', String(opening)); if (opening) accountDropdown.querySelector('[role="menuitem"]')?.focus(); };
  accountMenu.onclick = event => event.stopPropagation();
  document.onclick = () => { closeAccountMenu(); closeNotifications(); };
  accountMenu.onkeydown = event => { if (event.key === 'Escape') { closeAccountMenu(); accountToggle.focus(); } };
  const logout = async () => {
    if (logoutPending) return;
    logoutPending = true;
    closeAccountMenu(); closeNotifications();
    try {
      if (!await confirmAction({ title: 'Log out of Rent & Play?', description: 'Your session will end. You will need to sign in again to access the workspace.', confirmLabel: 'Yes, log out', cancelLabel: 'No, stay signed in' })) return;
      await api('/auth/logout', { method: 'POST' }); user = null; data = null; connectionError = ''; stopRentalEventStream(); rentalNotifications.setAccount(null); inventoryController.reset(); workspaceUI.reset(); history.replaceState({}, '', pageRoutes.Dashboard); modal.close(); login();
    }
    catch (error) { toast(error.message); }
    finally { logoutPending = false; }
  };
  document.querySelector('#logout').onclick = logout;
  document.querySelector('[data-action="logout"]').onclick = logout;
  configureSidebar();
  const notificationMenu = document.querySelector('.notification-menu'), notificationDropdown = document.querySelector('#notification-dropdown');
  notificationMenu.onclick = async event => {
    event.stopPropagation();
    const entry = event.target.closest('[data-rental-notification]');
    if (entry) {
      closeNotifications();
      try { await rentalNotifications.markRead([entry.dataset.rentalNotification]); await workspaceUI.openTransaction(entry.dataset.notificationRental); }
      catch (error) { toast(error.message); }
      return;
    }
    if (event.target.closest('[data-notification-mark-read]')) {
      try { await rentalNotifications.markRead(rentalNotifications.state().notifications.map(row => row.id)); }
      catch (error) { toast(error.message); }
      return;
    }
    if (event.target.closest('[data-notification-retry]')) { rentalNotifications.refresh(); return; }
    if (event.target.closest('[data-notification-older]')) { rentalNotifications.refresh({ older: true }); return; }
    const target = event.target.closest('[data-notification-page]');
    if (target) { closeNotifications(); goTo(target.dataset.notificationPage); }
  };
  document.querySelector('#notifications').onclick = () => { closeAccountMenu(); openNotifications(); };
  notificationMenu.onkeydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); closeNotifications(true); }
    if (event.key === 'ArrowDown' && event.target.id === 'notifications') { event.preventDefault(); if (notificationDropdown.hidden) openNotifications(); notificationDropdown.querySelector('button')?.focus(); }
  };
  notificationMenu.onfocusout = event => { if (!notificationMenu.contains(event.relatedTarget)) { closeNotifications(); syncNotifications(); } };
  syncNotifications();
  document.querySelectorAll('[data-filter]:not([data-page])').forEach(el => el.onclick = () => { filter = el.dataset.filter; rentalPage = 0; render(); });
  const search = document.querySelector('#rental-search');
  if (search) search.oninput = e => { const pos = e.target.selectionStart; query = e.target.value; rentalPage = 0; render(); const next = document.querySelector('#rental-search'); next.focus(); next.setSelectionRange(pos, pos); };
  document.querySelector('#rental-prev')?.addEventListener('click', () => { rentalPage--; render(); }); document.querySelector('#rental-next')?.addEventListener('click', () => { rentalPage++; render(); });
  document.querySelector('#verification-prev')?.addEventListener('click', () => { verificationPage--; render(); }); document.querySelector('#verification-next')?.addEventListener('click', () => { verificationPage++; render(); });
  const openRental = id => {
    const r = data.rentals.find(r => String(r.id) === String(id));
    if (!r) return;
    showModal('Rental details', `<div class="detail-header"><div><h3>${escape(r.item_name)}</h3><p>${escape(r.rental_code)}</p></div>${badge(r.displayStatus)}</div><dl><dt>Customer</dt><dd>${escape(r.customer)}</dd><dt>Due</dt><dd>${escape(formatDate(r.due_at))}</dd><dt>Rental fee</dt><dd>${money(r.rental_fee)}</dd><dt>Rental confirmed</dt><dd>${escape(formatDate(r.confirmed_rental_at))}</dd></dl><div class="info-box">Request a return from the Returns page or the mobile QR workflow, record the inspection, then confirm it at the physical terminal.</div>`);
  };
  document.querySelectorAll('[data-rental]').forEach(el => el.onclick = () => openRental(el.dataset.rental));
  bindRecordLinks(app, { 'dashboard-rental': openRental });
  const workflow = document.querySelector('#rental-workflow');
  if (workflow) workflow.onclick = () => showModal('Rental workflow', '<p>Prepare a rental from the Rentals page or scan an equipment QR in the mobile app. Record the release inspection, then confirm the handoff at the physical counter terminal.</p><div class="info-box">Check the equipment and transaction details before pressing the physical confirmation button.</div>');
  const select = document.querySelector('#period'); if (select) select.onchange = e => { period = e.target.value; render(); };
  const exp = document.querySelector('#export'); if (exp) exp.onclick = exportCsv;
  const profileEdit = document.querySelector('#profile-edit'); if (profileEdit) profileEdit.onclick = () => { profileEditing = true; render(); document.querySelector('#profile-form input')?.focus(); };
  const profileCancel = document.querySelector('#profile-cancel'); if (profileCancel) profileCancel.onclick = () => { profileEditing = false; render(); };
  const profileForm = document.querySelector('#profile-form');
  if (profileForm) confirmSubmit(profileForm, { title: 'Save profile changes?', description: 'Your name and login email will be updated. Use the new email the next time you sign in.', confirmLabel: 'Yes, save changes' }, async () => {
    const button = profileForm.querySelector('[type="submit"]'), error = profileForm.querySelector('.profile-error'); button.disabled = true; error.textContent = '';
    try { const values = Object.fromEntries(new FormData(profileForm)); const result = await api('/profile', { method: 'PATCH', body: JSON.stringify(values) }); user = result.user; profileEditing = false; render(); toast('Profile updated.'); }
    catch (problem) { error.textContent = problem.message; button.disabled = false; }
  });
  const boundPage = page;
  workspaceUI.bind(page, user, () => { if (user && page === boundPage) render(); });
}
function exportCsv() {
  const cell = value => { const v = String(value ?? ''); return '"' + (/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"'; };
  const rows = [['Rental code', 'Item', 'Customer', 'Due (Philippine time)', 'Status', 'Rental fee'], ...data.rentals.map(r => [r.rental_code, r.item_name, r.customer, r.due_at, r.displayStatus, r.rental_fee])];
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'rent-and-play-open-rentals.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Rental report downloaded.');
}
async function boot() {
  // Previous demo flags have no authority over the backend session.
  try { localStorage.removeItem('rent-play-demo'); sessionStorage.removeItem('rent-play-demo'); } catch { }
  sessionLoading();
  try { const result = await api('/auth/me'); user = result.user; await refresh(); }
  catch (error) {
    if (error.status !== 401) login(error.message);
    else {
      login();
      try { const health = await api('/health'); if (health.database === false) { const el = document.querySelector('#login-error'); if (el) el.textContent = health.warning || 'The database is temporarily unavailable.'; } }
      catch (healthError) { const el = document.querySelector('#login-error'); if (el) el.textContent = healthError.message; }
    }
  }
}
const inventoryController = createInventory({ api, escape, icon, symbol, badge, stateLabel, formatDate, showModal, modal, toast, confirmAction, confirmSubmit });
const workspaceUI = createWorkspaceUI({ api, escape, icon, showModal, modal, toast, money, formatDate, confirmAction, confirmSubmit, showEquipmentDetails: id => inventoryController.details(id), navigate: goTo });
const rentalNotifications = createRentalNotifications({ api, onChange: syncNotifications,
  onAlert: (notification, count) => toast(count > 1 ? `${count} new rental updates. Open notifications to review them.` : `${notification.title}: ${notification.message}`) });
document.addEventListener('visibilitychange', () => {
  if (user && !user.mustChangePassword && document.visibilityState === 'visible') {
    rentalNotifications.refresh();
    syncRentalEventStream(user.id);
    if (rentalEventSyncPending) scheduleRentalEventSync();
  }
});
invalidateWorkspace = () => workspaceUI.invalidate();
window.addEventListener('popstate', () => { page = pageForPath(location.pathname); if (workspacePages.has(page)) invalidateWorkspace(); if (user) { render(); document.querySelector('#workspace-content')?.focus({ preventScroll: true }); } });
setInterval(async () => {
  if (confirmation.isOpen() || logoutPending) return;
  if (!user || user.mustChangePassword || !apiClient.canRefresh() || !workspaceUI.autoRefreshEnabled() || page === 'Settings' || liveRentalPages.has(page) || document.visibilityState !== 'visible') return;
  if (page !== 'Inventory' && modal.open) { await workspaceUI.refreshPendingHandoff(); return; }
  if (document.querySelector('#rental-search:focus,#module-search:focus,.admin-form input:focus,.admin-form textarea:focus,.admin-form select:focus,#profile-form input:focus,.analytics-filters input:focus,.analytics-filters select:focus,#analytics-sort:focus,.sidebar.open,#profile-dropdown:not([hidden]),#notification-dropdown:not([hidden])')) return;
  try {
    await refresh();
    const refreshedPage = page;
    if (user && workspacePages.has(refreshedPage) && refreshedPage !== 'Settings' && await workspaceUI.refresh() && page === refreshedPage && user && !modal.open) render();
  } catch (problem) { if (user && workspacePages.has(page) && !modal.open) render(); if (problem.status !== 401) toast(problem.message); }
}, 120000);
boot();
