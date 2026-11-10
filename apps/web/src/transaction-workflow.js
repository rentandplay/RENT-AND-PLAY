import { recordCode } from './record-codes.js';
import { createRentalDesk, renderRentalTaskProgress } from './rental-desk.js';
import { enrichVerification, verificationMatches, renderRequestHistory, transactionTime, renderFeeBreakdown, recordedAmount } from './transaction-records.js';
import { bindRecordLinks, recordAttrs } from './record-links.js';
import { manilaDateTimeIso } from './date-time.js';

export function handoffChoices(model) {
  const openItems = new Set((model.transactions || []).filter(row => ['ACTIVE', 'APPROVED', 'RETURN_PENDING_INSPECTION', 'PENDING_VERIFICATION', 'PENDING_ADMIN_APPROVAL'].includes(row.status)).map(row => String(row.item_id)));
  const pendingReturns = new Set((model.verification || []).filter(row => row.status === 'PENDING' && String(row.transaction_type || row.type).toUpperCase() === 'RETURN').map(row => String(row.rental_id)));
  return {
    items: (model.items || []).filter(row => row.is_active !== false && row.status === 'AVAILABLE' && !openItems.has(String(row.id))),
    customers: (model.customers || []).filter(row => row.is_active !== false),
    terminals: (model.terminals || []).filter(row => row.is_active !== false && row.credentials_configured),
    rentals: (model.transactions || []).filter(row => row.status === 'ACTIVE' && !pendingReturns.has(String(row.id)))
  };
}

