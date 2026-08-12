import '../utils/appointment_notes.dart';
import 'salon_service.dart';

class AppointmentServiceStaff {
  AppointmentServiceStaff({
    required this.serviceId,
    required this.staffId,
    this.serviceName = '',
    this.staffName = '',
    this.date = '',
    this.time = '',
  });

  final String serviceId;
  final String staffId;
  final String serviceName;
  final String staffName;
  final String date;
  final String time;
}

class Appointment {
  Appointment({
    required this.id,
    required this.customerName,
    required this.serviceName,
    required this.date,
    required this.time,
    required this.status,
    required this.createdBy,
    this.serviceId = '',
    this.serviceIds = const [],
    this.primaryDurationMinutes = 0,
    this.branchId = '',
    this.phone = '',
    this.notes = '',
    this.amount = 0,
    this.staffId = '',
    this.customerId = '',
    this.branchName = '',
    this.isRecurring = false,
    this.recurringNextDate = '',
    this.recurringMessageTemplateIds = const [],
    this.advancePaid = 0,
    this.amountPaid = 0,
    this.advanceSplits = const [],
    this.serviceStaff = const [],
  });

  final String id;
  final String customerName;
  final String serviceName;
  final String date;
  final String time;
  final String status;
  final String createdBy;
  final String serviceId;
  /// Ordered IDs from API (`appointment_services` / `service_ids`); preferred over notes for display.
  final List<String> serviceIds;
  /// Primary service duration from API (`service.duration_minutes`).
  final int primaryDurationMinutes;
  final String branchId;
  final String phone;
  final String notes;
  final double amount;
  final String staffId;
  final String customerId;
  final String branchName;
  final bool isRecurring;
  final String recurringNextDate;
  final List<String> recurringMessageTemplateIds;
  /// Booking deposit already collected (commission settled on final pay).
  final double advancePaid;
  final double amountPaid;
  /// Advance payment method splits from API (`advance_splits`).
  final List<Map<String, dynamic>> advanceSplits;
  final List<AppointmentServiceStaff> serviceStaff;

  List<String> get distinctStaffIds {
    final ids = <String>[];
    for (final l in serviceStaff) {
      final id = l.staffId.trim();
      if (id.isEmpty || id == '0' || id == 'null') continue;
      if (!ids.contains(id)) ids.add(id);
    }
    return ids;
  }

  bool get hasMultiStaff => distinctStaffIds.length > 1;

  String get staffNamesDisplay {
    final names = <String>[];
    for (final l in serviceStaff) {
      final n = l.staffName.trim();
      if (n.isNotEmpty && !names.contains(n)) names.add(n);
    }
    if (names.isNotEmpty) return names.join(', ');
    return createdBy;
  }

  /// Primary + additional service names (from notes), de-duplicated, order preserved.
  String get servicesDisplay {
    final out = <String>[];
    if (serviceName.isNotEmpty) out.add(serviceName);
    for (final n in AppointmentNotes.parseAdditionalServiceNames(notes)) {
      if (!out.contains(n)) out.add(n);
    }
    return out.join(', ');
  }

  /// Uses [serviceIds] + catalog when present (matches DB); otherwise [servicesDisplay] / primary name.
  String resolveServicesDisplay(Iterable<SalonService> catalog) {
    if (serviceIds.isNotEmpty) {
      final byId = <String, String>{};
      for (final s in catalog) {
        byId[s.id] = s.name;
      }
      final names = <String>[];
      for (final id in serviceIds) {
        final n = byId[id];
        if (n != null && n.isNotEmpty) names.add(n);
      }
      if (names.isNotEmpty) return names.join(', ');
    }
    final legacy = servicesDisplay;
    if (legacy.isNotEmpty) return legacy;
    return serviceName;
  }

  /// Total blocked minutes: sum linked services from catalog, else primary.
  int resolveDurationMinutes(Iterable<SalonService> catalog) {
    if (serviceIds.isNotEmpty) {
      final byId = <String, int>{};
      for (final s in catalog) {
        byId[s.id] = s.durationMinutes;
      }
      var sum = 0;
      for (final id in serviceIds) {
        final d = byId[id] ?? 0;
        if (d > 0) sum += d;
      }
      if (sum > 0) return sum;
    }
    if (primaryDurationMinutes > 0) return primaryDurationMinutes;
    if (serviceId.isNotEmpty) {
      for (final s in catalog) {
        if (s.id == serviceId && s.durationMinutes > 0) return s.durationMinutes;
      }
    }
    return 60;
  }

  double get displayAmount {
    if (amount > 0) return amount;
    return 0;
  }

