/** Sri Lanka calendar date helpers (UTC+5:30). */

export function todayYmdSL(now = Date.now()) {
  return new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDaysYmdSL(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000;
  return new Date(utc).toISOString().slice(0, 10);
}

export function tomorrowYmdSL(now = Date.now()) {
  return addDaysYmdSL(todayYmdSL(now), 1);
}
