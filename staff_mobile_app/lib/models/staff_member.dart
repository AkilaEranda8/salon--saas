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

class StaffOffDay {
  const StaffOffDay({required this.date, this.reason = ''});

  final String date;
  final String reason;

  Map<String, dynamic> toJson() => {
        'date': date,
        if (reason.trim().isNotEmpty) 'reason': reason.trim(),
      };

  factory StaffOffDay.fromJson(Map<String, dynamic> json) {
    final raw = '${json['date'] ?? ''}'.trim();
    final date = raw.length >= 10 ? raw.substring(0, 10) : raw;
    return StaffOffDay(
      date: date,
      reason: '${json['reason'] ?? ''}'.trim(),
    );
  }
}

class StaffDayHours {
  const StaffDayHours({
    this.closed = false,
    this.start = '09:00',
    this.end = '18:00',
  });

  final bool closed;
  final String start;
  final String end;

  Map<String, dynamic> toJson() => closed
      ? {'closed': true, 'start': null, 'end': null}
      : {'closed': false, 'start': start, 'end': end};

  factory StaffDayHours.fromJson(dynamic raw) {
    if (raw is! Map) {
      return const StaffDayHours();
    }
    final closed = raw['closed'] == true ||
        raw['closed'] == 'true' ||
        raw['closed'] == 1;
    if (closed) {
      return const StaffDayHours(closed: true);
    }
    return StaffDayHours(
      closed: false,
      start: '${raw['start'] ?? '09:00'}'.trim().isEmpty
          ? '09:00'
          : '${raw['start']}'.trim().substring(0, 5),
      end: '${raw['end'] ?? '18:00'}'.trim().isEmpty
          ? '18:00'
          : '${raw['end']}'.trim().substring(0, 5),
    );
  }
}

Map<String, StaffDayHours> defaultStaffWorkingHours() {
  const day = StaffDayHours();
  return {
    for (var i = 0; i <= 6; i++) '$i': day,
  };
}

Map<String, StaffDayHours> normalizeStaffWorkingHours(dynamic input) {
  final base = defaultStaffWorkingHours();
  if (input is! Map) return base;
  for (var i = 0; i <= 6; i++) {
    final key = '$i';
    final raw = input[key] ?? input[i];
    if (raw != null) base[key] = StaffDayHours.fromJson(raw);
  }
  return base;
}

class StaffMember {
  StaffMember({
    required this.id,
    required this.name,
    required this.branchId,
    this.branchIds = const [],
    this.email,
    this.phone,
    this.roleTitle,
    this.accessRole,
    this.salaryType = 'commission_only',
    this.commissionType = 'percentage',
    this.commissionValue,
    this.baseSalary,
    this.joinDate,
    this.isActive = true,
    this.availableOnline = false,
    this.photoUrl,
    this.workingHours,
    this.offDays = const [],
    this.specializations = const [],
    this.branchName,
  });

  final String id;
  final String name;
  final String branchId;
  final List<String> branchIds;
  final String? email;
  final String? phone;
  final String? roleTitle;
  /// Linked portal user role (admin/manager/staff) when Staff.user_id is set.
  final String? accessRole;
  final String salaryType;
  final String commissionType;
  final double? commissionValue;
  final double? baseSalary;
  final String? joinDate;
  final bool isActive;
  final bool availableOnline;
  final String? photoUrl;
  final Map<String, StaffDayHours>? workingHours;
  final List<StaffOffDay> offDays;
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
    final branchesRaw = json['branches'];
    final branchIds = <String>[];
    if (branchesRaw is List) {
      for (final b in branchesRaw) {
        if (b is Map && b['id'] != null) branchIds.add('${b['id']}');
      }
    }
    final primaryBranchId =
        '${json['branch_id'] ?? (branch is Map ? branch['id'] : '') ?? ''}';
    if (primaryBranchId.isNotEmpty && !branchIds.contains(primaryBranchId)) {
      branchIds.insert(0, primaryBranchId);
    }

    final linkedUser = json['user'];
    final accessRole = linkedUser is Map
        ? '${linkedUser['role'] ?? ''}'.trim()
        : '';

    final joinRaw = '${json['join_date'] ?? ''}'.trim();
    final joinDate = joinRaw.length >= 10 ? joinRaw.substring(0, 10) : (joinRaw.isEmpty ? null : joinRaw);

    final offRaw = json['offDays'] ?? json['off_days'];
    final offDays = offRaw is List
        ? offRaw
            .whereType<Map>()
            .map((e) => StaffOffDay.fromJson(Map<String, dynamic>.from(e)))
            .where((d) => d.date.isNotEmpty)
            .toList()
        : <StaffOffDay>[];

    return StaffMember(
      id: '${json['id'] ?? ''}',
      name: '${json['name'] ?? ''}',
      branchId: primaryBranchId.isNotEmpty
          ? primaryBranchId
          : (branchIds.isNotEmpty ? branchIds.first : ''),
      branchIds: branchIds,
      email: json['email'] != null ? '${json['email']}' : null,
      phone: json['phone'] != null ? '${json['phone']}' : null,
      roleTitle: json['role_title']?.toString(),
      accessRole: accessRole.isEmpty ? null : accessRole.toLowerCase(),
      salaryType: '${json['salary_type'] ?? 'commission_only'}',
      commissionType: '${json['commission_type'] ?? 'percentage'}',
      commissionValue: commVal,
      baseSalary: baseSal,
      joinDate: joinDate,
      isActive: json['is_active'] != false,
      availableOnline: json['available_online'] != false,
      photoUrl: json['photo_url'] != null && '${json['photo_url']}'.trim().isNotEmpty
          ? '${json['photo_url']}'.trim()
          : null,
      workingHours: normalizeStaffWorkingHours(json['working_hours']),
      offDays: offDays,
      specializations: specs,
      branchName: branch is Map ? '${branch['name'] ?? ''}' : null,
    );
  }
}
