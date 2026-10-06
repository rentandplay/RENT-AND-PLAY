export function isQuotaError(error) {
  return [8, 429, '8', '429', 'RESOURCE_EXHAUSTED', 'resource-exhausted', 'firestore/resource-exhausted'].includes(error?.code)
    || error?.status === 'RESOURCE_EXHAUSTED';
}

export function firebaseFailure(error) {
  if (isQuotaError(error)) return {
    status: 429,
    code: 'FIRESTORE_QUOTA_EXCEEDED',
    error: 'The database usage limit has been reached. Try again later or check Firebase Usage to restore access.',
    retryAfterSeconds: Math.max(1, Math.ceil(error.retryAfterSeconds || 300))
  };
  const configuration = [7, 16, '7', '16', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'FIREBASE_CONFIG', 'app/invalid-credential', 'app/invalid-app-options'].includes(error?.code);
  return {
    status: 503,
    code: configuration ? 'FIREBASE_CONFIGURATION_ERROR' : 'FIREBASE_UNAVAILABLE',
    error: configuration ? 'The database connection needs administrator attention. Check Firebase permissions and server credentials.' : 'The database is temporarily unavailable. Please try again shortly.',
    retryAfterSeconds: 30
  };
}

// Share this cooldown between HTTP requests and the expiry worker. Repeated
// requests during an outage must not extend it or start more Firestore reads.
export function createQuotaBackoff({ now = Date.now, cooldownMs = 300000 } = {}) {
  let retryAt = 0;
  return {
    record(error) { if (isQuotaError(error) && retryAt <= now()) retryAt = now() + cooldownMs; },
    assertAvailable() {
      if (retryAt > now()) throw Object.assign(new Error('Firestore quota cooldown is active.'), {
        code: 8, quotaCooldown: true, retryAfterSeconds: Math.ceil((retryAt - now()) / 1000)
      });
    }
  };
}
