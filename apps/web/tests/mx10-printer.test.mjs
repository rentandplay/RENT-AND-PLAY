import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMx10PrintJob, normalizeMx10PrintSettings, normalizeMx10LabelCalibration, paintQrMatrix, createMx10Printer } from '../src/mx10-printer.js';
import { QR_LABEL_GEOMETRY } from '../src/equipment-label.js';

// Independently decode every frame: a missing payload must not consume the next command.
function frames(bytes) {
  const result = [];
  for (let offset = 0; offset < bytes.length;) {
    assert.deepEqual(Array.from(bytes.slice(offset, offset + 2)), [0x51, 0x78]);
    const length = bytes[offset + 4] | bytes[offset + 5] << 8;
    const payload = bytes.slice(offset + 6, offset + 6 + length);
    assert.equal(payload.length, length);
    let crc = 0;
    for (const value of payload) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x80 ? 7 : 0)) & 255;
    }
    assert.equal(bytes[offset + 6 + length], crc, 'payload checksum');
    assert.equal(bytes[offset + 7 + length], 0xff, 'frame terminator');
    result.push({ opcode: bytes[offset + 2], payload: Array.from(payload) });
    offset += length + 8;
  }
  return result;
}

test('MX10 image commands use complete density frames, little-endian energy and image mode', () => {
  const job = buildMx10PrintJob([new Uint8Array(384)]);
  // Golden density packet for MX10's dark image preset (200), including its CRC.
  assert.deepEqual(Array.from(job.slice(0, 10)), [0x51, 0x78, 0xf2, 0, 2, 0, 1, 200, 0x63, 0xff]);
  const decoded = frames(job);
  assert.deepEqual(decoded.find(frame => frame.opcode === 0xaf).payload, [0x98, 0x3a]); // 15000
  assert.deepEqual(decoded.find(frame => frame.opcode === 0xbe).payload, [0]);
  assert.deepEqual(decoded.find(frame => frame.opcode === 0xa4).payload, [0x34]);
});

test('continuous stock feeds before and after the complete raster without searching for a gap', () => {
  const rows = Array.from({ length: 240 }, () => new Uint8Array(384));
  const continuous = frames(buildMx10PrintJob(rows));
  assert.equal(continuous.filter(frame => frame.opcode === 0xa2).length, 240);
  assert.equal(continuous.some(frame => [0xf0, 0xbf].includes(frame.opcode)), false);
  const feeds = continuous.flatMap((frame, index) => frame.opcode === 0xa1 ? [{ frame, index }] : []);
  assert.deepEqual(feeds.map(({ frame }) => frame.payload), [[16, 0], [24, 0]]); // 2 mm start, 3 mm tear.
  assert.equal(continuous.slice(0, feeds[0].index).some(frame => frame.opcode === 0xa2), false);
  assert.equal(continuous.slice(feeds[1].index).some(frame => frame.opcode === 0xa2), false);
  assert.equal(continuous.slice(feeds[0].index, feeds[1].index).filter(frame => frame.opcode === 0xa2).length, rows.length);
  const noFeed = frames(buildMx10PrintJob(rows, { startFeedMm: 0, tearFeedMm: 0 }));
  assert.equal(noFeed.some(frame => frame.opcode === 0xa1), false);
  const customFeed = frames(buildMx10PrintJob(rows, { startFeedMm: 1.5, tearFeedMm: 2.5 }));
  assert.deepEqual(customFeed.filter(frame => frame.opcode === 0xa1).map(frame => frame.payload), [[12, 0], [20, 0]]);
  const gapped = frames(buildMx10PrintJob(rows, { paperMode: 'gapped' }));
  assert.equal(gapped.filter(frame => frame.opcode === 0xa1).length, 1);
  assert.deepEqual(gapped.find(frame => frame.opcode === 0xa1).payload, [48, 0]);
});

