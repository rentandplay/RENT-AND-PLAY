export function createApiClient({ fetcher = fetch, now = Date.now } = {}) {
  let retryAt = 0, quotaError = null;
  const independent = new Set(['/auth/logout', '/auth/password-reset', '/auth/email-check', '/health']);
  return {
    canRefresh: () => now() >= retryAt,
    async request(path, options = {}) {
      if (now() < retryAt && !independent.has(path)) throw quotaError;
      let response;
      try { response = await fetcher(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }
      catch { throw new Error('Cannot reach the server. Check that the web and backend servers are running.'); }
      const result = await response.json().catch(() => ({ error: 'The server returned an invalid response.' }));
      const error = Object.assign(new Error(result.error || result.warning || 'Request failed.'), { status: response.status, code: result.code });
      if (result.code === 'FIRESTORE_QUOTA_EXCEEDED') {
        const seconds = Number(result.retryAfterSeconds ?? response.headers?.get('Retry-After'));
        const retrySeconds = Number.isFinite(seconds) && seconds > 0 ? Math.min(300, seconds) : 300;
        error.status = 429; error.retryAfterSeconds = retrySeconds;
        quotaError = error; retryAt = now() + retrySeconds * 1000;
      }
      if (!response.ok) throw error;
      return result;
    }
  };
}
