import React, { useState, useEffect, useLayoutEffect, useRef } from './react-shim.js';
import { Icon, BrandLogo, escape, icon, initials, formatDate } from './icons.jsx';
import { pageInfo } from '../workspace-navigation.js';
import { renderRentalNotifications } from '../notifications.js';
import { DashboardView, TerminalPendingBanner } from './DashboardView.jsx';
import { ProfileView } from './ProfileView.jsx';
import { MessagesView } from './MessagesView.jsx';
import { WorkspaceStatus } from './WorkspaceStatus.jsx';
import { WorkspaceErrorBoundary } from './WorkspaceErrorBoundary.jsx';

export const navGroups = [
  {
    id: 'management',
    label: 'Management',
    icon: 'layers',
    items: [
      ['Equipment', 'Inventory'],
      ['Customers', 'Customers'],
      ['Messages', 'Messages'],
      ['Rates & Fees', 'Rates & Fees']
    ]
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: 'repeat',
    items: [
      ['Rentals', 'Rentals'],
      ['Returns', 'Returns'],
      ['Rental History', 'Transaction History'],
      ['Payments & expenses', 'Payments']
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: 'wrench',
    items: [
      ['Maintenance', 'Maintenance'],
      ['ESP32 / Verification', 'ESP32 terminal']
    ]
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'chart',
    items: [
      ['Performance', 'Reports', 'performance'],
      ['Forecasting', 'Reports', 'forecast'],
      ['Recommendations', 'Reports', 'recommendations']
    ]
  }
];

export const pageLabels = {
  Inventory: 'Equipment',
  'Transaction History': 'Rental History',
  'ESP32 terminal': 'ESP32 / Verification'
};

export const workspacePages = new Set([
  'Customers',
  'Rates & Fees',
  'Rentals',
  'Returns',
  'Transaction History',
  'Maintenance',
  'Reports',
  'Payments',
  'Settings',
  'ESP32 terminal'
]);

function appearanceSettingsHtml(theme) {
  return `<section class="appearance-settings" aria-label="Appearance settings">
    <div class="settings-theme-previews" role="group" aria-label="Color theme">${['light', 'dark'].map(mode => `
      <button type="button" id="settings-theme-${mode}" class="settings-theme-example ${mode === theme ? 'is-current' : ''}" data-settings-theme="${mode}" aria-pressed="${mode === theme}">
        <div class="settings-theme-canvas is-${mode}" aria-hidden="true"><div class="settings-theme-side"><i></i><i></i><i></i><i></i></div><div class="settings-theme-page"><i></i><div><span></span><span></span></div><p></p><p></p></div></div>
        <span>${mode === 'light' ? 'Light' : 'Dark'}${mode === theme ? '<small aria-hidden="true">Current</small>' : ''}</span>
      </button>`).join('')}</div>
    <div class="theme-preference-note"><span id="theme-status" role="status">${theme === 'dark' ? 'Dark mode is on' : 'Light mode is on'}</span><small>Saved on this browser</small></div>
  </section>`;
}

export function PageHeading({ page, reportSection }) {
  const [caption, description, glyph] = pageInfo[page] || pageInfo.Dashboard;
  const reportInfo = {
    performance: [
      'STORE PERFORMANCE',
      'Explore rental results, equipment demand, customer activity, and service quality.'
    ],
    forecast: [
      'DEMAND & PLANNING ANALYTICS',
      'Compare recorded history with demand estimates, scenario projections, and equipment mix.'
    ],
    recommendations: [
      'ACTION PRIORITIES',
      'Review priorities, supporting evidence, and practical next steps.'
    ]
  }[reportSection];

  const title =
    page === 'Reports'
      ? {
          performance: 'Performance',
          forecast: 'Forecasting',
          recommendations: 'Recommendations'
        }[reportSection] || 'Performance'
      : pageLabels[page] || page;

  const displayCaption = page === 'Reports' && reportInfo ? reportInfo[0] : caption;
  const displayDesc = page === 'Reports' && reportInfo ? reportInfo[1] : description;

  return (
    <div className="page-heading" title={displayDesc}>
      <div className="page-heading-copy">
        <span className="sr-only">{displayCaption}</span>
        <h1>{title}</h1>
      </div>
    </div>
  );
}

const SKELETON_HTML = `<div class="inv-loading-copy"><span class="inv-loading-spinner" aria-hidden="true"></span><div><strong>Loading your equipment</strong><small>Getting your collection and availability ready…</small></div></div>
  <div class="inv-loading-stats" aria-hidden="true">${Array.from(
    { length: 4 },
    () =>
      `<div class="panel inv-stat inv-skeleton-stat"><span class="inv-skeleton-block inv-skeleton-icon"></span><div><i class="inv-skeleton-block inv-skeleton-label"></i><i class="inv-skeleton-block inv-skeleton-value"></i></div></div>`
  ).join('')}</div>
  <section class="panel inv-collection inv-loading-collection" aria-hidden="true">
    <div class="inv-loading-toolbar"><i class="inv-skeleton-block inv-skeleton-search"></i><div><i class="inv-skeleton-block inv-skeleton-button"></i><i class="inv-skeleton-block inv-skeleton-button short"></i><i class="inv-skeleton-block inv-skeleton-add"></i></div></div>
    <div class="inv-loading-filters"><i class="inv-skeleton-block inv-skeleton-filter"></i><i class="inv-skeleton-block inv-skeleton-filter"></i><i class="inv-skeleton-block inv-skeleton-filter sort"></i><i class="inv-skeleton-block inv-skeleton-reset"></i><i class="inv-skeleton-block inv-skeleton-count"></i></div>
    <div class="inv-loading-table"><div class="inv-loading-table-head"><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i></div>${Array.from(
      { length: 5 },
      () =>
        `<div class="inv-loading-row"><div class="inv-loading-equipment"><i class="inv-skeleton-block inv-skeleton-thumb"></i><div><i class="inv-skeleton-block inv-skeleton-name"></i><i class="inv-skeleton-block inv-skeleton-code"></i></div></div><div><i class="inv-skeleton-block inv-skeleton-status"></i><i class="inv-skeleton-block inv-skeleton-condition"></i></div><i class="inv-skeleton-block inv-skeleton-price"></i></div>`
    ).join('')}</div>
    <div class="inv-loading-footer"><i class="inv-skeleton-block"></i><div><i class="inv-skeleton-block"></i><i class="inv-skeleton-block"></i></div></div>
  </section>`;

export function InventorySection({ category, inventoryController, renderTick }) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!el.hasChildNodes()) {
      el.innerHTML = SKELETON_HTML;
    }
    inventoryController.mount(el, category);
  }, [category, inventoryController, renderTick]);

  return (
    <div
      id="inventory-root"
      ref={rootRef}
      className="inv-loading-shell"
      aria-live="polite"
      aria-busy="true"
    />
  );
}

