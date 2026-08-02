/** Salon job roles shown when adding/editing staff. */
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

export const STAFF_ROLE_OTHER = '__other__';

export function staffRoleSelectValue(roleTitle) {
  const title = (roleTitle || '').trim();
  if (!title) return '';
  return STAFF_ROLE_TITLES.includes(title) ? title : STAFF_ROLE_OTHER;
}
