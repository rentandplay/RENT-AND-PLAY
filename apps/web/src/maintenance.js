import { recordCode } from './record-codes.js';
import { recordAttrs } from './record-links.js';
import { manilaDateKey } from './analytics.js';

const stages = { REPORTED: 'Reported', IN_REPAIR: 'In repair', AWAITING_INSPECTION: 'For inspection', COMPLETED: 'Completed', RETIRED: 'Retired' };
const priorities = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', URGENT: 'Urgent' };
export const maintenanceStage = row => ['COMPLETED', 'RETIRED'].includes(String(row.status).toUpperCase()) ? String(row.status).toUpperCase() : stages[row.workflow_stage] ? row.workflow_stage : String(row.status).toUpperCase() === 'OPEN' ? 'REPORTED' : 'IN_REPAIR';
export const maintenanceOpen = row => ['OPEN', 'IN_PROGRESS'].includes(String(row.status).toUpperCase());
export const maintenanceOverdue = (row, now = new Date()) => maintenanceOpen(row) && Boolean(row.target_date) && row.target_date < manilaDateKey(now);
export function maintenanceReportableUnits(model) {
  const blocked = new Set((model.maintenance || []).filter(maintenanceOpen).map(row => String(row.item_id)));
  const rented = new Set((model.transactions || []).filter(row => ['ACTIVE', 'APPROVED', 'RETURN_PENDING_INSPECTION', 'PENDING_VERIFICATION', 'PENDING_ADMIN_APPROVAL', 'PENDING_ESP32_RENT'].includes(String(row.status).toUpperCase())).map(row => String(row.item_id || row.itemId)));
  return (model.items || []).filter(row => row.is_active !== false && ['AVAILABLE', 'UNDER_MAINTENANCE'].includes(String(row.status).toUpperCase()) && !['RENTED', 'RESERVED_PENDING', 'UNDER_INSPECTION'].includes(String(row.effective_status).toUpperCase()) && !Number(row.open_rentals) && !Number(row.open_maintenance) && !row.reserved_rental_id && !row.current_rental_id && !blocked.has(String(row.id)) && !rented.has(String(row.id)));
}

