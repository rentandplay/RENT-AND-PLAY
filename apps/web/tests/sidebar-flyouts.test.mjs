import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

test('each collapsed navigation icon opens only its own pages, outside the scroll container', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const previous = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.window = window; globalThis.document = window.document;
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  window.matchMedia = () => ({ matches: false }); window.innerHeight = 800;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ right: 80, top: 200, height: 220 });
  const { default: React, createRoot } = await import('../src/react-vendor.js');
  const { WorkspaceShell } = await import('../src/react-ui.js');
  const root = createRoot(document.getElementById('root'));
  const navigation = []; let pinChanges = 0;
  const props = {
    user: { id: 'owner', name: 'Owner', role: 'OWNER' }, page: 'Profile', theme: 'light', sidebarCollapsed: true,
    navGroupExpanded: { management: true, transactions: true, operations: true, analytics: true },
    rentalNotifications: { state: () => ({ notifications: [], unreadCount: 0 }) }, workspaceUI: {},
    onSetSidebarCollapsed: () => pinChanges++, onToggleNavGroup: () => { throw new Error('A flyout must not expand the whole sidebar'); },
    onNavigate: (...args) => navigation.push(args)
  };
  const flush = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
  const pointer = (node, type) => {
    const event = new window.Event(type, { bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    Object.defineProperty(event, 'relatedTarget', { value: document.body });
    node.dispatchEvent(event);
  };
  const expected = {
    management: ['Equipment', 'Customers', 'Messages', 'Rates & Fees'],
    transactions: ['Rentals', 'Returns', 'Rental History', 'Payments & expenses'],
    operations: ['Maintenance', 'ESP32 / Verification'],
    analytics: ['Performance', 'Forecasting', 'Recommendations']
  };
  try {
    root.render(React.createElement(WorkspaceShell, props)); await flush();
    assert.equal(document.querySelectorAll('aside .nav-child').length, 0, 'collapsed groups must not leave hidden page lists for legacy CSS to reveal');
    for (const [id, labels] of Object.entries(expected)) {
      const button = document.getElementById(`nav-group-toggle-${id}`);
      pointer(button, 'pointerover'); await flush();
      assert.ok(document.querySelector('.workspace.sidebar-collapsed'));
      assert.equal(document.querySelectorAll('.sidebar-flyout').length, 1);
      const flyout = document.querySelector('.sidebar-flyout');
      assert.equal(flyout.parentElement, document.querySelector('.workspace'), 'the flyout must escape the sidebar scroll clipping');
      assert.deepEqual([...flyout.querySelectorAll('.sidebar-label')].map(node => node.textContent), labels);
      assert.equal(document.querySelectorAll('.nav-child').length, labels.length, 'other groups must have no page buttons in the DOM');
      assert.equal(flyout.style.left, '88px');
      assert.equal(button.getAttribute('aria-expanded'), 'true');
      assert.equal(document.querySelectorAll('.nav-section-title[aria-expanded=true]').length, 1);
      button.click(); await flush(); assert.equal(pinChanges, 0);
    }
    const trigger = document.getElementById('nav-group-toggle-transactions');
    trigger.dispatchEvent(new window.Event('focusin', { bubbles: true })); await flush();
    assert.equal(document.querySelector('.sidebar-flyout').getAttribute('aria-label'), 'Transactions pages');
    pointer(trigger.closest('section'), 'pointerout'); await flush(60);
    pointer(document.querySelector('.sidebar-flyout'), 'pointerover'); await flush(200);
    assert.ok(document.querySelector('.sidebar-flyout'), 'crossing the gap must keep the submenu open');
    document.querySelector('.sidebar-flyout [data-page=Payments]').click(); await flush();
    assert.equal(navigation.at(-1)[0], 'Payments'); assert.equal(document.querySelector('.sidebar-flyout'), null);
    assert.ok(document.querySelector('.workspace.sidebar-collapsed')); assert.equal(pinChanges, 0);
    pointer(trigger, 'pointerover'); await flush();
    pointer(document.querySelector('.sidebar-flyout'), 'pointerout'); await flush(220);
    assert.equal(document.querySelector('.sidebar-flyout'), null);
    root.render(React.createElement(WorkspaceShell, { ...props, sidebarCollapsed: false })); await flush();
    assert.equal(document.querySelector('.sidebar-flyout'), null);
    assert.equal(document.querySelectorAll('aside .nav-child').length, 13, 'manually expanding restores the normal grouped navigation');
  } finally { root.unmount(); await flush(); Object.assign(globalThis, previous); }
});