test('bitmap rows preserve every dot through packet encoding, including blank rows and LSB order', () => {
  const rows = [new Uint8Array(384), new Uint8Array(384).fill(1), Uint8Array.from({ length: 384 }, (_, x) => x % 3 === 0 ? 1 : 0)];
  rows[0][0] = 1; rows[0][7] = 1; rows[0][383] = 1;
  const decoded = frames(buildMx10PrintJob(rows)).filter(frame => frame.opcode === 0xa2);
  assert.equal(decoded[0].payload[0], 0x81);
  for (let y = 0; y < rows.length; y++) {
    assert.equal(decoded[y].payload.length, 48);
    const pixels = decoded[y].payload.flatMap(byte => Array.from({ length: 8 }, (_, bit) => byte >> bit & 1));
    assert.deepEqual(pixels, Array.from(rows[y]));
  }
  assert.throws(() => buildMx10PrintJob([new Uint8Array(400)]), /384 dots/);
});

test('darkness presets remain bounded and invalid saved settings use continuous/dark', () => {
  assert.deepEqual(normalizeMx10PrintSettings(), { paperMode: 'continuous', darkness: 'dark', startFeedMm: 2, tearFeedMm: 3 });
  assert.deepEqual(normalizeMx10PrintSettings({ paperMode: 'invalid', darkness: 'toString' }), { paperMode: 'continuous', darkness: 'dark', startFeedMm: 2, tearFeedMm: 3 });
  for (const [input, expected] of [[-1, 0], [50, 5], [1.4, 1.5], ['2.5', 2.5], ['invalid', 2], [Infinity, 2]]) assert.equal(normalizeMx10PrintSettings({ startFeedMm: input }).startFeedMm, expected);
  for (const [input, expected] of [[-1, 0], [50, 10], [2.4, 2.5], ['2.5', 2.5], ['invalid', 3], [Infinity, 3]]) assert.equal(normalizeMx10PrintSettings({ tearFeedMm: input }).tearFeedMm, expected);
  for (const [darkness, density, energy, quality] of [['light', 150, 10000, 0x33], ['medium', 180, 10000, 0x34], ['dark', 200, 15000, 0x34]]) {
    const decoded = frames(buildMx10PrintJob([], { darkness }));
    assert.deepEqual(decoded.find(frame => frame.opcode === 0xf2).payload, [1, density]);
    const heat = decoded.find(frame => frame.opcode === 0xaf).payload;
    assert.equal(heat[0] | heat[1] << 8, energy);
    assert.deepEqual(decoded.find(frame => frame.opcode === 0xa4).payload, [quality]);
  }
});

test('QR modules use uniform whole dots in both axes and retain a four-module quiet zone', () => {
  const drawn = [];
  const context = { fillStyle: '', fillRect(x, y, width, height) { drawn.push({ color: this.fillStyle, x, y, width, height }); } };
  const size = 33, data = new Uint8Array(size * size);
  data[0] = data[1] = data[size] = data[size * size - 1] = 1;
  assert.equal(paintQrMatrix(context, { size, data, margin: 4 }, { x: 12, y: 10, size: 272 }, 384, 240), true);
  const box = drawn[0], black = drawn.slice(1);
  assert.equal(black.length, 4);
  for (const dot of black) {
    assert.equal(dot.width, 5); assert.equal(dot.height, 5);
    assert.equal(Number.isInteger(dot.x) && Number.isInteger(dot.y), true);
    assert.ok(dot.x >= box.x + 20 && dot.y >= box.y + 20);
    assert.ok(dot.x + 5 <= box.x + box.width - 20 && dot.y + 5 <= box.y + box.height - 20);
  }
  assert.equal(black[1].x - black[0].x, 5);
  assert.equal(black[2].y - black[0].y, 5);
  assert.equal(paintQrMatrix(context, { size, data: [] }, { x: 0, y: 0, size: 272 }, 384, 240), false);
});

test('compact label placement retains the complete top quiet zone for different QR sizes', () => {
  for (const size of [29, 33, 37]) {
    const drawn = [];
    const context = { fillStyle: '', fillRect(x, y, width, height) { drawn.push({ color: this.fillStyle, x, y, width, height }); } };
    const data = new Uint8Array(size * size); data[0] = data[size * size - 1] = 1;
    paintQrMatrix(context, { size, data, margin: 4 }, QR_LABEL_GEOMETRY, 384, 240);
    const [, first, last] = drawn;
    assert.equal(first.y, first.height * 4, 'four white modules before the first ink');
    assert.ok(last.y + last.height + last.height * 4 <= 240, 'four white modules after the last ink');
    assert.ok(first.y < 35, 'remove spare blank space above the quiet zone');
  }
});

