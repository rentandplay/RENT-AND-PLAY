export { emailError, nameError, normalizeEmail, passwordError, passwordMatchError, phoneError } from '../../web/src/account-validation.js';
import { emailError, normalizeEmail } from '../../web/src/account-validation.js';

export const validationFailure = message => { if (message) throw Object.assign(new Error(message), { status: 400 }); };
export function validateEmailFormat(value) {
  validationFailure(emailError(value));
  return normalizeEmail(value);
}
