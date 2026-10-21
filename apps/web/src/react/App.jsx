import React, { useState, useEffect, useRef, useCallback } from './react-shim.js';
import {
  escape,
  icon,
  money,
  symbol,
  formatDate,
  badge,
  stateLabel,
  cleanErrorMessage
} from './icons.jsx';
import { SessionLoadingView, LoginView } from './LoginView.jsx';
import { PasswordChangeView } from './PasswordChangeView.jsx';
import {
  WorkspaceShell,
  navGroups,
  pageLabels,
  workspacePages
} from './WorkspaceLayout.jsx';
import { createInventory } from '../inventory.js';
import { createWorkspaceUI } from '../workspace-ui.js';
import { createConfirmationDialog } from '../confirmation-dialog.js';
import {
  pageRoutes,
  pageForPath,
  reportPathForSection,
  reportSectionForPath
} from '../workspace-navigation.js';
import { createApiClient } from '../api-client.js';
import { createRentalNotifications, syncLiveRentalUpdate } from '../notifications.js';

const dashboardSnapshot = value =>
  value
    ? JSON.stringify(
        Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'refreshedAt'))
      )
    : '';

const liveRentalPages = new Set(['Rentals', 'Returns', 'Transaction History']);

export function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [rememberSession, setRememberSession] = useState(false);
  const [data, setData] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [page, setPage] = useState(() => pageForPath(location.pathname));
  const [reportSection, setReportSection] = useState(() =>
    reportSectionForPath(location.pathname)
  );
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState('All rentals');
  const [query, setQuery] = useState('');
  const [rentalPage, setRentalPage] = useState(0);
  const [period, setPeriod] = useState('This week');
  const [profileEditing, setProfileEditing] = useState(false);
  const [manualRefreshPending, setManualRefreshPending] = useState(false);
  const [theme, setThemeState] = useState(
    () => document.documentElement.dataset.theme || 'light'
  );
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() => {
    try {
      return localStorage.getItem('rent-play-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [navGroupExpanded, setNavGroupExpanded] = useState(() => {
    const initial = Object.fromEntries(navGroups.map(group => [group.id, true]));
    try {
      const saved = JSON.parse(localStorage.getItem('rent-play-nav-groups') || '{}');
      for (const group of navGroups) {
        if (typeof saved[group.id] === 'boolean') initial[group.id] = saved[group.id];
      }
    } catch {}
    return initial;
  });
  const [notificationVersion, setNotificationVersion] = useState(0);
  const [renderTick, setRenderTick] = useState(0);

  // Mutable refs for async callbacks, timers, and SSE handlers
  const userRef = useRef(user);
  userRef.current = user;
  const dataRef = useRef(data);
  dataRef.current = data;
  const pageRef = useRef(page);
  pageRef.current = page;
  const refreshingRef = useRef(false);
  const logoutPendingRef = useRef(false);
  const toastTimerRef = useRef(null);
  const passwordResetCountdownRef = useRef(null);

  // SSE stream refs
  const rentalEventSourceRef = useRef(null);
  const rentalEventAccountRef = useRef(null);
  const rentalEventsDisabledRef = useRef(false);
  const rentalEventSyncTimerRef = useRef(null);
  const rentalEventSyncingRef = useRef(false);
  const rentalEventSyncPendingRef = useRef(false);

  // Keep category accessible for InventorySection
  if (typeof window !== 'undefined') {
    window.__rentPlayCategory = category;
  }

  const triggerRender = useCallback(() => {
    setRenderTick(t => t + 1);
  }, []);

  const setPasswordResetCountdown = useCallback(timer => {
    if (passwordResetCountdownRef.current) {
      clearInterval(passwordResetCountdownRef.current);
    }
    passwordResetCountdownRef.current = timer;
  }, []);

  const toast = useCallback(message => {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => el.classList.remove('visible'), 4000);
  }, []);

  const setTheme = useCallback(next => {
    const resolved = next === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem('rent-play-theme', resolved);
    } catch {}
    setThemeState(resolved);
  }, []);

  const setSidebarCollapsed = useCallback(next => {
    setSidebarCollapsedState(next);
    try {
      localStorage.setItem('rent-play-sidebar-collapsed', String(next));
    } catch {}
  }, []);

  // Singleton controllers
  const controllersRef = useRef(null);
  if (!controllersRef.current) {
    const modal = document.querySelector('#modal');
    const confirmDialog = document.querySelector('#confirmation-modal');
    const apiClient = createApiClient();
    const confirmation = createConfirmationDialog({
      dialog: confirmDialog,
      parentModal: modal,
      notify: message => toast(message)
    });

    const updateModalLayout = () => {
      if (!modal) return;
      const form = modal.querySelector(
        ':scope > .admin-form:not(.pricing-form):not(.customer-form):not(.rental-release-form)'
      );
      const fields = form
        ? [
            ...form.querySelectorAll(
              'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
            )
          ].filter(field => !field.closest('[hidden]'))
        : [];
      modal.classList.toggle('modal-compact', Boolean(form) && fields.length <= 4);
    };

    if (modal && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(updateModalLayout);
      observer.observe(modal, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'type']
      });
    }

    const showModal = (title, body) => {
      confirmation.cancel();
      modal.innerHTML = `<div class="modal-heading"><h2>${escape(
        title
      )}</h2><button class="icon-button" id="close-modal" aria-label="Close dialog">✕</button></div>${body}`;
      modal.setAttribute('aria-label', title);
      updateModalLayout();
      if (!modal.open) modal.showModal();
      modal.scrollTop = 0;
      const closeBtn = document.querySelector('#close-modal');
      if (closeBtn) closeBtn.onclick = () => modal.close();
    };

    controllersRef.current = {
      modal,
      apiClient,
      confirmation,
      showModal,
      inventoryController: null,
      workspaceUI: null,
      rentalNotifications: null,
      api: null,
      goTo: null,
      endSession: null
    };
  }

  const stopRentalEventStream = useCallback(() => {
    rentalEventSourceRef.current?.close();
    rentalEventSourceRef.current = null;
    rentalEventAccountRef.current = null;
    rentalEventsDisabledRef.current = false;
    rentalEventSyncPendingRef.current = false;
    clearTimeout(rentalEventSyncTimerRef.current);
    rentalEventSyncTimerRef.current = null;
  }, []);

  const endSession = useCallback(
    (msg = 'Your session ended. Please sign in again.') => {
      if (!userRef.current) return;
      const c = controllersRef.current;
      c.confirmation.cancel();
      userRef.current = null;
      dataRef.current = null;
      setUser(null);
      setData(null);
      setConnectionError('');
      stopRentalEventStream();
      c.rentalNotifications?.setAccount(null);
      c.inventoryController?.reset();
      c.workspaceUI?.reset();
      c.modal?.close();
      setLoginError(msg);
    },
    [stopRentalEventStream]
  );

  const api = useCallback(
    async (path, options = {}) => {
      const c = controllersRef.current;
      let result;
      try {
        result = await c.apiClient.request(path, options);
      } catch (error) {
        if (error.code === 'PASSWORD_CHANGE_REQUIRED' && userRef.current) {
          const updated = { ...userRef.current, mustChangePassword: true };
          userRef.current = updated;
          setUser(updated);
        } else if (error.status === 401 && userRef.current && !path.startsWith('/auth/')) {
          endSession();
        }
        throw error;
      }
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(options.method || 'GET').toUpperCase()) &&
        path !== '/pricing/quote' &&
        !path.startsWith('/notifications') &&
        !path.startsWith('/auth/')
      ) {
        c.workspaceUI?.invalidate();
      }
      return result;
    },
    [endSession]
  );

  const goTo = useCallback(
    (
      next,
      replace = false,
      nextFilter = 'All rentals',
      nextCategory = '',
      nextReportSection = ''
    ) => {
      const c = controllersRef.current;
      const currentPage = pageRef.current;
      let resolvedSection = c.workspaceUI?.reportSection() || 'performance';
      if (next === 'Reports') {
        resolvedSection =
          nextReportSection ||
          (currentPage === 'Reports' ? c.workspaceUI?.reportSection() : 'performance') ||
          'performance';
        c.workspaceUI?.setReportSection(resolvedSection);
        setReportSection(resolvedSection);
      }
      if (workspacePages.has(next) && !(next === 'Reports' && currentPage === 'Reports')) {
        c.workspaceUI?.invalidate();
      }
      pageRef.current = next;
      setPage(next);
      setProfileEditing(false);
      setCategory(nextCategory);
      if (typeof window !== 'undefined') {
        window.__rentPlayCategory = nextCategory;
      }
      setFilter(nextFilter);
      setQuery('');
      setRentalPage(0);

      const route =
        next === 'Reports' ? reportPathForSection(resolvedSection) : pageRoutes[next] || '/';
      if (location.pathname !== route) {
        history[replace ? 'replaceState' : 'pushState']({ page: next }, '', route);
      }
      const group = navGroups.find(grp => grp.items.some(([, target]) => target === next));
      if (group) {
        setNavGroupExpanded(prev => {
          const updated = { ...prev, [group.id]: true };
          try {
            localStorage.setItem('rent-play-nav-groups', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
      triggerRender();
      window.scrollTo(0, 0);
      requestAnimationFrame(() => {
        document.querySelector('#workspace-content')?.focus({ preventScroll: true });
      });
    },
    [triggerRender]
  );

  // Initialize domain controllers with latest callbacks
  controllersRef.current.api = api;
  controllersRef.current.goTo = goTo;
  controllersRef.current.endSession = endSession;

  if (!controllersRef.current.inventoryController) {
    const c = controllersRef.current;
    const { confirmAction, confirmSubmit } = c.confirmation;
    c.inventoryController = createInventory({
      api: (...args) => c.api(...args),
      escape,
      icon,
      symbol,
      badge,
      stateLabel,
      formatDate,
      showModal: c.showModal,
      modal: c.modal,
      toast,
      confirmAction,
      confirmSubmit,
      openMaintenance: (id, item) => c.workspaceUI.openMaintenanceForUnit(id, item)
    });
    c.workspaceUI = createWorkspaceUI({
      api: (...args) => c.api(...args),
      escape,
      icon,
      showModal: c.showModal,
      modal: c.modal,
      toast,
      money,
      formatDate,
      confirmAction,
      confirmSubmit,
      showEquipmentDetails: id => c.inventoryController.details(id),
      onMaintenanceSaved: () => c.inventoryController.refresh({ force: true }),
      navigate: (...args) => c.goTo(...args)
    });
    c.workspaceUI.setReportSection(reportSectionForPath(location.pathname));
    c.rentalNotifications = createRentalNotifications({
      api: (...args) => c.api(...args),
      onChange: () => setNotificationVersion(v => v + 1),
      onAlert: (notification, count) =>
        toast(
          count > 1
            ? `${count} new rental updates. Open notifications to review them.`
            : `${notification.title}: ${notification.message}`
        )
    });
  }

  const refresh = useCallback(
    async ({ force = false } = {}) => {
      const currentUser = userRef.current;
      if (currentUser?.mustChangePassword) return;
      if (!currentUser || refreshingRef.current) return;
      const sessionUser = currentUser;
      refreshingRef.current = true;
      const c = controllersRef.current;
      try {
        const nextData = await api(
          '/dashboard',
          force ? { headers: { 'Cache-Control': 'no-cache' } } : {}
        );
        const changed = dashboardSnapshot(dataRef.current) !== dashboardSnapshot(nextData);
        if (userRef.current !== sessionUser) return;
        dataRef.current = nextData;
        setData(nextData);
        setConnectionError('');
        if (pageRef.current === 'Inventory' && document.querySelector('#inventory-root')) {
          await c.inventoryController.refresh();
        } else if (changed && ['Dashboard', 'ESP32 terminal'].includes(pageRef.current)) {
          triggerRender();
        }
      } catch (error) {
        if (error.status === 401) {
          endSession();
        } else {
          setConnectionError(error.message);
        }
      } finally {
        refreshingRef.current = false;
      }
    },
    [api, endSession, triggerRender]
  );

  const scheduleRentalEventSync = useCallback(() => {
    clearTimeout(rentalEventSyncTimerRef.current);
    rentalEventSyncTimerRef.current = setTimeout(async () => {
      rentalEventSyncTimerRef.current = null;
      const currentUser = userRef.current;
      const c = controllersRef.current;
      if (!currentUser || currentUser.mustChangePassword || logoutPendingRef.current) return;
      if (!c.apiClient.canRefresh() || document.visibilityState !== 'visible') {
        rentalEventSyncPendingRef.current = true;
        return;
      }
      if (rentalEventSyncingRef.current) {
        rentalEventSyncPendingRef.current = true;
        return;
      }
      rentalEventSyncPendingRef.current = false;
      rentalEventSyncingRef.current = true;
      try {
        const synced = await syncLiveRentalUpdate({
          notifications: c.rentalNotifications,
          isDialogOpen: () => Boolean(c.modal?.open),
          refreshView: async () => {
            const currentPage = pageRef.current;
            if (currentPage === 'Dashboard') {
              await refresh({ force: true });
              if (!c.modal?.open && pageRef.current === 'Dashboard' && userRef.current) {
                triggerRender();
              }
            } else if (currentPage === 'ESP32 terminal') {
              const refreshedPage = currentPage;
              await refresh({ force: true });
              await c.workspaceUI.refresh();
              if (!c.modal?.open && pageRef.current === refreshedPage && userRef.current) {
                triggerRender();
              }
            } else if (currentPage === 'Inventory') {
              await c.inventoryController.refresh({ force: true });
              await refresh({ force: true });
            } else if (workspacePages.has(currentPage)) {
              const refreshedPage = currentPage;
              c.workspaceUI.invalidate();
              await c.workspaceUI.refresh();
              await refresh({ force: true });
              if (!c.modal?.open && pageRef.current === refreshedPage && userRef.current) {
                triggerRender();
              }
            }
          }
        });
        if (!synced) rentalEventSyncPendingRef.current = true;
      } catch (problem) {
        if (problem.status === 429 || !c.apiClient.canRefresh()) {
          rentalEventSyncPendingRef.current = true;
        }
        if (problem.status !== 401) toast(problem.message);
      } finally {
        rentalEventSyncingRef.current = false;
        if (
          rentalEventSyncPendingRef.current &&
          document.visibilityState === 'visible' &&
          !c.modal?.open &&
          c.apiClient.canRefresh()
        ) {
          scheduleRentalEventSync();
        }
      }
    }, 180);
  }, [refresh, toast, triggerRender]);

  const syncRentalEventStream = useCallback(
    accountId => {
      if (rentalEventAccountRef.current !== accountId) {
        rentalEventSourceRef.current?.close();
        rentalEventSourceRef.current = null;
        rentalEventAccountRef.current = accountId;
        rentalEventsDisabledRef.current = false;
        rentalEventSyncPendingRef.current = false;
        clearTimeout(rentalEventSyncTimerRef.current);
        rentalEventSyncTimerRef.current = null;
      }
      if (
        !accountId ||
        rentalEventsDisabledRef.current ||
        typeof EventSource === 'undefined' ||
        (rentalEventSourceRef.current &&
          rentalEventSourceRef.current.readyState !== EventSource.CLOSED)
      ) {
        return;
      }
      const source = new EventSource('/api/rental-events');
      let receivedReady = false;
      rentalEventSourceRef.current = source;
      source.addEventListener('ready', () => {
        if (receivedReady) scheduleRentalEventSync();
        receivedReady = true;
      });
      source.addEventListener('rental.changed', scheduleRentalEventSync);
      source.addEventListener('inventory.changed', scheduleRentalEventSync);
      source.addEventListener('maintenance.changed', scheduleRentalEventSync);
      source.addEventListener('customer.changed', scheduleRentalEventSync);
      source.addEventListener('finance.changed', scheduleRentalEventSync);
      source.addEventListener('data.changed', scheduleRentalEventSync);
      source.addEventListener('category.changed', scheduleRentalEventSync);
      source.addEventListener('settings.changed', scheduleRentalEventSync);
      source.onerror = () => {
        if (
          rentalEventSourceRef.current === source &&
          source.readyState === EventSource.CLOSED
        ) {
          rentalEventSourceRef.current = null;
          setTimeout(() => {
            if (userRef.current && !rentalEventsDisabledRef.current) {
              syncRentalEventStream(userRef.current.id);
            }
          }, 5000);
        }
      };
    },
    [scheduleRentalEventSync]
  );

  // Sync user account with notifications and SSE stream
  useEffect(() => {
    const c = controllersRef.current;
    if (!user || user.mustChangePassword) {
      stopRentalEventStream();
      c.rentalNotifications.setAccount(null);
      return;
    }
    syncRentalEventStream(user.id);
    c.rentalNotifications.setAccount(user.id);
  }, [user, stopRentalEventStream, syncRentalEventStream]);

  // Document title sync for workspace pages
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    const displayPage =
      page === 'Reports'
        ? {
            performance: 'Performance',
            forecast: 'Forecasting',
            recommendations: 'Recommendations'
          }[reportSection] || 'Performance'
        : pageLabels[page] || page;
    document.title = `${displayPage} · Rent & Play`;
  }, [user, page, reportSection]);

  // Modal close & backdrop click listeners, visibility, online, popstate, and intervals
  useEffect(() => {
    const c = controllersRef.current;
    const modal = c.modal;

    const handleModalClose = () => {
      setPasswordResetCountdown(null);
      if (rentalEventSyncPendingRef.current) scheduleRentalEventSync();
    };
    const handleModalClick = e => {
      if (e.target !== modal) return;
      const r = modal.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        modal.close();
      }
    };
    modal?.addEventListener('close', handleModalClose);
    modal?.addEventListener('click', handleModalClick);

    const handleVisibilityChange = () => {
      if (
        userRef.current &&
        !userRef.current.mustChangePassword &&
        document.visibilityState === 'visible'
      ) {
        rentalEventsDisabledRef.current = false;
        c.rentalNotifications.refresh();
        syncRentalEventStream(userRef.current.id);
        if (rentalEventSyncPendingRef.current) scheduleRentalEventSync();
      }
    };
    const handleOnline = () => {
      if (userRef.current && !userRef.current.mustChangePassword) {
        rentalEventsDisabledRef.current = false;
        syncRentalEventStream(userRef.current.id);
        scheduleRentalEventSync();
      }
    };
    const handlePopState = () => {
      const nextPage = pageForPath(location.pathname);
      const sameReport = pageRef.current === 'Reports' && nextPage === 'Reports';
      pageRef.current = nextPage;
      setPage(nextPage);
      if (nextPage === 'Reports') {
        const sec = reportSectionForPath(location.pathname);
        c.workspaceUI.setReportSection(sec);
        setReportSection(sec);
      }
      if (workspacePages.has(nextPage) && !sameReport) {
        c.workspaceUI.invalidate();
      }
      if (userRef.current) {
        triggerRender();
        requestAnimationFrame(() => {
          document.querySelector('#workspace-content')?.focus({ preventScroll: true });
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('popstate', handlePopState);

    const focusGuardSelector =
      '#rental-search:focus,#module-search:focus,.admin-form input:focus,.admin-form textarea:focus,.admin-form select:focus,#profile-form input:focus,.analytics-filters input:focus,.analytics-filters select:focus,#analytics-sort:focus,.sidebar.open,#profile-dropdown:not([hidden]),#notification-dropdown:not([hidden])';

    const liveRentalTimer = setInterval(() => {
      if (
        !userRef.current ||
        !liveRentalPages.has(pageRef.current) ||
        modal?.open ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      if (document.querySelector(focusGuardSelector)) return;
      const scrollTop = document.querySelector('.content')?.scrollTop || 0;
      triggerRender();
      requestAnimationFrame(() => {
        const content = document.querySelector('.content');
        if (content) content.scrollTop = scrollTop;
      });
    }, 60000);

    const terminalTimer = setInterval(async () => {
      if (c.confirmation.isOpen() || logoutPendingRef.current) return;
      if (
        !userRef.current ||
        userRef.current.mustChangePassword ||
        pageRef.current !== 'ESP32 terminal' ||
        modal?.open ||
        document.visibilityState !== 'visible' ||
        !c.apiClient.canRefresh()
      ) {
        return;
      }
      if (
        document.querySelector(
          '#module-search:focus,.admin-form input:focus,.admin-form textarea:focus,.admin-form select:focus,.sidebar.open,#profile-dropdown:not([hidden]),#notification-dropdown:not([hidden])'
        )
      ) {
        return;
      }
      try {
        await c.workspaceUI.refresh();
        if (userRef.current && pageRef.current === 'ESP32 terminal' && !modal?.open) {
          triggerRender();
        }
      } catch {}
    }, 8000);

    const autoRefreshTimer = setInterval(async () => {
      if (c.confirmation.isOpen() || logoutPendingRef.current) return;
      if (
        !userRef.current ||
        userRef.current.mustChangePassword ||
        !c.apiClient.canRefresh() ||
        !c.workspaceUI.autoRefreshEnabled() ||
        pageRef.current === 'Settings' ||
        liveRentalPages.has(pageRef.current) ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      if (pageRef.current !== 'Inventory' && modal?.open) {
        await c.workspaceUI.refreshPendingHandoff();
        return;
      }
      if (document.querySelector(focusGuardSelector)) return;
      try {
        await refresh();
        const refreshedPage = pageRef.current;
        if (
          userRef.current &&
          workspacePages.has(refreshedPage) &&
          refreshedPage !== 'Settings' &&
          (await c.workspaceUI.refresh()) &&
          pageRef.current === refreshedPage &&
          userRef.current &&
          !modal?.open
        ) {
          triggerRender();
        }
      } catch (problem) {
        if (userRef.current && workspacePages.has(pageRef.current) && !modal?.open) {
          triggerRender();
        }
        if (problem.status !== 401) toast(problem.message);
      }
    }, 120000);

    return () => {
      modal?.removeEventListener('close', handleModalClose);
      modal?.removeEventListener('click', handleModalClick);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('popstate', handlePopState);
      clearInterval(liveRentalTimer);
      clearInterval(terminalTimer);
      clearInterval(autoRefreshTimer);
    };
  }, [
    refresh,
    scheduleRentalEventSync,
    setPasswordResetCountdown,
    syncRentalEventStream,
    toast,
    triggerRender
  ]);

  // Initial boot check (/auth/me)
  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        localStorage.removeItem('rent-play-demo');
        sessionStorage.removeItem('rent-play-demo');
      } catch {}
      try {
        const result = await api('/auth/me');
        if (!active) return;
        userRef.current = result.user;
        setUser(result.user);
        setBooting(false);
        await refresh();
      } catch (error) {
        if (!active) return;
        if (error.status !== 401) {
          setLoginError(cleanErrorMessage(error.message));
          setBooting(false);
        } else {
          setLoginError('');
          setBooting(false);
          try {
            const health = await api('/health');
            if (health.database === false) {
              setLoginError(health.warning || 'The database is temporarily unavailable.');
            }
          } catch (healthError) {
            setLoginError(cleanErrorMessage(healthError.message));
          }
        }
      }
    }
    boot();
    return () => {
      active = false;
    };
  }, [api, refresh]);

  const handleLoginSuccess = async (loggedInUser, rememberChecked) => {
    const c = controllersRef.current;
    setRememberSession(rememberChecked);
    userRef.current = loggedInUser;
    setUser(loggedInUser);
    const targetPage = pageForPath(location.pathname);
    pageRef.current = targetPage;
    setPage(targetPage);
    if (targetPage === 'Reports') {
      const sec = reportSectionForPath(location.pathname);
      c.workspaceUI.setReportSection(sec);
      setReportSection(sec);
    }
    history.replaceState(
      { page: targetPage },
      '',
      targetPage === 'Reports'
        ? reportPathForSection(c.workspaceUI.reportSection())
        : pageRoutes[targetPage]
    );
    await refresh();
  };

  const handleManualRefresh = async () => {
    if (manualRefreshPending) return;
    setManualRefreshPending(true);
    const refreshedPage = pageRef.current;
    const c = controllersRef.current;
    try {
      await refresh({ force: true });
      if (userRef.current && workspacePages.has(refreshedPage)) {
        await c.workspaceUI.refresh();
      }
      if (userRef.current && pageRef.current === refreshedPage && !c.modal?.open) {
        triggerRender();
      }
    } catch (problem) {
      if (userRef.current && pageRef.current === refreshedPage && !c.modal?.open) {
        triggerRender();
      }
      toast(problem.message);
    } finally {
      setManualRefreshPending(false);
    }
  };

  const handleLogout = async () => {
    if (logoutPendingRef.current) return;
    logoutPendingRef.current = true;
    const c = controllersRef.current;
    try {
      const confirmed = await c.confirmation.confirmAction({
        title: 'Log out of Rent & Play?',
        description:
          'Your session will end. You will need to sign in again to access the workspace.',
        confirmLabel: 'Yes, log out',
        cancelLabel: 'No, stay signed in'
      });
      if (!confirmed) return;
      await api('/auth/logout', { method: 'POST' });
      userRef.current = null;
      dataRef.current = null;
      setUser(null);
      setData(null);
      setConnectionError('');
      stopRentalEventStream();
      c.rentalNotifications.setAccount(null);
      c.inventoryController.reset();
      c.workspaceUI.reset();
      history.replaceState({}, '', pageRoutes.Dashboard);
      c.modal?.close();
      setLoginError('');
    } catch (error) {
      toast(error.message);
    } finally {
      logoutPendingRef.current = false;
    }
  };

  const handleToggleNavGroup = groupId => {
    if (sidebarCollapsed && !window.matchMedia('(max-width:720px)').matches) {
      setSidebarCollapsed(false);
      setNavGroupExpanded(prev => {
        const next = { ...prev, [groupId]: true };
        try {
          localStorage.setItem('rent-play-nav-groups', JSON.stringify(next));
        } catch {}
        return next;
      });
    } else {
      setNavGroupExpanded(prev => {
        const next = { ...prev, [groupId]: !prev[groupId] };
        try {
          localStorage.setItem('rent-play-nav-groups', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
    requestAnimationFrame(() => {
      document.getElementById(`nav-group-toggle-${groupId}`)?.focus();
    });
  };

  if (booting) {
    return <SessionLoadingView />;
  }

  if (!user) {
    return (
      <LoginView
        initialError={loginError}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        api={api}
        modal={controllersRef.current.modal}
        showModal={controllersRef.current.showModal}
        onLoginSuccess={handleLoginSuccess}
        setPasswordResetCountdown={setPasswordResetCountdown}
      />
    );
  }

  if (user.mustChangePassword) {
    return (
      <PasswordChangeView
        user={user}
        rememberSession={rememberSession}
        api={api}
        onPasswordUpdated={async updatedUser => {
          userRef.current = updatedUser;
          setUser(updatedUser);
          await refresh();
          toast('Your password has been updated.');
        }}
        onSignOutAgain={msg => endSession(msg)}
        onSignOut={() => endSession('Your session ended. Please sign in again.')}
      />
    );
  }

  const notificationFingerprint = data
    ? [
        ...data.rentals.filter(r => r.displayStatus === 'Overdue').map(r => `r:${r.id}:${r.due_at}`),
        ...data.pending.map(r => `v:${r.id}:${r.requested_at}`)
      ]
        .sort()
        .join('|')
    : '';

  return (
    <WorkspaceShell
      user={user}
      data={data}
      page={page}
      reportSection={reportSection}
      connectionError={connectionError}
      theme={theme}
      onSetTheme={setTheme}
      filter={filter}
      onFilterChange={setFilter}
      query={query}
      onQueryChange={setQuery}
      rentalPage={rentalPage}
      onRentalPageChange={setRentalPage}
      period={period}
      onPeriodChange={setPeriod}
      profileEditing={profileEditing}
      onSetProfileEditing={setProfileEditing}
      manualRefreshPending={manualRefreshPending}
      onManualRefresh={handleManualRefresh}
      onNavigate={goTo}
      onLogout={handleLogout}
      onUserUpdated={updatedUser => {
        userRef.current = updatedUser;
        setUser(updatedUser);
      }}
      navGroupExpanded={navGroupExpanded}
      onToggleNavGroup={handleToggleNavGroup}
      sidebarCollapsed={sidebarCollapsed}
      onSetSidebarCollapsed={setSidebarCollapsed}
      rentalNotifications={controllersRef.current.rentalNotifications}
      notificationVersion={notificationVersion}
      notificationFingerprint={notificationFingerprint}
      workspaceUI={controllersRef.current.workspaceUI}
      inventoryController={controllersRef.current.inventoryController}
      showModal={controllersRef.current.showModal}
      confirmSubmit={controllersRef.current.confirmation.confirmSubmit}
      api={api}
      toast={toast}
      renderTick={renderTick}
      onTriggerRender={triggerRender}
    />
  );
}
