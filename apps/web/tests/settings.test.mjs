import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSettings, settingsTabs } from '../src/settings-ui.js';
import { readPreferences, writePreferences, normalizePreferences, preferenceDefaults } from '../src/preferences.js';
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const render = (overrides = {}) => renderSettings({ model: { settings: { business_name: 'Rent & Play' } }, user: { name: 'Test Owner', email: 'owner@example.invalid', role: 'OWNER' }, appearance: '<div>Theme controls</div>', tab: 'business', draft: null, dirty: false, saving: false, preferences: { ...preferenceDefaults }, users: () => '<div>Team management</div>', ...overrides }, { escape, icon: () => '<svg></svg>' });

test('settings has horizontal accessible tabs and displays one section at a time', () => {
  const html = render();
  assert.equal(settingsTabs(true).length, 5);
  assert.ok(html.includes('role="tablist"'));
  assert.ok(html.includes('aria-orientation="horizontal"'));
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 1);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.ok(html.includes('id="business-form"'));
  assert.ok(!html.includes('Theme controls'));
  assert.ok(!html.includes('Team management'));
});
test('operators and customers cannot see user management or edit business settings', () => {
  const html = render({ user: { role: 'ADMIN' }, tab: 'users' });
  assert.equal(settingsTabs(false).length, 4);
  assert.ok(!html.includes('data-settings-tab="users"'));
  assert.ok(!html.includes('Team management'));
  assert.ok(!html.includes('id="business-form"'));
  assert.ok(html.includes('Only owners can edit business settings'));
});
test('business drafts are escaped and save progress disables editing', () => {
  const html = render({ draft: { businessName: '<script>bad</script>', location: 'Test', currency: 'PHP', timezone: 'Asia/Manila', defaultLateGraceHours: 0 }, dirty: true, saving: true });
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!html.includes('<script>bad</script>'));
  assert.ok(html.includes('<fieldset disabled>'));
  assert.ok(html.includes('Saving…'));
});
test('personal tabs provide working control hooks without exposing passwords', () => {
  assert.ok(render({ tab: 'appearance' }).includes('Theme controls'));
  const preferences = render({ tab: 'preferences' });
  for (const hook of ['preferences-form', 'preferences-reset', 'autoRefresh', 'reportPeriod', 'reportGrouping']) assert.ok(preferences.includes(hook));
  const account = render({ tab: 'account' });
  assert.ok(account.includes('settings-password-reset'));
  assert.ok(account.includes('data-page="Profile"'));
  assert.ok(!account.includes('type="password"'));
});
test('preferences validate saved data and survive a storage roundtrip', () => {
  assert.deepEqual(normalizePreferences({ autoRefresh: 'false', reportPeriod: 'custom', reportGrouping: 'invalid' }), preferenceDefaults);
  assert.deepEqual(normalizePreferences(null), preferenceDefaults);
  let saved;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  const value = { autoRefresh: false, reportPeriod: '90d', reportGrouping: 'monthly' };
  assert.deepEqual(writePreferences(storage, value), value);
  assert.deepEqual(readPreferences(storage), value);
  saved = '{invalid'; assert.deepEqual(readPreferences(storage), preferenceDefaults);
  assert.deepEqual(readPreferences(), preferenceDefaults);
  assert.throws(() => writePreferences({ setItem: () => { throw Error('Storage blocked'); } }, value), /Storage blocked/);
});
