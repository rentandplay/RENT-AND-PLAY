import test from 'node:test';
import assert from 'node:assert/strict';
import { createRentalNotifications, renderRentalNotifications } from '../src/notifications.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
const event = (id, extra = {}) => ({ id, title: 'Booking approved', message: 'Pickup is ready.', type: 'BOOKING_APPROVED', rental_id: 'r1', rental_code: 'R-001', created_at: '2026-10-07T02:00:00Z', is_read: false, ...extra });

test('initial unread history shows a badge silently and a new request alerts only once', async () => {
  let incoming = [event('one')]; const alerts = [];
  const controller = createRentalNotifications({ api: async () => ({ notifications: incoming }), onAlert: row => alerts.push(row.id) });
  controller.setAccount('admin'); await flush();
  assert.equal(controller.state().unreadCount, 1); assert.deepEqual(alerts, []);
  incoming = [event('two'), event('one')];
  await controller.refresh(); await controller.refresh();
  assert.deepEqual(alerts, ['two']); assert.equal(controller.state().unreadCount, 2);
});
test('late fetches cannot restore notifications from a previous signed-in account', async () => {
  let release;
  const controller = createRentalNotifications({ api: () => new Promise(resolve => { release = resolve; }) });
  controller.setAccount('customer-one'); controller.setAccount(null);
  release({ notifications: [event('private')] }); await flush();
  assert.deepEqual(controller.state().notifications, []);
});
test('reading a notification persists to the API and a delayed fetch cannot restore an unread badge', async () => {
  let delay, phase = 0, posted;
  const controller = createRentalNotifications({ api: async (path, options) => {
    if (path === '/notifications/read') { posted = JSON.parse(options.body); return { ok: true }; }
    if (phase++) return new Promise(resolve => { delay = resolve; });
    return { notifications: [event('one')] };
  } });
  controller.setAccount('admin'); await flush();
  const pending = controller.refresh(); await controller.markRead(['one']);
  delay({ notifications: [event('one')] }); await pending;
  assert.deepEqual(posted, { ids: ['one'] }); assert.equal(controller.state().unreadCount, 0);
});
test('failed refresh preserves history and failed marking preserves unread status for a retry', async () => {
  let fail = false;
  const controller = createRentalNotifications({ api: async () => { if (fail) throw Error('Connection interrupted'); return { notifications: [event('one')] }; } });
  controller.setAccount('admin'); await flush(); fail = true;
  await controller.refresh(); assert.equal(controller.state().notifications.length, 1);
  assert.equal(controller.state().error, 'Connection interrupted');
  await assert.rejects(controller.markRead(['one'])); assert.equal(controller.state().unreadCount, 1);
});
test('notification text and booking targets are escaped before being displayed', () => {
  const html = renderRentalNotifications({ notifications: [event('one', { title: '<script>bad()</script>', message: '<img onerror=bad()>', rental_id: '\" onclick=bad()' })] },
    { escape: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'), formatDate: value => value });
  assert.doesNotMatch(html, /<script>|<img|data-notification-rental=""/); assert.match(html, /&lt;script&gt;/);
});
