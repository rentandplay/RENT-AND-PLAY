let decoderPromise;
function loadDecoder() {
  if (typeof globalThis.jsQR === 'function') return Promise.resolve(globalThis.jsQR);
  decoderPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/public/vendor/jsQR.js';
    const fail = () => { clearTimeout(timeout); decoderPromise = null; script.remove(); reject(new Error('The QR reader could not load. Check your connection, then try again or enter the printed code.')); };
    const timeout = setTimeout(fail, 12000);
    script.onload = () => { if (typeof globalThis.jsQR !== 'function') { fail(); return; } clearTimeout(timeout); resolve(globalThis.jsQR); };
    script.onerror = fail;
    document.head.append(script);
  });
  return decoderPromise;
}

export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError: 'Camera permission was denied. Allow camera access in browser settings, then scan again or enter the printed code.',
    SecurityError: 'Camera access is blocked. Check this site’s camera permission or enter the printed code.',
    NotFoundError: 'No camera was found. Connect a camera or enter the printed equipment code.',
    NotReadableError: 'The camera is busy or unavailable. Close other apps using it, then scan again.',
    OverconstrainedError: 'This camera cannot use the requested settings. Try another camera or enter the printed code.',
    AbortError: 'The camera stopped starting. Scan again or enter the printed code.',
  };
  return messages[error?.name] || error?.message || 'Scanning failed. Restart the camera or enter the printed code.';
}

// Map the visible, object-fit: cover preview back to the actual camera pixels.
export function qrScanRegions(width, height, preview, target) {
  if (!preview?.width || !preview?.height || !target?.width || !target?.height) {
    const full = { x: 0, y: 0, width, height };
    return { target: full, visible: full };
  }
  const scale = Math.max(preview.width / width, preview.height / height);
  const offsetX = (preview.width - width * scale) / 2;
  const offsetY = (preview.height - height * scale) / 2;
  const region = (left, top, w, h) => {
    const x = Math.max(0, Math.floor((left - offsetX) / scale));
    const y = Math.max(0, Math.floor((top - offsetY) / scale));
    return { x, y, width: Math.max(1, Math.min(width - x, Math.ceil(w / scale))), height: Math.max(1, Math.min(height - y, Math.ceil(h / scale))) };
  };
  return {
    target: region(target.left - preview.left, target.top - preview.top, target.width, target.height),
    visible: region(0, 0, preview.width, preview.height),
  };
}

export function qrLightingFeedback(data, elapsed = 0) {
  let total = 0, count = 0, dark = 0, min = 255, max = 0;
  // Sample the target only, so the darkened visual overlay never affects this.
  for (let i = 0; i < data.length; i += 64) {
    const light = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    total += light; count++; dark += light < 50 ? 1 : 0; min = Math.min(min, light); max = Math.max(max, light);
  }
  if (count && (total / count < 45 || dark / count > .85)) return { state: 'warning', label: 'More light needed', message: 'The camera view is too dark. Add light to the printed label and avoid covering the camera.' };
  if (elapsed > 4000 && count && max - min < 35) return { state: 'warning', label: 'QR not clear yet', message: 'No clear QR pattern yet. Point at the printed QR, adjust the light, and tilt the label to reduce glare.' };
  if (elapsed > 7000) return { state: 'warning', label: 'Adjust distance and hold steady', message: 'No readable QR yet. Center the whole QR square and its white border, move closer or farther away, and hold steady. Check for faded or damaged print.' };
  return { state: 'scanning', label: 'Center the printed QR square', message: 'Scanning… Center the QR square and its white border inside the frame, then hold steady.' };
}

