import test from 'node:test';
import assert from 'node:assert/strict';
import React, { renderToStaticMarkup } from '../src/react-vendor.js';
import {
  SessionLoadingView,
  LoginView,
  PasswordChangeView,
  DashboardView,
  TerminalPendingBanner,
  WorkspaceShell,
  ProfileView,
  PageHeading
} from '../src/react-ui.js';
import { enrichVerification } from '../src/transaction-records.js';

test('React SessionLoadingView and LoginView render accessible markup and theme controls', () => {
  const loadingHtml = renderToStaticMarkup(React.createElement(SessionLoadingView));
  assert.match(loadingHtml, /class="session-loading"/);
  assert.match(loadingHtml, /Opening your workspace…/);

  const loginHtml = renderToStaticMarkup(
    React.createElement(LoginView, {
      initialError: 'ECONNREFUSED 127.0.0.1:3000',
      theme: 'dark',
      onToggleTheme() {},
      api: async () => ({}),
      modal: {},
      showModal() {},
      onLoginSuccess: async () => {},
      setPasswordResetCountdown() {}
    })
  );
  assert.match(loginHtml, /class="login"/);
  assert.match(loginHtml, /OWNER \/ OPERATOR WORKSPACE/);
  assert.match(loginHtml, /id="login-theme"/);
  assert.match(loginHtml, /Switch to light mode/);
  assert.match(loginHtml, /temporarily unavailable/);
  assert.doesNotMatch(loginHtml, /ECONNREFUSED|127\.0\.0\.1|database|backend/i);
});

test('React PasswordChangeView and ProfileView render user account details and edit mode', () => {
  const user = {
    id: 'u-1',
    name: 'Juan Dela Cruz',
    email: 'juan@rentplay.ph',
    role: 'OWNER',
    account_code: 'ACC-001',
    mustChangePassword: true
  };

  const pwHtml = renderToStaticMarkup(
    React.createElement(PasswordChangeView, {
      user,
      rememberSession: true,
      api: async () => ({}),
      onPasswordUpdated: async () => {},
      onSignOutAgain() {},
      onSignOut() {}
    })
  );
  assert.match(pwHtml, /Secure your account/);
  assert.match(pwHtml, /Owner workspace/);
  assert.match(pwHtml, /id="required-password-form"/);

  const profileOverviewHtml = renderToStaticMarkup(
    React.createElement(ProfileView, {
      user,
      profileEditing: false,
      onSetProfileEditing() {},
      confirmSubmit() {},
      api: async () => ({}),
      onUserUpdated() {},
      toast() {}
    })
  );
  assert.match(profileOverviewHtml, /Juan Dela Cruz/);
  assert.match(profileOverviewHtml, /juan@rentplay\.ph/);
  assert.match(profileOverviewHtml, /ACC-001/);
  assert.match(profileOverviewHtml, /id="profile-edit"/);

  const profileEditHtml = renderToStaticMarkup(
    React.createElement(ProfileView, {
      user,
      profileEditing: true,
      onSetProfileEditing() {},
      confirmSubmit() {},
      api: async () => ({}),
      onUserUpdated() {},
      toast() {}
    })
  );
  assert.match(profileEditHtml, /id="profile-form"/);
  assert.match(profileEditHtml, /Update your details/);
});

