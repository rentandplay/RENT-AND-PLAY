// Keep infrastructure details in server logs, and give people an actionable next step.
const technical = /database|backend|supabase|firebase|firestore|postgres|sql\b|PGRST|ECONN|ENOTFOUND|fetch failed|failed to fetch|npm run|apps[\\/]backend|service.?role|stack trace|TypeError|SyntaxError|<html|<!doctype|127\.0\.0\.1|localhost|https?:\/\/|\bat \w+.*:\d+:\d+/i;

export function publicErrorMessage(problem, { mutation = false, offline = false } = {}) {
  const status = Number(problem?.status || 0), code = problem?.code;
  const message = typeof problem === 'string' ? problem : problem?.message || '';
  let text;
  if (offline || code === 'OFFLINE') text = 'You’re offline. Reconnect to the internet, then try again.';
  else if (code === 'TIMEOUT') text = 'This is taking longer than expected. Please try again shortly.';
  else if (code === 'CANCELLED') text = 'The request was cancelled. You can try again.';
  else if (code === 'NETWORK') text = 'We couldn’t connect to Rent & Play. Please try again shortly.';
  else if (status === 401) text = 'Your session has ended. Please sign in again.';
  else if (status === 429) text = 'Rent & Play is busy right now. Please wait a moment before trying again.';
  else if (status >= 500 || code === 'INVALID_RESPONSE' || technical.test(message)) text = 'Rent & Play is temporarily unavailable. Please try again shortly. If this continues, contact your system administrator.';
  else if (message && message.length <= 500) text = message;
  else if (status === 403) text = 'You don’t have permission to do this. Contact your administrator if you need access.';
  else if (status === 404) text = 'This record is no longer available. Refresh the list to see the latest records.';
  else text = 'We couldn’t complete this request. Please try again. If this continues, contact your system administrator.';
  if (mutation && (status >= 500 || ['NETWORK', 'TIMEOUT', 'CANCELLED', 'INVALID_RESPONSE'].includes(code))) {
    text += ' The result could not be confirmed. Check the record before trying again.';
  }
  return text;
}

export function requestError({ status = 0, code, message, retryAfterSeconds, mutation, offline } = {}) {
  const problem = { status, code, message };
  return Object.assign(new Error(publicErrorMessage(problem, { mutation, offline })), {
    status, code, ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    outcomeUnknown: Boolean(mutation && (status >= 500 || ['NETWORK', 'TIMEOUT', 'CANCELLED', 'INVALID_RESPONSE'].includes(code)))
  });
}
