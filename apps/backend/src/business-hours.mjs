export function validBusinessTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function withinBusinessHours(at, settings = {}) {
  const opens = settings.opens_at || '08:00', closes = settings.closes_at || '20:00';
  if (!validBusinessTime(opens) || !validBusinessTime(closes)) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: settings.timezone || 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(at);
  const time = `${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}`;
  return opens === closes || (opens < closes ? time >= opens && time < closes : time >= opens || time < closes);
}
