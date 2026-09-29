import {analyticsRange,calculateAnalytics,analyticsCsv} from './analytics.js';
import {renderAnalyticsReport} from './analytics-report.js';
import {renderSettings,settingsTabs} from './settings-ui.js';
import {readPreferences,writePreferences,preferenceDefaults} from './preferences.js';

export function createWorkspaceUI(h) {
  const {api,escape:e,showModal,modal,toast,money,formatDate,icon}=h;
  let model=null,loading=null,search='',redraw=()=>{},pages={};
  const pageSize=5;
  let preferences=readPreferences();
  try{preferences=readPreferences(localStorage);}catch{}
  let settingsTab='business',businessDraft=null,businessDirty=false,businessSaving=false,preferencesDraft=null;
  const analyticsSelection={period:preferences.reportPeriod,from:'',to:'',categoryId:'',itemId:'',groupBy:preferences.reportGrouping};
  const reportView={section:'rental',sort:'rentals',details:{}};
  const activeRates=()=>model.rates.filter(rate=>rate.is_active!==false);
  const status=value=>`<span class="badge ${e(String(value||'unknown').toLowerCase().replaceAll('_','-'))}">${e(String(value||'Unknown').replaceAll('_',' '))}</span>`;
  const load=async(force=false)=>{if(model&&!force)return model;if(!loading||force)loading=api('/workspace').then(value=>(model=value));return loading;};
  const refresh=async()=>load(true);
  const empty=(title,text)=>`<div class="workspace-empty">${icon('box')}<h3>${e(title)}</h3><p>${e(text)}</p></div>`;
  const table=(heads,rows)=>`<div class="admin-table-scroll"><table class="admin-table"><thead><tr>${heads.map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const pageHeader=(eyebrow,title,text,action='')=>action?`<div class="module-heading module-actions">${action}</div>`:'';
  const includes=(row,keys)=>keys.some(key=>String(row[key]||'').toLowerCase().includes(search.toLowerCase()));
  const paged=(records,key)=>{const total=Math.max(1,Math.ceil(records.length/pageSize));pages[key]=Math.min(Math.max(0,pages[key]||0),total-1);const start=pages[key]*pageSize;return {rows:records.slice(start,start+pageSize),footer:`<div class="module-pagination"><span>${records.length?`${start+1}–${Math.min(start+pageSize,records.length)} of ${records.length}`:'0 records'} · Page ${records.length?pages[key]+1:0} of ${Math.ceil(records.length/pageSize)}</span><div><button class="secondary" data-pager-prev="${e(key)}" ${pages[key]?'':'disabled'}>← Previous</button><button class="secondary" data-pager-next="${e(key)}" ${start+pageSize<records.length?'':'disabled'}>Next →</button></div></div>`};};

  function customers() {
    const records=model.customers.filter(c=>includes(c,['full_name','customer_code','email','phone'])),view=paged(records,'Customers');
    return `<section class="panel admin-module"><div class="module-toolbar"><label class="module-search">${icon('search')}<input id="module-search" value="${e(search)}" placeholder="Search customers" aria-label="Search customers"/></label><div class="module-toolbar-actions"><span>${records.length} customer(s)</span><button class="primary" id="customer-add">+ Add customer</button></div></div>${records.length?table(['CUSTOMER','CONTACT','ADDRESS','STATUS',''],view.rows.map(c=>`<tr><td><strong>${e(c.full_name)}</strong><small>${e(c.customer_code)}</small></td><td>${e(c.email||'No email')}<small>${e(c.phone||'No phone')}</small></td><td>${e(c.address||'Not provided')}</td><td>${status(c.is_active===false?'Inactive':'Active')}</td><td><div class="row-actions"><button class="text-button" data-customer-edit="${e(c.id)}">Edit</button><button class="text-button" data-customer-action="${e(c.id)}">${c.is_active===false?'Restore':'Archive'}</button></div></td></tr>`).join('')):empty('No customers found','Add a customer or adjust your search.')}${records.length?view.footer:''}</section>`;
  }

  function customerForm(customer={}) {
    showModal(customer.id?'Edit customer':'Add customer',`<form id="customer-form" class="admin-form"><div class="form-grid"><label>Full name<input name="fullName" value="${e(customer.full_name||'')}" maxlength="150" required/></label><label>Customer code<input name="code" value="${e(customer.customer_code||'')}" pattern="[A-Za-z0-9][A-Za-z0-9_-]+" maxlength="50" placeholder="CUST-001" required/></label><label>Email<input type="email" name="email" value="${e(customer.email||'')}" maxlength="191"/></label><label>Phone<input name="phone" value="${e(customer.phone||'')}" maxlength="40"/></label></div><label>Address<textarea name="address" maxlength="500" rows="3">${e(customer.address||'')}</textarea></label><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save customer</button></div></form>`);
    modal.querySelector('[data-close]').onclick=()=>modal.close();
    modal.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]'),error=form.querySelector('.form-error');button.disabled=true;try{await api(customer.id?`/customers/${customer.id}`:'/customers',{method:customer.id?'PATCH':'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await refresh();modal.close();toast(customer.id?'Customer updated.':'Customer added.');redraw();}catch(problem){error.textContent=problem.message;button.disabled=false;}};
  }

  function transactions(mode) {
    let records=[...model.transactions];
    if(mode==='Returns')records=records.filter(r=>r.confirmed_return_at||/RETURN|COMPLETED/i.test(`${r.status} ${r.transaction_type||''}`));
    if(mode==='Rentals')records=records.filter(r=>['ACTIVE','PENDING_VERIFICATION'].includes(r.status));
    records=records.filter(r=>includes(r,['rental_code','item_name','customer_name','status']));const view=paged(records,mode);
    const title=mode==='Transaction History'?'Transaction History':mode;
    return `${pageHeader('TRANSACTION MONITORING',title,mode==='Returns'?'Track return confirmations and completed handoffs.':mode==='Rentals'?'Monitor open and pending rentals.':'Review every rental and return record.')}<section class="panel admin-module"><div class="module-toolbar"><label class="module-search">${icon('search')}<input id="module-search" value="${e(search)}" placeholder="Search transactions" aria-label="Search transactions"/></label><span>${records.length} record(s)</span></div>${records.length?table(['TRANSACTION','CUSTOMER','RENTAL DATE','DUE / RETURNED','STATUS','FEES'],view.rows.map(r=>`<tr><td><strong>${e(r.item_name)}</strong><small>${e(r.rental_code||r.id)} · ${e(r.item_code)}</small></td><td>${e(r.customer_name)}</td><td>${e(formatDate(r.confirmed_rental_at||r.created_at))}</td><td>${e(formatDate(r.confirmed_return_at||r.due_at))}</td><td>${status(r.status)}</td><td><strong>${money(r.rental_fee)}</strong><small>Deposit ${money(r.deposit_amount)}</small></td></tr>`).join('')):empty('No matching transactions','Records will appear after the mobile and terminal workflow creates them.')}${records.length?view.footer:''}</section>`;
  }

  function rates() {
    const allRates=activeRates(),current=allRates.filter(r=>includes(r,['item_name','item_code','rate_type'])),view=paged(current,'Rates & Fees');
    const pricing=model.pricing||{products:[],rules:{}},products=pricing.products||[],rules=pricing.rules||{};
    return `<div class="module-stats rates-overview"><article><span>Pricing products</span><strong>${products.length}</strong><small>Available for rental quotes</small></article><article><span>Service hours</span><strong class="rates-hours">${e(rules.opens_at||'08:00')}–${e(rules.closes_at||'20:00')}</strong><small>Daily operating window</small></article><article><span>Equipment rates</span><strong>${allRates.length}</strong><small>Active per-item rates</small></article></div><section class="panel admin-module"><div class="panel-title rates-panel-title"><div><h3>Equipment rates</h3><p>Per-item rates and their pricing history.</p></div><div class="pricing-actions"><button class="secondary" id="rate-preview">Preview quote</button><button class="primary" id="rate-catalog-edit">Pricing settings</button><button class="secondary" id="rate-add">Update equipment rate</button></div></div><div class="module-toolbar"><label class="module-search">${icon('search')}<input id="module-search" value="${e(search)}" placeholder="Search equipment rates"/></label><span>${current.length} active rate${current.length===1?'':'s'}</span></div>${current.length?table(['EQUIPMENT','BASIS','RENTAL RATE','DEPOSIT','LATE PENALTY','EFFECTIVE'],view.rows.map(r=>`<tr><td><strong>${e(r.item_name)}</strong><small>${e(r.item_code)}</small></td><td>${e(r.rate_type)}</td><td><strong>${money(r.rental_rate)}</strong></td><td>${money(r.deposit_amount)}</td><td>${money(r.late_penalty_rate)}</td><td>${e(formatDate(r.effective_from))}</td></tr>`).join('')):empty('No individual equipment rates','Add equipment in Inventory and set a per-item rate when needed. Use Pricing settings to manage quote prices and rental rules.')}${current.length?view.footer:''}</section>`;
  }

  function rateSheetForm() {
    const pricing=model.pricing;
    const field=(name,label,value,type='number',extra='')=>`<label>${e(label)}<input name="${e(name)}" type="${type}" value="${e(value)}" ${type==='number'?'min="0" max="9999999999.99" step="0.01" required':''} ${extra}/></label>`;
    const products=pricing.products.map(p=>`<details class="pricing-edit-product"><summary>${e(p.name)}${p.high_value?' · high-value':''}</summary><div class="pricing-edit-grid">${p.rate_options.map(rate=>field(`rate:${p.id}:${rate.id}`,rate.label+' price (₱)',rate.amount)).join('')}${p.sale_price!==null?field(`sale:${p.id}`,'Brand-new sale price (₱)',p.sale_price):''}${field(`deposit:${p.id}`,'Refundable deposit (₱)',p.deposit_amount)}${field(`overtime:${p.id}`,'Overtime per started hour (₱)',p.overtime_rate_per_hour)}</div><label>Included items<textarea name="includes:${e(p.id)}" rows="2" maxlength="1000">${e((p.included_items||[]).join(', '))}</textarea></label>${p.high_value?'<small>Bike and tech rentals require a deposit. Set the amount here before confirming rentals.</small>':''}</details>`).join('');
    showModal('Pricing settings',`<form id="pricing-form" class="admin-form pricing-form"><h3>Service and rental rules</h3><div class="form-grid">${field('opensAt','Opens daily','08:00','time','required')}${field('closesAt','Closes daily','20:00','time','required')}${field('lostPieceFee','Lost board-game piece fee (₱)',pricing.rules.lost_piece_fee)}${field('orderPhone','Call / Text / Viber number',pricing.rules.order_phone,'tel','maxlength="40" required')}</div><label>Other order method<textarea name="orderMethodNote" rows="2" maxlength="500">${e(pricing.rules.order_method_note)}</textarea></label><label class="pricing-check"><input name="validIdRequired" type="checkbox" ${pricing.rules.valid_id_required?'checked':''}/> Valid ID required for every rental</label><label class="pricing-check"><input name="highValueDepositRequired" type="checkbox" ${pricing.rules.high_value_deposit_required?'checked':''}/> Require deposit for bikes and tech</label><label>Overtime rule<textarea name="overtimeBasis" rows="2" maxlength="500">${e(pricing.rules.overtime_basis)}</textarea></label><label>Returns after closing<textarea name="afterHoursReturns" rows="2" maxlength="500">${e(pricing.rules.after_hours_returns)}</textarea></label><label>Whole-stay rule<textarea name="wholeStayBasis" rows="2" maxlength="500">${e(pricing.rules.whole_stay_basis)}</textarea></label><label>Bike safety reminder<textarea name="bikeSafety" rows="2" maxlength="500">${e(pricing.rules.bike_safety)}</textarea></label><label>Care and damage reminder<textarea name="careAndLoss" rows="2" maxlength="500">${e(pricing.rules.care_and_loss)}</textarea></label><label>Return reminder<textarea name="returnReminder" rows="2" maxlength="500">${e(pricing.rules.return_reminder)}</textarea></label><h3>Products, packages, and deposits</h3><p>Started rental blocks round up. Overtime defaults to the hourly-equivalent rate and can be changed per product. The text fields update displayed guidance; change each product’s overtime amount to change the charge.</p>${products}<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save pricing settings</button></div></form>`);
    modal.querySelector('[data-close]').onclick=()=>modal.close();
    const form=modal.querySelector('#pricing-form');
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('[type="submit"]'),error=form.querySelector('.form-error'),values=new FormData(form),next=JSON.parse(JSON.stringify(pricing));
      button.disabled=true;error.textContent='';
      next.rules={...next.rules,opens_at:values.get('opensAt'),closes_at:values.get('closesAt'),valid_id_required:values.has('validIdRequired'),high_value_deposit_required:values.has('highValueDepositRequired'),lost_piece_fee:Number(values.get('lostPieceFee')),order_phone:values.get('orderPhone'),order_method_note:values.get('orderMethodNote'),overtime_basis:values.get('overtimeBasis'),after_hours_returns:values.get('afterHoursReturns'),whole_stay_basis:values.get('wholeStayBasis'),bike_safety:values.get('bikeSafety'),care_and_loss:values.get('careAndLoss'),return_reminder:values.get('returnReminder')};
      for(const p of next.products){p.deposit_amount=Number(values.get(`deposit:${p.id}`));p.overtime_rate_per_hour=Number(values.get(`overtime:${p.id}`));p.included_items=String(values.get(`includes:${p.id}`)||'').split(',').map(v=>v.trim()).filter(Boolean);if(p.sale_price!==null)p.sale_price=Number(values.get(`sale:${p.id}`));for(const rate of p.rate_options)rate.amount=Number(values.get(`rate:${p.id}:${rate.id}`));}
      try{const result=await api('/pricing',{method:'PUT',body:JSON.stringify(next)});model.pricing=result.pricing;modal.close();toast('Pricing settings saved.');redraw();}
      catch(problem){error.textContent=problem.message;button.disabled=false;}
    };
  }

  function quoteForm() {
    const products=model.pricing.products,first=products[0],localDateTime=value=>{const date=value?new Date(value):new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
    showModal('Preview a rental quote',`<form id="quote-form" class="admin-form"><label>Physical equipment (optional)<select name="itemId"><option value="">Quote by pricing product</option>${model.items.filter(i=>i.is_active!==false).map(i=>`<option value="${e(i.id)}">${e(i.name)} · ${e(i.item_code)}${i.pricing_product_id?'':' · not linked'}</option>`).join('')}</select><small>Choosing equipment checks that it is available and linked to a pricing product.</small></label><label>Rental product<select name="productId">${products.map(p=>`<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}</select></label><label>Rental starts<input name="startAt" type="datetime-local" value="${e(localDateTime())}" required/></label><label>Pricing option<select name="mode"><option value="TIMED">Timed rental</option><option value="WHOLE_STAY" disabled>Whole stay until resort checkout</option></select></label><label id="quote-duration-wrap">Requested duration (minutes)<input name="durationMinutes" type="number" min="1" max="10080" value="60" required/><small>Each started rate block is charged in full. Packages are applied when they lower the price.</small></label><label id="quote-checkout-wrap" hidden>Guest resort checkout<input name="resortCheckoutAt" type="datetime-local" value="${e(localDateTime(new Date(Date.now()+86400000)))}"/></label><label>Actual return time (optional)<input name="actualReturnAt" type="datetime-local"/><small>Enter this to preview overtime after the due time.</small></label><div id="quote-result" class="quote-result" hidden></div><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Close</button><button class="primary" type="submit">Calculate quote</button></div></form>`);
    modal.querySelector('[data-close]').onclick=()=>modal.close();
    const form=modal.querySelector('#quote-form'),productSelect=form.elements.productId,itemSelect=form.elements.itemId,modeSelect=form.elements.mode,durationWrap=form.querySelector('#quote-duration-wrap'),checkoutWrap=form.querySelector('#quote-checkout-wrap'),result=modal.querySelector('#quote-result');
    const sync=()=>{const selected=products.find(p=>p.id===productSelect.value)||first,hasWholeStay=selected.rate_options.some(rate=>rate.kind==='WHOLE_STAY'),wholeOption=modeSelect.querySelector('[value="WHOLE_STAY"]');wholeOption.disabled=!hasWholeStay;if(!hasWholeStay&&modeSelect.value==='WHOLE_STAY')modeSelect.value='TIMED';const whole=modeSelect.value==='WHOLE_STAY';durationWrap.hidden=whole;checkoutWrap.hidden=!whole;form.elements.durationMinutes.required=!whole;form.elements.resortCheckoutAt.required=whole;};
    itemSelect.onchange=()=>{const item=model.items.find(row=>row.id===itemSelect.value);if(item?.pricing_product_id)productSelect.value=item.pricing_product_id;sync();};productSelect.onchange=sync;modeSelect.onchange=sync;sync();
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('[type="submit"]'),error=form.querySelector('.form-error'),dateIso=name=>form.elements[name].value?new Date(form.elements[name].value).toISOString():undefined;
      const payload={productId:productSelect.value,itemId:itemSelect.value||undefined,mode:modeSelect.value,startAt:dateIso('startAt'),actualReturnAt:dateIso('actualReturnAt')};if(modeSelect.value==='WHOLE_STAY')payload.resortCheckoutAt=dateIso('resortCheckoutAt');else payload.durationMinutes=Number(form.elements.durationMinutes.value);
      button.disabled=true;error.textContent='';result.hidden=true;
      try{const response=await api('/pricing/quote',{method:'POST',body:JSON.stringify(payload)}),q=response.quote;result.innerHTML=`<h3>${e(q.product_name)} · ${e(q.rate_label)}</h3><dl><dt>Rental fee</dt><dd>${money(q.rental_fee)}</dd><dt>Overtime</dt><dd>${money(q.overtime_fee)}${q.overtime_blocks?` · ${q.overtime_blocks} started hour(s)`:''}</dd><dt>Rental charges</dt><dd>${money(q.rental_charge_total)}</dd><dt>Refundable deposit</dt><dd>${money(q.deposit_amount)}${q.deposit_required?' · required':''}</dd><dt>Collect now</dt><dd><strong>${money(q.total_to_collect)}</strong></dd><dt>Due time</dt><dd>${e(formatDate(q.due_at))}</dd><dt>ID</dt><dd>${q.valid_id_required?'Valid ID required':'ID not required'}</dd></dl>${q.warnings.map(w=>`<p class="quote-warning">${e(w)}</p>`).join('')}<p>${e(q.reminders.bike_safety||'')}</p><p>${e(q.reminders.care_and_loss)} ${e(q.reminders.return)}</p><p>${e(q.after_hours_return_note)}</p>`;result.hidden=false;}
      catch(problem){error.textContent=problem.message;}
      finally{button.disabled=false;}
    };
  }

  function rateForm() {
    const items=model.items.filter(i=>i.is_active!==false).sort((a,b)=>a.name.localeCompare(b.name));
    showModal('Update equipment rate',`<form id="rate-form" class="admin-form"><label>Equipment<select name="itemId" required><option value="">Select equipment</option>${items.map(i=>`<option value="${e(i.id)}">${e(i.name)} · ${e(i.item_code)}</option>`).join('')}</select></label><div class="form-grid"><label>Rate basis<select name="rateType"><option>DAILY</option><option>HOURLY</option><option>FLAT</option></select></label><label>Rental rate<input name="rentalRate" type="number" min="0" step="0.01" required/></label><label>Refundable deposit<input name="deposit" type="number" min="0" step="0.01" value="0"/></label><label>Late penalty<input name="latePenalty" type="number" min="0" step="0.01" value="0"/></label></div><div class="info-box">The previous active rate will be closed and kept in pricing history.</div><p class="form-error"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save new rate</button></div></form>`);
    modal.querySelector('[data-close]').onclick=()=>modal.close();modal.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;try{await api('/rates',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await refresh();modal.close();toast('Rate updated.');redraw();}catch(problem){form.querySelector('.form-error').textContent=problem.message;}};
  }

  function maintenance() {
    const open=model.maintenance.filter(r=>r.status==='IN_PROGRESS'),done=model.maintenance.filter(r=>r.status==='COMPLETED'),view=paged(model.maintenance,'Maintenance');
    return `<div class="module-stats"><article><span>In progress</span><strong>${open.length}</strong></article><article><span>Completed</span><strong>${done.length}</strong></article><article><span>Total records</span><strong>${model.maintenance.length}</strong></article></div><section class="panel admin-module"><div class="panel-title"><div><h3>Service log</h3><p>Inspection and repair history.</p></div><button class="secondary" data-page="Inventory">Open equipment</button></div>${model.maintenance.length?table(['EQUIPMENT','REASON','STARTED','COMPLETED','STATUS'],view.rows.map(r=>`<tr><td><strong>${e(r.item_name)}</strong><small>${e(r.item_code)}</small></td><td>${e(r.reason||'Equipment inspection')}<small>${e(r.details||'No notes')}</small></td><td>${e(formatDate(r.started_at))}</td><td>${e(formatDate(r.completed_at))}</td><td>${status(r.status)}</td></tr>`).join('')):empty('No maintenance records','Start maintenance from an equipment detail screen.')}${model.maintenance.length?view.footer:''}</section>`;
  }

  function reports() {
    return renderAnalyticsReport(model,analyticsSelection,reportView,{escape:e,paged,table});
  }

  function settings(user,appearance) {
    return renderSettings({model,user,appearance,tab:settingsTab,draft:businessDraft,dirty:businessDirty,saving:businessSaving,preferences:preferencesDraft||preferences,users:()=>users(user.id)},{escape:e,icon});
  }

  function users(currentUserId) {
    const view=paged(model.users,'Users');return `<section class="panel settings-card settings-users"><div class="settings-title"><div><span class="eyebrow">TEAM ACCESS</span><h3>Users</h3></div><button class="secondary" id="user-add">Add user</button></div>${model.users.length?table(['USER','ROLE','LAST LOGIN','STATUS',''],view.rows.map(u=>`<tr><td><strong>${e(u.full_name)}</strong><small>${e(u.email)}</small></td><td>${e(u.role)}</td><td>${e(formatDate(u.last_login_at))}</td><td>${status(u.is_active===false?'Inactive':'Active')}</td><td>${String(u.id)===String(currentUserId)?'<span class="settings-current-user">Your account</span>':`<button class="text-button" data-user-toggle="${e(u.id)}">${u.is_active===false?'Activate':'Deactivate'}</button>`}</td></tr>`).join('')):empty('No workspace users','Add an owner or operator account.')}${model.users.length?view.footer:''}</section>`;
  }

  function userForm() {showModal('Add workspace user',`<form id="user-form" class="admin-form"><label>Full name<input name="fullName" required maxlength="150"/></label><label>Email<input name="email" type="email" required maxlength="191"/></label><label>Role<select name="role"><option>OPERATOR</option><option>OWNER</option></select></label><label>Temporary password<input name="password" type="password" minlength="12" required/><small>Minimum 12 characters. Ask the user to reset it after signing in.</small></label><p class="form-error"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Create user</button></div></form>`);modal.querySelector('[data-close]').onclick=()=>modal.close();modal.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;try{await api('/users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await refresh();modal.close();toast('User created.');redraw();}catch(problem){form.querySelector('.form-error').textContent=problem.message;}};}

  function render(page,user,appearance) {if(!model)return `<section class="panel module-loading"><span class="session-spinner"></span><p>Loading ${e(page.toLowerCase())}…</p></section>`;if(page==='Customers')return customers();if(['Rentals','Returns','Transaction History'].includes(page))return transactions(page);if(page==='Rates & Fees')return rates();if(page==='Maintenance')return maintenance();if(page==='Reports')return reports();if(page==='Settings')return settings(user,appearance);return ''}

  function bind(page,user,rerender) {
    if(!['Customers','Rates & Fees','Rentals','Returns','Transaction History','Maintenance','Reports','Settings'].includes(page))return;
    redraw=rerender;
    if(!model){load().then(rerender).catch(problem=>toast(problem.message));return;}
    const searchBox=document.querySelector('#module-search');if(searchBox)searchBox.oninput=event=>{search=event.target.value;pages[page]=0;rerender();document.querySelector('#module-search')?.focus();};
    document.querySelectorAll('[data-pager-prev]').forEach(button=>button.onclick=()=>{pages[button.dataset.pagerPrev]=Math.max(0,(pages[button.dataset.pagerPrev]||0)-1);rerender();});document.querySelectorAll('[data-pager-next]').forEach(button=>button.onclick=()=>{pages[button.dataset.pagerNext]=(pages[button.dataset.pagerNext]||0)+1;rerender();});
    document.querySelector('#customer-add')?.addEventListener('click',()=>customerForm());document.querySelectorAll('[data-customer-edit]').forEach(button=>button.onclick=()=>customerForm(model.customers.find(c=>c.id===button.dataset.customerEdit)));
    document.querySelectorAll('[data-customer-action]').forEach(button=>button.onclick=async()=>{const c=model.customers.find(v=>v.id===button.dataset.customerAction);await api(`/customers/${c.id}`,{method:'PATCH',body:JSON.stringify({action:c.is_active===false?'restore':'archive'})});await refresh();toast(c.is_active===false?'Customer restored.':'Customer archived.');rerender();});
    document.querySelector('#rate-add')?.addEventListener('click',rateForm);
    document.querySelector('#rate-catalog-edit')?.addEventListener('click',rateSheetForm);
    document.querySelector('#rate-preview')?.addEventListener('click',quoteForm);
    const switchSettingsTab=next=>{settingsTab=next;rerender();document.querySelector(`[data-settings-tab="${next}"]`)?.focus();};
    document.querySelectorAll('[data-settings-tab]').forEach(button=>{
      button.onclick=()=>switchSettingsTab(button.dataset.settingsTab);
      button.onkeydown=event=>{const tabs=settingsTabs(user.role==='OWNER'),index=tabs.findIndex(row=>row.id===button.dataset.settingsTab);let target;
        if(event.key==='ArrowRight')target=(index+1)%tabs.length;
        if(event.key==='ArrowLeft')target=(index+tabs.length-1)%tabs.length;
        if(event.key==='Home')target=0;if(event.key==='End')target=tabs.length-1;
        if(target!==undefined){event.preventDefault();switchSettingsTab(tabs[target].id);}
      };
    });
    const businessForm=document.querySelector('#business-form');
    businessForm?.addEventListener('input',()=>{businessDraft=Object.fromEntries(new FormData(businessForm));businessDirty=true;businessForm.querySelector('.settings-draft-note').textContent='You have unsaved changes. Your draft is kept while switching tabs.';businessForm.querySelector('#business-discard').disabled=false;});
    document.querySelector('#business-discard')?.addEventListener('click',()=>{businessDraft=null;businessDirty=false;rerender();toast('Unsaved business changes discarded.');});
    businessForm?.addEventListener('submit',async event=>{
      event.preventDefault();if(businessSaving)return;
      const values=Object.fromEntries(new FormData(businessForm)),button=businessForm.querySelector('[type="submit"]');
      businessSaving=true;businessDraft=values;businessForm.querySelector('fieldset').disabled=true;businessForm.querySelector('.form-error').textContent='';button.textContent='Saving…';
      try{const saved=await api('/settings',{method:'PATCH',body:JSON.stringify(values)});model.settings=saved.settings||saved;businessDraft=null;businessDirty=false;businessSaving=false;toast('Business settings saved.');rerender();}
      catch(problem){businessSaving=false;if(businessForm.isConnected){businessForm.querySelector('fieldset').disabled=false;button.textContent='Save business settings';businessForm.querySelector('.form-error').textContent=problem.message;}else{rerender();toast(problem.message);}}
    });
    const preferencesForm=document.querySelector('#preferences-form');
    const preferenceValues=()=>({autoRefresh:preferencesForm.elements.autoRefresh.checked,reportPeriod:preferencesForm.elements.reportPeriod.value,reportGrouping:preferencesForm.elements.reportGrouping.value});
    preferencesForm?.addEventListener('input',()=>{preferencesDraft=preferenceValues();});
    document.querySelector('#preferences-reset')?.addEventListener('click',()=>{preferencesDraft={...preferenceDefaults};rerender();toast('Default values selected. Save preferences to apply.');});
    preferencesForm?.addEventListener('submit',event=>{event.preventDefault();try{preferences=writePreferences(localStorage,preferenceValues());preferencesDraft=null;Object.assign(analyticsSelection,{period:preferences.reportPeriod,groupBy:preferences.reportGrouping});for(const key of Object.keys(pages))if(key.startsWith('analytics-'))pages[key]=0;toast('Preferences saved on this browser.');rerender();}catch{preferencesForm.querySelector('.form-error').textContent='This browser cannot save preferences. Allow site storage, then try again.';}});
    document.querySelector('#settings-password-reset')?.addEventListener('click',async event=>{
      const button=event.currentTarget,message=document.querySelector('.settings-security-status');button.disabled=true;message.textContent='Requesting reset email…';
      try{await api('/auth/password-reset',{method:'POST',body:JSON.stringify({email:user.email})});message.textContent='Reset email requested. Check your inbox and spam folder.';toast('Password reset email requested.');}
      catch(problem){message.textContent=problem.message;button.disabled=false;}
    });
    document.querySelector('#user-add')?.addEventListener('click',userForm);document.querySelectorAll('[data-user-toggle]').forEach(button=>button.onclick=async()=>{const u=model.users.find(v=>v.id===button.dataset.userToggle);button.disabled=true;try{await api(`/users/${u.id}`,{method:'PATCH',body:JSON.stringify({role:u.role,isActive:u.is_active===false})});await refresh();toast('User access updated.');rerender();}catch(problem){button.disabled=false;toast(problem.message);}});
    const updateAnalytics=()=>{for(const key of Object.keys(pages))if(key.startsWith('analytics-'))pages[key]=0;rerender();};
    const selectAnalyticsTab=section=>{reportView.section=section;rerender();document.querySelector(`[data-analytics-tab="${section}"]`)?.focus();};
    const analyticsTabs=[...document.querySelectorAll('[data-analytics-tab]')];
    analyticsTabs.forEach(button=>{
      button.onclick=()=>selectAnalyticsTab(button.dataset.analyticsTab);
      button.onkeydown=event=>{
        const index=analyticsTabs.indexOf(button);let target;
        if(event.key==='ArrowRight')target=(index+1)%analyticsTabs.length;
        if(event.key==='ArrowLeft')target=(index+analyticsTabs.length-1)%analyticsTabs.length;
        if(event.key==='Home')target=0;if(event.key==='End')target=analyticsTabs.length-1;
        if(target!==undefined){event.preventDefault();selectAnalyticsTab(analyticsTabs[target].dataset.analyticsTab);}
      };
    });
    document.querySelector('#analytics-period')?.addEventListener('change',event=>{analyticsSelection.period=event.target.value;if(analyticsSelection.period==='custom'&&(!analyticsSelection.from||!analyticsSelection.to)){const range=analyticsRange({period:'30d'});analyticsSelection.from=range.from;analyticsSelection.to=range.to;}updateAnalytics();});
    for(const field of ['from','to'])document.querySelector('#analytics-'+field)?.addEventListener('change',event=>{analyticsSelection[field]=event.target.value;updateAnalytics();});
    document.querySelector('#analytics-group')?.addEventListener('change',event=>{analyticsSelection.groupBy=event.target.value;updateAnalytics();});
    document.querySelector('#analytics-category')?.addEventListener('change',event=>{analyticsSelection.categoryId=event.target.value;analyticsSelection.itemId='';updateAnalytics();});
    document.querySelector('#analytics-item')?.addEventListener('change',event=>{analyticsSelection.itemId=event.target.value;updateAnalytics();});
    document.querySelector('#analytics-sort')?.addEventListener('change',event=>{reportView.sort=event.target.value;pages['analytics-equipment']=0;rerender();});
    document.querySelectorAll('[data-analytics-detail]').forEach(detail=>detail.addEventListener('toggle',()=>{if(detail.isConnected)reportView.details[detail.dataset.analyticsDetail]=detail.open;}));
    document.querySelector('#report-export')?.addEventListener('click',()=>{
      const result=calculateAnalytics(model,analyticsSelection);if(result.error){toast(result.error);return;}
      const csv=analyticsCsv(result,model,analyticsSelection),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
      link.href=url;link.download='rent-and-play-analytics-'+result.range.from+'-to-'+result.range.to+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Complete filtered analytics exported.');
    });
  }
  return {load,refresh,render,bind,autoRefreshEnabled:()=>preferences.autoRefresh,business:()=>model?.settings||{},reset:()=>{model=null;loading=null;businessDraft=null;businessDirty=false;businessSaving=false;preferencesDraft=null;settingsTab='business';pages={};}};
}