export function createMaintenanceUI(h) {
  const { api, escape: e, money, formatDate, showModal: openDialog, modal, toast, confirmSubmit } = h;
  const showModal = (title, body) => { openDialog(title, body); modal.scrollTop = 0; };
  const getModel = h.model;
  let scope = 'open', stageFilter = '', priorityFilter = '', staff = [], staffLoaded = false, staffLoading = null, staffVersion = 0, requestVersion = 0;
  const stageBadge = row => `<span class="maintenance-stage ${maintenanceStage(row).toLowerCase().replaceAll('_', '-')}">${stages[maintenanceStage(row)]}</span>`;
  const cost = row => typeof row.repair_cost === 'number' ? money(row.repair_cost) : 'Not recorded';
  const selectOptions = (options, selected) => options.map(([value, label]) => `<option value="${e(value)}" ${String(value) === String(selected ?? '') ? 'selected' : ''}>${e(label)}</option>`).join('');
  const assignmentOptions = value => selectOptions([['', 'Unassigned'], ...staff.map(row => [row.id, `${row.full_name} · ${recordCode(row, 'account')}`])], value);
  const photoField = `<label class="maintenance-photo-field">Damage / repair photos<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple/><small>Up to 3 per update, 6 per ticket. Photos resize before saving.</small></label>`;
  const footer = (submit, back = 'Back') => `<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-maintenance-back>${e(back)}</button><button type="submit" class="primary">${e(submit)}</button></div>`;

  function render(search, { paged, table, empty }) {
    const model = getModel(), rows = model.maintenance || [], open = rows.filter(maintenanceOpen), query = search.trim().toLowerCase();
    const knownCosts = rows.filter(row => typeof row.repair_cost === 'number'), spend = knownCosts.reduce((sum, row) => sum + row.repair_cost, 0);
    const filtered = rows.filter(row => (scope === 'all' || scope === 'open' && maintenanceOpen(row) || scope === 'history' && !maintenanceOpen(row)) && (!stageFilter || maintenanceStage(row) === stageFilter) && (!priorityFilter || (row.priority || 'NORMAL') === priorityFilter) && [row.maintenance_code, row.item_name, row.item_code, row.reason, row.description, row.inspection_notes, row.details, row.assigned_name].join(' ').toLowerCase().includes(query)).sort((a, b) => Number(maintenanceOpen(b)) - Number(maintenanceOpen(a)) || Number(maintenanceOverdue(b)) - Number(maintenanceOverdue(a)) || ['URGENT', 'HIGH', 'NORMAL', 'LOW'].indexOf(a.priority || 'NORMAL') - ['URGENT', 'HIGH', 'NORMAL', 'LOW'].indexOf(b.priority || 'NORMAL') || String(b.started_at || '').localeCompare(String(a.started_at || '')));
    const view = paged(filtered, 'Maintenance');
    const pageNote = model.page_meta?.kind === 'maintenance' ? '<p class="maintenance-note">Overview counts and repair costs cover the loaded tickets on this page. Use the record filters and Next / Previous to review other tickets.</p>' : '';
    const entries = view.rows.map(row => `<tr ${recordAttrs('maintenance', row.id, recordCode(row, 'maintenance'))}><td><strong>${e(recordCode(row, 'maintenance'))}</strong><small>${e(row.item_name || 'Equipment')}</small><small>${e(row.item_code || 'Unit code not recorded')}</small></td><td><strong>${e(row.reason || 'Equipment inspection')}</strong><span class="maintenance-priority ${(row.priority || 'NORMAL').toLowerCase()}">${priorities[row.priority || 'NORMAL'] || 'Normal'} priority</span></td><td>${stageBadge(row)}<small>${e(maintenanceOpen(row) ? ({ REPORTED: 'Assign and assess the issue', IN_REPAIR: 'Record work, then inspect', AWAITING_INSPECTION: 'Complete the safety checks' }[maintenanceStage(row)]) : row.status === 'RETIRED' ? 'Unit removed from active stock' : 'Inspection completed')}</small></td><td><strong>${e(row.assigned_name || 'Unassigned')}</strong><small>${row.target_date ? `Target ${e(row.target_date)}` : 'Target date not set'}</small>${maintenanceOverdue(row) ? '<small class="maintenance-overdue">Past target date</small>' : ''}</td><td><strong>${e(cost(row))}</strong><small>Started ${e(formatDate(row.started_at))}</small></td><td><button type="button" class="secondary" data-maintenance-open="${e(row.id)}">${maintenanceOpen(row) ? 'Open ticket' : 'View history'}</button></td></tr>`).join('');
    return `<div class="maintenance-workspace">${pageNote}<div class="module-stats maintenance-metrics"><article><span>Units unavailable</span><strong>${new Set(open.map(row => row.item_id)).size}</strong><small>${open.length} open ticket${open.length === 1 ? '' : 's'}</small></article><article><span>For inspection</span><strong>${open.filter(row => maintenanceStage(row) === 'AWAITING_INSPECTION').length}</strong><small>Keep blocked until checks pass</small></article><article><span>Past target date</span><strong>${open.filter(row => maintenanceOverdue(row)).length}</strong><small>${open.filter(row => !row.target_date).length} open tickets have no target date</small></article><article><span>Recorded repair costs</span><strong>${e(money(spend))}</strong><small>${knownCosts.length} of ${rows.length} tickets have recorded costs</small></article></div><div class="maintenance-flow" aria-label="Maintenance workflow"><span><b>1</b> Report issue</span><i>→</i><span><b>2</b> Assess / repair</span><i>→</i><span><b>3</b> Inspect</span><i>→</i><span><b>4</b> Return to rental</span></div><section class="panel maintenance-tickets"><div class="panel-title"><div><h3>Unit maintenance</h3><p>One ticket for the exact physical unit. Other healthy stock remains available.</p></div><button type="button" class="primary" data-maintenance-report>+ Report issue</button></div><div class="maintenance-toolbar"><div class="maintenance-scopes" role="group" aria-label="Maintenance records">${[['open', 'Open tickets'], ['history', 'Closed history'], ['all', 'All records']].map(([value, label]) => `<button type="button" class="secondary ${scope === value ? 'selected' : ''}" data-maintenance-scope="${value}" aria-pressed="${scope === value}">${label}</button>`).join('')}</div><label class="module-search"><input id="module-search" aria-label="Search maintenance tickets" placeholder="Search ticket, unit, issue or staff" value="${e(search)}"/></label></div><div class="maintenance-filters"><label>Stage<select data-maintenance-filter="stage">${selectOptions([['', 'All stages'], ...Object.entries(stages)], stageFilter)}</select></label><label>Priority<select data-maintenance-filter="priority">${selectOptions([['', 'All priorities'], ...Object.entries(priorities)], priorityFilter)}</select></label><span>${filtered.length} matching ticket${filtered.length === 1 ? '' : 's'}</span></div>${filtered.length ? table(['TICKET / UNIT', 'ISSUE', 'STAGE', 'ASSIGNMENT / TARGET', 'COST / STARTED', ''], entries) + view.footer : empty(scope === 'open' && !open.length ? 'No open maintenance tickets' : 'No matching maintenance tickets', scope === 'open' && !open.length ? 'Report a damaged unit here, or review completed repairs in Closed history.' : 'Adjust your search, stage or priority filter.')}</section><p class="maintenance-note">Maintenance reduces available stock, not total active stock. Retirement removes only that unit from active stock and preserves its QR and history.</p></div>`;
  }
  function bind(root = document) {
    root.querySelector('[data-maintenance-report]')?.addEventListener('click', () => reportForm());
    root.querySelectorAll('[data-maintenance-open]').forEach(button => button.onclick = () => details(button.dataset.maintenanceOpen));
    root.querySelectorAll('[data-maintenance-scope]').forEach(button => button.onclick = () => { scope = button.dataset.maintenanceScope; h.onRecordScope?.({open:'OPEN',history:'CLOSED',all:'ALL'}[scope]); stageFilter = ''; h.resetPage?.(); h.redraw(); });
    root.querySelectorAll('[data-maintenance-filter]').forEach(select => select.onchange = () => { if (select.dataset.maintenanceFilter === 'stage') stageFilter = select.value; else priorityFilter = select.value; h.resetPage?.(); h.redraw(); });
  }
  async function loadStaff() {
    if (staffLoaded) return;
    if (!staffLoading) {
      const version = staffVersion;
      const request = api('/maintenance-staff').then(result => {
        if (version === staffVersion) { staff = result.staff || []; staffLoaded = true; }
      }).finally(() => { if (staffLoading === request) staffLoading = null; });
      staffLoading = request;
    }
    return staffLoading;
  }
  function showError(error) { showModal('Maintenance unavailable', `<p class="form-error" role="alert">${e(error.message)}</p><button type="button" class="secondary" data-maintenance-close>Close</button>`); modal.querySelector('[data-maintenance-close]').onclick = () => modal.close(); }
  async function save(form, path, payload, success, ticketId = null) {
    const error = form.querySelector('[role="alert"]'), button = form.querySelector('[type="submit"]');
    error.textContent = ''; button.disabled = true;
    try {
      const photos = await preparePhotos(form.elements.photos?.files);
      const result = await api(path, { method: ticketId ? 'PATCH' : 'POST', body: JSON.stringify({ ...payload, photos }) });
      toast(result.remaining_open_tickets ? 'Inspection saved. Other open tickets still keep this unit unavailable.' : success);
      try { await h.refresh(); await h.onMaintenanceSaved?.(); } catch { toast('Ticket saved. Refresh the page to update the stock summary.'); }
      h.redraw();
      if (modal.open && form.isConnected) await details(result.maintenance.id);
    } catch (failure) { if (modal.open && form.isConnected) error.textContent = failure.message; else toast(failure.message); }
    finally { if (form.isConnected) button.disabled = false; }
  }
  async function reportForm(unitId = '', snapshot = null) {
    const version = ++requestVersion;
    let units = snapshot ? [snapshot] : maintenanceReportableUnits(getModel() || {}), ready = false;
    const unitOptions = () => `${unitId ? '' : '<option value="">Select the exact unit</option>'}${selectOptions(units.map(unit => [unit.id, `${unit.name} · ${recordCode(unit, 'equipment')}`]), unitId)}`;
    showModal('Report equipment issue', `<form class="maintenance-form"><p class="info-box">Select the unit code printed on the damaged equipment. Only that unit will become unavailable; total stock stays the same.</p><p data-maintenance-loading role="status">Checking current unit availability and staff… You can enter the issue below.</p><button type="button" class="secondary" data-maintenance-retry hidden>Retry loading</button><label>Physical unit<select name="itemId" required disabled>${unitOptions()}</select></label><label>Issue summary<input name="reason" required maxlength="255" placeholder="Example: rear tyre punctured"/></label><label>Issue details<textarea name="notes" maxlength="2000" rows="3" placeholder="Describe the damage, symptoms or required service"></textarea></label><div class="maintenance-form-grid"><label>Unit condition<select name="condition">${selectOptions([['DAMAGED', 'Damaged'], ['NEEDS_INSPECTION', 'Needs inspection'], ['FAIR', 'Fair · preventive service'], ['GOOD', 'Good · preventive service']], 'DAMAGED')}</select></label><label>Priority<select name="priority">${selectOptions(Object.entries(priorities), 'NORMAL')}</select></label><label>Assigned staff<select name="assignedTo" disabled>${assignmentOptions('')}</select></label><label>Target completion date<input name="targetDate" type="date"/><small>Optional; leave blank if not scheduled.</small></label></div>${photoField}${footer('Report issue', 'Cancel')}</form>`);
    const form = modal.querySelector('form'), button = form.querySelector('[type="submit"]'), error = form.querySelector('[role="alert"]'), loading = form.querySelector('[data-maintenance-loading]'), retry = form.querySelector('[data-maintenance-retry]');
    const current = () => version === requestVersion && modal.open && form.isConnected;
    button.disabled = true;
    form.querySelector('[data-maintenance-back]').onclick = () => { requestVersion++; modal.close(); };
    confirmSubmit(form, { title: 'Report this unit for maintenance?', description: 'Only the selected physical unit will be blocked from rental. Other healthy units remain available.', confirmLabel: 'Yes, report issue' }, async () => {
      if (!ready || !current()) return;
      const values = Object.fromEntries(new FormData(form)), unit = units.find(row => String(row.id) === values.itemId);
      if (!unit) return void (error.textContent = 'Select the exact physical unit.');
      await save(form, '/maintenance', { ...values, photos: undefined, version: unit.updated_at }, 'Maintenance ticket created.');
    });
    const confirmedSubmit = form.onsubmit;
    form.onsubmit = event => {
      if (!ready || !current()) { event.preventDefault(); return; }
      return confirmedSubmit?.(event);
    };
    async function loadContext() {
      ready = false; button.disabled = true; loading.hidden = false; retry.hidden = true; error.textContent = '';
      try {
        const [context] = await Promise.all([
          unitId ? api(`/inventory/${encodeURIComponent(unitId)}`, { headers: { 'Cache-Control': 'no-cache' } }) : h.refresh().then(() => getModel()),
          loadStaff(),
        ]);
        if (!current()) return;
        let model = unitId ? { items: [context.item], maintenance: context.maintenance || [] } : context;
        // An old open ticket may be outside the unit detail's limited history.
        if (unitId && Number(context.item.open_maintenance) > 0 && !model.maintenance.some(row => maintenanceOpen(row))) {
          await h.refresh(); if (!current()) return; model = getModel();
        }
        const existing = unitId && (model.maintenance || []).find(row => String(row.item_id) === String(unitId) && maintenanceOpen(row));
        if (existing) return details(existing.id);
        units = maintenanceReportableUnits(model).sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.item_code).localeCompare(String(b.item_code)));
        if (unitId && !units.some(unit => String(unit.id) === String(unitId))) throw new Error('This unit is unavailable. Use Returns for rented equipment, or choose an available unit.');
        if (!units.length) throw new Error('No available units can be reported. Open existing tickets for maintenance units, or receive rented units through Returns.');
        form.elements.itemId.innerHTML = unitOptions(); form.elements.itemId.disabled = false;
        form.elements.assignedTo.innerHTML = assignmentOptions(''); form.elements.assignedTo.disabled = false;
        loading.hidden = true; button.disabled = false; ready = true;
      } catch (failure) {
        if (!current()) return;
        error.textContent = failure.message; loading.hidden = true; retry.hidden = false;
      }
    }
    retry.onclick = loadContext;
    await loadContext();
  }
  async function details(id) {
    const version = ++requestVersion;
    showModal('Loading maintenance ticket', '<p data-maintenance-ticket-loading role="status">Loading ticket details…</p>');
    const loading = modal.querySelector('[data-maintenance-ticket-loading]');
    const current = () => version === requestVersion && modal.open && loading?.isConnected;
    try {
      const { maintenance: row, item } = await api('/maintenance/' + encodeURIComponent(id), { headers: { 'Cache-Control': 'no-cache' } });
      if (!current()) return;
      const stage = maintenanceStage(row), open = maintenanceOpen(row), currentStep = ['REPORTED', 'IN_REPAIR', 'AWAITING_INSPECTION', 'COMPLETED'].indexOf(stage);
      const next = { REPORTED: 'Assess the issue and start repair or diagnosis.', IN_REPAIR: 'Record the work performed, then send the unit for inspection.', AWAITING_INSPECTION: 'Test function, safety and required parts before returning this unit to rental.', COMPLETED: 'The inspection is recorded. Current equipment availability may have changed since this repair.', RETIRED: 'This physical unit was removed from active stock. Its history and QR are preserved.' }[stage];
      const actions = open ? `${stage === 'REPORTED' ? '<button class="primary" data-maintenance-action="start-repair">Start assessment / repair</button>' : stage === 'IN_REPAIR' ? '<button class="primary" data-maintenance-action="send-inspection">Send for inspection</button>' : '<button class="primary" data-maintenance-action="complete">Complete inspection</button><button class="secondary" data-maintenance-action="inspection-failed">Return to repair</button>'}<button class="secondary" data-maintenance-action="update">Add update / edit ticket</button><button class="text-button maintenance-retire" data-maintenance-action="retire">Retire this unit</button>` : '<button class="secondary" data-maintenance-action="update">Record expense / add note</button>';
      const inspection = row.final_inspection;
      showModal('Maintenance ticket', `<div class="maintenance-detail"><header class="maintenance-detail-heading"><div><span class="eyebrow">${e(recordCode(row, 'maintenance'))}</span><h3>${e(row.item_name || item?.name || 'Equipment')}</h3><p>${e(row.item_code || item?.item_code || 'Unit code not recorded')} · ${e(row.reason || 'Equipment inspection')}</p></div>${stageBadge(row)}</header>${stage !== 'RETIRED' ? `<ol class="maintenance-progress" aria-label="Ticket progress">${[['REPORTED', 'Reported'], ['IN_REPAIR', 'Repair'], ['AWAITING_INSPECTION', 'Inspection'], ['COMPLETED', 'Completed']].map(([value, label], index) => `<li class="${index < currentStep ? 'done' : index === currentStep ? 'current' : ''}"><span>${index + 1}</span>${label}</li>`).join('')}</ol>` : ''}<div class="maintenance-next"><strong>Next step</strong><p>${e(next)}</p></div><dl class="maintenance-facts"><div><dt>Priority</dt><dd>${e(priorities[row.priority || 'NORMAL'])}</dd></div><div><dt>Assigned staff</dt><dd>${e(row.assigned_name || 'Unassigned')}</dd></div><div><dt>Target completion</dt><dd>${e(row.target_date || 'Not scheduled')}${maintenanceOverdue(row) ? '<small class="maintenance-overdue">Past target date</small>' : ''}</dd></div><div><dt>Recorded repair cost</dt><dd>${e(cost(row))}</dd></div><div><dt>Reported / started</dt><dd>${e(formatDate(row.reported_at || row.started_at))}</dd></div><div><dt>Closed</dt><dd>${row.completed_at ? e(formatDate(row.completed_at)) : 'Still open'}</dd></div></dl>${row.description || row.inspection_notes ? `<section class="record-section"><h3>Issue details</h3><p class="maintenance-preserve">${e(row.description || row.inspection_notes)}</p></section>` : ''}${row.repair_notes ? `<section class="record-section"><h3>Repair work</h3><p class="maintenance-preserve">${e(row.repair_notes)}</p></section>` : ''}${inspection ? `<section class="maintenance-inspection-result"><h3>Final inspection passed</h3><p>Function · Safety · Required parts/accessories checked</p><p>${e(inspection.notes)}</p><small>${e(inspection.inspected_by_name || 'Staff')} · ${e(formatDate(inspection.at))} · ${e(inspection.condition === 'GOOD' ? 'Good' : 'Fair')}</small></section>` : !open && row.details ? `<section class="record-section"><h3>Historical inspection notes</h3><p>${e(row.details)}</p><small>A detailed checklist was not recorded for this older repair.</small></section>` : ''}${row.retirement_reason ? `<section class="record-section"><h3>Retirement reason</h3><p>${e(row.retirement_reason)}</p></section>` : ''}${row.photos?.length ? `<section class="record-section"><h3>Damage / repair photos</h3><div class="maintenance-photos">${row.photos.map(photo => `<button class="secondary" data-maintenance-photo="${e(photo.id)}">${e(photo.caption || 'View photo')} ${h.icon('eye')}</button>`).join('')}</div></section>` : ''}<section class="record-section"><h3>Work history</h3><ol class="maintenance-activity">${[...row.activity || []].reverse().map(entry => `<li><div><strong>${e(({ REPORTED: 'Issue reported', UPDATE: 'Work update', START_REPAIR: 'Assessment / repair started', SEND_INSPECTION: 'Sent for inspection', INSPECTION_FAILED: 'Inspection failed · returned to repair', COMPLETE: 'Inspection passed', RETIRE: 'Unit retired', RETIRED: 'Unit retired' })[entry.kind] || 'Maintenance update')}</strong><small>${e(entry.actor_name || 'Staff')} · ${e(formatDate(entry.at))}</small></div><p class="maintenance-preserve">${e(entry.note || '')}</p></li>`).join('') || `<li><p>Older service record. ${e(row.details || row.inspection_notes || 'No individual work updates were recorded.')}</p></li>`}</ol></section><div class="maintenance-related">${item ? '<button class="text-button" data-maintenance-equipment>View equipment and units</button>' : ''}${row.rental_id ? '<button class="text-button" data-maintenance-rental>View related rental / return inspection</button>' : ''}</div><footer class="maintenance-detail-actions">${actions}</footer></div>`);
      modal.querySelectorAll('[data-maintenance-action]').forEach(button => button.onclick = () => actionForm(row, button.dataset.maintenanceAction));
      modal.querySelector('[data-maintenance-equipment]')?.addEventListener('click', () => h.showEquipmentDetails(row.item_id));
      modal.querySelector('[data-maintenance-rental]')?.addEventListener('click', () => { const rental = (getModel()?.transactions || []).find(record => record.id === row.rental_id); if (rental) h.transactionDetails(rental); else toast('Refresh Rental History to view this rental.'); });
      modal.querySelectorAll('[data-maintenance-photo]').forEach(button => button.onclick = async () => { try { const photo = await api(`/maintenance/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(button.dataset.maintenancePhoto)}`); showModal('Maintenance photo', `<figure class="maintenance-photo-view"><img src="${e(photo.image_data)}" alt="${e(photo.caption || 'Damage or repair evidence')}"/><figcaption>${e(photo.caption || 'Damage / repair photo')}</figcaption></figure><button class="secondary" data-maintenance-back>Back to ticket</button>`); modal.querySelector('[data-maintenance-back]').onclick = () => details(row.id); } catch (error) { toast(error.message); } });
    } catch (error) { if (current()) showError(error); }
  }
  async function actionForm(row, action) {
    const version = ++requestVersion, source = modal.querySelector('.maintenance-detail');
    const current = () => version === requestVersion && modal.open && source?.isConnected;
    try {
      if (action === 'update' && maintenanceOpen(row)) await loadStaff();
      if (!current()) return;
      const titles = { update: 'Update maintenance ticket', 'start-repair': 'Start assessment / repair', 'send-inspection': 'Send for inspection', 'inspection-failed': 'Return unit to repair', complete: 'Complete maintenance inspection', retire: 'Retire physical unit' };
      const instructions = { update: 'Record the work, assignment, target date or actual repair expense.', 'start-repair': 'Begin diagnosis or repair. The unit stays unavailable.', 'send-inspection': 'Describe the work performed. The unit stays unavailable until its final inspection passes.', 'inspection-failed': 'Describe what failed and needs more work. The unit stays unavailable.', complete: 'Inspect the actual unit before confirming these checks. Only passing units can return to rental.', retire: 'Use this when the unit cannot be safely repaired or will no longer be used. This closes its open maintenance tickets, removes only this unit from active stock, and keeps its QR and history.' };
      const edit = action === 'update', closed = !maintenanceOpen(row), expense = edit || action === 'send-inspection';
      showModal(titles[action], `<form class="maintenance-form"><div class="maintenance-action-unit"><strong>${e(row.item_name || 'Equipment')} · ${e(row.item_code || 'Unit code not recorded')}</strong><small>${e(recordCode(row, 'maintenance'))}</small></div><p class="info-box">${e(instructions[action])}</p>${edit && !closed ? `<div class="maintenance-form-grid"><label>Priority<select name="priority">${selectOptions(Object.entries(priorities), row.priority || 'NORMAL')}</select></label><label>Assigned staff<select name="assignedTo">${assignmentOptions(row.assigned_to)}</select></label><label>Target completion date<input name="targetDate" type="date" value="${e(row.target_date || '')}"/></label></div>` : ''}${expense ? `<label>Total repair cost (PHP)<input name="repairCost" type="number" min="0" max="9999999999.99" step="0.01" value="${row.repair_cost == null ? '' : e(row.repair_cost)}"/><small>Full total for this ticket. Leave blank if unknown; enter 0 only if there was no cost.</small></label>` : ''}${action === 'complete' ? `<fieldset class="maintenance-checklist"><legend>Final inspection</legend><label><input type="checkbox" name="functional" required/> Function test passed</label><label><input type="checkbox" name="safe" required/> Safe for customer rental</label><label><input type="checkbox" name="complete" required/> Required parts/accessories are complete, or not applicable</label></fieldset><label>Final condition<select name="condition">${selectOptions([['GOOD', 'Good'], ['FAIR', 'Fair']], 'GOOD')}</select></label>` : ''}<label>${action === 'retire' ? 'Retirement reason' : action === 'complete' ? 'Inspection findings' : action === 'send-inspection' ? 'Work performed / repair findings' : 'Work update / notes'}<textarea name="note" rows="3" maxlength="2000" ${['update', 'start-repair'].includes(action) ? '' : 'required'}></textarea></label>${action === 'retire' ? '' : photoField}${footer(action === 'retire' ? 'Retire this unit' : action === 'complete' ? 'Confirm inspection passed' : 'Save update')}</form>`);
      const form = modal.querySelector('form'); form.querySelector('[data-maintenance-back]').onclick = () => details(row.id);
      confirmSubmit(form, { title: action === 'retire' ? 'Retire this exact unit?' : action === 'complete' ? 'Confirm this unit passed inspection?' : 'Save this maintenance update?', description: action === 'retire' ? `${row.item_name} (${row.item_code}) will be removed from active stock. Its history remains saved. Other units stay unchanged.` : action === 'complete' ? 'This confirms all physical checks passed and returns the unit to rental when it has no other open maintenance tickets.' : 'This saves the ticket update and keeps equipment availability in sync.', confirmLabel: action === 'retire' ? 'Yes, retire unit' : 'Yes, save update', danger: action === 'retire' }, async () => {
        const values = Object.fromEntries(new FormData(form)), payload = { action, revision: Number(row.revision || 0), note: values.note || '' };
        if (expense) payload.repairCost = values.repairCost === '' ? null : Number(values.repairCost);
        if (edit && !closed) Object.assign(payload, { priority: values.priority, assignedTo: values.assignedTo, targetDate: values.targetDate });
        if (action === 'complete') Object.assign(payload, { condition: values.condition, checks: { functional: form.elements.functional.checked, safe: form.elements.safe.checked, complete: form.elements.complete.checked } });
        await save(form, '/maintenance/' + encodeURIComponent(row.id), payload, action === 'retire' ? 'Unit retired; history preserved.' : action === 'complete' ? 'Inspection passed. Unit returned to available stock.' : 'Maintenance update saved.', row.id);
      });
    } catch (error) { if (current()) showError(error); }
  }
  return { render, bind, details, reportForm, setStatus:value=>{scope=['OPEN','IN_PROGRESS'].includes(value)?'open':['CLOSED','COMPLETED','RETIRED'].includes(value)?'history':'all';}, reset: () => { scope = 'open'; stageFilter = ''; priorityFilter = ''; staff = []; staffLoaded = false; staffLoading = null; staffVersion++; requestVersion++; } };
}

async function preparePhotos(files) {
  if (!files?.length) return [];
  if (files.length > 3) throw new Error('Choose up to three photos per update.');
  const result = [];
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10000000) throw new Error('Choose a JPG, PNG or WebP photo under 10 MB.');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let quality = .8, imageData = canvas.toDataURL('image/jpeg', quality);
      while (imageData.length > 195000 && quality > .25) { quality -= .1; imageData = canvas.toDataURL('image/jpeg', quality); }
      if (imageData.length > 195000) throw new Error('This photo is still too large. Choose a smaller image.');
      result.push({ imageData, caption: file.name.replace(/\.[^.]+$/, '').slice(0, 120) });
    } finally { URL.revokeObjectURL(url); }
  }
  return result;
}
