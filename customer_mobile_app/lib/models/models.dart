class SalonService {
  SalonService({
    required this.id,
    required this.name,
    this.category,
    this.durationMinutes = 30,
    this.description,
  });

  final int id;
  final String name;
  final String? category;
  final int durationMinutes;
  final String? description;

  factory SalonService.fromJson(Map<String, dynamic> j) => SalonService(
        id: int.tryParse('${j['id']}') ?? 0,
        name: '${j['name'] ?? ''}',
        category: j['category']?.toString(),
        durationMinutes: int.tryParse('${j['duration_minutes'] ?? 30}') ?? 30,
        description: j['description']?.toString(),
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

class MobileOfferItem {
  MobileOfferItem({
    required this.id,
    required this.title,
    required this.body,
    this.imageUrl,
    this.startsAt,
    this.endsAt,
  });

  final int id;
  final String title;
  final String body;
  final String? imageUrl;
  final String? startsAt;
  final String? endsAt;

  factory MobileOfferItem.fromJson(Map<String, dynamic> j) => MobileOfferItem(
        id: int.tryParse('${j['id']}') ?? 0,
        title: '${j['title'] ?? ''}',
        body: '${j['body'] ?? ''}',
        imageUrl: j['image_url']?.toString(),
        startsAt: j['starts_at']?.toString(),
        endsAt: j['ends_at']?.toString(),
      );
}
