class CommissionRecord {
  CommissionRecord({
    required this.paymentId,
    required this.date,
    required this.customerName,
    required this.serviceName,
    required this.totalAmount,
    required this.commissionAmount,
  });

  final String paymentId;
  final String date;
  final String customerName;
  final String serviceName;
  final double totalAmount;
  final double commissionAmount;

  factory CommissionRecord.fromJson(Map<String, dynamic> json) {
    final serviceMap = json['service'] is Map ? Map<String, dynamic>.from(json['service']) : const <String, dynamic>{};
    final appointmentMap = json['appointment'] is Map
        ? Map<String, dynamic>.from(json['appointment'])
        : const <String, dynamic>{};
    final totalRaw = json['total_amount'];
    final commissionRaw = json['commission_amount'];
    return CommissionRecord(
      paymentId: '${json['id'] ?? ''}',
      date: '${json['date'] ?? ''}',
      customerName: '${json['customer_name'] ?? appointmentMap['customer_name'] ?? 'Walk-in'}',
      serviceName: '${serviceMap['name'] ?? ''}',
      totalAmount: totalRaw is num ? totalRaw.toDouble() : double.tryParse('$totalRaw') ?? 0,
      commissionAmount: commissionRaw is num ? commissionRaw.toDouble() : double.tryParse('$commissionRaw') ?? 0,
    );
  }
}
