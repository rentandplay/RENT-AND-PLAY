// Bound dependency waits so an unavailable upstream cannot pin a health probe.
export async function withDeadline(operation, timeoutMs = 3500) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Dependency check timed out.'), {
          code: 'DEPENDENCY_TIMEOUT', status: 503
        })), timeoutMs);
      })
    ]);
  } finally { clearTimeout(timer); }
}
