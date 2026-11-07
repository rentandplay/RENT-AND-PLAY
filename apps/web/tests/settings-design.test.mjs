import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderSettings, bindBusinessSettingsNavigation, bindReceiptSettingsPreview } from '../src/settings-ui.js';
import { preferenceDefaults } from '../src/preferences.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function fixture(overrides = {}) {
  const html = renderSettings({ model: { settings: { business_name: 'Rent & Play' } }, user: { role: 'OWNER', name: 'Preview owner', email: 'owner@example.invalid' }, tab: 'business', preferences: preferenceDefaults, users: () => '', appearance: '', ...overrides }, { escape, icon: () => '' });
  return parseHTML(`<html><body>${html}</body></html>`);
}

test('main Settings tabs and Business navigation have different, correctly labeled roles', () => {
  const { document: doc } = fixture();
  assert.equal(doc.querySelectorAll('[role="tablist"]').length, 1);
  assert.equal(doc.querySelector('[role="tablist"]').getAttribute('aria-orientation'), 'horizontal');
  assert.equal(doc.querySelector('nav[aria-label="Business settings sections"] [role="tab"]'), null);
  const visible = [...doc.querySelectorAll('[data-subtab]')].filter(section => !section.hidden);
  assert.equal(visible.length, 1); assert.equal(visible[0].dataset.subtab, 'profile');
  for (const button of doc.querySelectorAll('[data-business-subtab]')) assert.ok(doc.getElementById(button.getAttribute('aria-controls')));
  assert.equal(doc.querySelectorAll('.settings-cards-stack form').length, 5, 'inactive editors stay mounted for drafts');
});

test('Business section switches synchronize mobile selection and preserve in-progress input', () => {
  const { document: doc, window } = fixture(); const changes = [];
  bindBusinessSettingsNavigation(doc, value => changes.push(value));
  const field = doc.querySelector('#payment-settings-form [name="accountName"]');
  field.value = 'Unsaved account draft';
  doc.querySelector('[data-business-subtab="payment"]').click();
  assert.equal(doc.querySelector('[data-subtab="payment"]').hidden, false);
  assert.equal(doc.querySelector('#settings-business-section').value, 'payment');
  doc.querySelector('[data-business-subtab="terms"]').click();
  doc.querySelector('[data-business-subtab="payment"]').click();
  assert.equal(doc.querySelector('#payment-settings-form [name="accountName"]'), field);
  assert.equal(field.value, 'Unsaved account draft');
  const picker = doc.querySelector('#settings-business-section');
  [...picker.options].find(option => option.value === 'receipt').selected = true;
  picker.dispatchEvent(new window.Event('change'));
  assert.equal(doc.querySelector('[aria-current="true"]').dataset.businessSubtab, 'receipt');
  assert.equal([...doc.querySelectorAll('[data-subtab]')].filter(section => !section.hidden).length, 1);
  assert.deepEqual(changes, ['payment', 'terms', 'payment', 'receipt']);
});

test('Business navigation supports arrow, Home and End keys', () => {
  const { document: doc, window } = fixture();
  bindBusinessSettingsNavigation(doc);
  const press = (button, key) => { const event = new window.Event('keydown', { cancelable: true }); event.key = key; button.dispatchEvent(event); };
  const first = doc.querySelector('[data-business-subtab="profile"]');
  press(first, 'ArrowUp'); assert.equal(doc.querySelector('[aria-current="true"]').dataset.businessSubtab, 'receipt');
  const last = doc.querySelector('[data-business-subtab="receipt"]');
  press(last, 'Home'); assert.equal(doc.querySelector('[aria-current="true"]').dataset.businessSubtab, 'profile');
  press(first, 'End'); assert.equal(doc.querySelector('[aria-current="true"]').dataset.businessSubtab, 'receipt');
});

test('full policies are expandable and receipt input updates only the unsaved preview safely', () => {
  const longPolicy = 'Account policy\n\n' + 'Read the complete policy. '.repeat(50) + '<script>unsafe</script>';
  const { document: doc, window } = fixture({ businessSubTab: 'receipt', model: { settings: { terms_and_conditions: longPolicy, receipt_header_title: 'Saved title' } } });
  assert.equal(doc.querySelectorAll('.settings-policy-item').length, 5);
  assert.equal(doc.querySelector('.settings-policy-text').textContent, longPolicy);
  assert.equal(doc.querySelector('script'), null);
  const form = doc.querySelector('#receipt-settings-form'); bindReceiptSettingsPreview(form);
  form.querySelector('[name="receiptHeaderTitle"]').value = '<img src=x onerror=alert(1)>';
  form.dispatchEvent(new window.Event('input', { bubbles: true }));
  const preview = form.closest('.settings-edit-view');
  assert.equal(preview.querySelector('[data-receipt-value="receiptHeaderTitle"]').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(preview.querySelector('img'), null);
  assert.equal(doc.querySelector('.settings-summary-view [data-receipt-value="receiptHeaderTitle"]').textContent, 'Saved title');
});
