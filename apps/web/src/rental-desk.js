import { bindQrReaders, bindInspectionPhotos } from './qr-reader.js';
import { manilaDateTimeIso } from './date-time.js';
import { createReleaseVerification } from './release-verification.js';

// Keep these choices aligned with the Android customer checkout resort list.
const pickupLocations = [
  'Shop pickup',
  'ASRI Hotspring Resort',
  '23 Prime Resort',
  'Springcrest Villa',
  'Casa Argela Hotspring Resort',
  'Kumo Villa',
  'El Stefano Hotspring Resort',
  'The Bloomfield Villa',
  'MYJC Resort',
  'Victoria Arya Hotspring Resort',
  'The House at Bluestone',
  'One Pansol Hotspring Resort',
  'Kasaya Private Resort',
  'The Pines Villas',
  'Villa Alyssa Hotspring Resort',
  'Casa Fides',
  'Other / Custom Resort',
];

const cameraIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 5 6 8H3v12h18V8h-3l-2-3Z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const qrIcon = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M4 19V4h15M45 4h15v15M60 45v15H45M19 60H4V45"/><path d="M14 14h12v12H14zM38 14h12v12H38zM14 38h12v12H14z"/><path d="M38 36h6v8h8M36 50h8v-6M50 36v6M50 50v3M32 18v14H18M32 38v8"/></svg>';

