import { createMx10Printer, renderLabelPng, normalizeMx10PrintSettings, normalizeMx10LabelCalibration } from './mx10-printer.js';
import { createEquipmentQrLabel as qrLabelSvg, QR_LABEL_GEOMETRY as qrLabelGeometry } from './equipment-label.js';

const printer = createMx10Printer();

export function createInventory(h) {
  const { api, escape: e, icon, symbol, badge, stateLabel, formatDate, showModal, modal, toast } = h;
  const cash = n => n == null ? 'Not configured' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(Number(n));
  const unit = t => ({ DAILY: 'per day', HOURLY: 'per hour', FLAT: 'flat fee' })[t] || '';
  const label = s => String(s || 'Not recorded').toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
  const equipmentImages = [[/\bbike\b/i, 'Bike.png'], [/\bbadminton\b/i, 'Badminton_Set.png'], [/\bpickleball\b/i, 'Pickleball_Set.png'], [/\bbasketball\b/i, 'Basketball.png'], [/\bvolleyball\b/i, 'Volleyball.png'], [/\bps4\b|playstation\s*4/i, 'PS4.png'], [/\bnintendo\s*switch\b/i, 'Nintendo_Switch.png'], [/\buno\b/i, 'UNO_Cards.png'], [/\bbingo\b/i, 'Bingo.png'], [/\bjenga\b/i, 'Jenga.png'], [/\bscrabble\b/i, 'Scrabble.png'], [/\bchess\b/i, 'Chess.png'], [/\bdeck\s+of\s+cards?\b|\bplaying\s+cards?\b|\bcards?\b/i, 'Playing_Cards.png']];
  const imageFilename = name => equipmentImages.find(([pattern]) => pattern.test(name || ''))?.[1] || '';
  async function prepareEquipmentImage(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
    if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
    const objectUrl = URL.createObjectURL(file), image = new Image();
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('This image could not be opened. Try another photo.')); image.src = objectUrl; });
      const sourceWidth = image.naturalWidth, sourceHeight = image.naturalHeight;
      if (!sourceWidth || !sourceHeight) throw new Error('This image has invalid dimensions.');
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      if (!context) throw new Error('Image resizing is unavailable in this browser.');
      for (const scale of [1, .78, .58, .42]) {
        const ratio = Math.min(1, 720 / Math.max(sourceWidth, sourceHeight)) * scale;
        canvas.width = Math.max(1, Math.round(sourceWidth * ratio)); canvas.height = Math.max(1, Math.round(sourceHeight * ratio));
        context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [.86, .74, .62, .5]) {
          const data = canvas.toDataURL('image/webp', quality);
          if (data.length <= 250000) return data;
        }
      }
      throw new Error('This photo is still too large after resizing. Choose a smaller image.');
    } finally { URL.revokeObjectURL(objectUrl); }
  }
  function renderEquipmentImage(container, item, { keepBadge = false } = {}) {
    const filename = imageFilename(item.name);
    if (!item.image_data && !filename) return;
    const badge = keepBadge ? container.querySelector('.badge') : null, image = document.createElement('img');
    image.className = 'inv-product-image'; image.src = item.image_data || `/public/images/${filename}`; image.alt = item.name; image.loading = 'lazy'; image.decoding = 'async';
    image.addEventListener('error', () => { const fallback = document.createElement('span'); fallback.className = 'inv-photo-fallback'; fallback.innerHTML = symbol(item.category); image.replaceWith(fallback); }, { once: true });
    container.replaceChildren(...[image, badge].filter(Boolean));
  }
  let root, records = [], categories = [], pricingProducts = [], initialized = false, search = '', cat = '', status = 'all', scope = 'active', sort = 'name-asc', offset = 0, view = 'table', categoryLink = '';
  let inventoryView, inventoryRequest, pricingRequest, pricingLoaded = false, syncError = '', requestedCategory = '', sessionVersion = 0;
  const pageSize = () => view === 'grid' ? 6 : 5;
  const download = (content, type, name) => { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const qrCalibrationKey = 'rent-play-qr-calibration', qrCalibrationDefaults = { offsetX: 0, offsetY: 0 };
  const qrPrintSettingsKey = 'rent-play-mx10-print-settings';
  let qrPrintSettings = (() => { try { return normalizeMx10PrintSettings(JSON.parse(localStorage.getItem(qrPrintSettingsKey) || '{}')); } catch { return normalizeMx10PrintSettings(); } })();
  const persistQrPrintSettings = () => { try { localStorage.setItem(qrPrintSettingsKey, JSON.stringify(qrPrintSettings)); } catch { } };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value)), half = value => Math.round(value * 2) / 2;
  const cleanCalibration = value => ({ offsetX: half(clamp(Number(value?.offsetX) || 0, -15, 15)), offsetY: half(clamp(Number(value?.offsetY) || 0, -15, 15)) });
  let qrCalibration = (() => { try { return cleanCalibration(JSON.parse(localStorage.getItem(qrCalibrationKey) || '{}')); } catch { return { ...qrCalibrationDefaults }; } })();
  const persistQrCalibration = () => { try { localStorage.setItem(qrCalibrationKey, JSON.stringify(qrCalibration)); } catch { } };
  // Code 128 symbol widths follow the standard table used by ZXing's Apache-2.0 reference implementation.
  const code128Patterns = `212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112`.split(' ');
  const barcodeLabelSvg = i => {
    const value = String(i.item_code || ''); if (!value || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) > 126)) throw new Error('This equipment code cannot be encoded as a Code 128 barcode.');
    const data = [...value].map(character => character.charCodeAt(0) - 32), checksum = (104 + data.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103, symbols = [104, ...data, checksum, 106], total = symbols.reduce((sum, code) => sum + code128Patterns[code].split('').reduce((width, digit) => width + Number(digit), 0), 0), scale = Math.min(2, 460 / total); let x = (500 - total * scale) / 2;
    const bars = symbols.map(code => code128Patterns[code].split('').map((digit, index) => { const width = Number(digit), part = index % 2 === 0 ? `<rect x="${x.toFixed(2)}" y="24" width="${(width * scale).toFixed(2)}" height="160"/>` : ''; x += width * scale; return part; }).join('')).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="30mm" viewBox="0 0 500 300" shape-rendering="crispEdges"><rect width="500" height="300" fill="white"/><g fill="#000">${bars}</g><text x="250" y="222" text-anchor="middle" fill="#000" font-family="monospace" font-size="18">${e(value)}</text><text x="250" y="263" text-anchor="middle" fill="#000" font-family="Arial, sans-serif" font-size="14">${e(i.name.length > 34 ? i.name.slice(0, 31) + '…' : i.name)}</text></svg>`;
  };
  const labelSvg = (i, q, format = 'qr') => format === 'barcode' ? barcodeLabelSvg(i) : qrLabelSvg(i, q);
  const qrPrintDocument = (items, labels, settings, autoPrint = false, format = 'qr') => {
    const { paperMode, startFeedMm, tearFeedMm } = normalizeMx10PrintSettings(settings);
    const leading = paperMode === 'continuous' ? startFeedMm : 0;
    const pitch = leading + 30 + (paperMode === 'gapped' ? 10 : tearFeedMm);
    const calibration = normalizeMx10LabelCalibration(settings, format === 'qr' ? { qrGeometry: qrLabelGeometry } : {});
    const pages = items.map(i => { const q = labels.get(String(i.id)); if (!q) throw new Error(`Label data missing for ${i.item_code}.`); return `<section class="page"><div class="sticker" style="left:${calibration.offsetX}mm;top:${leading + calibration.offsetY}mm"><img src="data:image/svg+xml,${encodeURIComponent(labelSvg(i, q, format))}" alt="${format === 'barcode' ? 'Code 128 barcode' : 'QR code'} for ${e(i.name)}"></div></section>`; }).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rent &amp; Play ${format === 'barcode' ? 'barcode' : 'QR'} labels</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#172333}.toolbar{padding:18px;font-size:14px}.toolbar p{margin:7px 0;color:#536275}.toolbar button{padding:10px 16px;border:0;border-radius:7px;background:#df762d;color:white;font-weight:bold}.page{position:relative;width:50mm;height:${pitch}mm;overflow:hidden;background:#fff}.page:not(:last-child){break-after:page;page-break-after:always}.sticker{position:absolute;width:50mm;height:30mm;padding:0;background:white;overflow:hidden}.sticker img{display:block;width:50mm;height:30mm;object-fit:fill}@page{size:50mm ${pitch}mm;margin:0}@media print{.toolbar{display:none}body{margin:0}}</style></head><body><header class="toolbar"><strong>Rent &amp; Play ${format === 'barcode' ? 'barcode' : 'QR'} labels</strong><p>${items.length} labels · 50 × 30 mm · offsets ${settings.offsetX} mm horizontal / ${settings.offsetY} mm vertical.</p><button type="button" onclick="window.print()">Print labels</button></header>${pages}${autoPrint ? '<script>window.addEventListener("load",()=>setTimeout(()=>{window.focus();window.print()},300));</script>' : ''}</body></html>`;
  };
  const qrSheet = (items, labels, settings) => qrPrintDocument(items, labels, settings);
  const isActive = item => item.is_active !== false;
  const filtered = () => {
    const nameOrder = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
    const rentalRate = item => { const value = Number(item.rental_rate); return Number.isFinite(value) ? value : 0; };
    const compare = {
      'name-asc': nameOrder,
      'name-desc': (a, b) => nameOrder(b, a),
      'rate-asc': (a, b) => rentalRate(a) - rentalRate(b),
      'rate-desc': (a, b) => rentalRate(b) - rentalRate(a),
      newest: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))
    }[sort] || nameOrder;
    return records.filter(item => (scope === 'archived' ? !isActive(item) : isActive(item)) && (status === 'all' || (item.effective_status || item.status) === status) && (!cat || String(item.category_id) === cat) && (!search || [item.name, item.item_code, item.category, item.description].some(value => String(value || '').toLowerCase().includes(search.trim().toLowerCase())))).sort((a, b) => compare(a, b) || nameOrder(a, b));
  };
  function applyLinkedCategory(linkedCategory) {
    if (linkedCategory === categoryLink) return;
    categoryLink = linkedCategory;
    cat = String(categories.find(category => category.name === linkedCategory)?.id || '');
    offset = 0;
  }
  async function inventoryApi(path) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try { return await api(path, { signal: controller.signal }); }
    catch (error) { if (controller.signal.aborted) throw new Error('The equipment request timed out. Please try Refresh again.'); throw error; }
    finally { clearTimeout(timer); }
  }
  async function loadInventory(force = false) {
    // A save must fetch a snapshot taken after the write, even if a poll was already running.
    if (force && inventoryRequest) await inventoryRequest.catch(() => {});
    if (!inventoryRequest) {
      const pending = inventoryApi('/inventory').finally(() => { if (inventoryRequest === pending) inventoryRequest = null; });
      inventoryRequest = pending;
    }
    return inventoryRequest;
  }
  async function loadPricing(force = false) {
    if (pricingLoaded && !force) return pricingProducts;
    if (!pricingRequest) {
      const version = sessionVersion;
      const pending = inventoryApi('/pricing').then(pricing => {
        if (version === sessionVersion) { pricingProducts = pricing.products || []; pricingLoaded = true; }
        return pricingProducts;
      }).finally(() => { if (pricingRequest === pending) pricingRequest = null; });
      pricingRequest = pending;
    }
    return pricingRequest;
  }
  async function mount(target, linkedCategory = '') {
    if (!target) return;
    root = target; requestedCategory = linkedCategory;
    if (initialized) { applyLinkedCategory(linkedCategory); draw(); }
    try { await refreshInventory(); }
    catch (error) {
      if (root !== target || !target.isConnected || initialized) return;
      target.removeAttribute('aria-live'); target.removeAttribute('aria-busy');
      target.innerHTML = `<section class="panel inv-empty"><h3>Inventory could not load</h3><p role="alert">${e(error.message)}</p><button type="button" class="secondary" id="inv-retry">Try again</button></section>`;
      target.querySelector('#inv-retry').onclick = event => { event.currentTarget.disabled = true; event.currentTarget.textContent = 'Trying again…'; void mount(target, linkedCategory); };
    }
  }
  async function refreshInventory({ force = false } = {}) {
    const version = sessionVersion;
    // Pricing is supplementary: a slow catalog must never hold the inventory screen open.
    void loadPricing(true).catch(() => {});
    try {
      const result = await loadInventory(force);
      if (version !== sessionVersion) return false;
      if (!Array.isArray(result.items) || !Array.isArray(result.categories)) throw new Error('The server returned incomplete inventory data. Please try Refresh again.');
      const changed = !initialized || JSON.stringify(records) !== JSON.stringify(result.items) || JSON.stringify(categories) !== JSON.stringify(result.categories);
      const hadError = !!syncError;
      records = result.items; categories = result.categories; syncError = '';
      if (!initialized) applyLinkedCategory(requestedCategory);
      initialized = true;
      if (changed || hadError || inventoryView?.root !== root) draw();
      return changed;
    } catch (error) {
      if (version === sessionVersion) { syncError = error.message; if (initialized) draw(); }
      throw error;
    }
  }
  function exportInventory() {
    const cell = value => '"' + (/^[=+@\-\t\r]/.test(String(value || '')) ? "'" : '') + String(value ?? '').replaceAll('"', '""') + '"';
    const rows = [['Code', 'Equipment', 'Category', 'Status', 'Condition', 'Rate type', 'Rental rate', 'Deposit', 'Late penalty'], ...filtered().map(item => [item.item_code, item.name, item.category, item.effective_status, item.condition_status, item.rate_type, item.rental_rate, item.deposit_amount, item.late_penalty_rate])];
    download('\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8', 'rent-play-inventory.csv');
    toast('Filtered inventory exported.');
  }
  function draw() {
    if (!root?.isConnected) return;
    if (inventoryView?.root !== root) inventoryView = createInventoryView(root, {
      escape: e, icon, symbol, badge, stateLabel, cash, unit, label, isActive, renderEquipmentImage,
      onSearch: value => { search = value; offset = 0; draw(); },
      onCategory: value => { cat = value; offset = 0; draw(); },
      onStatus: value => { scope = value === 'archived' ? 'archived' : 'active'; status = scope === 'archived' ? 'all' : value; offset = 0; draw(); },
      onSort: value => { sort = value; offset = 0; draw(); },
      onView: value => { view = value; offset = 0; draw(); },
      onPrevious: () => { offset = Math.max(0, offset - pageSize()); draw(); },
      onNext: () => { offset += pageSize(); draw(); },
      onAdd: () => form(), onReset: reset, onEmptyAction: () => scope === 'archived' ? switchScope('active') : records.some(isActive) ? reset() : form(),
      onExport: exportInventory, onQrExport: () => saveQrSheet(records), onDetails: details
    });
    const rows = filtered(), currentPageSize = pageSize();
    offset = Math.min(offset, Math.max(0, Math.ceil(rows.length / currentPageSize) - 1) * currentPageSize);
    inventoryView.update({ records, categories, rows, shown: rows.slice(offset, offset + currentPageSize), search, cat, status, scope, sort, view, offset, pageSize: currentPageSize, syncError });
  }
  function switchScope(next) { scope = next; status = 'all'; offset = 0; draw(); }
  function reset() { search = ''; cat = ''; status = 'all'; scope = 'active'; offset = 0; draw(); }
  function resetCache() {
    sessionVersion++; root = null; inventoryView = null; inventoryRequest = null; pricingRequest = null;
    records = []; categories = []; pricingProducts = []; initialized = false; pricingLoaded = false; syncError = ''; requestedCategory = ''; categoryLink = '';
    search = ''; cat = ''; status = 'all'; scope = 'active'; sort = 'name-asc'; offset = 0; view = 'table';
  }
  const errorBody = err => `<p role="alert">${e(err.message)}</p><p>Close this dialog and refresh to try again.</p>`;
  async function edit(id) { try { const { item } = await inventoryApi('/inventory/' + id); await form(item); } catch (err) { showModal('Unable to open equipment', errorBody(err)); } }
  async function form(item) {
    if (!pricingLoaded) {
      showModal('Opening equipment editor', '<p id="inv-editor-loading" role="status">Loading pricing options…</p>');
      const loading = modal.querySelector('#inv-editor-loading'), version = sessionVersion;
      try { await loadPricing(); }
      catch (error) { if (modal.open && loading.isConnected && version === sessionVersion) showModal('Unable to open equipment editor', errorBody(error)); return; }
      if (!modal.open || !loading.isConnected || version !== sessionVersion) return;
    }
    const options = (values, selected) => values.map(v => `<option value="${v}" ${v === selected ? 'selected' : ''}>${label(v)}</option>`).join('');
    const field = (name, title, type, value, extra = '') => `<label>${title}<input name="${name}" type="${type}" value="${e(value)}" ${extra} required/></label>`;
    const defaultImage = imageFilename(item?.name), initialImage = item?.image_data || (defaultImage ? `/public/images/${defaultImage}` : ''), placeholderCategory = item?.category || categories.find(c => String(c.id) === String(item?.category_id || cat))?.name || '';
    const imageEditor = `<section class="inv-image-editor"><div class="inv-image-preview" id="inv-form-image-preview">${initialImage ? `<img src="${e(initialImage)}" alt="${e(item?.name || 'Equipment image')}"/>` : `<span>${symbol(placeholderCategory)}</span>`}</div><div class="inv-image-editor-copy"><strong>Equipment image</strong><p>Upload a photo to use on this equipment card.</p><div class="inv-image-actions"><label class="secondary inv-image-picker">Choose image<input id="inv-image-file" type="file" accept="image/jpeg,image/png,image/webp"/></label><button type="button" class="secondary" id="inv-image-remove" ${item?.image_data ? '' : 'hidden'}>Remove image</button></div><small>JPG, PNG, or WebP · resized automatically</small><p class="inv-error" id="inv-image-error" role="alert"></p></div><input type="hidden" name="imageData" value="${e(item?.image_data || '')}"/></section>`;
    showModal(item ? 'Edit equipment' : 'Add equipment', `<form id="inv-form" class="inv-form inv-equipment-form">
      <p class="inv-form-intro">${item ? 'Update equipment details and pricing.' : 'Add a photo, equipment details, and rental pricing.'}</p>
      ${imageEditor}
      <section class="inv-form-section">
        <header class="inv-form-section-heading"><span>01</span><div><h3>Equipment details</h3><p>Name, category, condition, and useful notes.</p></div></header>
        <div class="inv-form-grid">
          ${field('name', 'Equipment name', 'text', item?.name || '', 'maxlength="150" placeholder="e.g. Basketball — size 7"')}
          <div class="inv-category-input">
            <label for="inv-form-category">Category<select id="inv-form-category" name="categoryId" required>${categories.map(c => `<option value="${e(c.id)}" ${String(c.id) === (item?.category_id || cat) ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select></label>
            <div class="inv-category-actions">
              <button type="button" class="secondary inv-add-category-button" id="inv-add-category" aria-expanded="false" aria-controls="inv-category-popover">＋ Add category</button>
              <button type="button" class="inv-category-remove-button" id="inv-remove-category" aria-expanded="false" aria-controls="inv-category-popover" title="Remove the selected category">Remove</button>
            </div>
            <div class="inv-category-popover" id="inv-category-popover" role="group" aria-label="Manage equipment categories" hidden>
              <div id="inv-category-add-panel">
                <label for="inv-new-category-name">Category name<input id="inv-new-category-name" type="text" maxlength="60" pattern="[^<>]{1,60}" placeholder="e.g. Camping equipment"/></label>
                <p id="inv-category-error" class="inv-error" role="alert"></p>
                <div class="inv-category-popover-actions"><button type="button" class="primary" id="inv-category-save">Save</button><button type="button" class="secondary" id="inv-category-discard">Discard</button></div>
              </div>
              <div id="inv-category-remove-panel" hidden>
                <strong>Remove selected category?</strong>
                <p id="inv-category-remove-copy"></p>
                <p id="inv-category-remove-error" class="inv-error" role="alert"></p>
                <div class="inv-category-popover-actions"><button type="button" class="inv-danger" id="inv-category-remove-confirm">Remove category</button><button type="button" class="secondary" id="inv-category-remove-discard">Cancel</button></div>
              </div>
            </div>
          </div>
          <label>Condition<select name="condition" ${item && Number(item.open_rentals) > 0 ? 'disabled' : ''}>${options(item?.status === 'UNDER_MAINTENANCE' ? ['GOOD', 'FAIR', 'DAMAGED', 'NEEDS_INSPECTION'] : ['GOOD', 'FAIR'], item?.condition_status || 'GOOD')}</select></label>
          <label class="inv-equipment-notes">Description / equipment notes<textarea name="description" maxlength="2000" rows="3" placeholder="Size, color, included accessories, or identifying marks">${e(item?.description || '')}</textarea></label>
        </div>
      </section>
      <section class="inv-form-section">
        <header class="inv-form-section-heading"><span>02</span><div><h3>Rates &amp; pricing</h3><p>Set item-specific rates and an optional quote product.</p></div></header>
        <div class="inv-form-grid">
          <label>Pricing product<select name="pricingProductId"><option value="">Not linked</option>${pricingProducts.map(p => `<option value="${e(p.id)}" ${p.id === (item?.pricing_product_id || '') ? 'selected' : ''}>${e(p.name)} · ${e(p.group)}</option>`).join('')}</select><small>Used by current rental quotes when linked.</small></label>
          <label>Rate basis<select name="rateType">${options(['DAILY', 'HOURLY', 'FLAT'], item?.rate_type || 'DAILY')}</select></label>
          ${field('rentalRate', 'Rental rate (₱)', 'number', item?.rental_rate ?? '', 'min="0" max="9999999999.99" step="0.01" placeholder="0.00"')}
          ${field('deposit', 'Deposit (₱)', 'number', item?.deposit_amount ?? 0, 'min="0" max="9999999999.99" step="0.01"')}
          ${field('latePenalty', 'Late penalty (₱)', 'number', item?.late_penalty_rate ?? 0, 'min="0" max="9999999999.99" step="0.01"')}
        </div>
        <div class="info-box">Availability follows rentals and maintenance. Linked pricing products are used for current rental quotes.</div>
      </section>
      <p id="inv-form-error" class="inv-error" role="alert"></p>
      <div class="inv-form-actions"><button type="button" class="secondary" id="inv-cancel">Cancel</button><button class="primary" type="submit">${item ? 'Save changes' : 'Add equipment'}</button></div>
    </form>`);
    modal.querySelector('#inv-cancel').onclick = () => modal.close(); const formEl = modal.querySelector('#inv-form');
    const imageDataInput = formEl.elements.imageData, imageFileInput = formEl.querySelector('#inv-image-file'), imagePreview = formEl.querySelector('#inv-form-image-preview'), imageRemove = formEl.querySelector('#inv-image-remove'), imageError = formEl.querySelector('#inv-image-error');
    const setImagePreview = source => {
      if (source) { const previewImage = document.createElement('img'); previewImage.src = source; previewImage.alt = formEl.elements.name.value || 'Equipment image'; imagePreview.replaceChildren(previewImage); }
      else { const fallback = document.createElement('span'); fallback.innerHTML = symbol(placeholderCategory); imagePreview.replaceChildren(fallback); }
    };
    imageFileInput.onchange = async () => {
      const file = imageFileInput.files?.[0]; if (!file) return;
      imageError.textContent = '';
      try { const imageData = await prepareEquipmentImage(file); imageDataInput.value = imageData; setImagePreview(imageData); imageRemove.hidden = false; }
      catch (error) { imageFileInput.value = ''; imageError.textContent = error.message; }
    };
    imageRemove.onclick = () => { imageDataInput.value = ''; imageFileInput.value = ''; imageError.textContent = ''; setImagePreview(defaultImage ? `/public/images/${defaultImage}` : ''); imageRemove.hidden = true; };
    const conditionSelect = formEl.elements.condition, pricingSelect = formEl.elements.pricingProductId;
    if (item?.pricing_product_id && !Array.from(pricingSelect.options).some(option => option.value === String(item.pricing_product_id))) {
      pricingSelect.add(new Option('Current pricing product', item.pricing_product_id)); pricingSelect.value = item.pricing_product_id;
    }
    pricingSelect.onchange = () => { const product = pricingProducts.find(p => p.id === pricingSelect.value); if (!product || item) return; const rate = product.rate_options.find(row => row.kind === 'HOURLY') || product.rate_options.find(row => row.kind !== 'WHOLE_STAY'); if (rate) { formEl.elements.rateType.value = rate.kind === 'HOURLY' ? 'HOURLY' : rate.kind === 'BLOCK' ? 'FLAT' : 'HOURLY'; formEl.elements.rentalRate.value = rate.amount; } formEl.elements.deposit.value = product.deposit_amount; formEl.elements.latePenalty.value = product.overtime_rate_per_hour; };
    if (item) { if (!Array.from(conditionSelect.options).some(o => o.value === item.condition_status)) conditionSelect.add(new Option(label(item.condition_status), item.condition_status)); conditionSelect.value = item.condition_status; conditionSelect.disabled = Number(item.open_rentals) > 0 || ['RENTED', 'RESERVED_PENDING'].includes(item.status); }
    const categoryPopover = modal.querySelector('#inv-category-popover'), categoryButton = modal.querySelector('#inv-add-category'), categoryRemoveButton = modal.querySelector('#inv-remove-category'), categoryInput = modal.querySelector('#inv-new-category-name'), categoryError = modal.querySelector('#inv-category-error'), categorySave = modal.querySelector('#inv-category-save'), categoryDiscard = modal.querySelector('#inv-category-discard'), categorySelect = formEl.elements.categoryId;
    const categoryAddPanel = modal.querySelector('#inv-category-add-panel'), categoryRemovePanel = modal.querySelector('#inv-category-remove-panel'), categoryRemoveCopy = modal.querySelector('#inv-category-remove-copy'), categoryRemoveError = modal.querySelector('#inv-category-remove-error'), categoryRemoveConfirm = modal.querySelector('#inv-category-remove-confirm'), categoryRemoveDiscard = modal.querySelector('#inv-category-remove-discard');
    const equipmentSave = formEl.querySelector('[type="submit"]');
    const syncCategoryRemoveButton = () => { categoryRemoveButton.disabled = categories.length <= 1; categoryRemoveButton.title = categories.length <= 1 ? 'Keep at least one equipment category.' : 'Remove the selected category'; };
    const closeCategoryPopover = focusTarget => { categoryPopover.hidden = true; categoryAddPanel.hidden = false; categoryRemovePanel.hidden = true; categoryButton.setAttribute('aria-expanded', 'false'); categoryRemoveButton.setAttribute('aria-expanded', 'false'); categoryInput.value = ''; categoryInput.disabled = false; categoryInput.setCustomValidity(''); categoryError.textContent = ''; categoryRemoveError.textContent = ''; equipmentSave.disabled = false; focusTarget?.focus(); };
    categoryButton.onclick = () => { categoryPopover.hidden = false; categoryAddPanel.hidden = false; categoryRemovePanel.hidden = true; categoryButton.setAttribute('aria-expanded', 'true'); categoryRemoveButton.setAttribute('aria-expanded', 'false'); equipmentSave.disabled = true; categoryInput.disabled = false; categoryInput.focus(); };
    categoryRemoveButton.onclick = () => {
      const selected = categorySelect.selectedOptions[0], categoryId = categorySelect.value, usedCount = records.filter(record => String(record.category_id) === String(categoryId)).length;
      if (!selected || !categoryId || categories.length <= 1) return;
      categoryRemoveCopy.textContent = usedCount ? `“${selected.textContent}” is used by ${usedCount} equipment item${usedCount === 1 ? '' : 's'}. Move them to another category before removing it.` : `Remove “${selected.textContent}”? This category can only be removed while no equipment uses it.`;
      categoryRemoveError.textContent = ''; categoryRemoveConfirm.disabled = usedCount > 0;
      categoryPopover.hidden = false; categoryAddPanel.hidden = true; categoryRemovePanel.hidden = false; categoryButton.setAttribute('aria-expanded', 'false'); categoryRemoveButton.setAttribute('aria-expanded', 'true'); equipmentSave.disabled = true; categoryRemoveDiscard.focus();
    };
    categoryDiscard.onclick = () => closeCategoryPopover(categoryButton);
    categoryRemoveDiscard.onclick = () => closeCategoryPopover(categoryRemoveButton);
    categoryPopover.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); (categoryRemovePanel.hidden ? categoryDiscard : categoryRemoveDiscard).click(); } };
    categorySave.onclick = async event => {
      const button = event.currentTarget, version = sessionVersion, name = categoryInput.value.trim().replace(/\s+/g, ' ');
      categoryInput.value = name; categoryInput.setCustomValidity(name ? '' : 'Enter a category name.'); if (!categoryInput.reportValidity()) return;
      button.disabled = true; categoryDiscard.disabled = true; categoryInput.disabled = true; categoryError.textContent = '';
      try {
        const { category: created } = await api('/item-categories', { method: 'POST', body: JSON.stringify({ name }) });
        if (version !== sessionVersion) return;
        categories = [...categories.filter(entry => String(entry.id) !== String(created.id)), created].sort((a, b) => a.name.localeCompare(b.name));
        const option = new Option(created.name, created.id, true, true); categorySelect.add(option); categorySelect.value = String(created.id); syncCategoryRemoveButton();
        closeCategoryPopover(); toast(`Category “${created.name}” added.`); categoryButton.focus();
        try { await refreshInventory({ force: true }); } catch { toast('Category created. Inventory could not sync; use Refresh to try again.'); }
      } catch (error) { categoryError.textContent = error.message; categoryInput.disabled = false; categoryInput.focus(); }
      finally { if (version === sessionVersion) { button.disabled = false; categoryDiscard.disabled = false; equipmentSave.disabled = !categoryPopover.hidden; } }
    };
    categoryRemoveConfirm.onclick = async event => {
      const button = event.currentTarget, version = sessionVersion, categoryId = categorySelect.value, categoryName = categorySelect.selectedOptions[0]?.textContent || 'category';
      if (!categoryId || categories.length <= 1) return;
      button.disabled = true; categoryRemoveDiscard.disabled = true; categoryRemoveError.textContent = '';
      try {
        await api('/item-categories/' + encodeURIComponent(categoryId), { method: 'DELETE' });
        if (version !== sessionVersion) return;
        categories = categories.filter(category => String(category.id) !== String(categoryId));
        Array.from(categorySelect.options).find(option => option.value === categoryId)?.remove();
        categorySelect.value = String(categories[0]?.id || ''); syncCategoryRemoveButton();
        closeCategoryPopover(categoryRemoveButton); toast(`Category “${categoryName}” removed.`);
        try { await refreshInventory({ force: true }); } catch { toast('Category removed. Inventory could not sync; use Refresh to try again.'); }
      } catch (error) { categoryRemoveError.textContent = error.message; }
      finally { if (version === sessionVersion) { button.disabled = false; categoryRemoveDiscard.disabled = false; equipmentSave.disabled = !categoryPopover.hidden; } }
    };
    syncCategoryRemoveButton();
    formEl.onsubmit = async ev => {
      ev.preventDefault();
      const values = Object.fromEntries(new FormData(formEl));
      if (item && conditionSelect.disabled) values.condition = item.condition_status;
      for (const key of ['rentalRate', 'deposit', 'latePenalty']) values[key] = Number(values[key]);
      if (item) values.version = item.updated_at;
      const saved = await submit(formEl, () => api('/inventory' + (item ? '/' + item.id : ''), { method: item ? 'PATCH' : 'POST', body: JSON.stringify(values) }), item ? 'Equipment updated.' : 'Equipment added.', item ? null : () => { scope = 'active'; status = 'all'; offset = 0; draw(); });
      if (saved && scope === 'archived') { scope = 'active'; status = 'all'; offset = 0; draw(); }
    };
    requireConfirmation(formEl, item ? 'Save equipment changes?' : 'Add this equipment?', item ? 'The updated name, category, condition, notes, and rates will be saved.' : 'The equipment will be added to your active collection.', item ? 'Yes, save changes' : 'Yes, add equipment');
  }
  function requireConfirmation(formEl, title, description, yesLabel) {
    const actionGroups = formEl.querySelectorAll('.inv-form-actions'), actions = actionGroups[actionGroups.length - 1], panel = document.createElement('section');
    panel.className = 'inv-confirm-panel'; panel.hidden = true; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Confirm action');
    panel.innerHTML = '<strong class="inv-confirm-title"></strong><p class="inv-confirm-description"></p><div class="inv-form-actions"><button type="button" class="primary inv-confirm-yes"></button><button type="button" class="secondary inv-confirm-no">No, go back</button></div>';
    panel.querySelector('.inv-confirm-title').textContent = title; panel.querySelector('.inv-confirm-description').textContent = description; panel.querySelector('.inv-confirm-yes').textContent = yesLabel;
    actions.before(panel);
    formEl.addEventListener('submit', event => {
      if (formEl.dataset.confirmed === 'true') { delete formEl.dataset.confirmed; return; }
      event.preventDefault(); panel.hidden = false; panel.dataset.signature = JSON.stringify(Object.fromEntries(new FormData(formEl))); panel.querySelector('.inv-confirm-yes').focus();
    });
    panel.querySelector('.inv-confirm-no').onclick = () => { panel.hidden = true; formEl.querySelector('[type="submit"]')?.focus(); };
    panel.querySelector('.inv-confirm-yes').onclick = () => {
      const current = JSON.stringify(Object.fromEntries(new FormData(formEl)));
      if (panel.dataset.signature !== current) { panel.querySelector('.inv-confirm-description').textContent = 'The details changed. Review the form and confirm again.'; panel.dataset.signature = current; return; }
      formEl.dataset.confirmed = 'true'; panel.hidden = true; formEl.requestSubmit();
    };
  }
  async function submit(formEl, operation, message, afterSave = null) {
    const button = formEl.querySelector('[type="submit"]'), error = formEl.querySelector('#inv-form-error') || formEl.querySelector('.inv-error');
    button.disabled = true; error.textContent = '';
    try { await operation(); }
    catch (problem) { error.textContent = problem.message; button.disabled = false; return; }
    modal.close(); toast(message);
    afterSave?.();
    try { await refreshInventory({ force: true }); }
    catch { toast('Saved successfully. The inventory update could not load; use Refresh to try again.'); }
    finally { button.disabled = false; }
    return true;
  }
  async function details(id) {
    try {
      const { item: i, history, maintenance, rates } = await api('/inventory/' + id), locked = Number(i.open_rentals) > 0 || ['RENTED', 'RESERVED_PENDING'].includes(i.status);
      showModal(i.name, `<div class="inv-details-modal-content">
        <section class="inv-detail-overview">
          <div class="inv-detail-heading"><span class="inv-detail-art">${symbol(i.category)}</span><div class="inv-detail-identity"><p>${e(i.item_code)} <span>· ${e(i.category)}</span></p>${badge(stateLabel(i.effective_status || i.status))}</div></div>
          <p class="inv-description">${e(i.description || 'No equipment notes recorded.')}</p>
        </section>
        <section class="inv-detail-facts" aria-label="Equipment details">
          <div><small>Condition</small><strong>${label(i.condition_status)}</strong></div>
          <div><small>Rental rate</small><strong>${cash(i.rental_rate)}</strong><small>${unit(i.rate_type)}</small></div>
          <div><small>Deposit</small><strong>${cash(i.deposit_amount)}</strong></div>
          <div><small>Late penalty rate</small><strong>${cash(i.late_penalty_rate)}</strong></div>
        </section>
        <div class="inv-detail-actions" aria-label="Equipment actions">
          ${isActive(i) ? `<button class="primary" id="inv-detail-edit">Edit details &amp; rates</button>` : ''}
          <button class="secondary" id="inv-qr">QR label</button>
          ${!isActive(i) ? '<button class="secondary" id="inv-restore">Restore equipment</button><button class="inv-danger" id="inv-delete">Delete permanently</button>' : i.status === 'UNDER_MAINTENANCE' ? `<button class="secondary" id="inv-maintenance" ${locked ? 'disabled' : ''}>Complete maintenance</button>` : `<button class="secondary" id="inv-maintenance" ${locked || i.status !== 'AVAILABLE' ? 'disabled' : ''}>Start maintenance</button><button class="inv-danger" id="inv-archive" ${locked || Number(i.open_maintenance) > 0 ? 'disabled' : ''}>Archive</button>`}
        </div>
        ${locked ? '<div class="info-box">Active or pending rental: availability, condition, and archiving are locked until the rental/return workflow finishes.</div>' : ''}
        <section class="inv-history-list" aria-label="Equipment history">
          <details class="inv-history"><summary>Status history <span>${history.length}</span></summary>${history.map(v => `<div><strong>${v.old_status ? e(stateLabel(v.old_status)) + ' → ' : ''}${e(stateLabel(v.new_status))}</strong><small>${e(formatDate(v.changed_at))} · ${e(v.source)}</small></div>`).join('') || '<p>No status changes recorded.</p>'}</details>
          <details class="inv-history"><summary>Maintenance records <span>${maintenance.length}</span></summary>${maintenance.map(v => `<div><strong>${e(v.reason)} · ${label(v.status)}</strong><p>${e(v.details || 'No inspection notes yet.')}</p><small>Started ${e(formatDate(v.started_at))}${v.completed_at ? ' · Completed ' + e(formatDate(v.completed_at)) : ''}</small></div>`).join('') || '<p>No maintenance recorded.</p>'}</details>
          <details class="inv-history"><summary>Pricing history <span>${rates.length}</span></summary>${rates.map(v => `<div><strong>${cash(v.rental_rate)} ${unit(v.rate_type)} · Deposit ${cash(v.deposit_amount)}</strong><small>Late penalty ${cash(v.late_penalty_rate)} · Since ${e(formatDate(v.effective_from))}${v.effective_to ? ' · Ended ' + e(formatDate(v.effective_to)) : ''}</small></div>`).join('') || '<p>No rate configured.</p>'}</details>
        </section>
      </div>`);
      renderEquipmentImage(modal.querySelector('.inv-detail-art'), i); modal.querySelector('#inv-detail-edit')?.addEventListener('click', () => void form(i)); modal.querySelector('#inv-qr').onclick = () => qr(i);
      for (const action of ['archive', 'restore']) { const b = modal.querySelector('#inv-' + action); if (b) b.onclick = () => actionForm(i, action); }
      const mb = modal.querySelector('#inv-maintenance'); if (mb) mb.onclick = () => actionForm(i, i.status === 'UNDER_MAINTENANCE' ? 'complete-maintenance' : 'maintenance');
      modal.querySelector('#inv-delete')?.addEventListener('click', () => permanentDelete(i));
    } catch (err) { showModal('Equipment unavailable', errorBody(err)); }
  }
  function actionForm(i, action) {
    const maintenance = action.includes('maintenance'), complete = action === 'complete-maintenance', title = ({ archive: 'Archive equipment', restore: 'Restore equipment', maintenance: 'Start maintenance', 'complete-maintenance': 'Complete maintenance' })[action];
    showModal(title, `<form id="inv-action-form" class="inv-form"><p><strong>${e(i.name)}</strong> · ${e(i.item_code)}</p><p>${action === 'archive' ? 'This equipment will move to the Archive tab. Its rental, pricing, QR, and maintenance history stay available.' : action === 'restore' ? 'Return this equipment to the active collection as available.' : complete ? 'Record the inspection before making this equipment available again.' : 'Take this equipment out of circulation while it is serviced.'}</p>${maintenance ? `<label>${complete ? 'Inspection notes' : 'Maintenance reason'}<textarea name="reason" required maxlength="${complete ? 2000 : 255}" rows="3" placeholder="${complete ? 'Describe the repair and final inspection' : 'Describe what needs attention'}"></textarea></label><label>Condition<select name="condition">${(complete ? ['GOOD', 'FAIR'] : ['NEEDS_INSPECTION', 'DAMAGED', 'FAIR', 'GOOD']).map(c => `<option value="${c}">${label(c)}</option>`).join('')}</select></label>` : ''}<p class="inv-error" role="alert"></p><div class="inv-form-actions"><button type="button" class="secondary" id="inv-action-back">Back</button><button type="submit" class="${action === 'archive' ? 'inv-danger' : 'primary'}">${title}</button></div></form>`);
    modal.querySelector('#inv-action-back').onclick = () => details(i.id);
    const f = modal.querySelector('#inv-action-form');
    f.onsubmit = ev => { ev.preventDefault(); const payload = { ...Object.fromEntries(new FormData(f)), action, version: i.updated_at }; submit(f, () => api('/inventory/' + i.id + '/actions', { method: 'POST', body: JSON.stringify(payload) }), title + ' saved.', action === 'archive' ? () => { scope = 'archived'; status = 'all'; offset = 0; draw(); } : action === 'restore' ? () => { scope = 'active'; status = 'all'; offset = 0; draw(); } : null); };
    requireConfirmation(f, `${title}?`, `${action === 'archive' ? 'This moves equipment out of the active collection.' : action === 'restore' ? 'This returns the archived equipment to the active collection.' : complete ? 'This records the inspection and makes the item available again.' : 'This records a maintenance action and changes equipment availability.'}`, `Yes, ${title.toLowerCase()}`);
  }
  async function permanentDelete(i) {
    showModal('Delete equipment permanently?', `<form id="inv-delete-form" class="inv-form"><p><strong>${e(i.name)}</strong> · ${e(i.item_code)}</p><p>This permanently removes the equipment record from inventory. Past rentals, rates, and the audit trail remain saved. This cannot be undone.</p><p class="inv-error" id="inv-delete-error" role="alert"></p><div class="inv-form-actions"><button type="button" class="secondary" id="inv-delete-no">No, keep equipment</button><button type="button" class="inv-danger" id="inv-delete-yes">Yes, delete permanently</button></div></form>`);
    modal.querySelector('#inv-delete-no').onclick = () => details(i.id);
    modal.querySelector('#inv-delete-yes').onclick = async event => {
      const button = event.currentTarget, error = modal.querySelector('#inv-delete-error'); button.disabled = true; error.textContent = '';
      try {
        await api('/inventory/' + i.id, { method: 'DELETE', body: JSON.stringify({ version: i.updated_at }) });
        modal.close(); toast('Equipment deleted.'); scope = 'archived'; status = 'all'; offset = 0;
        try { await refreshInventory({ force: true }); } catch { toast('Equipment deleted. Use Refresh to update the archive list.'); }
      } catch (problem) { error.textContent = problem.message; button.disabled = false; }
    };
  }
  async function qr(i) {
    try {
      const q = await api('/inventory/' + i.id + '/qr');
      showModal('Equipment label preview', `<section class="inv-print-settings">
        <section class="inv-print-preview" aria-label="Label preview">
          <div class="inv-print-preview-heading"><div><strong>${e(i.name)}</strong><small>${e(i.item_code)}</small></div><span class="inv-print-size">50 × 30 mm</span></div>
          <div class="inv-print-preview-frame"><div class="inv-print-preview-label"><div class="inv-print-preview-art" id="inv-print-preview-art"><img id="inv-print-label-image" alt="QR code label preview"></div></div></div>
          <div class="inv-print-preview-meta"><span id="inv-qr-stock-summary"></span><span id="inv-print-measurement">Preview is enlarged · 50 × 30 mm artwork</span></div>
        </section>
        <div class="inv-print-controls">
          <section class="inv-printer-panel" id="inv-qr-printer-panel" aria-label="Printer connection">
            <div class="inv-printer-heading"><span class="inv-printer-symbol">${icon('bluetooth')}</span><div class="inv-printer-copy"><strong id="inv-qr-printer-state" role="status" aria-live="polite">Connect your printer</strong><small id="inv-qr-printer-description">Choose a Bluetooth printer to print this label.</small></div></div>
            <span class="inv-printer-status"><span class="inv-printer-state-dot" id="inv-qr-printer-dot" aria-hidden="true"></span><span id="inv-qr-printer-status-label">Not connected</span></span>
            <div class="inv-printer-actions"><button class="primary" id="inv-qr-connect" type="button">${icon('bluetooth')} Connect printer</button></div>
          </section>
          <section class="inv-print-options" aria-labelledby="inv-print-options-title">
            <h3 id="inv-print-options-title">Print settings</h3>
            <div class="inv-print-basic-settings"><label>Label type<select id="inv-qr-format"><option value="qr">QR code</option><option value="barcode">Barcode · Code 128</option></select></label><label>Paper type<select id="inv-qr-paper"><option value="continuous">Continuous · no gaps</option><option value="gapped">Precut · with gaps</option></select></label><label class="inv-print-darkness-setting">Print darkness<select id="inv-qr-darkness"><option value="light">Light · 75%</option><option value="medium">Medium · 90%</option><option value="dark">Dark · 100%</option></select></label></div>
            <p class="inv-print-help" id="inv-qr-paper-note"></p>
          </section>
          <details class="inv-print-advanced"><summary><span>${icon('settings')} Advanced settings</span>${icon('chevron')}</summary><div class="inv-print-calibration">
            <label id="inv-qr-start-setting">Start allowance (mm)<input id="inv-qr-start-feed" type="number" min="0" max="5" step="0.5" value="${qrPrintSettings.startFeedMm}" aria-describedby="inv-qr-feed-help"></label><label id="inv-qr-tear-setting">Tear allowance (mm)<input id="inv-qr-tear-feed" type="number" min="0" max="10" step="0.5" value="${qrPrintSettings.tearFeedMm}" aria-describedby="inv-qr-feed-help"></label>
            <p class="inv-print-help" id="inv-qr-feed-help">Blank paper before the artwork and extra paper for tearing.</p>
            <label>Horizontal offset (mm)<input id="inv-qr-offset-x" type="number" min="-5" max="5" step="0.5" value="${qrCalibration.offsetX}" aria-describedby="inv-qr-offset-help"></label><label>Vertical offset (mm)<input id="inv-qr-offset-y" type="number" min="-5" max="5" step="0.5" value="${qrCalibration.offsetY}" aria-describedby="inv-qr-offset-help"></label>
            <p class="inv-print-help" id="inv-qr-offset-help">Move the artwork within the label. QR offsets keep its white border intact.</p><button class="text-button" id="inv-qr-reset" type="button">Reset offsets</button>
            <div class="inv-print-sensor-setting" id="inv-qr-sensor-setting" hidden><button class="secondary" id="inv-qr-calibrate" type="button">${icon('settings')} Calibrate labels</button><small id="inv-qr-calibrate-help">Recalibrate after changing precut rolls.</small></div>
          </div></details>
          <div class="inv-printer-progress" id="inv-qr-printer-progress" hidden><progress id="inv-qr-progress" max="100" value="0" aria-label="Printer operation progress"></progress><span id="inv-qr-progress-label" role="status" aria-live="polite">Preparing label…</span></div>
          <p class="inv-print-note" id="inv-qr-printer-message" role="status" aria-live="polite" hidden></p>
        </div>
      </section><div class="inv-form-actions inv-print-actions"><p id="inv-qr-print-hint">Connect a printer, or download a PNG for Fun Print.</p><div class="inv-print-footer-buttons"><button class="secondary" id="inv-qr-back" type="button">Back</button><button class="secondary" id="inv-qr-download" type="button">${icon('download')} Download QR PNG</button><button class="primary" id="inv-qr-print" type="button" aria-describedby="inv-qr-print-hint" disabled>${icon('print')} Print label</button></div></div>`);
      const settings = modal.querySelector('.inv-print-settings'), message = modal.querySelector('#inv-qr-printer-message');
      const preview = modal.querySelector('#inv-print-preview-art'), previewImage = modal.querySelector('#inv-print-label-image'), formatSelect = modal.querySelector('#inv-qr-format'), downloadButton = modal.querySelector('#inv-qr-download');
      const paperSelect = modal.querySelector('#inv-qr-paper'), darknessSelect = modal.querySelector('#inv-qr-darkness'), startInput = modal.querySelector('#inv-qr-start-feed'), startSetting = modal.querySelector('#inv-qr-start-setting'), tearInput = modal.querySelector('#inv-qr-tear-feed'), tearSetting = modal.querySelector('#inv-qr-tear-setting');
      const panel = modal.querySelector('#inv-qr-printer-panel'), status = modal.querySelector('#inv-qr-printer-state'), description = modal.querySelector('#inv-qr-printer-description'), statusLabel = modal.querySelector('#inv-qr-printer-status-label');
      const connect = modal.querySelector('#inv-qr-connect'), calibrate = modal.querySelector('#inv-qr-calibrate'), print = modal.querySelector('#inv-qr-print'), printHint = modal.querySelector('#inv-qr-print-hint'), progressBox = modal.querySelector('#inv-qr-printer-progress');
      const fields = [['offsetX', '#inv-qr-offset-x'], ['offsetY', '#inv-qr-offset-y']];
      const controls = [paperSelect, darknessSelect, startInput, tearInput, formatSelect, ...fields.map(([, selector]) => modal.querySelector(selector)), modal.querySelector('#inv-qr-reset')];
      const bluetoothSupported = Boolean(window.isSecureContext && navigator.bluetooth);
      let unsubscribe = () => {};
      const cleanup = () => { unsubscribe(); modal.removeEventListener('close', cleanup); };
      const setMessage = (text = '', tone = 'info', source = 'action') => {
        if (!settings.isConnected) return;
        message.textContent = text; message.hidden = !text; message.dataset.tone = tone; message.dataset.source = source;
      };
      paperSelect.value = qrPrintSettings.paperMode; darknessSelect.value = qrPrintSettings.darkness;
      const syncPreview = ({ syncFields = true } = {}) => {
        const format = formatSelect.value, formatLabel = format === 'barcode' ? 'Code 128 barcode' : 'QR code', continuous = qrPrintSettings.paperMode === 'continuous';
        const printImage = format === 'qr' ? { qrGeometry: qrLabelGeometry } : {};
        qrCalibration = normalizeMx10LabelCalibration(qrCalibration, printImage);
        persistQrCalibration();
        for (const [key, selector] of fields) {
          const input = modal.querySelector(selector);
          input.min = normalizeMx10LabelCalibration({ [key]: -15 }, printImage)[key];
          input.max = normalizeMx10LabelCalibration({ [key]: 15 }, printImage)[key];
          if (syncFields) input.value = qrCalibration[key];
        }
        previewImage.src = `data:image/svg+xml,${encodeURIComponent(labelSvg(i, q, format))}`;
        previewImage.alt = `${formatLabel} label for ${i.item_code}`;
        preview.style.setProperty('--offset-x', `${qrCalibration.offsetX * 2}%`);
        preview.style.setProperty('--offset-y', `${qrCalibration.offsetY * 100 / 30}%`);
        settings.querySelector('#inv-qr-stock-summary').textContent = continuous ? `Continuous roll · ${qrPrintSettings.startFeedMm + 30 + qrPrintSettings.tearFeedMm} mm total feed` : 'Precut labels · automatic gap alignment';
        settings.querySelector('#inv-qr-paper-note').textContent = continuous ? `${qrPrintSettings.startFeedMm} mm before the artwork · ${qrPrintSettings.tearFeedMm} mm after it for tearing. Adjust these in Advanced settings.` : 'Align the first label at the print head. Calibrate in Advanced settings after changing rolls.';
        settings.querySelector('#inv-qr-offset-help').textContent = format === 'qr' ? 'Move the artwork within the label. QR offsets keep its white border intact.' : 'Move the artwork within the label. Check that the barcode stays inside the paper edges.';
        downloadButton.innerHTML = `${icon('download')} Download ${format === 'barcode' ? 'barcode' : 'QR'} PNG`;
      };
      const updatePrinterUi = state => {
        if (!settings.isConnected) { cleanup(); return; }
        const continuous = qrPrintSettings.paperMode === 'continuous', busy = state.printing || state.sensorSearching || state.aligning, blocked = state.connected && Boolean(state.paperOut || state.headHot);
        const connection = state.connected ? blocked ? 'warning' : 'connected' : state.reconnecting ? 'reconnecting' : state.connecting ? 'connecting' : 'disconnected';
        panel.dataset.connection = connection;
        status.textContent = state.connected ? state.name : state.reconnecting ? 'Reconnecting to printer…' : state.connecting ? 'Connecting to printer…' : 'Connect your printer';
        statusLabel.textContent = state.connected ? state.paperOut ? 'Out of paper' : state.headHot ? 'Cooling down' : 'Connected' : state.reconnecting ? 'Offline · retrying' : state.connecting ? 'Connecting' : 'Not connected';
        description.textContent = state.connected ? state.paperOut ? 'Load a label roll to continue printing.' : state.headHot ? 'Let the print head cool before trying again.' : busy ? 'Working on your label. Keep the printer on.' : 'Bluetooth connected. Ready to print your label.' : state.reconnecting ? 'Turn on your printer. This page will retry automatically.' : state.connecting ? 'Choose your printer in the Bluetooth picker.' : bluetoothSupported ? 'Choose a Bluetooth printer to print this label.' : 'Bluetooth printing needs Chrome or Edge over HTTPS.';
        connect.disabled = state.connecting || busy || (!bluetoothSupported && !state.connected && !state.reconnecting);
        connect.className = state.connected || state.reconnecting ? 'secondary' : 'primary';
        connect.innerHTML = `${icon('bluetooth')} ${state.connected ? 'Disconnect printer' : state.reconnecting ? 'Cancel reconnect' : state.connecting ? 'Connecting…' : 'Connect printer'}`;
        startSetting.hidden = !continuous;
        tearSetting.hidden = !continuous;
        settings.querySelector('#inv-qr-feed-help').hidden = !continuous;
        settings.querySelector('#inv-qr-sensor-setting').hidden = continuous;
        calibrate.disabled = continuous || !state.connected || !state.canCalibrate || busy || blocked;
        calibrate.innerHTML = `${icon('settings')} ${state.sensorSearching ? 'Calibrating…' : state.sensorCalibrated ? 'Recalibrate labels' : 'Calibrate labels'}`;
        settings.querySelector('#inv-qr-calibrate-help').textContent = !state.connected ? 'Connect a printer to calibrate precut labels.' : !state.canCalibrate ? 'Automatic calibration is unavailable for this printer.' : 'Recalibrate after changing precut rolls.';
        print.disabled = !state.connected || busy || blocked;
        print.setAttribute('aria-busy', String(state.printing || state.aligning));
        print.innerHTML = `${icon('print')} ${state.aligning ? 'Positioning…' : state.printing ? (state.progress >= 100 ? continuous ? 'Finishing print…' : 'Positioning label…' : 'Sending… ' + state.progress + '%') : 'Print label'}`;
        printHint.textContent = blocked ? state.paperOut ? 'Load paper to enable printing.' : 'Printing will be available when the printer cools down.' : busy ? 'Keep the printer on until this operation finishes.' : state.connected ? 'Ready to print. Your printer stays connected for the next label.' : state.reconnecting ? 'Waiting for your printer. You can still download the PNG.' : !bluetoothSupported ? 'Download the PNG for Fun Print, or open this page in Chrome or Edge.' : 'Connect a printer, or download a PNG for Fun Print.';
        for (const control of controls) control.disabled = busy;
        progressBox.hidden = !busy;
        settings.querySelector('#inv-qr-progress').value = state.sensorSearching ? state.sensorProgress : state.progress;
        settings.querySelector('#inv-qr-progress-label').textContent = state.sensorSearching ? `Finding label position · ${state.sensorProgress}%` : state.printing && state.progress >= 100 && continuous ? 'Finishing your label…' : state.aligning || state.printing && state.progress >= 100 ? 'Moving roll to the next label…' : state.printing ? `Sending print data · ${state.progress}%` : 'Preparing label…';
        if (!state.connected && message.dataset.tone === 'success') setMessage();
        if (state.connected && state.printerWarning) setMessage(state.printerWarning, 'warning', 'printer');
        else if (message.dataset.source === 'printer') setMessage();
      };
      const refreshPreview = (syncFields = true) => { syncPreview({ syncFields }); setMessage(); updatePrinterUi(printer.status()); };
      formatSelect.onchange = () => refreshPreview();
      for (const [key, selector] of fields) {
        const input = modal.querySelector(selector);
        const updateOffset = syncFields => {
          const value = input.valueAsNumber;
          if (Number.isFinite(value)) qrCalibration = cleanCalibration({ ...qrCalibration, [key]: value });
          refreshPreview(syncFields);
        };
        input.oninput = () => updateOffset(false);
        input.onchange = () => updateOffset(true);
      }
      modal.querySelector('#inv-qr-reset').onclick = () => { qrCalibration = { ...qrCalibrationDefaults }; refreshPreview(); };
      const updatePrintSettings = (syncFields = true) => {
        qrPrintSettings = normalizeMx10PrintSettings({ paperMode: paperSelect.value, darkness: darknessSelect.value, startFeedMm: Number.isFinite(startInput.valueAsNumber) ? startInput.valueAsNumber : qrPrintSettings.startFeedMm, tearFeedMm: Number.isFinite(tearInput.valueAsNumber) ? tearInput.valueAsNumber : qrPrintSettings.tearFeedMm });
        if (syncFields) { startInput.value = qrPrintSettings.startFeedMm; tearInput.value = qrPrintSettings.tearFeedMm; }
        persistQrPrintSettings(); refreshPreview(syncFields);
      };
      paperSelect.onchange = darknessSelect.onchange = () => updatePrintSettings();
      for (const input of [startInput, tearInput]) { input.oninput = () => updatePrintSettings(false); input.onchange = () => updatePrintSettings(); }
      syncPreview();
      unsubscribe = printer.subscribe(updatePrinterUi);
      modal.addEventListener('close', cleanup, { once: true });
      modal.querySelector('#inv-qr-back').onclick = () => { cleanup(); void details(i.id); };
      downloadButton.onclick = async () => {
        const format = formatSelect.value, printImage = format === 'qr' ? { qrMatrix: q.matrix, qrGeometry: qrLabelGeometry } : {};
        downloadButton.disabled = true;
        try { const png = await renderLabelPng(labelSvg(i, q, format), qrCalibration, printImage); download(png, 'image/png', `${i.item_code}-${format === 'barcode' ? 'barcode' : 'qr'}-label.png`); toast(`${format === 'barcode' ? 'Barcode' : 'QR'} PNG downloaded for Fun Print.`); }
        catch (err) { setMessage(err.message, 'error'); }
        finally { downloadButton.disabled = false; }
      };
      connect.onclick = async () => {
        setMessage();
        try { await printer.connect(); const state = printer.status(); if (state.connected) setMessage(`${state.name} is connected and ready.`, 'success'); else if (!state.reconnecting && !state.connecting) setMessage('Printer disconnected.'); }
        catch (err) { setMessage(err.message, 'error'); }
      };
      calibrate.onclick = async () => {
        setMessage('Finding the next label gap…');
        try { await printer.calibrateLabel(); setMessage('Label sensor calibrated. The current print position is unchanged.', 'success'); }
        catch (err) { setMessage(err.message, 'error'); }
        finally { updatePrinterUi(printer.status()); }
      };
      print.onclick = async () => {
        const printerName = printer.status().name, format = formatSelect.value;
        setMessage(`Checking paper and preparing the ${format === 'barcode' ? 'barcode' : 'QR'} label…`);
        try {
          const printImage = format === 'qr' ? { qrMatrix: q.matrix, qrGeometry: qrLabelGeometry } : {}, result = await printer.printLabel(labelSvg(i, q, format), qrCalibration, printImage, qrPrintSettings);
          setMessage(`${format === 'barcode' ? 'Barcode' : 'QR'} label sent to ${printerName}. ${result.paperMode === 'continuous' ? 'Tear the label at the printer edge.' : 'The next label is positioned.'}`, 'success');
          toast(`${format === 'barcode' ? 'Barcode' : 'QR'} label sent; printer remains connected.`);
        } catch (err) { setMessage(err.message, 'error'); }
        finally { updatePrinterUi(printer.status()); }
      };
    } catch (err) { showModal('Equipment label unavailable', errorBody(err)); }
  }
  async function saveQrSheet(items) { if (!items.length) return; try { const result = await api('/inventory/qr-labels'), labels = new Map(result.items.map(item => [String(item.id), item])); download(qrSheet(items, labels, { ...qrCalibration, ...qrPrintSettings }), 'text/html;charset=utf-8', `rent-play-qr-labels-${new Date().toISOString().slice(0, 10)}.html`); toast(`Printable QR sheet saved for ${items.length} equipment item${items.length === 1 ? '' : 's'}. Open it and choose Print labels.`); } catch (err) { showModal('QR sheet unavailable', errorBody(err)); } }
  return { mount, refresh: refreshInventory, reset: resetCache };
}

// Keep the inventory controls mounted while records change in the background.
function createInventoryView(root, h) {
  const { escape: e, icon, symbol, badge, stateLabel, cash, unit, label, isActive, renderEquipmentImage } = h;
  const statuses = [['all', 'All statuses'], ['AVAILABLE', 'Available'], ['RENTED', 'Rented'], ['RESERVED_PENDING', 'Pending verification'], ['UNDER_MAINTENANCE', 'Under maintenance'], ['archived', 'Archived']];
  const sortOptions = [['name-asc', 'Name A–Z'], ['name-desc', 'Name Z–A'], ['newest', 'Newest first'], ['rate-asc', 'Rental rate: low to high'], ['rate-desc', 'Rental rate: high to low']];
  root.removeAttribute('aria-live'); root.removeAttribute('aria-busy');
  root.innerHTML = `<div class="inv-stats">${[['In collection', 'box'], ['Available', 'grid'], ['Out / reserved', 'clock'], ['In maintenance', 'settings']].map(([name, glyph], index) => `<div class="panel inv-stat"><span>${icon(glyph)}</span><div><small>${name}</small><strong data-inv-stat="${index}">0</strong></div></div>`).join('')}</div>
    <section class="panel inv-collection">
      <div class="inv-toolbar"><label class="inv-search">${icon('search')}<input id="inv-search" aria-label="Search equipment" placeholder="Search name, code, or description"/></label>
        <div class="inv-tools"><button type="button" class="secondary" id="inv-qr-export" title="Download a printable sheet containing a QR label for every equipment item.">Save all QR labels</button><button type="button" class="secondary" id="inv-export">${icon('chart')} Export CSV</button><div class="inv-view" aria-label="Inventory view"><button type="button" id="inv-table" aria-label="Table view">☰</button><button type="button" id="inv-grid" aria-label="Card view">${icon('grid')}</button></div><button type="button" class="primary" id="inv-add">＋ Add equipment</button></div>
      </div>
      <div class="inv-filters"><label>Category<select id="inv-category"><option value="">All categories</option></select></label><label>Status<select id="inv-status">${statuses.map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}</select></label><label>Sort by<select id="inv-sort">${sortOptions.map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}</select></label><button type="button" class="text-button" id="inv-clear">Reset filters</button><span id="inv-result-count" role="status" aria-live="polite"></span></div>
      <p class="inv-error" id="inv-sync-error" role="status" hidden></p>
      <div data-inv-results></div>
      <div class="table-footer"><span id="inv-page-summary"></span><div class="inv-pagination"><button type="button" class="secondary" id="inv-prev">← Previous</button><button type="button" class="secondary" id="inv-next">Next →</button></div></div>
    </section><p class="inv-footnote">Open equipment details to view or print its QR label, or save a printable sheet for all equipment.</p>`;

  const searchInput = root.querySelector('#inv-search'), categoryInput = root.querySelector('#inv-category'), statusInput = root.querySelector('#inv-status'), sortInput = root.querySelector('#inv-sort');
  const results = root.querySelector('[data-inv-results]'), signatures = new WeakMap();
  let resultMode = '', categorySignature = '', currentState;
  searchInput.oninput = event => h.onSearch(event.target.value);
  categoryInput.onchange = event => h.onCategory(event.target.value);
  statusInput.onchange = event => h.onStatus(event.target.value);
  sortInput.onchange = event => h.onSort(event.target.value);
  categoryInput.onblur = () => { if (currentState) syncCategories(currentState); };
  root.onclick = event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.invDetail) return h.onDetails(button.dataset.invDetail);

    const actions = { 'inv-add': h.onAdd, 'inv-clear': h.onReset, 'inv-empty-action': h.onEmptyAction, 'inv-export': h.onExport, 'inv-qr-export': h.onQrExport, 'inv-table': () => h.onView('table'), 'inv-grid': () => h.onView('grid'), 'inv-prev': h.onPrevious, 'inv-next': h.onNext };
    actions[button.id]?.();
  };

  function syncCategories(state) {
    const signature = JSON.stringify(state.categories.map(category => [String(category.id), category.name]));
    // Leave an open native select alone; apply new options when it closes.
    if (signature !== categorySignature && document.activeElement !== categoryInput) {
      categoryInput.innerHTML = '<option value="">All categories</option>' + state.categories.map(category => `<option value="${e(category.id)}">${e(category.name)}</option>`).join('');
      categorySignature = signature;
    }
    if (categoryInput.value !== state.cat) categoryInput.value = state.cat;
  }

  const statusText = item => stateLabel(item.effective_status || item.status || 'Unknown');
  const signature = item => JSON.stringify([item.name, item.item_code, item.category, item.effective_status, item.status, item.condition_status, item.rate_type, item.rental_rate, item.deposit_amount, item.image_data || '', isActive(item)]);
  function itemNode(item, mode) {
    const node = document.createElement(mode === 'grid' ? 'article' : 'tr');
    node.dataset.invItem = String(item.id);
    if (mode === 'grid') {
      node.className = 'inv-card';
      node.innerHTML = `<div class="inv-art">${symbol(item.category)}${badge(statusText(item))}</div><small>${e(item.category)} · ${e(item.item_code)}</small><h3><button type="button" class="inv-item-name" data-inv-detail="${e(item.id)}" aria-haspopup="dialog">${e(item.name)}</button></h3><p>${label(item.condition_status)} condition</p><div class="inv-price"><strong>${cash(item.rental_rate)}</strong><small>${unit(item.rate_type)}</small></div>`;
      renderEquipmentImage(node.querySelector('.inv-art'), item, { keepBadge: true });
    } else {
      node.innerHTML = `<td><div class="item-cell"><span class="item-symbol">${symbol(item.category)}</span><div><button type="button" class="inv-item-name" data-inv-detail="${e(item.id)}" aria-haspopup="dialog">${e(item.name)}</button><small>${e(item.item_code)} · ${e(item.category)}</small></div></div></td><td>${badge(statusText(item))}<small>${label(item.condition_status)} condition</small></td><td><strong>${cash(item.rental_rate)}</strong><small>${unit(item.rate_type)}</small></td><td>${cash(item.deposit_amount)}</td>`;
      renderEquipmentImage(node.querySelector('.item-symbol'), item);
    }
    signatures.set(node, signature(item));
    return node;
  }

  function syncItems(container, shown, mode) {
    const existing = new Map(Array.from(container.children, node => [node.dataset.invItem, node]));
    shown.forEach((item, index) => {
      const key = String(item.id);
      let node = existing.get(key);
      if (!node || signatures.get(node) !== signature(item)) {
        const next = itemNode(item, mode);
        if (node) node.replaceWith(next);
        node = next;
      }
      const position = container.children[index];
      if (position !== node) container.insertBefore(node, position || null);
      existing.delete(key);
    });
    for (const node of existing.values()) node.remove();
  }

  function update(state) {
    currentState = state;
    const { records, rows, shown, search, cat, status, scope, sort, view, offset, pageSize, syncError } = state;
    const text = (selector, value) => { const node = root.querySelector(selector); if (node.textContent !== value) node.textContent = value; };
    // Assign only differing values so typing, selection and composition stay intact.
    if (searchInput.value !== search) searchInput.value = search;
    const selectedStatus = scope === 'archived' ? 'archived' : status;
    if (statusInput.value !== selectedStatus) statusInput.value = selectedStatus;
    if (sortInput.value !== sort) sortInput.value = sort;
    syncCategories(state);
    const scopedRecords = records.filter(item => scope === 'archived' ? !isActive(item) : isActive(item));
    const effectiveStatus = item => item.effective_status || item.status;
    const active = records.filter(isActive), counts = [active.length, active.filter(item => effectiveStatus(item) === 'AVAILABLE').length, active.filter(item => ['RENTED', 'RESERVED_PENDING'].includes(effectiveStatus(item))).length, active.filter(item => effectiveStatus(item) === 'UNDER_MAINTENANCE').length];
    root.querySelectorAll('[data-inv-stat]').forEach((node, index) => { if (node.textContent !== String(counts[index])) node.textContent = counts[index]; });
    text('#inv-result-count', `${rows.length} equipment item${rows.length === 1 ? '' : 's'}`);
    text('#inv-page-summary', `${rows.length ? `${offset + 1}–${Math.min(offset + pageSize, rows.length)} of ${rows.length}` : '0 items'} · Page ${rows.length ? Math.floor(offset / pageSize) + 1 : 0} of ${Math.ceil(rows.length / pageSize)}`);
    root.querySelector('#inv-prev').disabled = offset === 0;
    root.querySelector('#inv-next').disabled = offset + pageSize >= rows.length;
    root.querySelector('#inv-export').disabled = !rows.length;
    root.querySelector('#inv-clear').disabled = !search && !cat && status === 'all' && scope === 'active';
    root.querySelector('#inv-qr-export').disabled = !records.length;
    text('#inv-qr-export', `Save all QR labels (${records.length})`);
    root.querySelector('#inv-table').setAttribute('aria-pressed', String(view === 'table'));
    root.querySelector('#inv-grid').setAttribute('aria-pressed', String(view === 'grid'));
    const error = root.querySelector('#inv-sync-error');
    error.hidden = !syncError;
    text('#inv-sync-error', syncError ? `${syncError} Your current view is kept. Use Refresh to try again.` : '');

    const mode = shown.length ? view : scopedRecords.length ? 'filtered-empty' : 'empty';
    if (mode !== resultMode) {
      if (mode === 'table') results.innerHTML = '<div class="table-scroll"><table class="inv-table"><thead><tr><th>EQUIPMENT</th><th>STATUS / CONDITION</th><th>RENTAL RATE</th><th>DEPOSIT</th></tr></thead><tbody></tbody></table></div>';
      else if (mode === 'grid') results.innerHTML = '<div class="inv-card-grid"></div>';
      else results.innerHTML = `<div class="inv-empty"><span>${icon('box')}</span><h3>${scopedRecords.length ? 'No equipment matches this view' : scope === 'archived' ? 'Your archive is empty' : 'Your collection starts here'}</h3><p>${scopedRecords.length ? 'Try another category, status, or search.' : scope === 'archived' ? 'Archived equipment will appear here. You can restore it or permanently delete it.' : 'Add your first equipment with its rate and details.'}</p><button type="button" class="secondary" id="inv-empty-action">${scopedRecords.length ? 'Reset filters' : scope === 'archived' ? 'View equipment' : '＋ Add equipment'}</button></div>`;
      resultMode = mode;
    }
    if (shown.length) syncItems(results.querySelector(mode === 'grid' ? '.inv-card-grid' : 'tbody'), shown, mode);
  }

  return { root, update };
}
