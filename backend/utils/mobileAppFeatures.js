const MOBILE_FEATURE_CATALOG = [
  { key: 'appointments', label: 'Appointments' },
  { key: 'customers', label: 'Customers' },
  { key: 'services', label: 'Services' },
  { key: 'payments', label: 'Payments' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'walkin', label: 'Walk-in' },
  { key: 'staff', label: 'Staff' },
  { key: 'commission', label: 'Commission' },
  { key: 'ai_chat', label: 'AI Chat' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'user_permissions', label: 'User Permissions' },
];

const MOBILE_FEATURE_KEYS = MOBILE_FEATURE_CATALOG.map((f) => f.key);

function allEnabled() {
  return Object.fromEntries(MOBILE_FEATURE_KEYS.map((k) => [k, true]));
}

function getRoleDefaults(role) {
  const r = String(role || 'staff').trim().toLowerCase();
  if (r === 'superadmin' || r === 'admin') return allEnabled();
  if (r === 'manager') {
    return {
      appointments: true,
      customers: true,
      services: true,
      payments: true,
      calendar: true,
      walkin: true,
      staff: true,
      commission: true,
      ai_chat: false,
      reminders: true,
      expenses: false,
      user_permissions: false,
    };
  }
  return {
    appointments: true,
    customers: true,
    services: false,
    payments: false,
    calendar: true,
    walkin: true,
    staff: false,
    commission: false,
    ai_chat: false,
    reminders: false,
    expenses: false,
    user_permissions: false,
  };
}

function parseStoredOverrides(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const key of MOBILE_FEATURE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key] = obj[key] === true;
    }
  }
  return out;
}

function resolveMobileFeatures(role, storedOverrides) {
  if (String(role || '').trim().toLowerCase() === 'superadmin') {
    return allEnabled();
  }
  const defaults = getRoleDefaults(role);
  const overrides = parseStoredOverrides(storedOverrides);
  return { ...defaults, ...overrides };
}

function computeOverrides(role, effective) {
  const defaults = getRoleDefaults(role);
  const overrides = {};
  for (const key of MOBILE_FEATURE_KEYS) {
    const val = effective[key] === true;
    if (val !== defaults[key]) overrides[key] = val;
  }
  return overrides;
}

function sanitizeEffectiveInput(body = {}) {
  const effective = getRoleDefaults('staff');
  const input = body.features || body.effective || body;
  if (typeof input !== 'object' || input == null) return effective;
  for (const key of MOBILE_FEATURE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      effective[key] = input[key] === true;
    }
  }
  return effective;
}

module.exports = {
  MOBILE_FEATURE_CATALOG,
  MOBILE_FEATURE_KEYS,
  getRoleDefaults,
  parseStoredOverrides,
  resolveMobileFeatures,
  computeOverrides,
  sanitizeEffectiveInput,
};
