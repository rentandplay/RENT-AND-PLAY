import { bindRecordLinks, recordAttrs } from './record-links.js';
import { bindAccountValidation, nameError, emailError, phoneError, passwordError, passwordMatchError } from './account-validation.js';

const customerDate = value => {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(text) ? text : text.replace(' ', 'T') + '+08:00');
  return Number.isNaN(date.getTime()) ? null : date;
};

export function customerActivity(customers = [], transactions = [], now = new Date()) {
  const byCustomer = new Map();
  for (const row of transactions) {
    const key = String(row.customer_id);
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key).push(row);
  }
  return customers.map(customer => {
    const history = (byCustomer.get(String(customer.id)) || []).slice().sort((a, b) =>
      (customerDate(b.confirmed_rental_at || b.created_at)?.getTime() || 0) - (customerDate(a.confirmed_rental_at || a.created_at)?.getTime() || 0));
    const returned = row => row.status === 'COMPLETED' || Boolean(row.confirmed_return_at);
    const confirmed = history.filter(row => row.confirmed_rental_at || row.status === 'ACTIVE' || returned(row));
    const active = history.filter(row => row.status === 'ACTIVE' && !returned(row));
    const overdue = active.filter(row => { const due = customerDate(row.due_at); return due && due < now; });
    return { customer, history, total: confirmed.length, active: active.length, overdue: overdue.length,
      returned: history.filter(returned).length, lastActivity: history[0]?.confirmed_rental_at || history[0]?.created_at || null };
  });
}

export function filterCustomerRows(rows, { search = '', status = 'all', activity = 'all', sort = 'name' } = {}) {
  const query = search.trim().toLowerCase();
  const records = rows.filter(row => {
    const c = row.customer;
    if (query && ![c.full_name, c.customer_code, c.email, c.phone, c.address].some(value => String(value || '').toLowerCase().includes(query))) return false;
    if (status === 'active' && c.is_active === false || status === 'archived' && c.is_active !== false) return false;
    if (activity === 'out' && !row.active || activity === 'overdue' && !row.overdue || activity === 'new' && row.history.length) return false;
    return true;
  });
  const byName = (a, b) => String(a.customer.full_name || '').localeCompare(String(b.customer.full_name || ''));
  return records.sort((a, b) => {
    if (sort === 'newest') return (customerDate(b.customer.created_at)?.getTime() || 0) - (customerDate(a.customer.created_at)?.getTime() || 0) || byName(a, b);
    if (sort === 'rentals') return b.total - a.total || byName(a, b);
    return byName(a, b);
  });
}

export function nextCustomerCode(customers = []) {
  const latest = customers.reduce((max, c) => { const match = /^CUST-(\d+)$/i.exec(c.customer_code || ''); return match ? Math.max(max, Number(match[1])) : max; }, 0);
  return `CUST-${String(latest + 1).padStart(3, '0')}`;
}

