import { recordCode } from './record-codes.js';
import { getMx10Printer } from './mx10-printer.js';

const clean = value => String(value ?? '').replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
const escapeXml = value => clean(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `PHP ${value.toFixed(2)}` : 'Not recorded';
const date = value => {
  const raw = clean(value);
  if (!raw) return 'Not recorded';
  const parsed = new Date(/Z$|[+-]\d\d:\d\d$/.test(raw) ? raw : raw.replace(' ', 'T') + '+08:00');
  return Number.isFinite(parsed.getTime()) ? new Date(parsed.getTime() + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : 'Not recorded';
};

export function thermalReceiptLines(row) {
  const reference = recordCode(row);
  if (!/^R-[A-Z0-9]+$/i.test(reference)) throw new Error('Refresh this rental to load its saved receipt reference.');
  const fee = row.fee_breakdown || {}, lines = [];
  const line = (text, style = {}) => lines.push({ text: clean(text), ...style });
  const field = (label, value) => line(`${label}: ${clean(value) || 'Not recorded'}`);
  const divider = () => lines.push({ text: '', separator: true });
  line('RENT & PLAY', { bold: true, center: true, size: 26 });
  line('Lakewoods Subdivision', { center: true });
  line('Los Banos, Laguna', { center: true });
  line('RENTAL RECEIPT', { bold: true, center: true });
  line(reference, { bold: true, center: true, size: 26 });
  divider();
  field('Status', clean(row.status).replaceAll('_', ' '));
  field('Customer', row.customer_name); field('Contact', row.customer_phone);
  field('Equipment', row.item_name); field('Unit', row.item_code);
  field('Handover', row.fulfillment_mode === 'SHOP_HANDOVER' ? 'At shop' : 'Resort delivery');
  field('Location', row.delivery_location);
  field('Started', date(row.confirmed_rental_at)); field('Due', date(row.due_at));
  field('Duration', Number.isFinite(fee.billed_minutes) ? `${fee.billed_minutes} min` : null);
  divider();
  field('Rental fee', money(row.rental_fee)); field('Payment method', row.payment_method);
  field('Payment received', money(row.rental_paid_amount));
  if (fee.overtime_fee != null) field('Late charges', money(fee.overtime_fee));
  if (fee.penalty_amount != null) field('Damage / missing', money(fee.penalty_amount));
  if (fee.final_rental_charges != null) field('Final total', money(fee.final_rental_charges));
  field('Balance due', money(row.balance_due));
  if (row.refund_due != null && ['COMPLETED','CANCELLED','REJECTED','EXPIRED'].includes(row.status)) field('Refund due', money(row.refund_due));
  divider();
  field('Late rate', `${money(fee.overtime_rate)} / started ${fee.overtime_unit_minutes || 60} min`);
  field('Grace', fee.grace_minutes == null ? null : `${fee.grace_minutes} min`);
  if (row.received_at) field('Received', date(row.received_at));
  line('Keep this rental reference.');
  line('Timer stops when staff receives the item.');
  line('Return is subject to inspection. Damage or missing parts may affect final charges.');
  return lines;
}

export function wrapReceiptText(text, measure, width = 360) {
  const output = [];
  let current = '';
  for (const word of clean(text).split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= width) { current = candidate; continue; }
    if (current) { output.push(current); current = ''; }
    for (const char of Array.from(word)) {
      if (current && measure(current + char) > width) { output.push(current); current = ''; }
      current += char;
    }
  }
  if (current) output.push(current);
  return output;
}

export function renderThermalReceipt(row, measureText) {
  const context = !measureText && typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const measure = measureText || ((text, size, bold) => {
    if (!context) return Array.from(text).length * size * .6;
    context.font = `${bold ? 'bold ' : ''}${size}px monospace`;
    return context.measureText(text).width;
  });
  const artwork = []; let y = 12;
  for (const line of thermalReceiptLines(row)) {
    if (line.separator) { artwork.push(`<path d="M12 ${y + 6}H372" stroke="black" stroke-width="1"/>`); y += 16; continue; }
    const size = line.size || 20;
    for (const text of wrapReceiptText(line.text, value => measure(value, size, line.bold))) {
      y += size;
      artwork.push(`<text x="${line.center ? 192 : 12}" y="${y}" font-family="monospace" font-size="${size}" ${line.bold ? 'font-weight="bold"' : ''} ${line.center ? 'text-anchor="middle"' : ''}>${escapeXml(text)}</text>`);
      y += 8;
    }
  }
  const height = y + 12;
  if (height > 8192) throw new Error('This receipt is too long for one print job. Shorten its location or contact details.');
  return { width: 384, height, lengthMm: height / 8, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="${height}" viewBox="0 0 384 ${height}"><rect width="384" height="${height}" fill="white"/><g fill="black">${artwork.join('')}</g></svg>` };
}

export function openBluetoothReceipt(row, h, back, openPdf) {
  const { modal, showModal, escape: e, toast } = h;
  let receipt;
  try { receipt = renderThermalReceipt(row); } catch (error) { toast(error.message); return; }
  const printer = getMx10Printer();
  const glyph = name => h.icon?.(name) || '';
  showModal('Print rental receipt', `<section class="receipt-print-dialog" data-thermal-receipt>
    <div class="receipt-overview"><div><strong>${e(recordCode(row))}</strong><p>${e(row.item_name || 'Rental receipt')}${row.item_code ? ` · ${e(row.item_code)}` : ''}</p></div><span class="receipt-paper-badge">Continuous paper roll</span></div>
    <div class="receipt-print-body">
      <section class="receipt-preview-panel" aria-label="Receipt preview"><div class="receipt-section-heading"><h3>Receipt preview</h3><span>Approx. ${e(Math.ceil(receipt.lengthMm + 5))} mm long</span></div><div class="receipt-preview-viewport" tabindex="0" aria-label="Scroll receipt preview"><div class="receipt-paper"><img alt="Thermal rental receipt preview" src="data:image/svg+xml;charset=utf-8,${e(encodeURIComponent(receipt.svg))}"/></div></div><p class="receipt-preview-caption">Side margins keep the receipt clear and readable.</p></section>
      <aside class="receipt-print-controls"><section class="receipt-device-card"><div class="receipt-device-heading"><span class="receipt-device-icon">${glyph('print')}</span><div><h3>Bluetooth printer</h3><p>Connect your receipt printer.</p></div></div><div class="receipt-connection" data-receipt-connection><span class="receipt-status-dot" aria-hidden="true"></span><p data-receipt-printer-state role="status" aria-live="polite"></p></div><p class="receipt-connection-help" data-receipt-printer-help></p><button type="button" class="secondary receipt-connect" data-receipt-connect>Connect printer</button><progress data-receipt-progress max="100" value="0" hidden aria-label="Receipt print progress"></progress><div class="receipt-message" data-receipt-print-message role="status" aria-live="polite" hidden></div></section>
      <section class="receipt-roll-card"><h3>Paper setup</h3><dl><div><dt>Paper type</dt><dd>Continuous roll</dd></div></dl><p>Load the roll with the thermal side facing the print head. Leave enough paper at the tear edge before printing.</p></section></aside>
    </div><footer class="receipt-print-footer"><button type="button" class="text-button" data-receipt-back>Back to rental</button><div>${openPdf ? '<button type="button" class="secondary" data-receipt-pdf-fallback>Save / print PDF</button>' : ''}<button type="button" class="primary" data-receipt-bluetooth-print disabled>${glyph('print')}Print via Bluetooth</button></div></footer>
  </section>`);
  const panel = modal.querySelector('[data-thermal-receipt]'), message = panel.querySelector('[data-receipt-print-message]'), connect = panel.querySelector('[data-receipt-connect]'), print = panel.querySelector('[data-receipt-bluetooth-print]'), progress = panel.querySelector('[data-receipt-progress]');
  const supported = Boolean(window.isSecureContext && navigator.bluetooth);
  let active = true, busy = false, unsubscribe = () => {};
  const preventBusyClose = event => { if (busy) event.preventDefault(); };
  const cleanup = () => { active = false; unsubscribe(); modal.removeEventListener('close', cleanup); modal.removeEventListener('cancel', preventBusyClose); };
  const showMessage = (text, kind = 'error') => { message.hidden = !text; message.textContent = text; message.dataset.kind = kind; };
  unsubscribe = printer.subscribe(state => {
    if (!active) return;
    if (!panel.isConnected) { cleanup(); return; }
    busy = state.connecting || state.reconnecting || state.printing || state.sensorSearching;
    const warning = state.paperOut || state.headHot;
    panel.querySelector('[data-receipt-connection]').dataset.state = !supported || warning ? 'warning' : busy ? 'busy' : state.connected ? 'connected' : 'disconnected';
    panel.querySelector('[data-receipt-printer-state]').textContent = !supported ? 'Bluetooth unavailable' : state.printing ? `Printing receipt… ${state.progress}%` : state.connecting || state.reconnecting ? 'Connecting printer…' : state.connected ? 'Printer connected' : 'Printer not connected';
    panel.querySelector('[data-receipt-printer-help]').textContent = !supported ? 'Use Chrome or Edge on localhost/HTTPS to connect. You can also save or print a PDF.' : state.paperOut ? 'Load the paper roll, then try printing again.' : state.headHot ? 'Let the print head cool, then try printing again.' : state.printing ? 'Keep the printer nearby while the receipt is being sent.' : state.connected ? 'Ready to print your receipt.' : 'Turn on the printer, then connect it to this device.';
    connect.disabled = !supported || busy; connect.textContent = state.connected ? 'Change printer' : 'Connect printer';
    // The next job rechecks the physical status, so paper/heat errors can be
    // retried after loading the roll or cooling without pairing again.
    print.disabled = !supported || !state.connected || busy;
    progress.hidden = !state.printing; progress.value = state.progress;
    panel.querySelector('[data-receipt-back]').disabled = busy;
    const close = modal.querySelector('#close-modal'); if (close) close.disabled = busy;
    const pdf = panel.querySelector('[data-receipt-pdf-fallback]'); if (pdf) pdf.disabled = busy;
  });
  modal.addEventListener('close', cleanup);
  modal.addEventListener('cancel', preventBusyClose);
  panel.querySelector('[data-receipt-back]').onclick = () => { if (busy) return; cleanup(); back(); };
  panel.querySelector('[data-receipt-pdf-fallback]')?.addEventListener('click', () => { if (busy) return; cleanup(); openPdf(); });
  connect.onclick = async () => { if (busy) return; showMessage(''); try { await printer.connect(); } catch (error) { if (active && panel.isConnected) showMessage(error.message); } };
  print.onclick = async () => {
    if (busy || print.disabled) return;
    showMessage('');
    try {
      await printer.printReceipt(receipt.svg, receipt.height, { darkness: 'dark', startFeedMm: 2, tearFeedMm: 3 });
      if (active && panel.isConnected) showMessage('Receipt sent. Check the paper before printing another copy.', 'success');
    } catch (error) { if (active && panel.isConnected) showMessage(`${error.message} Check any partial paper output before retrying.`); else toast(error.message); }
  };
}
