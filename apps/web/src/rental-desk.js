import { bindQrReaders, bindInspectionPhotos } from './qr-reader.js';
import { manilaDateTimeIso } from './date-time.js';
import { createReleaseVerification } from './release-verification.js';
import { nameError, phoneError, emailError, bindAccountValidation } from './account-validation.js';

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
  const duration = typeof quote.billed_minutes === 'number' && Number.isFinite(quote.billed_minutes) && quote.billed_minutes > 0 ? `${e(quote.billed_minutes)} min` : 'Not available';
  return `<section class="rental-booking-price"><h3>Price summary</h3><dl><div><dt>Rental fee</dt><dd>${amount(quote.rental_fee)}</dd></div></dl><p>Billed duration: ${duration}. Timer starts at handoff.</p></section>`;
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
  const inspectionControls = release => release ? `<section class="rental-inspection rental-release-inspection"><div class="rental-section-heading"><h3>Quick equipment check</h3><p>Confirm condition and included accessories before handoff.</p></div><div class="rental-release-inspection-grid"><label>Condition<select name="condition" required><option value="GOOD">Good</option><option value="FAIR">Fair</option></select></label><label class="pricing-check rental-accessory-check"><input name="accessoriesChecked" type="checkbox" required/><span>Accessories checked<small>Unit and included pieces are present.</small></span></label></div><details class="rental-inspection-more"><summary>Add optional notes or photos</summary><label>Inspection notes <small>Optional</small><textarea name="inspectionNotes" maxlength="2000" rows="2" placeholder="Record any marks or details for the return inspection."></textarea></label><label class="rental-photo-picker">Inspection photos <small>Optional · up to 2 images</small><input type="file" accept="image/*" capture="environment" multiple data-inspection-photos/></label><div class="inspection-photo-preview" data-photo-preview></div></details></section>` : `<section class="rental-inspection"><div class="rental-section-heading"><h3>Equipment inspection</h3><p>Check the condition and count all included accessories.</p></div><div class="rental-inspection-grid"><label>Condition<select name="condition" required><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option><option value="NEEDS_INSPECTION">Needs inspection / preparation</option></select></label><label>Next equipment status<select name="result"><option value="AVAILABLE">Available for rental</option><option value="UNDER_MAINTENANCE">Under maintenance / inspection</option></select></label><label class="pricing-check rental-accessory-check"><input name="accessoriesChecked" type="checkbox" required/><span>Equipment and accessories checked<small>I checked the physical unit and all included pieces.</small></span></label><label>Inspection notes <small>Optional</small><textarea name="inspectionNotes" maxlength="2000" rows="3" placeholder="Record condition, accessories, and any existing marks."></textarea></label><label class="rental-photo-picker">Inspection photos <small>Optional · up to 2 images</small><input type="file" accept="image/*" capture="environment" multiple data-inspection-photos/></label><div class="inspection-photo-preview" data-photo-preview></div></div></section>`;
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
    const items = (model.items || []).filter(item => item.is_active !== false && ['AVAILABLE','RENTED','RESERVED_PENDING'].includes(item.status));
    const customers = (model.customers || []).filter(row => row.is_active !== false);
    if (!items.length) { showModal('Walk-in rental', '<p>No equipment is available. Check stock and maintenance before creating a rental.</p>'); return; }
    showModal('Create walk-in rental', `<form class="admin-form rental-desk-form">
      <p>Process a customer at the Rent & Play establishment in Lakewoods, Los Baños. No customer app is required. The timer starts at actual handover.</p>
      <label>Search existing customer<input type="search" data-customer-search placeholder="Beginning of name or customer reference"/></label>
      <label>Customer<select name="customerId" required><option value="">Select an existing customer</option>${options(customers, row => `${row.full_name} · ${row.customer_code} · ${row.phone || 'No contact'}`)}<option value="__new">+ New walk-in customer</option></select></label>
      <section data-new-customer hidden><h3>New customer profile</h3><p>Check the existing directory first. App login can be added later without changing their customer code.</p><label>Full name<input name="newFullName" maxlength="150" disabled/></label><label>Philippine mobile number<input name="newPhone" type="tel" maxlength="40" placeholder="0917 123 4567" disabled/></label><label>Email (optional)<input name="newEmail" type="email" maxlength="254" disabled/></label><label>Address (optional)<textarea name="newAddress" maxlength="500" disabled></textarea></label></section>
      <label>Available equipment<select name="itemId" required>${options(items, row => `${row.name} · ${row.item_code}`)}</select></label>
      <label>Handover method<select name="fulfillmentMode"><option value="SHOP_HANDOVER">Hand over at Rent & Play · Lakewoods</option><option value="DELIVERY">Deliver to the customer's resort</option></select></label>
      <label data-delivery-location hidden>Resort / delivery address<input name="deliveryLocation" maxlength="255" placeholder="Resort name, address, and room or gate instructions" disabled/></label>
      <label>Pricing option<select name="mode"><option value="TIMED">Timed rental</option><option value="WHOLE_STAY" disabled>Whole stay until resort checkout</option></select></label>
      <label data-duration>Requested duration (minutes)<input name="durationMinutes" type="number" value="60" min="1" max="10080" required/></label>
      <label data-checkout hidden>Resort checkout time<input name="resortCheckoutAt" type="datetime-local" disabled/><small>Philippine time.</small></label>
      <label>Scheduled start (optional)<input type="datetime-local" name="scheduledStartAt"/><small>Philippine time. Leave blank to rent now.</small></label><label>Payment method<select name="paymentMethod"><option value="CASH">Cash</option><option value="QR">InstaPay QR</option></select></label>
      <p class="rental-payment-note">Explain the price, late fees and return terms. Verify the actual payment and the assigned physical unit at handover.</p><div data-quote-preview role="status"></div><button type="button" class="secondary" data-quote>Review price</button>${actions('Save walk-in rental')}</form>`);
    const form = modal.querySelector('form'), price = form.querySelector('[data-quote-preview]'), previewButton = form.querySelector('[data-quote]'), saveButton = form.querySelector('[type="submit"]');
    const validation = bindAccountValidation(form, { newFullName: nameError, newPhone: phoneError, newEmail: value => emailError(value, false) });
    let quote, revision = 0, createdCustomer = null;
    const profile = () => ({ fullName: form.elements.newFullName.value.trim(), phone: form.elements.newPhone.value.trim(), email: form.elements.newEmail.value.trim(), address: form.elements.newAddress.value.trim() });
    const payload = () => ({ itemId: form.elements.itemId.value, customerId: form.elements.customerId.value, rentalChannel: 'WALK_IN', fulfillmentMode: form.elements.fulfillmentMode.value, mode: form.elements.mode.value, durationMinutes: Number(form.elements.durationMinutes.value), deliveryLocation: form.elements.fulfillmentMode.value === 'SHOP_HANDOVER' ? 'Rent & Play · Lakewoods, Los Baños' : form.elements.deliveryLocation.value.trim(), paymentMethod: form.elements.paymentMethod.value, ...(form.elements.scheduledStartAt.value?{scheduledStartAt:manilaDateTimeIso(form.elements.scheduledStartAt.value)}:{}), ...(form.elements.mode.value === 'WHOLE_STAY' ? { resortCheckoutAt: manilaDateTimeIso(form.elements.resortCheckoutAt.value) } : {}) });
    const invalidate = () => { revision++; quote = null; saveButton.disabled = true; previewButton.disabled = false; previewButton.textContent = 'Review price'; price.innerHTML = ''; };
    let customerSearchVersion=0,customerSearchTimer;
    form.querySelector('[data-customer-search]').oninput=event=>{
      const query=event.target.value.trim(),version=++customerSearchVersion;clearTimeout(customerSearchTimer);
      if(query.length<2)return;
      customerSearchTimer=setTimeout(async()=>{
        try{const result=await api('/records/customers?'+new URLSearchParams({search:query,status:'ACTIVE',limit:'20'}));if(version!==customerSearchVersion||!form.isConnected)return;
        const selected=form.elements.customerId.value,selection=customers.find(row=>row.id===selected);
        for(const row of result.records)if(!customers.some(current=>current.id===row.id))customers.push(row);
        const list=[...new Map([...(selection?[selection]:[]),...result.records].map(row=>[row.id,row])).values()];
        form.elements.customerId.innerHTML='<option value="">Select an existing customer</option>'+options(list,row=>`${row.full_name} · ${row.customer_code} · ${row.phone||'No contact'}`)+'<option value="__new">+ New walk-in customer</option>';
        form.elements.customerId.value=selected;
        }catch(problem){if(version===customerSearchVersion&&form.isConnected)toast(problem.message);}
      },400);
    };
    const syncFields = () => {
      const isNew = form.elements.customerId.value === '__new', delivery = form.elements.fulfillmentMode.value === 'DELIVERY';
      form.querySelector('[data-new-customer]').hidden = !isNew;
      for (const name of ['newFullName', 'newPhone', 'newEmail', 'newAddress']) { form.elements[name].disabled = !isNew; form.elements[name].required = isNew && ['newFullName', 'newPhone'].includes(name); }
      form.querySelector('[data-delivery-location]').hidden = !delivery;
      form.elements.deliveryLocation.disabled = !delivery; form.elements.deliveryLocation.required = delivery;
      form.elements.mode.querySelector('[value="WHOLE_STAY"]').disabled = !delivery;
      if (!delivery) form.elements.mode.value = 'TIMED';
      const stay = form.elements.mode.value === 'WHOLE_STAY';
      form.querySelector('[data-duration]').hidden = stay; form.elements.durationMinutes.disabled = stay; form.elements.durationMinutes.required = !stay;
      form.querySelector('[data-checkout]').hidden = !stay; form.elements.resortCheckoutAt.disabled = !stay; form.elements.resortCheckoutAt.required = stay;
      validation.update(); invalidate();
    };
    form.elements.customerId.onchange = syncFields; form.elements.fulfillmentMode.onchange = syncFields; form.elements.mode.onchange = syncFields;
    for (const name of ['itemId','durationMinutes','scheduledStartAt','deliveryLocation','paymentMethod','resortCheckoutAt','newFullName','newPhone','newEmail','newAddress']) form.elements[name].addEventListener('input', invalidate);
    async function preview() {
      if (!form.reportValidity()) return;
      const version = ++revision; saveButton.disabled = true; previewButton.disabled = true; previewButton.textContent = 'Checking price…';
      form.querySelector('.form-error').textContent = '';
      try {
        const response = await api('/pricing/quote', { method: 'POST', body: JSON.stringify(payload()) });
        if (version !== revision || !form.isConnected || !modal.open) return;
        quote = response.quote; price.innerHTML = renderBookingPrice(quote, h) + `<p>Late fee: ${e(h.money(quote.overtime_rate || 0))} per started ${e(quote.overtime_unit_minutes || 60)} minutes after the ${e(quote.grace_minutes || 0)} minute grace period.</p>`;
        saveButton.disabled = false;
      } catch (error) { if (version === revision && form.isConnected) { form.querySelector('.form-error').textContent = error.message; quote = null; } }
      finally { if (version === revision && form.isConnected) { previewButton.disabled = false; previewButton.textContent = 'Review price'; } }
    }
    previewButton.onclick = preview;
    submit(form, 'Save this walk-in rental?', 'The equipment will be reserved. Inspect the unit and confirm payment, customer agreement and physical handover to start the timer.', async (_fields, key) => {
      if (!quote) throw new Error('Review the current price before saving.');
      const input = payload(), customerDetails = profile(), signature = JSON.stringify(customerDetails), expectedQuote = { rentalFee: quote.rental_fee, billedMinutes: quote.billed_minutes, overtimeRate: quote.overtime_rate };
      form.inert = true;
      try {
        if (input.customerId === '__new') {
          if (createdCustomer && createdCustomer.signature !== signature) throw new Error('The customer profile was already saved. Select that customer from the directory before changing their details.');
          if (!createdCustomer) {
            const result = await api('/customers', { method: 'POST', body: JSON.stringify({ ...customerDetails, requestKey: key }) });
            createdCustomer = { id: result.customer.id, signature };
          }
          input.customerId = createdCustomer.id;
        }
        const response = await api('/rental-bookings', { method: 'POST', body: JSON.stringify({ ...input, requestKey: key, expectedQuote }) });
        await saved(response, 'Walk-in rental saved. Verify the assigned unit, then confirm the physical handover.');
      } finally { form.inert = false; }
    });
    syncFields();
  }
  function reviewForm(row, action) {
    const approve = action === 'APPROVE';
    if (approve && row.payment_method === 'QR') {
      if (row.payment_proof_status === 'PENDING_REVIEW') { paymentProofReviewForm(row); return; }
      if (row.payment_proof_status !== 'VERIFIED') { toast('Waiting for the customer to upload a corrected payment screenshot.'); return; }
    }
    showModal(approve ? 'Approve rental request' : 'Reject rental request', `<form class="admin-form rental-desk-form"><p>${e(row.item_name)} · ${e(row.customer_name)} · ${e(row.rental_code || row.id)}</p>${approve ? '<p>Approval reserves the equipment. Confirm any outstanding rental payment at handoff; the rental timer starts when you confirm delivery.</p><label>Review notes<textarea name="notes" maxlength="1000"></textarea></label>' : '<label>Reason (optional)<textarea name="reason" maxlength="1000" rows="3"></textarea></label>'}${actions(approve ? 'Approve rental request' : 'Reject rental request')}</form>`);
    const form = modal.querySelector('form');
    submit(form, approve ? 'Approve this rental request?' : 'Reject this rental request?', approve ? 'The equipment stays reserved until preparation and handoff or expiry.' : 'The reservation will be released. Verified payments remain recorded for refund.', async fields => saved(await api(`/mobile/rentals/${encodeURIComponent(row.id)}/review`, { method: 'POST', body: JSON.stringify(approve ? { action, notes: fields.notes } : { action, reason: fields.reason }) }), approve ? 'Rental request approved. Prepare the equipment for delivery.' : 'Rental request rejected.'), { confirm: false });
  }
  async function paymentProofReviewForm(row) {
    showModal('Review QR payment', `<form class="admin-form rental-desk-form"><p>Rental request · ${e(row.rental_code || row.id)} · ${e(row.customer_name)}</p><p>Expected transfer: <strong>${e(h.money(Number(row.rental_fee || 0)))}</strong></p><div data-proof-content>Loading payment screenshot…</div><label>Review note<textarea name="notes" maxlength="1000" rows="2"></textarea></label><label data-proof-reject-reason hidden>Why is this proof being rejected?<textarea name="reason" maxlength="1000" rows="3"></textarea></label><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Close</button><button type="button" class="secondary" data-reject-proof>Reject proof</button><button type="button" class="primary" data-verify-proof>Verify payment &amp; approve request</button></div></form>`);
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
    showModal(row.fulfillment_mode === 'SHOP_HANDOVER' ? 'Prepare walk-in equipment' : 'Prepare equipment for delivery', `<form class="admin-form rental-desk-form"><p>${e(row.item_name)} · ${e(row.customer_name)}</p><p>Scan the assigned unit’s printed QR at the shop. This verifies the exact unit before handover and keeps the rental timer stopped.</p>${scanField('inventoryCode','Assigned equipment QR')}${manualControls}${actions(row.fulfillment_mode === 'SHOP_HANDOVER' ? 'Mark ready for handover' : 'Mark ready for delivery')}</form>`);
    const form = modal.querySelector('form'); bindManual(form, row, false);
    submit(form, 'Prepare this equipment?', `${row.item_name} (${row.item_code}) will be marked ready for delivery to ${row.delivery_location || 'the customer'}. The rental timer stays stopped.`, async fields => saved(await api(`/rentals/${encodeURIComponent(row.id)}/prepare-delivery`, { method: 'POST', body: JSON.stringify({ inventoryCode: fields.inventoryCode, ...(fields.manualLookup === 'on' ? { manualLookup: true, manualReason: fields.manualReason } : {}) }) }), row.fulfillment_mode === 'SHOP_HANDOVER' ? 'Equipment verified and ready for shop handover.' : 'Equipment verified and ready for delivery.'), { confirm: false });
  }
  function releaseForm(row) {
    if (!row || row.status !== 'APPROVED' || row.delivery_status !== 'PREPARED') { toast('Prepare the assigned equipment at the shop before confirming delivery.'); return; }
    const walkIn = row.request_source === 'WALK_IN';
    const amount = value => e(h.money(Number(value || 0)));
    showModal('Deliver / Hand over equipment', `<form class="admin-form rental-desk-form rental-release-form">
      <ol class="rental-release-steps" aria-label="Handoff progress">${[walkIn ? 'Verify walk-in rental' : 'Customer rental QR', 'Confirm handoff'].map((label, i) => `<li data-release-step="${i + 1}" ${i === 0 ? 'aria-current="step"' : ''}><span>${i + 1}</span><strong>${label}</strong></li>`).join('')}</ol>
      <div class="rental-flow-summary"><div><small>Rental request · ${e(row.rental_code || row.id)}</small><strong>${e(row.item_name)}</strong><span>${e(row.customer_name)} · ${e(row.delivery_location || 'Shop pickup')}</span></div><span class="rental-timer-note">Timer starts at handoff</span></div>
      <div class="rental-flow-scroll">
        <section class="rental-scan-panel" data-release-panel="1"><span class="rental-step-caption">STEP 1 OF 2</span><h3>${walkIn ? 'Verify the walk-in rental reference' : 'Scan customer rental QR'}</h3><p>${walkIn ? 'The customer does not need an app. Verify this saved rental reference, then confirm their identity and actual payment at handover.' : 'Scan the handoff QR on the customer’s phone, or type the copied R-code. The equipment is already verified.'}</p><div class="rental-scan-entry"><label>Customer QR or rental code<input name="transactionCode" maxlength="256" autocomplete="off" placeholder="Scan QR or enter copied R-code" required/></label><button type="button" class="primary" data-scan-field="transactionCode">${cameraIcon}<span>Scan customer QR</span></button></div><label class="pricing-check rental-manual-toggle"><input type="checkbox" name="manualLookup"/><span>Use printed rental code (auto-detected)</span></label><label data-manual-reason hidden>Reason for manual verification (optional)<textarea name="manualReason" maxlength="1000" rows="2" placeholder="For example: camera unavailable"></textarea></label><p data-camera-status="transactionCode" role="status"></p></section>
        <section data-release-panel="2" hidden><div class="rental-verified-notice"><span>✓</span><div><strong>Rental and prepared unit verified</strong><small>${e(row.item_name)} · ${e(row.customer_name)}</small></div></div><fieldset class="rental-release-checks" data-release-checks disabled><div class="rental-section-heading"><h3>Confirm the physical handoff</h3><p>Check the customer and equipment together before confirming delivery.</p></div><label class="pricing-check"><input name="customerVerified" type="checkbox" required/><span>Customer identity verified<small>The person receiving the item matches ${e(row.customer_name)}.</small></span></label><div class="rental-payment-checks"><label class="pricing-check"><input name="paymentVerified" type="checkbox" required ${Number(row.rental_paid_amount || 0) >= Number(row.rental_fee) ? 'checked' : ''}/><span>Rental payment received<strong>${amount(row.rental_fee)}</strong><small>${Number(row.rental_paid_amount || 0) >= Number(row.rental_fee) ? 'QR payment verified' : 'Collect the rental fee now'}</small></span></label></div>${walkIn ? `<label class="pricing-check"><input name="customerTermsAcknowledged" type="checkbox" required/><span>Customer agreed to the rental terms<small>Explain the ${e(row.fee_breakdown?.billed_minutes)} minute duration, ${amount(row.rental_fee)} total, late fee of ${amount(row.fee_breakdown?.overtime_rate)} per started ${e(row.fee_breakdown?.overtime_unit_minutes || 60)} minutes after ${e(row.fee_breakdown?.grace_minutes || 0)} minutes of grace, and physical return inspection.</small></span></label>` : ''}${inspectionControls(true)}</fieldset></section>
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
      form.elements.manualLookup.checked = state.manualLookup;
      form.querySelector('[data-manual-reason]').hidden = !state.manualLookup;
      form.elements.transactionCode.required = state.step === 1;
      form.querySelector('[data-release-checks]').disabled = state.step !== 2 || !state.bookingVerified;
      const scan = form.querySelector('[data-scan-field]'), verify = form.querySelector('[data-verify-booking]'), confirm = form.querySelector('[data-release-confirm]');
      scan.disabled = verify.disabled = state.busy; verify.hidden = state.step !== 1;
      verify.textContent = state.busy ? 'Verifying…' : 'Verify customer rental';
      confirm.hidden = state.step !== 2; confirm.disabled = state.busy || !state.bookingVerified;
      form.querySelector('.form-error').textContent = state.error;
      if (state.error) form.querySelector('.form-error').scrollIntoView({ block: 'nearest' });
      form.querySelector('[data-release-hint]').textContent = state.step === 1 ? (walkIn ? 'Verify the saved rental reference. No customer app is required.' : 'Scan the customer rental QR at the selected handoff location.') : 'Confirming the physical handoff starts the rental timer.';
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
    if (walkIn) {
      form.elements.transactionCode.value = row.rental_code; form.elements.transactionCode.readOnly = true;
      form.elements.manualReason.value = 'Staff-assisted walk-in handover. Customer identity checked in person.';
      verification.update('transactionCode', row.rental_code); verification.update('manualLookup', true); verification.update('manualReason', form.elements.manualReason.value);
      form.querySelector('[data-scan-field]').hidden = true;
      form.elements.manualLookup.closest('label').hidden = true;
    }
    sync(verification.snapshot());
    const previouslyScanned = scannedBookings.get(row.id);
    if (previouslyScanned) { form.elements.transactionCode.value = previouslyScanned; verification.update('transactionCode', previouslyScanned); verifyRental(); }
    submit(form, 'Confirm physical handoff?', `${row.item_name} will be delivered to ${row.customer_name} at ${row.delivery_location || 'the selected location'}. The rental timer starts now.`, async (fields, key) => {
      const notes = fields.inspectionNotes.trim() || 'No additional inspection notes.';
      return saved(await api(`/rentals/${encodeURIComponent(row.id)}/release`, { method: 'POST', body: JSON.stringify({ requestKey: key, ...verification.releaseCodes(), customerVerified: fields.customerVerified === 'on', paymentVerified: fields.paymentVerified === 'on', customerTermsAcknowledged: fields.customerTermsAcknowledged === 'on', inspection: { condition: fields.condition, result: 'AVAILABLE', notes, accessoriesChecked: fields.accessoriesChecked === 'on', photos: photos() } }) }), 'Handoff confirmed. Rental timer started.');
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
    showModal('Record physical return', `<form class="admin-form rental-desk-form"><p>${e(row.item_name)} · ${e(row.customer_name)}</p><p>Record receipt when the item reaches the desk. This stops overtime before inspection.</p>${scanField('inventoryCode','Returned equipment inventory QR',scannedInventory.get(row.id) || '')}${manualControls}<label class="pricing-check"><input name="physicalReceiptConfirmed" type="checkbox" required/> I physically received this equipment.</label>${actions('Receive & inspect')}</form>`);
    const form = modal.querySelector('form'); bindManual(form,row,false);
    submit(form,'Receive equipment?','The rental timer stops at receipt. The unit stays unavailable during inspection.',async(fields,key)=>saved(await api(`/rentals/${encodeURIComponent(id)}/receipt`,{method:'POST',body:JSON.stringify({requestKey:key,inventoryCode:fields.inventoryCode,physicalReceiptConfirmed:fields.physicalReceiptConfirmed === 'on',...(fields.manualLookup === 'on' ? {manualLookup:true,manualReason:fields.manualReason}: {})})}),'Equipment received.',completeReturnForm));
  }
  function completeReturnForm(row) {
    showModal('Inspect and confirm return', `<form class="admin-form rental-desk-form"><p>${e(row.item_name)} · ${e(row.customer_name)}</p><p>Received ${e(h.formatDate(row.received_at))}. Fees use this receipt time and the original saved rates.</p>${inspectionControls(false)}<label>Damage / missing-part penalty (₱)<input name="penaltyAmount" type="number" min="0" max="9999999999.99" step="0.01" value="0" required/><small>Overtime is calculated separately.</small></label><label>Penalty reason<textarea name="penaltyReason" maxlength="1000"></textarea></label>${actions('Confirm Return')}</form>`);
    const form=modal.querySelector('form'),photos=bindInspectionPhotos(form);
    form.elements.condition.onchange=()=>{const damaged=['DAMAGED','NEEDS_INSPECTION'].includes(form.elements.condition.value);if(damaged)form.elements.result.value='UNDER_MAINTENANCE';form.elements.result.querySelector('[value="AVAILABLE"]').disabled=damaged;const notes=form.elements.inspectionNotes;if(notes){notes.required=damaged;notes.placeholder=damaged?'Describe the damage or issue. Required for damaged items.':'Optional — add any notes about the condition or accessories.';const label=typeof notes.closest==='function'?notes.closest('label'):null;if(label){const small=label.querySelector('small')||label.appendChild(document.createElement('small'));small.textContent=damaged?'Required for damaged or flagged items.':'Optional';}}};form.elements.condition.onchange();
    form.elements.penaltyAmount.oninput=()=>{form.elements.penaltyReason.required=Number(form.elements.penaltyAmount.value)>0;};
    submit(form,'Complete this return?','The unit becomes available only if the inspection clears it. Payment balances remain separate.',async(fields,key)=>saved(await api(`/rentals/${encodeURIComponent(row.id)}/complete-return`,{method:'POST',body:JSON.stringify({requestKey:key,penaltyAmount:Number(fields.penaltyAmount),penaltyReason:fields.penaltyReason,inspection:{condition:fields.condition,result:fields.result,notes:fields.inspectionNotes,accessoriesChecked:fields.accessoriesChecked==='on',photos:photos()}})}),'Return confirmed. Review any outstanding rental balance.',updated=>h.transactionDetails?.({...row,...updated})));
  }
  function chooseReturn() { lookupForm('INVENTORY'); }
  function lookupForm(kind = 'RENTAL') {
    showModal(kind === 'RENTAL' ? 'Find rental' : 'Find returned equipment',`<form class="admin-form rental-desk-form">${scanField('code',kind === 'RENTAL' ? 'Customer rental QR or rental code' : 'Inventory QR or item code')}<p data-camera-status role="status"></p>${actions('Find record')}</form>`);
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
        (kind === 'RENTAL' ? scannedBookings : scannedInventory).set(response.rental.id, code);
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
    showModal('Record payment or refund',`<form class="admin-form rental-desk-form"><p>Outstanding balance: ${e(h.money(row.balance_due || 0))} · Refund due: ${e(h.money(row.refund_due || 0))}</p><label>Additional payment received (₱)<input name="paymentAmount" type="number" min="0" step="0.01" value="0"/></label>${row.status==='COMPLETED'?'':'<label>Rental payment refunded (₱)<input name="rentalRefundAmount" type="number" min="0" step="0.01" value="0"/></label>'}<label>Payment / refund method<select name="paymentMethod"><option value="CASH">Cash · in person</option><option value="QR">QR transfer</option></select></label><label>Transfer reference<input name="reference" maxlength="150"/></label><label>Receipt / settlement notes<textarea name="notes" required maxlength="1000"></textarea></label>${actions('Record settlement')}</form>`);
    submit(modal.querySelector('form'),'Record these money movements?','Confirm only amounts actually collected, deducted, or refunded.',async(fields,key)=>saved(await api(`/rentals/${encodeURIComponent(row.id)}/settlement`,{method:'POST',body:JSON.stringify({requestKey:key,paymentAmount:Number(fields.paymentAmount),rentalRefundAmount:Number(fields.rentalRefundAmount || 0),paymentMethod:fields.paymentMethod,reference:fields.reference,notes:fields.notes})}),'Settlement recorded.'));
  }
  async function viewPhoto(id) { try { const result=await api(`/rental-inspection-photos/${encodeURIComponent(id)}`);showModal('Inspection photo',`<img class="inspection-photo-full" alt="Recorded inspection" src="${e(result.photo.data_url)}"/>`); } catch(error){toast(error.message);} }
  function bind(root = document) {
    root.querySelectorAll('[data-rental-prepare]').forEach(button=>button.onclick=()=>prepareForm(getModel().transactions.find(row=>row.id===button.dataset.rentalPrepare)));
    root.querySelectorAll('[data-rental-release]').forEach(button=>button.onclick=()=>releaseForm(getModel().transactions.find(row=>row.id===button.dataset.rentalRelease)));
    root.querySelectorAll('[data-rental-assignment]').forEach(button=>button.onclick=()=>assignmentForm(getModel().transactions.find(row=>row.id===button.dataset.rentalAssignment)));
    root.querySelectorAll('[data-rental-settlement]').forEach(button=>button.onclick=()=>settlementForm(getModel().transactions.find(row=>row.id===button.dataset.rentalSettlement)));
    root.querySelectorAll('[data-inspection-photo]').forEach(button=>button.onclick=()=>viewPhoto(button.dataset.inspectionPhoto));
    root.querySelector('[data-find-booking]')?.addEventListener('click',()=>lookupForm('RENTAL'));
  }
  return { bookingForm, reviewForm, prepareForm, releaseForm, receiveForm, completeReturnForm, chooseReturn, lookupForm, assignmentForm, settlementForm, bind };
}
