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
  quality: 0x34,
  density: 130, // Fun Print's 0D high image-density preset for MX10.
  // Match the older working web printer's 70% heat setting; the lower preset printed QR labels faintly.
  energy: 45874,
  speed: 10,
  endSpeed: 25,
  packetDelayMs: 20, // Space no-response BLE writes to avoid losing raster data.
});

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

function encodeRun(row) {
  const bytes = [];
  let previous = -1;
  let count = 0;
  const flush = () => {
    while (count > 0x7f) {
      bytes.push(0x7f | ((previous & 1) << 7));
      count -= 0x7f;
    }
    if (count) bytes.push(count | ((previous & 1) << 7));
  };
  for (const pixel of row) {
    const bit = pixel ? 1 : 0;
    if (bit === previous) count += 1;
    else { flush(); previous = bit; count = 1; }
  }
  flush();
  return new Uint8Array(bytes);
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
  const runLength = encodeRun(row);
  const payload = runLength.length <= Math.ceil(PRINTER.width / 8) ? runLength : encodeBytes(row);
  return command(runLength.length <= Math.ceil(PRINTER.width / 8) ? 0xbf : 0xa2, payload);
}

function imageDensityCommand() {
  const payload = new Uint8Array([0x01, MX10_IMAGE_PRINT_PROFILE.density]);
  // Fun Print's MX10/V5G driver sends only the checksum byte in this density command.
  return new Uint8Array([0x51, 0x78, 0xf2, 0x00, 0x02, 0x00, crc8(payload), 0xff]);
}

function buildPrintJob(rows) {
  const energy = MX10_IMAGE_PRINT_PROFILE.energy;
  const parts = [
    imageDensityCommand(),
    command(0xa3, new Uint8Array([0x00])),
    command(0xa4, new Uint8Array([MX10_IMAGE_PRINT_PROFILE.quality])),
    command(0xa6, new Uint8Array([0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c])),
    command(0xaf, new Uint8Array([(energy >> 8) & 0xff, energy & 0xff])),
    command(0xbe, new Uint8Array([0x01])),
    command(0xbd, new Uint8Array([MX10_IMAGE_PRINT_PROFILE.speed])),
  ];
  for (const row of rows) parts.push(encodeRow(row));
  parts.push(command(0xbd, new Uint8Array([MX10_IMAGE_PRINT_PROFILE.endSpeed])));
  parts.push(command(0xa1, new Uint8Array([0x00, 0x30])));
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
  // Fun Print's V5G driver sends only the CRC byte in this firmware positioning command.
  return new Uint8Array([0x51, 0x78, 0xf0, 0x00, 0x03, 0x00, crc8(sensorPayload), 0xff]);
}

const SENSOR_SEARCH_STEP = appendBytes(
  command(0xa1, new Uint8Array([0x04, 0x00])),
  command(0xa3, new Uint8Array([0x00])),
);

const PRINT_COMPLETE_FRAME = new Uint8Array([0x51, 0x78, 0xae, 0x01, 0x01, 0x00, 0x00, 0x00, 0xff]);

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

function paintQrMatrix(context, qrMatrix, qrGeometry, width, height) {
  const size=Number(qrMatrix?.size),data=qrMatrix?.data,margin=Number(qrMatrix?.margin??4);
  const x=Number(qrGeometry?.x),y=Number(qrGeometry?.y),boxSize=Number(qrGeometry?.size);
  if(!Number.isInteger(size)||size<1||!data||data.length!==size*size||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(boxSize)||boxSize<=0||!Number.isInteger(margin)||margin<0)return false;
  const scaleX=width/500,scaleY=height/300,left=x*scaleX,top=y*scaleY,qrSize=boxSize*scaleX,moduleCount=size+margin*2,moduleSize=qrSize/moduleCount;
  context.fillStyle='#fff';context.fillRect(left,top,qrSize,qrSize);
  context.fillStyle='#000';
  for(let row=0;row<size;row++)for(let column=0;column<size;column++){
    if(Number(data[row*size+column])!==1)continue;
    const leftDot=Math.round(left+(column+margin)*moduleSize),rightDot=Math.round(left+(column+margin+1)*moduleSize);
    const topDot=Math.round(top+(row+margin)*moduleSize),bottomDot=Math.round(top+(row+margin+1)*moduleSize);
    context.fillRect(leftDot,topDot,rightDot-leftDot,bottomDot-topDot);
  }
  return true;
}

