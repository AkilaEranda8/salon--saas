class MobileFeatures {
  static const appointments = 'appointments';
  static const customers = 'customers';
  static const services = 'services';
  static const payments = 'payments';
  static const calendar = 'calendar';
  static const walkin = 'walkin';
  static const staff = 'staff';
  static const commission = 'commission';
  static const aiChat = 'ai_chat';
  static const reminders = 'reminders';
  static const expenses = 'expenses';
  static const userPermissions = 'user_permissions';

  static const allKeys = [
    appointments,
    customers,
    services,
    payments,
    calendar,
    walkin,
    staff,
    commission,
    aiChat,
    reminders,
    expenses,
    userPermissions,
  ];

  static const labels = <String, String>{
    appointments: 'Appointments',
    customers: 'Customers',
    services: 'Services',
    payments: 'Payments',
    calendar: 'Calendar',
    walkin: 'Walk-in',
    staff: 'Staff',
    commission: 'Commission',
    aiChat: 'AI Chat',
    reminders: 'Reminders',
    expenses: 'Expenses',
    userPermissions: 'User Permissions',
  };

  static String labelFor(String key) => labels[key] ?? key;

  static Map<String, bool> parseMap(dynamic raw) {
    if (raw is! Map) return {};
    final out = <String, bool>{};
    raw.forEach((k, v) => out['$k'] = v == true);
    return out;
  }

  static int enabledCount(Map<String, bool> features) {
    return allKeys.where((k) => features[k] == true).length;
  }
}
