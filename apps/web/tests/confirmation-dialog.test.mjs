import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfirmationDialog } from '../src/confirmation-dialog.js';

class Dialog extends EventTarget {
  constructor(document) {
    super(); this.ownerDocument = document; this.open = false; this.attributes = {}; this.nodes = new Map();
    this.classList = { toggle: () => {} };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  set innerHTML(value) { this.html = value; this.nodes.clear(); }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, { isConnected: true, focus: () => { this.ownerDocument.activeElement = this.nodes.get(selector); } });
    return this.nodes.get(selector);
  }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  getBoundingClientRect() { return { left: 100, right: 560, top: 100, bottom: 400 }; }
}
const options = { title: 'Save equipment changes?', description: 'Updated equipment details will be saved.', confirmLabel: 'Yes, save changes' };
function setup(t) {
  const document = {}, dialog = new Dialog(document), parentModal = new Dialog(document), notices = [];
  const controller = createConfirmationDialog({ dialog, parentModal, notify: message => notices.push(message) });
  const button = { disabled: false, isConnected: true, focus: () => { document.activeElement = button; } };
  document.activeElement = button;
  const form = { ownerDocument: document, fields: [['name', 'Basketball']], isConnected: true, valid: true,
    reportValidity() { return this.valid; }, closest: () => parentModal, querySelectorAll: () => [button] };
  t.mock.method(globalThis, 'FormData', function(value) { return value.fields[Symbol.iterator](); });
  parentModal.showModal();
  const submit = () => form.onsubmit(new Event('submit', { cancelable: true }));
  const yes = () => dialog.querySelector('[data-confirm-yes]').onclick();
  const no = () => dialog.querySelector('[data-confirm-no]').onclick();
  return { ...controller, dialog, parentModal, document, form, button, submit, yes, no, notices };
}

test('a form waits for an explicit Yes before saving and keeps its parent modal open', async t => {
  const s = setup(t); let writes = 0;
  s.confirmSubmit(s.form, options, async () => { writes++; });
  const waiting = s.submit();
  await Promise.resolve();
  assert.equal(writes, 0);
  assert.equal(s.dialog.open, true);
  assert.equal(s.parentModal.open, true);
  assert.equal(s.button.disabled, true);
  assert.equal(s.document.activeElement, s.dialog.querySelector('[data-confirm-no]'));
  assert.equal(s.dialog.attributes.role, 'alertdialog');
  s.yes(); await waiting;
  assert.equal(writes, 1);
  assert.equal(s.dialog.open, false);
  assert.equal(s.button.disabled, false);
  assert.equal(s.document.activeElement, s.button);
});

for (const cancellation of ['No', 'Escape', 'close button', 'backdrop', 'programmatic close', 'parent close', 'replacement']) {
  test(`${cancellation} cancels without executing the mutation`, async t => {
    const s = setup(t); let writes = 0;
    s.confirmSubmit(s.form, options, async () => { writes++; });
    const waiting = s.submit();
    if (cancellation === 'No') s.no();
    if (cancellation === 'Escape') { const event = new Event('cancel', { cancelable: true }); s.dialog.dispatchEvent(event); assert.equal(event.defaultPrevented, true); }
    if (cancellation === 'close button') s.dialog.querySelector('.confirmation-close').onclick();
    if (cancellation === 'backdrop') for (const type of ['pointerdown', 'click']) { const event = new Event(type); Object.assign(event, { clientX: 5, clientY: 5 }); s.dialog.dispatchEvent(event); }
    if (cancellation === 'programmatic close') s.dialog.close();
    if (cancellation === 'parent close') s.parentModal.close();
    if (cancellation === 'replacement') s.cancel();
    await waiting;
    assert.equal(writes, 0);
    assert.equal(s.dialog.open, false);
    assert.equal(s.button.disabled, false);
    assert.equal(s.isOpen(), false);
  });
}

test('repeated submits and repeated Yes clicks cause only one write while it is pending', async t => {
  const s = setup(t); let writes = 0, finish;
  s.confirmSubmit(s.form, options, async () => { writes++; await new Promise(resolve => { finish = resolve; }); });
  const waiting = s.submit();
  await s.submit();
  s.yes(); s.yes();
  await Promise.resolve();
  await s.submit();
  assert.equal(writes, 1);
  assert.equal(s.button.disabled, true);
  finish(); await waiting;
  assert.equal(s.button.disabled, false);
});

test('a second action cannot inherit approval from an existing confirmation', async t => {
  const s = setup(t), first = s.confirmAction(options);
  assert.equal(await s.confirmAction({ ...options, title: 'Log out?' }), false);
  assert.equal(s.dialog.querySelector('#confirmation-title').textContent, options.title);
  s.no(); assert.equal(await first, false);
});

test('invalid forms do not show confirmation or save, and edits require a fresh confirmation', async t => {
  const s = setup(t); let writes = 0;
  s.confirmSubmit(s.form, options, async () => { writes++; });
  s.form.valid = false; await s.submit();
  assert.equal(s.dialog.open, false);
  s.form.valid = true;
  const waiting = s.submit();
  s.form.fields = [['name', 'Bike']];
  s.yes(); await waiting;
  assert.equal(writes, 0);
  assert.equal(s.notices.length, 1);
  const retry = s.submit(); s.yes(); await retry;
  assert.equal(writes, 1);
});

test('detached forms and closed parent dialogs cannot save after confirmation', async t => {
  const s = setup(t); let writes = 0;
  s.confirmSubmit(s.form, options, async () => { writes++; });
  const waiting = s.submit(); s.form.isConnected = false; s.yes(); await waiting;
  assert.equal(writes, 0);
  s.form.isConnected = true;
  const again = s.submit(); s.yes(); s.parentModal.close(); await again;
  assert.equal(writes, 0);
});

test('failed operations release the submit lock and require confirmation on retry', async t => {
  const s = setup(t); let attempts = 0;
  s.confirmSubmit(s.form, options, async () => { attempts++; if (attempts === 1) throw new Error('Write failed'); });
  const first = s.submit(); s.yes(); await assert.rejects(first, /Write failed/);
  assert.equal(s.button.disabled, false);
  const retry = s.submit(); assert.equal(attempts, 1); s.yes(); await retry;
  assert.equal(attempts, 2);
});

test('confirmation details are rendered as text and a drag from inside is not a backdrop dismissal', async t => {
  const s = setup(t), waiting = s.confirmAction({ ...options, title: '<img src=x onerror=alert(1)>', description: '<script>bad</script>' });
  assert.ok(!s.dialog.html.includes('<img'));
  assert.equal(s.dialog.querySelector('#confirmation-title').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(s.dialog.querySelector('#confirmation-description').textContent, '<script>bad</script>');
  const down = new Event('pointerdown'), click = new Event('click');
  Object.assign(down, { clientX: 200, clientY: 200 }); Object.assign(click, { clientX: 5, clientY: 5 });
  s.dialog.dispatchEvent(down); s.dialog.dispatchEvent(click);
  assert.equal(s.isOpen(), true);
  s.no(); await waiting;
});
