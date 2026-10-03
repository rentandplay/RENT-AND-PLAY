const PRINTER = Object.freeze({
  primaryService: '0000ae30-0000-1000-8000-00805f9b34fb',
  alternateService: '0000af30-0000-1000-8000-00805f9b34fb',
  txCharacteristic: '0000ae01-0000-1000-8000-00805f9b34fb',
  rxCharacteristic: '0000ae02-0000-1000-8000-00805f9b34fb',
  width: 384,
  dotsPerMm: 8, // MX10 uses a 384-dot printhead (about 48 mm printable width).
  chunkSize: 20,
});

const MX10_IMAGE_PRINT_PROFILE = Object.freeze({
  speed: 10,
  endSpeed: 25,
  fallbackPacketDelayMs: 7, // Pace firmware that cannot send buffer-flow notifications.
});

// Confirmed against the supplied Fun Print APK: print_webview_preview.js maps
// MX10 to MX06 image presets; V5g.getEnerageByte stores energy little-endian.
const IMAGE_DARKNESS = Object.freeze({
  light: Object.freeze({ quality: 0x33, density: 150, energy: 10000 }),
  medium: Object.freeze({ quality: 0x34, density: 180, energy: 10000 }),
  dark: Object.freeze({ quality: 0x34, density: 200, energy: 15000 }),
});

export function normalizeMx10PrintSettings(settings = {}) {
  settings ??= {};
  const requestedStartFeed = Number(settings.startFeedMm ?? 2);
  const requestedFeed = Number(settings.tearFeedMm ?? 3);
  return {
    paperMode: settings.paperMode === 'gapped' ? 'gapped' : 'continuous',
    darkness: Object.hasOwn(IMAGE_DARKNESS, settings.darkness) ? settings.darkness : 'dark',
    startFeedMm: Number.isFinite(requestedStartFeed) ? Math.round(Math.max(0, Math.min(5, requestedStartFeed)) * 2) / 2 : 2,
    tearFeedMm: Number.isFinite(requestedFeed) ? Math.round(Math.max(0, Math.min(10, requestedFeed)) * 2) / 2 : 3,
  };
}

const SENSOR_THRESHOLD_KEY = 'rent-play-mx10-label-sensor-threshold';
const SAVED_DEVICE_ID_KEY = 'rent-play-mx10-bluetooth-device-id';
const SENSOR_SEARCH_LIMIT = 50;
const SENSOR_SAMPLE_WINDOW = 4;
const LABEL_POSITION_FALLBACK_MS = 6100; // Fun Print's MX10/V5G timing for a 30 mm label.
const LABEL_POSITION_SETTLE_MS = 900;
const RECONNECT_INITIAL_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;

const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));