export function renderBookingPrice(quote, { escape: e, money }) {
  const amount = value => typeof value === 'number' && Number.isFinite(value) ? e(money(value)) : 'Not available';
  const total = typeof quote.rental_fee === 'number' && typeof quote.deposit_amount === 'number' ? quote.rental_fee + quote.deposit_amount : null;
  return `<section class="rental-booking-price"><h3>Price summary</h3><dl><div><dt>Rental fee</dt><dd>${amount(quote.rental_fee)}</dd></div><div><dt>Refundable deposit</dt><dd>${amount(quote.deposit_amount)}</dd></div><div class="rental-price-total"><dt>Due at handoff</dt><dd>${amount(total)}</dd></div></dl><p>Package covers ${e(quote.billed_minutes)} minutes. The clock starts at physical handoff.</p><small>The deposit is separate from rental charges and refundable after inspection, subject to outstanding charges.</small></section>`;
}
export const rentalOperationKey = () => globalThis.crypto.randomUUID().replaceAll('-', '');
export function createRentalDesk(h) {
  const { api, escape: e, showModal: openModal, modal, toast, model: getModel, refresh, redraw, confirmSubmit } = h;
  function showModal(title, content) {
    openModal(title, content);
    const form = modal.querySelector('.rental-desk-form:not(.rental-release-form)');
    if (!form?.ownerDocument) return;
    const scroll = form.ownerDocument.createElement('div');
    scroll.className = 'rental-form-scroll';
    for (const child of [...form.children]) {
      if (!child.classList.contains('form-actions') && !child.classList.contains('form-error')) scroll.append(child);
    }
    form.prepend(scroll);
  }
  const scannedBookings = new Map(), scannedInventory = new Map();
  const options = (records, label) => records.map(row => `<option value="${e(row.id)}">${e(label(row))}</option>`).join('');
  const actions = label => `<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">${label}</button></div>`;
  const scanField = (name, label, value = '') => `<div class="rental-scan-field"><label>${label}<input name="${name}" maxlength="256" value="${e(value)}" placeholder="Scan a QR or enter its printed code" required autocomplete="off"/></label><button type="button" class="secondary" data-scan-field="${name}">${cameraIcon} Scan with camera</button></div>`;
  const manualControls = '<label class="pricing-check"><input type="checkbox" name="manualLookup"/> Use printed rental/equipment codes</label><label data-manual-reason hidden>Manual lookup reason (optional)<textarea name="manualReason" maxlength="1000"></textarea></label><p data-camera-status role="status"></p>';
  const inspectionControls = release => release ? `<section class="rental-inspection rental-release-inspection"><div class="rental-section-heading"><h3>Quick equipment check</h3><p>Confirm condition and included accessories before handoff.</p></div><div class="rental-release-inspection-grid"><label>Condition<select name="condition" required><option value="GOOD">Good</option><option value="FAIR">Fair</option></select></label><label class="pricing-check rental-accessory-check"><input name="accessoriesChecked" type="checkbox" required/><span>Accessories checked<small>Unit and included pieces are present.</small></span></label></div><details class="rental-inspection-more"><summary>Add optional notes or photos</summary><label>Inspection notes <small>Optional</small><textarea name="inspectionNotes" maxlength="2000" rows="2" placeholder="Record any marks or details for the return inspection."></textarea></label><label class="rental-photo-picker">Inspection photos <small>Optional · up to 2 images</small><input type="file" accept="image/*" capture="environment" multiple data-inspection-photos/></label><div class="inspection-photo-preview" data-photo-preview></div></details></section>` : `<section class="rental-inspection"><div class="rental-section-heading"><h3>Equipment inspection</h3><p>Check the condition and count all included accessories.</p></div><div class="rental-inspection-grid"><label>Condition<select name="condition" required><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option><option value="NEEDS_INSPECTION">Needs inspection / preparation</option></select></label><label>Next equipment status<select name="result"><option value="AVAILABLE">Available for rental</option><option value="UNDER_MAINTENANCE">Under maintenance / inspection</option></select></label><label class="pricing-check rental-accessory-check"><input name="accessoriesChecked" type="checkbox" required/><span>Equipment and accessories checked<small>I checked the physical unit and all included pieces.</small></span></label><label>Inspection notes<textarea name="inspectionNotes" maxlength="2000" required rows="3" placeholder="Record condition, accessories, and any existing marks."></textarea></label><label class="rental-photo-picker">Inspection photos <small>Optional · up to 2 images</small><input type="file" accept="image/*" capture="environment" multiple data-inspection-photos/></label><div class="inspection-photo-preview" data-photo-preview></div></div></section>`;
  function bindManual(form, row, needsBooking) {
    bindQrReaders(form, modal);
    const checkbox = form.elements.manualLookup;
    if (checkbox) checkbox.onchange = () => {
      const manual = checkbox.checked; form.querySelector('[data-manual-reason]').hidden = !manual;
      if (manual && row) {
        const itemId = row.item_id || row.itemId;
        const currentItem = (getModel().items || []).find(item => String(item.id) === String(itemId));
        if (needsBooking) form.elements.transactionCode.value = row.rental_code || row.id;
        form.elements.inventoryCode.value = currentItem?.item_code || currentItem?.qrCode || row.item_code || itemId;
      }
      else { if (needsBooking) form.elements.transactionCode.value = ''; form.elements.inventoryCode.value = ''; form.elements.manualReason.value = ''; }
    };
  }
  async function saved(response, label, next) {
    modal.close(); let fresh = true;
    try { await refresh(); } catch { fresh = false; }
    redraw(); toast(fresh ? label : `${label} Refresh to see the latest records.`);
    if (next) next(response.rental);
  }
  function submit(form, title, description, callback, { confirm = true } = {}) {
    const key = rentalOperationKey();
    form.querySelector('[data-close]').onclick = () => modal.close();
    if (!confirm) {
      let busy = false;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !form.isConnected || !form.reportValidity()) return;
        busy = true;
        const button = form.querySelector('[type="submit"]'), error = form.querySelector('.form-error');
        button.disabled = true; error.textContent = '';
        try { await callback(Object.fromEntries(new FormData(form)), key); }
        catch (problem) { if (form.isConnected) { error.textContent = problem.message; button.disabled = false; } }
        finally { busy = false; }
      });
      return;
    }
    confirmSubmit(form, { title, description, confirmLabel: 'Confirm' }, async () => {
      const button = form.querySelector('[type="submit"]'), error = form.querySelector('.form-error'); button.disabled = true; error.textContent = '';
      try { await callback(Object.fromEntries(new FormData(form)), key); }
      catch (problem) { error.textContent = problem.message; button.disabled = false; }
    });
  }
  function bookingForm() {
    const model = getModel();
    const items = (model.items || []).filter(item => item.is_active !== false && item.status === 'AVAILABLE' && !item.reserved_rental_id && !(model.transactions || []).some(row => row.item_id === item.id && ['ACTIVE','APPROVED','RETURN_PENDING_INSPECTION','PENDING_ADMIN_APPROVAL','PENDING_VERIFICATION'].includes(row.status)));
    const customers = (model.customers || []).filter(row => row.is_active !== false);
    if (!items.length || !customers.length) { showModal('Rental setup', '<p>Add an active customer and available equipment before preparing a counter rental.</p>'); return; }
    showModal('Prepare counter rental', `<form class="admin-form rental-desk-form"><p>Save a rental for the customer and selected resort. The rental clock starts at physical handoff.</p><label>Equipment<select name="itemId" required>${options(items, row => `${row.name} · ${row.item_code}`)}</select></label><label>Customer<select name="customerId" required>${options(customers, row => row.full_name)}</select></label><label>Pricing option<select name="mode"><option value="TIMED">Timed rental</option><option value="WHOLE_STAY">Whole stay until resort checkout</option></select></label><label data-duration>Requested duration (minutes)<input name="durationMinutes" type="number" value="60" min="1" max="10080" required/></label><label data-checkout hidden>Resort checkout time<input name="resortCheckoutAt" type="datetime-local"/><small>Philippine time.</small></label><label>Delivery location<select name="deliveryLocation" required>${pickupLocations.map(location => `<option value="${e(location)}">${e(location)}</option>`).join('')}</select></label><label>Payment method<select name="paymentMethod"><option value="CASH">Cash</option><option value="QR">InstaPay QR</option></select></label><label data-custom-resort hidden>Resort name / location<input name="customResort" maxlength="180" placeholder="Enter the resort name or location" disabled/></label><p class="rental-payment-note">Payment is recorded only after it is received and verified at the resort handoff.</p><div data-quote-preview role="status"></div><button type="button" class="secondary" data-quote>Update price</button>${actions('Save rental')}</form>`);
    const form = modal.querySelector('form'), price = form.querySelector('[data-quote-preview]'), previewButton = form.querySelector('[data-quote]'), saveButton = form.querySelector('[type="submit"]');
    form.querySelector('.form-actions').insertAdjacentHTML('afterbegin', '<div class="rental-footer-total"><small>Due at handoff</small><strong data-booking-total>Updating…</strong></div>');
    const footerTotal = form.querySelector('[data-booking-total]');
    let quote, revision = 0;
    const payload = () => ({ itemId: form.elements.itemId.value, customerId: form.elements.customerId.value, mode: form.elements.mode.value, durationMinutes: Number(form.elements.durationMinutes.value), deliveryLocation: form.elements.deliveryLocation.value === 'Other / Custom Resort' ? form.elements.customResort.value.trim() : form.elements.deliveryLocation.value, paymentMethod: form.elements.paymentMethod.value, ...(form.elements.mode.value === 'WHOLE_STAY' ? { resortCheckoutAt: manilaDateTimeIso(form.elements.resortCheckoutAt.value) } : {}) });
    const invalidate = () => { revision++; quote = null; footerTotal.textContent = 'Update price'; saveButton.disabled = true; previewButton.disabled = false; previewButton.textContent = 'Update price'; price.innerHTML = '<p class="rental-price-placeholder">Update the price summary to review this rental.</p>'; };
    const modeChange = () => {
      invalidate(); const whole = form.elements.mode.value === 'WHOLE_STAY';
      form.querySelector('[data-duration]').hidden = whole; form.querySelector('[data-checkout]').hidden = !whole;
      form.elements.durationMinutes.required = !whole; form.elements.resortCheckoutAt.required = whole;
    };
    const itemChange = () => {
      const item = items.find(row => row.id === form.elements.itemId.value), product = model.pricing?.products?.find(row => row.id === item?.pricing_product_id);
      const whole = product?.rate_options?.some(rate => rate.kind === 'WHOLE_STAY');
      form.elements.mode.querySelector('[value="WHOLE_STAY"]').disabled = !whole;
      if (!whole) form.elements.mode.value = 'TIMED';
      modeChange();
    };
    form.elements.itemId.onchange = itemChange; form.elements.mode.onchange = modeChange; itemChange();
    const locationChange = () => {
      const custom = form.elements.deliveryLocation.value === 'Other / Custom Resort';
      const input = form.elements.customResort;
      form.querySelector('[data-custom-resort]').hidden = !custom;
      input.disabled = !custom; input.required = custom;
      input.setCustomValidity(custom && !input.value.trim() ? 'Enter the resort name or location.' : '');
    };
    form.elements.deliveryLocation.onchange = () => { locationChange(); invalidate(); };
    form.elements.customResort.addEventListener('input', locationChange);
    locationChange();
    form.addEventListener('input', invalidate);
    async function preview() {
      if (!form.reportValidity()) return;
      const version = ++revision;
      saveButton.disabled = true; previewButton.disabled = true; previewButton.textContent = 'Checking price…';
      footerTotal.textContent = 'Updating…';
      form.querySelector('.form-error').textContent = '';
      try {
        const response = await api('/pricing/quote', { method: 'POST', body: JSON.stringify(payload()) });
        if (version !== revision || !form.isConnected || !modal.open) return;
        quote = response.quote;
        price.innerHTML = renderBookingPrice(quote, h);
        footerTotal.textContent = h.money(quote.rental_fee + quote.deposit_amount);
        saveButton.disabled = false;
      } catch (error) {
        if (version === revision && form.isConnected) { form.querySelector('.form-error').textContent = error.message; footerTotal.textContent = 'Unavailable'; quote = null; }
      } finally {
        if (version === revision && form.isConnected) { previewButton.disabled = false; previewButton.textContent = 'Update price'; }
      }
    }
    previewButton.onclick = preview;
    submit(form, 'Save this counter rental?', 'The rental waits for physical handoff. Its rental clock has not started.', async (_fields, key) => {
      if (!quote) throw new Error('Update and review the price summary before saving.');
      await saved(await api('/rental-bookings', { method: 'POST', body: JSON.stringify({ ...payload(), requestKey: key, expectedQuote: { rentalFee: quote.rental_fee, depositAmount: quote.deposit_amount, billedMinutes: quote.billed_minutes } }) }), 'Counter rental saved. Prepare the equipment before delivery.');
    });
    preview();
  }
  function reviewForm(row, action) {
    const approve = action === 'APPROVE';
    if (approve && row.payment_method === 'QR') {
      if (row.payment_proof_status === 'PENDING_REVIEW') { paymentProofReviewForm(row); return; }
      if (row.payment_proof_status !== 'VERIFIED') { toast('Waiting for the customer to upload a corrected payment screenshot.'); return; }
    }
    showModal(approve ? 'Approve rental request' : 'Reject rental request', `<form class="admin-form rental-desk-form"><p>${e(row.item_name)} · ${e(row.customer_name)} · ${e(row.rental_code || row.id)}</p>${approve ? '<p>Approval reserves the equipment. Confirm any outstanding payment and deposit at handoff; the rental timer starts when you confirm delivery.</p><label>Review notes<textarea name="notes" maxlength="1000"></textarea></label>' : '<label>Reason (optional)<textarea name="reason" maxlength="1000" rows="3"></textarea></label>'}${actions(approve ? 'Approve rental request' : 'Reject rental request')}</form>`);
    const form = modal.querySelector('form');
    submit(form, approve ? 'Approve this rental request?' : 'Reject this rental request?', approve ? 'The equipment stays reserved until preparation and handoff or expiry.' : 'The reservation will be released. Verified payments remain recorded for refund.', async fields => saved(await api(`/mobile/rentals/${encodeURIComponent(row.id)}/review`, { method: 'POST', body: JSON.stringify(approve ? { action, notes: fields.notes } : { action, reason: fields.reason }) }), approve ? 'Rental request approved. Prepare the equipment for delivery.' : 'Rental request rejected.'));
  }
  async function paymentProofReviewForm(row) {
    showModal('Review QR payment', `<form class="admin-form rental-desk-form"><p>Rental request · ${e(row.rental_code || row.id)} · ${e(row.customer_name)}</p><p>Expected transfer: <strong>${e(h.money(Number(row.rental_fee || 0) + Number(row.deposit_amount || 0)))}</strong></p><div data-proof-content>Loading payment screenshot…</div><label>Review note<textarea name="notes" maxlength="1000" rows="2"></textarea></label><label data-proof-reject-reason hidden>Why is this proof being rejected?<textarea name="reason" maxlength="1000" rows="3"></textarea></label><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Close</button><button type="button" class="secondary" data-reject-proof>Reject proof</button><button type="button" class="primary" data-verify-proof>Verify payment &amp; approve request</button></div></form>`);
    const form = modal.querySelector('form'), verify = form.querySelector('[data-verify-proof]'), reject = form.querySelector('[data-reject-proof]'), error = form.querySelector('.form-error');
    form.querySelector('[data-close]').onclick = () => modal.close();
    try {
      const result = await api(`/rentals/${encodeURIComponent(row.id)}/payment-proof`);
      if (!form.isConnected) return;
      const proof = result.proof || {};
      form.querySelector('[data-proof-content]').innerHTML = `${proof.reference ? `<p>Transfer reference: <strong>${e(proof.reference)}</strong></p>` : '<p>No transfer reference provided.</p>'}${proof.image_data_url ? `<img class="rental-payment-proof-image" alt="Customer payment screenshot" src="${e(proof.image_data_url)}"/>` : '<p class="form-error">No image was attached.</p>'}`;
    } catch (problem) {
      form.querySelector('[data-proof-content]').innerHTML = `<p class="form-error">${e(problem.message)}</p>`;
      verify.disabled = true; reject.disabled = true; return;
    }
    const run = async action => {
      if (verify.disabled || reject.disabled) return;
      const reason = form.elements.reason?.value.trim() || '';
      if (action === 'REJECT' && !reason) { form.querySelector('[data-proof-reject-reason]').hidden = false; form.elements.reason.required = true; error.textContent = 'Enter why the screenshot cannot be verified.'; form.elements.reason.focus(); return; }
      verify.disabled = reject.disabled = true; error.textContent = '';
      try {
        await saved(await api(`/rentals/${encodeURIComponent(row.id)}/payment-review`, { method: 'POST', body: JSON.stringify({ action, ...(action === 'REJECT' ? { reason } : { notes: form.elements.notes.value }) }) }), action === 'VERIFY' ? 'Payment verified. Rental request approved.' : 'Payment proof rejected. The customer can upload a new screenshot.');
      } catch (problem) { if (form.isConnected) { error.textContent = problem.message; verify.disabled = reject.disabled = false; } }
    };
    verify.onclick = () => run('VERIFY');
    reject.onclick = () => { if (form.querySelector('[data-proof-reject-reason]').hidden) { form.querySelector('[data-proof-reject-reason]').hidden = false; form.elements.reason.required = true; form.elements.reason.focus(); return; } run('REJECT'); };
  }
  function prepareForm(row) {
    if (!row || row.status !== 'APPROVED') { toast('Approve the rental request before preparing the equipment.'); return; }
    showModal('Prepare equipment for delivery', `<form class="admin-form rental-desk-form"><p>${e(row.item_name)} · ${e(row.customer_name)}</p><p>Scan the assigned unit’s printed QR at the shop. This marks it ready for delivery and does not start the rental timer.</p>${scanField('inventoryCode','Assigned equipment QR')}${manualControls}${actions('Mark ready for delivery')}</form>`);
    const form = modal.querySelector('form'); bindManual(form, row, false);
    submit(form, 'Prepare this equipment?', `${row.item_name} (${row.item_code}) will be marked ready for delivery to ${row.delivery_location || 'the customer'}. The rental timer stays stopped.`, async fields => saved(await api(`/rentals/${encodeURIComponent(row.id)}/prepare-delivery`, { method: 'POST', body: JSON.stringify({ inventoryCode: fields.inventoryCode, ...(fields.manualLookup === 'on' ? { manualLookup: true, manualReason: fields.manualReason } : {}) }) }), 'Equipment verified and ready for delivery.'), { confirm: false });
  }
  function releaseForm(row) {
    if (!row || row.status !== 'APPROVED' || row.delivery_status !== 'PREPARED') { toast('Prepare the assigned equipment at the shop before confirming delivery.'); return; }
    const amount = value => e(h.money(Number(value || 0)));
    showModal('Confirm resort handoff', `<form class="admin-form rental-desk-form rental-release-form">
      <ol class="rental-release-steps" aria-label="Handoff progress">${['Customer rental QR', 'Confirm handoff'].map((label, i) => `<li data-release-step="${i + 1}" ${i === 0 ? 'aria-current="step"' : ''}><span>${i + 1}</span><strong>${label}</strong></li>`).join('')}</ol>
      <div class="rental-flow-summary"><div><small>Rental request · ${e(row.rental_code || row.id)}</small><strong>${e(row.item_name)}</strong><span>${e(row.customer_name)} · ${e(row.delivery_location || 'Shop pickup')}</span></div><span class="rental-timer-note">Timer starts at handoff</span></div>
      <div class="rental-flow-scroll">
        <section class="rental-scan-panel" data-release-panel="1"><span class="rental-step-caption">STEP 1 OF 2</span><h3>Scan customer rental QR</h3><p>Open My Rentals on the customer’s phone and scan the handoff code. The unit is already verified.</p><div class="rental-scan-entry"><label>Customer rental QR<input name="transactionCode" maxlength="256" autocomplete="off" placeholder="Scan the QR shown in My Rentals" required/></label><button type="button" class="primary" data-scan-field="transactionCode">${cameraIcon}<span>Scan customer QR</span></button></div><label class="pricing-check rental-manual-toggle"><input type="checkbox" name="manualLookup"/><span>Use a printed rental code</span></label><label data-manual-reason hidden>Reason for manual verification (optional)<textarea name="manualReason" maxlength="1000" rows="2" placeholder="For example: camera unavailable"></textarea></label><p data-camera-status="transactionCode" role="status"></p></section>
        <section data-release-panel="2" hidden><div class="rental-verified-notice"><span>✓</span><div><strong>Rental and prepared unit verified</strong><small>${e(row.item_name)} · ${e(row.customer_name)}</small></div></div><fieldset class="rental-release-checks" data-release-checks disabled><div class="rental-section-heading"><h3>Confirm the physical handoff</h3><p>Check the customer and equipment together before confirming delivery.</p></div><label class="pricing-check"><input name="customerVerified" type="checkbox" required/><span>Customer identity verified<small>The person receiving the item matches ${e(row.customer_name)}.</small></span></label><div class="rental-payment-checks"><label class="pricing-check"><input name="paymentVerified" type="checkbox" required ${Number(row.rental_paid_amount || 0) >= Number(row.rental_fee) ? 'checked' : ''}/><span>Rental payment received<strong>${amount(row.rental_fee)}</strong><small>${Number(row.rental_paid_amount || 0) >= Number(row.rental_fee) ? 'QR payment verified' : 'Collect the rental fee now'}</small></span></label><label class="pricing-check"><input name="depositReceived" type="checkbox" required ${Number(row.deposit_collected_amount || 0) >= Number(row.deposit_amount || 0) ? 'checked' : ''}/><span>Refundable deposit received<strong>${amount(row.deposit_amount)}</strong><small>${Number(row.deposit_amount || 0) === 0 ? 'No deposit required' : Number(row.deposit_collected_amount || 0) >= Number(row.deposit_amount) ? 'QR payment verified' : 'Collect the refundable deposit now'}</small></span></label></div>${inspectionControls(true)}</fieldset></section>
        <p class="form-error rental-release-error" role="alert"></p>
      </div>
      <div class="rental-release-footer"><p data-release-hint>Scan the customer rental QR at the selected handoff location.</p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button type="button" class="primary" data-verify-booking>Verify customer rental</button><button type="submit" class="primary" data-release-confirm hidden disabled>Confirm handoff and start timer</button></div></div>
    </form>`);
    const form = modal.querySelector('form'), photos = bindInspectionPhotos(form);
    const sync = state => {
      form.querySelectorAll('[data-release-panel]').forEach(panel => { panel.hidden = Number(panel.dataset.releasePanel) !== state.step; });
      form.querySelectorAll('[data-release-step]').forEach(step => {
        const number = Number(step.dataset.releaseStep); step.classList.toggle('is-current', number === state.step); step.classList.toggle('is-complete', number < state.step);
        if (number === state.step) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
      });
      form.elements.transactionCode.required = state.step === 1;
      form.querySelector('[data-release-checks]').disabled = state.step !== 2 || !state.bookingVerified;
      const scan = form.querySelector('[data-scan-field]'), verify = form.querySelector('[data-verify-booking]'), confirm = form.querySelector('[data-release-confirm]');
      scan.disabled = verify.disabled = state.busy; verify.hidden = state.step !== 1;
      verify.textContent = state.busy ? 'Verifying…' : 'Verify customer rental';
      confirm.hidden = state.step !== 2; confirm.disabled = state.busy || !state.bookingVerified;
      form.querySelector('.form-error').textContent = state.error;
      if (state.error) form.querySelector('.form-error').scrollIntoView({ block: 'nearest' });
      form.querySelector('[data-release-hint]').textContent = state.step === 1 ? 'Scan the customer rental QR at the selected handoff location.' : 'Confirming the physical handoff starts the rental timer.';
    };
    const verification = createReleaseVerification({ api, rentalId: row.id, onChange: sync });
    const stopCamera = bindQrReaders(form, modal, { onCapture: () => verifyRental() });
    const verifyRental = async () => { stopCamera(); if (await verification.verifyBooking()) form.elements.customerVerified.focus(); };
    for (const name of ['transactionCode', 'manualReason']) form.elements[name].addEventListener('input', () => { verification.update(name, form.elements[name].value); });
    form.elements.manualLookup.onchange = () => {
      stopCamera(); const manual = form.elements.manualLookup.checked;
      form.querySelector('[data-manual-reason]').hidden = !manual;
      form.elements.transactionCode.value = ''; verification.update('transactionCode', ''); verification.update('manualLookup', manual);
      form.querySelectorAll('[data-camera-status]').forEach(output => { output.textContent = ''; });
    };
    form.querySelector('[data-verify-booking]').onclick = verifyRental;
    form.elements.transactionCode.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); verifyRental(); } });
    modal.addEventListener('close', () => verification.dispose(), { once: true });
    sync(verification.snapshot());
    const previouslyScanned = scannedBookings.get(row.id);
    if (previouslyScanned) { form.elements.transactionCode.value = previouslyScanned; verification.update('transactionCode', previouslyScanned); verifyRental(); }
    submit(form, 'Confirm physical handoff?', `${row.item_name} will be delivered to ${row.customer_name} at ${row.delivery_location || 'the selected location'}. The rental timer starts now.`, async (fields, key) => {
      const notes = fields.inspectionNotes.trim() || 'No additional inspection notes.';
      return saved(await api(`/rentals/${encodeURIComponent(row.id)}/release`, { method: 'POST', body: JSON.stringify({ requestKey: key, ...verification.releaseCodes(), customerVerified: fields.customerVerified === 'on', paymentVerified: fields.paymentVerified === 'on', depositReceived: fields.depositReceived === 'on', inspection: { condition: fields.condition, result: 'AVAILABLE', notes, accessoriesChecked: fields.accessoriesChecked === 'on', photos: photos() } }) }), 'Handoff confirmed. Rental timer started.');
    }, { confirm: false });
  }
  function receiveForm(id, reject = false) {
    const row = getModel().transactions.find(row => String(row.id) === String(id));
    if (!row) { toast('Refresh the rental record first.'); return; }
    if (row.status === 'RETURN_PENDING_INSPECTION') { completeReturnForm(row); return; }
    if (reject) {
      showModal('Reject customer return request', `<form class="admin-form rental-desk-form"><label>Reason<textarea name="reason" required maxlength="1000"></textarea></label>${actions('Reject return request')}</form>`);
      submit(modal.querySelector('form'), 'Reject this request?', 'The rental stays active until physical receipt.', async fields => saved(await api(`/mobile/rentals/${encodeURIComponent(id)}/return/review`, { method:'POST', body:JSON.stringify({action:'REJECT',reason:fields.reason}) }), 'Return request rejected.')); return;
    }
    showModal('Record physical return', `<form class="admin-form rental-desk-form"><p>${e(row.item_name)} · ${e(row.customer_name)}</p><p>Record receipt when the item reaches the desk. This stops overtime before inspection.</p>${scanField('inventoryCode','Returned equipment inventory QR',scannedInventory.get(row.id) || '')}${manualControls}<label class="pricing-check"><input name="physicalReceiptConfirmed" type="checkbox" required/> I physically received this equipment.</label>${actions('Record receipt & inspect')}</form>`);
    const form = modal.querySelector('form'); bindManual(form,row,false);
    submit(form,'Record physical receipt?','The rental timer stops at receipt. The unit stays unavailable during inspection.',async(fields,key)=>saved(await api(`/rentals/${encodeURIComponent(id)}/receipt`,{method:'POST',body:JSON.stringify({requestKey:key,inventoryCode:fields.inventoryCode,physicalReceiptConfirmed:fields.physicalReceiptConfirmed === 'on',...(fields.manualLookup === 'on' ? {manualLookup:true,manualReason:fields.manualReason}: {})})}),'Receipt recorded.',completeReturnForm));
  }
  function completeReturnForm(row) {
    showModal('Inspect and confirm return', `<form class="admin-form rental-desk-form"><p>${e(row.item_name)} · ${e(row.customer_name)}</p><p>Received ${e(h.formatDate(row.received_at))}. Fees use this receipt time and the original saved rates.</p>${inspectionControls(false)}<label>Damage / missing-part penalty (₱)<input name="penaltyAmount" type="number" min="0" max="9999999999.99" step="0.01" value="0" required/><small>Overtime is calculated separately.</small></label><label>Penalty reason<textarea name="penaltyReason" maxlength="1000"></textarea></label>${actions('Confirm Return')}</form>`);
    const form=modal.querySelector('form'),photos=bindInspectionPhotos(form);
    form.elements.condition.onchange=()=>{const damaged=['DAMAGED','NEEDS_INSPECTION'].includes(form.elements.condition.value);if(damaged)form.elements.result.value='UNDER_MAINTENANCE';form.elements.result.querySelector('[value="AVAILABLE"]').disabled=damaged;};
    form.elements.penaltyAmount.oninput=()=>{form.elements.penaltyReason.required=Number(form.elements.penaltyAmount.value)>0;};
    submit(form,'Complete this return?','The unit becomes available only if the inspection clears it. Payment balances remain separate.',async(fields,key)=>saved(await api(`/rentals/${encodeURIComponent(row.id)}/complete-return`,{method:'POST',body:JSON.stringify({requestKey:key,penaltyAmount:Number(fields.penaltyAmount),penaltyReason:fields.penaltyReason,inspection:{condition:fields.condition,result:fields.result,notes:fields.inspectionNotes,accessoriesChecked:fields.accessoriesChecked==='on',photos:photos()}})}),'Return confirmed. Review any balance or deposit refund.',updated=>h.transactionDetails?.({...row,...updated})));
  }
  function chooseReturn() { lookupForm('INVENTORY'); }
  function lookupForm(kind = 'BOOKING') {
    showModal(kind === 'BOOKING' ? 'Find rental' : 'Find returned equipment',`<form class="admin-form rental-desk-form">${scanField('code',kind === 'BOOKING' ? 'Customer rental QR or rental code' : 'Inventory QR or item code')}<p data-camera-status role="status"></p>${actions('Find record')}</form>`);
    const form = modal.querySelector('form'); bindQrReaders(form, modal);
    form.querySelector('[data-close]').onclick = () => modal.close();
    form.onsubmit = async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('[type="submit"]');
      if (button.disabled) return;
      button.disabled = true; button.textContent = 'Finding…'; form.querySelector('.form-error').textContent = '';
      try {
        const code = form.elements.code.value.trim();
        const response = await api('/rentals/lookup', { method: 'POST', body: JSON.stringify({ kind, code }) });
        if (!form.isConnected || !modal.open) return;
        (kind === 'BOOKING' ? scannedBookings : scannedInventory).set(response.rental.id, code);
        modal.close(); try { await refresh(); } catch {} redraw(); h.transactionDetails?.(response.rental);
      } catch (error) { if (form.isConnected) form.querySelector('.form-error').textContent = error.message; }
      finally { button.disabled = false; button.textContent = 'Find record'; }
    };
  }
  function assignmentForm(row) {
    showModal('Change assigned unit',`<form class="admin-form rental-desk-form"><p>Choose another available unit of the same product and price.</p>${scanField('inventoryCode','Replacement inventory QR or item code')}<p data-camera-status role="status"></p><label>Reason<textarea name="reason" required maxlength="1000"></textarea></label>${actions('Change unit')}</form>`);
    const form=modal.querySelector('form');bindQrReaders(form,modal);
    submit(form,'Assign this replacement unit?','The old reservation is released only after the replacement is reserved.',async fields=>saved(await api(`/rentals/${encodeURIComponent(row.id)}/assignment`,{method:'POST',body:JSON.stringify({inventoryCode:fields.inventoryCode,reason:fields.reason})}),'Assigned unit updated.'));
  }
  function settlementForm(row) {
    showModal('Record payment or refund',`<form class="admin-form rental-desk-form"><p>Outstanding balance: ${e(h.money(row.balance_due || 0))} · Refund due: ${e(h.money(row.refund_due || 0))}</p><label>Additional payment received (₱)<input name="paymentAmount" type="number" min="0" step="0.01" value="0"/></label><label>Deposit applied to charges (₱)<input name="depositAppliedAmount" type="number" min="0" step="0.01" value="0"/></label><label>Deposit refund actually paid (₱)<input name="depositRefundAmount" type="number" min="0" step="0.01" value="0"/></label>${row.status==='COMPLETED'?'':'<label>Rental payment refunded (₱)<input name="rentalRefundAmount" type="number" min="0" step="0.01" value="0"/></label>'}<label>Receipt / settlement notes<textarea name="notes" required maxlength="1000"></textarea></label>${actions('Record settlement')}</form>`);
    submit(modal.querySelector('form'),'Record these money movements?','Confirm only amounts actually collected, deducted, or refunded.',async(fields,key)=>saved(await api(`/rentals/${encodeURIComponent(row.id)}/settlement`,{method:'POST',body:JSON.stringify({requestKey:key,paymentAmount:Number(fields.paymentAmount),depositAppliedAmount:Number(fields.depositAppliedAmount),depositRefundAmount:Number(fields.depositRefundAmount),rentalRefundAmount:Number(fields.rentalRefundAmount || 0),notes:fields.notes})}),'Settlement recorded.'));
  }
  async function viewPhoto(id) { try { const result=await api(`/rental-inspection-photos/${encodeURIComponent(id)}`);showModal('Inspection photo',`<img class="inspection-photo-full" alt="Recorded inspection" src="${e(result.photo.data_url)}"/>`); } catch(error){toast(error.message);} }
  function bind(root = document) {
    root.querySelectorAll('[data-rental-prepare]').forEach(button=>button.onclick=()=>prepareForm(getModel().transactions.find(row=>row.id===button.dataset.rentalPrepare)));
    root.querySelectorAll('[data-rental-release]').forEach(button=>button.onclick=()=>releaseForm(getModel().transactions.find(row=>row.id===button.dataset.rentalRelease)));
    root.querySelectorAll('[data-rental-assignment]').forEach(button=>button.onclick=()=>assignmentForm(getModel().transactions.find(row=>row.id===button.dataset.rentalAssignment)));
    root.querySelectorAll('[data-rental-settlement]').forEach(button=>button.onclick=()=>settlementForm(getModel().transactions.find(row=>row.id===button.dataset.rentalSettlement)));
    root.querySelectorAll('[data-inspection-photo]').forEach(button=>button.onclick=()=>viewPhoto(button.dataset.inspectionPhoto));
    root.querySelector('[data-find-booking]')?.addEventListener('click',()=>lookupForm('BOOKING'));
  }
  return { bookingForm, reviewForm, prepareForm, releaseForm, receiveForm, completeReturnForm, chooseReturn, lookupForm, assignmentForm, settlementForm, bind };
}