test('React DashboardView and PageHeading render live stats, rental rows, revenue chart, and ESP32 terminal card', () => {
  const headingHtml = renderToStaticMarkup(
    React.createElement(PageHeading, { page: 'Reports', reportSection: 'forecast' })
  );
  assert.match(headingHtml, /PLANNING ANALYTICS/);
  assert.match(headingHtml, /Forecasting/);

  const dashboardData = {
    stats: { active: 3, available: 42, dueToday: 1, overdue: 2, fees: 1250 },
    rentals: [
      {
        id: 'rent-1',
        rental_code: 'RNT-101',
        item_id: 'item-1',
        item_name: 'Nintendo Switch',
        customer: 'Maria Clara',
        due_at: '2026-10-20T08:00:00Z',
        confirmed_rental_at: '2026-10-20T04:00:00Z',
        displayStatus: 'Overdue',
        rental_fee: 350
      }
    ],
    items: [{ id: 'item-1', category: 'Gaming Console' }],
    revenue: {
      'This week': [100, 250, 0, 400, 500, 0, 0],
      'Last week': [0, 0, 0, 0, 0, 0, 0]
    },
    terminals: [{ terminal_code: 'TERM-01', name: 'Front Desk Terminal' }],
    pending: [{ terminal_code: 'TERM-01' }],
    categories: [{ name: 'Sports Equipment', count: 12 }]
  };

  const dashHtml = renderToStaticMarkup(
    React.createElement(DashboardView, {
      data: dashboardData,
      filter: 'All rentals',
      onFilterChange() {},
      query: '',
      onQueryChange() {},
      rentalPage: 0,
      onRentalPageChange() {},
      period: 'This week',
      onPeriodChange() {},
      onNavigate() {},
      showModal() {}
    })
  );

  assert.match(dashHtml, /Active rentals/);
  assert.match(dashHtml, />New walk-in rental</);
  assert.doesNotMatch(dashHtml, /\+ New|Scan QR \/ Lookup|GPIO 35|COUNTER STATION READY/);
  assert.match(dashHtml, /Available units/);
  assert.match(dashHtml, /Overdue: 2/);
  assert.match(dashHtml, /Not configured|Offline|Connected/);
  assert.match(dashHtml, /aria-label="Fri: ₱500 in rental fees"/);
  assert.match(dashHtml, /Nintendo Switch/);
  assert.match(dashHtml, /RNT-101/);
  assert.match(dashHtml, /Maria Clara/);
  assert.match(dashHtml, /TERM-01/);
  assert.match(dashHtml, /Front Desk Terminal/);
  assert.match(dashHtml, /Sports Equipment/);
  assert.match(dashHtml, /12 items in inventory/);

  const recentlyOverdueHtml = renderToStaticMarkup(React.createElement(DashboardView, {
    data: { ...dashboardData, rentals: [{ ...dashboardData.rentals[0], due_at: new Date(Date.now() - 30 * 60000).toISOString() }] },
    filter: 'All rentals', query: '', rentalPage: 0, period: 'This week',
    onNavigate() {}, onFilterChange() {}, onQueryChange() {}, onRentalPageChange() {}, onPeriodChange() {}, showModal() {}
  }));
  assert.match(recentlyOverdueHtml, /Overdue by 30m/);
  assert.doesNotMatch(recentlyOverdueHtml, /Overdue by 1h 30m/);

});

