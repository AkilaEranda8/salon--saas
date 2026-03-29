class PaymentSplitRecord {
  PaymentSplitRecord({
    required this.method,
    required this.amount,
  });

  final String method;
  final double amount;

  factory PaymentSplitRecord.fromJson(Map<String, dynamic> json) {
    final rawAmount = json['amount'];
    final parsedAmount = rawAmount is num ? rawAmount.toDouble() : double.tryParse('$rawAmount') ?? 0;
    return PaymentSplitRecord(
      method: '${json['method'] ?? ''}',
      amount: parsedAmount,
    );
  }
}

class PaymentRecord {
  PaymentRecord({
    required this.id,
    required this.customerName,
    required this.staffName,
    required this.serviceName,
    required this.totalAmount,
    required this.loyaltyDiscount,
    required this.promoDiscount,
    required this.commissionAmount,
    required this.date,
    required this.splits,
  });

  final String id;
  final String customerName;
  final String staffName;
  final String serviceName;
  final double totalAmount;
  final double loyaltyDiscount;
  final double promoDiscount;
  final double commissionAmount;
  final String date;
  final List<PaymentSplitRecord> splits;

  double get netAmount => totalAmount - loyaltyDiscount - promoDiscount;

  factory PaymentRecord.fromJson(Map<String, dynamic> json) {
    final rawTotal = json['total_amount'];
    final rawLoyalty = json['loyalty_discount'];
    final rawPromo = json['promo_discount'];
    final rawCommission = json['commission_amount'];
    final splitRows = (json['splits'] as List? ?? const []);
    final customerMap = json['customer'] is Map ? Map<String, dynamic>.from(json['customer']) : const <String, dynamic>{};
    final staffMap = json['staff'] is Map ? Map<String, dynamic>.from(json['staff']) : const <String, dynamic>{};
    final serviceMap = json['service'] is Map ? Map<String, dynamic>.from(json['service']) : const <String, dynamic>{};
    return PaymentRecord(
      id: '${json['id'] ?? ''}',
      customerName: '${json['customer_name'] ?? customerMap['name'] ?? 'Walk-in'}',
      staffName: '${staffMap['name'] ?? ''}',
      serviceName: '${serviceMap['name'] ?? ''}',
      totalAmount: rawTotal is num ? rawTotal.toDouble() : double.tryParse('$rawTotal') ?? 0,
      loyaltyDiscount: rawLoyalty is num ? rawLoyalty.toDouble() : double.tryParse('$rawLoyalty') ?? 0,
      promoDiscount: rawPromo is num ? rawPromo.toDouble() : double.tryParse('$rawPromo') ?? 0,
      commissionAmount: rawCommission is num ? rawCommission.toDouble() : double.tryParse('$rawCommission') ?? 0,
      date: '${json['date'] ?? ''}',
      splits: splitRows
          .whereType<Map>()
          .map((row) => PaymentSplitRecord.fromJson(Map<String, dynamic>.from(row)))
          .toList(),
    );
  }
}
