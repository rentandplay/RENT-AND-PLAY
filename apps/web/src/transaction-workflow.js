import { createRentalDesk } from './rental-desk.js';
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
  const { api, escape: e, showModal, modal, toast, formatDate, money, model: getModel, refresh, redraw, confirmSubmit } = h;
  const desk = createRentalDesk(h);
  const filters = { status: 'ALL', type: 'ALL', terminal: 'ALL' };
  let handoff = null, handoffRefreshing = false;
  function handoffRental(request, rental = {}) {
    if (request.status !== 'PENDING' || String(request.transaction_type || request.type).toUpperCase() !== 'RETURN') return rental;
    return { ...rental, fee_breakdown: { ...rental.fee_breakdown, actual_return_at: request.actual_return_at || rental.fee_breakdown?.actual_return_at, penalty_amount: request.penalty_amount, penalty_reason: request.penalty_reason } };
  }
  function handoffBody(request, rental) {
    const pending = request.status === 'PENDING', release = String(request.transaction_type || request.type).toUpperCase() === 'RENTAL';
    const message = pending ? 'Waiting for the physical counter terminal.' : request.status === 'CONFIRMED' ? `${release ? 'Rental' : 'Return'} confirmed at the counter.` : `This request is ${String(request.status).toLowerCase()}. Review the recorded reason below.`;
    const inspection = request.inspection;
    return `<p class="info-box" role="status">${e(message)}</p>${pending ? `<div class="handoff-code"><small>Verification code</small><strong>${e(request.verification_code)}</strong><p>Terminal ${e(request.terminal_code || request.terminal_id)} · Expires ${e(formatDate(request.expires_at))}</p></div><div class="handoff-refresh"><p>Check confirmation to view the latest counter status.</p><button type="button" class="secondary" data-handoff-refresh>Check confirmation</button></div>` : ''}<p class="form-error" role="alert" data-handoff-error></p>${renderFeeBreakdown(rental, h)}${inspection ? `<section class="record-section"><h3>Recorded inspection</h3><dl class="record-fields"><div><dt>Condition</dt><dd>${e(inspection.condition || 'Not recorded')}</dd></div><div><dt>Inspection result</dt><dd>${e(inspection.result || 'Not recorded')}</dd></div><div><dt>Notes</dt><dd>${e(inspection.notes || 'Not recorded')}</dd></div></dl></section>` : ''}${renderRequestHistory([request], { ...h, requestLinks: false })}`;
  }
  function bindHandoff() {
    modal.querySelector('[data-handoff-refresh]')?.addEventListener('click', refreshPendingHandoff);
    bindInspections(modal);
  }
  function showHandoff(source, rental) {
    const request = enrichVerification(source, getModel());
    rental = handoffRental(request, rental);
    handoff = { request, rental, signature: JSON.stringify([request, rental]) };
    showModal('Awaiting terminal confirmation', `<section data-handoff-request="${e(request.id)}">${handoffBody(request, rental)}</section>`);
    bindHandoff();
  }
  async function refreshPendingHandoff() {
    const panel = modal.querySelector('[data-handoff-request]');
    if (!modal.open || !panel || !handoff || handoff.request.status !== 'PENDING' || handoffRefreshing) return false;
    handoffRefreshing = true;
    const button = panel.querySelector('[data-handoff-refresh]');
    if (button) { button.disabled = true; button.textContent = 'Checking…'; button.setAttribute('aria-busy', 'true'); }
    try {
      await refresh();
      if (!modal.open || modal.querySelector('[data-handoff-request]') !== panel) return true;
      const source = getModel().verification.find(row => String(row.id) === String(handoff.request.id));
      if (!source) throw new Error('This request is no longer in the workspace. Close the dialog and refresh the queue.');
      const request = enrichVerification(source, getModel());
      const savedRental = getModel().transactions.find(row => String(row.id) === String(request.rental_id));
      const sameInspection = request.inspection_revision === handoff.request.inspection_revision;
      const rental = handoffRental(request, request.status === 'PENDING' && sameInspection ? { ...savedRental, ...handoff.rental } : savedRental || handoff.rental);
      const signature = JSON.stringify([request, rental]);
      panel.querySelector('[data-handoff-error]').textContent = '';
      if (signature !== handoff.signature) {
        handoff = { request, rental, signature };
        panel.innerHTML = handoffBody(request, rental);
        const title = request.status === 'PENDING' ? 'Awaiting terminal confirmation' : request.status === 'CONFIRMED' ? `${String(request.transaction_type || request.type).toUpperCase() === 'RENTAL' ? 'Rental' : 'Return'} confirmed` : 'Handoff request closed';
        modal.querySelector('h2').textContent = title; modal.setAttribute('aria-label', title);
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
  const terminalOptions = () => handoffChoices(getModel()).terminals.map(row => `<option value="${e(row.id)}">${e(row.terminal_code || row.id)} · ${e(row.name || 'Counter terminal')}</option>`).join('');
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
    showModal(release ? 'Before-release inspection' : 'Return inspection', `<form class="admin-form"><p>${e(request.transaction_type)} · ${e(request.id)} · Terminal ${e(request.terminal_code || request.terminal_id)}</p>${controls()}${release ? '' : penalties()}${inspectorNote}${actions()}</form>`);
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
    showModal('Verification request details', `<section class="record-detail-modal"><div class="record-detail-heading"><h3>${e(request.rental_code || request.rental_id)}</h3><p>${e(request.transaction_type || request.type || 'Handoff request')} · ${e(request.id)}</p></div>${renderRequestHistory([request], { ...h, requestLinks: false })}${inspection ? `<section class="record-section"><h3>Recorded inspection</h3><dl class="record-fields"><div><dt>Condition</dt><dd>${e(inspection.condition || 'Not recorded')}</dd></div><div><dt>Inspection result</dt><dd>${e(inspection.result || 'Not recorded')}</dd></div><div><dt>Notes</dt><dd>${e(inspection.notes || 'Not recorded')}</dd></div></dl></section>` : ''}${rental ? '<div class="record-detail-actions"><button type="button" class="secondary" data-verification-rental>View rental details</button></div>' : ''}</section>`);
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
    const latest = attempts[0], terminalCode = terminal?.terminal_code || (String(latest?.confirmed_terminal_id) === String(id) ? latest.confirmed_terminal_code : latest?.terminal_code) || id;
    const online = terminal?.status === 'ONLINE' && terminal.is_active !== false && transactionTime(terminal.last_seen_at) && Date.now() - transactionTime(terminal.last_seen_at) < 90000;
    const state = !terminal ? 'Unregistered' : terminal.is_active === false ? 'Inactive' : online ? 'Online' : 'Offline';
    showModal('Terminal details', `<section class="record-detail-modal"><div class="record-detail-heading"><h3>${e(terminal?.name || 'Unregistered terminal')}</h3><p>${e(terminalCode)}</p></div><dl class="record-fields"><div><dt>Terminal ID</dt><dd>${e(id)}</dd></div><div><dt>Status</dt><dd>${e(state)}</dd></div><div><dt>Last seen</dt><dd>${e(formatDate(terminal?.last_seen_at))}</dd></div><div><dt>Device credential</dt><dd>${terminal ? terminal.credentials_configured ? 'Configured' : 'Not configured' : 'Not recorded'}</dd></div><div><dt>Recorded attempts</dt><dd>${attempts.length}</dd></div></dl><section class="record-section"><h3>Latest verification attempts</h3>${attempts.length ? `<div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>REQUEST</th><th>TYPE</th><th>STATUS</th><th>REQUESTED</th></tr></thead><tbody>${attempts.slice(0, 5).map(request => `<tr ${recordAttrs('verification', request.id, request.rental_code || request.id)}><td><strong>${e(request.rental_code || request.rental_id)}</strong><small>${e(request.id)}</small></td><td>${e(request.transaction_type || request.type)}</td><td>${e(request.status)}</td><td>${e(formatDate(request.requested_at))}</td></tr>`).join('')}</tbody></table></div>${attempts.length > 5 ? `<p>Showing the latest 5 of ${attempts.length} attempts.</p>` : ''}` : '<p>No verification attempts recorded.</p>'}</section></section>`);
    bindInspections(modal);
  }

  function verificationPage(search, helpers) {
    const { table, paged, status, empty } = helpers, model = getModel();
    const all = (model.verification || []).map(request => enrichVerification(request, model)).sort((a, b) => (transactionTime(b.requested_at)?.getTime() || 0) - (transactionTime(a.requested_at)?.getTime() || 0));
    const pending = all.filter(request => request.status === 'PENDING').sort((a, b) => (transactionTime(a.requested_at)?.getTime() || 0) - (transactionTime(b.requested_at)?.getTime() || 0)), queue = paged(pending, 'Verification queue');
    const history = all.filter(request => verificationMatches(request, { ...filters, search })), view = paged(history, 'Verification history');
    const select = (key, label, options) => `<label class="transaction-select"><span>${label}</span><select data-verification-filter="${key}" aria-label="Filter verification ${label.toLowerCase()}">${options.map(([value, caption]) => `<option value="${e(value)}" ${filters[key] === value ? 'selected' : ''}>${e(caption)}</option>`).join('')}</select></label>`;
    const entries = records => records.map(request => `<tr ${recordAttrs('verification', request.id, request.rental_code || request.id)}><td><strong>${e(request.rental_code)}</strong><small>Rental ID ${e(request.rental_id)}</small><small>Request ${e(request.id)}</small></td><td>${e(request.transaction_type || 'Type not recorded')}<small>Code ${e(request.verification_code || 'not recorded')}</small></td><td><strong>${e(request.terminal_code)}</strong><small>ID ${e(request.terminal_id || 'not recorded')}</small><small>${request.confirmed_terminal_id ? `Confirmed by ${e(request.confirmed_terminal_code || request.confirmed_terminal_id)}` : 'No confirming terminal recorded'}</small></td><td>${status(request.status)}</td><td><small>Requested ${e(formatDate(request.requested_at))}</small><small>Deadline ${e(formatDate(request.expires_at))}</small><small>Confirmed ${e(formatDate(request.confirmed_at))}</small><small>Expired ${e(formatDate(request.expired_at))}</small><small>Rejected ${e(formatDate(request.rejected_at))}</small></td><td>${e(request.rejection_reason || request.final_reason || (request.status === 'PENDING' ? request.inspection ? 'Inspection recorded' : 'Inspection needed' : 'No reason recorded'))}<div class="row-actions">${request.status === 'PENDING' ? `<button class="text-button" data-inspection="${e(request.id)}">${request.inspection ? 'Review inspection' : 'Record inspection'}</button>` : ''}<button class="text-button" data-transaction-detail="${e(request.rental_id)}">Rental details</button></div></td></tr>`).join('');
    const heads = ['RENTAL / REQUEST', 'TYPE', 'TERMINAL', 'STATUS', 'TIMES', 'REASON / ACTIONS'];
    return `<p class="info-box">ESP32 terminal is on standby. Rentals and returns are confirmed by the admin in the rental and return desk.</p><div class="module-stats">${['PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED'].map(value => `<article><span>${value.charAt(0) + value.slice(1).toLowerCase()}</span><strong>${all.filter(request => request.status === value).length}</strong></article>`).join('')}</div><section class="panel admin-module"><div class="panel-title"><div><h3>Verification queue</h3><p>Only pending requests appear here. Closed attempts remain in history.</p></div></div>${pending.length ? table(heads, entries(queue.rows)) + queue.footer : empty('No pending handoffs', 'All recorded attempts are available below.')}</section><section class="panel admin-module verification-history-panel"><div class="panel-title"><div><h3>Full verification history</h3><p>All attempts, including rejected and expired rental and return requests.</p></div></div><div class="transaction-filter-toolbar history-filter-toolbar"><label class="module-search"><input id="module-search" value="${e(search)}" placeholder="Search rental, request, code, terminal, or reason" aria-label="Search verification history"/></label><div class="transaction-selects">${select('status', 'Status', ['ALL', 'PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED'].map(value => [value, value === 'ALL' ? 'All statuses' : value]))}${select('type', 'Type', [['ALL', 'All types'], ['RENTAL', 'Rental'], ['RETURN', 'Return']])}${select('terminal', 'Terminal', [['ALL', 'All terminals'], ...model.terminals.map(terminal => [terminal.id, terminal.terminal_code || terminal.id]), ...[...new Set(all.map(request => request.terminal_id).filter(id => id && !model.terminals.some(terminal => terminal.id === id)))].map(id => [String(id), `Unregistered · ${id}`])])}</div></div>${history.length ? table(heads, entries(view.rows)) + view.footer : empty('No matching attempts', 'Adjust the search or verification filters.')}</section><section class="panel admin-module"><div class="panel-title"><div><h3>Registered terminals</h3><p>Terminal configuration is retained for later hardware setup; polling is paused.</p></div></div>${model.terminals.length ? table(['TERMINAL', 'DEVICE', 'LAST SEEN'], model.terminals.map(terminal => `<tr ${recordAttrs('terminal', terminal.id, terminal.terminal_code || terminal.name || 'terminal')}><td><strong>${e(terminal.terminal_code || terminal.id)}</strong><small>${e(terminal.id)}</small></td><td>${status(terminal.is_active === false ? 'Inactive' : terminal.status === 'ONLINE' && transactionTime(terminal.last_seen_at) && Date.now() - transactionTime(terminal.last_seen_at) < 90000 ? 'Online' : 'Offline')}<small>${terminal.credentials_configured ? 'Device credential configured' : 'Device credential not configured'}</small></td><td>${e(formatDate(terminal.last_seen_at))}</td></tr>`).join('')) : empty('No terminals registered', 'The terminal can be set up when hardware is ready. Current rentals use admin confirmation.')}</section>`;
  }
  function bind(page, rerender, pages) {
    bindInspections();
    document.querySelector('#rental-request-add')?.addEventListener('click', () => requestForm('RENTAL'));
    document.querySelector('#return-request-add')?.addEventListener('click', () => requestForm('RETURN'));
    document.querySelectorAll('[data-verification-filter]').forEach(select => select.onchange = () => { filters[select.dataset.verificationFilter] = select.value; pages['Verification history'] = 0; rerender(); });
  }
  return { verificationPage, bind, bindInspections, requestForm, mobileReturnForm, verificationDetails, terminalDetails, refreshPendingHandoff, desk };
}
