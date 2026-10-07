import { analyticsRange, calculateAnalytics, analyticsCsv } from './analytics.js';
import { renderAnalyticsReport } from './analytics-report.js';
import { renderSettings, settingsTabs } from './settings-ui.js';
import { readPreferences, writePreferences, preferenceDefaults } from './preferences.js';
import { actualReturnTime, chargeCell, enrichVerification, outcomeMatches, renderConditionSnapshots, renderFeeBreakdown, renderAdminHandoff, renderRequestHistory, savedCharges } from './transaction-records.js';
import { createTransactionWorkflow } from './transaction-workflow.js';
import { createCustomerUI } from './customer-ui.js';
import { bindRecordLinks, recordAttrs } from './record-links.js';
import { createRecordDetails } from './record-details.js';
import { manilaDateTimeInput, manilaDateTimeIso } from './date-time.js';

export function createWorkspaceUI(h) {
  const { api, escape: e, showModal, modal, toast, money, formatDate, icon, confirmAction, confirmSubmit } = h;
  let model = null, loading = null, search = '', redraw = () => { }, pages = {};
  let cacheVersion = 0, modelVersion = -1, loadError = '';
  let searchPage = '', pageSearches = {};
  const pageSize = 5;
  let preferences = readPreferences();
  try { preferences = readPreferences(localStorage); } catch { }
  let settingsTab = 'business', businessDraft = null, businessDirty = false, businessSaving = false, preferencesDraft = null;
  const analyticsSelection = { period: preferences.reportPeriod, from: '', to: '', categoryId: '', itemId: '', groupBy: preferences.reportGrouping };
  const reportView = { section: 'rental', sort: 'rentals', details: {} };
  const activeRates = () => model.rates.filter(rate => rate.is_active !== false);
  const status = value => `<span class="badge ${e(String(value || 'unknown').toLowerCase().replaceAll('_', '-').replaceAll(' ', '-'))}">${e(String(value || 'Unknown').replaceAll('_', ' '))}</span>`;
  const invalidate = () => { cacheVersion++; loading = null; loadError = ''; };
  const load = async (force = false) => {
    if (force) invalidate();
    if (model && modelVersion === cacheVersion) return model;
    if (!loading) {
      const version = cacheVersion;
      const request = api('/workspace').then(value => {
        if (version === cacheVersion) { model = value; modelVersion = version; loadError = ''; }
        return value;
      }).catch(error => { if (version === cacheVersion) loadError = error.message; throw error; })
        .finally(() => { if (loading === request) loading = null; });
      loading = request;
    }
    return loading;
  };
  const refresh = async () => {
    const previous = model ? JSON.stringify(Object.fromEntries(Object.entries(model).filter(([key]) => key !== 'refreshedAt'))) : '';
    const next = await load(true);
    return previous !== JSON.stringify(Object.fromEntries(Object.entries(next).filter(([key]) => key !== 'refreshedAt')));
  };
  const workflow = createTransactionWorkflow({ ...h, model: () => model, refresh, redraw: () => redraw(), transactionDetails });
  const customerUI = createCustomerUI({ ...h, model: () => model, refresh, transactionDetails });
  const recordDetails = createRecordDetails({ ...h, model: () => model, transactionDetails });
  const empty = (title, text) => `<div class="workspace-empty">${icon('box')}<h3>${e(title)}</h3><p>${e(text)}</p></div>`;
  const table = (heads, rows) => `<div class="admin-table-scroll" role="region" aria-label="Scrollable records" tabindex="0"><table class="admin-table"><thead><tr>${heads.map(v => `<th>${v}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const includes = (row, keys) => keys.some(key => String(row[key] || '').toLowerCase().includes(search.trim().toLowerCase()));
  const paged = (records, key) => { const total = Math.max(1, Math.ceil(records.length / pageSize)); pages[key] = Math.min(Math.max(0, pages[key] || 0), total - 1); const start = pages[key] * pageSize; return { rows: records.slice(start, start + pageSize), footer: `<div class="module-pagination"><span>${records.length ? `${start + 1}–${Math.min(start + pageSize, records.length)} of ${records.length}` : '0 records'} · Page ${records.length ? pages[key] + 1 : 0} of ${Math.ceil(records.length / pageSize)}</span><div><button class="secondary" data-pager-prev="${e(key)}" ${pages[key] ? '' : 'disabled'}>← Previous</button><button class="secondary" data-pager-next="${e(key)}" ${start + pageSize < records.length ? '' : 'disabled'}>Next →</button></div></div>` }; };

  function customers() {
    return customerUI.render(search, { paged, table, status, empty });
  }

  const txState = { Rentals: { filter: "All open" }, Returns: { filter: "All returns" }, "Transaction History": { status: "All statuses", period: "All time" } };
  const txDate = value => {
    if (!value) return null;
    const text = String(value), date = new Date(/Z$|[+-][0-9]{2}:[0-9]{2}$/.test(text) ? text : text.replace(" ", "T") + "+08:00");
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const txDay = value => { const date = value instanceof Date ? value : txDate(value); return date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : ""; };
  const txIsReturned = row => row.status === 'COMPLETED' || Boolean(row.confirmed_return_at);
  const txIsLate = row => { const returnedAt = txDate(actualReturnTime(row)), dueAt = txDate(row.due_at); return Boolean(returnedAt && dueAt && returnedAt > dueAt); };
  const txPending = type => (model.verification || []).filter(request => request.status === "PENDING" && String(request.transaction_type || request.type || "").toUpperCase() === type);
  const txSearch = row => [row.rental_code, row.id, row.item_name, row.item_code, row.customer_name, row.status].join(" ").toLowerCase().includes(search.toLowerCase());
  const txCode = row => row.rental_code || row.id || "Rental record";
  const txStatus = row => {
    if (row.status === "APPROVED") return "Awaiting delivery";
    if (row.status === "RETURN_PENDING_INSPECTION") return "Received · inspection pending";
    if (row.status === "PENDING_ADMIN_APPROVAL") return "Pending admin review";
    if (row.status === "PENDING_VERIFICATION") return "Pending verification";
    if (row.status === "CANCELLED") return "Cancelled";
    if (row.status === "ACTIVE") { const due = txDate(row.due_at), now = new Date(); if (due && due < now) return "Overdue"; if (due && txDay(due) === txDay(now)) return "Due today"; return "Active"; }
    return String(row.status || "Unknown").replaceAll("_", " ");
  };
  const txMetric = (label, value, note, glyph, tone = "blue") => `<article><div class="transaction-metric-label"><span>${e(label)}</span><i class="transaction-metric-icon ${e(tone)}">${icon(glyph)}</i></div><strong>${e(value)}</strong><small>${e(note)}</small></article>`;
  const txFilter = (page, label, count) => `<button type="button" class="transaction-filter ${txState[page].filter === label ? "selected" : ""}" data-transaction-filter="${e(label)}" aria-pressed="${txState[page].filter === label}">${e(label)}<span>${count}</span></button>`;
  const txDueCell = row => { if (["APPROVED","PENDING_ADMIN_APPROVAL"].includes(row.status)) return `<strong>Starts at handoff</strong><small>Hold until ${e(formatDate(row.hold_expires_at))}</small>`; const due = txDate(row.due_at), now = new Date(), label = txStatus(row); const hint = label === "Overdue" && due ? `Overdue by ${Math.max(1, Math.ceil((now - due) / 3600000))}h` : label === "Due today" ? "Due today" : label === "Pending verification" ? "Waiting at counter" : "Due date"; return `<strong>${e(formatDate(row.due_at))}</strong><small class="${label === "Overdue" ? "transaction-alert-text" : label === "Due today" ? "transaction-due-text" : ""}">${e(hint)}</small>`; };
  const txCsvCell = value => { const quote = String.fromCharCode(34), text = String(value ?? ""), safe = /^[=+@\-\t\r]/.test(text) ? String.fromCharCode(39) + text : text; return quote + safe.replaceAll(quote, quote + quote) + quote; };
  const txHistoryMatches = (row, state) => {
    const date = txDate(row.confirmed_rental_at || row.created_at), today = txDay(new Date());
    if (!txSearch(row)) return false;
    if (state.status === "Returned" && !txIsReturned(row)) return false;
    if (state.status === "Awaiting delivery" && row.status !== "APPROVED") return false;
    if (state.status === "Inspection pending" && row.status !== "RETURN_PENDING_INSPECTION") return false;
    if (state.status === "Active" && row.status !== "ACTIVE") return false;
    if (state.status === "Pending admin review" && row.status !== "PENDING_ADMIN_APPROVAL") return false;
    if (state.status === "Pending verification" && row.status !== "PENDING_VERIFICATION") return false;
    if (state.status === "Cancelled" && !/CANCEL/i.test(String(row.status || ""))) return false;
    if (['Rejected', 'Expired'].includes(state.status) && !outcomeMatches(row, model.verification || [], state.status.toUpperCase())) return false;
    if (state.period === "All time") return true;
    if (!date) return false;
    if (state.period === "This month") return txDay(date).slice(0, 7) === today.slice(0, 7);
    if (state.period === "This year") return txDay(date).slice(0, 4) === today.slice(0, 4);
    return state.period !== "Last 30 days" || date >= new Date(Date.now() - 30 * 86400000);
  };

  function transactionDetails(row) {
    const requests = (model.verification || []).filter(request => String(request.rental_id) === String(row.id)).map(request => enrichVerification(request, model)).sort((a, b) => String(b.requested_at || "").localeCompare(String(a.requested_at || "")));
    const rentalStage = row.confirmed_rental_at ? `<li class="done"><span></span><div><strong>Rental confirmed</strong><small>${e(formatDate(row.confirmed_rental_at))}</small></div></li>` : `<li class="pending"><span></span><div><strong>${row.status === "APPROVED" ? (row.delivery_status === 'PREPARED' ? "Approved · ready for delivery" : "Approved · preparing delivery") : row.status === "PENDING_ADMIN_APPROVAL" ? "Waiting for admin review" : row.status === "PENDING_VERIFICATION" ? "Awaiting rental confirmation" : "Rental confirmation not recorded"}</strong><small>${e(formatDate(row.created_at))}</small></div></li>`;
    const returnStage = row.confirmed_return_at ? `<li class="done"><span></span><div><strong>Return confirmed${txIsLate(row) ? " · late" : ""}</strong><small>${e(formatDate(row.confirmed_return_at))}</small></div></li>` : row.received_at ? `<li class="done"><span></span><div><strong>Physically received · inspection pending</strong><small>${e(formatDate(row.received_at))} · rental clock stopped</small></div></li>` : `<li><span></span><div><strong>${txIsReturned(row) ? "Return marked complete" : "Return not yet recorded"}</strong><small>${row.due_at ? `Due ${e(formatDate(row.due_at))}` : "No due date recorded"}</small></div></li>`;
    const outcome = row.final_reason ? `<p class="request-outcome-reason">${e(row.final_reason)}</p>` : '';
    const needsAdminReview = row.status === "PENDING_ADMIN_APPROVAL";
    const contact = [row.customer_email, row.customer_phone].filter(Boolean).join(" · ") || "Not provided";
    const review = needsAdminReview ? `<section class="record-section"><h3>Mobile rental request</h3><p>Approval reserves the equipment. The timer starts at resort handoff.</p><dl class="record-fields"><div><dt>Customer contact</dt><dd>${e(contact)}</dd></div><div><dt>Delivery location</dt><dd>${e(row.delivery_location || "Not provided")}</dd></div><div><dt>Payment method</dt><dd>${e(row.payment_method || "Not recorded")}</dd></div><div><dt>Payment confirmed</dt><dd>${row.payment_confirmed_by_admin ? "Yes" : "No"}</dd></div></dl></section>` : '';
    const receiving = ['ACTIVE', 'RETURN_PENDING_INSPECTION'].includes(row.status), returnPending = row.latest_return_request_status === 'PENDING_ADMIN_APPROVAL';
    const returnRequest = receiving && returnPending ? `<section class="record-section"><h3>Customer return request</h3><p>Reported condition: ${e(row.mobile_return_request?.reported_condition || 'Not recorded')}. ${e(row.mobile_return_request?.notes || '')}</p></section>` : '';
    const paymentAmount = value => typeof value === 'number' && Number.isFinite(value) ? e(money(value)) : 'Not recorded';
    const footer = row.status === 'APPROVED' ? `<div class="transaction-footer-copy"><strong>${row.delivery_status === 'PREPARED' ? 'Ready for delivery' : 'Prepare assigned equipment'}</strong><small>Handoff deadline ${e(formatDate(row.hold_expires_at))}</small></div><div class="form-actions"><button type="button" class="secondary" data-rental-assignment="${e(row.id)}">Change unit</button>${row.delivery_status === 'PREPARED' ? `<button type="button" class="primary" data-rental-release="${e(row.id)}">Confirm resort handoff</button>` : `<button type="button" class="primary" data-rental-prepare="${e(row.id)}">Prepare for delivery</button>`}</div>` : needsAdminReview ? `<div class="transaction-footer-copy"><strong>Review customer request</strong><small>The timer starts after resort handoff.</small></div><div class="form-actions"><button type="button" class="secondary" data-mobile-rental-review="REJECT">Reject request</button><button type="button" class="primary" data-mobile-rental-review="APPROVE">${row.payment_method === 'QR' ? 'Review payment &amp; approve' : 'Approve rental request'}</button></div>` : receiving ? `<div class="transaction-footer-copy"><strong>${row.status === 'RETURN_PENDING_INSPECTION' ? 'Equipment received' : 'Receive returned equipment'}</strong><small>${row.status === 'RETURN_PENDING_INSPECTION' ? 'Complete the condition and accessory checks.' : 'Physical receipt stops the rental timer.'}</small></div><div class="form-actions">${returnPending ? '<button type="button" class="secondary" data-mobile-return-reject>Reject request</button>' : ''}<button type="button" class="primary" data-mobile-return-confirm>${row.status === 'RETURN_PENDING_INSPECTION' ? 'Complete inspection' : 'Record physical receipt'}</button></div>` : '<div class="transaction-footer-copy"><strong>Transaction record</strong><small>Pricing and inspection history are saved with this rental.</small></div>';
    showModal("Rental details", `<div class="transaction-record-modal"><div class="transaction-detail-overview"><div class="transaction-detail-head"><div><span class="eyebrow">${e(txCode(row))}</span><h3>${e(row.item_name || "Unknown equipment")}</h3><p>Assigned unit · ${e(row.item_code || "No item code")}</p></div>${status(txStatus(row))}</div><div class="transaction-detail-grid"><div><small>Customer</small><strong>${e(row.customer_name || "Unknown customer")}</strong></div><div><small>${row.status === 'APPROVED' || needsAdminReview ? 'Rental starts' : 'Due time'}</small><strong>${row.status === 'APPROVED' || needsAdminReview ? 'At handoff' : e(formatDate(row.due_at))}</strong></div></div></div><div class="transaction-detail-scroll">${outcome}${review}${returnRequest}${renderFeeBreakdown(row, h)}<section class="record-section"><h3>Payment and deposit</h3>${!Object.hasOwn(row, 'rental_paid_amount') ? '<p>Payment and refund receipts were not recorded for this historical rental.</p>' : `<dl class="record-fields"><div><dt>Payment status</dt><dd>${e(String(row.payment_status || 'Not recorded').replaceAll('_', ' '))}</dd></div><div><dt>Rental payment received</dt><dd>${paymentAmount(row.rental_paid_amount)}</dd></div><div><dt>Outstanding rental balance</dt><dd>${paymentAmount(row.balance_due)}</dd></div><div><dt>Deposit collected</dt><dd>${paymentAmount(row.deposit_collected_amount)}</dd></div>${['COMPLETED','CANCELLED','REJECTED','EXPIRED'].includes(row.status) ? `<div><dt>Refund due</dt><dd>${paymentAmount(row.refund_due)}</dd></div>` : ''}</dl>`}${['COMPLETED','CANCELLED','REJECTED','EXPIRED'].includes(row.status) && Object.hasOwn(row,'rental_paid_amount') ? `<button type="button" class="secondary" data-rental-settlement="${e(row.id)}">Record payment or refund</button>` : ''}</section><details class="record-disclosure"><summary><span>Condition &amp; accessories</span><small>Release and return inspections</small></summary><div class="record-disclosure-body">${renderConditionSnapshots(row, model, h)}</div></details><details class="record-disclosure"><summary><span>Activity &amp; verification</span><small>Timeline and admin confirmations</small></summary><div class="record-disclosure-body"><h3 class="transaction-detail-section-title">Transaction timeline</h3><ol class="transaction-timeline"><li class="done"><span></span><div><strong>Record created</strong><small>${e(formatDate(row.created_at))}</small></div></li>${rentalStage}<li class="${row.confirmed_return_at ? "done" : ""}"><span></span><div><strong>Due date</strong><small>${row.status === 'APPROVED' || needsAdminReview ? 'Set when equipment is released' : e(formatDate(row.due_at))}</small></div></li>${returnStage}</ol>${row.booking_qr_token ? renderAdminHandoff(row, h) : ""}${requests.length || !row.booking_qr_token ? `<section class="record-section"><h3>Full verification history · ${requests.length} attempt(s)</h3>${renderRequestHistory(requests, h)}</section>` : ""}</div></details></div><footer class="transaction-detail-footer">${footer}</footer></div>`);
    workflow.bindInspections(modal); workflow.desk.bind(modal);
    if (['ACTIVE','RETURN_PENDING_INSPECTION'].includes(row.status)) {
      modal.querySelector('[data-mobile-return-confirm]').onclick = () => workflow.mobileReturnForm(row.id);
      modal.querySelector('[data-mobile-return-reject]')?.addEventListener('click', () => workflow.mobileReturnForm(row.id, true));
    }
    modal.querySelectorAll('[data-mobile-rental-review]').forEach(button => button.addEventListener('click', () => mobileRentalReview(row, button.dataset.mobileRentalReview)));
  }

  function mobileRentalReview(row, action) { workflow.desk.reviewForm(row, action); }

  function rentalActions(row) {
    const choices = [];
    const add = (label, run, primary = false) => choices.push({ label, run, primary });
    if (row.status === 'PENDING_ADMIN_APPROVAL') {
      if (row.payment_method !== 'QR' || row.payment_proof_status === 'PENDING_REVIEW') add(row.payment_method === 'QR' ? 'Review payment & approve' : 'Approve rental request', () => mobileRentalReview(row, 'APPROVE'), true);
      add('Reject request', () => mobileRentalReview(row, 'REJECT'));
    } else if (row.status === 'APPROVED') {
      if (row.delivery_status === 'PREPARED') add('Confirm resort handoff', () => workflow.desk.releaseForm(row), true);
      else add('Prepare for delivery', () => workflow.desk.prepareForm(row), true);
      add('Change assigned unit', () => workflow.desk.assignmentForm(row));
    } else if (row.status === 'ACTIVE') {
      add('Record physical receipt', () => workflow.mobileReturnForm(row.id), true);
      if (row.latest_return_request_status === 'PENDING_ADMIN_APPROVAL') add('Reject return request', () => workflow.mobileReturnForm(row.id, true));
    } else if (row.status === 'RETURN_PENDING_INSPECTION') {
      add('Complete inspection', () => workflow.desk.completeReturnForm(row), true);
    } else if (row.status === 'PENDING_VERIFICATION') {
      const request = (model.verification || []).find(request => String(request.rental_id) === String(row.id) && request.status === 'PENDING' && String(request.transaction_type || request.type || '').toUpperCase() === 'RENTAL');
      if (request) add('Review verification', () => workflow.verificationDetails(request.id), true);
    }
    add('View details', () => transactionDetails(row));
    showModal('Rental actions', `<div class="rental-actions-dialog"><div class="transaction-detail-head"><div><span class="eyebrow">${e(txCode(row))}</span><h3>${e(row.item_name || 'Unknown equipment')}</h3><p>${e(row.customer_name || 'Unknown customer')}</p></div>${status(txStatus(row))}</div><div class="rental-action-choices">${choices.map((choice, index) => `<button type="button" class="${choice.primary ? 'primary' : 'secondary'}" data-rental-choice="${index}">${e(choice.label)} ${icon('arrow')}</button>`).join('')}</div></div>`);
    modal.querySelectorAll('[data-rental-choice]').forEach(button => button.onclick = () => choices[Number(button.dataset.rentalChoice)].run());
  }

  function transactions(mode) {
    const all = [...(model.transactions || [])], active = all.filter(row => row.status === "ACTIVE"), pendingRentals = all.filter(row => row.status === "PENDING_VERIFICATION"), pendingAdmin = all.filter(row => row.status === "PENDING_ADMIN_APPROVAL"), pickup = all.filter(row => row.status === "APPROVED"), inspections = all.filter(row => row.status === "RETURN_PENDING_INSPECTION");
    const returned = all.filter(txIsReturned).sort((a, b) => (txDate(b.confirmed_return_at || b.updated_at || b.created_at)?.getTime() || 0) - (txDate(a.confirmed_return_at || a.updated_at || a.created_at)?.getTime() || 0));
    const pendingReturns = txPending("RETURN"), now = new Date(), today = txDay(now), state = txState[mode];
    if (mode === "Rentals") {
      const dueToday = active.filter(row => txStatus(row) === 'Due today'), overdue = active.filter(row => { const due = txDate(row.due_at); return due && due < now; });
      let records = all.filter(row => ["ACTIVE", "APPROVED", "RETURN_PENDING_INSPECTION", "PENDING_VERIFICATION", "PENDING_ADMIN_APPROVAL"].includes(row.status));
      if (state.filter === "Due today") records = dueToday;
      if (state.filter === "Overdue") records = overdue;
      if (state.filter === "Awaiting confirmation") records = pendingRentals;
      if (state.filter === "Awaiting admin review") records = pendingAdmin;
      if (state.filter === "Awaiting delivery") records = pickup;
      if (state.filter === "Inspection pending") records = inspections;
      records = records.filter(txSearch).sort((a, b) => { const rank = row => row.status === "PENDING_ADMIN_APPROVAL" ? -2 : row.status === "PENDING_VERIFICATION" ? -1 : txStatus(row) === "Overdue" ? 0 : txStatus(row) === "Due today" ? 1 : 2; return rank(a) - rank(b) || (txDate(a.due_at)?.getTime() || 0) - (txDate(b.due_at)?.getTime() || 0); });
      const view = paged(records, mode), action = `<button type="button" class="primary" id="rental-request-add">+ Create counter rental</button><button type="button" class="secondary" data-find-booking>Scan rental QR</button>`;
      const message = overdue.length ? `${overdue.length} overdue rental${overdue.length === 1 ? " needs" : "s need"} follow-up today.` : pendingAdmin.length ? `${pendingAdmin.length} mobile request${pendingAdmin.length === 1 ? " is" : "s are"} waiting for admin review.` : pendingRentals.length ? `${pendingRentals.length} rental request${pendingRentals.length === 1 ? "" : "s"} in the saved terminal queue (hardware on standby).` : pickup.length ? `${pickup.length} approved rental${pickup.length === 1 ? " is" : "s are"} waiting for delivery or handoff.` : inspections.length ? `${inspections.length} received unit${inspections.length === 1 ? " needs" : "s need"} inspection.` : dueToday.length ? `${dueToday.length} rental${dueToday.length === 1 ? "" : "s"} due today.` : "No urgent rental follow-ups. Your open rentals are on track.";
      const filters = `<div class="transaction-filters" role="group" aria-label="Filter rentals">${txFilter(mode, "All open", active.length + pendingRentals.length + pendingAdmin.length + pickup.length + inspections.length)}${txFilter(mode, "Due today", dueToday.length)}${txFilter(mode, "Overdue", overdue.length)}${txFilter(mode, "Awaiting admin review", pendingAdmin.length)}${txFilter(mode, "Awaiting delivery", pickup.length)}${txFilter(mode, "Inspection pending", inspections.length)}${pendingRentals.length ? txFilter(mode, "Awaiting confirmation", pendingRentals.length) : ""}</div>`;
      return `<div class="module-stats transaction-stats">${txMetric("Currently out", active.length, "Confirmed rentals with customers", "box")}${txMetric("Due today", dueToday.length, "Plan return follow-ups", "clock", "amber")}${txMetric("Overdue", overdue.length, "Needs attention", "bell", "red")}${txMetric("Awaiting admin review", pendingAdmin.length, "Customer rental requests awaiting review", "box", "purple")}</div><section class="panel transaction-focus ${overdue.length ? "attention" : ""}"><span class="transaction-focus-mark">${overdue.length ? "!" : "✦"}</span><div><strong>${overdue.length ? "Follow up on late rentals" : pendingAdmin.length ? "Mobile rental review needed" : pendingRentals.length ? "Counter confirmation needed" : "Rental desk status"}</strong><p>${e(message)}</p></div><button type="button" class="text-button" data-page="Returns">Open returns →</button></section><section class="panel admin-module transaction-table-panel rentals-table-panel"><div class="transaction-list-toolbar"><label class="module-search">${icon("search")}<input id="module-search" value="${e(search)}" placeholder="Search item, customer, or rental ID" aria-label="Search rentals"/></label><div class="transaction-heading-actions">${action}</div></div><div class="transaction-filter-toolbar">${filters}</div><div class="transaction-table-caption"><span><strong>${records.length}</strong> rental record${records.length === 1 ? "" : "s"} in this view</span><span>Sorted by what needs attention first</span></div>${records.length ? table(["ACTIONS", "EQUIPMENT / RENTAL ID", "CUSTOMER", "DUE DATE", "STATUS", "CHARGES", ""], view.rows.map(row => `<tr ${recordAttrs('transaction', row.id, txCode(row))}><td><button type="button" class="secondary rental-actions-toggle" data-rental-actions="${e(row.id)}" aria-label="Actions for ${e(txCode(row))}" aria-haspopup="dialog">Actions ${icon("chevron")}</button></td><td><strong>${e(row.item_name || "Unknown equipment")}</strong><small>${e(txCode(row))} · ${e(row.item_code || "No item code")}</small></td><td><strong>${e(row.customer_name || "Unknown customer")}</strong></td><td>${txDueCell(row)}</td><td>${status(txStatus(row))}</td><td>${chargeCell(row, h)}</td><td><button type="button" class="transaction-row-action" data-transaction-detail="${e(row.id)}">Details ${icon("arrow")}</button></td></tr>`).join("")) : empty("No rentals in this view", state.filter === "All open" ? search.trim() ? "Try another search term or clear the search to see open rentals." : "Select Create counter rental, or submit a request from the mobile app." : "Try another filter or search term.")}${records.length ? view.footer : ""}</section>`;
    }
    if (mode === "Returns") {
      const mobileReturns = all.filter(row => ['ACTIVE','RETURN_PENDING_INSPECTION'].includes(row.status));
      const mobileQueue = mobileReturns.map(row => `<article class="return-queue-item"><span class="return-queue-icon">${icon('box')}</span><div><strong>${e(row.item_name)}</strong><small>${e(row.customer_name)} · ${e(txCode(row))}</small><small>${row.latest_return_request_status === 'PENDING_ADMIN_APPROVAL' ? 'Customer requested return' : row.status === 'RETURN_PENDING_INSPECTION' ? 'Received · inspection pending' : 'Equipment currently out'}</small></div><button type="button" class="primary" data-transaction-detail="${e(row.id)}">Receive return</button></article>`).join('');
      const returnedToday = returned.filter(row => txDay(row.confirmed_return_at || row.updated_at || row.created_at) === today), month = today.slice(0, 7);
      const returnedThisMonth = returned.filter(row => txDay(row.confirmed_return_at || row.updated_at || row.created_at).slice(0, 7) === month), lateReturns = returned.filter(txIsLate);
      let records = returned;
      if (state.filter === "Returned today") records = returnedToday;
      if (state.filter === "Late returns") records = lateReturns;
      if (state.filter === "This month") records = returnedThisMonth;
      records = records.filter(txSearch);
      const view = paged(records, mode), action = `<button type="button" class="primary" id="return-request-add">+ Scan returned equipment</button>`;
      const queueMarkup = pendingReturns.length ? pendingReturns.slice(0, 4).map(request => { const row = all.find(item => String(item.id) === String(request.rental_id)); return `<article class="return-queue-item" ${recordAttrs('verification', request.id, request.rental_code || request.rental_id)}><span class="return-queue-icon">${icon("box")}</span><div><strong>${e(row?.item_name || "Return request")}</strong><small>${e(row?.customer_name || "Customer details in queue")} · ${e(txCode(row || { id: request.rental_id }))}</small><small>Requested ${e(formatDate(request.requested_at))}</small></div>${status("Pending")}</article>`; }).join("") : `<div class="return-queue-clear"><span>✓</span><div><strong>No legacy terminal requests waiting</strong><small>Record returns from the active rental or scan the inventory QR.</small></div></div>`;
      const filters = `<div class="transaction-filters" role="group" aria-label="Filter returns">${txFilter(mode, "All returns", returned.length)}${txFilter(mode, "Returned today", returnedToday.length)}${txFilter(mode, "Late returns", lateReturns.length)}${txFilter(mode, "This month", returnedThisMonth.length)}</div>`;
      return `<div class="module-stats transaction-stats">${txMetric("Returned today", returnedToday.length, "Completed handoffs today", "box", "green")}${txMetric("Returned this month", returnedThisMonth.length, "Completed return records", "chart")}${txMetric("Late returns", lateReturns.length, "Returned after the due time", "clock", "amber")}${txMetric("Inspection pending", all.filter(row => row.status === "RETURN_PENDING_INSPECTION").length, "Received units awaiting inspection", "box", "purple")}</div><section class="panel return-queue-panel"><div class="panel-title"><div><h3>Return desk</h3><p>Record physical receipt, inspect the unit, and confirm its return.</p></div><div class="transaction-heading-actions">${action}</div></div><div class="return-queue-list">${mobileQueue}${queueMarkup}</div></section><section class="panel admin-module transaction-table-panel returns-table-panel"><div class="panel-title"><div><h3>Completed returns</h3><p>Check the actual return time against the original due time.</p></div></div><div class="transaction-filter-toolbar">${filters}<label class="module-search">${icon("search")}<input id="module-search" value="${e(search)}" placeholder="Search item, customer, or rental ID" aria-label="Search returned rentals"/></label></div><div class="transaction-table-caption"><span><strong>${records.length}</strong> return record${records.length === 1 ? "" : "s"} in this view</span><span>Late returns are highlighted for review</span></div>${records.length ? table(["EQUIPMENT / RENTAL ID", "CUSTOMER", "DUE DATE", "RETURNED AT", "RETURN STATUS", "CHARGES", ""], view.rows.map(row => `<tr ${recordAttrs('transaction', row.id, txCode(row))}><td><strong>${e(row.item_name || "Unknown equipment")}</strong><small>${e(txCode(row))} · ${e(row.item_code || "No item code")}</small></td><td><strong>${e(row.customer_name || "Unknown customer")}</strong></td><td>${e(formatDate(row.due_at))}</td><td><strong>${e(formatDate(actualReturnTime(row)))}</strong><small>${row.confirmed_return_at ? txIsLate(row) ? "After due time" : "On time" : "Return time not recorded"}</small></td><td>${status(txIsLate(row) ? "Late return" : "Returned")}</td><td>${chargeCell(row, h)}</td><td><button type="button" class="transaction-row-action" data-transaction-detail="${e(row.id)}">Details ${icon("arrow")}</button></td></tr>`).join("")) : empty("No completed returns found", state.filter === "All returns" ? "Completed returns appear here after staff records receipt and completes inspection." : "Try another return filter or search term.")}${records.length ? view.footer : ""}</section>`;
    }
    const historyState = txState["Transaction History"];
    let records = all.filter(row => txHistoryMatches(row, historyState)).sort((a, b) => (txDate(b.confirmed_rental_at || b.created_at)?.getTime() || 0) - (txDate(a.confirmed_rental_at || a.created_at)?.getTime() || 0));
    const confirmed = all.filter(row => ["ACTIVE", "RETURN_PENDING_INSPECTION", "COMPLETED"].includes(row.status) && row.confirmed_rental_at), completed = all.filter(txIsReturned);
    const rentalFees = confirmed.reduce((sum, row) => sum + Number(row.rental_fee || 0), 0), popular = new Map();
    for (const row of confirmed) { const name = row.item_name || "Unknown equipment"; popular.set(name, (popular.get(name) || 0) + 1); }
    const mostRented = [...popular.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), peak = Math.max(1, ...mostRented.map(([, count]) => count));
    const popularMarkup = mostRented.length ? mostRented.map(([name, count]) => `<div class="popular-item" ${recordAttrs('equipment', model.items.filter(item => item.name === name).length === 1 ? model.items.find(item => item.name === name).id : null, name)}><div><strong>${e(name)}</strong><span>${count} rental${count === 1 ? "" : "s"}</span></div><i><span style="width:${count / peak * 100}%"></span></i></div>`).join("") : `<p class="history-insight-empty">Item popularity will appear as transactions are recorded.</p>`;
    const view = paged(records, mode), action = `<button type="button" class="secondary" id="transaction-export" ${records.length ? '' : 'disabled'}>${icon("download")} Export filtered CSV</button>`;
    const statuses = ["All statuses", "Active", "Pending admin review", "Awaiting delivery", "Inspection pending", "Pending verification", "Returned", "Rejected", "Expired", "Cancelled"], periods = ["All time", "Last 30 days", "This month", "This year"];
    const statusSelect = `<label class="transaction-select"><span>Status</span><select id="transaction-status-filter" aria-label="Filter by status">${statuses.map(option => `<option ${historyState.status === option ? "selected" : ""}>${e(option)}</option>`).join("")}</select></label>`;
    const periodSelect = `<label class="transaction-select"><span>Date range</span><select id="transaction-period-filter" aria-label="Filter by date">${periods.map(option => `<option ${historyState.period === option ? "selected" : ""}>${e(option)}</option>`).join("")}</select></label>`;
    return `<div class="module-stats transaction-stats">${txMetric("Total transactions", all.length, "All rental records", "chart")}${txMetric("Active now", active.length, "Equipment currently out", "box")}${txMetric("Returned", completed.length, "Completed return records", "clock", "green")}${txMetric("Recorded rental fees", money(rentalFees), `From ${confirmed.length} confirmed rentals`, "money", "purple")}</div><div class="history-insights"><section class="panel history-insight-card"><div class="panel-title"><div><h3>Most rented equipment</h3><p>Based on confirmed rentals</p></div></div><div class="popular-items">${popularMarkup}</div></section><section class="panel history-insight-card history-workflow-card"><span class="eyebrow">QUICK VIEW</span><h3>Stay ahead of the next return</h3><p>${active.length ? `${active.length} active rental${active.length === 1 ? "" : "s"} currently out` : "No active rentals right now"}${pendingRentals.length ? ` · ${pendingRentals.length} waiting for confirmation` : ""}.</p><button type="button" class="text-button" data-page="Rentals">Review active rentals →</button></section></div><section class="panel admin-module transaction-table-panel history-table-panel"><div class="transaction-list-toolbar"><label class="module-search">${icon("search")}<input id="module-search" value="${e(search)}" placeholder="Search item, customer, or rental ID" aria-label="Search transaction history"/></label><div class="transaction-heading-actions">${action}</div></div><div class="transaction-filter-toolbar history-filter-toolbar"><div class="transaction-selects">${statusSelect}${periodSelect}</div></div><div class="transaction-table-caption"><span><strong>${records.length}</strong> transaction${records.length === 1 ? "" : "s"} match your filters</span><span>Saved rental charges exclude refundable deposits</span></div>${records.length ? table(["RENTAL ID", "EQUIPMENT", "CUSTOMER", "RENTED", "DUE / RETURNED", "STATUS", "CHARGES", ""], view.rows.map(row => `<tr ${recordAttrs('transaction', row.id, txCode(row))}><td><strong>${e(txCode(row))}</strong><small>${e(row.id)}</small></td><td><strong>${e(row.item_name || "Unknown equipment")}</strong><small>${e(row.item_code || "No item code")}</small></td><td>${e(row.customer_name || "Unknown customer")}</td><td>${e(formatDate(row.confirmed_rental_at || row.created_at))}</td><td><strong>${e(formatDate(row.confirmed_return_at || row.due_at))}</strong><small>${row.confirmed_return_at ? "Returned" : "Due date"}</small></td><td>${status(txStatus(row))}</td><td>${chargeCell(row, h)}</td><td><button type="button" class="transaction-row-action" data-transaction-detail="${e(row.id)}">Details ${icon("arrow")}</button></td></tr>`).join("")) : empty("No matching transactions", "Adjust the status, date range, or search term to see more history.")}${records.length ? view.footer : ""}</section>`;
  }

  function rates() {
    const allRates = activeRates(), current = allRates.filter(r => includes(r, ['item_name', 'item_code', 'rate_type'])), view = paged(current, 'Rates & Fees');
    const pricing = model.pricing || { products: [], rules: {} }, products = pricing.products || [], rules = pricing.rules || {};
    return `<div class="module-stats rates-overview"><article><span>Pricing products</span><strong>${products.length}</strong><small>Available for rental quotes</small></article><article><span>Service hours</span><strong class="rates-hours">${e(rules.opens_at || '08:00')}–${e(rules.closes_at || '20:00')}</strong><small>Daily operating window</small></article><article><span>Equipment rates</span><strong>${allRates.length}</strong><small>Active per-item rates</small></article></div><section class="panel admin-module"><div class="panel-title rates-panel-title"><div><h3>Equipment rates</h3><p>Per-item rates and their pricing history.</p></div><div class="pricing-actions"><button class="secondary" id="rate-preview">Preview quote</button><button class="primary" id="rate-catalog-edit">Pricing settings</button><button class="secondary" id="rate-add">Update equipment rate</button></div></div><div class="module-toolbar"><label class="module-search">${icon('search')}<input id="module-search" value="${e(search)}" placeholder="Search equipment rates" aria-label="Search equipment rates"/></label><span>${current.length} active rate${current.length === 1 ? '' : 's'}</span></div>${current.length ? table(['EQUIPMENT', 'BASIS', 'RENTAL RATE', 'DEPOSIT', 'LATE PENALTY', 'EFFECTIVE'], view.rows.map(r => `<tr ${recordAttrs('rate', r.id, r.item_name || 'equipment rate')}><td><strong>${e(r.item_name)}</strong><small>${e(r.item_code)}</small></td><td>${e(r.rate_type)}</td><td><strong>${money(r.rental_rate)}</strong></td><td>${money(r.deposit_amount)}</td><td>${money(r.late_penalty_rate)}</td><td>${e(formatDate(r.effective_from))}</td></tr>`).join('')) : empty('No individual equipment rates', 'Add equipment in Inventory and set a per-item rate when needed. Use Pricing settings to manage quote prices and rental rules.')}${current.length ? view.footer : ''}</section>`;
  }

  function rateSheetForm() {
    const pricing = model.pricing;
    const field = (name, label, value, type = 'number', extra = '') => `<label>${e(label)}<input name="${e(name)}" type="${type}" value="${e(value)}" ${type === 'number' ? 'min="0" max="9999999999.99" step="0.01" required' : ''} ${extra}/></label>`;
    const products = pricing.products.map(p => `<details class="pricing-edit-product"><summary>${e(p.name)}${p.high_value ? ' · high-value' : ''}</summary><div class="pricing-edit-grid">${p.rate_options.map(rate => field(`rate:${p.id}:${rate.id}`, rate.label + ' price (₱)', rate.amount)).join('')}${p.sale_price !== null ? field(`sale:${p.id}`, 'Brand-new sale price (₱)', p.sale_price) : ''}${field(`deposit:${p.id}`, 'Refundable deposit (₱)', p.deposit_amount)}${field(`overtime:${p.id}`, 'Overtime per started hour (₱)', p.overtime_rate_per_hour)}</div><label>Included items<textarea name="includes:${e(p.id)}" rows="2" maxlength="1000">${e((p.included_items || []).join(', '))}</textarea></label>${p.high_value ? '<small>Bike and tech rentals require a deposit. Set the amount here before confirming rentals.</small>' : ''}</details>`).join('');
    showModal('Pricing settings', `<form id="pricing-form" class="admin-form pricing-form"><h3>Service and rental rules</h3><div class="form-grid">${field('opensAt', 'Opens daily', pricing.rules.opens_at, 'time', 'required')}${field('closesAt', 'Closes daily', pricing.rules.closes_at, 'time', 'required')}${field('lostPieceFee', 'Lost board-game piece fee (₱)', pricing.rules.lost_piece_fee)}${field('orderPhone', 'Call / Text / Viber number', pricing.rules.order_phone, 'tel', 'maxlength="40" required')}</div><label>Other order method<textarea name="orderMethodNote" rows="2" maxlength="500">${e(pricing.rules.order_method_note)}</textarea></label><label class="pricing-check"><input name="validIdRequired" type="checkbox" ${pricing.rules.valid_id_required ? 'checked' : ''}/> Valid ID required for every rental</label><label class="pricing-check"><input name="highValueDepositRequired" type="checkbox" ${pricing.rules.high_value_deposit_required ? 'checked' : ''}/> Require deposit for bikes and tech</label><label>Overtime rule<textarea name="overtimeBasis" rows="2" maxlength="500">${e(pricing.rules.overtime_basis)}</textarea></label><label>Returns after closing<textarea name="afterHoursReturns" rows="2" maxlength="500">${e(pricing.rules.after_hours_returns)}</textarea></label><label>Whole-stay rule<textarea name="wholeStayBasis" rows="2" maxlength="500">${e(pricing.rules.whole_stay_basis)}</textarea></label><label>Bike safety reminder<textarea name="bikeSafety" rows="2" maxlength="500">${e(pricing.rules.bike_safety)}</textarea></label><label>Care and damage reminder<textarea name="careAndLoss" rows="2" maxlength="500">${e(pricing.rules.care_and_loss)}</textarea></label><label>Return reminder<textarea name="returnReminder" rows="2" maxlength="500">${e(pricing.rules.return_reminder)}</textarea></label><h3>Products, packages, and deposits</h3><p>Started rental blocks round up. Overtime defaults to the hourly-equivalent rate and can be changed per product. The text fields update displayed guidance; change each product’s overtime amount to change the charge.</p>${products}<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save pricing settings</button></div></form>`);
    modal.querySelector('[data-close]').onclick = () => modal.close();
    const form = modal.querySelector('#pricing-form');
    confirmSubmit(form, { title: 'Save pricing settings?', description: 'Product rates, deposits, overtime amounts, and rental rules will apply to new rental quotes.', confirmLabel: 'Yes, save pricing' }, async () => {
      const button = form.querySelector('[type="submit"]'), error = form.querySelector('.form-error'), values = new FormData(form), next = JSON.parse(JSON.stringify(pricing));
      button.disabled = true; error.textContent = '';
      next.rules = { ...next.rules, opens_at: values.get('opensAt'), closes_at: values.get('closesAt'), valid_id_required: values.has('validIdRequired'), high_value_deposit_required: values.has('highValueDepositRequired'), lost_piece_fee: Number(values.get('lostPieceFee')), order_phone: values.get('orderPhone'), order_method_note: values.get('orderMethodNote'), overtime_basis: values.get('overtimeBasis'), after_hours_returns: values.get('afterHoursReturns'), whole_stay_basis: values.get('wholeStayBasis'), bike_safety: values.get('bikeSafety'), care_and_loss: values.get('careAndLoss'), return_reminder: values.get('returnReminder') };
      for (const p of next.products) { p.deposit_amount = Number(values.get(`deposit:${p.id}`)); p.overtime_rate_per_hour = Number(values.get(`overtime:${p.id}`)); p.included_items = String(values.get(`includes:${p.id}`) || '').split(',').map(v => v.trim()).filter(Boolean); if (p.sale_price !== null) p.sale_price = Number(values.get(`sale:${p.id}`)); for (const rate of p.rate_options) rate.amount = Number(values.get(`rate:${p.id}:${rate.id}`)); }
      try { const result = await api('/pricing', { method: 'PUT', body: JSON.stringify(next) }); model.pricing = result.pricing; modal.close(); toast('Pricing settings saved.'); redraw(); }
      catch (problem) { error.textContent = problem.message; button.disabled = false; }
    });
  }

  function quoteForm() {
    const products = model.pricing?.products || [], first = products[0];
    if (!first) { showModal('Pricing setup needed', '<p>No pricing products are available. Refresh the workspace or configure your rental prices first.</p>'); return; }
    showModal('Preview a rental quote', `<form id="quote-form" class="admin-form"><label>Physical equipment (optional)<select name="itemId"><option value="">Quote by pricing product</option>${model.items.filter(i => i.is_active !== false).map(i => `<option value="${e(i.id)}">${e(i.name)} · ${e(i.item_code)}${i.pricing_product_id ? '' : ' · not linked'}</option>`).join('')}</select><small>Choosing equipment checks that it is available and linked to a pricing product.</small></label><label>Rental product<select name="productId">${products.map(p => `<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}</select></label><label>Rental starts (Philippine time)<input name="startAt" type="datetime-local" value="${e(manilaDateTimeInput())}" required/></label><label>Pricing option<select name="mode"><option value="TIMED">Timed rental</option><option value="WHOLE_STAY" disabled>Whole stay until resort checkout</option></select></label><label id="quote-duration-wrap">Requested duration (minutes)<input name="durationMinutes" type="number" min="1" max="10080" value="60" required/><small>Each started rate block is charged in full. Packages are applied when they lower the price.</small></label><label id="quote-checkout-wrap" hidden>Guest resort checkout (Philippine time)<input name="resortCheckoutAt" type="datetime-local" value="${e(manilaDateTimeInput(new Date(Date.now() + 86400000)))}"/></label><label>Actual return time (optional, Philippine time)<input name="actualReturnAt" type="datetime-local"/><small>Enter this to preview overtime after the due time.</small></label><div id="quote-result" class="quote-result" hidden></div><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Close</button><button class="primary" type="submit">Calculate quote</button></div></form>`);
    modal.querySelector('[data-close]').onclick = () => modal.close();
    const form = modal.querySelector('#quote-form'), productSelect = form.elements.productId, itemSelect = form.elements.itemId, modeSelect = form.elements.mode, durationWrap = form.querySelector('#quote-duration-wrap'), checkoutWrap = form.querySelector('#quote-checkout-wrap'), result = modal.querySelector('#quote-result');
    const sync = () => { result.hidden = true; const selected = products.find(p => p.id === productSelect.value) || first, hasWholeStay = selected.rate_options.some(rate => rate.kind === 'WHOLE_STAY'), wholeOption = modeSelect.querySelector('[value="WHOLE_STAY"]'); wholeOption.disabled = !hasWholeStay; if (!hasWholeStay && modeSelect.value === 'WHOLE_STAY') modeSelect.value = 'TIMED'; const whole = modeSelect.value === 'WHOLE_STAY'; durationWrap.hidden = whole; checkoutWrap.hidden = !whole; form.elements.durationMinutes.required = !whole; form.elements.resortCheckoutAt.required = whole; };
    itemSelect.onchange = () => { const item = model.items.find(row => row.id === itemSelect.value); if (item?.pricing_product_id) productSelect.value = item.pricing_product_id; productSelect.disabled = Boolean(item?.pricing_product_id); sync(); }; productSelect.onchange = sync; modeSelect.onchange = sync; form.oninput = () => { result.hidden = true; }; sync();
    form.onsubmit = async event => {
      event.preventDefault(); const button = form.querySelector('[type="submit"]'), error = form.querySelector('.form-error'), dateIso = name => manilaDateTimeIso(form.elements[name].value);
      button.disabled = true; error.textContent = ''; result.hidden = true;
      try {
        const payload = { productId: productSelect.value, itemId: itemSelect.value || undefined, mode: modeSelect.value, startAt: dateIso('startAt'), actualReturnAt: dateIso('actualReturnAt') };
        if (modeSelect.value === 'WHOLE_STAY') payload.resortCheckoutAt = dateIso('resortCheckoutAt'); else payload.durationMinutes = Number(form.elements.durationMinutes.value);
        const response = await api('/pricing/quote', { method: 'POST', body: JSON.stringify(payload) }), q = response.quote; result.innerHTML = `<h3>${e(q.product_name)} · ${e(q.rate_label)}</h3><dl><dt>Rental fee</dt><dd>${money(q.rental_fee)}</dd><dt>Overtime</dt><dd>${money(q.overtime_fee)}${q.overtime_blocks ? ` · ${q.overtime_blocks} started hour(s)` : ''}</dd><dt>Rental charges</dt><dd>${money(q.rental_charge_total)}</dd><dt>Refundable deposit</dt><dd>${money(q.deposit_amount)}${q.deposit_required ? ' · required' : ''}</dd><dt>Collect now</dt><dd><strong>${money(q.total_to_collect)}</strong></dd><dt>Due time</dt><dd>${e(formatDate(q.due_at))}</dd><dt>ID</dt><dd>${q.valid_id_required ? 'Valid ID required' : 'ID not required'}</dd></dl>${q.warnings.map(w => `<p class="quote-warning">${e(w)}</p>`).join('')}<p>${e(q.reminders.bike_safety || '')}</p><p>${e(q.reminders.care_and_loss)} ${e(q.reminders.return)}</p><p>${e(q.after_hours_return_note)}</p>`; result.hidden = false; }
      catch (problem) { error.textContent = problem.message; }
      finally { button.disabled = false; }
    };
  }

  function rateForm() {
    const items = model.items.filter(i => i.is_active !== false).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) { showModal('Add equipment first', '<p>Add active equipment to your collection before setting an individual rental rate.</p>'); return; }
    showModal('Update equipment rate', `<form id="rate-form" class="admin-form"><label>Equipment<select name="itemId" required><option value="">Select equipment</option>${items.map(i => `<option value="${e(i.id)}">${e(i.name)} · ${e(i.item_code)}</option>`).join('')}</select></label><div class="form-grid"><label>Rate basis<select name="rateType"><option>DAILY</option><option>HOURLY</option><option>FLAT</option></select></label><label>Rental rate<input name="rentalRate" type="number" min="0" step="0.01" required/></label><label>Refundable deposit<input name="deposit" type="number" min="0" step="0.01" value="0"/></label><label>Late penalty<input name="latePenalty" type="number" min="0" step="0.01" value="0"/></label></div><div class="info-box">The previous active rate will be closed and kept in pricing history.</div><p class="form-error"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save new rate</button></div></form>`);
    modal.querySelector('[data-close]').onclick = () => modal.close();
    const form = modal.querySelector('form');
    form.elements.itemId.onchange = () => {
      const current = activeRates().find(rate => String(rate.item_id) === form.elements.itemId.value);
      form.elements.rateType.value = current?.rate_type || 'DAILY';
      for (const [field, key] of [['rentalRate', 'rental_rate'], ['deposit', 'deposit_amount'], ['latePenalty', 'late_penalty_rate']]) form.elements[field].value = current?.[key] ?? (field === 'rentalRate' ? '' : 0);
    };
    confirmSubmit(form, { title: 'Save this equipment rate?', description: 'The new rate will become active. The previous rate will be retained in pricing history.', confirmLabel: 'Yes, save new rate' }, async () => {
      try { await api('/rates', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); }
      catch (problem) { form.querySelector('.form-error').textContent = problem.message; return; }
      modal.close();
      try { await refresh(); toast('Rate updated.'); } catch { toast('Rate saved. Select Refresh to update the rate history.'); }
      redraw();
    });
  }

  function maintenance() {
    const open = model.maintenance.filter(r => r.status === 'IN_PROGRESS'), done = model.maintenance.filter(r => r.status === 'COMPLETED');
    const records = model.maintenance.filter(r => includes(r, ['item_name', 'item_code', 'reason', 'details', 'inspection_notes', 'status'])).sort((a, b) => Number(b.status === 'IN_PROGRESS') - Number(a.status === 'IN_PROGRESS') || (txDate(b.started_at)?.getTime() || 0) - (txDate(a.started_at)?.getTime() || 0));
    const view = paged(records, 'Maintenance');
    return `<div class="module-stats"><article><span>In progress</span><strong>${open.length}</strong></article><article><span>Completed</span><strong>${done.length}</strong></article><article><span>Total records</span><strong>${model.maintenance.length}</strong></article></div><section class="panel admin-module"><div class="panel-title"><div><h3>Service log</h3><p>Inspection and repair history.</p></div><button class="secondary" data-page="Inventory">Open equipment</button></div><div class="module-toolbar"><label class="module-search">${icon('search')}<input id="module-search" value="${e(search)}" placeholder="Search equipment or repair notes" aria-label="Search maintenance"/></label><span>${records.length} record${records.length === 1 ? '' : 's'}</span></div>${records.length ? table(['EQUIPMENT', 'REASON', 'STARTED', 'COMPLETED', 'STATUS'], view.rows.map(r => `<tr ${recordAttrs('maintenance', r.id, r.item_name || 'maintenance record')}><td><strong>${e(r.item_name)}</strong><small>${e(r.item_code)}${r.rental_id ? ` · <button class="text-button" data-transaction-detail="${e(r.rental_id)}">Rental ${e(r.rental_id)}</button>` : ""}</small></td><td>${e(r.reason || 'Equipment inspection')}<small>${e(r.inspection_notes ? 'Return inspection: ' + r.inspection_notes : r.details || 'No notes')}${r.inspection_notes && r.details ? `<br/>Repair notes: ${e(r.details)}` : ''}</small></td><td>${e(formatDate(r.started_at))}</td><td>${e(formatDate(r.completed_at))}</td><td>${status(r.status)}</td></tr>`).join('')) : empty(search.trim() ? 'No matching maintenance records' : 'No maintenance records', search.trim() ? 'Try another equipment name or repair note.' : 'Start maintenance from an equipment detail screen.')}${records.length ? view.footer : ''}</section>`;
  }

  function reports() {
    return renderAnalyticsReport(model, analyticsSelection, reportView, { escape: e, paged, table });
  }

  function settings(user, appearance) {
    return renderSettings({ model, user, appearance, tab: settingsTab, draft: businessDraft, dirty: businessDirty, saving: businessSaving, preferences: preferencesDraft || preferences, users: () => users(user.id) }, { escape: e, icon });
  }

  function users(currentUserId) {
    const staff = model.users.filter(u => ['ADMIN', 'OWNER'].includes(String(u.role || '').toUpperCase())), view = paged(staff, 'Staff accounts');
    return `<section class="panel settings-card settings-users"><div class="settings-title"><div><span class="eyebrow">STAFF ACCESS</span><h3>Staff accounts</h3></div><button class="secondary" id="user-add">Add account</button></div>${staff.length ? table(['STAFF MEMBER', 'ROLE', 'LAST LOGIN', 'STATUS', ''], view.rows.map(u => { const role = String(u.role || '').toUpperCase(), label = role === 'OWNER' ? 'Owner (super admin)' : 'Operator (admin)'; return `<tr ${recordAttrs('user', u.id, u.full_name || 'account')}><td><strong>${e(u.full_name)}</strong><small>${e(u.email)}</small></td><td>${label}</td><td>${e(formatDate(u.last_login_at))}</td><td>${status(u.is_active === false ? 'Inactive' : 'Active')}</td><td>${String(u.id) === String(currentUserId) ? '<span class="settings-current-user">Your account</span>' : role === 'ADMIN' ? `<button class="text-button" data-user-toggle="${e(u.id)}" data-account-type="operator">${u.is_active === false ? 'Activate' : 'Deactivate'}</button>` : '<span class="settings-current-user">Managed separately</span>'}</td></tr>`; }).join('')) : empty('No staff accounts', 'Add an operator account.')}${staff.length ? view.footer : ''}</section>`;
  }

  function userForm() {
    showModal('Add workspace account', `<form id="user-form" class="admin-form"><label>Full name<input name="fullName" required minlength="2" maxlength="150"/></label><label>Email<input name="email" type="email" required maxlength="191"/></label><label>Access role<select name="role"><option value="ADMIN">Operator (admin)</option><option value="OWNER">Owner (super admin)</option></select><small>Customer accounts are created separately from the customer directory.</small></label><label>Temporary password<input name="password" type="password" minlength="12" required/><small>Minimum 12 characters. The user can request a password reset after signing in.</small></label><p class="form-error"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Create account</button></div></form>`);
    modal.querySelector('[data-close]').onclick = () => modal.close();
    const form = modal.querySelector('form');
    confirmSubmit(form, { title: 'Create this workspace account?', description: 'This account will get the access role selected above.', confirmLabel: 'Yes, create account' }, async () => {
      try { await api('/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); }
      catch (problem) { form.querySelector('.form-error').textContent = problem.message; return; }
      modal.close();
      try { await refresh(); toast('Workspace account created.'); } catch { toast('Account created. Select Refresh to update the account list.'); }
      redraw();
    });
  }

  function render(page, user, appearance) {
    if (page !== searchPage) { if (searchPage) pageSearches[searchPage] = search; search = pageSearches[page] || ''; searchPage = page; }
    const retry = '<button type="button" class="secondary" id="module-retry">Try again</button>';
    if (!model) return loadError
      ? `<section class="panel module-load-error" role="alert">${icon('chip')}<h3>Couldn’t load this page</h3><p>${e(loadError)}</p>${retry}</section>`
      : `<section class="panel module-loading" role="status" aria-busy="true"><span class="session-spinner" aria-hidden="true"></span><p>Loading ${e(page.toLowerCase())}…</p></section>`;
    const content = page === 'ESP32 terminal' ? workflow.verificationPage(search, { paged, table, status, empty }) : page === 'Customers' ? customers() : ['Rentals', 'Returns', 'Transaction History'].includes(page) ? transactions(page) : page === 'Rates & Fees' ? rates() : page === 'Maintenance' ? maintenance() : page === 'Reports' ? reports() : page === 'Settings' ? settings(user, appearance) : '';
    const notice = modelVersion === cacheVersion ? '' : loadError
      ? `<div class="module-sync-notice connection-banner" role="alert"><span>${e(loadError)} Showing the last successfully loaded records.</span>${retry}</div>`
      : `<div class="module-sync-notice" role="status"><span class="session-spinner" aria-hidden="true"></span><span>Updating ${e(page.toLowerCase())}…</span></div>`;
    return notice + content;
  }

  function bind(page, user, rerender) {
    if (!['Customers', 'Rates & Fees', 'Rentals', 'Returns', 'Transaction History', 'Maintenance', 'Reports', 'Settings', 'ESP32 terminal'].includes(page)) return;
    redraw = rerender;
    document.querySelector('#module-retry')?.addEventListener('click', event => {
      event.currentTarget.disabled = true; event.currentTarget.textContent = 'Retrying…';
      load(true).then(rerender).catch(() => rerender());
    });
    if ((!model || modelVersion !== cacheVersion) && !loadError) load().then(rerender).catch(problem => { if (problem.status !== 401) rerender(); });
    if (!model) return;
    workflow.bind(page, rerender, pages);
    const searchBox = document.querySelector('#module-search'); if (searchBox) searchBox.oninput = event => { search = event.target.value; pages[page] = 0; if (page === 'ESP32 terminal') pages['Verification history'] = 0; rerender(); document.querySelector('#module-search')?.focus(); };
    document.querySelectorAll('[data-pager-prev]').forEach(button => button.onclick = () => { pages[button.dataset.pagerPrev] = Math.max(0, (pages[button.dataset.pagerPrev] || 0) - 1); rerender(); }); document.querySelectorAll('[data-pager-next]').forEach(button => button.onclick = () => { pages[button.dataset.pagerNext] = (pages[button.dataset.pagerNext] || 0) + 1; rerender(); });
    if (page === 'Customers') customerUI.bind(rerender, () => { search = ''; }, () => { pages.Customers = 0; });
    document.querySelector('#rate-add')?.addEventListener('click', rateForm);
    document.querySelector('#rate-catalog-edit')?.addEventListener('click', rateSheetForm);
    document.querySelector('#rate-preview')?.addEventListener('click', quoteForm);
    const switchSettingsTab = next => { settingsTab = next; rerender(); document.querySelector(`[data-settings-tab="${next}"]`)?.focus(); };
    document.querySelectorAll("[data-transaction-filter]").forEach(button => button.onclick = () => { txState[page].filter = button.dataset.transactionFilter; pages[page] = 0; rerender(); });
    document.querySelector("#transaction-status-filter")?.addEventListener("change", event => { txState["Transaction History"].status = event.target.value; pages["Transaction History"] = 0; rerender(); });
    document.querySelector("#transaction-period-filter")?.addEventListener("change", event => { txState["Transaction History"].period = event.target.value; pages["Transaction History"] = 0; rerender(); });
    document.querySelectorAll("[data-transaction-detail]").forEach(button => button.onclick = () => { const row = model.transactions.find(item => String(item.id) === button.dataset.transactionDetail); if (row) transactionDetails(row); });
    document.querySelectorAll('[data-rental-actions]').forEach(button => button.onclick = () => { const row = model.transactions.find(item => String(item.id) === button.dataset.rentalActions); if (row) rentalActions(row); });
    bindRecordLinks(document, {
      transaction: id => { const row = model.transactions.find(item => String(item.id) === String(id)); if (row) transactionDetails(row); },
      equipment: id => h.showEquipmentDetails(id),
      rate: recordDetails.rate, maintenance: recordDetails.maintenance, user: recordDetails.user, audit: recordDetails.audit
    });
    document.querySelector("#transaction-export")?.addEventListener("click", () => {
      const state = txState["Transaction History"], records = model.transactions.filter(row => txHistoryMatches(row, state));
      if (!records.length) { toast("There are no matching transactions to export."); return; }
      const headings = ["Rental ID", "Item", "Item code", "Customer", "Status", "Rental confirmed", "Due", "Returned", "Rental fee", "Refundable deposit", "Saved rate / package", "Billed minutes", "Overtime units", "Overtime rate", "Overtime fee", "Penalty", "Penalty reason", "Final rental charges", "Outcome reason"];
      const csv = "\uFEFF" + [headings, ...records.map(row => [txCode(row), row.item_name, row.item_code, row.customer_name, txStatus(row), row.confirmed_rental_at, row.due_at, actualReturnTime(row), row.rental_fee, row.deposit_amount, savedCharges(row).rate_label, savedCharges(row).billed_minutes, savedCharges(row).overtime_units, savedCharges(row).overtime_rate, savedCharges(row).overtime_fee, savedCharges(row).penalty_amount ?? "Penalty not recorded", savedCharges(row).penalty_reason, savedCharges(row).final_rental_charges ?? "Final charges not recorded", row.final_reason || row.latest_return_request_reason])].map(line => line.map(txCsvCell).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), link = document.createElement("a");
      link.href = url; link.download = "rent-and-play-transactions.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast("Filtered transaction history exported.");
    });
    document.querySelectorAll('[data-settings-tab]').forEach(button => {
      button.onclick = () => switchSettingsTab(button.dataset.settingsTab);
      button.onkeydown = event => {
        const tabs = settingsTabs(user.role === 'OWNER'), index = tabs.findIndex(row => row.id === button.dataset.settingsTab); let target;
        if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') target = 0; if (event.key === 'End') target = tabs.length - 1;
        if (target !== undefined) { event.preventDefault(); switchSettingsTab(tabs[target].id); }
      };
    });
    const businessForm = document.querySelector('#business-form');
    businessForm?.addEventListener('input', () => { businessDraft = Object.fromEntries(new FormData(businessForm)); businessDirty = true; businessForm.querySelector('.settings-draft-note').textContent = 'You have unsaved changes. Your draft is kept while switching tabs.'; businessForm.querySelector('#business-discard').disabled = false; });
    document.querySelector('#business-discard')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      try { if (await confirmAction({ title: 'Discard business changes?', description: 'Your unsaved business settings will be replaced by the last saved values.', confirmLabel: 'Yes, discard changes', cancelLabel: 'No, keep editing', danger: true }) && button.isConnected) { businessDraft = null; businessDirty = false; rerender(); toast('Unsaved business changes discarded.'); } }
      finally { button.disabled = false; }
    });
    if (businessForm) confirmSubmit(businessForm, { title: 'Save business settings?', description: 'The business name, location, and administrative defaults will be updated for the workspace.', confirmLabel: 'Yes, save settings' }, async () => {
      if (businessSaving) return;
      const values = Object.fromEntries(new FormData(businessForm)), button = businessForm.querySelector('[type="submit"]');
      businessSaving = true; businessDraft = values; businessForm.querySelector('fieldset').disabled = true; businessForm.querySelector('.form-error').textContent = ''; button.textContent = 'Saving…';
      try { const saved = await api('/settings', { method: 'PATCH', body: JSON.stringify(values) }); model.settings = saved.settings || saved; businessDraft = null; businessDirty = false; businessSaving = false; toast('Business settings saved.'); rerender(); }
      catch (problem) { businessSaving = false; if (businessForm.isConnected) { businessForm.querySelector('fieldset').disabled = false; button.textContent = 'Save business settings'; businessForm.querySelector('.form-error').textContent = problem.message; } else { rerender(); toast(problem.message); } }
    });
    const paymentForm = document.querySelector('#payment-settings-form');
    if (paymentForm) {
      const imageInput = paymentForm.elements.imageDataUrl, fileInput = paymentForm.querySelector('[data-payment-qr]'), preview = paymentForm.querySelector('[data-payment-qr-preview]'), removeButton = paymentForm.querySelector('[data-payment-qr-remove]'), error = paymentForm.querySelector('.form-error');
      const syncRemoveButton = () => { if (removeButton) removeButton.hidden = !imageInput.value.trim(); };
      syncRemoveButton();
      fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0]; if (!file) return;
        if (file.size > 250000) { fileInput.value = ''; error.textContent = 'The QR image must be 250 KB or smaller.'; return; }
        const reader = new FileReader();
        reader.onload = () => { imageInput.value = String(reader.result || ''); syncRemoveButton(); error.textContent = ''; const image = new Image(); image.className = 'rental-payment-qr-preview'; image.alt = 'New owner InstaPay QR'; image.src = imageInput.value; preview.replaceChildren(image); };
        reader.onerror = () => { error.textContent = 'Could not read this QR image. Choose another file.'; };
        reader.readAsDataURL(file);
      });
      removeButton?.addEventListener('click', () => { imageInput.value = ''; if (fileInput) fileInput.value = ''; syncRemoveButton(); preview.innerHTML = '<p class="settings-draft-note">No owner QR configured. Customers can choose cash until one is saved.</p>'; });
      confirmSubmit(paymentForm, { title: 'Save InstaPay payment details?', description: 'Customers will use this QR for transfers and see the account details in rental checkout.', confirmLabel: 'Save payment details' }, async () => {
        const button = paymentForm.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Saving…'; error.textContent = '';
        try { const result = await api('/settings/payment', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(paymentForm))) }); model.settings = { ...model.settings, ...(result.settings || {}) }; toast('Owner payment instructions saved.'); rerender(); }
        catch (problem) { if (paymentForm.isConnected) { error.textContent = problem.message; button.disabled = false; button.textContent = 'Save payment instructions'; } else { rerender(); toast(problem.message); } }
      });
    }
    const preferencesForm = document.querySelector('#preferences-form');
    const preferenceValues = () => ({ autoRefresh: preferencesForm.elements.autoRefresh.checked, reportPeriod: preferencesForm.elements.reportPeriod.value, reportGrouping: preferencesForm.elements.reportGrouping.value });
    preferencesForm?.addEventListener('input', () => { preferencesDraft = preferenceValues(); });
    document.querySelector('#preferences-reset')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      try { if (await confirmAction({ title: 'Restore default preferences?', description: 'The default values will replace your current draft. Select Save preferences afterward to apply them.', confirmLabel: 'Yes, restore defaults' }) && button.isConnected) { preferencesDraft = { ...preferenceDefaults }; rerender(); toast('Default values selected. Save preferences to apply.'); } }
      finally { button.disabled = false; }
    });
    if (preferencesForm) confirmSubmit(preferencesForm, { title: 'Save workspace preferences?', description: 'These refresh and report preferences will be saved on this browser.', confirmLabel: 'Yes, save preferences' }, async () => { try { preferences = writePreferences(localStorage, preferenceValues()); preferencesDraft = null; Object.assign(analyticsSelection, { period: preferences.reportPeriod, groupBy: preferences.reportGrouping }); for (const key of Object.keys(pages)) if (key.startsWith('analytics-')) pages[key] = 0; toast('Preferences saved on this browser.'); rerender(); } catch { preferencesForm.querySelector('.form-error').textContent = 'This browser cannot save preferences. Allow site storage, then try again.'; } });
    document.querySelector('#settings-password-reset')?.addEventListener('click', async event => {
      const button = event.currentTarget, message = document.querySelector('.settings-security-status');
      if (button.disabled) return;
      button.disabled = true;
      try {
        if (!await confirmAction({ title: 'Send password reset email?', description: `A password reset link will be sent to ${user.email}.`, confirmLabel: 'Yes, send reset email' }) || !button.isConnected) { button.disabled = false; return; }
        message.textContent = 'Requesting reset email…';
        await api('/auth/password-reset', { method: 'POST', body: JSON.stringify({ email: user.email }) }); message.textContent = 'Reset email requested. Check your inbox and spam folder.'; toast('Password reset email requested.');
      }
      catch (problem) { message.textContent = problem.message; button.disabled = false; }
    });
    document.querySelector('#user-add')?.addEventListener('click', userForm);
    document.querySelectorAll('[data-user-toggle]').forEach(button => button.onclick = async () => {
      if (button.disabled) return;
      const u = model.users.find(v => v.id === button.dataset.userToggle), activate = u.is_active === false, isCustomer = button.dataset.accountType === 'customer', accountType = isCustomer ? 'customer' : 'operator';
      button.disabled = true;
      try {
        const description = isCustomer
          ? `${u.full_name} (${u.email}) ${activate ? 'will be able to sign in to the mobile app and submit rental requests. Admin approval is still required before equipment is released.' : 'will lose mobile app sign-in and rental request access.'}`
          : `${u.full_name} (${u.email}) ${activate ? 'will be able to sign in to the workspace again.' : 'will lose access to the workspace.'}`;
        if (!await confirmAction({ title: `${activate ? 'Activate' : 'Deactivate'} this ${accountType}?`, description, confirmLabel: `${activate ? 'Yes, activate' : 'Yes, deactivate'} ${accountType}`, danger: !activate }) || !button.isConnected) return;
        await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ role: u.role, isActive: activate }) }); await refresh(); toast(`${isCustomer ? 'Customer' : 'Operator'} access updated.`); rerender();
      } catch (problem) { toast(problem.message); }
      finally { button.disabled = false; }
    });
    const updateAnalytics = () => { for (const key of Object.keys(pages)) if (key.startsWith('analytics-')) pages[key] = 0; rerender(); };
    const selectAnalyticsTab = section => { reportView.section = section; rerender(); document.querySelector(`[data-analytics-tab="${section}"]`)?.focus(); };
    const analyticsTabs = [...document.querySelectorAll('[data-analytics-tab]')];
    analyticsTabs.forEach(button => {
      button.onclick = () => selectAnalyticsTab(button.dataset.analyticsTab);
      button.onkeydown = event => {
        const index = analyticsTabs.indexOf(button); let target;
        if (event.key === 'ArrowRight') target = (index + 1) % analyticsTabs.length;
        if (event.key === 'ArrowLeft') target = (index + analyticsTabs.length - 1) % analyticsTabs.length;
        if (event.key === 'Home') target = 0; if (event.key === 'End') target = analyticsTabs.length - 1;
        if (target !== undefined) { event.preventDefault(); selectAnalyticsTab(analyticsTabs[target].dataset.analyticsTab); }
      };
    });
    document.querySelector('#analytics-period')?.addEventListener('change', event => { analyticsSelection.period = event.target.value; if (analyticsSelection.period === 'custom' && (!analyticsSelection.from || !analyticsSelection.to)) { const range = analyticsRange({ period: '30d' }); analyticsSelection.from = range.from; analyticsSelection.to = range.to; } updateAnalytics(); });
    for (const field of ['from', 'to']) document.querySelector('#analytics-' + field)?.addEventListener('change', event => { analyticsSelection[field] = event.target.value; updateAnalytics(); });
    document.querySelector('#analytics-group')?.addEventListener('change', event => { analyticsSelection.groupBy = event.target.value; updateAnalytics(); });
    document.querySelector('#analytics-category')?.addEventListener('change', event => { analyticsSelection.categoryId = event.target.value; analyticsSelection.itemId = ''; updateAnalytics(); });
    document.querySelector('#analytics-item')?.addEventListener('change', event => { analyticsSelection.itemId = event.target.value; updateAnalytics(); });
    document.querySelector('#analytics-sort')?.addEventListener('change', event => { reportView.sort = event.target.value; pages['analytics-equipment'] = 0; rerender(); });
    document.querySelectorAll('[data-analytics-detail]').forEach(detail => detail.addEventListener('toggle', () => { if (detail.isConnected) reportView.details[detail.dataset.analyticsDetail] = detail.open; }));
    document.querySelector('#report-export')?.addEventListener('click', () => {
      const result = calculateAnalytics(model, analyticsSelection); if (result.error) { toast(result.error); return; }
      const csv = analyticsCsv(result, model, analyticsSelection), url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
      link.href = url; link.download = 'rent-and-play-analytics-' + result.range.from + '-to-' + result.range.to + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Complete filtered analytics exported.');
    });
  }
  async function openTransaction(id) {
    await refresh();
    const row = model?.transactions?.find(row => String(row.id) === String(id));
    if (!row) throw new Error('This rental is unavailable. Refresh the rental records.');
    transactionDetails(row);
  }
  return { load, refresh, invalidate, render, bind, openTransaction, refreshPendingHandoff: workflow.refreshPendingHandoff, autoRefreshEnabled: () => preferences.autoRefresh, business: () => model?.settings || {}, reset: () => { invalidate(); model = null; modelVersion = -1; businessDraft = null; businessDirty = false; businessSaving = false; preferencesDraft = null; settingsTab = 'business'; pages = {}; search = ''; searchPage = ''; pageSearches = {}; customerUI.reset(); } };
}
