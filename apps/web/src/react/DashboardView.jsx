import React, { useState, useEffect, useLayoutEffect, useRef } from './react-shim.js';
import { AnalyticsPulse } from './AnalyticsPulse.jsx';
import {
  Icon,
  CategorySymbol,
  categoryThemeClass,
  StatusBadge,
  escape,
  money,
  initials,
  formatDate,
  badge
} from './icons.jsx';

// Motion is skipped for users who request reduced motion and in non-browser renders.
const prefersReducedMotion = () => {
  try {
    return typeof window === 'undefined' || typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
};
const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Renders the final value on first paint (static markup and screen readers stay exact),
 * then eases from the previously displayed value whenever the number changes.
 */
export function CountUp({ value, format = v => String(Math.round(v)), duration = 900 }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const shownRef = useRef(0);
  useClientLayoutEffect(() => {
    const from = shownRef.current;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    if (from === target || !raf || prefersReducedMotion()) {
      shownRef.current = target;
      setDisplay(target);
      return undefined;
    }
    const startedAt = performance.now();
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const next = progress >= 1 ? target : Math.round(from + (target - from) * eased);
      shownRef.current = next;
      setDisplay(next);
      if (progress < 1) frame = raf(tick);
    };
    setDisplay(from);
    frame = raf(tick);
    return () => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };
  }, [target, duration]);
  return <span className="count-up">{format(display)}</span>;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Monday-based weekday index in Philippine time (UTC+8).
const manilaWeekdayIndex = () => (new Date(Date.now() + 8 * 3600000).getUTCDay() + 6) % 7;

