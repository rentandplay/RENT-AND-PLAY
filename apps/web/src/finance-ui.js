import { manilaDateTimeInput, manilaDateTimeIso } from './date-time.js';

export function financeDateRange(period = '30', now = new Date()) {
  const to = manilaDateTimeInput(now).slice(0, 10);
  const days = period === 'today' ? 0 : period === '7' ? 6 : period === '90' ? 89 : 29;
  const from = period === 'month' ? to.slice(0, 8) + '01' : new Date(Date.parse(to + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export function createFinanceUI(h) {
  const { api, escape: e, money, formatDate, showModal, modal, toast } = h;
  const pageSize = 5;
  let { from, to } = financeDateRange();
  let summary = null, ledger = null, rentals = null, error = '', loading = false, generation = 0;
  let cursor = '', previous = [], redraw = () => {}, period = '30', type = '', method = '', tab = 'rentals', search = '';
  const operationKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
  const value = number => number == null ? '<span class="finance-unknown">Not recorded</span>' : e(money(number));
  const badge = (label, tone = '') => `<span class="finance-badge ${tone}">${e(label)}</span>`;
  const resetPage = () => { cursor = ''; previous = []; ledger = null; rentals = null; };
  async function load({ force = false } = {}) {
    const version = ++generation;
    if (!from || !to || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000) {
      error = 'Choose a start and end date within one year.'; loading = false; redraw(); return;
    }
    loading = true; error = ''; redraw();
    const query = new URLSearchParams({ from, to, limit: String(pageSize), ...(cursor ? { cursor } : {}), ...(tab === 'ledger' ? { ...(type ? { type } : {}), ...(method ? { method } : {}) } : search ? { search } : {}) });
    const options = force ? { headers: { 'Cache-Control': 'no-cache' } } : {};
    try {
      const [a, b] = await Promise.all([api('/finance/summary?' + new URLSearchParams({ from, to }), options), api('/finance/' + (tab === 'rentals' ? 'rentals' : 'ledger') + '?' + query, options)]);
      if (version !== generation) return;
      summary = a; if (tab === 'rentals') rentals = b; else ledger = b;
    } catch (problem) { if (version === generation) error = problem.message; }
    finally { if (version === generation) { loading = false; redraw(); } }
  }
  const metric = (label, number, note, tone = '') => `<article class="finance-metric ${tone}"><span>${e(label)}</span><strong>${value(number)}</strong><small>${e(note)}</small></article>`;
  function collectionChart() {
    const daily = summary.daily || [], peak = Math.max(0, ...daily.map(row => Number(row.collections || 0)));
    if (!peak) return '<div class="finance-chart-empty"><span aria-hidden="true">↗</span><strong>No dated receipts in this period</strong><p>Saved rental payments are listed below. Confirm their original receipt date to include them in daily collections.</p></div>';
    const interval = Math.max(1, Math.ceil(daily.length / 7));
    return `<div class="finance-bars" role="img" aria-label="Daily money collected in Philippine pesos">${daily.map((row, index) => `<div class="finance-bar" title="${e(row.business_day)}: ${e(money(row.collections || 0))}"><div><i style="height:${Number(row.collections || 0) / peak * 100}%"></i></div><small>${index % interval === 0 || index === daily.length - 1 ? e(row.business_day.slice(5)) : ''}</small></div>`).join('')}</div>`;
  }
  function summaryHtml() {
    if (!summary) return `<div class="panel finance-placeholder" role="status">${error ? 'Payment data could not be loaded.' : 'Loading rental payments and receipts…'}</div>`;
    const r = summary.rental_totals || {}, t = summary.totals;
    return `<div class="finance-summary-grid">${metric('Rental charges', r.charges, 'Saved charges from rentals in this period')}${metric('Saved rental payments', r.saved_paid, 'Amounts already recorded on rentals', 'accent')}${metric('Balance to collect', r.balance_due, 'Unpaid charges, including saved overtime')}${metric('Refunds to return', r.refund_due, 'Outstanding rental and historical deposit refunds')}</div>
      ${r.unposted_count ? `<div class="finance-notice"><div><strong>${e(money(r.unposted_paid))} in saved payments need a receipt date</strong><p>${r.unposted_count} rental${r.unposted_count === 1 ? '' : 's'} already show a payment, but the original receipt date is missing. Add those details below without collecting the money again.</p></div><button class="secondary" data-finance-review ${loading ? 'disabled' : ''}>Review rental payments</button></div>` : ''}
      ${r.unknown_payments ? `<p class="finance-footnote">${r.unknown_payments} rental${r.unknown_payments === 1 ? ' has' : 's have'} no saved payment amount (${r.unknown_payments === 1 ? 'record needs' : 'records need'} review).</p>` : ''}
      <div class="finance-overview"><section class="panel finance-collections"><div class="finance-section-heading"><div><h3>Daily collections</h3><p>Actual receipt dates · Philippine time</p></div><strong>${e(money(t.collections))}</strong></div>${collectionChart()}</section>
      <section class="panel finance-cash-summary"><h3>Dated money activity</h3><dl>${[['Cash received', t.cash_collections], ['QR received', t.qr_collections], ['Money refunded', t.refunds], ['Expenses paid', t.expenses]].map(([label, amount]) => `<div><dt>${e(label)}</dt><dd>${e(money(amount))}</dd></div>`).join('')}<div class="finance-net"><dt>After refunds & expenses</dt><dd>${e(money(t.net_after_expenses))}</dd></div></dl><small>Recorded cash movement: ${e(money(t.cash_net_movement))}. This is not a counted cash-drawer balance.</small></section></div>`;
  }
  function rentalRows() {
    return (rentals?.records || []).map(row => {
      const f = row.finance;
      const receipt = f.receipt_status === 'RECEIPT_DATE_NEEDED' ? badge('Receipt date needed', 'warning') : f.receipt_status === 'PAYMENT_UNKNOWN' ? badge('Needs review', 'warning') : f.receipt_status === 'RECORDED' ? badge('Receipt recorded', 'success') : badge('No payment');
      return `<tr><td><strong>${e(row.rental_code || 'Rental')}</strong><small>${e(row.item_name)} · ${e(row.customer_name)}</small><small>${e(formatDate(row.created_at))} · ${e(row.status.replaceAll('_', ' '))}</small></td><td>${value(f.charges)}</td><td><strong>${value(f.saved_paid)}</strong>${f.saved_refunded ? `<small>${e(money(f.saved_refunded))} refunded</small>` : ''}</td><td>${value(f.balance_due)}${f.refund_due > 0 ? `<small class="finance-refund">Refund due ${e(money(f.refund_due))}</small>` : ''}</td><td>${receipt}${f.unposted_paid > 0 ? `<small>${e(money(f.unposted_paid))} awaiting dated receipt</small>` : ''}</td><td><div class="finance-row-actions">${f.unposted_paid > 0 ? `<button class="secondary" data-finance-history="${e(row.id)}">Add receipt date</button>` : ''}${f.balance_due > 0 ? `<button class="text-button" data-finance-collect="${e(row.rental_code)}">Collect balance →</button>` : ''}</div></td></tr>`;
    }).join('');
  }
  function ledgerRows() {
    return (ledger?.entries || []).map(row => `<tr><td><strong>${e(row.ledger_code)}</strong><small>${e(formatDate(row.occurred_at))}</small>${row.source === 'HISTORICAL_RECEIPT_CONFIRMED' ? '<small>Historical receipt confirmed</small>' : ''}</td><td><strong>${e(row.rental_code || row.category?.replaceAll('_', ' ') || 'Business expense')}</strong><small>${e(row.customer_name || row.notes || '')}</small>${row.reference ? `<small>Ref: ${e(row.reference)}</small>` : ''}</td><td>${badge(row.type.replaceAll('_', ' '), row.type === 'COLLECTION' ? 'success' : '')}<small>${e(row.payment_method === 'CASH' ? 'Cash · in person' : 'QR transfer')}</small></td><td class="finance-amount">${row.type === 'COLLECTION' || row.type === 'EXPENSE_REVERSAL' ? '+' : '−'}${e(money(row.amount))}</td><td>${e(row.recorded_by_name || 'Staff')}</td></tr>`).join('');
  }
  function render() {
    const rows = tab === 'rentals' ? rentalRows() : ledgerRows(), page = tab === 'rentals' ? rentals : ledger;
    const loaded = (tab === 'rentals' ? rentals?.records : ledger?.entries)?.length || 0;
    const heads = tab === 'rentals' ? ['Rental / customer', 'Charges', 'Saved paid', 'Balance', 'Receipt status', 'Actions'] : ['Receipt / date', 'Rental / description', 'Entry / method', 'Amount', 'Recorded by'];
    return `<div class="finance-workspace" aria-busy="${loading}"><section class="panel finance-controls"><div class="finance-section-heading"><div><h3>Payment overview</h3><p>Track rental balances, confirmed receipts, and expenses.</p></div><div class="finance-actions"><button type="button" class="secondary" data-finance-receipt>Record receipt</button><button type="button" class="primary" data-finance-expense>Record expense</button></div></div>
      <div class="finance-period"><label>Period<select id="finance-period">${[['today','Today'],['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days'],['month','This month'],['custom','Custom dates']].map(([id,label]) => `<option value="${id}" ${period === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>From<input type="date" id="finance-from" value="${e(from)}"/></label><span class="finance-date-separator" aria-hidden="true">→</span><label>To<input type="date" id="finance-to" value="${e(to)}"/></label><button class="secondary" data-finance-refresh ${loading ? 'disabled' : ''}>${loading ? 'Loading…' : 'Refresh'}</button></div></section>
      ${error ? `<div class="finance-error" role="alert">${e(error)} <button class="text-button" data-finance-refresh>Retry</button></div>` : ''}${summaryHtml()}
      <section class="panel finance-records"><div class="finance-tabs" role="tablist" aria-label="Payment records"><button role="tab" aria-selected="${tab === 'rentals'}" data-finance-tab="rentals">Rental payments</button><button role="tab" aria-selected="${tab === 'ledger'}" data-finance-tab="ledger">Receipts & expenses</button></div>
      <div class="finance-table-toolbar"><div><h3>${tab === 'rentals' ? 'Rental payment status' : 'Receipt ledger'}</h3><p>${tab === 'rentals' ? 'Rentals created within the selected dates. Saved paid amounts include historical payments.' : 'Money received, refunded, or spent within the selected dates.'}</p></div>${tab === 'rentals' ? `<form data-finance-search><input aria-label="Find rental reference" name="reference" value="${e(search)}" placeholder="Rental reference, e.g. R-0003"/><button class="secondary" ${loading ? 'disabled' : ''}>Find</button></form>` : `<div class="finance-ledger-filters"><label>Entry<select id="finance-type"><option value="">All entries</option>${[['COLLECTION','Collections'],['REFUND','Refunds'],['EXPENSE','Expenses'],['EXPENSE_REVERSAL','Expense reversals']].map(([id,label]) => `<option value="${id}" ${type === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Method<select id="finance-method"><option value="">Cash & QR</option>${['CASH','QR'].map(id => `<option ${method === id ? 'selected' : ''}>${id}</option>`).join('')}</select></label></div>`}</div>
      <div class="admin-table-scroll" role="region" aria-label="${tab === 'rentals' ? 'Rental payments' : 'Receipt ledger'}" tabindex="0"><table class="admin-table finance-table"><thead><tr>${heads.map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${heads.length}"><div class="finance-table-empty"><strong>${loading ? 'Loading payment records…' : error ? 'Could not load payment records' : tab === 'rentals' ? 'No rentals in this date range' : 'No dated receipts or expenses in this view'}</strong><span>${loading || error ? 'Please wait or retry the request.' : 'Try a wider date range or review the rental payments tab.'}</span></div></td></tr>`}</tbody></table></div><div class="module-pagination"><span>${loaded} ${loaded === 1 ? 'record' : 'records'} loaded · ${pageSize} per page</span><div><button class="secondary" data-finance-prev ${previous.length && !loading ? '' : 'disabled'}>Previous</button><button class="secondary" data-finance-next ${page?.nextCursor && !loading ? '' : 'disabled'}>Next</button></div></div></section><p class="finance-footnote">Rental charges are amounts owed. Dated collections are confirmed money received. Adding a historical receipt date does not add a second payment.</p></div>`;
  }
  function expenseForm() {
    const requestKey=operationKey();
    showModal('Record an expense paid',`<form class="admin-form"><p>Enter an amount that has actually been paid.</p><label>Amount (PHP)<input name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" required/></label><label>Category<select name="category">${['DELIVERY','MAINTENANCE','SUPPLIES','UTILITIES','OTHER'].map(value=>`<option>${value}</option>`).join('')}</select></label><label>Method<select name="paymentMethod"><option value="CASH">Cash · in person</option><option value="QR">QR transfer</option></select></label><label>Transfer reference<input name="reference" maxlength="150"/></label><label>Description<textarea name="notes" maxlength="500" required></textarea></label><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary">Save expense</button></div></form>`);
    const form=modal.querySelector('form');
    form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity()||form.inert)return;const fields=Object.fromEntries(new FormData(form));form.inert=true;try{await api('/finance/expenses',{method:'POST',body:JSON.stringify({...fields,amount:Number(fields.amount),requestKey})});modal.close();await load();toast('Expense recorded.');}catch(problem){form.querySelector('.form-error').textContent=problem.message;}finally{form.inert=false;}};
  }
  function receiptForm() {
    const requestKey=operationKey();
    showModal('Record rental payment received',`<form class="admin-form"><p>Record cash already received in person or a QR transfer you have confirmed. This action records money and keeps the rental’s current approval and delivery status.</p><label>Rental reference<input name="rentalCode" placeholder="R-0001" required maxlength="128"/></label><button type="button" class="secondary" data-find-rental>Find rental</button><p data-receipt-rental role="status">Find the rental before saving.</p><label>Amount received (PHP)<input name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" required/></label><label>Method<select name="paymentMethod"><option value="CASH">Cash · in person</option><option value="QR">QR transfer</option></select></label><label>Transfer reference<input name="reference" maxlength="150"/></label><label>Notes<textarea name="notes" maxlength="1000" required></textarea></label><label><input name="confirmed" type="checkbox" required/> I confirmed the money was received</label><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Back</button><button class="primary">Record receipt</button></div></form>`);
    const form=modal.querySelector('form');let rental=null,foundCode='';
    form.elements.rentalCode.oninput=()=>{rental=null;foundCode='';form.querySelector('[data-receipt-rental]').textContent='Find the rental before saving.';};
    form.querySelector('[data-find-rental]').onclick=async()=>{
      if(form.inert)return;form.inert=true;
      try{const code=form.elements.rentalCode.value.trim().toUpperCase();const result=await api('/rentals/lookup',{method:'POST',body:JSON.stringify({kind:'RENTAL',code})});rental=result.rental;foundCode=code;form.querySelector('[data-receipt-rental]').textContent=`${rental.rental_code} · ${rental.customer_name} · ${rental.item_name} · ${rental.status} · Outstanding ${rental.balance_due == null ? 'Needs review' : money(rental.balance_due)}`;form.querySelector('.form-error').textContent='';}catch(problem){form.querySelector('.form-error').textContent=problem.message;}finally{form.inert=false;}
    };
    form.onsubmit=async event=>{
      event.preventDefault();if(form.inert||!form.reportValidity())return;
      if(!rental||foundCode!==form.elements.rentalCode.value.trim().toUpperCase()){form.querySelector('.form-error').textContent='Find the rental first.';return;}
      form.inert=true;
      try{const fields=Object.fromEntries(new FormData(form));await api(`/rentals/${encodeURIComponent(rental.id)}/settlement`,{method:'POST',body:JSON.stringify({requestKey,paymentAmount:Number(fields.amount),paymentMethod:fields.paymentMethod,reference:fields.reference,notes:fields.notes})});modal.close();await load();toast('Payment receipt recorded.');}catch(problem){form.querySelector('.form-error').textContent=problem.message;}finally{form.inert=false;}
    };
  }
  function historicalForm(row) {
    const requestKey = operationKey();
    showModal('Confirm original payment receipt', `<form class="admin-form"><div class="finance-receipt-context"><strong>${e(row.rental_code)} · ${e(row.item_name)}</strong><p>${e(row.customer_name)}</p><p>This payment is already saved on the rental. Confirm its original receipt details; the rental’s paid amount will stay the same.</p></div><label>Saved payment to journal (PHP)<input value="${e(Number(row.finance.unposted_paid).toFixed(2))}" readonly/></label><label>Original receipt date & time (Philippine time)<input name="occurredAt" type="datetime-local" max="${e(manilaDateTimeInput())}" required/></label><label>Method<select name="paymentMethod"><option value="CASH" ${row.payment_method === 'CASH' ? 'selected' : ''}>Cash · in person</option><option value="QR" ${row.payment_method === 'QR' ? 'selected' : ''}>QR transfer</option></select></label><label>Transfer reference<input name="reference" maxlength="150"/></label><label>Evidence / notes<textarea name="notes" maxlength="500" required placeholder="Original receipt or payment confirmation checked"></textarea></label><label class="finance-confirmation"><input name="confirmed" type="checkbox" required/> I verified the original payment date, amount, and method.</label><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary">Confirm receipt details</button></div></form>`);
    const form = modal.querySelector('form');
    form.onsubmit = async event => {
      event.preventDefault(); if (form.inert || !form.reportValidity()) return;
      form.inert = true;
      try {
        const fields = Object.fromEntries(new FormData(form));
        await api(`/finance/rentals/${encodeURIComponent(row.id)}/receipt-history`, { method: 'POST', body: JSON.stringify({ ...fields, requestKey, amount: row.finance.unposted_paid, occurredAt: manilaDateTimeIso(fields.occurredAt), confirmed: fields.confirmed === 'on' }) });
        modal.close(); await load({ force: true }); toast('Original receipt saved. The rental payment was not duplicated.');
      } catch (problem) { form.querySelector('.form-error').textContent = problem.message; }
      finally { form.inert = false; }
    };
  }
  function bind(rerender) {
    redraw = rerender; if (!summary && !loading && !error) load();
    document.querySelector('[data-finance-receipt]')?.addEventListener('click', () => receiptForm());
    document.querySelector('[data-finance-expense]')?.addEventListener('click', expenseForm);
    document.querySelectorAll('[data-finance-refresh]').forEach(button => button.addEventListener('click', () => load({ force: true })));
    document.querySelector('[data-finance-review]')?.addEventListener('click', () => { tab = 'rentals'; search = ''; resetPage(); load(); });
    document.querySelector('#finance-period')?.addEventListener('change', event => { period = event.target.value; if (period === 'custom') return; ({ from, to } = financeDateRange(period)); resetPage(); summary = null; load(); });
    for (const field of ['from','to','type','method']) document.querySelector('#finance-' + field)?.addEventListener('change', event => {
      if (field === 'from') { from = event.target.value; period = 'custom'; }
      if (field === 'to') { to = event.target.value; period = 'custom'; }
      if (field === 'type') type = event.target.value;
      if (field === 'method') method = event.target.value;
      resetPage(); if (field === 'from' || field === 'to') summary = null; load();
    });
    document.querySelectorAll('[data-finance-tab]').forEach(button => button.addEventListener('click', () => { if (tab === button.dataset.financeTab) return; tab = button.dataset.financeTab; resetPage(); load(); }));
    document.querySelector('[data-finance-search]')?.addEventListener('submit', event => { event.preventDefault(); search = new FormData(event.currentTarget).get('reference').trim().toUpperCase(); if (search && !/^R-\d+$/.test(search)) { error = 'Use the rental reference, such as R-0003.'; redraw(); return; } resetPage(); load(); });
    document.querySelectorAll('[data-finance-history]').forEach(button => button.addEventListener('click', () => { const row = rentals.records.find(row => row.id === button.dataset.financeHistory); if (row) historicalForm(row); }));
    document.querySelectorAll('[data-finance-collect]').forEach(button => button.addEventListener('click', () => { receiptForm(); const input = modal.querySelector('[name="rentalCode"]'); input.value = button.dataset.financeCollect; modal.querySelector('[data-find-rental]').click(); }));
    document.querySelector('[data-finance-next]')?.addEventListener('click', () => { const page = tab === 'rentals' ? rentals : ledger; if (page?.nextCursor) { previous.push(cursor); cursor = page.nextCursor; load(); } });
    document.querySelector('[data-finance-prev]')?.addEventListener('click', () => { cursor = previous.pop() || ''; load(); });
  }
  return { render, bind, refresh: () => load({ force: true }), reset() { generation++; loading = false; summary = null; ledger = null; rentals = null; error = ''; cursor = ''; previous = []; } };
}
