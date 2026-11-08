// Keep native constraints and domain validators; add consistent, accessible feedback.
export function installFormUX(root) {
  const owned = new WeakMap();
  let nextId = 0;
  const isControl = node => node?.matches?.('input:not([type=hidden]),select,textarea');
  const eligible = field => !field.disabled && !field.closest('[hidden]') && field.willValidate !== false;
  const setOwnError = (field, message) => {
    const previous = owned.get(field);
    if (previous && field.validationMessage === previous) field.setCustomValidity('');
    owned.delete(field);
    // Never erase password, account or business-rule validation from another module.
    if (message && !field.validity.customError) { field.setCustomValidity(message); owned.set(field, message); }
  };
  const validate = field => {
    if (!eligible(field)) return;
    const value = String(field.value ?? '');
    const text = field.matches('textarea,input:not([type]),input[type=text],input[type=tel],input[type=email],input[type=search],input[type=url]');
    setOwnError(field, field.required && text && value.length && !value.trim() ? 'Enter a value; spaces alone are not valid.' : '');
  };
  const feedback = field => {
    const invalid = eligible(field) && !field.validity.valid;
    let error = field.parentElement?.querySelector(`[data-field-error="${field.dataset.uxField || 'none'}"]`);
    if (!error && invalid) {
      field.dataset.uxField = `field-${++nextId}`;
      error = field.ownerDocument.createElement('span');
      error.dataset.fieldError = field.dataset.uxField;
      error.id = `ux-${field.dataset.uxField}`;
      error.className = 'field-error';
      error.setAttribute('aria-live', 'polite');
      field.insertAdjacentElement('afterend', error);
      field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
    }
    if (error) { error.textContent = invalid ? field.validationMessage : ''; error.hidden = !invalid; }
    if (invalid) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  };
  const paymentReference = form => {
    const method = form?.querySelector('[name=paymentMethod]');
    const reference = form?.querySelector('input[name=reference]');
    if (method && reference) {
      reference.required = method.value === 'QR';
      reference.setAttribute('aria-required', String(reference.required));
    }
  };
  const onInput = event => {
    const field = event.target;
    if (!isControl(field)) return;
    paymentReference(field.form);
    validate(field);
    if (field.hasAttribute('aria-invalid')) feedback(field);
    // Changing QR to cash also clears an obsolete reference error.
    const reference = field.form?.querySelector('input[name=reference][aria-invalid]');
    if (reference && field.name === 'paymentMethod') feedback(reference);
  };
  const onInvalid = event => { if (isControl(event.target)) feedback(event.target); };
  const onBlur = event => {
    if (!isControl(event.target)) return;
    validate(event.target);
    if (event.target.value || event.target.hasAttribute('aria-invalid')) feedback(event.target);
  };
  const onSubmit = event => {
    const form = event.target;
    if (!form.matches?.('form') || form.noValidate) return;
    paymentReference(form);
    const fields = [...form.querySelectorAll('input,select,textarea')].filter(eligible);
    fields.forEach(validate);
    const invalid = fields.find(field => !field.validity.valid);
    if (invalid) {
      event.preventDefault(); event.stopImmediatePropagation();
      fields.forEach(feedback); invalid.focus(); invalid.reportValidity();
    }
  };
  root.addEventListener('input', onInput, true);
  root.addEventListener('change', onInput, true);
  root.addEventListener('focusout', onBlur, true);
  root.addEventListener('invalid', onInvalid, true);
  root.addEventListener('submit', onSubmit, true);
  return () => {
    root.removeEventListener('input', onInput, true); root.removeEventListener('change', onInput, true);
    root.removeEventListener('focusout', onBlur, true); root.removeEventListener('invalid', onInvalid, true);
    root.removeEventListener('submit', onSubmit, true);
  };
}

export function prepareModalUX(modal) {
  // Preserve handlers used by page modules, while presenting only one Close control.
  modal.querySelectorAll('button[data-close]').forEach(button => {
    if (!button.hidden && button.textContent.trim().toLowerCase() === 'close') button.hidden = true;
  });
  modal.querySelectorAll('input,select,textarea').forEach(field => {
    if (field.hasAttribute('required')) field.setAttribute('aria-required', 'true');
  });
  modal.querySelectorAll('label').forEach(label => {
    for (const node of [...label.childNodes]) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const text = label.ownerDocument.createElement('span');
      text.className = 'field-label'; text.textContent = node.textContent;
      node.replaceWith(text);
    }
  });
}
