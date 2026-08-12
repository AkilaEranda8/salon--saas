class PaymentSplitRecord {
  PaymentSplitRecord({
    required this.method,
    required this.amount,
  });

  final String method;
  final double amount;

  factory PaymentSplitRecord.fromJson(Map<String, dynamic> json) {
    return PaymentSplitRecord(
      method: '${json['method'] ?? ''}',
      amount: _asDouble(json['amount']),
    );
  }
}

class PaymentServiceLine {
  PaymentServiceLine({
    required this.serviceName,
    this.staffName = '',
    this.date = '',
    this.time = '',
  });

  final String serviceName;
  final String staffName;
  final String date;
  final String time;
}

class PaymentCommissionLine {
  PaymentCommissionLine({
    required this.staffName,
    required this.amount,
  });

  final String staffName;
  final double amount;
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
    this.phone = '',
    this.branchName = '',
    this.status = 'paid',
    this.isAdvance = false,
    this.pointsEarned = 0,
    this.managerCommission = 0,
    this.createdAt = '',
    this.appointmentLabel = '',
    this.serviceLines = const [],
    this.commissionLines = const [],
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
  final String phone;
  final String branchName;
  final String status;
  final bool isAdvance;
  final double pointsEarned;
  final double managerCommission;
  final String createdAt;
  final String appointmentLabel;
  final List<PaymentServiceLine> serviceLines;
  final List<PaymentCommissionLine> commissionLines;

  double get netAmount => totalAmount;
  double get grossAmount => totalAmount + loyaltyDiscount + promoDiscount;
  double get totalCommission {
    if (commissionLines.isNotEmpty) {
      return commissionLines.fold(0.0, (s, l) => s + l.amount);
    }
    return commissionAmount + managerCommission;
  }

