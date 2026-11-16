import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseHTML } from 'linkedom';
import { bindQrReaders, qrScanRegions, qrPositionFeedback, cameraErrorMessage } from '../src/qr-reader.js';
import { createEquipmentQrLabel } from '../src/equipment-label.js';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const QRCode = require('qrcode');

test('the camera decoder reads actual equipment label print dots, including compact codes and older tokens', async () => {
  const context = vm.createContext({});
  vm.runInContext(await readFile(new URL('../public/vendor/jsQR.js', import.meta.url), 'utf8'), context);
  for (const value of ['EQUIP-001', 'EQUIP-1000', 'rp-qr-physical-unit-001', 'rp-qr-' + 'a'.repeat(48)]) {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const svg = createEquipmentQrLabel({ item_code: 'EQUIP-001', name: 'Bicycle' }, { matrix: { size: qr.modules.size, data: Array.from(qr.modules.data), margin: 4 } });
    const ink = /<path d="(M[^"]+)"/.exec(svg)[1];
    const pixels = new Uint8ClampedArray(384 * 240 * 4).fill(255);
    for (const dot of ink.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g)) {
      const [x, y, w, h] = dot.slice(1).map(Number);
      for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
        const i = (py * 384 + px) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
    }
    assert.equal(context.jsQR(pixels, 384, 240)?.data, value);
  }
});

test('portrait and landscape preview crops map correctly to camera pixels, and QR location gives actionable guidance', () => {
  const landscape = qrScanRegions(1280, 720, { left: 10, top: 20, width: 400, height: 200 }, { left: 160, top: 70, width: 100, height: 100 });
  assert.deepEqual(landscape.target, { x: 480, y: 200, width: 320, height: 320 });
  const portrait = qrScanRegions(720, 1280, { left: 0, top: 0, width: 400, height: 200 }, { left: 150, top: 50, width: 100, height: 100 });
  assert.deepEqual(portrait.target, { x: 270, y: 550, width: 180, height: 180 });
  const found = (x, y, size) => ({ location: { topLeftCorner: { x, y }, topRightCorner: { x: x + size, y }, bottomLeftCorner: { x, y: y + size }, bottomRightCorner: { x: x + size, y: y + size } } });
  assert.match(qrPositionFeedback(found(0, 0, 40), 200, 200).message, /center/);
  assert.match(qrPositionFeedback(found(90, 90, 20), 200, 200).message, /closer/);
  assert.equal(qrPositionFeedback(found(40, 40, 120), 200, 200), null);
});

