class WalkInEntry {
  WalkInEntry({
    required this.id,
    required this.token,
    required this.customerName,
    required this.phone,
    required this.status,
    required this.branchId,
    required this.serviceId,
    required this.serviceName,
    required this.staffId,
    required this.staffName,
    required this.estimatedWait,
    required this.note,
    this.customerId = '',
    this.totalAmount = 0,
    this.walkInServicesPayload,
    this.createdAt,
  });

  final String id;
  final String token;
  final String customerName;
  final String phone;
  final String status;
  final String branchId;
  final String serviceId;
  final String serviceName;
  final String staffId;
  final String staffName;
  final int estimatedWait;
  final String note;
  /// Linked CRM customer when check-in selected an existing client.
  final String customerId;
  /// Sum of selected services (from API `total_amount`).
  final double totalAmount;

  /// Raw `walkInServices` rows from API (for cache). Optional.
  final List<Map<String, dynamic>>? walkInServicesPayload;

  /// Server `createdAt` (newest-first queue ordering).
  final DateTime? createdAt;

  /// Sort in place: newest first, then higher numeric [id].
  static void sortNewestFirst(List<WalkInEntry> list) {
    int idRank(WalkInEntry e) => int.tryParse(e.id) ?? 0;
    list.sort((a, b) {
      final ca = a.createdAt;
      final cb = b.createdAt;
      if (ca != null && cb != null) {
        final c = cb.compareTo(ca);
        if (c != 0) return c;
      } else if (ca != null) {
        return -1;
      } else if (cb != null) {
        return 1;
      }
      return idRank(b).compareTo(idRank(a));
    });
  }

  /// Service line IDs in queue order (primary first). Used for payments / display.
  List<String> get orderedServiceIds {
    final lines = walkInServicesPayload;
    if (lines != null && lines.isNotEmpty) {
      final sorted = List<Map<String, dynamic>>.from(lines);
      sorted.sort((a, b) {
        final ao = a['sort_order'];
        final bo = b['sort_order'];
        final ai = ao is num ? ao.toInt() : int.tryParse('$ao') ?? 0;
        final bi = bo is num ? bo.toInt() : int.tryParse('$bo') ?? 0;
        return ai.compareTo(bi);
      });
      return sorted
          .map((m) => '${m['service_id'] ?? ''}'.trim())
          .where((s) => s.isNotEmpty && s != 'null')
          .toList();
    }
    if (serviceId.isNotEmpty) return [serviceId];
    return const [];
  }

  factory WalkInEntry.fromJson(Map<String, dynamic> json) {
    final service = json['service'] is Map ? Map<String, dynamic>.from(json['service']) : const <String, dynamic>{};
    final staff = json['staff'] is Map ? Map<String, dynamic>.from(json['staff']) : const <String, dynamic>{};
    final customerMap = json['customer'] is Map
        ? Map<String, dynamic>.from(json['customer'])
        : const <String, dynamic>{};
    final rawTotal = json['total_amount'];
    final total = rawTotal is num
        ? rawTotal.toDouble()
        : double.tryParse('$rawTotal') ?? 0.0;

    List<Map<String, dynamic>>? linesPayload;
    var displayName = '${service['name'] ?? ''}';
    final wiq = json['queueServices'] ?? json['walkInServices'] ?? json['queue_services'];
    if (wiq is List && wiq.isNotEmpty) {
      linesPayload = wiq
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
      final names = <String>[];
      for (final m in linesPayload) {
        final nested = m['service'];
        if (nested is Map) {
          final n = '${Map<String, dynamic>.from(nested)['name'] ?? ''}'.trim();
          if (n.isNotEmpty) names.add(n);
        }
      }
      if (names.isNotEmpty) displayName = names.join(', ');
    }

    DateTime? created;
    final rawCreated = json['createdAt'] ?? json['created_at'];
    if (rawCreated != null) {
      if (rawCreated is DateTime) {
        created = rawCreated;
      } else {
        created = DateTime.tryParse(rawCreated.toString());
      }
    }

    return WalkInEntry(
      id: '${json['id'] ?? ''}',
      token: '${json['token'] ?? ''}',
      customerName: '${json['customer_name'] ?? ''}',
      phone: '${json['phone'] ?? ''}',
      status: '${json['status'] ?? 'waiting'}',
      branchId: '${json['branch_id'] ?? ''}',
      serviceId: '${json['service_id'] ?? service['id'] ?? ''}',
      serviceName: displayName,
      staffId: '${json['staff_id'] ?? staff['id'] ?? ''}',
      staffName: '${staff['name'] ?? ''}',
      estimatedWait: int.tryParse('${json['estimated_wait'] ?? 0}') ?? 0,
      note: '${json['note'] ?? ''}',
      customerId: '${json['customer_id'] ?? customerMap['id'] ?? ''}',
      totalAmount: total,
      walkInServicesPayload: linesPayload,
      createdAt: created,
    );
  }

  Map<String, dynamic> toJson() {
    final sid = int.tryParse(staffId);
    final map = <String, dynamic>{
      'id': int.tryParse(id) ?? id,
      'token': token,
      'customer_name': customerName,
      'phone': phone,
      'status': status,
      'branch_id': int.tryParse(branchId) ?? branchId,
      'service_id': int.tryParse(serviceId) ?? serviceId,
      'staff_id': staffId.isEmpty ? null : (sid ?? staffId),
      'estimated_wait': estimatedWait,
      'note': note,
      'customer_id': customerId.isEmpty ? null : (int.tryParse(customerId) ?? customerId),
      'total_amount': totalAmount,
      'service': {
        'id': int.tryParse(serviceId) ?? serviceId,
        'name': serviceName,
      },
    };
    if (staffId.isNotEmpty) {
      map['staff'] = {'id': sid ?? staffId, 'name': staffName};
    }
    final wiq = walkInServicesPayload;
    if (wiq != null && wiq.isNotEmpty) {
      map['walkInServices'] = wiq;
    }
    final c = createdAt;
    if (c != null) {
      map['created_at'] = c.toIso8601String();
    }
    return map;
  }
}