export function createTransactionWorkflow(h) {
  const { api, escape: e, showModal, modal, toast, formatDate, money, model: getModel, refresh, redraw, confirmSubmit, icon } = h;
  const getIcon = name => typeof icon === 'function' ? icon(name) : '';
  const desk = createRentalDesk({ ...h, showHandoff: (request, rental) => showHandoff(request, rental) });
  const filters = { status: 'ALL', type: 'ALL', terminal: 'ALL' };
  let guideOpen = false, deviceDetailsOpen = false;
  let handoff = null, handoffRefreshing = false, handoffPollTimer = null, pagePollTimer = null;
  function handoffRental(request, rental = {}) {
    if (request.status !== 'PENDING' || String(request.transaction_type || request.type).toUpperCase() !== 'RETURN') return rental;
    return { ...rental, fee_breakdown: { ...rental.fee_breakdown, actual_return_at: request.actual_return_at || rental.fee_breakdown?.actual_return_at, penalty_amount: request.penalty_amount, penalty_reason: request.penalty_reason } };
  }
  function handoffTitle(request) {
    if (request.status === 'PENDING') return 'Awaiting terminal confirmation';
    if (request.status === 'CONFIRMED') {
      const release = String(request.transaction_type || request.type).toUpperCase() === 'RENTAL';
      const mode = String(request.terminal_mode || (release ? 'HANDOVER' : 'RETURN')).toUpperCase();
      if (mode === 'SHOP_DISPATCH') return 'Shop dispatch confirmed';
      if (mode === 'TEST' || String(request.transaction_type || request.type).toUpperCase() === 'TEST') return 'Terminal test confirmed';
      return release ? 'Rental confirmed' : 'Return confirmed';
    }
    return 'Handoff request closed';
  }
  function handoffBody(request, rental) {
    const pending = request.status === 'PENDING', confirmed = request.status === 'CONFIRMED';
    const release = String(request.transaction_type || request.type).toUpperCase() === 'RENTAL';
    const message = pending ? 'Waiting for the physical counter terminal.' : confirmed ? `${release ? 'Rental' : 'Return'} confirmed at the counter.` : `This request is ${String(request.status).toLowerCase()}. Review the recorded reason below.`;
    const inspection = request.inspection;
    const mode = String(request.terminal_mode || (release ? 'HANDOVER' : 'RETURN')).toUpperCase();
    const modeLabel = mode === 'SHOP_DISPATCH' ? 'SHOP DISPATCH (RESORT DELIVERY)' : release ? 'RENTAL HANDOVER' : 'RETURN INTAKE';
    const itemName = request.item_name || rental?.item_name || 'Equipment';
    const rentalCode = request.rental_code || rental?.rental_code || request.rental_id || '';
    const customerName = rental?.customer_name || rental?.customer?.full_name || '';
    const dispatch = mode === 'SHOP_DISPATCH';
    const balanceDue = Number(rental?.balance_due || 0), refundDue = Number(rental?.refund_due || 0);
    const outcome = dispatch
      ? 'Shop departure confirmed. Equipment is ready for resort delivery. The rental timer stays stopped until the resort handoff.'
      : release
        ? 'Equipment handover confirmed. The rental timer has started.'
        : balanceDue > 0
          ? `Return inspection confirmed. Outstanding balance of ${money(balanceDue)} to collect.`
          : refundDue > 0
            ? `Return inspection confirmed. Refund of ${money(refundDue)} due to customer.`
            : 'Return inspection confirmed. Rental completed with zero remaining balance.';
    const statusText = pending
      ? 'Press confirm on the counter terminal'
      : confirmed
        ? (dispatch ? 'Equipment prepared & confirmed!' : release ? 'Rental handover confirmed!' : 'Return confirmed at counter!')
        : 'Terminal request closed';
    const statusClass = `counter-handoff-status${confirmed ? ' is-confirmed' : !pending ? ' is-closed' : ''}`;
    const badgeHtml = confirmed
      ? '<span class="counter-handoff-badge is-success" aria-hidden="true">✓</span>'
      : '';
    let actionButtons = '';
    if (confirmed) {
      const btns = [];
      if (dispatch) {
        btns.push('<button type="button" class="primary" data-handoff-proceed="delivery">Proceed to resort handoff →</button>');
      } else if (!release && (balanceDue > 0 || refundDue > 0)) {
        btns.push('<button type="button" class="primary" data-handoff-proceed="settle">Record payment or refund →</button>');
      }
      if (release && !dispatch && rental?.request_source === 'WALK_IN') {
        btns.push('<button type="button" class="secondary" data-handoff-receipt-bt>Bluetooth receipt</button>');
        btns.push('<button type="button" class="secondary" data-handoff-receipt-pdf>PDF receipt</button>');
      }
      if (rental?.id || request.rental_id) {
        btns.push('<button type="button" class="secondary" data-handoff-details>View rental details</button>');
      }
      btns.push(`<button type="button" class="${btns.some(b => b.includes('class="primary"')) ? 'secondary' : 'primary'}" data-handoff-done>Done</button>`);
      actionButtons = `<div class="handoff-actions form-actions">${btns.join('')}</div>`;
    } else if (!pending) {
      actionButtons = `<div class="handoff-actions form-actions">${rental?.id || request.rental_id ? '<button type="button" class="secondary" data-handoff-details>View rental details</button>' : ''}<button type="button" class="primary" data-handoff-done>Close</button></div>`;
    }
    const progressStage = confirmed ? (dispatch ? 'handover' : 'released') : (dispatch ? 'prepare' : 'handover');
    return `${release ? renderRentalTaskProgress(rental, progressStage) : ''}<div class="${statusClass}" role="status"><div class="counter-handoff-status-head">${badgeHtml}<div><span class="counter-handoff-label">${e(modeLabel)}</span><h3>${e(statusText)}</h3></div>${confirmed ? '<span class="badge confirmed">CONFIRMED</span>' : ''}</div><p>${e(pending ? 'Match the rental reference below with the terminal display before pressing its physical confirmation button.' : confirmed ? outcome : message)}</p></div>
      <dl class="counter-handoff-facts"><div><dt>Equipment</dt><dd>${e(itemName)}</dd></div><div><dt>Rental reference</dt><dd>${e(rentalCode)}</dd></div>${customerName ? `<div><dt>Customer</dt><dd>${e(customerName)}</dd></div>` : ''}<div><dt>Counter terminal</dt><dd>${e(request.terminal_code || 'Not assigned')}</dd></div>${pending ? `<div><dt>Request expires</dt><dd>${e(formatDate(request.expires_at))}</dd></div>` : ''}${confirmed ? `<div><dt>Confirmed at</dt><dd>${e(formatDate(request.confirmed_at || request.resolved_at || request.updated_at))}</dd></div>` : ''}</dl>
      ${pending ? `<div class="counter-handoff-code"><span>Terminal matching code</span><strong>${e(request.verification_code)}</strong><p>Check that this code matches the counter terminal, then press its physical confirm button. The terminal sends the code automatically; no typing is needed in the app.</p><p>The clock ${dispatch ? 'stays stopped during delivery' : release ? 'starts only after terminal confirmation' : 'uses the recorded physical receipt time'}.</p></div><div class="handoff-refresh"><p>Status updates automatically. If the terminal is unavailable, close this window and reopen the rental to review the offline fallback.</p><button type="button" class="secondary" data-handoff-refresh>Check confirmation</button></div>` : ''}
      ${actionButtons}
      <p class="form-error" role="alert" data-handoff-error></p>
      <details class="counter-handoff-details"${confirmed ? ' open' : ''}><summary>Charges and recorded inspection</summary>${renderFeeBreakdown(rental, h)}${inspection ? `<section class="record-section"><h3>Recorded inspection</h3><dl class="record-fields"><div><dt>Condition</dt><dd>${e(inspection.condition || 'Not recorded')}</dd></div><div><dt>Inspection result</dt><dd>${e(inspection.result || 'Not recorded')}</dd></div><div><dt>Notes</dt><dd>${e(inspection.notes || 'Not recorded')}</dd></div></dl></section>` : ''}${renderRequestHistory([request], { ...h, requestLinks: false })}</details>`;
  }
  function openHandoffReceiptPdf(rental) {
    if (typeof h.renderWalkInReceipt !== 'function') return;
    showModal('Walk-in rental receipt', '<iframe data-receipt-preview title="Rental receipt preview" sandbox="allow-same-origin allow-modals" style="width:100%;height:65vh;border:0;border-radius:8px;background:white"></iframe><div class="form-actions"><button type="button" class="secondary" data-receipt-back>Back</button><button type="button" class="primary" data-receipt-print disabled>Print / Save PDF</button></div>');
    const preview = modal.querySelector('[data-receipt-preview]'), print = modal.querySelector('[data-receipt-print]');
    if (preview) {
      preview.onload = () => { if (preview.isConnected && print) print.disabled = false; };
      preview.srcdoc = h.renderWalkInReceipt(rental);
    }
    if (print) print.onclick = () => { preview?.contentWindow?.focus(); preview?.contentWindow?.print(); };
    const back = modal.querySelector('[data-receipt-back]');
    if (back) back.onclick = () => { if (handoff?.request) showHandoff(handoff.request, handoff.rental); else modal.close?.(); };
  }
  function bindHandoff() {
    modal.querySelector('[data-handoff-refresh]')?.addEventListener('click', refreshPendingHandoff);
    modal.querySelector('[data-handoff-done]')?.addEventListener('click', () => {
      modal.close?.();
      if (typeof refresh === 'function') Promise.resolve(refresh()).catch(() => {});
    });
    modal.querySelector('[data-handoff-details]')?.addEventListener('click', () => {
      if (handoff?.rental && typeof h.transactionDetails === 'function') {
        h.transactionDetails(handoff.rental);
      } else {
        modal.close?.();
      }
    });
    modal.querySelector('[data-handoff-proceed]')?.addEventListener('click', evt => {
      const target = evt?.currentTarget?.dataset?.handoffProceed;
      const rental = handoff?.rental;
      if (!rental) { modal.close?.(); return; }
      if (target === 'delivery' || target === 'handover') desk.releaseForm(rental);
      else if (target === 'settle') desk.settlementForm(rental);
      else if (target === 'prepare') desk.prepareForm(rental);
      else desk.continueRental(rental);
    });
    modal.querySelector('[data-handoff-receipt-bt]')?.addEventListener('click', () => {
      if (handoff?.rental && typeof h.openBluetoothReceipt === 'function') {
        h.openBluetoothReceipt(handoff.rental, () => modal.close?.(), () => openHandoffReceiptPdf(handoff.rental));
      }
    });
    modal.querySelector('[data-handoff-receipt-pdf]')?.addEventListener('click', () => {
      if (handoff?.rental) openHandoffReceiptPdf(handoff.rental);
    });
    bindInspections(modal);
  }
  function showHandoff(source, rental) {
    const request = enrichVerification(source, getModel());
    rental = handoffRental(request, rental);
    handoff = { request, rental, signature: JSON.stringify([request, rental]) };
    showModal(handoffTitle(request), `<section data-handoff-request="${e(request.id)}">${handoffBody(request, rental)}</section>`);
    bindHandoff();
    if (typeof HTMLElement !== 'undefined' && modal instanceof HTMLElement && request.status === 'PENDING') {
      if (modal._handoffTimer) clearInterval(modal._handoffTimer);
      modal._handoffTimer = setInterval(() => {
        if (!modal.open || !handoff || handoff.request.status !== 'PENDING') {
          clearInterval(modal._handoffTimer);
          modal._handoffTimer = null;
          return;
        }
        refreshPendingHandoff();
      }, 2000);
    }
  }
  async function refreshPendingHandoff() {
    const panel = modal.querySelector('[data-handoff-request]');
    if (!modal.open || !panel || !handoff || handoff.request.status !== 'PENDING' || handoffRefreshing) return false;
    handoffRefreshing = true;
    const button = panel.querySelector('[data-handoff-refresh]');
    if (button) { button.disabled = true; button.textContent = 'Checking…'; button.setAttribute('aria-busy', 'true'); }
    try {
      let request = null, savedRental = null;
      if (typeof api === 'function') {
        try {
          const direct = await api(`/verification-requests/${encodeURIComponent(handoff.request.id)}`);
          if (!modal.open || modal.querySelector('[data-handoff-request]') !== panel) return true;
          if (direct?.request) {
            request = enrichVerification(direct.request, getModel());
            if (direct.rental) {
              savedRental = direct.rental;
              h.applyResponse?.({ rental: direct.rental, request: direct.request });
            } else {
              h.applyResponse?.({ request: direct.request });
            }
          }
        } catch {
          // Fall back to workspace refresh when direct status endpoint is unavailable.
        }
      }
      if (!request) {
        await refresh();
        if (!modal.open || modal.querySelector('[data-handoff-request]') !== panel) return true;
        const source = getModel().verification.find(row => String(row.id) === String(handoff.request.id));
        if (!source) throw new Error('This request is no longer in the workspace. Close the dialog and refresh the queue.');
        request = enrichVerification(source, getModel());
      }
      if (!savedRental) {
        savedRental = getModel().transactions.find(row => String(row.id) === String(request.rental_id));
      }
      if (!savedRental && request.status === 'CONFIRMED' && typeof api === 'function') {
        try {
          // Completed returns or deliveries can disappear from filtered queues immediately.
          const result = await api('/rentals/lookup', { method: 'POST', body: JSON.stringify({ kind: 'RENTAL', code: request.rental_id }) });
          if (!modal.open || modal.querySelector('[data-handoff-request]') !== panel) return true;
          savedRental = result?.rental;
          if (result) h.applyResponse?.(result);
        } catch {
          // Ignore lookup error and retain existing rental snapshot.
        }
      }
      const sameInspection = request.inspection_revision === handoff.request.inspection_revision;
      const rental = handoffRental(request, request.status === 'PENDING' && sameInspection ? { ...savedRental, ...handoff.rental } : savedRental ? { ...handoff.rental, ...savedRental } : handoff.rental);
      if (request.status !== 'PENDING') {
        if (modal._handoffTimer) { clearInterval(modal._handoffTimer); modal._handoffTimer = null; }
        if (typeof api === 'function' && typeof refresh === 'function') {
          Promise.resolve(refresh()).catch(() => {});
        }
      }
      const signature = JSON.stringify([request, rental]);
      panel.querySelector('[data-handoff-error]').textContent = '';
      if (signature !== handoff.signature) {
        handoff = { request, rental, signature };
        panel.innerHTML = handoffBody(request, rental);
        const title = handoffTitle(request);
        const h2 = modal.querySelector('h2');
        if (h2) h2.textContent = title;
        modal.setAttribute('aria-label', title);
        bindHandoff();
      }
      redraw();
    } catch (problem) {
      if (modal.open && modal.querySelector('[data-handoff-request]') === panel) panel.querySelector('[data-handoff-error]').textContent = `Couldn’t check confirmation. ${problem.message}`;
    } finally {
      handoffRefreshing = false;
      if (button?.isConnected) { button.disabled = false; button.textContent = 'Check confirmation'; button.removeAttribute('aria-busy'); }
    }
    return true;
  }
  const controls = () => `<label>Condition<select name="condition" required><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option><option value="NEEDS_INSPECTION">Needs inspection</option></select></label><label>Inspection result<select name="result"><option value="AVAILABLE">Available</option><option value="UNDER_MAINTENANCE">Under Maintenance</option></select></label><label>Inspection notes<textarea name="notes" rows="3" maxlength="2000" required placeholder="Describe the condition and any missing or damaged parts"></textarea></label>`;
  const penalties = () => `<label>Penalty amount (₱)<input name="penaltyAmount" type="number" min="0" max="9999999999.99" step="0.01" required/><small>Enter 0 explicitly when no penalty applies. Overtime is calculated separately from the saved rate.</small></label><label>Penalty reason<textarea name="penaltyReason" maxlength="1000" rows="2"></textarea></label>`;
  const terminalOptions = () => handoffChoices(getModel()).terminals.map(row => `<option value="${e(row.id)}">${e(recordCode(row, 'terminal'))} · ${e(row.name || 'Counter terminal')}</option>`).join('');
  const inspectorNote = '<div class="info-box">Your signed-in account is recorded as the inspector. Saving these details leaves the handoff pending for the physical terminal.</div>';
  const actions = (label = 'Save inspection') => `<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">${label}</button></div>`;
  function bindCondition(form, release = false) {
    const condition = form.elements.condition, result = form.elements.result;
    if (release) { [...condition.options].filter(option => !['GOOD', 'FAIR'].includes(option.value)).forEach(option => option.remove()); result.value = 'AVAILABLE'; result.disabled = true; }
    const update = () => {
      if (release) return;
      const damaged = ['DAMAGED', 'NEEDS_INSPECTION'].includes(condition.value);
      if (damaged) result.value = 'UNDER_MAINTENANCE';
      result.querySelector('[value="AVAILABLE"]').disabled = damaged;
    };
    condition.onchange = update; update();
    const penalty = form.elements.penaltyAmount, reason = form.elements.penaltyReason;
    if (penalty) { const sync = () => { reason.required = Number(penalty.value) > 0; }; penalty.oninput = sync; sync(); }
  }
  function bindSubmit(form, submit, confirmation = { title: 'Save this inspection?', description: 'The condition, inspection notes, and any return penalties will be saved. The handoff will still need confirmation at the physical terminal.', confirmLabel: 'Yes, save inspection' }) {
    form.querySelector('[data-close]').onclick = () => modal.close();
    confirmSubmit(form, confirmation, async () => {
      const button = form.querySelector('[type="submit"]'); button.disabled = true;
      try { await submit(Object.fromEntries(new FormData(form))); } catch (problem) { form.querySelector('.form-error').textContent = problem.message; button.disabled = false; }
    });
  }
  function bindInspections(root = document) {
    root.querySelectorAll('[data-inspection]').forEach(button => button.onclick = () => inspectionForm(button.dataset.inspection));
    bindRecordLinks(root, { verification: verificationDetails, terminal: terminalDetails });
  }
  function inspectionForm(requestId) {
    const request = getModel().verification.find(row => row.id === requestId);
    if (!request || request.status !== 'PENDING') { toast('This request is closed. Refresh its status.'); return; }
    const release = String(request.transaction_type || request.type || '').toUpperCase() === 'RENTAL';
    showModal(release ? 'Before-release inspection' : 'Return inspection', `<form class="admin-form"><p>${e(request.transaction_type)} · ${e(recordCode(request, 'verification'))} · Terminal ${e(request.terminal_code || 'Not assigned')}</p>${controls()}${release ? '' : penalties()}${inspectorNote}${actions()}</form>`);
    const form = modal.querySelector('form'), inspection = request.inspection;
    if (inspection) { form.elements.condition.value = inspection.condition; form.elements.result.value = inspection.result; form.elements.notes.value = inspection.notes || ''; }
    if (!release) { form.elements.penaltyAmount.value = recordedAmount(request.penalty_amount) ? request.penalty_amount : ''; form.elements.penaltyReason.value = request.penalty_reason || ''; }
    bindCondition(form, release);
    bindSubmit(form, async fields => {
      const payload = { ...fields, result: form.elements.result.value, revision: request.inspection_revision || 0 };
      if (!release) payload.penaltyAmount = fields.penaltyAmount === '' ? null : Number(fields.penaltyAmount);
      await api(`/verification-requests/${encodeURIComponent(requestId)}/inspection`, { method: 'PUT', body: JSON.stringify(payload) });
      modal.close();
      try { await refresh(); toast('Inspection saved. Refresh the counter terminal before confirming.'); }
      catch { toast('Inspection saved. Select Refresh to update the verification queue.'); }
      redraw();
    });
  }
  function requestForm(type, rentalId = '') {
    return type === 'RENTAL' ? desk.bookingForm() : rentalId ? desk.receiveForm(rentalId) : desk.chooseReturn();
  }
  const mobileReturnForm = (id, reject = false) => desk.receiveForm(id, reject);

  function verificationDetails(id) {
    const model = getModel(), source = model.verification.find(row => String(row.id) === String(id));
    if (!source) { toast('This verification record is no longer available. Refresh the page.'); return; }
    const request = enrichVerification(source, model), inspection = request.inspection;
    const rental = model.transactions.find(row => String(row.id) === String(request.rental_id));
    if (request.status === 'PENDING') { showHandoff(request, rental); return; }
    showModal('Verification request details', `<section class="record-detail-modal"><div class="record-detail-heading"><h3>${e(recordCode(request))}</h3><p>${e(request.transaction_type || request.type || 'Handoff request')} · ${e(recordCode(request, 'verification'))}</p></div>${renderRequestHistory([request], { ...h, requestLinks: false })}${inspection ? `<section class="record-section"><h3>Recorded inspection</h3><dl class="record-fields"><div><dt>Condition</dt><dd>${e(inspection.condition || 'Not recorded')}</dd></div><div><dt>Inspection result</dt><dd>${e(inspection.result || 'Not recorded')}</dd></div><div><dt>Notes</dt><dd>${e(inspection.notes || 'Not recorded')}</dd></div></dl></section>` : ''}${rental ? '<div class="record-detail-actions"><button type="button" class="secondary" data-verification-rental>View rental details</button></div>' : ''}</section>`);
    bindInspections(modal);
    modal.querySelector('[data-verification-rental]')?.addEventListener('click', () => {
      h.transactionDetails(rental);
      const back = document.createElement('button');
      back.type = 'button'; back.className = 'customer-back'; back.textContent = '← Back to verification request';
      back.onclick = () => verificationDetails(id);
      modal.querySelector('.transaction-record-modal')?.prepend(back);
    });
  }

  function terminalDetails(id) {
    const model = getModel();
    const attempts = model.verification.filter(row => String(row.terminal_id) === String(id) || String(row.confirmed_terminal_id) === String(id)).map(row => enrichVerification(row, model)).sort((a, b) => (transactionTime(b.requested_at)?.getTime() || 0) - (transactionTime(a.requested_at)?.getTime() || 0));
    const terminal = model.terminals.find(row => String(row.id) === String(id));
    if (!terminal && !attempts.length) { toast('This terminal record is no longer available. Refresh the page.'); return; }
    const latest = attempts[0], terminalCode = terminal?.terminal_code || (String(latest?.confirmed_terminal_id) === String(id) ? latest.confirmed_terminal_code : latest?.terminal_code) || 'Not assigned';
    const online = terminal?.status === 'ONLINE' && terminal.is_active !== false && transactionTime(terminal.last_seen_at) && Date.now() - transactionTime(terminal.last_seen_at) < 60000;
    const state = !terminal ? 'Unregistered' : terminal.is_active === false ? 'Inactive' : online ? 'Online' : 'Offline';
    showModal('Terminal details', `<section class="record-detail-modal"><div class="record-detail-heading"><h3>${e(terminal?.name || 'Unregistered terminal')}</h3><p>${e(terminalCode)}</p></div><dl class="record-fields"><div><dt>Terminal code</dt><dd>${e(terminalCode)}</dd></div><div><dt>Status</dt><dd>${e(state)}</dd></div><div><dt>Last seen</dt><dd>${e(formatDate(terminal?.last_seen_at))}</dd></div><div><dt>Device credential</dt><dd>${terminal ? terminal.credentials_configured ? 'Configured' : 'Not configured' : 'Not recorded'}</dd></div><div><dt>Recorded attempts</dt><dd>${attempts.length}</dd></div></dl><section class="record-section"><h3>Latest verification attempts</h3>${attempts.length ? `<div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>REQUEST</th><th>TYPE</th><th>STATUS</th><th>REQUESTED</th></tr></thead><tbody>${attempts.slice(0, 5).map(request => `<tr ${recordAttrs('verification', request.id, recordCode(request, 'verification'))}><td><strong>${e(recordCode(request))}</strong><small>${e(recordCode(request, 'verification'))}</small></td><td>${e(request.transaction_type || request.type)}</td><td>${e(request.status)}</td><td>${e(formatDate(request.requested_at))}</td></tr>`).join('')}</tbody></table></div>${attempts.length > 5 ? `<p>Showing the latest 5 of ${attempts.length} attempts.</p>` : ''}` : '<p>No verification attempts recorded.</p>'}</section></section>`);
    bindInspections(modal);
  }

  function verificationPage(search, helpers) {
    const { table, paged, status, empty } = helpers, model = getModel();
    const all = (model.verification || []).map(request => enrichVerification(request, model)).sort((a, b) => (transactionTime(b.requested_at)?.getTime() || 0) - (transactionTime(a.requested_at)?.getTime() || 0));
    const pending = all.filter(request => request.status === 'PENDING').sort((a, b) => (transactionTime(a.requested_at)?.getTime() || 0) - (transactionTime(b.requested_at)?.getTime() || 0)), queue = paged(pending, 'Verification queue');
    const history = all.filter(request => verificationMatches(request, { ...filters, search })), view = paged(history, 'Verification history');
    const select = (key, label, options) => `<label class="transaction-select"><span>${label}</span><select data-verification-filter="${key}" aria-label="Filter verification ${label.toLowerCase()}">${options.map(([value, caption]) => `<option value="${e(value)}" ${filters[key] === value ? 'selected' : ''}>${e(caption)}</option>`).join('')}</select></label>`;
    const entries = records => records.map(request => {
      const hardwareTest = request.verification_code === 'TEST';
      const times = [];
      if (request.requested_at) times.push(`<span class="time-item"><strong>Requested:</strong> ${e(formatDate(request.requested_at))}</span>`);
      if (request.status === 'PENDING' && request.expires_at) times.push(`<span class="time-item time-deadline"><strong>Expires:</strong> ${e(formatDate(request.expires_at))}</span>`);
      if (request.confirmed_at) times.push(`<span class="time-item time-confirmed"><strong>Confirmed:</strong> ${e(formatDate(request.confirmed_at))}</span>`);
      if (request.expired_at) times.push(`<span class="time-item time-expired"><strong>Expired:</strong> ${e(formatDate(request.expired_at))}</span>`);
      if (request.rejected_at) times.push(`<span class="time-item time-rejected"><strong>Rejected:</strong> ${e(formatDate(request.rejected_at))}</span>`);
      if (!times.length) times.push('<span class="time-item time-muted">No timestamps recorded</span>');

      const terminalNotice = request.confirmed_terminal_id ? `Confirmed by ${e(request.confirmed_terminal_code || 'Not assigned')}` : 'No confirming terminal recorded';

      return `<tr ${recordAttrs('verification', request.id, recordCode(request, 'verification'))}>
        <td><strong class="row-highlight-code">${e(request.rental_code)}</strong><small class="record-sub">Request ${e(recordCode(request, 'verification'))}</small></td>
        <td><span class="type-pill ${hardwareTest ? 'hardware-test' : String(request.transaction_type || '').toLowerCase()}">${e(hardwareTest ? 'Hardware test' : request.transaction_type || 'Type not recorded')}</span>${hardwareTest ? '' : `<small class="record-sub">Code ${e(request.verification_code || 'not recorded')}</small>`}</td>
        <td><strong>${e(request.terminal_code)}</strong><small class="record-sub">${terminalNotice}</small></td>
        <td>${status(request.status)}</td>
        <td class="times-column">${times.join('')}</td>
        <td>
          <div class="reason-note">${e(request.rejection_reason || request.final_reason || (request.status === 'PENDING' ? request.inspection ? 'Inspection recorded' : 'Inspection needed' : request.status === 'CONFIRMED' ? hardwareTest ? 'Terminal test completed' : 'Confirmed at counter' : 'No reason recorded'))}</div>
          <div class="row-actions">
            ${request.status === 'PENDING' ? `<button type="button" class="btn-action-tag inspection" data-inspection="${e(request.id)}">${request.inspection ? 'Review inspection' : 'Record inspection'}</button>` : ''}
            ${hardwareTest ? '' : `<button type="button" class="btn-action-tag details" data-transaction-detail="${e(request.rental_id)}">Rental details</button>`}
          </div>
        </td>
      </tr>`;
    }).join('');
    const heads = ['RENTAL / REQUEST', 'TYPE', 'TERMINAL', 'STATUS', 'TIMES', 'REASON / ACTIONS'];

    const terminal = model.terminals?.[0];
    const isOnline = terminal?.status === 'ONLINE' && terminal.is_active !== false && transactionTime(terminal.last_seen_at) && (Date.now() - transactionTime(terminal.last_seen_at) < 60000);
    const lastSeenStr = terminal?.last_seen_at ? formatDate(terminal.last_seen_at) : 'Never';

    const heroCard = `
      <section class="panel terminal-station-hub">
        <div class="terminal-station-top">
          <div class="terminal-title-area">
            <div class="terminal-badge-row">
              <span class="terminal-pulse-dot ${isOnline ? 'online' : 'offline'}"></span>
              <span class="terminal-status-badge ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span>
              <span class="terminal-chip">${e(terminal?.terminal_code || 'Not registered')}</span>
            </div>
            <h2>${e(terminal?.name || (terminal ? 'Counter terminal' : 'No terminal registered'))}</h2>
            <p class="terminal-subtitle">Physical handoff confirmation · ${pending.length} waiting <span class="terminal-sync-label">· Updates automatically</span></p>
          </div>
          <div class="terminal-station-actions">
            <button type="button" class="primary" id="rental-request-add">
              ${getIcon('plus')} Walk-In Rental
            </button>
            <button type="button" class="secondary" id="return-request-add">
              ${getIcon('undo')} Receive Return
            </button>
          </div>
        </div>
        <details class="terminal-device-details" data-terminal-device ${deviceDetailsOpen ? 'open' : ''}><summary>Device details &amp; tools</summary><p class="terminal-last-seen">Last device contact: ${e(lastSeenStr)}</p><button type="button" class="secondary terminal-test-btn" id="btn-terminal-test-ping">${getIcon('zap')} Test terminal</button><div class="terminal-hardware-grid">
          <div class="hardware-spec-chip ${isOnline ? 'online' : 'offline'}">
            <span class="spec-icon">${getIcon('monitor')}</span>
            <div>
              <span class="spec-label">OLED Display</span>
              <strong>128&times;64 display</strong>
              <small class="spec-sub">SSD1306 Panel</small>
            </div>
          </div>
          <div class="hardware-spec-chip ${isOnline ? 'online' : 'offline'}">
            <span class="spec-icon">${getIcon('radio')}</span>
            <div>
              <span class="spec-label">Physical Button</span>
              <strong>Physical confirmation</strong>
              <small class="spec-sub">Confirm trigger (GPIO 35)</small>
            </div>
          </div>
          <div class="hardware-spec-chip ${isOnline ? 'online' : 'offline'}">
            <span class="spec-icon">${getIcon('volume')}</span>
            <div>
              <span class="spec-label">Audible Buzzer</span>
              <strong>Request and result alerts</strong>
              <small class="spec-sub">Counter alert (GPIO 23)</small>
            </div>
          </div>
          <div class="hardware-spec-chip ${isOnline ? 'online' : 'offline'}">
            <span class="spec-icon">${getIcon('wifi')}</span>
            <div>
              <span class="spec-label">Terminal Link</span>
              <strong>${isOnline ? 'Online &amp; Polling' : 'Station Disconnected'}</strong>
              <small class="spec-sub">${isOnline ? 'Real-time sync' : e(lastSeenStr)}</small>
            </div>
          </div>
        </div>
      </details></section>
    `;

    const workflowGuide = `
      <details class="terminal-guide-disclosure" data-terminal-guide ${guideOpen ? 'open' : ''}><summary>How counter verification works</summary><div class="terminal-guide-bar">
        <div class="guide-lead">
          <span class="guide-tag">WORKFLOW GUIDE</span>
          <strong>3-Step Counter Verification Flow</strong>
        </div>
        <div class="guide-steps-list">
          <div class="guide-step">
            <div class="guide-num">1</div>
            <div>
              <strong>Send a handoff request</strong>
              <small>Complete preparation or return inspection, then send the request to the counter terminal.</small>
            </div>
          </div>
          <div class="guide-divider">&rarr;</div>
          <div class="guide-step">
            <div class="guide-num">2</div>
            <div>
              <strong>ESP32 Sounds Alert</strong>
              <small>OLED displays the rental code and buzzer beeps to alert counter staff.</small>
            </div>
          </div>
          <div class="guide-divider">&rarr;</div>
          <div class="guide-step">
            <div class="guide-num">3</div>
            <div>
              <strong>Button Push Confirms</strong>
              <small>Match the request, then confirm on the terminal. Handover starts the timer; returns use the recorded receipt time. Shop dispatch keeps the timer stopped.</small>
            </div>
          </div>
        </div>
      </div></details>
    `;

    const queueSection = `
      <section class="panel admin-module verification-queue-panel">
        <div class="panel-title">
          <div>
            <h3>Active Verification Queue <span class="active-queue-badge">${pending.length} waiting</span></h3>
            <p>Handoffs awaiting physical confirmation on the ESP32 terminal.</p>
          </div>
        </div>
        ${pending.length ? table(heads, entries(queue.rows)) + queue.footer : `
          <div class="terminal-idle-box">
            <div class="idle-icon-badge ${isOnline ? '' : 'is-offline'}" aria-hidden="true">${isOnline ? '&check;' : '–'}</div>
            <div>
              <h4>${isOnline ? 'All clear — no pending handoffs' : 'No pending handoffs · terminal offline'}</h4>
              <p>${isOnline ? 'New rental and return confirmations will appear here.' : 'Check device power and Wi-Fi before sending a terminal request.'}</p>
            </div>
          </div>
        `}
      </section>
    `;

    const historySection = `
      <section class="panel admin-module verification-history-panel">
        <div class="panel-title">
          <div>
            <h3>Full verification history</h3>
            <p>Audit trail of all confirmed, rejected, and expired terminal handovers.</p>
          </div>
        </div>
        <div class="transaction-filter-toolbar history-filter-toolbar">
          <label class="module-search">
            <input id="module-search" value="${e(search)}" placeholder="Search rental, request or code" aria-label="Search verification history"/>
          </label>
          <div class="transaction-selects">
            ${select('status', 'Status', ['ALL', 'PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED'].map(value => [value, value === 'ALL' ? 'All statuses' : value]))}
            ${select('type', 'Type', [['ALL', 'All types'], ['RENTAL', 'Rental'], ['RETURN', 'Return']])}
            ${select('terminal', 'Terminal', [['ALL', 'All terminals'], ...model.terminals.map(t => [t.id, recordCode(t, 'terminal')]), ...[...new Set(all.map(r => r.terminal_id).filter(id => id && !model.terminals.some(t => t.id === id)))].map(id => [String(id), 'Unregistered terminal'])])}
          </div>
        </div>
        ${history.length ? table(heads, entries(view.rows)) + view.footer : empty('No matching attempts', 'Adjust the search or verification filters.')}
      </section>
    `;

    return `<div class="verification-workspace">${heroCard + queueSection + workflowGuide + historySection}</div>`;
  }
  function bind(page, rerender, pages) {
    if (page === 'ESP32 terminal') {
      document.querySelector('[data-terminal-guide]')?.addEventListener('toggle', event => { guideOpen = event.currentTarget.open; });
      document.querySelector('[data-terminal-device]')?.addEventListener('toggle', event => { deviceDetailsOpen = event.currentTarget.open; });
    }
    bindInspections(); clearInterval(pagePollTimer); if (page === 'ESP32 terminal' && (getModel()?.verification || []).some(r => r.status === 'PENDING')) { pagePollTimer = setInterval(async () => { if (document.visibilityState !== 'visible' || modal.open) return; try { const changed = await refresh(); if (changed && !modal.open) rerender(); } catch {} }, 2000); }
    document.querySelector('#rental-request-add')?.addEventListener('click', () => requestForm('RENTAL'));
    document.querySelector('#return-request-add')?.addEventListener('click', () => requestForm('RETURN'));
    document.querySelector('#btn-terminal-test-ping')?.addEventListener('click', async event => {
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Dispatching to ESP32...';
      try {
        await api('/terminals/TERM-01/test-ping', { method: 'POST' });
        toast('Test dispatched! Check ESP32 OLED & buzzers, then press the physical button (GPIO 35) to confirm.');
        await refresh();
        rerender();
      } catch (err) {
        toast('Test failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Test terminal';
      }
    });
    document.querySelectorAll('[data-verification-filter]').forEach(select => select.onchange = () => { filters[select.dataset.verificationFilter] = select.value; pages['Verification history'] = 0; rerender(); });
  }
  return { verificationPage, bind, bindInspections, requestForm, mobileReturnForm, verificationDetails, terminalDetails, refreshPendingHandoff, desk };
}
