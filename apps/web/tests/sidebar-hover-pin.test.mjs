import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

test('nav groups are closed by default, open on hover, close on hover off, stay open on click, close other navbars when opening another one, and settings/logout stay in sidebar-bottom with profile', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const previous = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.window = window; globalThis.document = window.document;
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  window.matchMedia = () => ({ matches: false }); window.innerHeight = 800;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ right: 234, top: 200, height: 220 });
  const { default: React, createRoot } = await import('../src/react-vendor.js');
  const { WorkspaceShell } = await import('../src/react-ui.js');
  const root = createRoot(document.getElementById('root'));

  let navGroupExpanded = { management: false, transactions: false, operations: false, analytics: false };
  const toggleCalls = [];
  const props = {
    user: { id: 'owner', name: 'Owner', role: 'OWNER' }, page: 'Dashboard', theme: 'light', sidebarCollapsed: false,
    navGroupExpanded,
    rentalNotifications: { state: () => ({ notifications: [], unreadCount: 0 }) }, workspaceUI: {},
    onSetSidebarCollapsed: () => {},
    onToggleNavGroup: id => {
      toggleCalls.push(id);
      const willOpen = !navGroupExpanded[id];
      navGroupExpanded = Object.fromEntries(
        Object.keys(navGroupExpanded).map(key => [key, key === id ? willOpen : false])
      );
    },
    onNavigate: () => {},
    onLogout: () => {}
  };
  const flush = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
  const pointer = (node, type) => {
    const event = new window.Event(type, { bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    Object.defineProperty(event, 'relatedTarget', { value: document.body });
    node.dispatchEvent(event);
  };

  try {
    root.render(React.createElement(WorkspaceShell, props));
    const mountDeadline = Date.now() + 1500;
    while (!document.querySelector('.sidebar-bottom') && Date.now() < mountDeadline) await flush(20);

    // 1. Settings, Logout and profile avatar/name are in .sidebar-bottom
    const sidebarBottom = document.querySelector('.sidebar-bottom');
    assert.ok(sidebarBottom, '.sidebar-bottom should exist');
    const settingsBtn = sidebarBottom.querySelector('[data-page="Settings"]');
    const logoutBtn = sidebarBottom.querySelector('#logout');
    const operator = sidebarBottom.querySelector('.operator');
    assert.ok(settingsBtn, 'Settings button must be inside .sidebar-bottom');
    assert.ok(logoutBtn, 'Logout button must be inside .sidebar-bottom');
    assert.ok(operator, 'Operator profile must be inside .sidebar-bottom');
    assert.equal(document.querySelectorAll('nav [data-page="Settings"]').length, 0, 'Settings must not be inside nav');
    assert.equal(document.querySelectorAll('nav #logout').length, 0, 'Logout must not be inside nav');

    // 2. Default state: all nav groups closed
    const groups = ['management', 'transactions', 'operations', 'analytics'];
    for (const id of groups) {
      const toggle = document.getElementById(`nav-group-toggle-${id}`);
      assert.equal(toggle.getAttribute('aria-expanded'), 'false', `${id} must be closed by default`);
      const items = document.getElementById(`nav-group-${id}`);
      assert.equal(items.hasAttribute('hidden'), true, `${id} items must be hidden by default`);
    }

    // 3. Hover opens group
    const mgmtToggle = document.getElementById('nav-group-toggle-management');
    const mgmtSection = mgmtToggle.closest('section');
    pointer(mgmtSection, 'pointerover'); await flush();
    assert.equal(mgmtToggle.getAttribute('aria-expanded'), 'true', 'Management must open on hover');
    const mgmtItems = document.getElementById('nav-group-management');
    assert.equal(mgmtItems.hasAttribute('hidden'), false, 'Management items must be visible on hover');

    // 4. Hover off closes group
    pointer(mgmtSection, 'pointerout');
    // React can commit after the hover timer when the test runner is busy.
    const closeDeadline = Date.now() + 1500;
    while (mgmtToggle.getAttribute('aria-expanded') !== 'false' && Date.now() < closeDeadline) await flush(20);
    assert.equal(mgmtToggle.getAttribute('aria-expanded'), 'false', 'Management must close when hover leaves');
    assert.equal(mgmtItems.hasAttribute('hidden'), true, 'Management items must be hidden when hover leaves');

    // 5. Click pins open ("stay open")
    mgmtToggle.click(); await flush();
    assert.equal(toggleCalls.at(-1), 'management');
    root.render(React.createElement(WorkspaceShell, { ...props, navGroupExpanded })); await flush();
    assert.equal(mgmtToggle.getAttribute('aria-expanded'), 'true', 'Management must be open after click');
    assert.equal(mgmtItems.hasAttribute('hidden'), false);

    // Hover off does not close when pinned
    pointer(mgmtSection, 'pointerout'); await flush(150);
    assert.equal(mgmtToggle.getAttribute('aria-expanded'), 'true', 'Management must stay open after click even on hover off');
    assert.equal(mgmtItems.hasAttribute('hidden'), false);

    // 6. Opening another navbar automatically closes the previous one
    const analyticsToggle = document.getElementById('nav-group-toggle-analytics');
    const analyticsItems = document.getElementById('nav-group-analytics');
    analyticsToggle.click(); await flush();
    assert.equal(toggleCalls.at(-1), 'analytics');
    root.render(React.createElement(WorkspaceShell, { ...props, navGroupExpanded })); await flush();
    assert.equal(analyticsToggle.getAttribute('aria-expanded'), 'true', 'Analytics must open on click');
    assert.equal(analyticsItems.hasAttribute('hidden'), false);
    assert.equal(mgmtToggle.getAttribute('aria-expanded'), 'false', 'Management must automatically close when Analytics opens');
    assert.equal(mgmtItems.hasAttribute('hidden'), true);

    // 7. Click again closes / unpins
    analyticsToggle.click(); await flush();
    assert.equal(toggleCalls.at(-1), 'analytics');
    root.render(React.createElement(WorkspaceShell, { ...props, navGroupExpanded })); await flush(150);
    assert.equal(analyticsToggle.getAttribute('aria-expanded'), 'false', 'Analytics must close after clicking again');
    assert.equal(analyticsItems.hasAttribute('hidden'), true);
  } finally {
    root.unmount(); await flush(); Object.assign(globalThis, previous);
  }
});
