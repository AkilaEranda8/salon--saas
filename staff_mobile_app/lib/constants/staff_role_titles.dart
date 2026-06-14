/// Management roles — override commission on other staff work in the branch.
const List<String> managementStaffRoles = [
  'Branch Manager',
  'Salon Manager',
];

/// Salon job roles shown when adding/editing staff.
const List<String> staffRoleTitles = [
  ...managementStaffRoles,
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

const String staffRoleOther = '__other__';
