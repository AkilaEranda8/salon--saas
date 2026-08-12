class CommissionRecord {
  CommissionRecord({
    required this.paymentId,
    required this.date,
    required this.customerName,
    required this.serviceName,
    required this.totalAmount,
    required this.commissionAmount,
    this.role = 'worker',
    this.transactionId = '',
  });

  final String paymentId;
  final String date;
  final String customerName;
  final String serviceName;
  final double totalAmount;
  final double commissionAmount;
  /// worker | co_worker | helper | manager_oversight
  final String role;
  final String transactionId;

  factory CommissionRecord.fromJson(Map<String, dynamic> json) {
    final serviceMap = json['service'] is Map
        ? Map<String, dynamic>.from(json['service'])
        : const <String, dynamic>{};
    final appointmentMap = json['appointment'] is Map
        ? Map<String, dynamic>.from(json['appointment'])
        : const <String, dynamic>{};

    final names = <String>[];
    void addName(String n) {
      final t = n.trim();
      if (t.isNotEmpty && !names.contains(t)) names.add(t);
    }

    final rawStaff = json['service_staff'];
    if (rawStaff is List) {
      for (final row in rawStaff) {
        if (row is Map) addName('${row['service_name'] ?? ''}');
      }
    }
    final rawSvcs = json['services'];
    if (rawSvcs is List) {
      for (final row in rawSvcs) {
        if (row is Map) addName('${row['name'] ?? ''}');
      }
    }
    final bd = json['commission_breakdown'];
    if (bd is Map && bd['lines'] is List) {
      for (final row in bd['lines'] as List) {
        if (row is Map) {
          addName('${row['serviceName'] ?? row['service_name'] ?? ''}');
        }
      }
    }
    addName('${serviceMap['name'] ?? ''}');

    final commissionRaw =
        json['display_commission_amount'] ?? json['commission_amount'];
    final totalRaw = json['total_amount'];
    return CommissionRecord(
      paymentId: '${json['id'] ?? ''}',
      date: '${json['date'] ?? ''}',
      customerName:
          '${json['customer_name'] ?? appointmentMap['customer_name'] ?? 'Walk-in'}',
      serviceName: names.join(', '),
      totalAmount:
          totalRaw is num ? totalRaw.toDouble() : double.tryParse('$totalRaw') ?? 0,
      commissionAmount: commissionRaw is num
          ? commissionRaw.toDouble()
          : double.tryParse('$commissionRaw') ?? 0,
      role: '${json['commission_role'] ?? 'worker'}',
      transactionId: '${json['commission_transaction_id'] ?? ''}',
    );
  }
}
