class StaffSpecialization {
  StaffSpecialization({
    required this.serviceId,
    this.commissionType,
    this.commissionValue,
    this.serviceName,
  });

  final int serviceId;
  final String? commissionType;
  final double? commissionValue;
  final String? serviceName;

  factory StaffSpecialization.fromJson(Map<String, dynamic> json) {
    final raw = json['commission_value'];
    double? val;
    if (raw != null && '$raw'.trim().isNotEmpty) {
      val = raw is num ? raw.toDouble() : double.tryParse('$raw');
    }
    final svc = json['service'];
    return StaffSpecialization(
      serviceId: int.tryParse('${json['service_id'] ?? ''}') ?? 0,
      commissionType: json['commission_type']?.toString(),
      commissionValue: val,
      serviceName: svc is Map ? '${svc['name'] ?? ''}' : null,
    );
  }
}

class StaffMember {
  StaffMember({
    required this.id,
    required this.name,
    required this.branchId,
    this.email,
    this.phone,
    this.roleTitle,
    this.salaryType = 'commission_only',
    this.commissionType = 'percentage',
    this.commissionValue,
    this.baseSalary,
    this.isActive = true,
    this.specializations = const [],
    this.branchName,
  });

  final String id;
  final String name;
  final String branchId;
  final String? email;
  final String? phone;
  final String? roleTitle;
  final String salaryType;
  final String commissionType;
  final double? commissionValue;
  final double? baseSalary;
  final bool isActive;
  final List<StaffSpecialization> specializations;
  final String? branchName;

  factory StaffMember.fromJson(Map<String, dynamic> json) {
    final rawComm = json['commission_value'];
    double? commVal;
    if (rawComm != null && '$rawComm'.trim().isNotEmpty) {
      commVal = rawComm is num ? rawComm.toDouble() : double.tryParse('$rawComm');
    }
    final rawSal = json['base_salary'];
    double? baseSal;
    if (rawSal != null && '$rawSal'.trim().isNotEmpty) {
      baseSal = rawSal is num ? rawSal.toDouble() : double.tryParse('$rawSal');
    }
    final specsRaw = json['specializations'];
    final specs = specsRaw is List
        ? specsRaw
            .whereType<Map>()
            .map((e) => StaffSpecialization.fromJson(
                Map<String, dynamic>.from(e)))
            .where((s) => s.serviceId > 0)
            .toList()
        : <StaffSpecialization>[];

    final branch = json['branch'];
    return StaffMember(
      id: '${json['id'] ?? ''}',
      name: '${json['name'] ?? ''}',
      branchId: '${json['branch_id'] ?? (branch is Map ? branch['id'] : '') ?? ''}',
      email: json['email'] != null ? '${json['email']}' : null,
      phone: json['phone'] != null ? '${json['phone']}' : null,
      roleTitle: json['role_title']?.toString(),
      salaryType: '${json['salary_type'] ?? 'commission_only'}',
      commissionType: '${json['commission_type'] ?? 'percentage'}',
      commissionValue: commVal,
      baseSalary: baseSal,
      isActive: json['is_active'] != false,
      specializations: specs,
      branchName: branch is Map ? '${branch['name'] ?? ''}' : null,
    );
  }
}