function StatCard({ label, value, note, glyph, color, page, target = '', filter = '', onNavigate }) {
  const handleClick = e => {
    e.preventDefault();
    onNavigate(page, false, filter || 'All rentals', '', '');
    if (target) {
      requestAnimationFrame(() => {
        document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  return (
    <button
      type="button"
      className="stat stat-link"
      data-page={page}
      data-target={target || undefined}
      data-filter={filter || undefined}
      aria-label={`${label}: ${value}. ${note}`}
      onClick={handleClick}
    >
      <div>
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>
          <Icon name={glyph} />
        </span>
      </div>
      <strong>
        <CountUp value={value} />
        {color === 'red' && Number(value) > 0 ? <span className="stat-pulse" aria-hidden="true" /> : null}
      </strong>
      <small>{note}</small>
    </button>
  );
}

function getDueInfo(r) {
  if (['APPROVED', 'PENDING_ADMIN_APPROVAL'].includes(r.status)) {
    return { badge: 'Starts at handoff', isOverdue: false, isDueSoon: false };
  }
  if (!r.due_at) return { badge: 'Philippine time', isOverdue: false, isDueSoon: false };
  const due = new Date(r.due_at).getTime();
  const now = Date.now();
  if (isNaN(due)) return { badge: 'Philippine time', isOverdue: false, isDueSoon: false };
  const diffMs = due - now;
  if (diffMs < 0) {
    const minutes = Math.max(1, Math.floor(-diffMs / 60000));
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return {
      badge: `Overdue by ${hours ? `${hours}h ` : ''}${mins ? `${mins}m` : ''}`.trim(),
      isOverdue: true,
      isDueSoon: false
    };
  }
  if (diffMs <= 2 * 3600000) {
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    return {
      badge: `Due in ${mins}m`,
      isOverdue: false,
      isDueSoon: true
    };
  }
  return { badge: 'Philippine time', isOverdue: false, isDueSoon: false };
}

export function TerminalPendingBanner({ data, workspaceUI, onNavigate }) {
  if (!data) return null;
  const pendingList = Array.isArray(data.pending) ? data.pending : [];
  const primaryTerminal = Array.isArray(data.terminals) ? data.terminals[0] : null;
  const terminalQueue = primaryTerminal
    ? pendingList.filter(p => p.terminal_code === primaryTerminal.terminal_code)
    : [];
  const activeQueue = terminalQueue.length > 0 ? terminalQueue : pendingList;
  const firstPending = activeQueue[0];
  if (!activeQueue.length || !firstPending) return null;

  return (
    <aside className="terminal-live-action-banner" role="alert">
      <div className="terminal-banner-pulse" aria-hidden="true">
        <span className="pulse-ring" />
        <Icon name="chip" />
      </div>
      <div className="terminal-banner-body">
        <div className="terminal-banner-badge-row">
          <span className="terminal-banner-badge">Terminal confirmation needed</span>
          <span className="terminal-queue-count">{activeQueue.length} pending</span>
          <span className="terminal-banner-station-tag">
            Terminal: <strong>{firstPending.terminal_code || primaryTerminal?.terminal_code || 'TERM-01'}</strong>
          </span>
        </div>
        <div className="terminal-banner-main-row">
          <strong className="terminal-banner-customer">
            {firstPending.item_name || 'Equipment'} &middot; {firstPending.customer || 'Customer'}
          </strong>
          <span className="terminal-banner-code-badge">
            Code: <code>{firstPending.rental_code || firstPending.verification_code || firstPending.id}</code>
          </span>
        </div>
        <p className="terminal-banner-instructions">
          Review the request, then press the terminal button to confirm.
        </p>
      </div>
      <div className="terminal-banner-actions">
        <button
          type="button"
          className="primary btn-open-terminal-gate"
          onClick={() => {
            const openDialog = workspaceUI?.showHandoff || workspaceUI?.openHandoff;
            if (openDialog) {
              const matchedRental = Array.isArray(data.rentals)
                ? data.rentals.find(r => String(r.id) === String(firstPending.rental_id))
                : undefined;
              openDialog(firstPending, matchedRental);
            } else {
              onNavigate?.('ESP32 terminal');
            }
          }}
        >
          Review request →
        </button>
      </div>
    </aside>
  );
}

export function DashboardView({
  data,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  rentalPage,
  onRentalPageChange,
  period,
  onPeriodChange,
  onNavigate,
  showModal,
  workspaceUI,
  api,
  toast
}) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [hoverDay, setHoverDay] = useState(null);
  const chartRef = useRef(null);
  const [testingTerminal, setTestingTerminal] = useState(false);
  const s = data.stats;
  const pageSize = 5;
  const allRows = data.rentals.filter(
    r =>
      (filter === 'All rentals' || r.displayStatus === filter) &&
      `${r.customer} ${r.rental_code} ${r.item_name}`.toLowerCase().includes(query.toLowerCase())
  );
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
  const clampedPage = Math.min(rentalPage, pageCount - 1);
  const start = clampedPage * pageSize;
  const rows = allRows.slice(start, start + pageSize);

  const openRental = id => {
    const r = data.rentals.find(item => String(item.id) === String(id));
    if (!r) return;
    const enrichedRental = {
      ...r,
      customer_name: r.customer_name || r.customer
    };
    if (workspaceUI?.openTransaction) {
      workspaceUI.openTransaction(id, { rentalCode: r.rental_code, rental: enrichedRental });
      return;
    }
    const showReceive = r.status === 'RETURN_PENDING_INSPECTION' || r.latest_return_request_status === 'PENDING_ADMIN_APPROVAL' || r.displayStatus === 'Return requested' || r.displayStatus === 'Overdue';
    const dueInfo = getDueInfo(r);
    const overdueLabel = dueInfo.isOverdue
      ? `Overdue by ${Math.max(1, Math.ceil((Date.now() - new Date(r.due_at).getTime()) / 3600000))}h`
      : '';
    showModal(
      'Rental details',
      `<div class="transaction-record-modal">
        <div class="transaction-detail-overview">
          <div class="transaction-detail-head">
            <div>
              <span class="eyebrow">${escape(r.rental_code || 'RENTAL')}</span>
              <h3>${escape(r.item_name || 'Equipment')}</h3>
              <p>Assigned unit &middot; ${escape(r.item_code || 'Standard unit')}</p>
            </div>
            ${badge(r.displayStatus)}
          </div>
          <div class="transaction-detail-grid">
            <div>
              <small>Customer</small>
              <strong>${escape(r.customer || 'Unknown customer')}</strong>
            </div>
            <div>
              <small>Due time</small>
              <strong>${escape(formatDate(r.due_at))}${overdueLabel ? `<small class="due-overdue-alert" style="display:block;margin-top:2px">${escape(overdueLabel)}</small>` : ''}</strong>
            </div>
          </div>
        </div>
        <div class="transaction-detail-scroll">
          <section class="record-section record-fees">
            <h3>Rental overview</h3>
            <dl class="record-fields">
              <div><dt>Rental fee</dt><dd><strong>${money(r.rental_fee)}</strong></dd></div>
              <div><dt>Rental confirmed</dt><dd>${escape(formatDate(r.confirmed_rental_at))}</dd></div>
              <div><dt>Fulfillment</dt><dd>${escape(r.delivery_location || (r.fulfillment_mode === 'DELIVERY' ? 'Resort delivery' : 'Store pickup counter'))}</dd></div>
              <div><dt>Status</dt><dd>${escape(r.displayStatus || r.status || 'Active')}</dd></div>
            </dl>
          </section>
          <div class="info-box" style="margin-top:16px">Use Returns to record physical receipt and inspect the unit. Physical receipt stops the timer; completing inspection updates availability or maintenance.</div>
        </div>
        <footer class="transaction-detail-footer">
          <div class="transaction-footer-copy">
            <strong>${showReceive ? 'Receive returned equipment' : r.status === 'ACTIVE' ? 'Active rental in progress' : 'Rental record'}</strong>
            <small>${showReceive ? 'Physical receipt stops the rental clock.' : 'Use Returns when equipment comes back to the desk.'}</small>
          </div>
          <div class="form-actions">
            <button type="button" class="secondary" data-dashboard-nav-rentals>View in transactions</button>
            ${showReceive ? '<button type="button" class="primary" data-dashboard-return-action>Receive equipment</button>' : '<button type="button" class="primary" data-close>Done</button>'}
          </div>
        </footer>
      </div>`
    );
    const modalEl = document.querySelector('dialog[open]');
    if (modalEl) {
      modalEl.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => modalEl.close?.()));
      modalEl.querySelector('[data-dashboard-nav-rentals]')?.addEventListener('click', () => {
        modalEl.close?.();
        onNavigate('Rentals');
      });
      modalEl.querySelector('[data-dashboard-return-action]')?.addEventListener('click', () => {
        modalEl.close?.();
        if (workspaceUI?.openQuickReturn) {
          workspaceUI.openQuickReturn();
        } else {
          onNavigate('Returns');
        }
      });
    }
  };

  const openWorkflowModal = () => {
    showModal(
      'How rentals work',
      '<p><strong>Store pickup.</strong> Create the rental, scan the assigned unit, and review the customer, payment, agreement, and equipment checks. Confirm handover at the counter terminal to start the timer.</p><p><strong>Resort delivery.</strong> Prepare and confirm dispatch at the shop. The timer starts after staff verifies the customer ticket and confirms handover at the resort.</p><p><strong>Returns.</strong> Record physical receipt to stop the timer, then inspect the equipment and complete the return.</p>'
    );
  };

  const handleRowClick = (e, rentalId) => {
    if (e.defaultPrevented || (typeof e.button === 'number' && e.button !== 0)) return;
    if (String(window.getSelection?.() || '').trim()) return;
    const interactive = e.target.closest?.('button, a, input, select, textarea, label, summary');
    if (interactive) return;
    openRental(rentalId);
  };

  const handleRowKeyDown = (e, rentalId) => {
    if (e.defaultPrevented || e.repeat) return;
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openRental(rentalId);
    }
  };

  // Revenue chart calculations
  const amounts = data.revenue[period] || [0, 0, 0, 0, 0, 0, 0];
  const compareKey = period === 'This week' ? 'Last week' : null;
  const compare = compareKey ? data.revenue[compareKey] || [] : [];
  const sum = list => list.reduce((a, b) => a + (Number(b) || 0), 0);
  const total = sum(amounts);
  const compareTotal = sum(compare);
  const delta = compareKey && compareTotal > 0 ? Math.round(((total - compareTotal) / compareTotal) * 100) : null;
  const max = Math.max(100, ...amounts, ...compare.map(v => Number(v) || 0));
  const scale = Math.ceil(max / 100) * 100;
  const peak = Math.max(...amounts);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIndex = period === 'This week' ? manilaWeekdayIndex() : -1;
  const average = total / (todayIndex >= 0 ? todayIndex + 1 : 7);
  const pct = value => Math.max(0, Math.min(100, ((Number(value) || 0) / scale) * 100));
  const activeDay = hoverDay ?? selectedDay;
  const peakDayLabel = peak > 0 ? `${days[amounts.indexOf(peak)]} (${money(peak)})` : '—';

  const focusBar = index => {
    setSelectedDay(index);
    chartRef.current?.querySelector(`[data-day="${index}"]`)?.focus();
  };
  const handleBarKeyDown = (event, index) => {
    const moves = { ArrowRight: (index + 1) % 7, ArrowLeft: (index + 6) % 7, Home: 0, End: 6 };
    if (event.key === 'Escape') {
      setSelectedDay(null);
      setHoverDay(null);
      return;
    }
    if (!(event.key in moves)) return;
    event.preventDefault();
    focusBar(moves[event.key]);
  };

  // Soft spotlight that follows the pointer across cards.
  const handleSpotlight = event => {
    const card = event.target.closest?.('.stat, .command-bar-btn');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  // Terminal info
  const t = data.terminals[0];
  const terminalQueue = t && Array.isArray(data.pending) ? data.pending.filter(p => p.terminal_code === t.terminal_code) : [];
  const queue = terminalQueue.length > 0 ? terminalQueue : (Array.isArray(data.pending) ? data.pending : []);

  // Today's actual collections (Cash vs. GCash/InstaPay QR)
  const collections = data.collections || {};
  const todayTotal = Number(collections.total || 0);
  const todayCash = Number(collections.cash || 0);
  const todayQr = Number(collections.qr || 0);
  const todayRefunds = Number(collections.refunds || 0);
  const todayExpenses = Number(collections.expenses || 0);
  const todayCashNet = Number(collections.cashNetMovement ?? todayCash);
  const todayNetAfterExpenses = Number(
    collections.netAfterExpenses ?? todayTotal - todayRefunds - todayExpenses
  );
  const cashShare = todayTotal > 0 ? Math.round((todayCash / todayTotal) * 100) : 0;
  const qrShare = todayTotal > 0 ? Math.max(0, 100 - cashShare) : 0;

  return (
    <div className="dashboard-workspace" onPointerMove={handleSpotlight}>
      {/* 1. Counter Command Bar */}
      <section className="counter-command-bar" role="toolbar" aria-label="Counter command actions">
        <button
          type="button"
          className="command-bar-btn primary"
          id="cmd-new-rental"
          onClick={() => {
            if (workspaceUI?.openWalkInRental) {
              workspaceUI.openWalkInRental();
            } else {
              onNavigate('Rentals', false, 'All rentals', '', '');
            }
          }}
        >
          <span className="btn-icon-bubble"><Icon name="plus" /></span>
          <div className="btn-text-wrap">
            <strong>New walk-in rental</strong>
            <small>Create a rental at the counter</small>
          </div>
        </button>

        <button
          type="button"
          className="command-bar-btn"
          id="cmd-scan-qr"
          onClick={() => {
            if (workspaceUI?.openRentalLookup) {
              workspaceUI.openRentalLookup();
            } else {
              onNavigate('Rentals');
            }
          }}
        >
          <span className="btn-icon-bubble"><Icon name="search" /></span>
          <div className="btn-text-wrap">
            <strong>Find rental</strong>
            <small>Scan a QR code or enter a reference</small>
          </div>
        </button>

        <button
          type="button"
          className="command-bar-btn"
          id="cmd-quick-return"
          onClick={() => {
            if (workspaceUI?.openQuickReturn) {
              workspaceUI.openQuickReturn();
            } else {
              onNavigate('Returns');
            }
          }}
        >
          <span className="btn-icon-bubble"><Icon name="undo" /></span>
          <div className="btn-text-wrap">
            <strong>Receive return</strong>
            <small>Record receipt and inspect equipment</small>
          </div>
        </button>

        {/* Terminal diagnostics belong with the terminal status below. */}
      </section>

      {/* 2. Real-Time ESP32 Pending Verification Banner */}
      <TerminalPendingBanner data={data} workspaceUI={workspaceUI} onNavigate={onNavigate} />

      <div className="stats">
        <StatCard
          label="Active rentals"
          value={s.active}
          note="Currently with customers"
          glyph="clock"
          color="blue"
          page="Rentals"
          onNavigate={onNavigate}
        />
        <StatCard
          label="Available units"
          value={s.available}
          note="Ready to rent"
          glyph="box"
          color="green"
          page="Inventory"
          onNavigate={onNavigate}
        />
        <StatCard
          label="Due today"
          value={s.dueToday}
          note="Scheduled to return today"
          glyph="bell"
          color="amber"
          page="Dashboard"
          target="rental-panel"
          filter="Due today"
          onNavigate={onNavigate}
        />
        <StatCard
          label="Overdue"
          value={s.overdue}
          note={s.overdue ? 'Follow up on these returns' : 'No overdue rentals'}
          glyph="clock"
          color="red"
          page="Dashboard"
          target="rental-panel"
          filter="Overdue"
          onNavigate={onNavigate}
        />
      </div>

      <div className="dashboard-grid">
          <section className="panel rental-panel" id="rental-panel">
            <div className="panel-title">
              <div>
                <h3>Rental activity</h3>
                <p>Open rentals and requests that need your attention.</p>
              </div>
              <div className="rental-panel-actions">
                <button
                  type="button"
                  className="secondary"
                  id="rental-workflow"
                  onClick={openWorkflowModal}
                >
                  How rentals work
                </button>
                <button
                  className="text-button"
                  data-page="Rentals"
                  onClick={() => onNavigate('Rentals')}
                >
                  View all rentals →
                </button>
              </div>
            </div>

            <div className="table-controls">
              <div className="tabs">
                {['All rentals', 'Due today', 'Overdue'].map(tab => (
                  <button
                    key={tab}
                    data-filter={tab}
                    className={filter === tab ? 'selected' : ''}
                    onClick={() => {
                      onFilterChange(tab);
                      onRentalPageChange(0);
                    }}
                  >
                    {tab}
                    {tab === 'Overdue' ? <span>{data.stats.overdue}</span> : null}
                  </button>
                ))}
              </div>
              <label className="table-search">
                <Icon name="search" />
                <input
                  id="rental-search"
                  placeholder="Search rentals"
                  value={query}
                  aria-label="Search rentals"
                  onChange={e => {
                    onQueryChange(e.target.value);
                    onRentalPageChange(0);
                  }}
                />
              </label>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>EQUIPMENT</th>
                    <th>CUSTOMER</th>
                    <th>DUE DATE</th>
                    <th>STATUS</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? (
                    rows.map(r => {
                      const itemCategory =
                        data.items.find(i => String(i.id) === String(r.item_id))?.category || '';
                      const label = r.rental_code || r.item_name;
                      const dueInfo = getDueInfo(r);
                      const isResort = r.fulfillment_mode === 'DELIVERY' || Boolean(r.delivery_location);
                      return (
                        <tr
                          key={r.id}
                          className="record-link-row"
                          data-record-type="dashboard-rental"
                          data-record-id={r.id}
                          tabIndex={0}
                          aria-label={label ? `Open ${label}` : undefined}
                          onClick={e => handleRowClick(e, r.id)}
                          onKeyDown={e => handleRowKeyDown(e, r.id)}
                        >
                          <td>
                            <div className="item-cell">
                              <span className="item-symbol">
                                <CategorySymbol category={itemCategory} />
                              </span>
                              <div>
                                <strong>{r.item_name}</strong>
                                <small>{r.rental_code}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="customer-cell-wrap">
                              <span className="mini-avatar">{initials(r.customer)}</span>
                              <div>
                                <span>{r.customer}</span>
                                {isResort ? (
                                  <small className="fulfillment-tag resort" title={r.delivery_location || 'Resort delivery'}>
                                    {r.delivery_location ? r.delivery_location.split(',')[0].trim() : 'Resort delivery'}
                                  </small>
                                ) : (
                                  <small className="fulfillment-tag shop" title="Shop counter handover">
                                    Store pickup
                                  </small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong>{formatDate(r.due_at)}</strong>
                            <small className={dueInfo.isOverdue ? 'due-overdue-alert' : dueInfo.isDueSoon ? 'due-soon-alert' : ''}>
                              {dueInfo.badge}
                            </small>
                          </td>
                          <td>
                            <StatusBadge status={r.displayStatus} />
                          </td>
                          <td>
                            <button
                              className="row-button"
                              data-rental={r.id}
                              aria-label={`View ${r.rental_code}`}
                              onClick={() => openRental(r.id)}
                            >
                              <Icon name="arrow" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="empty">
                        No open rentals match this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>
                {allRows.length
                  ? `${start + 1}–${Math.min(start + pageSize, allRows.length)} of ${allRows.length}`
                  : '0 rentals'}{' '}
                · Page {allRows.length ? clampedPage + 1 : 0} of{' '}
                {Math.ceil(allRows.length / pageSize)}
              </span>
              {pageCount > 1 && <div className="inv-pagination">
                <button
                  className="secondary"
                  id="rental-prev"
                  disabled={!clampedPage}
                  onClick={() => onRentalPageChange(Math.max(0, clampedPage - 1))}
                >
                  ← Previous
                </button>
                <button
                  className="secondary"
                  id="rental-next"
                  disabled={start + pageSize >= allRows.length}
                  onClick={() => onRentalPageChange(clampedPage + 1)}
                >
                  Next →
                </button>
              </div>}
            </div>
          </section>

          <section className="panel terminal-panel">
            <div className="panel-title">
              <h3>
                <Icon name="chip" /> ESP32 terminal
              </h3>
            </div>
            <div className="dashboard-terminal-status" data-online={Boolean(t?.online)}>
              <span className="dashboard-status-dot" aria-hidden="true" />
              <div><strong>{t ? (t.online ? 'Connected' : 'Offline') : 'Not configured'}</strong>
                <span>{t ? `${t.name || 'Counter terminal'} · ${t.terminal_code}` : 'Set up a terminal to confirm counter handovers.'}</span></div>
            </div>
            <div className="terminal-meta">
              <span>Awaiting confirmation</span>
              <strong className={queue.length > 0 ? 'has-pending-count' : ''}>{queue.length}</strong>
            </div>
            {queue.length > 0 && queue[0] ? (
              <div className="terminal-widget-active-card">
                <div className="terminal-widget-active-header">
                  <span className="terminal-widget-tag">
                    <span className="terminal-widget-live-dot" aria-hidden="true" />
                    Pending action
                  </span>
                  <code className="terminal-widget-code">
                    {queue[0].rental_code || queue[0].verification_code || queue[0].id}
                  </code>
                </div>
                <div className="terminal-widget-active-info">
                  <strong>{queue[0].item_name || 'Equipment'} &middot; {queue[0].customer || 'Customer'}</strong>
                  <span>{queue[0].transaction_type === 'RETURN' ? 'Return inspection' : 'Counter handover'} &middot; {queue[0].terminal_code || t?.terminal_code || 'TERM-01'}</span>
                </div>
                <button
                  type="button"
                  className="primary terminal-widget-review-btn"
                  onClick={() => {
                    const openDialog = workspaceUI?.showHandoff || workspaceUI?.openHandoff;
                    if (openDialog) {
                      const matchedRental = Array.isArray(data.rentals)
                        ? data.rentals.find(r => String(r.id) === String(queue[0].rental_id))
                        : undefined;
                      openDialog(queue[0], matchedRental);
                    } else {
                      onNavigate?.('ESP32 terminal');
                    }
                  }}
                >
                  Review request →
                </button>
              </div>
            ) : (
              <p className="terminal-note">
                Confirm counter handovers, delivery dispatches, and completed inspections.
              </p>
            )}
            <div className="dashboard-terminal-actions">
              <button type="button" className="secondary" id="cmd-ping-terminal" disabled={!t || !api || testingTerminal} onClick={async () => {
                setTestingTerminal(true);
                try {
                  await api('/terminals/' + encodeURIComponent(t.id) + '/test-ping', { method: 'POST' });
                  toast?.('Test sent. Check the terminal for a response.');
                } catch (err) { toast?.(err.message || 'The terminal test could not be sent.'); }
                finally { setTestingTerminal(false); }
              }}>{testingTerminal ? 'Sending test…' : 'Test terminal'}</button>
            </div>
            <button
              className="secondary wide"
              data-page="ESP32 terminal"
              onClick={() => onNavigate('ESP32 terminal')}
            >
              Open terminal <Icon name="arrow" />
            </button>
          </section>

<section className="panel revenue-panel">
            <div className="panel-title">
              <div>
                <h3>Rental fees</h3>
                <p>Recorded charges by confirmation date. Not cash collected.</p>
              </div>
              <div className="revenue-actions">
                <select
                  id="period"
                  aria-label="Revenue period"
                  value={period}
                  onChange={e => { setSelectedDay(null); onPeriodChange(e.target.value); }}
                >
                  <option value="This week">This week</option>
                  <option value="Last week">Last week</option>
                </select>
                <button
                  className="text-button"
                  data-page="Reports"
                  onClick={() => onNavigate('Reports')}
                >
                  View analytics →
                </button>
              </div>
            </div>
            <div className="revenue-total">
              <CountUp value={total} format={money} />
              <span>Recorded rental charges</span>
              {delta !== null ? (
                <em className={`revenue-delta ${delta >= 0 ? 'up' : 'down'}`}>
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs last full week · this week is partial
                </em>
              ) : null}
              <div className="revenue-summary-pills">
                <span className="revenue-pill" title={todayIndex >= 0 ? 'Average over calendar days so far, including partial today.' : 'Average over the full seven-day week.'}>
                  <small>Daily avg</small>
                  <strong>{money(Math.round(average))}</strong>
                </span>
                <span className="revenue-pill">
                  <small>Peak day</small>
                  <strong>{peakDayLabel}</strong>
                </span>
              </div>
            </div>
            <div className="chart-legend" aria-hidden="true">
              <span><i className="swatch current" />{period}</span>
              {compareKey ? <span><i className="swatch previous" />{compareKey}</span> : null}
              {average > 0 ? <span><i className="swatch average" />Daily average</span> : null}
            </div>
            <div className="chart" ref={chartRef} onMouseLeave={() => setHoverDay(null)}>
              <div className="axis">
                {[1, 0.75, 0.5, 0.25, 0].map(x => (
                  <span key={x}>{money(scale * x)}</span>
                ))}
              </div>
              <div className="bars" role="group" aria-label="Rental fees by day. Use the arrow keys to move between days.">
                <div className="chart-gridlines" aria-hidden="true">
                  {[0, 0.25, 0.5, 0.75, 1].map(x => <span key={x} style={{ bottom: `${x * 100}%` }} />)}
                </div>
                {average > 0 ? (
                  <div className="chart-avg-line" style={{ bottom: `${pct(average)}%` }} aria-hidden="true">
                    <span>Avg {money(Math.round(average))}</span>
                  </div>
                ) : null}
                {amounts.map((amount, i) => {
                  const columnClass = [
                    'bar-column',
                    i === 0 ? 'is-first' : '',
                    i === 6 ? 'is-last' : '',
                    i === todayIndex ? 'is-today' : '',
                    todayIndex >= 0 && i > todayIndex ? 'is-future' : '',
                    activeDay === i ? 'is-active' : ''
                  ].filter(Boolean).join(' ');
                  return (
                    <div className={columnClass} key={days[i]} style={{ '--i': i }}>
                      <button
                        type="button"
                        className={`bar ${amount === peak && peak > 0 ? 'highlight' : ''}`}
                        style={{ height: '100%' }}
                        data-day={i}
                        aria-label={`${days[i]}: ${money(amount)} in rental fees`}
                        aria-pressed={selectedDay === i}
                        onClick={() => setSelectedDay(selectedDay === i ? null : i)}
                        onMouseEnter={() => setHoverDay(i)}
                        onFocus={() => setHoverDay(i)}
                        onBlur={() => setHoverDay(null)}
                        onKeyDown={event => handleBarKeyDown(event, i)}
                      >
                        {compareKey ? <span className="dashboard-bar-ghost" style={{ height: `${pct(compare[i])}%` }} /> : null}
                        <span className="dashboard-bar-fill" style={{ height: `${Math.max(2, pct(amount))}%` }} />
                        {activeDay === i ? (
                          <span className="chart-tooltip" aria-hidden="true" style={{ bottom: `calc(${Math.max(2, pct(amount))}% + 10px)` }}>
                            <strong>{money(amount)}</strong>
                            <small>
                              {DAY_NAMES[i]}{i === todayIndex ? ' · today' : ''}
                              {compareKey ? ` · last wk ${money(Number(compare[i]) || 0)}` : ''}
                            </small>
                          </span>
                        ) : null}
                      </button>
                      <span>{days[i]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="dashboard-chart-detail" aria-live="polite">
              <div className="chart-detail-inner" key={activeDay ?? 'none'}>
                {activeDay === null ? (
                  <span>Hover a bar, or select one and use the arrow keys, to explore each day.</span>
                ) : (
                  <>
                    <span>{DAY_NAMES[activeDay]}</span>
                    <strong>{money(amounts[activeDay])}</strong>
                    <span>in recorded charges</span>
                    {total > 0 ? <span className="chart-detail-share">{Math.round(((Number(amounts[activeDay]) || 0) / total) * 100)}% of the week</span> : null}
                  </>
                )}
              </div>
            </div>
            {amounts.every(v => v === 0) ? (
              <p className="chart-empty">No confirmed rental fees in this period.</p>
            ) : null}
          </section>

<section className="panel collections-panel" aria-label="Today's collections">
            <div className="panel-title">
              <div>
                <h3>
                  <Icon name="money" /> Today&rsquo;s collections
                </h3>
                <p>Confirmed receipts today &middot; Philippine time</p>
              </div>
            </div>
            <div className="collections-hero">
              <strong><CountUp value={todayTotal} format={money} /></strong>
              <span>
                {collections.entryCount
                  ? `${collections.entryCount} ledger ${collections.entryCount === 1 ? 'entry' : 'entries'} today`
                  : 'No dated receipts yet today'}
              </span>
            </div>
            <div
              className="collections-split-bar"
              role="img"
              aria-label={`Cash ${cashShare}% (${money(todayCash)}), GCash and InstaPay QR ${qrShare}% (${money(todayQr)})`}
            >
              <span
                className="collections-split-cash"
                style={{ width: `${todayTotal > 0 ? Math.max(cashShare, todayCash > 0 ? 6 : 0) : 50}%` }}
              />
              <span
                className="collections-split-qr"
                style={{ width: `${todayTotal > 0 ? Math.max(qrShare, todayQr > 0 ? 6 : 0) : 50}%` }}
              />
            </div>
            <dl className="collections-breakdown">
              <div className="collections-method-row">
                <dt>
                  <span className="collections-dot cash" aria-hidden="true" />
                  Cash in person
                </dt>
                <dd>{money(todayCash)}</dd>
              </div>
              <div className="collections-method-row">
                <dt>
                  <span className="collections-dot qr" aria-hidden="true" />
                  GCash / InstaPay QR
                </dt>
                <dd>{money(todayQr)}</dd>
              </div>
              <div className="collections-method-row net">
                <dt>Drawer cash movement</dt>
                <dd>{money(todayCashNet)}</dd>
              </div>
              {todayRefunds > 0 || todayExpenses > 0 ? (
                <div className="collections-method-row subtle">
                  <dt>After refunds &amp; expenses</dt>
                  <dd>{money(todayNetAfterExpenses)}</dd>
                </div>
              ) : null}
            </dl>
            <div className="dashboard-terminal-actions">
              <button
                type="button"
                className="secondary"
                id="cmd-cash-drawer"
                onClick={() => {
                  if (workspaceUI?.openCashDrawer) {
                    workspaceUI.openCashDrawer(todayCashNet);
                  } else {
                    onNavigate('Payments');
                  }
                }}
              >
                Cash drawer (Z-Reading)
              </button>
            </div>
            <button
              type="button"
              className="secondary wide"
              data-page="Payments"
              onClick={() => onNavigate('Payments')}
            >
              Open payments <Icon name="arrow" />
            </button>
          </section>

<AnalyticsPulse data={data} onNavigate={onNavigate} />

<section className="panel category-panel">
            <div className="panel-title">
              <div>
                <h3>
                  <Icon name="box" /> Equipment by category
                </h3>
                <p>Select a category to view its inventory.</p>
              </div>
              <button
                type="button"
                className="text-button"
                data-page="Inventory"
                onClick={() => onNavigate('Inventory', false, 'All rentals', '')}
              >
                View all inventory <Icon name="arrow" />
              </button>
            </div>
            <div className="category-grid">
              {data.categories.length > 0 ? (
                data.categories.map((c, i) => (
                  <button
                    key={c.name || i}
                    type="button"
                    className="category-card-btn"
                    data-category={i}
                    onClick={() => onNavigate('Inventory', false, 'All rentals', c.name)}
                  >
                    <span className={`category-symbol ${categoryThemeClass(c.name)}`}>
                      <CategorySymbol category={c.name} />
                    </span>
                    <span className="category-card-text">
                      <strong>{c.name}</strong>
                      <small>{c.count} items in inventory</small>
                    </span>
                    <Icon name="arrow" />
                  </button>
                ))
              ) : (
                <p>No categories recorded.</p>
              )}
            </div>
            <button
            type="button"
            className="secondary wide category-panel-footer-btn"
            data-page="Inventory"
            onClick={() => onNavigate('Inventory', false, 'All rentals', '')}
          >
            View all inventory <Icon name="arrow" />
          </button>
        </section>

          </div>
    </div>
  );
}