  double get remainingDue {
    final paid = advancePaid > 0 ? advancePaid : amountPaid;
    return (displayAmount - paid).clamp(0, double.infinity);
  }

  factory Appointment.fromJson(Map<String, dynamic> json) {
    final service = json['service'];
    final staff = json['staff'];
    final customer = json['customer'];
    final branch = json['branch'];
    final rawAmount = json['amount'];
    final amt = rawAmount is num
        ? rawAmount.toDouble()
        : double.tryParse('$rawAmount') ?? 0;
    final rawIds = json['service_ids'];
    final parsedIds = <String>[];
    if (rawIds is List) {
      for (final e in rawIds) {
        final s = '$e'.trim();
        if (s.isNotEmpty && s != 'null') parsedIds.add(s);
      }
    }
    final rawTplIds = json['recurring_message_template_ids'];
    final parsedTplIds = <String>[];
    if (rawTplIds is List) {
      for (final e in rawTplIds) {
        final s = '$e'.trim();
        if (s.isNotEmpty && s != 'null') parsedTplIds.add(s);
      }
    } else {
      final legacy = '${json['recurring_message_template_id'] ?? ''}'.trim();
      if (legacy.isNotEmpty && legacy != 'null') parsedTplIds.add(legacy);
    }
    double parseMoney(dynamic v) {
      if (v is num) return v.toDouble();
      return double.tryParse('$v') ?? 0;
    }
    final advanceSplits = <Map<String, dynamic>>[];
    final rawSplits = json['advance_splits'];
    if (rawSplits is List) {
      for (final e in rawSplits) {
        if (e is Map) {
          advanceSplits.add(Map<String, dynamic>.from(e));
        }
      }
    }
    final serviceStaff = <AppointmentServiceStaff>[];
    final rawSs = json['service_staff'];
    if (rawSs is List) {
      for (final e in rawSs) {
        if (e is! Map) continue;
        final m = Map<String, dynamic>.from(e);
        final sid = '${m['service_id'] ?? ''}'.trim();
        final stid = '${m['staff_id'] ?? ''}'.trim();
        final time = '${m['time'] ?? ''}'.trim();
        serviceStaff.add(AppointmentServiceStaff(
          serviceId: sid,
          staffId: stid,
          serviceName: '${m['service_name'] ?? ''}'.trim(),
          staffName: '${m['staff_name'] ?? ''}'.trim(),
          date: '${m['date'] ?? ''}'.trim(),
          time: time.length >= 5 ? time.substring(0, 5) : time,
        ));
      }
    }
    return Appointment(
      id: '${json['id']}',
      customerName: '${json['customer_name'] ?? ''}',
      serviceName: '${service is Map ? service['name'] ?? '' : ''}',
      date: '${json['date'] ?? ''}'.trim().length >= 10
          ? '${json['date']}'.trim().substring(0, 10)
          : '${json['date'] ?? ''}',
      time: () {
        final raw = '${json['time'] ?? ''}'.trim();
        final m = RegExp(r'(\d{1,2}):(\d{2})').firstMatch(raw);
        if (m == null) return raw.length >= 5 ? raw.substring(0, 5) : raw;
        return '${m.group(1)!.padLeft(2, '0')}:${m.group(2)}';
      }(),
      status: '${json['status'] ?? 'pending'}',
      createdBy: '${staff is Map ? staff['name'] ?? '' : ''}',
      serviceId: '${json['service_id'] ?? service?['id'] ?? ''}',
      serviceIds: parsedIds,
      primaryDurationMinutes: () {
        if (service is Map) {
          final d = int.tryParse('${service['duration_minutes'] ?? 0}') ?? 0;
          if (d > 0) return d;
        }
        final top = int.tryParse('${json['duration_minutes'] ?? 0}') ?? 0;
        return top > 0 ? top : 0;
      }(),
      branchId: '${json['branch_id'] ?? (branch is Map ? branch['id'] ?? '' : '')}',
      phone: '${json['phone'] ?? (customer is Map ? customer['phone'] ?? '' : '')}',
      notes: '${json['notes'] ?? ''}',
      amount: amt,
      staffId: '${json['staff_id'] ?? staff?['id'] ?? ''}',
      customerId: '${json['customer_id'] ?? customer?['id'] ?? ''}',
      branchName: '${branch is Map ? branch['name'] ?? '' : ''}',
      isRecurring: json['is_recurring'] == true,
      recurringNextDate: '${json['recurring_next_date'] ?? ''}'.trim(),
      recurringMessageTemplateIds: parsedTplIds,
      advancePaid: parseMoney(json['advance_paid']),
      amountPaid: parseMoney(json['amount_paid']),
      advanceSplits: advanceSplits,
      serviceStaff: serviceStaff,
    );
  }
}