function camera(t, { decode = () => null, light = 180, permissionError } = {}) {
  const keys = ['navigator', 'isSecureContext', 'jsQR', 'document', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'Event'];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const { document } = parseHTML('<html><body><dialog open><form><input name="inventoryCode"><button data-scan-field="inventoryCode">Scan with camera</button><p data-camera-status></p></form></dialog></body></html>');
  const form = document.querySelector('form'), modal = document.querySelector('dialog'), field = form.querySelector('input'), button = form.querySelector('button'), output = form.querySelector('p');
  form.elements = { inventoryCode: field }; modal.open = true;
  let stops = 0, timerId = 0;
  const pending = new Map();
  const pixels = new Uint8ClampedArray(400 * 200 * 4).fill(light);
  const video = { readyState: 2, videoWidth: 400, videoHeight: 200, play: async () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }) };
  const canvas = { getContext: () => ({ drawImage() {}, getImageData: () => ({ data: pixels }) }) };
  const createElement = document.createElement.bind(document);
  document.createElement = tag => {
    if (tag === 'video') return Object.assign(createElement('video'), video);
    if (tag === 'canvas') return canvas;
    const node = createElement(tag); node.scrollIntoView = () => {};
    if (tag === 'div') node.getBoundingClientRect = () => node.className === 'qr-scanner-target' ? { left: 150, top: 50, width: 100, height: 100 } : { left: 0, top: 0, width: 400, height: 200 };
    return node;
  };
  const values = {
    navigator: { mediaDevices: { getUserMedia: async () => { if (permissionError) throw permissionError; return { getTracks: () => [{ stop() { stops++; } }], getVideoTracks: () => [] }; } } },
    isSecureContext: true, jsQR: (...args) => decode(...args), document, requestAnimationFrame: callback => callback(), Event: document.defaultView.Event,
    setTimeout: callback => { pending.set(++timerId, callback); return timerId; }, clearTimeout: id => pending.delete(id),
  };
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: values[key] });
  let stop;
  t.after(() => { stop?.(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return {
    field, output, button, modal, form,
    bind(options) { stop = bindQrReaders(form, modal, options); },
    async tick() { const [id, callback] = pending.entries().next().value; pending.delete(id); await callback(); },
    get stopped() { return stops; },
  };
}

test('dark camera frames show a lighting hint without accepting a label', async t => {
  const c = camera(t, { light: 20 }); c.bind(); await c.button.onclick();
  assert.match(c.output.textContent, /too dark/);
  assert.equal(c.output.getAttribute('data-state'), 'warning');
  assert.equal(c.field.value, '');
});

test('a QR outside the target shows a centering hint and never triggers verification', async t => {
  let checked = 0;
  const c = camera(t, { decode: (_data, width) => width === 400 ? { data: 'EQUIP-001' } : null });
  c.bind({ validateCapture: () => { checked++; } });
  await c.button.onclick(); await c.tick(); await c.tick();
  assert.match(c.output.textContent, /outside the scan area/);
  assert.equal(checked, 0); assert.equal(c.field.value, '');
});

test('a wrong label leaves the camera open, throttles repeated validation, and accepts a corrected label', async t => {
  let value = 'wrong-label', checked = 0, captured = 0;
  const c = camera(t, { decode: () => ({ data: value }) });
  c.bind({ validateCapture: async code => { checked++; if (code === 'wrong-label') throw Error('Wrong equipment label. Scan the assigned unit.'); return { message: 'Equipment QR verified: EQUIP-001.' }; }, onCapture: () => captured++ });
  await c.button.onclick();
  assert.match(c.output.textContent, /Wrong equipment/); assert.equal(c.field.value, ''); assert.equal(c.stopped, 0);
  await c.tick(); assert.equal(checked, 1);
  value = 'EQUIP-001'; await c.tick();
  assert.equal(c.field.value, 'EQUIP-001'); assert.equal(captured, 1); assert.equal(c.stopped, 1);
  assert.equal(c.output.getAttribute('data-state'), 'success'); assert.equal(c.form.querySelector('.qr-scanner-frame'), null);
});

test('closing the dialog while a label check is pending discards the capture and releases the camera', async t => {
  let finish, captured = 0;
  const c = camera(t, { decode: () => ({ data: 'EQUIP-001' }) });
  c.bind({ validateCapture: () => new Promise(resolve => { finish = resolve; }), onCapture: () => captured++ });
  const scanning = c.button.onclick();
  for (let i = 0; i < 12 && !finish; i++) await Promise.resolve();
  assert.equal(typeof finish, 'function');
  c.modal.open = false; c.modal.dispatchEvent(new (c.modal.ownerDocument.defaultView.Event)('close'));
  finish({ message: 'Verified' }); await scanning;
  assert.equal(c.stopped, 1); assert.equal(c.field.value, ''); assert.equal(captured, 0);
});

test('camera permission and device failures show recovery instructions', async t => {
  const c = camera(t, { permissionError: { name: 'NotAllowedError' } }); c.bind(); await c.button.onclick();
  assert.match(c.output.textContent, /permission was denied/); assert.equal(c.output.getAttribute('data-state'), 'error');
  assert.equal(c.button.textContent, 'Scan with camera');
  assert.match(cameraErrorMessage({ name: 'NotFoundError' }), /No camera/);
  assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /Close other apps/);
});
