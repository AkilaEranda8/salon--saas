/** Fallback salon job roles when API is unavailable. */
export const STAFF_ROLE_TITLES = [
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

/** Sentinel value for “add a new role into the system”. */
export const STAFF_ROLE_OTHER = '__other__';

export function staffRoleSelectValue(roleTitle, roleTitles = STAFF_ROLE_TITLES) {
  const title = (roleTitle || '').trim();
  if (!title) return '';
  const list = Array.isArray(roleTitles) && roleTitles.length ? roleTitles : STAFF_ROLE_TITLES;
  return list.includes(title) ? title : STAFF_ROLE_OTHER;
}