test('saved QR offsets cannot clip the first rows or four-module border', () => {
  for (const size of [29, 33, 37]) {
    const data = new Uint8Array(size * size); data[0] = data[size * size - 1] = 1;
    for (const requested of [-15, -5, 0, 5, 15]) {
      const calibration = normalizeMx10LabelCalibration({ offsetX: requested, offsetY: requested }, { qrGeometry: QR_LABEL_GEOMETRY });
      const rectangles = [];
      const context = { fillStyle: '', fillRect(x, y, width, height) { rectangles.push({ x: x + calibration.offsetX * 8, y: y + calibration.offsetY * 8, width, height }); } };
      paintQrMatrix(context, { size, data, margin: 4 }, QR_LABEL_GEOMETRY, 384, 240);
      const [box, first, last] = rectangles;
      assert.ok(box.x >= 0 && box.y >= 0);
      assert.ok(box.x + box.width <= 384 && box.y + box.height <= 240);
      assert.ok(first.x >= 4 * first.width && first.y >= 4 * first.height);
      assert.ok(last.x + last.width * 5 <= 384 && last.y + last.height * 5 <= 240);
      if (requested < 0) assert.equal(calibration.offsetY, 0, 'old upward offset is corrected before drawing');
    }
  }
  assert.deepEqual(normalizeMx10LabelCalibration({ offsetX: -5, offsetY: -5 }), { offsetX: -5, offsetY: -5 }, 'barcode offsets retain their behavior');
});

function mockBrowser(t, onPacket, { notifications = true } = {}) {
  const originals = new Map(['window', 'navigator', 'document', 'Image', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const listeners = new Map(), packets = [], timers = [], requestedDelays = [];
  let activeWrites = 0, maximumWrites = 0;
  let paused = false, writesWhilePaused = 0;
  const receive = (opcode, value) => {
    if (opcode === 0xae) paused = value === 0x10;
    const bytes = Uint8Array.from([0x51, 0x78, opcode, 1, 1, 0, value, value === 0x10 ? 0x70 : 0, 0xff]);
    listeners.get('characteristicvaluechanged')?.({ target: { value: new DataView(bytes.buffer) } });
  };
  const tx = { properties: { writeWithoutResponse: true }, async writeValueWithoutResponse(packet) {
    activeWrites++; maximumWrites = Math.max(maximumWrites, activeWrites);
    if (paused) writesWhilePaused++;
    packets.push(packet);
    await Promise.resolve();
    if (packet[2] === 0xa3 && packet.length === 9) receive(0xa3, 0);
    onPacket?.({ packets, receive, disconnect: () => device.gatt.disconnect() });
    activeWrites--;
  } };
  const rx = { properties: { notify: true }, addEventListener(name, handler) { listeners.set(name, handler); }, removeEventListener() {}, async startNotifications() {} };
  const service = { async getCharacteristic(uuid) { if (uuid.includes('ae01')) return tx; if (!notifications) throw new Error('Notifications unavailable'); return rx; } };
  const device = { name: 'MX10', id: 'test-printer', addEventListener() {}, removeEventListener() {}, gatt: { connected: false, async connect() { this.connected = true; return { async getPrimaryService() { return service; } }; }, disconnect() { this.connected = false; } } };
  const window = { isSecureContext: true, setTimeout(callback, ms) { requestedDelays.push(ms); const timer = setTimeout(callback, ms >= 6000 ? 5 : 0); timers.push(timer); return timer; }, clearTimeout };
  t.after(() => timers.forEach(clearTimeout));
  class MockImage { set src(value) { this.value = value; queueMicrotask(() => this.onload()); } }
  const document = { createElement() { const canvas = { width: 0, height: 0 }; canvas.getContext = () => ({ fillRect() {}, save() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, drawImage() {}, restore() {}, getImageData() { return { data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255) }; } }); return canvas; } };
  for (const [key, value] of Object.entries({ window, document, navigator: { bluetooth: { async requestDevice() { return device; } } }, Image: MockImage, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } })) Object.defineProperty(globalThis, key, { configurable: true, value });
  return { packets, receive, requestedDelays, get writesWhilePaused() { return writesWhilePaused; }, get maximumWrites() { return maximumWrites; } };
}

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300"><rect width="500" height="300" fill="white"/></svg>';

