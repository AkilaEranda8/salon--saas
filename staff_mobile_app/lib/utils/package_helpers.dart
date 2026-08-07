import 'dart:convert';

import '../models/salon_service.dart';

/// Shared helpers for customer package selection on mobile payments.
List<int> normalizePackageServices(dynamic services) {
  if (services is List) {
    return services
        .map((e) {
          if (e is num) return e.toInt();
          if (e is Map) {
            final raw = e['id'] ?? e['service_id'] ?? e['serviceId'];
            return int.tryParse('$raw') ?? 0;
          }
          return int.tryParse('$e') ?? 0;
        })
        .where((id) => id > 0)
        .toList();
  }
  if (services is String && services.trim().isNotEmpty) {
    try {
      final parsed = jsonDecode(services);
      if (parsed is List) return normalizePackageServices(parsed);
    } catch (_) {
      final cleaned = services.trim();
      if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
        final inner = cleaned.substring(1, cleaned.length - 1).trim();
        if (inner.isEmpty) return const [];
        return inner
            .split(',')
            .map((p) {
              final t = p.trim();
              final m = RegExp(r'\d+').firstMatch(t);
              return int.tryParse(m?.group(0) ?? t) ?? 0;
            })
            .where((id) => id > 0)
            .toList();
      }
    }
  }
  return const [];
}

/// Service ids from a package template (supports `services` + `serviceDetails`).
List<int> packageTemplateServiceIds(Map<String, dynamic>? pkg) {
  if (pkg == null) return const [];
  final fromServices = normalizePackageServices(pkg['services']);
  if (fromServices.isNotEmpty) return fromServices;
  return normalizePackageServices(pkg['serviceDetails']);
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
  return packageTemplateServiceIds(pkg).isNotEmpty;
}

/// Active catalog template with a bundle price and at least one service.
bool packageIsBookable(Map<String, dynamic>? pkg) {
  if (pkg == null || pkg['is_active'] == false) return false;
  final price = double.tryParse('${pkg['package_price'] ?? 0}') ?? 0;
  if (!(price > 0)) return false;
  return packageTemplateServiceIds(pkg).isNotEmpty;
}

List<Map<String, dynamic>> filterBookablePackageTemplates(
  List<Map<String, dynamic>> list,
) =>
    list.where(packageIsBookable).toList(growable: false);

Map<String, dynamic>? findCustomerPackageForTemplate(
  List<Map<String, dynamic>> customerPackages,
  String templateId,
) {
  if (templateId.trim().isEmpty) return null;
  Map<String, dynamic>? fallback;
  for (final cp in customerPackages) {
    final pid = '${cp['package_id'] ?? packageOf(cp)?['id'] ?? ''}';
    if (pid != templateId) continue;
    if (packageCanRedeemNow(cp)) return cp;
    fallback ??= cp;
  }
  return fallback;
}

String formatPackageTemplateLabel(Map<String, dynamic> pkg) {
  final name = '${pkg['name'] ?? 'Package'}';
  final price = double.tryParse('${pkg['package_price'] ?? 0}') ?? 0;
  final pricePart = price > 0 ? ' — LKR ${price.toStringAsFixed(0)}' : '';
  return '$name$pricePart';
}

double getTemplateBundlePrice(Map<String, dynamic> pkg) =>
    double.tryParse('${pkg['package_price'] ?? 0}') ?? 0;

List<String> resolveTemplateServiceIds(
  Map<String, dynamic> pkg,
  List<SalonService> allServices,
) =>
    resolvePackageServiceIds({'package': pkg}, allServices);

List<String> resolvePackageServiceIds(
  Map<String, dynamic> cp,
  List<SalonService> allServices,
) {
  final pkg = packageOf(cp) ??
      (cp.containsKey('package_price') || cp.containsKey('services')
          ? cp
          : null);
  final ids = packageTemplateServiceIds(pkg);
  if (ids.isEmpty) return const [];

  final byId = <String, SalonService>{
    for (final s in allServices) s.id: s,
  };

  // Keep full package order. Prefer ids that exist in salon list; if none
  // match, still return package ids so UI can select them.
  final matched = <String>[];
  final missing = <String>[];
  for (final id in ids) {
    final key = '$id';
    if (byId.containsKey(key)) {
      matched.add(key);
    } else {
      missing.add(key);
    }
  }
  if (matched.isNotEmpty) return [...matched, ...missing];
  return ids.map((id) => '$id').toList(growable: false);
}

/// Active services plus any currently selected ids (so package picks stay visible).
List<SalonService> servicesForPackagePicker(
  List<SalonService> allServices,
  List<String> selectedIds,
) {
  final selected = selectedIds.toSet();
  final out = <SalonService>[];
  final seen = <String>{};
  final byId = <String, SalonService>{
    for (final s in allServices) s.id: s,
  };
  for (final s in allServices) {
    if (!s.isActive && !selected.contains(s.id)) continue;
    if (seen.add(s.id)) out.add(s);
  }
  // Keep package-only ids visible even if missing from the loaded catalog.
  for (final id in selectedIds) {
    if (!seen.add(id)) continue;
    final known = byId[id];
    out.add(
      known ??
          SalonService(
            id: id,
            name: 'Service #$id',
            category: 'Package',
            price: 0,
            durationMinutes: 30,
            isActive: true,
          ),
    );
  }
  return out;
}

/// Apply package service ids → primary + extras (mutates [extras]).
void applyResolvedServiceIds({
  required List<String> ids,
  required void Function(String?) setPrimary,
  required List<String> extras,
}) {
  extras.clear();
  if (ids.isEmpty) {
    setPrimary(null);
    return;
  }
  setPrimary(ids.first);
  extras.addAll(ids.skip(1));
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
  final fromPkg = double.tryParse(
        '${pkg?['package_price'] ?? cp['package_price'] ?? 0}',
      ) ??
      0;
  if (fromPkg > 0) return fromPkg;
  return double.tryParse('${cp['amount_paid'] ?? 0}') ?? 0;
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

/// Safe dropdown value — avoids assert crash when id is not in [templates].
String safePackageTemplateDropdownValue(
  String selectedTemplateId,
  List<Map<String, dynamic>> templates,
) {
  if (selectedTemplateId.isEmpty) return '';
  for (final p in templates) {
    if ('${p['id']}' == selectedTemplateId) return selectedTemplateId;
  }
  return '';
}
