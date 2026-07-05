export const ADDITIONAL_SERVICES_PREFIX = 'Additional services:';

/** Ids from `walkInServices` rows (preferred) or note + primary service. */
export function parseAdditionalServiceIdsFromNote(note, allServices = []) {
  const line = String(note || '').split('\n').find((l) => l.trim().startsWith(ADDITIONAL_SERVICES_PREFIX));
  if (!line) return [];
  const rawNames = line.replace(ADDITIONAL_SERVICES_PREFIX, '').split(',').map((s) => s.trim()).filter(Boolean);
  return rawNames
    .map((name) => allServices.find((s) => s.name === name)?.id)
    .filter(Boolean);
}

export function getWalkInOrderedServiceIds(entry, allServices = []) {
  const wiq = entry?.walkInServices || entry?.queueServices;
  if (Array.isArray(wiq) && wiq.length > 0) {
    return [...wiq]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((r) => Number(r.service_id))
      .filter((id) => id > 0);
  }
  const svcId = Number(entry?.service_id || entry?.service?.id);
  const extraIds = parseAdditionalServiceIdsFromNote(entry?.note, allServices);
  const out = [];
  const seen = new Set();
  if (svcId) { seen.add(svcId); out.push(svcId); }
  for (const id of extraIds.map(Number)) {
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

/** Comma-separated service names (junction table or note fallback). */
export function getWalkInServicesTitle(entry) {
  const wiq = entry?.walkInServices || entry?.queueServices;
  if (Array.isArray(wiq) && wiq.length > 0) {
    return [...wiq]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((r) => r.service?.name)
      .filter(Boolean)
      .join(', ');
  }
  const svc = entry?.service || {};
  const parts = [svc.name].filter(Boolean);
  const line = String(entry?.note || '').split('\n').find((l) => l.trim().startsWith(ADDITIONAL_SERVICES_PREFIX));
  if (line) {
    const rest = line.replace(ADDITIONAL_SERVICES_PREFIX, '').trim();
    if (rest) parts.push(...rest.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return parts.join(', ');
}