export function WorkspaceModuleSection({
  page,
  user,
  theme,
  onSetTheme,
  workspaceUI,
  renderTick,
  onTriggerRender,
  onNavigate
}) {
  const containerRef = useRef(null);
  const renderedRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previousFocus = container.contains(document.activeElement) ? document.activeElement : null;
    const focusId = previousFocus?.id || '';
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    let selection = null;
    try {
      if (previousFocus && typeof previousFocus.selectionStart === 'number') {
        selection = [previousFocus.selectionStart, previousFocus.selectionEnd];
      }
    } catch {}

    const html = workspaceUI.render(page, user, appearanceSettingsHtml(theme));
    if (page !== 'Payments' && renderedRef.current?.page === page && renderedRef.current?.html === html) {
      workspaceUI.syncIfNeeded(page, onTriggerRender);
      return;
    }
    container.innerHTML = html;
    renderedRef.current = { page, html };

    container.querySelectorAll('[data-settings-theme]').forEach(button => {
      button.onclick = () => onSetTheme(button.dataset.settingsTheme);
    });

    container.querySelectorAll('[data-page]').forEach(el => {
      el.onclick = event => {
        event.preventDefault();
        onNavigate(
          el.dataset.page,
          false,
          el.dataset.filter || 'All rentals',
          '',
          el.dataset.analyticsSection || ''
        );
        if (el.dataset.target) {
          requestAnimationFrame(() =>
            document
              .getElementById(el.dataset.target)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          );
        }
      };
      if (el.getAttribute('role') === 'button') {
        el.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            el.click();
          }
        };
      }
    });

    const boundPage = page;
    workspaceUI.bind(page, user, () => {
      if (boundPage === page) onTriggerRender();
    });

    const restoredFocus = focusId ? document.getElementById(focusId) : null;
    if (restoredFocus && container.contains(restoredFocus)) {
      restoredFocus.focus({ preventScroll: true });
      if (selection && restoredFocus.setSelectionRange) {
        try {
          restoredFocus.setSelectionRange(...selection);
        } catch {}
      }
    }
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo(scrollX, scrollY);
    }
  }, [page, user, theme, workspaceUI, renderTick, onSetTheme, onTriggerRender, onNavigate]);

  return <div className="workspace-module-container" ref={containerRef} />;
}

