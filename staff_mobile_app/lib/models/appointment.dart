import '../utils/appointment_notes.dart';

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
    this.branchId = '',
    this.phone = '',
    this.notes = '',
    this.amount = 0,
    this.staffId = '',
    this.customerId = '',
    this.branchName = '',
  });

  final String id;
  final String customerName;
  final String serviceName;
  final String date;
  final String time;
  final String status;
  final String createdBy;
  final String serviceId;
  final String branchId;
  final String phone;
  final String notes;
  final double amount;
  final String staffId;
  final String customerId;
  final String branchName;

  /// Primary + additional service names (from notes), de-duplicated, order preserved.
  String get servicesDisplay {
    final out = <String>[];
    if (serviceName.isNotEmpty) out.add(serviceName);
    for (final n in AppointmentNotes.parseAdditionalServiceNames(notes)) {
      if (!out.contains(n)) out.add(n);
    }
    return out.join(', ');
  }

  double get displayAmount {
    if (amount > 0) return amount;
    return 0;
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
    return Appointment(
      id: '${json['id']}',
      customerName: '${json['customer_name'] ?? ''}',
      serviceName: '${service is Map ? service['name'] ?? '' : ''}',
      date: '${json['date'] ?? ''}',
      time: '${json['time'] ?? ''}',
      status: '${json['status'] ?? 'pending'}',
      createdBy: '${staff is Map ? staff['name'] ?? '' : ''}',
      serviceId: '${json['service_id'] ?? service?['id'] ?? ''}',
      branchId: '${json['branch_id'] ?? (branch is Map ? branch['id'] ?? '' : '')}',
      phone: '${json['phone'] ?? (customer is Map ? customer['phone'] ?? '' : '')}',
      notes: '${json['notes'] ?? ''}',
      amount: amt,
      staffId: '${json['staff_id'] ?? staff?['id'] ?? ''}',
      customerId: '${json['customer_id'] ?? customer?['id'] ?? ''}',
      branchName: '${branch is Map ? branch['name'] ?? '' : ''}',
    );
  }
}
