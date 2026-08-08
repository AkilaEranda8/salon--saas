/** Digits only from a phone-like string. */
export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Strip Sri Lanka trunk/country prefixes → national mobile core
 * e.g. 94712438116 / 0712438116 → 712438116
 */
export function phoneLocalCore(value) {
  let d = phoneDigits(value);
  if (d.startsWith('94') && d.length >= 11) d = d.slice(2);
  else if (d.startsWith('0') && d.length >= 9) d = d.slice(1);
  return d;
}

/** Search tokens so UI substring filter matches 0… and 94… stored forms. */
export function phoneSearchTokens(value) {
  const dig = phoneDigits(value);
  const core = phoneLocalCore(dig);
  const out = new Set();
  if (value) out.add(String(value).trim());
  if (dig) out.add(dig);
  if (core) {
    out.add(core);
    out.add(`0${core}`);
    out.add(`94${core}`);
    if (core.length >= 9) out.add(core.slice(-9));
  }
  return [...out].filter(Boolean);
}

/**
 * True when stored phone and query refer to the same (or overlapping) number,
 * ignoring spaces / + / 0 vs 94 prefix differences.
 */
export function phonesMatch(stored, query) {
  const a = phoneDigits(stored);
  const b = phoneDigits(query);
  if (!a || !b || b.length < 3) return false;
  if (a.includes(b) || b.includes(a)) return true;

  const ca = phoneLocalCore(a);
  const cb = phoneLocalCore(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (ca.includes(cb) || cb.includes(ca)) return true;
  if (ca.length >= 9 && cb.length >= 9 && ca.slice(-9) === cb.slice(-9)) return true;
  return false;
}
