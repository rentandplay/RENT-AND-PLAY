import { Resolver } from 'node:dns/promises';
export { emailError, nameError, normalizeEmail, passwordError, passwordMatchError, phoneError } from '../../web/src/account-validation.js';
import { emailError, normalizeEmail } from '../../web/src/account-validation.js';

export const validationFailure = message => { if (message) throw Object.assign(new Error(message), { status: 400 }); };
export function validateEmailFormat(value) {
  validationFailure(emailError(value));
  return normalizeEmail(value);
}
const resolver = new Resolver({ timeout: 2500, tries: 1 });
const missing = error => ['ENODATA', 'ENOTFOUND'].includes(error?.code);

export function createEmailDomainValidator({ resolveMx = domain => resolver.resolveMx(domain), resolve4 = domain => resolver.resolve4(domain), resolve6 = domain => resolver.resolve6(domain), now = Date.now, allowedDomains = process.env.EMAIL_ALLOWED_DOMAINS || '' } = {}) {
  const allowed = new Set(String(allowedDomains).split(',').map(value => value.trim().toLowerCase()).filter(Boolean)), cache = new Map();
  return async value => {
    validationFailure(emailError(value));
    const email = normalizeEmail(value), domain = email.split('@')[1];
    if (allowed.size && !allowed.has(domain)) validationFailure('Use an email from a supported provider: ' + [...allowed].join(', ') + '.');
    const cached = cache.get(domain);
    if (cached && cached.expires > now()) { if (cached.message) throw Object.assign(new Error(cached.message), { status: 400, code: 'INVALID_EMAIL_DOMAIN' }); return email; }
    let valid = false;
    try {
      const mx = await resolveMx(domain);
      if (mx.length) valid = mx.some(record => record.exchange && record.exchange !== '.');
      else throw Object.assign(new Error('No mail exchange'), { code: 'ENODATA' });
    } catch (error) {
      if (!missing(error)) throw Object.assign(new Error('Could not check the email domain. Please try again.'), { status: 503 });
      if (error.code === 'ENODATA') {
        // SMTP allows delivery to A/AAAA when a domain publishes no MX record.
        const addresses = await Promise.allSettled([resolve4(domain), resolve6(domain)]);
        valid = addresses.some(result => result.status === 'fulfilled' && result.value.length > 0);
        if (!valid && addresses.some(result => result.status === 'rejected' && !missing(result.reason))) throw Object.assign(new Error('Could not check the email domain. Please try again.'), { status: 503 });
      }
    }
    const message = valid ? '' : 'This email domain cannot receive email. Check the spelling or use another address.';
    if (cache.size >= 1024) cache.delete(cache.keys().next().value);
    cache.set(domain, { expires: now() + (valid ? 600000 : 60000), message });
    if (message) throw Object.assign(new Error(message), { status: 400, code: 'INVALID_EMAIL_DOMAIN' });
    return email;
  };
}
