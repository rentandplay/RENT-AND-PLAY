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
  const button = { dataset: { scanField: 'code' } }, output = { textContent: '' };
  const form = { isConnected: true, elements: { code: { value: '' } }, querySelectorAll: () => [button], querySelector: () => output };
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
  const keys = ['navigator', 'isSecureContext', 'jsQR', 'document'];
  const originals = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let stopped = 0, removed = 0, inputEvent;
  const captured = [], value = 'rp-booking-camera-test';
  const field = { value: '', dispatchEvent(event) { inputEvent = event.type; } };
  const button = { dataset: { scanField: 'transactionCode' } };
  const output = { textContent: '', after() {} };
  const video = { readyState: 2, videoWidth: 2, videoHeight: 2, play: async () => {}, remove() { removed++; } };
  const canvas = { getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(16) }) }) };
  const values = {
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { stopped++; } }] }) } },
    isSecureContext: true, jsQR: () => ({ data: value }),
    document: { hidden: false, createElement: tag => tag === 'video' ? video : canvas },
  };
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: values[key] });
  try {
    const form = { isConnected: true, elements: { transactionCode: field }, querySelectorAll: () => [button], querySelector: () => output };
    bindQrReaders(form, { open: true }, { onCapture: name => captured.push({ name, value: field.value, stopped }) });
    await button.onclick();
    assert.equal(inputEvent, 'input'); assert.equal(stopped, 1); assert.equal(removed, 1);
    assert.deepEqual(captured, [{ name: 'transactionCode', value, stopped: 1 }]);
  } finally {
    for (const key of keys) { const descriptor = originals[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
