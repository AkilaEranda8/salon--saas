class SalonService {
  SalonService({
    required this.id,
    required this.name,
    this.category,
    this.durationMinutes = 30,
    this.description,
    this.price,
    this.imageUrl,
  });

  final int id;
  final String name;
  final String? category;
  final int durationMinutes;
  final String? description;
  final double? price;
  final String? imageUrl;

  factory SalonService.fromJson(Map<String, dynamic> j) => SalonService(
        id: int.tryParse('${j['id']}') ?? 0,
        name: '${j['name'] ?? ''}',
        category: j['category']?.toString(),
        durationMinutes: int.tryParse('${j['duration_minutes'] ?? 30}') ?? 30,
        description: j['description']?.toString(),
        price: double.tryParse('${j['price'] ?? ''}'),
        imageUrl: j['image_url']?.toString(),
      );
}

class SalonStaff {
  SalonStaff({
    required this.id,
    required this.name,
    this.photoUrl,
    this.serviceIds = const [],
  });

  final int id;
  final String name;
  final String? photoUrl;
  final List<int> serviceIds;

  factory SalonStaff.fromJson(Map<String, dynamic> j) {
    final raw = j['service_ids'];
    final ids = <int>[];
    if (raw is List) {
      for (final v in raw) {
        final n = int.tryParse('$v');
        if (n != null) ids.add(n);
      }
    }
    return SalonStaff(
      id: int.tryParse('${j['id']}') ?? 0,
      name: '${j['name'] ?? ''}',
      photoUrl: j['photo_url']?.toString(),
      serviceIds: ids,
    );
  }
}

class CustomerProfile {
  CustomerProfile({
    required this.name,
    required this.phone,
    this.loyaltyPoints = 0,
  });

  final String name;
  final String phone;
  final int loyaltyPoints;

  factory CustomerProfile.fromJson(Map<String, dynamic> j) => CustomerProfile(
        name: '${j['name'] ?? 'Customer'}',
        phone: '${j['phone'] ?? ''}',
        loyaltyPoints: int.tryParse('${j['loyalty_points'] ?? 0}') ?? 0,
      );
}

class BookingItem {
  BookingItem({
    required this.id,
    required this.customerName,
    required this.phone,
    required this.date,
    required this.time,
    required this.status,
    this.serviceName,
    this.staffName,
    this.branchName,
    this.serviceId,
    this.staffId,
    this.durationMinutes,
  });

  final int id;
  final String customerName;
  final String phone;
  final String date;
  final String time;
  final String status;
  final String? serviceName;
  final String? staffName;
  final String? branchName;
  final int? serviceId;
  final int? staffId;
  final int? durationMinutes;

  factory BookingItem.fromJson(Map<String, dynamic> j) {
    final service = j['service'];
    final staff = j['staff'];
    final branch = j['branch'];
    return BookingItem(
      id: int.tryParse('${j['id']}') ?? 0,
      customerName: '${j['customer_name'] ?? ''}',
      phone: '${j['phone'] ?? ''}',
      date: '${j['date'] ?? ''}'.substring(0, '${j['date'] ?? ''}'.length.clamp(0, 10)),
      time: '${j['time'] ?? ''}',
      status: '${j['status'] ?? 'pending'}',
      serviceName: service is Map ? service['name']?.toString() : null,
      staffName: staff is Map ? staff['name']?.toString() : null,
      branchName: branch is Map ? branch['name']?.toString() : null,
      serviceId: int.tryParse('${j['service_id'] ?? ''}'),
      staffId: int.tryParse('${j['staff_id'] ?? ''}'),
      durationMinutes: service is Map
          ? int.tryParse('${service['duration_minutes'] ?? ''}')
          : null,
    );
  }

  bool get isUpcoming {
    final d = DateTime.tryParse(date);
    if (d == null) return status == 'pending' || status == 'confirmed';
    final today = DateTime.now();
    final day = DateTime(d.year, d.month, d.day);
    final now = DateTime(today.year, today.month, today.day);
    if (day.isBefore(now)) return false;
    return !['cancelled', 'completed', 'no_show'].contains(status);
  }
}

class UsedProductItem {
  UsedProductItem({
    required this.id,
    required this.consumptionDate,
    required this.quantityUsed,
    required this.unit,
    this.productName,
    this.serviceName,
    this.staffName,
    this.productType,
  });

  final int id;
  final String consumptionDate;
  final double quantityUsed;
  final String unit;
  final String? productName;
  final String? serviceName;
  final String? staffName;
  final String? productType;

  factory UsedProductItem.fromJson(Map<String, dynamic> j) {
    final product = j['product'];
    final service = j['service'];
    final staff = j['staff'];
    final dateRaw = '${j['consumption_date'] ?? ''}';
    return UsedProductItem(
      id: int.tryParse('${j['id']}') ?? 0,
      consumptionDate: dateRaw.length >= 10 ? dateRaw.substring(0, 10) : dateRaw,
      quantityUsed: double.tryParse('${j['quantity_used'] ?? 0}') ?? 0,
      unit: '${j['unit'] ?? 'pcs'}',
      productName: product is Map ? product['name']?.toString() : null,
      serviceName: service is Map ? service['name']?.toString() : null,
      staffName: staff is Map ? staff['name']?.toString() : null,
      productType: product is Map ? product['product_type']?.toString() : null,
    );
  }

