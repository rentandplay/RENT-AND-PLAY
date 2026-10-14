export function createFinanceUI(h) {
  const {api,escape:e,money,formatDate,showModal,modal,toast}=h;
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let summary=null,ledger=null,error='',loading=null,generation=0,cursor='',previous=[],redraw=()=>{},from=today(),to=today(),type='',method='';
  const operationKey=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const query=()=>new URLSearchParams({from,to}).toString();
  async function load() {
    const version=++generation;
    const request=Promise.all([api('/finance/summary?'+query()),api('/finance/ledger?'+new URLSearchParams({limit:'25',from,to,...(type?{type}:{}),...(method?{method}:{}),...(cursor?{cursor}:{} )}))]).then(([a,b])=>{if(version===generation){summary=a;ledger=b;error='';}}).catch(problem=>{if(version===generation)error=problem.message;}).finally(()=>{if(version===generation){loading=null;redraw();}});
    loading=request;return request;
  }
  const metric=(label,value,note)=>`<article><span>${e(label)}</span><strong>${e(money(value))}</strong><small>${e(note)}</small></article>`;
  function summaryHtml() {
    if (!summary) return `<p role="status">${error?e(error):'Loading recorded payments…'}</p>`;
    const t=summary.totals, max=Math.max(1,...summary.daily.map(row=>Number(row.collections||0)));
    return `<div class="module-stats finance-metrics">${metric('Collected',t.collections,'Verified cash and QR receipts')}${metric('Refunded',t.refunds,'Recorded money returned')}${metric('Expenses paid',t.expenses,'Recorded expenses only')}${metric('Net collected',t.net_collected,'Collections less refunds')}${metric('Net cash recorded',t.cash_net_movement,'Cash receipts less cash refunds and expenses')}${metric('After recorded expenses',t.net_after_expenses,'Net collected less recorded expenses')}</div><div class="finance-chart" role="img" aria-label="Recorded collections by day">${summary.daily.map(row=>`<div title="${e(row.business_day)}: ${e(money(row.collections||0))}"><i style="height:${Math.max(2,Number(row.collections||0)/max*100)}%"></i><small>${e(row.business_day.slice(5))}</small></div>`).join('')}</div><p class="muted">${e(summary.basis)}</p>`;
  }
  function render() {
    return `<section class="panel admin-module finance-page"><div class="panel-title"><div><h3>Payments & expenses</h3><p>Record money received in person or confirmed through QR. Each receipt links to its rental.</p></div><div class="form-actions"><button type="button" class="secondary" data-finance-receipt>Record receipt</button><button type="button" class="primary" data-finance-expense>Record expense</button></div></div><div class="finance-filters"><label>Summary from<input type="date" id="finance-from" value="${e(from)}"/></label><label>Summary to<input type="date" id="finance-to" value="${e(to)}"/></label><button class="secondary" data-finance-refresh>Refresh</button></div>${error?`<p class="form-error" role="alert">${e(error)}</p>`:''}${summaryHtml()}<div class="finance-filters"><label>Entries<select id="finance-type"><option value="">All entries</option>${['COLLECTION','REFUND','EXPENSE'].map(value=>`<option value="${value}" ${type===value?'selected':''}>${value.replaceAll('_',' ')}</option>`).join('')}</select></label><label>Method<select id="finance-method"><option value="">Cash & QR</option>${['CASH','QR'].map(value=>`<option ${method===value?'selected':''}>${value}</option>`).join('')}</select></label></div><p>Ledger entries follow the selected dates. Balances and refunds are handled from each rental’s payment action.</p><div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>RECEIPT / RENTAL</th><th>ENTRY</th><th>AMOUNT</th><th>RECORDED BY</th></tr></thead><tbody>${(ledger?.entries||[]).map(row=>`<tr><td><strong>${e(row.ledger_code)}</strong><small>${e(row.rental_code||(row.rental_id?'Rental reference unavailable':row.category||'Business expense'))} · ${e(formatDate(row.occurred_at))}</small><small>${e(row.reference||row.notes||'')}</small></td><td>${e(row.type)}<small>${e(row.payment_method==='CASH'?'Cash · in person':'QR transfer')}</small></td><td>${e(money(row.amount))}</td><td>${e(row.recorded_by_name||'Staff')}</td></tr>`).join('')||'<tr><td colspan="4">No receipts recorded in this view.</td></tr>'}</tbody></table></div><div class="module-pagination"><span>25 entries per page</span><div><button class="secondary" data-finance-prev ${previous.length?'':'disabled'}>Previous</button><button class="secondary" data-finance-next ${ledger?.nextCursor?'':'disabled'}>Next</button></div></div></section>`;
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
      try{const code=form.elements.rentalCode.value.trim().toUpperCase();const result=await api('/rentals/lookup',{method:'POST',body:JSON.stringify({kind:'RENTAL',code})});rental=result.rental;foundCode=code;form.querySelector('[data-receipt-rental]').textContent=`${rental.rental_code} · ${rental.customer_name} · ${rental.item_name} · ${rental.status} · Outstanding ${money(rental.balance_due)}`;form.querySelector('.form-error').textContent='';}catch(problem){form.querySelector('.form-error').textContent=problem.message;}finally{form.inert=false;}
    };
    form.onsubmit=async event=>{
      event.preventDefault();if(form.inert||!form.reportValidity())return;
      if(!rental||foundCode!==form.elements.rentalCode.value.trim().toUpperCase()){form.querySelector('.form-error').textContent='Find the rental first.';return;}
      form.inert=true;
      try{const fields=Object.fromEntries(new FormData(form));await api(`/rentals/${encodeURIComponent(rental.id)}/settlement`,{method:'POST',body:JSON.stringify({requestKey,paymentAmount:Number(fields.amount),paymentMethod:fields.paymentMethod,reference:fields.reference,notes:fields.notes})});modal.close();await load();toast('Payment receipt recorded.');}catch(problem){form.querySelector('.form-error').textContent=problem.message;}finally{form.inert=false;}
    };
  }
  function bind(rerender) {
    redraw=rerender;if(!summary&&!loading&&!error)load();
    document.querySelector('[data-finance-receipt]')?.addEventListener('click',receiptForm);
    document.querySelector('[data-finance-expense]')?.addEventListener('click',expenseForm);
    document.querySelector('[data-finance-refresh]')?.addEventListener('click',()=>load());
    for(const field of ['from','to','type','method'])document.querySelector('#finance-'+field)?.addEventListener('change',event=>{if(field==='from')from=event.target.value;if(field==='to')to=event.target.value;if(field==='type')type=event.target.value;if(field==='method')method=event.target.value;previous=[];cursor='';summary=null;ledger=null;load();});
    document.querySelector('[data-finance-next]')?.addEventListener('click',()=>{if(ledger?.nextCursor){previous.push(cursor);cursor=ledger.nextCursor;load();}});
    document.querySelector('[data-finance-prev]')?.addEventListener('click',()=>{cursor=previous.pop()||'';load();});
  }
  return {render,bind,refresh:load,reset(){generation++;loading=null;summary=null;ledger=null;error='';cursor='';previous=[];}};
}
