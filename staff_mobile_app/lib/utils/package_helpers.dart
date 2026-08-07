import '../models/salon_service.dart';

/// Shared helpers for customer package selection on mobile payments.
List<int> normalizePackageServices(dynamic services) {
  if (services is List) {
    return services
        .map((e) => e is num ? e.toInt() : int.tryParse('$e') ?? 0)
        .where((id) => id > 0)
        .toList();
  }
  if (services is String && services.trim().isNotEmpty) {
    try {
      // Lightweight parse for JSON arrays like "[1,2,3]"
      final cleaned = services.trim();
      if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
        final inner = cleaned.substring(1, cleaned.length - 1).trim();
        if (inner.isEmpty) return const [];
        return inner
            .split(',')
            .map((p) => int.tryParse(p.trim()) ?? 0)
            .where((id) => id > 0)
            .toList();
      }
    } catch (_) {}
  }
  return const [];
}

Map<String, dynamic>? packageOf(Map<String, dynamic> cp) {
  final p = cp['package'];
  if (p is Map) return Map<String, dynamic>.from(p);
  return null;
}

bool packageExpiryPassed(Map<String, dynamic> cp) {
  final raw = '${cp['expiry_date'] ?? ''}'.trim();
  if (raw.isEmpty) return false;
  final day = raw.length >= 10 ? raw.substring(0, 10) : raw;
  final today = DateTime.now();
  final todayStr =
      '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
  return day.compareTo(todayStr) < 0;
}

bool packageIsRedeemable(Map<String, dynamic>? pkg) {
  if (pkg == null) return false;
  return normalizePackageServices(pkg['services']).isNotEmpty;
}

bool packageCanRedeemNow(Map<String, dynamic> cp) {
  if (cp['id'] == null) return false;
  final status = '${cp['status'] ?? ''}'.toLowerCase();
  if (status == 'expired' || status == 'completed') return false;
  if (packageExpiryPassed(cp)) return false;
  final total = num.tryParse('${cp['sessions_total'] ?? 0}') ?? 0;
  final used = num.tryParse('${cp['sessions_used'] ?? 0}') ?? 0;
  if (total > 0 && used >= total) return false;
  return packageIsRedeemable(packageOf(cp));
}

double getPackageBundlePrice(Map<String, dynamic> cp) {
  final pkg = packageOf(cp);
  final fromPkg = double.tryParse('${pkg?['package_price'] ?? 0}') ?? 0;
  if (fromPkg > 0) return fromPkg;
  return double.tryParse('${cp['amount_paid'] ?? 0}') ?? 0;
}

List<String> resolvePackageServiceIds(
  Map<String, dynamic> cp,
  List<SalonService> allServices,
) {
  final pkg = packageOf(cp);
  final ids = normalizePackageServices(pkg?['services']);
  if (ids.isEmpty) return const [];
  final active = allServices.where((s) => s.isActive).map((s) => s.id).toSet();
  return ids.map((id) => '$id').where(active.contains).toList();
}

String formatCustomerPackageLabel(Map<String, dynamic> cp) {
  final pkg = packageOf(cp);
  final name = '${pkg?['name'] ?? 'Package'}';
  final bundle = getPackageBundlePrice(cp);
  final rem = cp['sessions_remaining'];
  final sessions = rem == null
      ? 'Unlimited'
      : '${rem is num ? rem.toInt() : rem} left';
  final pricePart =
      bundle > 0 ? 'LKR ${bundle.toStringAsFixed(0)} · ' : '';
  return '$name — $pricePart$sessions';
}
