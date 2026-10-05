import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRecordLinks, recordAttrs } from '../src/record-links.js';
import { createRecordDetails } from '../src/record-details.js';
import { createTransactionWorkflow } from '../src/transaction-workflow.js';

class Element {
  constructor(tagName, parentElement = null, attributes = {}) {
    this.tagName = tagName; this.parentElement = parentElement; this.attributes = attributes;
    this.dataset = {};
    this.ownerDocument = parentElement?.ownerDocument || { defaultView: { getSelection: () => null } };
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector === '[data-record-type]') {
        if (node.dataset.recordType) return node;
      } else if (['a', 'button', 'input', 'select', 'textarea', 'label', 'summary'].includes(node.tagName)
        || ['button', 'link', 'checkbox', 'switch'].includes(node.attributes.role)
        || (node.attributes.contenteditable !== undefined && node.attributes.contenteditable !== 'false')
        || node.attributes['data-record-ignore'] !== undefined) return node;
    }
    return null;
  }
}
function fixture() {
  const row = new Element('tr'), cell = new Element('td', row), name = new Element('strong', cell);
  row.dataset = { recordType: 'customer', recordId: 'c-1' };
  const nodes = [row], opened = [], root = { querySelectorAll: () => nodes };
  const handlers = { customer: id => opened.push(['customer', id]), equipment: id => opened.push(['equipment', id]) };
  bindRecordLinks(root, handlers);
  return { row, cell, name, nodes, opened, root, handlers };
}
const click = (target, options = {}) => ({ target, button: 0, defaultPrevented: false, ...options });
const keydown = (target, key, options = {}) => ({ target, key, defaultPrevented: false, repeat: false, preventDefault() { this.defaultPrevented = true; }, ...options });

test('anywhere in a record row opens its details, including text-node targets', () => {
  const s = fixture();
  for (const target of [s.row, s.cell, s.name, { parentElement: s.name }]) s.row.onclick(click(target));
  assert.deepEqual(s.opened, Array.from({ length: 4 }, () => ['customer', 'c-1']));
});

test('child actions keep their own behavior without opening the parent details', () => {
  const s = fixture(); let actions = 0;
  for (const tag of ['button', 'a', 'input', 'select', 'textarea', 'label', 'summary']) {
    const control = new Element(tag, s.cell), icon = new Element('svg', control);
    control.onclick = () => { actions++; };
    control.onclick(); s.row.onclick(click(icon));
    assert.equal(actions, ['button', 'a', 'input', 'select', 'textarea', 'label', 'summary'].indexOf(tag) + 1);
  }
  for (const attributes of [{ role: 'button' }, { role: 'link' }, { role: 'checkbox' }, { role: 'switch' }, { contenteditable: 'true' }, { 'data-record-ignore': '' }]) {
    s.row.onclick(click(new Element('span', s.cell, attributes)));
  }
  assert.deepEqual(s.opened, []);
});

test('a related-record button opens its own record once when its click bubbles', () => {
  const s = fixture(), button = new Element('button', s.cell), icon = new Element('svg', button);
  button.dataset = { recordType: 'equipment', recordId: 'i-2' };
  s.nodes.push(button); bindRecordLinks(s.root, s.handlers);
  const event = click(icon); button.onclick(event); s.row.onclick(event);
  assert.deepEqual(s.opened, [['equipment', 'i-2']]);
});

test('Enter and Space open a focused row without scrolling or repeated activation', () => {
  const s = fixture();
  for (const key of ['Enter', ' ']) {
    const event = keydown(s.row, key); s.row.onkeydown(event);
    assert.equal(event.defaultPrevented, true);
  }
  s.row.onkeydown(keydown(s.row, 'Enter', { repeat: true }));
  s.row.onkeydown(keydown(new Element('button', s.cell), 'Enter'));
  s.row.onkeydown(keydown(s.row, 'ArrowDown'));
  s.row.onkeydown(keydown(s.row, 'Enter', { defaultPrevented: true }));
  assert.deepEqual(s.opened, [['customer', 'c-1'], ['customer', 'c-1']]);
});

test('selecting record text, nonprimary clicks, and prevented events do not navigate', () => {
  const s = fixture();
  s.row.ownerDocument.defaultView.getSelection = () => ({ isCollapsed: false, containsNode: node => node === s.row });
  s.row.onclick(click(s.name));
  s.row.ownerDocument.defaultView.getSelection = () => null;
  s.row.onclick(click(s.cell, { button: 1 })); s.row.onclick(click(s.cell, { defaultPrevented: true }));
  assert.deepEqual(s.opened, []);
});

test('refresh rebinding replaces old navigation while preserving other record handlers', () => {
  const s = fixture(), other = new Element('tr'); let unrelated = 0;
  other.dataset = { recordType: 'terminal', recordId: 't-1' };
  other.onclick = () => { unrelated++; }; s.nodes.push(other);
  bindRecordLinks(s.root, { customer: id => s.opened.push(['updated', id]) });
  s.row.onclick(click(s.cell)); other.onclick();
  assert.deepEqual(s.opened, [['updated', 'c-1']]); assert.equal(unrelated, 1);
});

