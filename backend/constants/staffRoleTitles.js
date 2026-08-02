/** Default salon job titles for Add/Edit Staff (tenant can add more). */
const DEFAULT_STAFF_ROLE_TITLES = [
  'Branch Manager',
  'Salon Manager',
  'Stylist',
  'Senior Stylist',
  'Junior Stylist',
  'Trainee',
  'Hair Colorist',
  'Barber',
  'Makeup Artist',
  'Nail Technician',
  'Beauty Therapist',
  'Massage Therapist',
  'Receptionist',
  'Salon Assistant',
];

function normalizeRoleTitle(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 100);
}

function mergeRoleTitles(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const title = normalizeRoleTitle(item);
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(title);
    }
  }
  return out;
}

function parseStoredRoleTitles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return mergeRoleTitles(raw);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? mergeRoleTitles(parsed) : [];
    } catch {
      return [];
    }
  }
  return [];
}

module.exports = {
  DEFAULT_STAFF_ROLE_TITLES,
  normalizeRoleTitle,
  mergeRoleTitles,
  parseStoredRoleTitles,
};
