import test from 'node:test';
import assert from 'node:assert/strict';
import React, { renderToStaticMarkup } from '../src/react-vendor.js';
import { WorkspaceStatus, WorkspaceShell, LoginView } from '../src/react-ui.js';
import { renderSettings } from '../src/settings-ui.js';

const render = props => renderToStaticMarkup(React.createElement(WorkspaceStatus, { onRetry() {}, ...props }));
test('initial loading, failed reads, offline, and stale records have different accessible recovery states', () => {
  const initial = render({ loading: true });
  assert.match(initial, /Opening your workspace/); assert.match(initial, /aria-busy="true"/);
  assert.doesNotMatch(initial, /role="alert"|Try again|database|backend/i);
  const failed = render({ error: 'Please try again shortly.' });
  assert.match(failed, /role="alert"/); assert.match(failed, /Try again/); assert.doesNotMatch(failed, /skeleton/);
  const offline = render({ offline: true }); assert.match(offline, /Reconnect/); assert.match(offline, /disabled/);
  const stale = render({ hasData: true, error: 'Updates unavailable.' });
  assert.match(stale, /last loaded records/); assert.match(stale, /may have changed/);
  assert.equal(render({ hasData: true }), '');
});

test('a dashboard outage does not block the profile or equipment page', () => {
  const props = { user: { id: 'owner', name: 'Owner', role: 'OWNER' }, data: null, theme: 'light', connectionError: 'Try again shortly.', navGroupExpanded: {}, rentalNotifications: { state: () => ({ notifications: [], unreadCount: 0 }) }, workspaceUI: {}, onNavigate() {} };
  for (const page of ['Inventory', 'Profile']) {
    const html = renderToStaticMarkup(React.createElement(WorkspaceShell, { ...props, page }));
    assert.doesNotMatch(html, /We couldn’t load your workspace|Waiting for your database/);
    assert.match(html, page === 'Inventory' ? /inventory-root/ : /profile-edit/);
  }
});

test('a normal sign-in screen has no fabricated connection error', () => {
  const html = renderToStaticMarkup(React.createElement(LoginView, { initialError: '', theme: 'light' }));
  assert.doesNotMatch(html, /temporarily unavailable|couldn’t complete this request/);
});

test('failed security reads never claim there are no sessions or security alerts', () => {
  const escape = value => String(value ?? '').replaceAll('<', '&lt;');
  const html = renderSettings({ model: { settings: {} }, user: { role: 'OWNER', name: 'Owner' }, tab: 'account', users: () => '', securityErrors: { sessions: 'Devices could not be loaded.', alerts: 'Alerts could not be loaded.' } }, { escape, icon: () => '', formatDate: value => value });
  assert.match(html, /Devices could not be loaded/); assert.match(html, /Alerts could not be loaded/);
  assert.match(html, /settings-refresh-alerts/); assert.match(html, /settings-refresh-sessions/);
  assert.doesNotMatch(html, /No active sessions|No security alerts|Loading active sessions/);
});
