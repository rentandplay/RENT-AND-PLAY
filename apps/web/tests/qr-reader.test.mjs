import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { bindQrReaders } from '../src/qr-reader.js';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const QRCode = require('qrcode'), { PNG } = require('pngjs');

test('the bundled offline camera decoder reads transaction and inventory QR images', async () => {
  const context = vm.createContext({});
  vm.runInContext(await readFile(new URL('../public/vendor/jsQR.js', import.meta.url), 'utf8'), context);
  for (const value of ['rp-booking-' + 'a'.repeat(48), 'rp-qr-physical-unit-001']) {
    const png = PNG.sync.read(await QRCode.toBuffer(value, { width: 360, margin: 4 }));
    assert.equal(context.jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data, value);
  }
});

test('camera acquisition cancelled by a closed dialog releases all tracks', async () => {
  const originals = Object.fromEntries(['navigator', 'isSecureContext', 'jsQR'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let acquire, stopped = 0, close;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise(resolve => { acquire = resolve; }) } } });
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  globalThis.jsQR = () => null;
  const button = { dataset: { scanField: 'code' }, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} };
  const output = { textContent: '', classList: { add() {}, remove() {} } };
  const form = { isConnected: true, elements: { code: { value: '', disabled: false } }, querySelectorAll: () => [button], querySelector: selector => selector === '.qr-scanner-frame' ? null : output };
  const modal = { open: true, addEventListener: (_event, handler) => { close = handler; } };
  try {
    bindQrReaders(form, modal); const pending = button.onclick(); await Promise.resolve(); await Promise.resolve();
    modal.open = false; close();
    acquire({ getTracks: () => [{ stop() { stopped++; } }] });
    await pending; assert.equal(stopped, 1); assert.equal(form.elements.code.value, '');
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test('a locked equipment QR control cannot open the camera', async () => {
  const button = { disabled: true, dataset: { scanField: 'inventoryCode' } };
  const form = { elements: { inventoryCode: { disabled: true } }, querySelectorAll: () => [button], querySelector: () => { throw new Error('A locked scanner must not initialize.'); } };
  bindQrReaders(form, {});
  await button.onclick();
  button.disabled = false;
  await button.onclick();
});

test('a camera capture updates the QR field and calls its verification hook after releasing the camera', async () => {
  const keys = ['navigator', 'isSecureContext', 'jsQR', 'document', 'requestAnimationFrame'];
  const originals = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let stopped = 0, removed = 0, inputEvent;
  const captured = [], value = 'rp-rental-camera-test';
  const field = { value: '', dispatchEvent(event) { inputEvent = event.type; } };
  const button = { dataset: { scanField: 'transactionCode' }, innerHTML: 'Scan', classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} };
  let scannerFrame;
  const output = { textContent: '', classList: { add() {}, remove() {} }, after(frame) { scannerFrame = frame; } };
  const video = { readyState: 2, videoWidth: 2, videoHeight: 2, play: async () => {} };
  const canvas = { getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(16) }) }) };
  const element = () => ({ className: '', setAttribute() {}, append() {}, scrollIntoView() {}, remove() { removed++; scannerFrame = null; } });
  const values = {
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { stopped++; } }], getVideoTracks: () => [] }) } },
    isSecureContext: true, jsQR: () => ({ data: value }), requestAnimationFrame: callback => callback(),
    document: { hidden: false, createElement: tag => tag === 'video' ? video : tag === 'canvas' ? canvas : element() },
  };
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: values[key] });
  try {
    const form = {
      isConnected: true,
      elements: { transactionCode: field },
      querySelectorAll: () => [button],
      querySelector: selector => selector === '.qr-scanner-frame' ? scannerFrame : output,
    };
    bindQrReaders(form, { open: true }, { onCapture: name => captured.push({ name, value: field.value, stopped }) });
    await button.onclick();
    assert.equal(inputEvent, 'input'); assert.equal(stopped, 1); assert.equal(removed, 1);
    assert.deepEqual(captured, [{ name: 'transactionCode', value, stopped: 1 }]);
  } finally {
    for (const key of keys) { const descriptor = originals[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test('scan reading area crops strictly to the viewfinder target box before decoding', async () => {
  const keys = ['navigator', 'isSecureContext', 'jsQR', 'document', 'requestAnimationFrame'];
  const originals = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let stopped = 0, drawSlice = null, decodeDimensions = null;
  const captured = [], value = 'rp-restricted-viewfinder-qr';
  const field = { value: '', dispatchEvent() {} };
  const button = { dataset: { scanField: 'transactionCode' }, innerHTML: 'Scan', classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} };
  let scannerFrame, targetElement;
  const output = { textContent: '', classList: { add() {}, remove() {} }, after(frame) { scannerFrame = frame; } };
  const video = { readyState: 2, videoWidth: 1200, videoHeight: 600, play: async () => {} };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
        drawSlice = { sx, sy, sw, sh, dw, dh };
      },
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
    })
  };
  let divCount = 0;
  const frameEl = {
    className: '',
    setAttribute() {},
    append() {},
    scrollIntoView() {},
    remove() { stopped++; scannerFrame = null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 })
  };
  const targetEl = {
    className: '',
    setAttribute() {},
    classList: { add() {}, remove() {} },
    getBoundingClientRect: () => ({ left: 100, top: 25, width: 200, height: 150 })
  };
  const labelEl = {
    className: '',
    textContent: '',
    setAttribute() {}
  };

  const values = {
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { stopped++; } }], getVideoTracks: () => [] }) } },
    isSecureContext: true,
    jsQR: (data, w, h) => {
      decodeDimensions = { w, h };
      return { data: value };
    },
    requestAnimationFrame: callback => callback(),
    document: {
      hidden: false,
      createElement: tag => {
        if (tag === 'video') return video;
        if (tag === 'canvas') return canvas;
        if (tag === 'div') {
          divCount++;
          return divCount === 1 ? frameEl : targetEl;
        }
        return labelEl;
      }
    },
  };
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: values[key] });
  try {
    const form = {
      isConnected: true,
      elements: { transactionCode: field },
      querySelectorAll: () => [button],
      querySelector: selector => selector === '.qr-scanner-frame' ? scannerFrame : output,
    };
    bindQrReaders(form, { open: true }, { onCapture: name => captured.push({ name, value: field.value }) });
    await button.onclick();

    assert.ok(drawSlice, 'drawImage should have been called with sliced coordinates');
    // Frame is 400x200, video is 1200x600 (aspect ratio 2:1 for both, scale = 400/1200 = 0.3333).
    // Target is left: 100, top: 25, width: 200, height: 150.
    // In video coordinates: sx = 100 / (1/3) = 300, sy = 25 / (1/3) = 75, sw = 200 / (1/3) = 600, sh = 150 / (1/3) = 450.
    assert.equal(drawSlice.sx, 300);
    assert.equal(drawSlice.sy, 75);
    assert.equal(drawSlice.sw, 600);
    assert.equal(drawSlice.sh, 450);
    assert.equal(decodeDimensions.w, 600);
    assert.equal(decodeDimensions.h, 450);
    assert.equal(field.value, value);
  } finally {
    for (const key of keys) { const descriptor = originals[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