test('record attributes safely identify records and omit unavailable targets', () => {
  for (const id of ['', null, undefined]) assert.equal(recordAttrs('equipment', id, 'Missing item'), '');
  assert.match(recordAttrs('customer', 0, 'Customer'), /data-record-id="0"/);
  const html = recordAttrs('customer', 'x" onclick="bad', '<img>&"');
  assert.match(html, /data-record-id="x&quot; onclick=&quot;bad"/);
  assert.match(html, /aria-label="View &lt;img&gt;&amp;&quot; details"/);
  assert.ok(!html.includes('<img>'));
});

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function detailFixture(model) {
  const shown = [], notices = [];
  const details = createRecordDetails({ model: () => model, escape, money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded',
    modal: { querySelectorAll: () => [] }, showModal: (title, html) => shown.push({ title, html }), toast: message => notices.push(message) });
  return { details, shown, notices };
}

test('read-only rate and maintenance details retain recorded zero amounts and linked records', () => {
  const s = detailFixture({ items: [{ id: 'i-1' }], transactions: [{ id: 'r-1' }],
    rates: [{ id: 'rate-1', item_id: 'i-1', item_name: 'Bike', rental_rate: 0, deposit_amount: 0, late_penalty_rate: null }],
    maintenance: [{ id: 'm-1', item_id: 'i-1', rental_id: 'r-1', reason: '<img src=x>', details: 'Repair\nnotes' }] });
  s.details.rate('rate-1');
  assert.match(s.shown[0].html, /<dt>Rental rate<\/dt><dd>PHP 0<\/dd>/);
  assert.match(s.shown[0].html, /<dt>Late penalty rate<\/dt><dd>Not recorded<\/dd>/);
  assert.match(s.shown[0].html, /data-record-type="equipment" data-record-id="i-1"/);
  s.details.maintenance('m-1');
  assert.match(s.shown[1].html, /&lt;img src=x&gt;/); assert.ok(!s.shown[1].html.includes('<img'));
  assert.match(s.shown[1].html, /data-record-type="transaction" data-record-id="r-1"/);
});

test('account details omit credentials and stale records show a notice without opening a dialog', () => {
  const s = detailFixture({ users: [{ id: 'u-1', full_name: 'Ana', password: 'SECRET-PASSWORD', token: 'SECRET-TOKEN', is_active: false }] });
  s.details.user('u-1');
  assert.match(s.shown[0].html, /<dt>Status<\/dt><dd>Inactive<\/dd>/);
  assert.ok(!s.shown[0].html.includes('SECRET'));
  for (const handler of Object.values(s.details)) handler('missing');
  assert.equal(s.shown.length, 1); assert.equal(s.notices.length, 4);
});

function workflowFixture(model) {
  const shown = [], notices = [];
  const workflow = createTransactionWorkflow({ model: () => model, escape, money: value => `PHP ${value}`, formatDate: value => value || 'Not recorded',
    modal: { querySelectorAll: () => [], querySelector: () => null }, showModal: (title, html) => shown.push({ title, html }), toast: message => notices.push(message),
    api: () => { throw new Error('Viewing a record must not mutate it'); } });
  return { workflow, shown, notices };
}

test('verification details show the selected attempt and inspection without linking to themselves', () => {
  const s = workflowFixture({ terminals: [], transactions: [{ id: 'r-1', rental_code: 'RENT-001' }], verification: [{ id: 'v-1', rental_id: 'r-1', status: 'CONFIRMED', transaction_type: 'RETURN',
    confirmed_at: '2026-10-01', inspection: { condition: 'DAMAGED', result: 'UNDER_MAINTENANCE', notes: '<script>bad</script>' } }] });
  s.workflow.verificationDetails('v-1');
  assert.match(s.shown[0].html, /RENT-001/); assert.match(s.shown[0].html, /DAMAGED/);
  assert.match(s.shown[0].html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.ok(!s.shown[0].html.includes('data-record-type="verification"'));
  assert.match(s.shown[0].html, /data-verification-rental/);
  s.workflow.verificationDetails('missing');
  assert.equal(s.shown.length, 1); assert.equal(s.notices.length, 1);
});

test('terminal details distinguish recorded confirming terminals and keep credentials private', () => {
  const s = workflowFixture({ terminals: [{ id: 't-1', terminal_code: 'COUNTER-1', credentials_configured: true, auth_token_hash: 'SECRET-HASH' }],
    transactions: [{ id: 'r-1', rental_code: 'RENT-001' }], verification: [{ id: 'v-1', rental_id: 'r-1', terminal_id: 't-1', terminal_code: 'COUNTER-1',
      confirmed_terminal_id: 'historical-terminal', confirmed_terminal_code: 'COUNTER-OLD', status: 'CONFIRMED', transaction_type: 'RENTAL' }] });
  s.workflow.terminalDetails('historical-terminal');
  assert.match(s.shown[0].html, /<p>COUNTER-OLD<\/p>/);
  assert.match(s.shown[0].html, /data-record-type="verification" data-record-id="v-1"/);
  assert.match(s.shown[0].html, /RENT-001/);
  s.workflow.terminalDetails('t-1');
  assert.match(s.shown[1].html, /<dt>Device credential<\/dt><dd>Configured<\/dd>/);
  assert.ok(!s.shown[1].html.includes('SECRET-HASH'));
  s.workflow.terminalDetails('missing');
  assert.equal(s.shown.length, 2); assert.equal(s.notices.length, 1);
});
