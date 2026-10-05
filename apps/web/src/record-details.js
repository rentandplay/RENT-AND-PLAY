import { bindRecordLinks, recordAttrs } from './record-links.js';

export function createRecordDetails(h) {
  const { model: getModel, escape: e, showModal, modal, toast, money, formatDate, showEquipmentDetails, transactionDetails } = h;
  const find = (collection, id) => (getModel()?.[collection] || []).find(row => String(row.id) === String(id));
  const cash = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? money(Number(value)) : 'Not recorded';
  const text = value => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
  const missing = () => toast('This record is no longer available. Refresh the page to update the list.');
  const button = (type, id, label) => `<button type="button" class="secondary" ${recordAttrs(type, id, label)}>${e(label)}</button>`;
  function show(title, name, subtitle, fields, actions = '') {
    showModal(title, `<section class="record-detail-modal"><div class="record-detail-heading"><h3>${e(name)}</h3><p>${e(subtitle)}</p></div><dl class="record-fields">${fields.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(text(value))}</dd></div>`).join('')}</dl>${actions ? `<div class="record-detail-actions">${actions}</div>` : ''}</section>`);
    bindRecordLinks(modal, {
      equipment: id => showEquipmentDetails(id),
      transaction: id => { const row = find('transactions', id); if (row) transactionDetails(row); else missing(); }
    });
  }
  const equipmentAction = itemId => find('items', itemId) ? button('equipment', itemId, 'View equipment') : '';
  const rentalAction = rentalId => find('transactions', rentalId) ? button('transaction', rentalId, 'View rental') : '';

  function rate(id) {
    const row = find('rates', id);
    if (!row) return missing();
    show('Equipment rate details', row.item_name || 'Unknown equipment', row.item_code || '', [
      ['Rate ID', row.id], ['Rate basis', String(row.rate_type || '').replaceAll('_', ' ')],
      ['Rental rate', cash(row.rental_rate)], ['Refundable deposit', cash(row.deposit_amount)],
      ['Late penalty rate', cash(row.late_penalty_rate)], ['Status', row.is_active === false ? 'Inactive' : 'Active'],
      ['Effective from', formatDate(row.effective_from)], ['Effective until', row.effective_to ? formatDate(row.effective_to) : row.is_active === false ? 'Not recorded' : 'Current rate']
    ], equipmentAction(row.item_id));
  }

  function maintenance(id) {
    const row = find('maintenance', id);
    if (!row) return missing();
    show('Maintenance details', row.item_name || 'Unknown equipment', row.item_code || '', [
      ['Maintenance ID', row.id], ['Status', String(row.status || '').replaceAll('_', ' ')],
      ['Reason', row.reason], ['Return inspection notes', row.inspection_notes], ['Repair / service notes', row.details],
      ['Started', formatDate(row.started_at)], ['Completed', formatDate(row.completed_at)], ['Linked rental ID', row.rental_id]
    ], equipmentAction(row.item_id) + rentalAction(row.rental_id));
  }

  function user(id) {
    const row = find('users', id);
    if (!row) return missing();
    show('Account details', row.full_name || 'Unnamed account', row.email || '', [
      ['Account ID', row.id], ['Full name', row.full_name], ['Email', row.email], ['Role', row.role],
      ['Status', row.is_active === false ? 'Inactive' : 'Active'], ['Created', formatDate(row.created_at)],
      ['Last login', formatDate(row.last_login_at)]
    ]);
  }

  function audit(id) {
    const row = find('auditLogs', id);
    if (!row) return missing();
    const action = String(row.action || 'Unknown action').replaceAll('_', ' ');
    show('Audit record details', action, row.entity_type || '', [
      ['Audit ID', row.id], ['When', formatDate(row.created_at)], ['Actor', row.actor_name],
      ['Actor type', row.actor_type], ['Action', action], ['Record', row.entity_label], ['Record type', row.entity_type], ['Record ID', row.entity_id]
    ]);
  }

  return { rate, maintenance, user, audit };
}
