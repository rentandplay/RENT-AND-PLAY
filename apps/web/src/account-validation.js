// Pure rules are also imported by the backend so browser and API checks agree.
export const normalizeEmail = value => String(value ?? '').toLowerCase();
export const passwordHelp = 'At least 8 characters, one capital letter, and one number.';

export function emailError(value, required = true) {
  if (typeof value !== 'string') return required ? 'Enter your email address.' : value == null ? '' : 'Enter a valid email address.';
  const email = normalizeEmail(value);
  if (!email) return required ? 'Enter your email address.' : '';
  if (/\s/.test(email)) return 'Email addresses cannot contain spaces.';
  const parts = email.split('@');
  if (email.length > 254 || parts.length !== 2 || !parts[0] || parts[0].length > 64) return 'Enter a valid email address.';
  const [local, domain] = parts;
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local) || domain.length > 253) return 'Enter a valid email address.';
  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/.test(labels.at(-1))) return 'Enter a valid email address.';
  return '';
}

export function nameError(value, { label = 'full name', max = 150 } = {}) {
  if (typeof value !== 'string') return `Enter your ${label}.`;
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return `Enter your ${label}.`;
  if (name.length > max) return `Use ${max} characters or fewer.`;
  if (!name.split(' ').every(word => /^[\p{L}\p{M}]+(?:['\u2019.\-][\p{L}\p{M}]+)*\.?$/u.test(word))) return 'Use letters, spaces, apostrophes, or hyphens only.';
  const words = name.split(' '), letters = word => [...word.matchAll(/\p{L}/gu)].length;
  if (letters(words[0]) < 2 || letters(words.at(-1)) < 2) return 'Use at least 2 letters for each name.';
  if (/([\p{L}])\1{3,}/iu.test(name)) return 'Enter your real name without repeated character strings.';
  return '';
}

export function passwordError(value) {
  if (typeof value !== 'string') return 'Enter a password.';
  const password = String(value ?? '');
  if (!password) return 'Enter a password.';
  if (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return passwordHelp;
  return '';
}

export function passwordMatchError(password, confirmation) {
  if (!confirmation) return 'Confirm your password.';
  return password === confirmation ? '' : 'Passwords do not match.';
}

export function phoneError(value, required = true) {
  const phone = String(value ?? '').trim();
  if (!phone) return required ? 'Enter your phone number.' : '';
  return /^[+0-9() .-]+$/.test(phone) && /^(?:\+?63|0)?9\d{9}$/.test(phone.replace(/[\s().-]/g, '')) ? '' : 'Enter a valid Philippine mobile number.';
}

export function bindAccountValidation(form, rules) {
  const fields = new Map();
  for (const [name, validate] of Object.entries(rules)) {
    const input = form.elements.namedItem(name) || form.querySelector(`#${name}`);
    if (!input) continue;
    const error = form.ownerDocument.createElement('small');
    error.className = 'field-error'; error.id = `${input.id || name}-validation`; error.setAttribute('aria-live', 'polite');
    const label = input.closest('label');
    if (label) label.append(error); else input.after(error);
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
    const row = { input, validate, error, touched: false };
    const update = () => {
      if (input.type === 'email') input.value = normalizeEmail(input.value);
      const message = input.disabled ? '' : validate(input.value);
      input.setCustomValidity(message); input.setAttribute('aria-invalid', String(row.touched && Boolean(message)));
      error.textContent = row.touched ? message : ''; error.hidden = !error.textContent;
      return !message;
    };
    row.update = update; fields.set(name, row);
    input.addEventListener('input', () => { row.touched = true; for (const field of fields.values()) field.update(); });
    input.addEventListener('invalid', () => { row.touched = true; update(); });
    input.addEventListener('blur', () => { row.touched = true; update(); });
    update();
  }
  // Inline messages appear before the existing submit/confirmation handler.
  form.addEventListener('submit', () => { for (const row of fields.values()) { row.touched = true; row.update(); } }, true);
  return {
    validate: () => { let valid = true; for (const row of fields.values()) { row.touched = true; valid = row.update() && valid; } return valid && form.reportValidity(); },
    update: () => { for (const row of fields.values()) row.update(); }
  };
}
