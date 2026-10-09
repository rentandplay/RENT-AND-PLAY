let decoderPromise;
function loadDecoder() {
  if (globalThis.jsQR) return Promise.resolve(globalThis.jsQR);
  decoderPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/public/vendor/jsQR.js';
    script.onload = () => resolve(globalThis.jsQR);
    script.onerror = () => { decoderPromise = null; script.remove(); reject(new Error('The QR reader could not load. Refresh or use manual lookup.')); };
    document.head.append(script);
  });
  return decoderPromise;
}

export function bindQrReaders(form, modal, { onCapture } = {}) {
  let stream, timer, video, running = false, generation = 0, activeButton, activeOutput, buttonLabel;
  const stop = () => {
    generation++; running = false; clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    if (video) { video.srcObject = null; video = null; }
    form.querySelector('.qr-scanner-frame')?.remove?.();
    activeOutput?.classList?.remove?.('is-scanning'); activeOutput = null;
    if (activeButton) {
      activeButton.innerHTML = buttonLabel;
      activeButton.classList?.remove?.('is-scanning');
      activeButton.removeAttribute?.('aria-pressed');
      activeButton = null;
    }
  };
  modal.addEventListener?.('close', stop, { once: true });
  form.querySelectorAll('[data-scan-field]').forEach(button => button.onclick = async () => {
    const field = form.elements[button.dataset.scanField];
    if (button.disabled || field.disabled) return;
    const output = form.querySelector(`[data-camera-status="${button.dataset.scanField}"]`) || form.querySelector('[data-camera-status]');
    if (activeButton === button) { stop(); output.textContent = 'Camera stopped. Scan again or enter the printed code.'; return; }
    stop(); const attempt = generation;
    activeButton = button; activeOutput = output; buttonLabel = button.innerHTML;
    button.classList.add('is-scanning'); button.setAttribute('aria-pressed', 'true'); button.textContent = 'Stop camera';
    try {
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera scanning needs HTTPS or localhost. Use manual lookup on this connection.');
      output.textContent = 'Starting camera…';
      const decode = await loadDecoder();
      if (attempt !== generation || !form.isConnected || !modal.open) return;
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
      if (attempt !== generation || !form.isConnected || !modal.open) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired; video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream; video.className = 'qr-camera-preview';
      const frame = document.createElement('div'); frame.className = 'qr-scanner-frame'; frame.setAttribute('role', 'group'); frame.setAttribute('aria-label', 'Live camera preview. Center the QR code in the frame.');
      const target = document.createElement('div'); target.className = 'qr-scanner-target'; target.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.className = 'qr-scanner-label'; label.textContent = 'Center the QR code in the frame';
      frame.append(video, target, label); output.after(frame); await video.play();
      output.textContent = 'Scanning for QR. Keep the code steady inside the frame.'; output.classList.add('is-scanning');
      const track = stream.getVideoTracks()[0], capabilities = track?.getCapabilities?.();
      if (capabilities?.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      if (attempt !== generation) return;
      running = true;
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
      const scan = () => {
        if (attempt !== generation) return;
        if (!running || !form.isConnected || !modal.open || document.hidden) { stop(); return; }
        if (video.readyState >= 2) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const found = decode(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
          if (found?.data) { field.value = found.data; field.dispatchEvent(new Event('input', { bubbles: true })); output.textContent = 'QR captured. Review the details before confirming.'; stop(); onCapture?.(button.dataset.scanField); return; }
        }
        timer = setTimeout(scan, 180);
      };
      scan();
    } catch (error) { if (attempt !== generation) return; stop(); output.textContent = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in browser settings or use manual lookup.' : error.message; }
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
