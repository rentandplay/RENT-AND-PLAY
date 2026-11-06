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

test('owner can view and edit Terms & Conditions and InstaPay / GCash QR settings', () => {
  const html = render({
    model: {
      settings: {
        business_name: 'Rent & Play',
        instapay_qr_data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        instapay_account_name: 'Rent and Play Shop',
        instapay_account_number: '09171234567',
        terms_and_conditions: 'Custom Rental Agreement 2026',
        rental_terms: 'Custom Checkout Policy 2026',
        privacy_policy: 'Custom Privacy 2026',
        refund_policy: 'Custom Refund 2026',
        accepted_id_types: 'Custom IDs 2026',
        receipt_header_title: 'CUSTOM HUB',
        receipt_footer_note: 'Custom Footer Note 2026'
      }
    },
    user: { role: 'OWNER' },
    tab: 'business'
  });
  assert.ok(html.includes('id="payment-settings-form"'));
  assert.ok(html.includes('InstaPay / GCash QR'));
  assert.ok(html.includes('Rent and Play Shop'));
  assert.ok(html.includes('09171234567'));
  assert.ok(html.includes('id="terms-settings-form"'));
  assert.ok(html.includes('Custom Rental Agreement 2026'));
  assert.ok(html.includes('Custom Checkout Policy 2026'));
  assert.ok(html.includes('Custom Privacy 2026'));
  assert.ok(html.includes('Custom Refund 2026'));
  assert.ok(html.includes('Custom IDs 2026'));
  assert.ok(html.includes('terms-restore-default'));
  assert.ok(html.includes('id="rules-settings-form"'));
  assert.ok(html.includes('id="receipt-settings-form"'));
  assert.ok(html.includes('CUSTOM HUB'));
  assert.ok(html.includes('Custom Footer Note 2026'));
});

test('non-owners see read-only Terms & Conditions and cannot edit them', () => {
  const html = render({
    model: {
      settings: {
        business_name: 'Rent & Play',
        terms_and_conditions: 'ReadOnly Terms',
        rental_terms: 'ReadOnly Rental Policy'
      }
    },
    user: { role: 'OPERATOR' },
    tab: 'business'
  });
  assert.ok(!html.includes('id="terms-settings-form"'));
  assert.ok(!html.includes('id="payment-settings-form"'));
  assert.ok(html.includes('Only owners can edit Terms & Conditions'));
  assert.ok(html.includes('ReadOnly Terms'));
  assert.ok(html.includes('ReadOnly Rental Policy'));
});


test('account & security tab renders active sessions management and real-time security alerts feed', () => {
  const html = render({
    tab: 'account',
    activeSessions: [
      { id: 'sess-1', device_label: 'Chrome on Windows', ip: '203.0.113.10', last_active_at: '2026-10-07T02:00:00Z', is_current: true },
      { id: 'sess-2', device_label: 'Safari on iOS', ip: '203.0.113.25', last_active_at: '2026-10-07T01:40:00Z', is_current: false }
    ],
    securityAlerts: [
      { id: 'alert-1', title: 'Flagged payment proof', message: 'Duplicate reference detected on R-009.', severity: 'HIGH', rental_id: 'r-9', rental_code: 'R-009', created_at: '2026-10-07T02:05:00Z' }
    ]
  });
  assert.ok(html.includes('id="settings-active-sessions-card"'));
  assert.ok(html.includes('Chrome on Windows'));
  assert.ok(html.includes('Current session'));
  assert.ok(html.includes('data-revoke-session="sess-2"'));
  assert.ok(html.includes('id="settings-revoke-other-sessions"'));
  assert.ok(html.includes('id="settings-security-alerts-card"'));
  assert.ok(html.includes('Flagged payment proof'));
  assert.ok(html.includes('data-security-open-rental="r-9"'));
});
