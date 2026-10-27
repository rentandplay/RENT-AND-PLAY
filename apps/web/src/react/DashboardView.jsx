import React from './react-shim.js';
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
  showModal
}) {
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
      'Rental workflow',
      '<p><strong>Walk-in Counter Flow:</strong> Approve or create the walk-in rental, scan the assigned equipment QR, inspect condition &amp; accessories, and confirm handover on the <strong>ESP32 Counter Terminal</strong> (or web fallback) to start the timer.</p><p><strong>Resort Stay Delivery Flow:</strong> Scan the unit QR at the shop and confirm <strong>Resort Dispatch on the ESP32 Terminal</strong> (marks unit Out for Delivery while keeping the timer stopped). At the resort villa/gate, scan the customer Rental QR to start the timer.</p><div class="info-box">On return, scanning the equipment QR immediately stops the rental timer and overtime. Final return inspection is confirmed on the ESP32 Counter Terminal before updating inventory availability.</div>'
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

  return (
    <>
      <div className="stats">
        <StatCard
          label="Active rentals"
          value={s.active}
          note="Confirmed rentals currently out"
          glyph="clock"
          color="blue"
          page="Rentals"
          onNavigate={onNavigate}
        />
        <StatCard
          label="Available items"
          value={s.available}
          note="Ready for their next adventure"
          glyph="box"
          color="green"
          page="Inventory"
          onNavigate={onNavigate}
        />
        <StatCard
          label="Due today"
          value={s.dueToday}
          note={`${s.overdue} overdue rental(s) need attention`}
          glyph="bell"
          color="amber"
          page="Dashboard"
          target="rental-panel"
          filter="Due today"
          onNavigate={onNavigate}
        />
        <StatCard
          label="Rental fees"
          value={money(s.fees)}
          note="From current active rentals"
          glyph="money"
          color="purple"
          page="Rentals"
          onNavigate={onNavigate}
        />
      </div>

      <div className="dashboard-grid">
        <div className="main-column">
          <section className="panel rental-panel" id="rental-panel">
            <div className="panel-title">
              <div>
                <h3>Rentals to keep an eye on</h3>
                <p>Active rentals and requests awaiting verification.</p>
              </div>
              <div className="rental-panel-actions">
                <button
                  type="button"
                  className="secondary"
                  id="rental-workflow"
                  onClick={openWorkflowModal}
                >
                  <Icon name="arrow" /> Rental workflow
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
                    <th>ITEM / RENTAL ID</th>
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
                            <span className="mini-avatar">{initials(r.customer)}</span>
                            {r.customer}
                          </td>
                          <td>
                            <strong>{formatDate(r.due_at)}</strong>
                            <small>Philippine time</small>
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
              <div className="inv-pagination">
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
              </div>
            </div>
          </section>

          <section className="panel revenue-panel">
            <div className="panel-title">
              <div>
                <h3>Confirmed rental fees</h3>
                <p>Grouped by the date each rental was confirmed.</p>
              </div>
              <div className="revenue-actions">
                <select
                  id="period"
                  aria-label="Revenue period"
                  value={period}
                  onChange={e => onPeriodChange(e.target.value)}
                >
                  <option value="This week">This week</option>
                  <option value="Last week">Last week</option>
                </select>
                <button
                  className="text-button"
                  data-page="Reports"
                  onClick={() => onNavigate('Reports')}
                >
                  Detailed analytics →
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
                    <div
                      className={`bar ${amount === max ? 'highlight' : ''}`}
                      style={{ height: `${(amount / scale) * 100}%` }}
                      title={`${days[i]}: ${money(amount)}`}
                    />
                    <span>{days[i]}</span>
                  </div>
                ))}
              </div>
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
              <span className={t?.online ? 'online-dot' : 'offline-dot'}>
                {t?.online ? 'Online' : queue.length > 0 ? 'Pending' : 'Counter Kiosk'}
              </span>
            </div>
            <div className="device">
              <span>{t?.terminal_code || 'TERM-01'}</span>
              <strong>
                {queue.length > 0
                  ? 'AWAITING BUTTON PRESS'
                  : t?.online
                    ? 'ONLINE & READY'
                    : 'COUNTER STATION READY'}
              </strong>
              <small>{t?.name || 'Counter Kiosk Verification Station'}</small>
              <div className="device-led" />
            </div>
            <div className="terminal-meta">
              <span>Pending terminal requests</span>
              <strong>{queue.length}</strong>
            </div>
            <p className="terminal-note">
              <Icon name="chip" /> Counter OLED, LED/buzzer &amp; physical GPIO 35 button verify
              walk-in handovers, resort dispatches, and return inspections.
            </p>
            <button
              className="secondary wide"
              data-page="ESP32 terminal"
              onClick={() => onNavigate('ESP32 terminal')}
            >
              View terminal records <Icon name="arrow" />
            </button>
          </section>

          <section className="panel category-panel">
            <h3>A little of everything</h3>
            <p>Your equipment at a glance.</p>
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

          <div className="counter-tip">
            <span>✦</span>
            <div>
              <strong>A small counter tip</strong>
              <p>Check item condition before confirming a return.</p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