export function customersCsv(rows) {
  const cell = value => {
    const text = String(value ?? ''), safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const headings = ['Customer code', 'Full name', 'Email', 'Phone', 'Address', 'Status', 'Confirmed rentals', 'Equipment out', 'Overdue rentals', 'Latest activity'];
  return '\uFEFF' + [headings, ...rows.map(({ customer: c, total, active, overdue, lastActivity }) =>
    [c.customer_code, c.full_name, c.email, c.phone, c.address, c.is_active === false ? 'Archived' : 'Active', total, active, overdue, lastActivity])]
    .map(row => row.map(cell).join(',')).join('\r\n');
}

export function createCustomerUI(h) {
  const { api, escape: e, showModal, modal, toast, formatDate, icon, model, refresh, transactionDetails, confirmAction, confirmSubmit } = h;
  const state = { status: 'all', activity: 'all', sort: 'name' };
  let currentSearch = '', redraw = () => {}, helpers;
  const rows = () => customerActivity(model()?.customers, model()?.transactions);
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const avatar = customer => {
    const tone = [...String(customer.id || customer.full_name || '')].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 4;
    return `<span class="customer-avatar tone-${tone}" aria-hidden="true">${e(initials(customer.full_name))}</span>`;
  };
  const badge = c => `<span class="badge ${c.is_active === false ? 'inactive' : 'active'}">${c.is_active === false ? 'Archived' : 'Active'}</span>`;
  const shortDate = value => {
    const date = customerDate(value);
    return date ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(date) : 'Not recorded';
  };
  const option = (value, label, selected) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`;
  const metric = (label, value, note, glyph, tone) => `<article class="customer-metric"><span class="customer-metric-icon ${tone}">${icon(glyph)}</span><div><span>${label}</span><strong>${value}</strong><small>${note}</small></div></article>`;
  const passwordField = (id, name, label, required, help) => `<label>${label}${required ? ' <span class="customer-required">Required</span>' : ''}<span class="customer-password-control"><input id="${id}" ${name ? `name="${name}"` : ''} type="password" data-sensitive-password autocomplete="new-password" minlength="8" maxlength="128" ${required ? 'required' : ''}/><button type="button" class="customer-password-toggle" data-password-toggle="${id}" aria-controls="${id}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false">Show</button></span><small>${help}</small></label>`;
  const filtered = () => filterCustomerRows(rows(), { ...state, search: currentSearch });

  function render(search, tools) {
    currentSearch = search;
    helpers = tools;
    const all = rows(), records = filterCustomerRows(all, { ...state, search }), view = tools.paged(records, 'Customers');
    const counts = { all: all.length, active: all.filter(row => row.customer.is_active !== false).length, archived: all.filter(row => row.customer.is_active === false).length };
    const out = all.filter(row => row.active).length, late = all.filter(row => row.overdue).length;
    const isFiltered = search.trim() || state.status !== 'all' || state.activity !== 'all' || state.sort !== 'name';
    const tabs = [['all', 'All customers'], ['active', 'Active'], ['archived', 'Archived']].map(([key, label]) =>
      `<button type="button" id="customer-filter-${key}" data-customer-filter="${key}" aria-pressed="${state.status === key}" class="customer-filter ${state.status === key ? 'selected' : ''}">${label}<span>${counts[key]}</span></button>`).join('');
    const body = records.length ? tools.table(['CUSTOMER', 'CONTACT DETAILS', 'RENTAL ACTIVITY', 'LATEST ACTIVITY', 'STATUS', '<span class="customer-sr-only">Actions</span>'], view.rows.map(row => {
      const c = row.customer;
      const archived = c.is_active === false;
      return `<tr ${recordAttrs('customer', c.id, c.full_name || 'customer')}><td><button type="button" class="customer-identity" data-customer-detail="${e(c.id)}" aria-label="View ${e(c.full_name)}">${avatar(c)}<span><strong>${e(c.full_name)}</strong><small>${e(c.customer_code)}${row.total > 1 ? '<span class="customer-returning">Returning</span>' : ''}</small></span></button></td><td><div class="customer-contact">${c.email ? `<span>${e(c.email)}</span>` : '<span class="customer-muted">No email added</span>'}<small>${e(c.phone || 'No phone added')}</small></div></td><td><strong>${row.total} rental${row.total === 1 ? '' : 's'}</strong><small class="${row.overdue ? 'customer-overdue-text' : row.active ? 'customer-out-text' : ''}">${row.overdue ? `${row.overdue} overdue · ${row.active} out` : row.active ? `${row.active} equipment out` : row.history.length ? 'No equipment out' : 'No rentals yet'}</small></td><td><strong>${row.lastActivity ? e(shortDate(row.lastActivity)) : '—'}</strong><small>${row.history[0] ? e(row.history[0].item_name || 'Equipment rental') : 'Ready for their first rental'}</small></td><td>${badge(c)}</td><td><div class="customer-row-actions"><button type="button" class="customer-view" data-customer-detail="${e(c.id)}" aria-label="View details for ${e(c.full_name)}">View ${icon('arrow')}</button>${archived ? `<button type="button" class="customer-restore" data-customer-restore="${e(c.id)}" aria-label="Restore ${e(c.full_name)}">Restore</button><button type="button" class="customer-delete" data-customer-delete="${e(c.id)}" aria-label="Permanently delete ${e(c.full_name)}">Delete</button>` : `<button type="button" class="customer-edit" data-customer-edit="${e(c.id)}" aria-label="Edit ${e(c.full_name)}">Edit</button>`}</div></td></tr>`;
    }).join('')) : `<div class="customer-empty"><span>${icon(all.length ? 'search' : 'users')}</span><h3>${all.length ? 'No customers match this view' : 'Your next great rental starts here'}</h3><p>${all.length ? 'Try another search or clear the filters to see your customers.' : 'Add your first customer to keep contact details and rental history in one place.'}</p><button type="button" class="${all.length ? 'secondary' : 'primary'}" ${all.length ? 'data-customer-clear' : 'data-customer-add'}>${all.length ? 'Clear filters' : '+ Add your first customer'}</button></div>`;
    return `<div class="customers-page"><section class="customer-metrics" aria-label="Customer overview">${metric('Total customers', counts.all, 'Everyone in your directory', 'users', 'blue')}${metric('Active customers', counts.active, 'Ready for their next rental', 'users', 'green')}${metric('With equipment out', out, 'Customers with active rentals', 'box', 'amber')}${metric('Overdue customers', late, 'Customers needing a follow-up', 'clock', 'rose')}</section>${late ? `<aside class="customer-attention"><span>${icon('bell')}</span><div><strong>${late} customer${late === 1 ? ' has' : 's have'} overdue equipment</strong><p>Open their profile to check due dates and contact details.</p></div><button type="button" class="text-button" id="customer-show-overdue">View overdue ${icon('arrow')}</button></aside>` : ''}<section class="panel admin-module customer-directory"><div class="customer-directory-heading"><div><h3>Customer directory <span>${counts.all}</span></h3><p>The people behind every rental.</p></div><div class="customer-directory-toolbar"><label class="module-search">${icon('search')}<input id="module-search" value="${e(search)}" placeholder="Search name, code, or contact…" aria-label="Search customers"/></label><div class="customer-heading-actions"><button type="button" class="secondary" id="customer-export" ${records.length ? '' : 'disabled'}>${icon('download')} Export CSV</button><button type="button" class="primary" id="customer-add"><span aria-hidden="true">+</span> Add customer</button></div></div></div><div class="customer-filter-bar"><div class="customer-filters" role="group" aria-label="Customer status">${tabs}</div><div class="customer-selects"><label><span>Activity</span><select id="customer-activity" aria-label="Filter by rental activity">${option('all', 'All activity', state.activity)}${option('out', 'Equipment out', state.activity)}${option('overdue', 'Overdue', state.activity)}${option('new', 'No rental history', state.activity)}</select></label><label><span>Sort</span><select id="customer-sort" aria-label="Sort customers">${option('name', 'Name A–Z', state.sort)}${option('newest', 'Newest first', state.sort)}${option('rentals', 'Most rentals', state.sort)}</select></label></div></div>${isFiltered ? `<div class="customer-filter-summary"><span>${records.length} matching customer${records.length === 1 ? '' : 's'}</span><button type="button" class="text-button" data-customer-clear>Clear filters</button></div>` : ''}${body}${records.length ? view.footer : ''}</section><p class="customer-page-note">${icon('users')} Customer profiles keep their rental history together, even after archiving.</p></div>`;
  }

  function form(customer = {}) {
    const isNew = !customer.id, mobileAccount = Boolean(customer.auth_uid), emailRequired = isNew || mobileAccount;
    const code = /^CUST-\d+$/i.test(customer.customer_code || '')
      ? customer.customer_code
      : nextCustomerCode((model()?.customers || []).filter(row => String(row.id) !== String(customer.id)));
    const intro = isNew
      ? 'Create a customer profile and a mobile-app login. They can request rentals after signing in.'
      : mobileAccount ? 'Update customer details. Changes to the email address also update their mobile-app login.' : 'Keep their details up to date for a smoother rental.';
    const loginSection = isNew
      ? `<section class="customer-form-section"><h3><span>03</span> Mobile app login <small>Required</small></h3><div class="form-grid">${passwordField('customer-password', 'password', 'Password', true, 'At least 8 characters, one capital letter, and one number. The customer will use this with their email to sign in.')}${passwordField('customer-confirm-password', 'confirmPassword', 'Confirm password', true, 'Enter the same password again.')}</div></section>`
      : mobileAccount ? `<section class="customer-form-section"><h3><span>03</span> Mobile app login <small>Optional change</small></h3><p>Set a new password only when needed. The current password cannot be viewed here.</p><div class="form-grid">${passwordField('customer-new-password', '', 'New password', false, 'At least 8 characters, one capital letter, and one number. Leave both fields blank to keep the current password.')}${passwordField('customer-confirm-new-password', '', 'Confirm new password', false, 'Enter the new password again.')}</div><div class="customer-password-actions"><button type="button" class="secondary" data-change-customer-password disabled>Change password</button></div><p class="customer-password-error form-error" role="alert"></p></section>` : '';
    showModal(customer.id ? 'Edit customer' : 'Add customer', `<form id="customer-form" class="admin-form customer-form"><p class="customer-form-intro">${intro}</p><section class="customer-form-section"><h3><span>01</span> Customer information</h3><div class="form-grid"><label>Full name <span class="customer-required">Required</span><input name="fullName" value="${e(customer.full_name || '')}" placeholder="e.g. Juan Dela Cruz" autocomplete="name" minlength="2" maxlength="150" required/></label><label>Customer code <span class="customer-required">Required</span><input name="code" value="${e(code)}" pattern="CUST-[0-9]{3,}" minlength="8" maxlength="50" readonly required/><small>Automatically assigned in the standard CUST-### format.</small></label></div></section><section class="customer-form-section"><h3><span>02</span> Contact details <small>${emailRequired ? 'Email required for app login' : 'Optional'}</small></h3><div class="form-grid"><label>Email address ${emailRequired ? '<span class="customer-required">Required</span>' : ''}<input type="email" name="email" value="${e(customer.email || '')}" placeholder="name@example.com" autocomplete="email" maxlength="254" ${emailRequired ? 'required' : ''}/><small>${emailRequired ? 'This is the customer’s mobile-app sign-in.' : 'Add an email if this customer will need mobile-app access.'}</small></label><label>Phone number<input type="tel" name="phone" value="${e(customer.phone || '')}" placeholder="e.g. 0917 123 4567" autocomplete="tel" maxlength="40" pattern="[+]?[0-9() .-]{7,24}" ${isNew ? 'required' : ''} title="Enter a Philippine mobile number."/></label></div><label>Address<textarea name="address" placeholder="Street, barangay, city / municipality" autocomplete="street-address" maxlength="500" rows="3">${e(customer.address || '')}</textarea></label><p>${isNew ? 'A Philippine mobile number is required. Address is optional.' : 'Phone number and address are optional.'}</p></section>${loginSection}<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">${customer.id ? 'Save changes' : 'Create customer account'}</button></div></form>`);
    const formElement = modal.querySelector('form');
    const clearPasswordFields = () => {
      formElement.querySelectorAll('[data-sensitive-password]').forEach(input => { input.value = ''; input.type = 'password'; });
      formElement.querySelectorAll('[data-password-toggle]').forEach(button => { button.textContent = 'Show'; button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', `Show ${formElement.querySelector(`#${button.dataset.passwordToggle}`)?.closest('label')?.childNodes[0]?.textContent?.trim().toLowerCase() || 'password'}`); });
    };
    modal.addEventListener('close', clearPasswordFields, { once: true });
    modal.querySelector('[data-close]').onclick = () => { clearPasswordFields(); modal.close(); };
    formElement.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
      const input = formElement.querySelector(`#${button.dataset.passwordToggle}`), show = input.type === 'password';
      input.type = show ? 'text' : 'password'; button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-pressed', String(show)); button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${input.closest('label')?.childNodes[0]?.textContent?.trim().toLowerCase() || 'password'}`);
    }));
    const passwordInput = formElement.querySelector('#customer-password'), confirmPasswordInput = formElement.querySelector('#customer-confirm-password');
    const newPasswordInput = formElement.querySelector('#customer-new-password'), confirmNewPasswordInput = formElement.querySelector('#customer-confirm-new-password'), changePasswordButton = formElement.querySelector('[data-change-customer-password]');
    const validation = bindAccountValidation(formElement, {
      fullName: nameError, email: value => emailError(value, emailRequired), phone: value => phoneError(value, isNew),
      ...(passwordInput ? { password: passwordError, confirmPassword: value => passwordMatchError(passwordInput.value, value) } : {}),
      ...(newPasswordInput ? { 'customer-new-password': value => value || confirmNewPasswordInput.value ? passwordError(value) : '', 'customer-confirm-new-password': value => value || newPasswordInput.value ? passwordMatchError(newPasswordInput.value, value) : '' } : {})
    });
    if (newPasswordInput && confirmNewPasswordInput && changePasswordButton) {
      const passwordError = formElement.querySelector('.customer-password-error');
      const syncPasswordValidity = () => {
        const password = newPasswordInput.value, confirmation = confirmNewPasswordInput.value;
        validation.update();
        changePasswordButton.disabled = !password && !confirmation;
      };
      newPasswordInput.addEventListener('input', syncPasswordValidity);
      confirmNewPasswordInput.addEventListener('input', syncPasswordValidity);
      changePasswordButton.addEventListener('click', async () => {
        if (changePasswordButton.disabled || !newPasswordInput.checkValidity() || !confirmNewPasswordInput.checkValidity()) {
          if (!newPasswordInput.checkValidity()) newPasswordInput.reportValidity();
          else if (!confirmNewPasswordInput.checkValidity()) confirmNewPasswordInput.reportValidity();
          return;
        }
        const password = newPasswordInput.value, confirmation = confirmNewPasswordInput.value;
        if (!await confirmAction({ title: 'Change customer password?', description: 'This replaces their mobile app sign-in password. The current password cannot be recovered; share the new password with them securely.', confirmLabel: 'Yes, change password', cancelLabel: 'No, keep current password' }) || !changePasswordButton.isConnected || !modal.open || password !== newPasswordInput.value || confirmation !== confirmNewPasswordInput.value) return;
        changePasswordButton.disabled = true; passwordError.textContent = '';
        try {
          const result = await api(`/customers/${encodeURIComponent(customer.id)}/password`, { method: 'PATCH', body: JSON.stringify({ newPassword: password, confirmNewPassword: confirmation }) });
          clearPasswordFields(); syncPasswordValidity();
          toast(result.customer?.auditRecorded === false ? 'Password changed, but its audit record could not be saved.' : 'Customer mobile app password changed.');
        } catch (problem) { passwordError.textContent = problem.message; }
        finally { syncPasswordValidity(); }
      });
      formElement.addEventListener('submit', event => {
        if (newPasswordInput.value || confirmNewPasswordInput.value) {
          event.preventDefault(); event.stopImmediatePropagation(); passwordError.textContent = 'Use Change password to apply the new mobile app password.'; changePasswordButton.focus();
        }
      }, true);
    }
    confirmSubmit(formElement, { title: customer.id ? 'Save customer changes?' : 'Create this customer account?', description: customer.id ? 'The updated contact details and mobile sign-in email will be saved.' : 'This creates a mobile sign-in account and adds the customer to the directory. Share their password with them securely.', confirmLabel: customer.id ? 'Yes, save changes' : 'Yes, create account' }, async () => {
      const button = formElement.querySelector('[type="submit"]'), error = formElement.querySelector('.form-error');
      button.disabled = true; error.textContent = '';
      try {
        const endpoint = customer.id ? `/customers/${encodeURIComponent(customer.id)}` : '/customer-accounts';
        await api(endpoint, { method: customer.id ? 'PATCH' : 'POST', body: JSON.stringify(Object.fromEntries(new FormData(formElement))) });
      } catch (problem) { error.textContent = problem.message; button.disabled = false; return; }
      modal.close(); toast(customer.id ? 'Customer updated.' : 'Mobile customer account created.');
      try { await refresh(); } catch { toast('Customer saved. Select Refresh to update the directory.'); }
      redraw();
    });
  }

  async function changeStatus(c, row, button, inProfile = false) {
    if (!button || button.disabled) return;
    button.disabled = true;
    const restore = c.is_active === false, error = inProfile ? modal.querySelector('.customer-profile-error') : null;
    if (error) error.textContent = '';
    try {
      const description = restore ? 'This customer will be available for new rentals again.' : `This removes them from new rental selections. Their contact details and rental history stay available.${row.active ? ` They still have ${row.active} equipment out; follow up on those returns.` : ''}`;
      if (!await confirmAction({ title: `${restore ? 'Restore' : 'Archive'} ${c.full_name}?`, description, confirmLabel: restore ? 'Yes, restore customer' : 'Yes, archive customer', cancelLabel: restore ? 'No, keep archived' : 'No, keep active', danger: !restore }) || !button.isConnected || inProfile && !modal.open) return;
      await api(`/customers/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: JSON.stringify({ action: restore ? 'restore' : 'archive' }) });
    } catch (problem) {
      if (error) error.textContent = problem.message; else toast(problem.message);
      return;
    } finally { button.disabled = false; }
    if (inProfile) modal.close();
    toast(restore ? 'Customer restored.' : 'Customer archived.');
    try { await refresh(); } catch { toast('Customer status saved. Select Refresh to update the directory.'); }
    redraw();
  }

  async function deleteCustomer(c, button, inProfile = false) {
    if (!button || button.disabled) return;
    button.disabled = true;
    const error = inProfile ? modal.querySelector('.customer-profile-error') : null;
    if (error) error.textContent = '';
    try {
      const accountNote = c.auth_uid ? ' Their linked mobile sign-in account will also be removed.' : '';
      if (!await confirmAction({ title: `Delete ${c.full_name} permanently?`, description: `“${c.full_name}” (${c.customer_code}) will be removed from the customer directory. Past rentals and the audit trail stay saved.${accountNote} Customers with active or pending rentals cannot be deleted. This cannot be undone.`, confirmLabel: 'Yes, delete permanently', cancelLabel: 'No, keep customer', danger: true }) || !button.isConnected || inProfile && !modal.open) return;
      const result = await api(`/customers/${encodeURIComponent(c.id)}`, { method: 'DELETE', body: JSON.stringify({ version: c.updated_at || c.created_at || '' }) });
      if (inProfile) modal.close();
      toast(result.customer?.mobileAccountDeletionPending ? 'Customer deleted. Their mobile account was disabled but could not be fully removed.' : 'Customer permanently deleted.');
      try { await refresh(); } catch { toast('Customer deleted. Select Refresh to update the directory.'); }
      redraw();
    } catch (problem) {
      if (error) error.textContent = problem.message; else toast(problem.message);
    } finally { button.disabled = false; }
  }

  function details(id, historyPage = 0) {
    const row = rows().find(item => String(item.customer.id) === String(id));
    if (!row) return;
    const c = row.customer, pageSize = 5, pageCount = Math.max(1, Math.ceil(row.history.length / pageSize));
    historyPage = Math.max(0, Math.min(historyPage, pageCount - 1));
    const history = row.history.slice(historyPage * pageSize, (historyPage + 1) * pageSize);
    const statusLabel = rental => rental.status === 'ACTIVE' && !rental.confirmed_return_at && customerDate(rental.due_at) && customerDate(rental.due_at) < new Date() ? 'Overdue' : rental.status === 'COMPLETED' || rental.confirmed_return_at ? 'Returned' : rental.status === 'PENDING_ADMIN_APPROVAL' ? 'Pending admin review' : rental.status === 'PENDING_VERIFICATION' ? 'Pending verification' : rental.status === 'CANCELLED' ? 'Cancelled' : String(rental.status || 'Unknown').replaceAll('_', ' ');
    const historyHtml = history.length ? helpers.table(['EQUIPMENT / RENTAL', 'RENTED', 'DUE / RETURNED', 'STATUS', '<span class="customer-sr-only">Actions</span>'], history.map(rental => `<tr ${recordAttrs('transaction', rental.id, rental.rental_code || rental.id)}><td><strong>${e(rental.item_name || 'Unknown equipment')}</strong><small>${e(rental.rental_code || rental.id)}</small></td><td>${e(shortDate(rental.confirmed_rental_at || rental.created_at))}<small>${rental.confirmed_rental_at ? 'Confirmed rental' : 'Request created'}</small></td><td>${e(shortDate(rental.confirmed_return_at || rental.due_at))}<small>${rental.confirmed_return_at ? 'Returned' : 'Due date'}</small></td><td>${helpers.status(statusLabel(rental))}</td><td><button type="button" class="customer-view" data-customer-rental="${e(rental.id)}" aria-label="View rental ${e(rental.rental_code || rental.id)}">Details ${icon('arrow')}</button></td></tr>`).join('')) : `<div class="customer-history-empty">${icon('box')}<h3>No rental history yet</h3><p>Their rental records will appear here after their first request.</p></div>`;
     showModal('Customer profile', `<div class="customer-profile"><header class="customer-profile-heading">${avatar(c)}<div><span class="eyebrow">${e(c.customer_code)}</span><h3>${e(c.full_name)}</h3><p>${c.created_at ? `Customer since ${e(shortDate(c.created_at))}` : 'Customer record'}</p></div>${badge(c)}</header><dl class="customer-profile-contact"><div><dt>Email address</dt><dd>${e(c.email || 'Not provided')}</dd></div><div><dt>Phone number</dt><dd>${e(c.phone || 'Not provided')}</dd></div><div><dt>Address</dt><dd>${e(c.address || 'Not provided')}</dd></div></dl><section class="customer-profile-metrics" aria-label="Customer rental overview"><div><strong>${row.total}</strong><span>Confirmed rentals</span></div><div><strong>${row.active}</strong><span>Equipment out</span></div><div><strong>${row.returned}</strong><span>Returned</span></div><div class="${row.overdue ? 'customer-overdue-text' : ''}"><strong>${row.overdue}</strong><span>Overdue</span></div></section><div class="customer-profile-actions"><button type="button" class="secondary" data-profile-edit>Edit customer</button><button type="button" class="text-button" data-profile-toggle>${c.is_active === false ? 'Restore customer' : 'Archive customer'}</button>${c.is_active === false ? '<button type="button" class="customer-delete" data-profile-delete>Delete permanently</button>' : ''}</div><section class="customer-profile-history"><div class="customer-history-heading"><h3>Rental history <span>${row.history.length}</span></h3><p>Latest activity first · Philippine time</p></div>${historyHtml}${row.history.length ? `<div class="module-pagination"><span>${historyPage * pageSize + 1}–${Math.min((historyPage + 1) * pageSize, row.history.length)} of ${row.history.length} records</span><div><button type="button" class="secondary" data-history-prev ${historyPage ? '' : 'disabled'}>← Previous</button><button type="button" class="secondary" data-history-next ${historyPage + 1 < pageCount ? '' : 'disabled'}>Next →</button></div></div>` : ''}</section><p class="customer-profile-error form-error" role="alert"></p></div>`);
    modal.querySelector('[data-profile-edit]').onclick = () => form(c);
    modal.querySelector('[data-profile-toggle]').onclick = event => changeStatus(c, row, event.currentTarget, true);
    modal.querySelector('[data-profile-delete]')?.addEventListener('click', event => deleteCustomer(c, event.currentTarget, true));
    modal.querySelector('[data-history-prev]')?.addEventListener('click', () => details(id, historyPage - 1));
    modal.querySelector('[data-history-next]')?.addEventListener('click', () => details(id, historyPage + 1));
    const openRental = rentalId => {
      const rental = row.history.find(item => String(item.id) === String(rentalId));
      if (rental) {
        transactionDetails(rental);
        const back = document.createElement('button');
        back.type = 'button'; back.className = 'customer-back'; back.textContent = '← Back to customer';
        back.onclick = () => details(id, historyPage);
        modal.querySelector('.transaction-record-modal')?.prepend(back);
      }
    };
    modal.querySelectorAll('[data-customer-rental]').forEach(button => button.onclick = () => openRental(button.dataset.customerRental));
    bindRecordLinks(modal, { transaction: openRental });
  }

  function bind(rerender, clearSearch, resetPage) {
    redraw = rerender;
    const update = () => { resetPage(); rerender(); };
    document.querySelectorAll('#customer-add, [data-customer-add]').forEach(button => button.onclick = () => form());
    document.querySelectorAll('[data-customer-edit]').forEach(button => button.onclick = () => form(model().customers.find(c => String(c.id) === button.dataset.customerEdit)));
    document.querySelectorAll('[data-customer-restore]').forEach(button => button.onclick = () => { const row = rows().find(item => String(item.customer.id) === button.dataset.customerRestore); if (row) void changeStatus(row.customer, row, button); });
    document.querySelectorAll('[data-customer-delete]').forEach(button => button.onclick = () => { const row = rows().find(item => String(item.customer.id) === button.dataset.customerDelete); if (row) void deleteCustomer(row.customer, button); });
    document.querySelectorAll('[data-customer-detail]').forEach(button => button.onclick = () => details(button.dataset.customerDetail));
    bindRecordLinks(document, { customer: id => details(id) });
    document.querySelectorAll('[data-customer-filter]').forEach(button => button.onclick = () => { state.status = button.dataset.customerFilter; update(); document.getElementById(`customer-filter-${state.status}`)?.focus(); });
    document.querySelector('#customer-activity')?.addEventListener('change', event => { state.activity = event.target.value; update(); });
    document.querySelector('#customer-sort')?.addEventListener('change', event => { state.sort = event.target.value; update(); });
    document.querySelectorAll('[data-customer-clear]').forEach(button => button.onclick = () => { Object.assign(state, { status: 'all', activity: 'all', sort: 'name' }); clearSearch(); update(); });
    document.querySelector('#customer-show-overdue')?.addEventListener('click', () => { state.status = 'all'; state.activity = 'overdue'; clearSearch(); update(); document.querySelector('#customer-activity')?.focus(); });
    document.querySelector('#customer-export')?.addEventListener('click', () => {
      const records = filtered();
      if (!records.length) { toast('No customers in this view to export.'); return; }
      const url = URL.createObjectURL(new Blob([customersCsv(records)], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
      link.href = url; link.download = 'rent-and-play-customers.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`${records.length} customer${records.length === 1 ? '' : 's'} exported from this view.`);
    });
  }

  return { render, bind, reset: () => { Object.assign(state, { status: 'all', activity: 'all', sort: 'name' }); currentSearch = ''; } };
}