export function qrPositionFeedback(found, width, height) {
  const location = found?.location;
  if (!location) return null;
  const corners = ['topLeftCorner', 'topRightCorner', 'bottomLeftCorner', 'bottomRightCorner'].map(key => location[key]);
  if (corners.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  if (Math.abs(cx / width - .5) > .24 || Math.abs(cy / height - .5) > .24) return { state: 'warning', label: 'Move the QR to the center', message: 'QR detected near the edge. Move the QR square to the center of the frame and hold steady.' };
  if (Math.max((Math.max(...xs) - Math.min(...xs)) / width, (Math.max(...ys) - Math.min(...ys)) / height) < .18) return { state: 'warning', label: 'Move closer to the label', message: 'The QR is too small in the frame. Move closer while keeping the whole QR square visible.' };
  return null;
}

export function bindQrReaders(form, modal, { onCapture, validateCapture } = {}) {
  let stream, timer, video, frame, running = false, generation = 0, activeButton, activeOutput, buttonLabel, removeTrackListener;
  const stop = () => {
    generation++; running = false; clearTimeout(timer); removeTrackListener?.(); removeTrackListener = null;
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    if (video) { video.srcObject = null; video = null; }
    frame?.remove(); frame = null;
    activeOutput?.classList?.remove?.('is-scanning'); activeOutput?.removeAttribute?.('aria-busy'); activeOutput = null;
    if (activeButton) {
      activeButton.innerHTML = buttonLabel;
      activeButton.classList?.remove?.('is-scanning'); activeButton.removeAttribute?.('aria-pressed'); activeButton = null;
    }
  };
  modal.addEventListener?.('close', stop, { once: true });
  form.querySelectorAll('[data-scan-field]').forEach(button => button.onclick = async () => {
    const field = form.elements[button.dataset.scanField];
    if (button.disabled || !field || field.disabled) return;
    let output = form.querySelector(`[data-camera-status="${button.dataset.scanField}"]`) || form.querySelector('[data-camera-status]');
    if (!output) {
      output = document.createElement('p'); output.setAttribute('data-camera-status', button.dataset.scanField); button.after(output);
    }
    output.setAttribute?.('role', 'status'); output.setAttribute?.('aria-live', 'polite'); output.setAttribute?.('aria-atomic', 'true');
    const feedback = ({ state = 'scanning', message, label: caption }) => {
      if (output.textContent !== message) output.textContent = message;
      output.setAttribute?.('data-state', state); frame?.setAttribute?.('data-state', state);
      if (caption && label) label.textContent = caption;
    };
    let label;
    if (activeButton === button) { stop(); feedback({ state: 'idle', message: 'Camera stopped. Scan again or enter the printed code.' }); return; }
    stop(); const attempt = generation;
    const current = () => attempt === generation && form.isConnected && modal.open && !field.disabled;
    activeButton = button; activeOutput = output; buttonLabel = button.innerHTML;
    button.classList.add('is-scanning'); button.setAttribute('aria-pressed', 'true'); button.textContent = 'Stop camera';
    try {
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera scanning needs HTTPS or localhost. Use the secure site or enter the printed code.');
      feedback({ message: 'Starting camera…' });
      const decode = await loadDecoder();
      if (!current()) { if (attempt === generation) stop(); return; }
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
      if (!current()) { acquired.getTracks().forEach(track => track.stop()); if (attempt === generation) stop(); return; }
      stream = acquired; video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream; video.className = 'qr-camera-preview';
      frame = document.createElement('div'); frame.className = 'qr-scanner-frame'; frame.setAttribute('role', 'group'); frame.setAttribute('aria-label', 'Live camera preview. Center the printed QR square and white border in the frame.');
      const target = document.createElement('div'); target.className = 'qr-scanner-target'; target.setAttribute('aria-hidden', 'true');
      label = document.createElement('span'); label.className = 'qr-scanner-label'; label.setAttribute('aria-hidden', 'true');
      frame.append(video, target, label); output.after(frame); await video.play();
      if (!current()) { if (attempt === generation) stop(); return; }
      output.classList.add('is-scanning'); feedback(qrLightingFeedback([], 0));
      const previewFrame = frame;
      requestAnimationFrame(() => { if (current()) previewFrame.scrollIntoView({ block: 'nearest' }); });
      const track = stream.getVideoTracks()[0], capabilities = track?.getCapabilities?.();
      if (capabilities?.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      const ended = () => { if (!current()) return; stop(); feedback({ state: 'error', message: 'The camera disconnected or stopped. Check the camera, then scan again or enter the printed code.' }); };
      track?.addEventListener?.('ended', ended, { once: true });
      removeTrackListener = () => track?.removeEventListener?.('ended', ended);
      running = true;
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser could not read the camera image. Try another browser or enter the printed code.');
      const startedAt = Date.now();
      let misses = 0, rejectedCode = '', rejectedAt = 0, lastFeedbackAt = 0;
      const read = region => {
        const scale = Math.min(1, 960 / Math.max(region.width, region.height));
        canvas.width = Math.max(1, Math.round(region.width * scale)); canvas.height = Math.max(1, Math.round(region.height * scale));
        context.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        return { data, width: canvas.width, height: canvas.height, found: decode(data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' }) };
      };
      const scan = async () => {
        if (attempt !== generation) return;
        if (!running || !current()) { stop(); return; }
        if (document.hidden) { stop(); feedback({ state: 'idle', message: 'Camera paused while this page was hidden. Scan again when you are ready.' }); return; }
        try {
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            const regions = qrScanRegions(video.videoWidth, video.videoHeight, video.getBoundingClientRect?.() || frame.getBoundingClientRect?.(), target.getBoundingClientRect?.());
            const image = read(regions.target), found = image.found;
            if (found?.data) {
              const position = qrPositionFeedback(found, image.width, image.height);
              if (position) { feedback(position); lastFeedbackAt = Date.now(); }
              else if (found.data !== rejectedCode || Date.now() - rejectedAt > 4000) {
                feedback({ state: 'validating', label: 'Checking QR label…', message: 'QR read. Checking the label…' }); output.setAttribute?.('aria-busy', 'true');
                let result, accepted = false;
                try {
                  if (found.data.length > 256 || /[\u0000-\u001f\u007f]/.test(found.data)) throw new Error('Invalid QR label. Scan the original printed equipment or rental QR.');
                  result = await validateCapture?.(found.data, button.dataset.scanField);
                  if (result === false) throw new Error('This QR label is not valid here. Scan the correct printed label.');
                  accepted = true;
                } catch (error) {
                  if (!current()) { if (attempt === generation) stop(); return; }
                  rejectedCode = found.data; rejectedAt = lastFeedbackAt = Date.now();
                  feedback({ state: 'error', label: 'Label not accepted', message: error.message || 'Could not verify this label. Check your connection and try again.' });
                } finally { if (current()) output.removeAttribute?.('aria-busy'); }
                if (!current()) { if (attempt === generation) stop(); return; }
                if (accepted) {
                  field.value = found.data; field.dispatchEvent(new Event('input', { bubbles: true }));
                  feedback({ state: 'success', label: 'QR verified', message: result?.message || 'QR captured. Review the details before confirming.' });
                  stop(); await onCapture?.(button.dataset.scanField); return;
                }
              }
            } else {
              misses++;
              let next = qrLightingFeedback(image.data, Date.now() - startedAt);
              // Search only the visible preview for positioning help. Codes outside
              // the target never populate the field or trigger verification.
              if (misses % 3 === 0 && next.label !== 'More light needed') {
                const wide = read(regions.visible);
                if (wide.found?.data) {
                  feedback({ state: 'warning', label: 'Center the whole QR square', message: 'QR detected outside the scan area or crossing its edge. Center the QR square and white border inside the frame; move farther back if it does not fit.' });
                  lastFeedbackAt = Date.now();
                }
              }
              if (Date.now() - lastFeedbackAt > 2500) feedback(next);
            }
          } else if (Date.now() - startedAt > 10000) {
            throw new Error('No camera image was received. Restart the camera or enter the printed code.');
          }
        } catch (error) { if (attempt !== generation) return; stop(); feedback({ state: 'error', message: cameraErrorMessage(error) }); return; }
        if (current() && running) timer = setTimeout(scan, 220);
        else if (attempt === generation) stop();
      };
      await scan();
    } catch (error) { if (attempt !== generation) return; stop(); feedback({ state: 'error', message: cameraErrorMessage(error) }); }
  });
  return stop;
}

export function bindInspectionPhotos(form) {
  let photos = [], loading = false, revision = 0;
  const picker = form.querySelector('[data-inspection-photos]'), preview = form.querySelector('[data-photo-preview]');
  function render() {
    preview.replaceChildren();
    photos.forEach((data, index) => {
      const figure = document.createElement('figure'), image = document.createElement('img'), remove = document.createElement('button');
      image.src = data; image.alt = `Inspection photo ${index + 1}`;
      remove.type = 'button'; remove.className = 'secondary'; remove.textContent = `Remove photo ${index + 1}`;
      remove.onclick = () => { photos.splice(index, 1); picker.value = ''; render(); };
      figure.append(image, remove); preview.append(figure);
    });
  }
  if (picker) picker.onchange = async () => {
    const version = ++revision, files = [...picker.files], next = [];
    photos = []; preview.textContent = files.length ? 'Preparing photos…' : ''; loading = true;
    try {
      if (files.length > 2) throw new Error('Choose at most two inspection photos.');
      for (const file of files) {
        if (!file.type.startsWith('image/') || file.size > 20000000) throw new Error('Choose image files smaller than 20 MB.');
        const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas');
        const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        let quality = .72, data = canvas.toDataURL('image/jpeg', quality);
        while (data.length > 150000 && quality > .15) { quality -= .1; data = canvas.toDataURL('image/jpeg', quality); }
        if (data.length > 150000) throw new Error('This image is too detailed. Choose a smaller photo.');
        next.push(data);
      }
      if (version === revision) { photos = next; render(); }
    } catch (error) {
      if (version === revision) { photos = []; picker.value = ''; preview.replaceChildren(); form.querySelector('.form-error').textContent = error.message; }
    } finally { if (version === revision) loading = false; }
  };
  return () => { if (loading) throw new Error('Wait for the inspection photos to finish processing.'); return photos; };
}


export function initHardwareBarcodeScanner({ onScan } = {}) {
  if (typeof window === 'undefined') return () => {};
  let buffer = '', lastKeyTime = 0;
  const handler = event => {
    const isInput = event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    const now = Date.now();
    const isFast = (now - lastKeyTime) < 75;
    lastKeyTime = now;

    if (event.key === 'Enter') {
      if (buffer.length >= 3 && isFast) {
        const scanned = buffer.trim();
        buffer = '';
        if (onScan && typeof onScan === 'function') {
          onScan(scanned, event);
        }
      }
      buffer = '';
      return;
    }

    if (event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!isFast && buffer.length > 0) {
        buffer = '';
      }
      if (!isInput) {
        buffer += event.key;
      }
    }
  };

  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
}