  factory PaymentRecord.fromJson(Map<String, dynamic> json) {
    final splitRows = (json['splits'] as List? ?? const []);
    final customerMap = json['customer'] is Map
        ? Map<String, dynamic>.from(json['customer'])
        : const <String, dynamic>{};
    final staffMap = json['staff'] is Map
        ? Map<String, dynamic>.from(json['staff'])
        : const <String, dynamic>{};
    final serviceMap = json['service'] is Map
        ? Map<String, dynamic>.from(json['service'])
        : const <String, dynamic>{};
    final branchMap = json['branch'] is Map
        ? Map<String, dynamic>.from(json['branch'])
        : const <String, dynamic>{};
    final apptMap = json['appointment'] is Map
        ? Map<String, dynamic>.from(json['appointment'])
        : const <String, dynamic>{};

    final serviceLines = <PaymentServiceLine>[];
    final rawStaff = json['service_staff'];
    if (rawStaff is List && rawStaff.isNotEmpty) {
      for (final row in rawStaff) {
        if (row is! Map) continue;
        final m = Map<String, dynamic>.from(row);
        final name = '${m['service_name'] ?? ''}'.trim();
        if (name.isEmpty) continue;
        final time = '${m['time'] ?? ''}'.trim();
        serviceLines.add(PaymentServiceLine(
          serviceName: name,
          staffName: '${m['staff_name'] ?? ''}'.trim(),
          date: '${m['date'] ?? ''}'.trim(),
          time: time.length >= 5 ? time.substring(0, 5) : time,
        ));
      }
    }
    if (serviceLines.isEmpty) {
      final rawSvcs = json['services'];
      if (rawSvcs is List && rawSvcs.isNotEmpty) {
        for (final row in rawSvcs) {
          if (row is! Map) continue;
          final m = Map<String, dynamic>.from(row);
          final name = '${m['name'] ?? ''}'.trim();
          if (name.isEmpty) continue;
          serviceLines.add(PaymentServiceLine(serviceName: name));
        }
      }
    }
    if (serviceLines.isEmpty) {
      final name = '${serviceMap['name'] ?? ''}'.trim();
      if (name.isNotEmpty) {
        serviceLines.add(PaymentServiceLine(
          serviceName: name,
          staffName: '${staffMap['name'] ?? ''}'.trim(),
        ));
      }
    }

    final commissionLines = <PaymentCommissionLine>[];
    final rawComm = json['commission_per_staff'];
    if (rawComm is List) {
      for (final row in rawComm) {
        if (row is! Map) continue;
        final m = Map<String, dynamic>.from(row);
        final amt = _asDouble(m['amount']);
        if (!(amt > 0)) continue;
        commissionLines.add(PaymentCommissionLine(
          staffName: '${m['staff_name'] ?? 'Staff'}'.trim(),
          amount: amt,
        ));
      }
    }

    final serviceNames = <String>[];
    for (final l in serviceLines) {
      if (l.serviceName.isNotEmpty && !serviceNames.contains(l.serviceName)) {
        serviceNames.add(l.serviceName);
      }
    }
    final staffNames = <String>[];
    for (final l in serviceLines) {
      if (l.staffName.isNotEmpty && !staffNames.contains(l.staffName)) {
        staffNames.add(l.staffName);
      }
    }
    if (staffNames.isEmpty) {
      for (final l in commissionLines) {
        if (l.staffName.isNotEmpty && !staffNames.contains(l.staffName)) {
          staffNames.add(l.staffName);
        }
      }
    }
    final headerStaff = '${staffMap['name'] ?? ''}'.trim();
    if (staffNames.isEmpty && headerStaff.isNotEmpty) staffNames.add(headerStaff);

    final apptId = '${apptMap['id'] ?? ''}'.trim();
    final apptDate = '${apptMap['date'] ?? ''}'.trim();
    final apptTimeRaw = '${apptMap['time'] ?? ''}'.trim();
    final apptTime = apptTimeRaw.length >= 5 ? apptTimeRaw.substring(0, 5) : apptTimeRaw;
    final apptStatus = '${apptMap['status'] ?? ''}'.trim().replaceAll('_', ' ');
    String appointmentLabel = '';
    if (apptId.isNotEmpty) {
      appointmentLabel = '#$apptId';
      if (apptDate.isNotEmpty) appointmentLabel += ' · ${apptDate.length >= 10 ? apptDate.substring(0, 10) : apptDate}';
      if (apptTime.isNotEmpty) appointmentLabel += ' $apptTime';
      if (apptStatus.isNotEmpty) appointmentLabel += ' · $apptStatus';
    }

    return PaymentRecord(
      id: '${json['id'] ?? ''}',
      customerName: '${json['customer_name'] ?? customerMap['name'] ?? 'Walk-in'}',
      staffName: staffNames.join(', '),
      serviceName: serviceNames.isNotEmpty
          ? serviceNames.join(', ')
          : '${serviceMap['name'] ?? ''}',
      totalAmount: _asDouble(json['total_amount']),
      loyaltyDiscount: _asDouble(json['loyalty_discount']),
      promoDiscount: _asDouble(json['promo_discount']),
      commissionAmount: _asDouble(
        json['total_commission_amount'] ?? json['commission_amount'],
      ),
      date: '${json['date'] ?? ''}',
      splits: splitRows
          .whereType<Map>()
          .map((row) => PaymentSplitRecord.fromJson(Map<String, dynamic>.from(row)))
          .toList(),
      phone: '${customerMap['phone'] ?? apptMap['phone'] ?? ''}'.trim(),
      branchName: '${branchMap['name'] ?? ''}'.trim(),
      status: '${json['status'] ?? 'paid'}',
      isAdvance: json['is_advance'] == true,
      pointsEarned: _asDouble(json['points_earned']),
      managerCommission: _asDouble(json['manager_commission_amount']),
      createdAt: '${json['createdAt'] ?? json['created_at'] ?? ''}',
      appointmentLabel: appointmentLabel,
      serviceLines: serviceLines,
      commissionLines: commissionLines,
    );
  }
}

double _asDouble(dynamic v) {
  if (v is num) return v.toDouble();
  return double.tryParse('$v') ?? 0;
}
