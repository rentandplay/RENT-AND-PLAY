export function createRentalPlanning(h) {
  const {api,escape:e,money,formatDate,showModal,modal,toast,refresh,redraw}=h;
  const operationKey=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
  function form(title,html,save) {
    showModal(title,`<form class="admin-form"><p>Local delivery within Lakewood Subdivision, Los Baños, Laguna.</p>${html}<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Back</button><button class="primary">Confirm</button></div></form>`);
    const element=modal.querySelector('form'), requestKey=operationKey();
    element.onsubmit=async event=>{event.preventDefault();if(element.inert||!element.reportValidity())return;const fields=Object.fromEntries(new FormData(element));element.inert=true;try{await save(fields,requestKey);modal.close();try{await refresh();}catch{toast('Saved. Refresh the list to see the latest state.');}redraw();}catch(error){element.querySelector('.form-error').textContent=error.message;}finally{element.inert=false;}};
  }
  function deliveryForm(row) {
    const failed=row.delivery_status==='DELIVERY_FAILED';
    form('Local delivery progress',`<strong>${e(row.item_name)} · ${e(row.rental_code)}</strong><p>${e(row.delivery_location)}</p>${failed?'<input type="hidden" name="action" value="RETURN_TO_SHOP"/><label>Exact unit QR or equipment code<input name="inventoryCode" required/></label><label>Manual lookup reason (when entering an equipment code)<input name="manualReason" maxlength="1000"/></label><label>Condition<select name="condition"><option>GOOD</option><option>FAIR</option><option value="DAMAGED">Damaged</option><option value="NEEDS_INSPECTION">Needs inspection</option></select></label><label>Condition notes<textarea name="notes" maxlength="2000"></textarea></label><label><input type="checkbox" name="physicalReceiptConfirmed" required/> Equipment is physically back at the shop</label>':`<label>Action<select name="action">${row.delivery_status==='PREPARED'?'<option value="DEPART">Equipment is on the way</option>':''}<option value="FAIL">Delivery could not be completed</option></select></label><label>Reason if unsuccessful<textarea name="reason" maxlength="1000"></textarea></label><p>The rental timer starts at customer handoff. Equipment in transit stays reserved.</p>`}`,async(fields,key)=>{await api(`/rentals/${encodeURIComponent(row.id)}/delivery`,{method:'POST',body:JSON.stringify({...fields,requestKey:key,physicalReceiptConfirmed:fields.physicalReceiptConfirmed==='on'})});toast('Delivery progress recorded.');});
  }
  function extensionForm(row) {
    const request=row.extension_request;
    if(!request||request.status!=='PENDING'){toast('No pending extension.');return;}
    form('Review rental extension',`<strong>${e(row.rental_code)} · ${e(row.customer_name)}</strong><dl class="record-fields"><div><dt>Current due time</dt><dd>${e(formatDate(request.original_due_at))}</dd></div><div><dt>New due time</dt><dd>${e(formatDate(request.requested_due_at))}</dd></div><div><dt>Additional charge</dt><dd>${e(money(request.additional_fee))}</dd></div></dl><p>Approval checks the next reservation again. Collect the added balance in person or verify its QR transfer through the rental payment action.</p><label>Decision<select name="action"><option>APPROVE</option><option>REJECT</option></select></label><label>Reason if rejected<textarea name="reason" maxlength="1000"></textarea></label>`,async fields=>{await api(`/rentals/${encodeURIComponent(row.id)}/extension-review`,{method:'POST',body:JSON.stringify({...fields,requestKey:request.request_key})});toast('Extension reviewed.');});
  }
  function requestExtension(row) {
    let quote=null;
    form('Additional rental time',`<strong>${e(row.rental_code)} · ${e(row.customer_name)}</strong><label>Additional minutes<input name="additionalMinutes" type="number" min="15" max="10080" step="1" value="60" required/></label><button type="button" class="secondary" data-extension-quote>Review price & availability</button><p data-extension-price role="status">Review the additional price before submitting.</p><label><input name="customerAgreed" type="checkbox" required/> The customer requested this extension and agreed to the additional charge</label>`,async(fields,requestKey)=>{
      if(!quote||quote.minutes!==Number(fields.additionalMinutes))throw new Error('Review the extension price first.');
      await api(`/rentals/${encodeURIComponent(row.id)}/extension`,{method:'POST',body:JSON.stringify({requestKey,additionalMinutes:Number(fields.additionalMinutes),expectedAdditionalFee:quote.additional_fee,customerRequestedExtension:fields.customerAgreed==='on'})});toast('Extension requested. Review it to confirm the new due time.');
    });
    const element=modal.querySelector('form'),button=element.querySelector('.primary'),preview=element.querySelector('[data-extension-quote]');
    const quoteKey=operationKey();button.disabled=true;
    element.elements.additionalMinutes.oninput=()=>{quote=null;button.disabled=true;element.querySelector('[data-extension-price]').textContent='Review the updated duration first.';};
    preview.onclick=async()=>{
      if(preview.disabled)return;preview.disabled=true;const minutes=Number(element.elements.additionalMinutes.value);
      try{const result=await api(`/rentals/${encodeURIComponent(row.id)}/extension-quote`,{method:'POST',body:JSON.stringify({requestKey:quoteKey,additionalMinutes:minutes})});if(!element.isConnected||Number(element.elements.additionalMinutes.value)!==minutes)return;quote={...result.quote,minutes};element.querySelector('[data-extension-price]').textContent=`Additional charge ${money(quote.additional_fee)} · Added time ${quote.billed_minutes} minutes · New due time ${formatDate(quote.due_at)}`;button.disabled=false;element.querySelector('.form-error').textContent='';}catch(error){element.querySelector('.form-error').textContent=error.message;}finally{preview.disabled=false;}
    };
  }
  function calendar(rows=[],day='') {
    const planned=rows.filter(row=>row.scheduled_start_at&&['PENDING_ADMIN_APPROVAL','APPROVED'].includes(row.status)).sort((a,b)=>String(a.scheduled_start_at).localeCompare(String(b.scheduled_start_at)));
    return `<section class="panel local-delivery-plan"><div class="panel-title"><div><h3>Local delivery & rental plan</h3><p>Lakewood Subdivision only · scheduled rentals in this view. Prepare within 10 minutes of the selected time.</p></div><label>Scheduled day<input type="date" id="delivery-calendar-day" value="${e(day)}"/></label></div>${planned.length?`<div class="delivery-plan-list">${planned.map(row=>`<button class="secondary" data-transaction-detail="${e(row.id)}"><strong>${e(formatDate(row.scheduled_start_at))}</strong><span>${e(row.item_name)} · ${e(row.customer_name)}</span><small>${e(row.delivery_location)} · ${e(row.status==='APPROVED'?'Confirmed schedule':'Waiting for review')}</small></button>`).join('')}</div>`:'<p>No scheduled handoffs on this page.</p>'}</section>`;
  }
  return {calendar,deliveryForm,extensionForm,requestExtension,bind(){}};
}
