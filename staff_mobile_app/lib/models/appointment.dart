import '../utils/appointment_notes.dart';
import 'salon_service.dart';

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
    return Appointment(
      id: '${json['id']}',
      customerName: '${json['customer_name'] ?? ''}',
      serviceName: '${service is Map ? service['name'] ?? '' : ''}',
      date: '${json['date'] ?? ''}',
      time: '${json['time'] ?? ''}',
      status: '${json['status'] ?? 'pending'}',
      createdBy: '${staff is Map ? staff['name'] ?? '' : ''}',
      serviceId: '${json['service_id'] ?? service?['id'] ?? ''}',
      serviceIds: parsedIds,
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
    );
  }
}
