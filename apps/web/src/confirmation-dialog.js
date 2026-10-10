const formSignature = form => JSON.stringify([...new FormData(form)].map(([name, value]) =>
  [name, typeof value === 'string' ? value : [value.name, value.size, value.type, value.lastModified]]));

export function createConfirmationDialog({ dialog, parentModal, notify = () => {} }) {
  let pending = null, backdropPress = false;
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'confirmation-title');
  dialog.setAttribute('aria-describedby', 'confirmation-description');

  function settle(accepted) {
    if (!pending) return;
    const request = pending;
    pending = null; backdropPress = false;
    if (dialog.open) dialog.close();
    if (request.focus?.isConnected) request.focus.focus({ preventScroll: true });
    request.resolve(accepted);
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); settle(false); });
  dialog.addEventListener('close', () => { if (!dialog.open) settle(false); });
  parentModal.addEventListener('close', () => { if (!parentModal.open && pending?.parent) settle(false); });
  const outside = event => {
    if (event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener('pointerdown', event => { backdropPress = outside(event); });
  dialog.addEventListener('click', event => { if (backdropPress && outside(event)) settle(false); backdropPress = false; });

  function confirmAction({ title, description, confirmLabel = 'Yes, continue', cancelLabel = 'No, go back', danger = false }) {
    // Another action must never reuse an approval intended for the current request.
    if (pending) return Promise.resolve(false);
    dialog.innerHTML = `<button type="button" class="icon-button confirmation-close" aria-label="Cancel confirmation">✕</button><div class="confirmation-symbol" aria-hidden="true"></div><h2 id="confirmation-title"></h2><p id="confirmation-description"></p><div class="confirmation-actions"><button type="button" class="secondary" data-confirm-no autofocus></button><button type="button" class="${danger ? 'confirmation-danger' : 'primary'}" data-confirm-yes></button></div>`;
    dialog.classList.toggle('confirmation-destructive', danger);
    dialog.querySelector('.confirmation-symbol').textContent = danger ? '!' : '?';
    dialog.querySelector('#confirmation-title').textContent = title;
    dialog.querySelector('#confirmation-description').textContent = description;
    const no = dialog.querySelector('[data-confirm-no]'), yes = dialog.querySelector('[data-confirm-yes]');
    no.textContent = cancelLabel; yes.textContent = confirmLabel;
    no.onclick = () => settle(false);
    yes.onclick = () => settle(true);
    dialog.querySelector('.confirmation-close').onclick = () => settle(false);
    return new Promise(resolve => {
      pending = { resolve, focus: dialog.ownerDocument.activeElement, parent: parentModal.open };
      dialog.showModal();
      no.focus({ preventScroll: true });
    });
  }

  function confirmSubmit(form, options, submit) {
    let busy = false;
    // Gate the actual handler, rather than adding a listener that lets it run anyway.
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy || !form.isConnected || !form.reportValidity()) return;
      busy = true;
      const signature = formSignature(form), parent = form.closest('dialog'), focus = form.ownerDocument.activeElement;
      const buttons = [...form.querySelectorAll('button[type="submit"],button:not([type]),input[type="submit"]')].map(button => [button, button.disabled]);
      buttons.forEach(([button]) => { button.disabled = true; });
      try {
        if (!await confirmAction(typeof options === 'function' ? options() : options) || !form.isConnected || parent && !parent.open) return;
        if (signature !== formSignature(form)) { notify('The details changed. Review the form and confirm again.'); return; }
        if (form.reportValidity()) await submit();
      } finally {
        busy = false;
        buttons.forEach(([button, disabled]) => { button.disabled = disabled; });
        if (focus?.isConnected && !dialog.open && (!parent || parent.open)) focus.focus({ preventScroll: true });
      }
    };
  }

  return { confirmAction, confirmSubmit, cancel: () => settle(false), isOpen: () => Boolean(pending) };
}