test('Global ESP32 TerminalPendingBanner surfaces across workspace pages without duplicating on Dashboard or ESP32 terminal', () => {
  const user = {
    id: 'u-1',
    name: 'Juan Dela Cruz',
    email: 'juan@rentplay.ph',
    role: 'OWNER',
    account_code: 'ACC-001'
  };

  const pendingData = {
    stats: { active: 1, available: 10, dueToday: 0, overdue: 0, fees: 500 },
    rentals: [
      {
        id: 'rent-88',
        rental_code: 'RNT-880',
        item_id: 'item-8',
        item_name: 'PS5 Bundle',
        customer: 'Jose Rizal',
        due_at: '2026-11-10T10:00:00Z',
        confirmed_rental_at: '2026-11-08T10:00:00Z',
        displayStatus: 'Active',
        rental_fee: 500
      }
    ],
    items: [{ id: 'item-8', category: 'Gaming Console' }],
    revenue: { 'This week': [0, 0, 0, 0, 500, 0, 0], 'Last week': [0, 0, 0, 0, 0, 0, 0] },
    terminals: [{ terminal_code: 'TERM-01', name: 'Counter Terminal', online: true }],
    pending: [
      {
        id: 'ver-88',
        rental_id: 'rent-88',
        rental_code: 'RNT-880',
        verification_code: '482910',
        terminal_code: 'TERM-02',
        item_name: 'PS5 Bundle',
        customer: 'Jose Rizal',
        transaction_type: 'RELEASE'
      }
    ],
    categories: [{ name: 'Gaming Console', count: 5 }]
  };

  const bannerHtml = renderToStaticMarkup(
    React.createElement(TerminalPendingBanner, { data: pendingData })
  );
  assert.match(bannerHtml, /Terminal confirmation needed/);
  assert.match(bannerHtml, /PS5 Bundle/);
  assert.match(bannerHtml, /Jose Rizal/);
  assert.match(bannerHtml, /RNT-880/);
  assert.match(bannerHtml, /TERM-02/);

  const baseShellProps = {
    user,
    data: pendingData,
    reportSection: '',
    connectionError: '',
    workspaceLoading: false,
    offline: false,
    theme: 'light',
    onSetTheme() {},
    filter: 'All rentals',
    onFilterChange() {},
    query: '',
    onQueryChange() {},
    rentalPage: 0,
    onRentalPageChange() {},
    period: 'This week',
    onPeriodChange() {},
    profileEditing: false,
    onSetProfileEditing() {},
    manualRefreshPending: false,
    onManualRefresh() {},
    onNavigate() {},
    onLogout() {},
    onUserUpdated() {},
    navGroupExpanded: {},
    onToggleNavGroup() {},
    sidebarCollapsed: false,
    onSetSidebarCollapsed() {},
    rentalNotifications: {
      state: () => ({ notifications: [], unreadCount: 0, loading: false, error: null, nextCursor: null })
    },
    notificationVersion: 0,
    notificationFingerprint: '',
    workspaceUI: {},
    inventoryController: {},
    showModal() {},
    confirmSubmit() {},
    api: async () => ({}),
    toast() {},
    renderTick: 0,
    onTriggerRender() {}
  };

  const rentalsPageHtml = renderToStaticMarkup(
    React.createElement(WorkspaceShell, { ...baseShellProps, page: 'Rentals' })
  );
  assert.equal((rentalsPageHtml.match(/Terminal confirmation needed/g) || []).length, 1);

  const messagesPageHtml = renderToStaticMarkup(
    React.createElement(WorkspaceShell, { ...baseShellProps, page: 'Messages' })
  );
  assert.equal((messagesPageHtml.match(/Terminal confirmation needed/g) || []).length, 1);

  const dashboardShellHtml = renderToStaticMarkup(
    React.createElement(WorkspaceShell, { ...baseShellProps, page: 'Dashboard' })
  );
  assert.equal((dashboardShellHtml.match(/Terminal confirmation needed/g) || []).length, 1);

  const espPageHtml = renderToStaticMarkup(
    React.createElement(WorkspaceShell, { ...baseShellProps, page: 'ESP32 terminal' })
  );
  assert.equal((espPageHtml.match(/Terminal confirmation needed/g) || []).length, 0);

  const enriched = enrichVerification(pendingData.pending[0], null);
  assert.equal(enriched.item_name, 'PS5 Bundle');
  assert.equal(enriched.customer_name, 'Jose Rizal');
  assert.equal(enriched.rental_code, 'RNT-880');
  assert.equal(enriched.terminal_code, 'TERM-02');
});

test('DashboardView renders Today collections Cash vs GCash/InstaPay QR split and Z-Reading action distinctly from recorded fees', () => {
  const dashHtml = renderToStaticMarkup(
    React.createElement(DashboardView, {
      data: {
        stats: { active: 2, available: 15, dueToday: 1, overdue: 0, fees: 800 },
        rentals: [],
        items: [],
        revenue: { 'This week': [0, 0, 800, 0, 0, 0, 0], 'Last week': [0, 0, 0, 0, 0, 0, 0] },
        terminals: [{ terminal_code: 'TERM-01', name: 'Counter Terminal', online: true }],
        pending: [],
        categories: [],
        collections: {
          businessDay: '2026-11-08',
          total: 1450,
          cash: 600,
          qr: 850,
          refunds: 50,
          expenses: 100,
          netCollected: 1400,
          netAfterExpenses: 1300,
          cashNetMovement: 450,
          entryCount: 3
        }
      },
      filter: 'All rentals',
      onFilterChange() {},
      query: '',
      onQueryChange() {},
      rentalPage: 0,
      onRentalPageChange() {},
      period: 'This week',
      onPeriodChange() {},
      onNavigate() {},
      showModal() {}
    })
  );

  assert.match(dashHtml, /Today’s collections/);
  assert.match(dashHtml, /₱1,450/);
  assert.match(dashHtml, /3 ledger entries today/);
  assert.match(dashHtml, /Cash in person/);
  assert.match(dashHtml, /₱600/);
  assert.match(dashHtml, /GCash \/ InstaPay QR/);
  assert.match(dashHtml, /₱850/);
  assert.match(dashHtml, /Drawer cash movement/);
  assert.match(dashHtml, /₱450/);
  assert.match(dashHtml, /After refunds &amp; expenses/);
  assert.match(dashHtml, /₱1,300/);
  assert.match(dashHtml, /Cash drawer \(Z-Reading\)/);
  assert.match(dashHtml, /Recorded rental charges/);
});

test.after(() => {
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (typeof handle?.unref === 'function') {
      handle.unref();
    }
  }
});

