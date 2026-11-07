import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { bindAnnouncementSettingsPreview } from '../src/settings-ui.js';

test('owner announcement draft previews immediately and displays markup as plain text', () => {
  const { document, window } = parseHTML('<form><input name="announcementEnabled" type="checkbox"><textarea name="announcementText"></textarea><aside data-announcement-preview><p data-announcement-message></p></aside></form>');
  const form = document.querySelector('form'), toggle = form.querySelector('input'), text = form.querySelector('textarea'), preview = form.querySelector('aside');
  bindAnnouncementSettingsPreview(form);
  assert.equal(preview.hidden, true);
  toggle.checked = true;
  text.value = '<img src=x onerror=alert(1)> Advisory';
  form.dispatchEvent(new window.Event('input'));
  assert.equal(preview.hidden, false);
  assert.equal(preview.querySelector('p').textContent, text.value);
  assert.equal(preview.querySelector('img'), null);
  text.value = '  ';
  form.dispatchEvent(new window.Event('input'));
  assert.equal(preview.hidden, true);
});