test('continuous Bluetooth job respects pause/resume and never performs sensor alignment', async t => {
  let pausedOnce = false;
  const browser = mockBrowser(t, ({ packets, receive }) => {
    if (packets.length === 8 && !pausedOnce) { pausedOnce = true; receive(0xae, 0x10); setTimeout(() => receive(0xae, 0), 12); }
  });
  const printer = createMx10Printer(), states = [];
  printer.subscribe(state => states.push(state));
  await printer.connect();
  const pending = printer.printLabel(svg);
  assert.equal(printer.status().printing, true, 'reserve the printer before image preparation');
  await assert.rejects(printer.printLabel(svg), /current printer operation/);
  const result = await pending;
  assert.equal(pausedOnce, true);
  assert.equal(browser.writesWhilePaused, 0);
  assert.equal(result.height, 240);
  assert.equal(result.lengthMm, 30);
  assert.equal(result.paperMode, 'continuous');
  assert.equal(result.aligned, false);
  assert.equal(result.labelGapMm, 0);
  assert.equal(result.tearFeedMm, 3);
  assert.equal(result.startFeedMm, 2);
  assert.equal(result.totalLengthMm, 35);
  assert.equal(states.some(state => state.aligning), false);
  const all = Buffer.concat(browser.packets.map(packet => Buffer.from(packet)));
  assert.equal(frames(all).some(frame => frame.opcode === 0xf0), false);
  assert.deepEqual(frames(all).filter(frame => frame.opcode === 0xa1).map(frame => frame.payload), [[16, 0], [24, 0]]);
  assert.equal(browser.maximumWrites, 1, 'BLE writes stay ordered without overlap');
  assert.ok(browser.requestedDelays.length < browser.packets.length / 4, 'stream raster without a timer for each packet');
  assert.equal(printer.status().printing, false);
  await printer.disconnect();
});

test('paper-out during transfer stops the job and releases printing state', async t => {
  const browser = mockBrowser(t, ({ packets, receive }) => { if (packets.length === 9) receive(0xa3, 1); });
  const printer = createMx10Printer();
  await printer.connect();
  await assert.rejects(printer.printLabel(svg), /out of paper|ran out of paper/);
  assert.equal(browser.packets.length, 9, 'no more data after a paper-out report');
  assert.equal(printer.status().printing, false);
  const retry = await printer.printLabel(svg);
  assert.equal(retry.paperMode, 'continuous', 'a healthy status query permits retry after reloading');
  await printer.disconnect();
});

test('precut mode sends a complete sensor-position command after the raster', async t => {
  const browser = mockBrowser(t);
  const printer = createMx10Printer();
  await printer.connect();
  const result = await printer.printLabel(svg, {}, {}, { paperMode: 'gapped', darkness: 'medium' });
  assert.equal(result.aligned, true);
  assert.equal(result.alignmentMethod, 'sensor');
  const decoded = frames(Buffer.concat(browser.packets.map(packet => Buffer.from(packet))));
  assert.deepEqual(decoded.find(frame => frame.opcode === 0xf0).payload, [1, 0x99, 0x20]);
  assert.deepEqual(decoded.find(frame => frame.opcode === 0xa1).payload, [48, 0]);
  await printer.disconnect();
});

test('overheat notification stops raster transfer and releases printing state', async t => {
  const browser = mockBrowser(t, ({ packets, receive }) => { if (packets.length === 9) receive(0xa3, 4); });
  const printer = createMx10Printer();
  await printer.connect();
  await assert.rejects(printer.printLabel(svg), /too hot/);
  assert.equal(browser.packets.length, 9, 'no more data after an overheat report');
  assert.equal(printer.status().printing, false);
  await printer.printLabel(svg); // A status query can clear the cooled print-head state.
  await printer.disconnect();
});

test('firmware without notifications retains conservative packet pacing', async t => {
  const browser = mockBrowser(t, ({ packets, disconnect }) => { if (packets.length === 5) disconnect(); }, { notifications: false });
  const printer = createMx10Printer();
  await printer.connect();
  await assert.rejects(printer.printLabel(svg), /Bluetooth disconnected/);
  assert.equal(browser.maximumWrites, 1);
  assert.equal(browser.requestedDelays.filter(ms => ms === 7).length, 5);
  await printer.disconnect();
});