function crc8(bytes) {
  let crc = 0;
  for (const value of bytes) {
    crc ^= value & 0xff;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

function command(opcode, payload = new Uint8Array()) {
  if (payload.length > 255) throw new Error('A printer command was too large.');
  const output = new Uint8Array(payload.length + 8);
  output.set([0x51, 0x78, opcode & 0xff, 0x00, payload.length, 0x00], 0);
  output.set(payload, 6);
  output[6 + payload.length] = crc8(payload);
  output[7 + payload.length] = 0xff;
  return output;
}

function encodeBytes(row) {
  const encoded = new Uint8Array(Math.ceil(row.length / 8));
  for (let start = 0; start < row.length; start += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8 && start + bit < row.length; bit += 1) if (row[start + bit]) byte |= 1 << bit;
    encoded[start >> 3] = byte;
  }
  return encoded;
}

function encodeRow(row) {
  // Match the supplied APK's V5G image path: fixed-width A2 bitmap rows.
  return command(0xa2, encodeBytes(row));
}

export function buildMx10PrintJob(rows, settings = {}) {
  const { paperMode, darkness, startFeedMm, tearFeedMm } = normalizeMx10PrintSettings(settings);
  const { energy, quality, density } = IMAGE_DARKNESS[darkness];
  const parts = [
    command(0xf2, new Uint8Array([0x01, density])),
    command(0xa3, new Uint8Array([0x00])),
    command(0xa4, new Uint8Array([quality])),
    command(0xa6, new Uint8Array([0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c])),
    command(0xaf, new Uint8Array([energy & 0xff, (energy >> 8) & 0xff])),
    command(0xbe, new Uint8Array([0x00])),
    command(0xbd, new Uint8Array([MX10_IMAGE_PRINT_PROFILE.speed])),
  ];
  // Seat continuous stock before the first raster row, especially after tearing.
  // This is a forward feed, separate from the QR's required white border.
  if (paperMode === 'continuous' && startFeedMm > 0) {
    const startDots = startFeedMm * PRINTER.dotsPerMm;
    parts.push(command(0xa1, new Uint8Array([startDots & 0xff, (startDots >> 8) & 0xff])));
  }
  for (const row of rows) {
    if (row.length !== PRINTER.width) throw new Error('MX10 print rows must be 384 dots wide.');
    parts.push(encodeRow(row));
  }
  parts.push(command(0xbd, new Uint8Array([MX10_IMAGE_PRINT_PROFILE.endSpeed])));
  // Clear the tear edge on continuous stock without searching for a sticker gap.
  const feedDots = paperMode === 'gapped' ? 48 : tearFeedMm * PRINTER.dotsPerMm;
  if (feedDots > 0) parts.push(command(0xa1, new Uint8Array([feedDots & 0xff, (feedDots >> 8) & 0xff])));
  parts.push(command(0xa6, new Uint8Array([0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17])));
  parts.push(command(0xa3, new Uint8Array([0x00])));
  const job = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { job.set(part, offset); offset += part.length; }
  return job;
}

function appendBytes(...parts) {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

function positionLabelCommand() {
  let threshold = 0x0199;
  try {
    const stored = localStorage.getItem(SENSOR_THRESHOLD_KEY);
    if (stored !== null && stored.trim() !== '') {
      const saved = Number(stored);
      if (Number.isInteger(saved) && saved >= 0 && saved <= 0xffff) threshold = saved;
    }
  } catch { /* Keep the MX10/V5G default when storage is unavailable. */ }
  const sensorPayload = new Uint8Array([(threshold >> 8) & 0xff, threshold & 0xff, 0x20]);
  return command(0xf0, sensorPayload);
}

const SENSOR_SEARCH_STEP = appendBytes(
  command(0xa1, new Uint8Array([0x04, 0x00])),
  command(0xa3, new Uint8Array([0x00])),
);

const FLOW_CONTROL_TIMEOUT_MS = 15000;

function loadImage(svg, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not prepare the label image. Download the PNG and try again.'));
    const root = svg.match(/^<svg\b[^>]*>/)?.[0];
    if (!root) { reject(new Error('Could not prepare the label image. Download the PNG and try again.')); return; }
    const printerSizedRoot = root
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '')
      .replace(/>$/, ` width="${width}px" height="${height}px">`);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(root, printerSizedRoot))}`;
  });
}

export function paintQrMatrix(context, qrMatrix, qrGeometry, width, height) {
  const size = Number(qrMatrix?.size), data = qrMatrix?.data, margin = Number(qrMatrix?.margin ?? 4);
  const x = Number(qrGeometry?.x), y = Number(qrGeometry?.y), boxSize = Number(qrGeometry?.size);
  if (!Number.isInteger(size) || size < 1 || !data || data.length !== size * size || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(boxSize) || boxSize <= 0 || !Number.isInteger(margin) || margin < 4) return false;
  const scaleX = width / 500, scaleY = height / 300;
  const left = Math.floor(x * scaleX), top = Math.floor(y * scaleY);
  const boxWidth = Math.ceil((x + boxSize) * scaleX) - left, boxHeight = Math.ceil((y + boxSize) * scaleY) - top;
  const moduleCount = size + margin * 2, moduleSize = Math.floor(Math.min(boxWidth, boxHeight) / moduleCount);
  if (moduleSize < 1) throw new Error('This QR code is too detailed for the label.');
  const qrLeft = left + Math.floor((boxWidth - moduleCount * moduleSize) / 2);
  const qrTop = top + (qrGeometry.alignY === 'start' ? 0 : Math.floor((boxHeight - moduleCount * moduleSize) / 2));
  context.fillStyle = '#fff'; context.fillRect(left, top, boxWidth, boxHeight);
  context.fillStyle = '#000';
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
    if (Number(data[row * size + column]) !== 1) continue;
    context.fillRect(qrLeft + (column + margin) * moduleSize, qrTop + (row + margin) * moduleSize, moduleSize, moduleSize);
  }
  return true;
}

export function normalizeMx10LabelCalibration(calibration = {}, printImage = {}) {
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  let offsetX = finite(calibration.offsetX), offsetY = finite(calibration.offsetY);
  const { x, y, size } = printImage.qrGeometry || {};
  if ([x, y, size].every(Number.isFinite) && size > 0) {
    // Bound the complete QR box, including its quiet zone. Saved negative
    // offsets must never clip its first rows in preview, PNG, or direct print.
    const left = Math.floor(x * PRINTER.width / 500), right = Math.ceil((x + size) * PRINTER.width / 500);
    const top = Math.floor(y * 240 / 300), bottom = Math.ceil((y + size) * 240 / 300);
    const bounded = (value, lower, upper) => Math.max(Math.ceil(lower * 2) / 2, Math.min(Math.floor(upper * 2) / 2, value));
    offsetX = bounded(offsetX, -left / PRINTER.dotsPerMm, (PRINTER.width - right) / PRINTER.dotsPerMm);
    offsetY = bounded(offsetY, -top / PRINTER.dotsPerMm, (240 - bottom) / PRINTER.dotsPerMm);
  }
  return { ...calibration, offsetX: offsetX || 0, offsetY: offsetY || 0 };
}

async function rasterizeLabel(svg, calibration, printImage = {}) {
  calibration = normalizeMx10LabelCalibration(calibration, printImage);
  const width = PRINTER.width;
  const height = 30 * PRINTER.dotsPerMm;
  const image = await loadImage(svg, width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not prepare the print image.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  context.translate(Number(calibration.offsetX || 0) * PRINTER.dotsPerMm, Number(calibration.offsetY || 0) * PRINTER.dotsPerMm);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  paintQrMatrix(context,printImage.qrMatrix,printImage.qrGeometry,width,height);
  context.restore();

  const pixels = context.getImageData(0, 0, width, height).data;
  const rows = new Array(height);
  for (let y = 0; y < height; y += 1) {
    const row = new Uint8Array(width);
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const pixel = rowStart + x * 4;
      const luminance = pixels[pixel] * 0.2126 + pixels[pixel + 1] * 0.7152 + pixels[pixel + 2] * 0.0722;
      row[x] = pixels[pixel + 3] > 100 && luminance < 175 ? 1 : 0;
    }
    rows[y] = row;
  }
  return { rows, height };
}

export async function renderLabelPng(svg, calibration = {}, printImage = {}) {
  const raster = await rasterizeLabel(svg, calibration, printImage);
  const canvas = document.createElement('canvas');
  canvas.width = PRINTER.width;
  canvas.height = raster.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the PNG label.');
  const image = context.createImageData(PRINTER.width, raster.height);
  for (let y = 0; y < raster.height; y += 1) {
    const row = raster.rows[y];
    for (let x = 0; x < PRINTER.width; x += 1) {
      const offset = (y * PRINTER.width + x) * 4;
      const value = row[x] ? 0 : 255;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the PNG label.')), 'image/png'));
}

async function getWritableCharacteristic(server) {
  for (const serviceUuid of [PRINTER.primaryService, PRINTER.alternateService]) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      const characteristic = await service.getCharacteristic(PRINTER.txCharacteristic);
      if (characteristic.properties.writeWithoutResponse || characteristic.properties.write) return { service, characteristic };
    } catch { /* Try the MX10 sibling service UUID. */ }
  }
  throw new Error('The selected device did not expose the MX10 print service. Choose MX10 in the Bluetooth picker.');
}

export function createMx10Printer() {
  let device = null;
  let txCharacteristic = null;
  let rxCharacteristic = null;
  let connecting = false;
  let reconnecting = false;
  let reconnectWanted = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let connectionGeneration = 0;
  let printing = false;
  let sensorSearching = false;
  let aligning = false;
  let progress = 0;
  let sensorProgress = 0;
  let paperOut = null;
  let printerWarning = '';
  let headHot = false;
  let sensorScan = null;
  let sensorCalibrationValid = false;
  let activePrintJob = null;
  let flowPaused = false;
  let pendingStatusQuery = null;
  let rxBuffer = [];
  let advertisementListener = null;
  const listeners = new Set();

  const status = () => ({
    connected: Boolean(device?.gatt?.connected && txCharacteristic),
    name: device?.name || 'MX10',
    connecting,
    reconnecting,
    printing,
    sensorSearching,
    sensorProgress,
    aligning,
    progress,
    paperOut,
    printerWarning,
    canCalibrate: Boolean(rxCharacteristic?.properties.notify || rxCharacteristic?.properties.indicate),
    sensorCalibrated: sensorCalibrationValid && hasSavedSensorThreshold(),
  });
  const notify = () => { const current = status(); listeners.forEach(listener => listener(current)); };

  function hasSavedSensorThreshold() {
    try {
      const stored = localStorage.getItem(SENSOR_THRESHOLD_KEY);
      if (stored === null || stored.trim() === '') return false;
      const saved = Number(stored);
      return Number.isInteger(saved) && saved >= 0 && saved <= 0xffff;
    } catch { return false; }
  }

  function connected() {
    return Boolean(device?.gatt?.connected && txCharacteristic);
  }

  function saveDeviceId(selected) {
    if (!selected?.id) return;
    try { localStorage.setItem(SAVED_DEVICE_ID_KEY, selected.id); } catch { /* Reconnection can still work for this page session. */ }
  }

  function clearSavedDeviceId() {
    try { localStorage.removeItem(SAVED_DEVICE_ID_KEY); } catch { /* Keep the active page session usable if storage is blocked. */ }
  }

  function watchDeviceAdvertisements(selected) {
    if (typeof selected?.watchAdvertisements !== 'function') return;
    advertisementListener = () => {
      if (!reconnectWanted || device !== selected || connected() || connecting) return;
      clearReconnectTimer();
      void reconnectSelectedDevice();
    };
    selected.addEventListener('advertisementreceived', advertisementListener);
    try {
      Promise.resolve(selected.watchAdvertisements()).catch(() => { /* GATT retry remains as a browser-compatible fallback. */ });
    } catch { /* GATT retry remains as a browser-compatible fallback. */ }
  }

  function stopWatchingAdvertisements(selected) {
    if (!selected || !advertisementListener) return;
    selected.removeEventListener('advertisementreceived', advertisementListener);
    advertisementListener = null;
    if (typeof selected.unwatchAdvertisements === 'function') {
      try { Promise.resolve(selected.unwatchAdvertisements()).catch(() => {}); } catch { /* The disconnect should still complete. */ }
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function scheduleReconnect() {
    if (!reconnectWanted || !device || reconnectTimer !== null) return;
    const delayMs = Math.min(RECONNECT_INITIAL_DELAY_MS * (2 ** Math.min(reconnectAttempts, 4)), RECONNECT_MAX_DELAY_MS);
    reconnectAttempts += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void reconnectSelectedDevice();
    }, delayMs);
  }

  async function attachSelectedDevice(selected) {
    const server = await selected.gatt.connect();
    if (device !== selected || !reconnectWanted) {
      selected.gatt.disconnect();
      return false;
    }
    const found = await getWritableCharacteristic(server);
    if (device !== selected || !reconnectWanted) {
      selected.gatt.disconnect();
      return false;
    }
    txCharacteristic = found.characteristic;
    flowPaused = false;
    headHot = false;
    try {
      rxCharacteristic = await found.service.getCharacteristic(PRINTER.rxCharacteristic);
      if (rxCharacteristic.properties.notify || rxCharacteristic.properties.indicate) {
        rxCharacteristic.addEventListener('characteristicvaluechanged', handleNotification);
        await rxCharacteristic.startNotifications();
      }
    } catch {
      rxCharacteristic?.removeEventListener('characteristicvaluechanged', handleNotification);
      rxCharacteristic = null;
    }
    return true;
  }

  async function reconnectSelectedDevice() {
    if (!reconnectWanted || !device || connected() || connecting) return;
    const selected = device;
    connecting = true;
    reconnecting = true;
    notify();
    try {
      const attached = await attachSelectedDevice(selected);
      if (!attached) return;
      reconnectAttempts = 0;
      reconnecting = false;
      printerWarning = '';
      paperOut = null;
    } catch (error) {
      txCharacteristic = null;
      rxCharacteristic = null;
      if (device !== selected || !reconnectWanted) return;
      if (error?.message?.includes('did not expose the MX10 print service')) {
        reconnectWanted = false;
        reconnecting = false;
        clearSavedDeviceId();
        selected.removeEventListener('gattserverdisconnected', handleDisconnect);
        stopWatchingAdvertisements(selected);
        if (selected.gatt?.connected) selected.gatt.disconnect();
        device = null;
        printerWarning = error.message;
      } else {
        reconnecting = true;
        scheduleReconnect();
      }
    } finally {
      connecting = false;
      notify();
    }
  }

  async function disconnect() {
    if (printing || sensorSearching || aligning) return { disconnected: false, permissionForgotten: false };
    connectionGeneration += 1;
    reconnectWanted = false;
    reconnecting = false;
    connecting = false;
    reconnectAttempts = 0;
    clearReconnectTimer();
    const selected = device;
    const wasConnected = Boolean(selected?.gatt?.connected);
    if (selected) {
      selected.removeEventListener('gattserverdisconnected', handleDisconnect);
      stopWatchingAdvertisements(selected);
      if (rxCharacteristic) rxCharacteristic.removeEventListener('characteristicvaluechanged', handleNotification);
      if (selected.gatt?.connected) selected.gatt.disconnect();
    }
    device = null;
    txCharacteristic = null;
    rxCharacteristic = null;
    rxBuffer = [];
    flowPaused = false;
    clearSavedDeviceId();
    notify();
    return { disconnected: wasConnected, permissionForgotten: false };
  }

  async function restoreSavedDevice() {
    let savedId = '';
    try { savedId = localStorage.getItem(SAVED_DEVICE_ID_KEY) || ''; } catch { /* The granted-device fallback can still restore this session. */ }
    if (typeof navigator === 'undefined' || !navigator.bluetooth || typeof navigator.bluetooth.getDevices !== 'function' || device || connecting) return;
    connecting = true;
    reconnecting = true;
    notify();
    try {
      const grantedDevices = await navigator.bluetooth.getDevices();
      const selected = grantedDevices.find(candidate => candidate.id === savedId)
        || (() => {
          const mx10Devices = grantedDevices.filter(candidate => candidate.name?.startsWith('MX10'));
          return mx10Devices.length === 1 ? mx10Devices[0] : null;
        })();
      if (!selected || device) {
        reconnecting = false;
        return;
      }
      device = selected;
      reconnectWanted = true;
      reconnectAttempts = 0;
      sensorCalibrationValid = hasSavedSensorThreshold();
      saveDeviceId(selected);
      selected.addEventListener('gattserverdisconnected', handleDisconnect);
      watchDeviceAdvertisements(selected);
      connecting = false;
      reconnecting = true;
      notify();
      await reconnectSelectedDevice();
    } catch {
      reconnecting = false;
    } finally {
      if (connecting) connecting = false;
      notify();
    }
  }

  async function writeBytes(bytes, onProgress, { isStatusQuery = false } = {}) {
    if (!connected()) throw new Error('Connect your MX10 before sending printer commands.');
    const characteristic = txCharacteristic;
    const withResponse = characteristic.properties.write && typeof characteristic.writeValueWithResponse === 'function';
    const withoutResponse = characteristic.properties.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function';
    if (!withoutResponse && !withResponse) throw new Error('The MX10 print channel is not writable in this browser. Try current Chrome on Android.');
    const hasFlowControl = Boolean(rxCharacteristic?.properties.notify || rxCharacteristic?.properties.indicate);
    const totalChunks = Math.ceil(bytes.length / PRINTER.chunkSize);
    for (let index = 0, offset = 0; offset < bytes.length; index += 1, offset += PRINTER.chunkSize) {
      if (printing && !isStatusQuery && paperOut) throw new Error('The MX10 reports that it ran out of paper. Reload the roll before retrying.');
      if (printing && !isStatusQuery && headHot) throw new Error(printerWarning);
      const pauseStarted = Date.now();
      while (printing && !isStatusQuery && flowPaused) {
        if (!connected()) throw new Error('Bluetooth disconnected while the printer was busy.');
        if (paperOut) throw new Error('The MX10 reports that it ran out of paper. Reload the roll before retrying.');
        if (headHot) throw new Error(printerWarning);
        if (Date.now() - pauseStarted >= FLOW_CONTROL_TIMEOUT_MS) throw new Error('The printer stayed busy for too long. Check the paper and try again.');
        await delay(20);
      }
      const packet = bytes.slice(offset, Math.min(offset + PRINTER.chunkSize, bytes.length));
      // Await each BLE write; the printer's AE notifications provide backpressure.
      // A fixed sleep after every packet starves the raster buffer and makes the motor stop.
      if (withoutResponse) await characteristic.writeValueWithoutResponse(packet);
      else await characteristic.writeValueWithResponse(packet);
      if (withoutResponse && !hasFlowControl) await delay(MX10_IMAGE_PRINT_PROFILE.fallbackPacketDelayMs);
      onProgress?.(Math.floor(((index + 1) / totalChunks) * 100));
      if (!connected()) throw new Error('Bluetooth disconnected before the printer command finished.');
    }
  }

  function settleStatusQuery(value) {
    if (!pendingStatusQuery) return;
    const pending = pendingStatusQuery;
    pendingStatusQuery = null;
    window.clearTimeout(pending.timer);
    pending.resolve(value);
  }

  function failSensorScan(error) {
    if (!sensorScan) return;
    const scan = sensorScan;
    sensorScan = null;
    window.clearTimeout(scan.timeout);
    sensorCalibrationValid = false;
    try { localStorage.removeItem(SENSOR_THRESHOLD_KEY); } catch { /* The MX10 default remains available if storage is blocked. */ }
    sensorSearching = false;
    sensorProgress = 0;
    notify();
    scan.reject(error);
  }

  function saveSensorThreshold(value) {
    try { localStorage.setItem(SENSOR_THRESHOLD_KEY, String(value)); } catch { /* The current session can still use the learned value. */ }
    return value;
  }

  function triggerPrintAlignment(job) {
    if (!job?.dataSent || job.alignmentPromise) return job?.alignmentPromise || Promise.resolve(false);
    if (paperOut) {
      const error = new Error('The MX10 reports that it is out of paper, so it cannot align the next label.');
      job.rejectAlignment?.(error);
      return Promise.reject(error);
    }
    if (job.timer) window.clearTimeout(job.timer);
    aligning = true;
    notify();
    job.alignmentPromise = writeBytes(positionLabelCommand()).then(() => delay(LABEL_POSITION_SETTLE_MS)).then(() => {
      if (!connected()) throw new Error('Bluetooth disconnected before label positioning finished.');
      job.alignmentMethod = 'sensor';
      job.resolveAlignment?.({ method: job.alignmentMethod });
      return true;
    }).catch(error => {
      job.rejectAlignment?.(error);
      throw error;
    }).finally(() => {
      aligning = false;
      notify();
    });
    return job.alignmentPromise;
  }

  function processSensorReading(value) {
    const scan = sensorScan;
    if (!scan) return;
    scan.samples.push(value);
    scan.distance += 1;
    sensorProgress = Math.min(99, Math.floor(scan.distance / SENSOR_SEARCH_LIMIT * 100));

    const recent = scan.samples.slice(-SENSOR_SAMPLE_WINDOW);
    if (recent.length === SENSOR_SAMPLE_WINDOW) {
      const average = Math.floor(recent.reduce((sum, sample) => sum + sample, 0) / SENSOR_SAMPLE_WINDOW);
      const deviation = Math.sqrt(recent.reduce((sum, sample) => sum + ((average - sample) ** 2), 0) / SENSOR_SAMPLE_WINDOW);
      if (deviation >= 60) {
        const threshold = saveSensorThreshold(average);
        sensorCalibrationValid = true;
        sensorScan = null;
        window.clearTimeout(scan.timeout);
        sensorSearching = false;
        sensorProgress = 100;
        notify();
        scan.resolve({ threshold, calibrated: true });
        return;
      }
    }

    if (scan.distance >= SENSOR_SEARCH_LIMIT) {
      const minimum = Math.min(...scan.samples);
      const maximum = Math.max(...scan.samples);
      failSensorScan(new Error(`The MX10 did not detect a sticker gap after ${scan.samples.length} sensor readings (range ${minimum}–${maximum}). Check that the labels are loaded straight, then try calibration again.`));
      return;
    }

    notify();
    window.setTimeout(() => {
      if (sensorScan !== scan) return;
      writeBytes(SENSOR_SEARCH_STEP).catch(error => failSensorScan(error));
    }, 50);
  }

  function applyPrinterStatus(code) {
    if (code === 0x00) { paperOut = false; headHot = false; printerWarning = ''; }
    else if (code === 0x01 || code === 0x09) { paperOut = true; printerWarning = 'The MX10 reports that it is out of paper.'; }
    else if (code === 0x04 || code === 0xd2) { headHot = true; printerWarning = 'The MX10 reports that its print head is too hot. Let it cool before printing again.'; }
    else if (code === 0x08) { printerWarning = 'The MX10 reports low power.'; }
    if (pendingStatusQuery) settleStatusQuery({ code, paperOut, warning: printerWarning });
    if (paperOut && sensorScan) failSensorScan(new Error('The MX10 reports that it is out of paper. Reload the label roll, then calibrate again.'));
    notify();
  }

  function handleFrame(frame) {
    if (frame.length === 11 && sensorScan) {
      processSensorReading((frame[7] << 8) | frame[8]);
      return;
    }
    if (frame.length < 9) return;
    const opcode = frame[2];
    if (opcode === 0xa3) applyPrinterStatus(frame[6]);
    // AE is buffer flow control. A resume notification does not mean the paper is finished.
    if (opcode === 0xae) flowPaused = frame[6] === 0x10;
  }

  function handleNotification(event) {
    const data = event.target.value;
    const incoming = Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    rxBuffer.push(...incoming);
    while (rxBuffer.length >= 2) {
      let start = -1;
      for (let index = 0; index < rxBuffer.length - 1; index += 1) {
        if (rxBuffer[index] === 0x51 && rxBuffer[index + 1] === 0x78) { start = index; break; }
      }
      if (start < 0) { rxBuffer = rxBuffer.slice(-1); break; }
      if (start > 0) rxBuffer = rxBuffer.slice(start);
      if (rxBuffer.length < 5) break;
      const frameLength = 8 + rxBuffer[4];
      if (frameLength < 9 || frameLength > 263) { rxBuffer.shift(); continue; }
      if (rxBuffer.length < frameLength) break;
      if (rxBuffer[frameLength - 1] !== 0xff) { rxBuffer.shift(); continue; }
      handleFrame(rxBuffer.slice(0, frameLength));
      rxBuffer = rxBuffer.slice(frameLength);
    }
  }

  const handleDisconnect = () => {
    if (rxCharacteristic) rxCharacteristic.removeEventListener('characteristicvaluechanged', handleNotification);
    txCharacteristic = null;
    rxCharacteristic = null;
    rxBuffer = [];
    flowPaused = false;
    if (sensorScan) failSensorScan(new Error('Bluetooth disconnected during label calibration.'));
    if (pendingStatusQuery) settleStatusQuery(null);
    if (activePrintJob?.rejectAlignment) activePrintJob.rejectAlignment(new Error('Bluetooth disconnected before printing finished.'));
    reconnecting = Boolean(reconnectWanted && device);
    if (reconnecting) scheduleReconnect();
    notify();
  };

  async function refreshPrinterStatus(timeoutMs = 900) {
    if (!connected() || !(rxCharacteristic?.properties.notify || rxCharacteristic?.properties.indicate)) return null;
    const response = new Promise(resolve => {
      const timer = window.setTimeout(() => {
        if (pendingStatusQuery?.resolve === resolve) pendingStatusQuery = null;
        resolve(null);
      }, timeoutMs);
      pendingStatusQuery = { resolve, timer };
    });
    try { await writeBytes(command(0xa3, new Uint8Array([0x00])), undefined, { isStatusQuery: true }); }
    catch (error) { settleStatusQuery(null); throw error; }
    return response;
  }

  async function calibrateLabel() {
    if (!connected()) throw new Error('Connect your MX10 before calibrating labels.');
    if (!(rxCharacteristic?.properties.notify || rxCharacteristic?.properties.indicate)) throw new Error('This MX10 connection does not expose label-sensor notifications, so automatic calibration is unavailable.');
    if (printing || sensorScan) throw new Error('Wait for the current printer operation to finish.');
    await refreshPrinterStatus();
    if (paperOut) throw new Error('The MX10 reports that it is out of paper. Reload the label roll before calibrating.');
    paperOut = null;
    printerWarning = '';
    sensorCalibrationValid = false;
    sensorSearching = true;
    sensorProgress = 0;
    notify();
    return new Promise((resolve, reject) => {
      const scan = { distance: 0, samples: [], resolve, reject, timeout: window.setTimeout(() => failSensorScan(new Error('No label-sensor response arrived. Check the label roll and Bluetooth connection.')), 15000) };
      sensorScan = scan;
      writeBytes(SENSOR_SEARCH_STEP).catch(error => failSensorScan(error));
    });
  }

  async function connect() {
    if (device) return disconnect();
    if (!window.isSecureContext) throw new Error('Bluetooth needs a secure HTTPS page. Open this web app over HTTPS in Edge or Chrome on Windows, or Chrome on Android.');
    if (!navigator.bluetooth) throw new Error('This browser does not provide Web Bluetooth. Open this web app in Edge or Chrome on Windows, or Chrome on Android.');
    const generation = ++connectionGeneration;
    connecting = true;
    paperOut = null;
    printerWarning = '';
    sensorCalibrationValid = hasSavedSensorThreshold();
    notify();
    try {
      const selected = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'MX10' },
          { services: [PRINTER.primaryService] },
          { services: [PRINTER.alternateService] },
        ],
        optionalServices: [PRINTER.primaryService, PRINTER.alternateService],
      });
      if (generation !== connectionGeneration) {
        return { cancelled: true };
      }
      device = selected;
      reconnectWanted = true;
      reconnectAttempts = 0;
      saveDeviceId(selected);
      device.addEventListener('gattserverdisconnected', handleDisconnect);
      watchDeviceAdvertisements(selected);
      try {
        const attached = await attachSelectedDevice(selected);
        if (!attached || generation !== connectionGeneration) return { cancelled: true };
        reconnecting = false;
        return { connected: true };
      } catch (error) {
        if (generation !== connectionGeneration || !reconnectWanted || device !== selected) return { cancelled: true };
        txCharacteristic = null;
        rxCharacteristic = null;
        if (error?.message?.includes('did not expose the MX10 print service')) {
          reconnectWanted = false;
          reconnecting = false;
          clearReconnectTimer();
          selected.removeEventListener('gattserverdisconnected', handleDisconnect);
          stopWatchingAdvertisements(selected);
          if (selected.gatt?.connected) selected.gatt.disconnect();
          device = null;
          clearSavedDeviceId();
          throw error;
        }
        reconnecting = true;
        scheduleReconnect();
        return { reconnecting: true };
      }
    } catch (error) {
      if (generation !== connectionGeneration) return { cancelled: true };
      if (error?.name === 'NotFoundError') throw new Error('No printer was selected. Turn on the MX10, then choose it in the browser picker.');
      if (error?.name === 'SecurityError') throw new Error('Bluetooth access was blocked. Open this page in Edge or Chrome over HTTPS and allow the device request.');
      if (error?.name !== 'AbortError' && error?.message) throw new Error(`${error.message} If the MX10 app is connected, close it and try again.`);
      throw error;
    } finally {
      if (generation === connectionGeneration) {
        connecting = false;
        notify();
      }
    }
  }

  void restoreSavedDevice();

  async function printLabel(svg, calibration = {}, printImage = {}, settings = {}) {
    if (!connected()) throw new Error('Connect your MX10 before printing.');
    if (printing || sensorSearching) throw new Error('Wait for the current printer operation to finish.');
    const { paperMode, darkness, startFeedMm, tearFeedMm } = normalizeMx10PrintSettings(settings);
    const profile = IMAGE_DARKNESS[darkness];
    printing = true;
    progress = 0;
    const printJob = { dataSent: false, timer: null, alignmentPromise: null, resolveAlignment: null, rejectAlignment: null };
    activePrintJob = printJob;
    notify();
    try {
      if (rxCharacteristic?.properties.notify || rxCharacteristic?.properties.indicate) await refreshPrinterStatus();
      if (paperOut) throw new Error('The MX10 reports that it is out of paper. Reload the label roll before printing.');
      if (headHot) throw new Error(printerWarning);
      const raster = await rasterizeLabel(svg, calibration, printImage);
      const job = buildMx10PrintJob(raster.rows, { paperMode, darkness, startFeedMm, tearFeedMm });
      await writeBytes(job, sent => {
        const changed = sent !== progress;
        progress = sent;
        if (changed && (progress === 100 || progress % 5 === 0)) notify();
      });
      printJob.dataSent = true;
      notify();
      const alignment = await new Promise((resolve, reject) => {
        printJob.resolveAlignment = resolve;
        printJob.rejectAlignment = reject;
        printJob.timer = window.setTimeout(() => {
          if (paperMode === 'continuous') resolve({ method: 'continuous' });
          else triggerPrintAlignment(printJob).catch(() => {});
        }, LABEL_POSITION_FALLBACK_MS);
      });
      if (!connected()) throw new Error('Bluetooth disconnected before printing finished.');
      if (paperOut) throw new Error('The MX10 reports that it ran out of paper while printing. Reload the roll before retrying.');
      if (headHot) throw new Error(printerWarning);
      return { height: raster.height, lengthMm: raster.height / PRINTER.dotsPerMm, paperMode, darkness, startFeedMm: paperMode === 'continuous' ? startFeedMm : 0, tearFeedMm: paperMode === 'continuous' ? tearFeedMm : 0, totalLengthMm: paperMode === 'continuous' ? startFeedMm + raster.height / PRINTER.dotsPerMm + tearFeedMm : null, labelGapMm: paperMode === 'continuous' ? 0 : Number(calibration.gap ?? 10), energy: profile.energy, density: profile.density, aligned: paperMode === 'gapped', alignmentMethod: alignment.method };
    } finally {
      if (printJob.timer) window.clearTimeout(printJob.timer);
      if (activePrintJob === printJob) activePrintJob = null;
      printing = false;
      aligning = false;
      notify();
    }
  }

  return {
    status,
    connect,
    disconnect,
    printLabel,
    calibrateLabel,
    refreshPrinterStatus,
    subscribe(listener) { listeners.add(listener); listener(status()); return () => listeners.delete(listener); },
  };
}
