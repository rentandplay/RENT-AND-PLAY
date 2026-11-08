import { requestError } from './request-errors.js';

export function createApiClient({ fetcher = fetch, now = Date.now, timeoutMs = 20000 } = {}) {
  let retryAt = 0, quotaError = null;
  const independent = new Set(['/auth/logout', '/auth/password-reset', '/auth/email-check', '/health']);
  return {
    canRefresh: () => now() >= retryAt,
    async request(path, options = {}) {
      if (now() < retryAt && !independent.has(path)) throw quotaError;
      const mutation = !['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase());
      let response;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      let timer = null;
      if (controller && timeoutMs > 0 && !options.signal) {
        timer = setTimeout(() => controller.abort(), timeoutMs);
      }
      const signal = options.signal || controller?.signal;
      try {
        response = await fetcher(`/api${path}`, {
          credentials: 'same-origin',
          ...options,
          ...(signal ? { signal } : {}),
          headers: { 'Content-Type': 'application/json', ...options.headers }
        });
      } catch (err) {
        if (timer) clearTimeout(timer);
        const code = options.signal?.aborted ? 'CANCELLED' : err?.name === 'AbortError' || controller?.signal?.aborted ? 'TIMEOUT' : 'NETWORK';
        throw requestError({ code, mutation, offline: typeof navigator !== 'undefined' && navigator.onLine === false });
      }
      let result;
      try { result = await response.json(); }
      catch { throw requestError({ status: response.status, code: options.signal?.aborted ? 'CANCELLED' : controller?.signal?.aborted ? 'TIMEOUT' : 'INVALID_RESPONSE', mutation }); }
      finally { if (timer) clearTimeout(timer); }
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw requestError({ status: response.status, code: 'INVALID_RESPONSE', mutation });
      const error = requestError({ message: result.error || result.warning, status: response.status, code: result.code, mutation });
      if (result.code === 'FIRESTORE_QUOTA_EXCEEDED') {
        const seconds = Number(result.retryAfterSeconds ?? response.headers?.get('Retry-After'));
        const retrySeconds = Number.isFinite(seconds) && seconds > 0 ? Math.min(300, seconds) : 300;
        error.status = 429; error.retryAfterSeconds = retrySeconds;
        quotaError = error; retryAt = now() + retrySeconds * 1000;
      }
      if (!response.ok) throw error;
      const endpoint = path.split('?')[0];
      const arrayField = { '/auth/sessions': 'sessions', '/security/alerts': 'alerts', '/chat/threads': 'threads' }[endpoint];
      if (arrayField && !mutation && !Array.isArray(result[arrayField])) throw requestError({ code: 'INVALID_RESPONSE' });
      if (/^\/chat\/threads\/[^/]+\/messages$/.test(endpoint) && !mutation && (!Array.isArray(result.messages) || !result.thread)) throw requestError({ code: 'INVALID_RESPONSE' });
      return result;
    }
  };
}