async function rasterizeLabel(svg, calibration, printImage = {}) {
  const width = PRINTER.width;
  const artworkScale = width / 50;
  const height = Math.round(30 * artworkScale);
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
  let sensorScan = null;
  let sensorCalibrationValid = false;
  let activePrintJob = null;
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

  async function writeBytes(bytes, onProgress, packetDelayMs = 7) {
    if (!connected()) throw new Error('Connect your MX10 before sending printer commands.');
    const characteristic = txCharacteristic;
    const withResponse = characteristic.properties.write && typeof characteristic.writeValueWithResponse === 'function';
    const withoutResponse = characteristic.properties.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function';
    if (!withoutResponse && !withResponse) throw new Error('The MX10 print channel is not writable in this browser. Try current Chrome on Android.');
    const totalChunks = Math.ceil(bytes.length / PRINTER.chunkSize);
    for (let index = 0, offset = 0; offset < bytes.length; index += 1, offset += PRINTER.chunkSize) {
      const packet = bytes.slice(offset, Math.min(offset + PRINTER.chunkSize, bytes.length));
      // The older working Rent & Play printer used paced write-without-response transfers.
      // MX10 image jobs contain many row commands; keep this path when the device supports it.
      if (withoutResponse) await characteristic.writeValueWithoutResponse(packet);
      else await characteristic.writeValueWithResponse(packet);
      if (withoutResponse) await delay(packetDelayMs);
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
    if (code === 0x00) { paperOut = false; printerWarning = ''; }
    else if (code === 0x01 || code === 0x09) { paperOut = true; printerWarning = 'The MX10 reports that it is out of paper.'; }
    else if (code === 0x04 || code === 0xd2) { printerWarning = 'The MX10 reports that its print head is too hot.'; }
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
    if (activePrintJob?.dataSent && frame.length === PRINT_COMPLETE_FRAME.length && frame.every((value, index) => value === PRINT_COMPLETE_FRAME[index])) {
      triggerPrintAlignment(activePrintJob).catch(() => {});
    }
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
    if (sensorScan) failSensorScan(new Error('Bluetooth disconnected during label calibration.'));
    if (pendingStatusQuery) settleStatusQuery(null);
    if (activePrintJob?.rejectAlignment) activePrintJob.rejectAlignment(new Error('Bluetooth disconnected before the MX10 aligned the next label.'));
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
    try { await writeBytes(command(0xa3, new Uint8Array([0x00]))); }
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

  async function printLabel(svg, calibration = {}, printImage = {}) {
    if (!connected()) throw new Error('Connect your MX10 before printing.');
    if (printing || sensorSearching) throw new Error('Wait for the current printer operation to finish.');
    if (rxCharacteristic?.properties.notify || rxCharacteristic?.properties.indicate) await refreshPrinterStatus();
    if (paperOut) throw new Error('The MX10 reports that it is out of paper. Reload the label roll before printing.');
    const raster = await rasterizeLabel(svg, calibration, printImage);
    const rows = raster.rows;
    const job = buildPrintJob(rows);
    const totalChunks = Math.ceil(job.length / PRINTER.chunkSize);
    printing = true;
    progress = 0;
    const printJob = { dataSent: false, timer: null, alignmentPromise: null, resolveAlignment: null, rejectAlignment: null };
    activePrintJob = printJob;
    notify();
    try {
      for (let index = 0, offset = 0; offset < job.length; index += 1, offset += PRINTER.chunkSize) {
        if (paperOut) throw new Error('The MX10 reports that it ran out of paper while printing. Reload the label roll before retrying.');
        const packet = job.slice(offset, Math.min(offset + PRINTER.chunkSize, job.length));
        await writeBytes(packet, undefined, MX10_IMAGE_PRINT_PROFILE.packetDelayMs);
        progress = Math.floor(((index + 1) / totalChunks) * 100);
        if (progress === 100 || progress % 5 === 0) notify();
      }
      printJob.dataSent = true;
      notify();
      const alignment = await new Promise((resolve, reject) => {
        printJob.resolveAlignment = resolve;
        printJob.rejectAlignment = reject;
        printJob.timer = window.setTimeout(() => triggerPrintAlignment(printJob).catch(() => {}), LABEL_POSITION_FALLBACK_MS);
      });
      return { height: raster.height, labelGapMm: Number(calibration.gap ?? 10), energy: MX10_IMAGE_PRINT_PROFILE.energy, density: MX10_IMAGE_PRINT_PROFILE.density, aligned: true, alignmentMethod: alignment?.method || printJob.alignmentMethod || 'sensor' };
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
