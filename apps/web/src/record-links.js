const escapeAttribute = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const controls = 'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="checkbox"],[role="switch"],[contenteditable]:not([contenteditable="false"]),[data-record-ignore]';

export function recordAttrs(type, id, label) {
  if (id === undefined || id === null || id === '') return '';
  return `data-record-type="${escapeAttribute(type)}" data-record-id="${escapeAttribute(id)}" tabindex="0" aria-label="View ${escapeAttribute(label)} details"`;
}

export function bindRecordLinks(root, handlers) {
  root.querySelectorAll('[data-record-type]').forEach(element => {
    const open = handlers[element.dataset.recordType];
    if (!open) return;
    element.onclick = event => {
      if (event.defaultPrevented || event.button > 0) return;
      const target = event.target.closest ? event.target : event.target.parentElement;
      if (target?.closest('[data-record-type]') !== element) return;
      const control = target.closest(controls);
      if (control && control !== element) return;
      const selection = element.ownerDocument.defaultView?.getSelection();
      if (selection && !selection.isCollapsed && selection.containsNode(element, true)) return;
      open(element.dataset.recordId);
    };
    element.onkeydown = event => {
      if (event.target !== element || event.defaultPrevented || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      if (!event.repeat) open(element.dataset.recordId);
    };
  });
}
