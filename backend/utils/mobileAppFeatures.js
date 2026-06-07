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
const CONFIGURABLE_ROLES = ['admin', 'manager', 'staff'];

function allEnabled() {
  return Object.fromEntries(MOBILE_FEATURE_KEYS.map((k) => [k, true]));
}

function getSystemRoleDefaults(role) {
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

function parseFeatureMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const key of MOBILE_FEATURE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = raw[key] === true;
    }
  }
  return out;
}

function parseTenantRoleDefaults(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const role of CONFIGURABLE_ROLES) {
    if (obj[role]) out[role] = parseFeatureMap(obj[role]);
  }
  return out;
}

function getRoleDefaults(role, tenantRoleDefaults = {}) {
  const r = String(role || 'staff').trim().toLowerCase();
  if (r === 'superadmin') return allEnabled();
  const system = getSystemRoleDefaults(r);
  const tenant = tenantRoleDefaults[r];
  if (!tenant || typeof tenant !== 'object') return system;
  return { ...system, ...parseFeatureMap(tenant) };
}

function getAllRoleDefaults(tenantRoleDefaults = {}) {
  const out = { superadmin: allEnabled() };
  for (const role of CONFIGURABLE_ROLES) {
    out[role] = getRoleDefaults(role, tenantRoleDefaults);
  }
  return out;
}

function parseStoredOverrides(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  return parseFeatureMap(obj);
}

function resolveMobileFeatures(role, storedOverrides, tenantRoleDefaults = {}) {
  if (String(role || '').trim().toLowerCase() === 'superadmin') {
    return allEnabled();
  }
  const defaults = getRoleDefaults(role, tenantRoleDefaults);
  const overrides = parseStoredOverrides(storedOverrides);
  return { ...defaults, ...overrides };
}

function computeOverrides(role, effective, tenantRoleDefaults = {}) {
  const defaults = getRoleDefaults(role, tenantRoleDefaults);
  const overrides = {};
  for (const key of MOBILE_FEATURE_KEYS) {
    const val = effective[key] === true;
    if (val !== defaults[key]) overrides[key] = val;
  }
  return overrides;
}

function sanitizeEffectiveInput(body = {}, role = 'staff', tenantRoleDefaults = {}) {
  const effective = { ...getRoleDefaults(role, tenantRoleDefaults) };
  const input = body.features || body.effective || body;
  if (typeof input !== 'object' || input == null) return effective;
  for (const key of MOBILE_FEATURE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      effective[key] = input[key] === true;
    }
  }
  return effective;
}

function sanitizeTenantRoleDefaultsInput(body = {}) {
  const input = body.defaults || body;
  if (typeof input !== 'object' || input == null) return {};
  const out = {};
  for (const role of CONFIGURABLE_ROLES) {
    if (input[role]) out[role] = parseFeatureMap(input[role]);
  }
  return out;
}

module.exports = {
  MOBILE_FEATURE_CATALOG,
  MOBILE_FEATURE_KEYS,
  CONFIGURABLE_ROLES,
  getSystemRoleDefaults,
  getRoleDefaults,
  getAllRoleDefaults,
  parseTenantRoleDefaults,
  parseStoredOverrides,
  resolveMobileFeatures,
  computeOverrides,
  sanitizeEffectiveInput,
  sanitizeTenantRoleDefaultsInput,
};
