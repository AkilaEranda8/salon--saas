/// Build-time config for the single-salon customer app.
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.salon.hexalyte.com',
  );

  static const String tenantId = String.fromEnvironment(
    'TENANT_ID',
    defaultValue: '28',
  );

  static const String brandName = String.fromEnvironment(
    'BRAND_NAME',
    defaultValue: 'salon-larvendo',
  );

  static int? get tenantIdInt {
    final v = int.tryParse(tenantId.trim());
    if (v == null || v <= 0) return null;
    return v;
  }

  static bool get hasTenant => tenantIdInt != null;
}
