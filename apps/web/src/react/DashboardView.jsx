import React, { useState } from './react-shim.js';
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
      <strong>{value}</strong>
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
    showModal(
      'Rental details',
      `<div class="detail-header"><div><h3>${escape(r.item_name)}</h3><p>${escape(r.rental_code)}</p></div>${badge(
        r.displayStatus
      )}</div><dl><dt>Customer</dt><dd>${escape(r.customer)}</dd><dt>Due</dt><dd>${escape(
        formatDate(r.due_at)
      )}</dd><dt>Rental fee</dt><dd>${money(r.rental_fee)}</dd><dt>Rental confirmed</dt><dd>${escape(
        formatDate(r.confirmed_rental_at)
      )}</dd></dl><div class="info-box">Use Returns to record physical receipt and inspect the unit. Physical receipt stops the timer; completing inspection updates availability or maintenance.</div>`
    );
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
  const max = Math.max(100, ...amounts);
  const scale = Math.ceil(max / 100) * 100;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Terminal info
  const t = data.terminals[0];
  const queue = t ? data.pending.filter(p => p.terminal_code === t.terminal_code) : [];
  const firstPending = queue[0] || data.pending?.[0];

  return (
    <div className="dashboard-workspace">
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
      {queue.length > 0 && firstPending ? (
        <aside className="terminal-live-action-banner" role="alert">
          <div className="terminal-banner-pulse" aria-hidden="true">
            <span className="pulse-ring" />
            <Icon name="chip" />
          </div>
          <div className="terminal-banner-body">
            <div className="terminal-banner-badge-row">
              <span className="terminal-banner-badge">Terminal confirmation needed</span>
              <span className="terminal-queue-count">{queue.length} pending</span>
            </div>
            <strong>
              {firstPending.item_name || 'Equipment'} &middot; {firstPending.customer || 'Customer'}
            </strong>
            <p>
              Code: <code>{firstPending.rental_code || firstPending.verification_code || firstPending.id}</code> &middot;
              Terminal: <strong>{firstPending.terminal_code || 'TERM-01'}</strong> &middot;
              Review the request, then press the terminal button to confirm.
            </p>
          </div>
          <div className="terminal-banner-actions">
            <button
              type="button"
              className="primary btn-open-terminal-gate"
              onClick={() => {
                if (workspaceUI?.openHandoff) {
                  workspaceUI.openHandoff(firstPending, data.rentals.find(r => String(r.id) === String(firstPending.rental_id)));
                } else {
                  onNavigate('ESP32 terminal');
                }
              }}
            >
              Review request →
            </button>
          </div>
        </aside>
      ) : null}

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
        <div className="main-column">
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
              {money(amounts.reduce((a, b) => a + b, 0))}
              <span>Recorded rental charges</span>
            </div>
            <div className="chart">
              <div className="axis">
                {[1, 0.75, 0.5, 0.25, 0].map(x => (
                  <span key={x}>{money(scale * x)}</span>
                ))}
              </div>
              <div className="bars">
                {amounts.map((amount, i) => (
                  <div className="bar-column" key={days[i]}>
                    <button
                      type="button"
                      className={`bar ${amount === max ? 'highlight' : ''}`}
                      style={{ height: '100%' }}
                      title={`${days[i]}: ${money(amount)}`}
                      aria-label={`${days[i]}: ${money(amount)} in rental fees`}
                      aria-pressed={selectedDay === i}
                      onClick={() => setSelectedDay(i)}
                    ><span className="dashboard-bar-fill" style={{ height: `${Math.max(2, (amount / scale) * 100)}%` }} /></button>
                    <span>{days[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="dashboard-chart-detail" aria-live="polite">
              {selectedDay === null ? <span>Select a day to see its rental fees.</span> : <><span>{days[selectedDay]}</span><strong>{money(amounts[selectedDay])}</strong><span>in recorded charges</span></>}
            </div>
            {amounts.every(v => v === 0) ? (
              <p className="chart-empty">No confirmed rental fees in this period.</p>
            ) : null}
          </section>
        </div>

        <aside className="right-column">
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
              <strong>{queue.length}</strong>
            </div>
            <p className="terminal-note">
              Confirm counter handovers, delivery dispatches, and completed inspections.
            </p>
            <div className="dashboard-terminal-actions">
              <button type="button" className="secondary" id="cmd-ping-terminal" disabled={!t || !api || testingTerminal} onClick={async () => {
                setTestingTerminal(true);
                try {
                  await api('/terminals/test-ping', { method: 'POST', body: JSON.stringify({ terminalCode: t.terminal_code }) });
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

          <section className="panel category-panel">
            <h3>Equipment by category</h3>
            <p>Select a category to view its inventory.</p>
            {data.categories.length > 0 ? (
              data.categories.map((c, i) => (
                <button
                  key={c.name || i}
                  data-category={i}
                  onClick={() => onNavigate('Inventory', false, 'All rentals', c.name)}
                >
                  <span className={`category-symbol ${categoryThemeClass(c.name)}`}>
                    <CategorySymbol category={c.name} />
                  </span>
                  <span>
                    {c.name}
                    <small>{c.count} items in inventory</small>
                  </span>
                  <Icon name="arrow" />
                </button>
              ))
            ) : (
              <p>No categories recorded.</p>
            )}
          </section>

        </aside>
      </div>
    </div>
  );
}