  String get qtyLabel {
    final q = quantityUsed == quantityUsed.roundToDouble()
        ? quantityUsed.toInt().toString()
        : quantityUsed.toStringAsFixed(1);
    return '$q $unit';
  }
}

class UsedProductSummary {
  UsedProductSummary({
    required this.productId,
    required this.name,
    required this.timesUsed,
    required this.totalQty,
    required this.unit,
    this.lastUsed,
    this.sku,
  });

  final int productId;
  final String name;
  final int timesUsed;
  final double totalQty;
  final String unit;
  final String? lastUsed;
  final String? sku;

  factory UsedProductSummary.fromJson(Map<String, dynamic> j) {
    final last = '${j['last_used'] ?? ''}';
    return UsedProductSummary(
      productId: int.tryParse('${j['product_id']}') ?? 0,
      name: '${j['name'] ?? 'Product'}',
      timesUsed: int.tryParse('${j['times_used'] ?? 0}') ?? 0,
      totalQty: double.tryParse('${j['total_qty'] ?? 0}') ?? 0,
      unit: '${j['unit'] ?? 'pcs'}',
      lastUsed: last.length >= 10 ? last.substring(0, 10) : (last.isEmpty ? null : last),
      sku: j['sku']?.toString(),
    );
  }
}

class CustomerHistory {
  CustomerHistory({
    required this.visits,
    required this.usedProducts,
    required this.usedProductsSummary,
  });

  final List<BookingItem> visits;
  final List<UsedProductItem> usedProducts;
  final List<UsedProductSummary> usedProductsSummary;

  factory CustomerHistory.fromJson(Map<String, dynamic> j) {
    final visitsRaw = j['visits'];
    final productsRaw = j['used_products'];
    final summaryRaw = j['used_products_summary'];
    return CustomerHistory(
      visits: visitsRaw is List
          ? visitsRaw
              .whereType<Map>()
              .map((e) => BookingItem.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
      usedProducts: productsRaw is List
          ? productsRaw
              .whereType<Map>()
              .map((e) => UsedProductItem.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
      usedProductsSummary: summaryRaw is List
          ? summaryRaw
              .whereType<Map>()
              .map((e) => UsedProductSummary.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
    );
  }
}

class MobileOfferItem {
  MobileOfferItem({
    required this.id,
    required this.title,
    required this.body,
    this.imageUrl,
    this.category,
    this.badgeText,
    this.originalPrice,
    this.offerPrice,
    this.startsAt,
    this.endsAt,
  });

  final int id;
  final String title;
  final String body;
  final String? imageUrl;
  final String? category;
  final String? badgeText;
  final double? originalPrice;
  final double? offerPrice;
  final String? startsAt;
  final String? endsAt;

  factory MobileOfferItem.fromJson(Map<String, dynamic> j) => MobileOfferItem(
        id: int.tryParse('${j['id']}') ?? 0,
        title: '${j['title'] ?? ''}',
        body: '${j['body'] ?? ''}',
        imageUrl: j['image_url']?.toString(),
        category: j['category']?.toString(),
        badgeText: j['badge_text']?.toString(),
        originalPrice: double.tryParse('${j['original_price'] ?? ''}'),
        offerPrice: double.tryParse('${j['offer_price'] ?? ''}'),
        startsAt: j['starts_at']?.toString(),
        endsAt: j['ends_at']?.toString(),
      );

  String get categoryLabel {
    final c = (category ?? '').trim();
    return c.isEmpty ? 'Deals' : c;
  }

  /// e.g. "25% off" or custom badge_text.
  String? get displayBadge {
    final custom = (badgeText ?? '').trim();
    if (custom.isNotEmpty) return custom;
    final o = originalPrice;
    final p = offerPrice;
    if (o != null && p != null && o > 0 && p < o) {
      final pct = (((o - p) / o) * 100).round();
      if (pct > 0) return '$pct% off';
    }
    return null;
  }

  /// Days remaining until ends_at (null if unknown / no end).
  int? get daysLeft {
    final raw = (endsAt ?? '').trim();
    if (raw.isEmpty) return null;
    final end = DateTime.tryParse(raw.substring(0, raw.length.clamp(0, 10)));
    if (end == null) return null;
    final today = DateTime.now();
    final a = DateTime(today.year, today.month, today.day);
    final b = DateTime(end.year, end.month, end.day);
    return b.difference(a).inDays;
  }

  String? get daysLeftLabel {
    final d = daysLeft;
    if (d == null) return null;
    if (d < 0) return 'Ended';
    if (d == 0) return 'Ends today';
    if (d == 1) return '1 day left';
    return '$d days left';
  }
}