export function WorkspaceShell({
  user,
  data,
  page,
  reportSection,
  connectionError,
  workspaceLoading = false,
  offline = false,
  theme,
  onSetTheme,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  rentalPage,
  onRentalPageChange,
  period,
  onPeriodChange,
  profileEditing,
  onSetProfileEditing,
  manualRefreshPending,
  onManualRefresh,
  onNavigate,
  onLogout,
  onUserUpdated,
  navGroupExpanded,
  onToggleNavGroup,
  sidebarCollapsed,
  onSetSidebarCollapsed,
  rentalNotifications,
  notificationVersion,
  notificationFingerprint,
  workspaceUI,
  inventoryController,
  showModal,
  confirmSubmit,
  api,
  toast,
  renderTick,
  onTriggerRender
}) {
  const prefetchTimer = useRef(null);
  useEffect(() => () => clearTimeout(prefetchTimer.current), []);
  const cancelPagePrefetch = () => clearTimeout(prefetchTimer.current);
  const queuePagePrefetch = target => {
    cancelPagePrefetch();
    if (target === page || navigator.connection?.saveData) return;
    prefetchTimer.current = setTimeout(() => { void workspaceUI.prefetch?.(target); }, 120);
  };
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width:720px)').matches : false
  );
  const sidebarRail = sidebarCollapsed && !isMobileViewport;
  const [sidebarFlyout, setSidebarFlyout] = useState(null);
  const flyoutCloseTimer = useRef(null);
  const keepFlyoutOpen = () => clearTimeout(flyoutCloseTimer.current);
  const openSidebarFlyout = groupId => {
    keepFlyoutOpen();
    if (sidebarRail) setSidebarFlyout(groupId);
  };
  const closeSidebarFlyout = () => {
    keepFlyoutOpen();
    flyoutCloseTimer.current = setTimeout(() => setSidebarFlyout(null), 180);
  };
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const sidebarRef = useRef(null);
  const sidebarFlyoutRef = useRef(null);
  const workspaceBodyRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const accountToggleRef = useRef(null);
  const accountDropdownRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const notificationDropdownRef = useRef(null);
  const notificationListRef = useRef(null);
  const notificationBellRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.matchMedia('(max-width:720px)').matches;
      setIsMobileViewport(mobile);
      setSidebarFlyout(null);
      if (!mobile) setMobileDrawerOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
    if (!sidebarRail || !sidebarFlyout) return;
    const button = document.getElementById(`nav-group-toggle-${sidebarFlyout}`);
    const flyout = sidebarFlyoutRef.current;
    if (!button || !flyout) return;
    const anchor = button.getBoundingClientRect();
    flyout.style.left = `${sidebarRef.current.getBoundingClientRect().right + 8}px`;
    flyout.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - flyout.getBoundingClientRect().height - 8))}px`;
  }, [sidebarRail, sidebarFlyout]);

  useEffect(() => {
    if (!sidebarRail) setSidebarFlyout(null);
    return keepFlyoutOpen;
  }, [sidebarRail]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    const body = workspaceBodyRef.current;
    if (sidebar) sidebar.inert = Boolean(isMobileViewport && !mobileDrawerOpen);
    if (body) body.inert = Boolean(isMobileViewport && mobileDrawerOpen);
  }, [isMobileViewport, mobileDrawerOpen]);

  useEffect(() => {
    const handleDocClick = event => {
      setAccountMenuOpen(false);
      setNotificationsOpen(false);
      if (!sidebarRef.current?.contains(event.target) && !sidebarFlyoutRef.current?.contains(event.target)) setSidebarFlyout(null);
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  // Sync notification list contents while preserving focused item inside list
  useLayoutEffect(() => {
    const list = notificationListRef.current;
    if (!list) return;
    const state = rentalNotifications.state();
    const overdue = data?.rentals.filter(r => r.displayStatus === 'Overdue') || [];
    const pending = data?.pending || [];
    const snapshot = JSON.stringify([state, overdue, pending]);
    if (list.dataset.snapshot !== snapshot && !list.contains(document.activeElement)) {
      list.innerHTML = `${
        state.loading ? '<p class="notification-feedback">Loading rental updates…</p>' : ''
      }${
        state.error
          ? `<p class="notification-feedback" role="alert">${escape(
              state.error
            )} <button type="button" data-notification-retry>Retry</button></p>`
          : ''
      }${renderRentalNotifications(state, { escape, formatDate })}${overdue
        .map(
          r =>
            `<button type="button" data-notification-page="Rentals"><span class="notification-mark overdue-mark">!</span><span><strong>Overdue rental · ${escape(
              r.item_name
            )}</strong><small>${escape(r.customer)} · Due ${escape(
              formatDate(r.due_at)
            )}</small></span>${icon('arrow')}</button>`
        )
        .join('')}${pending
        .map(
          r =>
            `<button type="button" data-notification-page="ESP32 terminal"><span class="notification-mark pending-mark">•</span><span><strong>Verification waiting · ${escape(
              r.item_name
            )}</strong><small>${escape(r.customer)} · ${escape(
              r.transaction_type
            )}</small></span>${icon('arrow')}</button>`
        )
        .join('')}${
        state.nextCursor
          ? '<button type="button" class="notification-load-more" data-notification-older>Load older updates</button>'
          : ''
      }${
        !state.loading &&
        !state.error &&
        !state.notifications.length &&
        !overdue.length &&
        !pending.length
          ? '<div class="workspace-empty"><h3>You’re all caught up</h3><p>New rental and return updates will appear here.</p></div>'
          : ''
      }`;
      list.dataset.snapshot = snapshot;
    }
  }, [data, rentalNotifications, notificationVersion, notificationsOpen]);

  const handleMobileMenuClick = () => {
    if (window.matchMedia('(max-width:720px)').matches) {
      const opening = !mobileDrawerOpen;
      setMobileDrawerOpen(opening);
      if (opening) {
        requestAnimationFrame(() => {
          sidebarRef.current?.querySelector('.active,nav button')?.focus();
        });
      }
    } else {
      const next = !sidebarCollapsed;
      onSetSidebarCollapsed(next);
    }
  };

  const handleSidebarKeyDown = event => {
    if (event.key === 'Escape') {
      setMobileDrawerOpen(false);
      setSidebarFlyout(null);
      mobileToggleRef.current?.focus();
    }
    if (event.key === 'Tab' && isMobileViewport && mobileDrawerOpen && sidebarRef.current) {
      const controls = [
        ...sidebarRef.current.querySelectorAll('a,button,[tabindex="0"]')
      ].filter(el => !el.disabled && el.getClientRects().length);
      const next = event.shiftKey ? controls.at(-1) : controls[0];
      if (
        (event.shiftKey && document.activeElement === controls[0]) ||
        (!event.shiftKey && document.activeElement === controls.at(-1))
      ) {
        event.preventDefault();
        next?.focus();
      }
    }
  };

  const handleToggleNotifications = e => {
    e.stopPropagation();
    setAccountMenuOpen(false);
    if (notificationsOpen) {
      setNotificationsOpen(false);
      return;
    }
    setNotificationsOpen(true);
    rentalNotifications.refresh();
    try {
      localStorage.setItem('rent-play-notifications-seen', notificationFingerprint);
    } catch {}
  };

  const handleNotificationMenuClick = async event => {
    event.stopPropagation();
    const entry = event.target.closest('[data-rental-notification]');
    if (entry) {
      setNotificationsOpen(false);
      try {
        rentalNotifications.markRead([entry.dataset.rentalNotification]).catch(() => {});
        if (entry.dataset.notificationChat) {
          window.dispatchEvent(new CustomEvent('rental-support-open', { detail: entry.dataset.notificationChat }));
          try { sessionStorage.setItem('rental-support-open', entry.dataset.notificationChat); } catch {}
          onNavigate('Messages');
        } else if (entry.dataset.notificationRental) {
          await workspaceUI.openTransaction(entry.dataset.notificationRental, {
            rentalCode: entry.dataset.rentalCode
          });
        } else if (entry.dataset.notificationPage) {
          onNavigate(entry.dataset.notificationPage);
        }
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    if (event.target.closest('[data-notification-mark-read]')) {
      try {
        await rentalNotifications.markRead(
          rentalNotifications.state().notifications.map(row => row.id)
        );
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    if (event.target.closest('[data-notification-retry]')) {
      rentalNotifications.refresh();
      return;
    }
    if (event.target.closest('[data-notification-older]')) {
      rentalNotifications.refresh({ older: true });
      return;
    }
    const target = event.target.closest('[data-notification-page]');
    if (target) {
      setNotificationsOpen(false);
      onNavigate(target.dataset.notificationPage);
    }
  };

  const handleNotificationKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setNotificationsOpen(false);
      notificationBellRef.current?.focus();
    }
    if (event.key === 'ArrowDown' && event.target.id === 'notifications') {
      event.preventDefault();
      if (!notificationsOpen) {
        setNotificationsOpen(true);
        rentalNotifications.refresh();
      }
      requestAnimationFrame(() => {
        notificationDropdownRef.current?.querySelector('button')?.focus();
      });
    }
  };

  const handleNotificationFocusOut = event => {
    if (!notificationMenuRef.current?.contains(event.relatedTarget)) {
      setNotificationsOpen(false);
    }
  };

  const handleToggleAccountMenu = event => {
    event.stopPropagation();
    setNotificationsOpen(false);
    const opening = !accountMenuOpen;
    setAccountMenuOpen(opening);
    if (opening) {
      requestAnimationFrame(() => {
        accountDropdownRef.current?.querySelector('[role="menuitem"]')?.focus();
      });
    }
  };

  const notifState = rentalNotifications.state();
  const unreadCount = notifState.unreadCount || 0;
  let notificationsSeen = '';
  try {
    notificationsSeen = localStorage.getItem('rent-play-notifications-seen') || '';
  } catch {}
  const showNotificationDot =
    !unreadCount &&
    !notificationsOpen &&
    Boolean(notificationFingerprint) &&
    notificationFingerprint !== notificationsSeen;

  const mobileToggleLabel = isMobileViewport
    ? mobileDrawerOpen
      ? 'Close navigation'
      : 'Open navigation'
    : sidebarCollapsed
      ? 'Expand sidebar'
      : 'Collapse sidebar';

  const userAvatar =
    user?.avatar ||
    (typeof window !== 'undefined' && window.localStorage
      ? localStorage.getItem(`rent_play_avatar_${user?.id || user?.email || 'active'}`)
      : '');

  const flyoutGroup = sidebarRail ? navGroups.find(group => group.id === sidebarFlyout) : null;
  const renderGroupLinks = group => group.items.map(([label, target, section]) => {
    const active = section ? page === 'Reports' && reportSection === section : page === target;
    const buttonLabel = section ? label : target;
    return <button
      key={`${target}-${section || ''}`}
      type="button"
      data-page={target}
      data-analytics-section={section || undefined}
      className={`nav-child${active ? ' active' : ''}`}
      aria-label={buttonLabel}
      title={buttonLabel}
      aria-current={active ? 'page' : undefined}
      onPointerEnter={() => queuePagePrefetch(target)}
      onPointerLeave={cancelPagePrefetch}
      onFocus={() => queuePagePrefetch(target)}
      onBlur={cancelPagePrefetch}
      onClick={event => {
        event.preventDefault();
        setMobileDrawerOpen(false);
        setSidebarFlyout(null);
        onNavigate(target, false, 'All rentals', '', section || '');
      }}
    >
      <span className="sidebar-label">{label}</span>
      {target === 'Rentals' ? <span className="nav-count">{data?.rentals?.length ?? '–'}</span> : null}
    </button>;
  });

  return (
    <>
      <a className="skip-link" href="#workspace-content">
        Skip to main content
      </a>
      <div className={`workspace${sidebarRail ? ' sidebar-collapsed' : ''}`}>
        <aside
          id="workspace-navigation"
          ref={sidebarRef}
          className={`sidebar${isMobileViewport && mobileDrawerOpen ? ' open' : ''}`}
          onKeyDown={handleSidebarKeyDown}
        >
          <a
            className="brand"
            href="/"
            data-page="Dashboard"
            aria-label="Rent & Play home"
            onClick={e => {
              e.preventDefault();
              setMobileDrawerOpen(false);
              onNavigate('Dashboard');
            }}
          >
            <BrandLogo />
          </a>

          <nav onScroll={() => setSidebarFlyout(null)}>
            <button
              data-page="Dashboard"
              className={`nav-root${page === 'Dashboard' ? ' active' : ''}`}
              aria-label="Dashboard"
              title="Dashboard"
              aria-current={page === 'Dashboard' ? 'page' : undefined}
              onClick={e => {
                e.preventDefault();
                setMobileDrawerOpen(false);
                onNavigate('Dashboard');
              }}
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon name="home" />
              </span>
              <span className="sidebar-label">Dashboard</span>
              <span className="nav-tooltip" aria-hidden="true">Dashboard</span>
            </button>

            {navGroups.map(group => {
              const expanded = Boolean(navGroupExpanded[group.id]);
              const hasActiveChild = group.items.some(([label, target, section]) => {
                return section
                  ? page === 'Reports' && reportSection === section
                  : page === target;
              });
              return (
                <section
                  className={`nav-section${hasActiveChild ? ' has-active-child' : ''}`}
                  key={group.id}
                  onPointerEnter={event => { if (event.pointerType !== 'touch') openSidebarFlyout(group.id); }}
                  onPointerLeave={closeSidebarFlyout}
                  onFocusCapture={() => openSidebarFlyout(group.id)}
                  onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeSidebarFlyout(); }}
                >
                  <button
                    type="button"
                    id={`nav-group-toggle-${group.id}`}
                    className={`nav-section-title${hasActiveChild ? ' group-active' : ''}`}
                    data-nav-group={group.id}
                    aria-expanded={sidebarRail ? sidebarFlyout === group.id : expanded}
                    aria-controls={!sidebarRail || sidebarFlyout === group.id ? `nav-group-${group.id}` : undefined}
                    aria-label={group.label}
                    title={group.label}
                    onClick={() => sidebarRail ? openSidebarFlyout(group.id) : onToggleNavGroup(group.id)}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      <Icon name={group.icon || 'box'} />
                    </span>
                    <span className="sidebar-label">{group.label}</span>
                    <span className="nav-group-chevron">
                      <Icon name="chevron" />
                    </span>
                  </button>
                  {!sidebarRail && <div
                    className="nav-section-items"
                    id={`nav-group-${group.id}`}
                    hidden={!expanded}
                  >
                    <div className="nav-flyout-header" aria-hidden="true">
                      <span>{group.label}</span>
                    </div>
                    {renderGroupLinks(group)}
                  </div>}
                </section>
              );
            })}
            <div className="nav-divider" aria-hidden="true" />

            <button
              data-page="Settings"
              className={`nav-root${page === 'Settings' ? ' active' : ''}`}
              aria-label="Settings"
              title="Settings"
              aria-current={page === 'Settings' ? 'page' : undefined}
              onPointerEnter={() => queuePagePrefetch('Settings')}
              onPointerLeave={cancelPagePrefetch}
              onFocus={() => queuePagePrefetch('Settings')}
              onBlur={cancelPagePrefetch}
              onClick={e => {
                e.preventDefault();
                setMobileDrawerOpen(false);
                onNavigate('Settings');
              }}
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon name="settings" />
              </span>
              <span className="sidebar-label">Settings</span>
              <span className="nav-tooltip" aria-hidden="true">Settings</span>
            </button>
            <button
              id="logout"
              type="button"
              className="nav-root"
              aria-label="Logout"
              title="Logout"
              onClick={() => {
                setMobileDrawerOpen(false);
                onLogout();
              }}
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon name="out" />
              </span>
              <span className="sidebar-label">Logout</span>
              <span className="nav-tooltip" aria-hidden="true">Logout</span>
            </button>
          </nav>

          <div className="sidebar-bottom">
            <div
              className="operator"
              data-page="Profile"
              tabIndex={0}
              role="button"
              aria-label="Open profile"
              onClick={e => {
                e.preventDefault();
                setMobileDrawerOpen(false);
                onNavigate('Profile');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMobileDrawerOpen(false);
                  onNavigate('Profile');
                }
              }}
            >
              <span className="avatar">
                {userAvatar ? (
                  <img src={userAvatar} alt={user.name} className="avatar-img" />
                ) : (
                  initials(user.name)
                )}
              </span>
              <div>
                <strong>{user.name}</strong>
                <small>{user.role}</small>
              </div>
              <span className="nav-tooltip" aria-hidden="true">Profile</span>
            </div>
          </div>
        </aside>

        {flyoutGroup && <nav
          key={flyoutGroup.id}
          ref={sidebarFlyoutRef}
          id={`nav-group-${flyoutGroup.id}`}
          className="sidebar-flyout"
          aria-label={`${flyoutGroup.label} pages`}
          onPointerEnter={keepFlyoutOpen}
          onPointerLeave={closeSidebarFlyout}
          onFocusCapture={keepFlyoutOpen}
          onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeSidebarFlyout(); }}
          onKeyDown={handleSidebarKeyDown}
        >
          <div className="sidebar-flyout-title">{flyoutGroup.label}</div>
          {renderGroupLinks(flyoutGroup)}
        </nav>}

        <div className="workspace-body" ref={workspaceBodyRef}>
          <header className="topbar">
            <div className="topbar-leading">
            <button
              ref={mobileToggleRef}
              className="icon-button menu-toggle"
              id="mobile-menu"
              aria-controls="workspace-navigation"
              aria-expanded={isMobileViewport ? mobileDrawerOpen : !sidebarRail}
              aria-label={mobileToggleLabel}
              title={mobileToggleLabel}
              onClick={handleMobileMenuClick}
              onKeyDown={e => {
                if (e.key === 'Escape') setMobileDrawerOpen(false);
              }}
            >
              <Icon name="menu" />
            </button>
            <PageHeading page={page} reportSection={reportSection} />
            </div>

            <div className="top-actions">
              <div className="unified-top-pill" role="toolbar" aria-label="Quick actions">
                <button
                  className={`top-pill-btn top-pill-refresh${manualRefreshPending ? ' spinning' : ''}`}
                  id="refresh"
                  type="button"
                  disabled={manualRefreshPending}
                  aria-busy={manualRefreshPending ? 'true' : undefined}
                  aria-label={manualRefreshPending ? 'Refreshing data…' : 'Refresh data'}
                  title={manualRefreshPending ? 'Refreshing…' : 'Refresh'}
                  onClick={onManualRefresh}
                >
                  <Icon name="refresh" />
                </button>

                <span className="top-pill-sep" aria-hidden="true" />

                <div
                  className="notification-menu"
                  ref={notificationMenuRef}
                  onClick={handleNotificationMenuClick}
                  onKeyDown={handleNotificationKeyDown}
                  onBlur={handleNotificationFocusOut}
                >
                  <button
                    ref={notificationBellRef}
                    type="button"
                    className="top-pill-btn top-pill-bell"
                    id="notifications"
                    aria-label="View notifications"
                    aria-expanded={notificationsOpen}
                    aria-controls="notification-dropdown"
                    onClick={handleToggleNotifications}
                  >
                    <Icon name="bell" />
                    {unreadCount > 0 ? (
                      <span
                        className="notification-count-badge"
                        aria-label={`${unreadCount} unread updates`}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    ) : showNotificationDot ? (
                      <i />
                    ) : null}
                  </button>
                  <section
                    ref={notificationDropdownRef}
                    className="notification-dropdown"
                    id="notification-dropdown"
                    aria-label="Notifications"
                    hidden={!notificationsOpen}
                  >
                    <header className="notification-dropdown-heading">
                      <h2>Notifications</h2>
                      <span id="notification-count">
                        {unreadCount ? `${unreadCount} unread` : 'No unread updates'}
                      </span>
                    </header>
                    <div className="notification-toolbar">
                      <button
                        type="button"
                        className="text-button"
                        data-notification-mark-read
                        disabled={!unreadCount}
                      >
                        Mark shown as read
                      </button>
                    </div>
                    <div className="notification-list" ref={notificationListRef} />
                  </section>
                </div>

                <span className="top-pill-sep" aria-hidden="true" />

                <div
                  className="profile-menu"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setAccountMenuOpen(false);
                      accountToggleRef.current?.focus();
                    }
                  }}
                >
                  <button
                    ref={accountToggleRef}
                    className="top-pill-btn top-pill-profile profile-menu-toggle"
                    id="profile-menu-toggle"
                    type="button"
                    aria-label="Open account menu"
                    aria-haspopup="menu"
                    aria-expanded={accountMenuOpen}
                    onClick={handleToggleAccountMenu}
                  >
                    <span className="avatar small">
                      {userAvatar ? (
                        <img src={userAvatar} alt="" className="avatar-img" />
                      ) : (
                        initials(user.name)
                      )}
                    </span>
                    <span className="top-pill-user-name">
                      {user.name ? user.name.split(' ')[0] : 'Account'}
                    </span>
                    <span className="profile-menu-chevron" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  <div
                    ref={accountDropdownRef}
                    className="profile-dropdown"
                    id="profile-dropdown"
                    role="menu"
                    hidden={!accountMenuOpen}
                  >
                    <div className="profile-dropdown-user">
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </div>
                    <button
                      data-page="Profile"
                      role="menuitem"
                      onClick={e => {
                        e.preventDefault();
                        setAccountMenuOpen(false);
                        onNavigate('Profile');
                      }}
                    >
                      <Icon name="users" /> View profile
                    </button>
                    <button
                      data-page="Settings"
                      role="menuitem"
                      onClick={e => {
                        e.preventDefault();
                        setAccountMenuOpen(false);
                        onNavigate('Settings');
                      }}
                    >
                      <Icon name="settings" /> Settings
                    </button>
                    <button
                      data-action="logout"
                      className="profile-dropdown-logout"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onLogout();
                      }}
                    >
                      <Icon name="out" /> Sign out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="content" id="workspace-content" tabIndex={-1}>
            {page === 'Dashboard' && <WorkspaceStatus loading={workspaceLoading} error={connectionError} offline={offline} hasData={Boolean(data)} onRetry={onManualRefresh} />}
            {page !== 'Dashboard' && page !== 'ESP32 terminal' && data ? (
              <TerminalPendingBanner data={data} workspaceUI={workspaceUI} onNavigate={onNavigate} />
            ) : null}

            <WorkspaceErrorBoundary key={page} onRetry={onManualRefresh} onHome={() => onNavigate('Dashboard')}>
            {page === 'Dashboard' ? (data &&
              <DashboardView
                data={data}
                filter={filter}
                onFilterChange={onFilterChange}
                query={query}
                onQueryChange={onQueryChange}
                rentalPage={rentalPage}
                onRentalPageChange={onRentalPageChange}
                period={period}
                onPeriodChange={onPeriodChange}
                onNavigate={onNavigate}
                showModal={showModal}
                workspaceUI={workspaceUI}
                api={api}
                toast={toast}
              />
            ) : page === 'Inventory' ? (
              <InventorySection
                category={
                  typeof window !== 'undefined' ? window.__rentPlayCategory || '' : ''
                }
                inventoryController={inventoryController}
                renderTick={renderTick}
              />
            ) : page === 'Messages' ? (
              <MessagesView api={api} user={user} />
            ) : page === 'Profile' ? (
              <ProfileView
                user={user}
                profileEditing={profileEditing}
                onSetProfileEditing={onSetProfileEditing}
                confirmSubmit={confirmSubmit}
                api={api}
                onUserUpdated={onUserUpdated}
                toast={toast}
              />
            ) : workspacePages.has(page) ? (
              <WorkspaceModuleSection
                page={page}
                user={user}
                theme={theme}
                onSetTheme={onSetTheme}
                workspaceUI={workspaceUI}
                renderTick={renderTick}
                onTriggerRender={onTriggerRender}
                onNavigate={onNavigate}
              />
            ) : (
              <section className="panel">
                <div className="empty-state">
                  <Icon name="box" />
                  <h3>Page unavailable</h3>
                  <p>Choose another workspace section.</p>
                </div>
              </section>
            )}

            </WorkspaceErrorBoundary>
            <footer className="content-footer">
              <span>© {new Date().getFullYear()} Rent &amp; Play</span>
              <span>
                {page === 'Dashboard' && data?.refreshedAt && Number.isFinite(Date.parse(data.refreshedAt))
                  ? `Updated ${new Intl.DateTimeFormat('en-PH', {
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: 'Asia/Manila'
                    }).format(new Date(data.refreshedAt))}`
                  : offline ? 'Offline' : workspaceLoading ? 'Loading latest records…' : 'Rent & Play workspace'}
              </span>
            </footer>
          </main>
        </div>

        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          hidden={!(isMobileViewport && mobileDrawerOpen)}
          onClick={() => {
            setMobileDrawerOpen(false);
            mobileToggleRef.current?.focus();
          }}
        />
      </div>
    </>
  );
}
