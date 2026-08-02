/// One row from GET /api/staff/commission (branch / all-branch summary).
class StaffCommissionSummary {
  StaffCommissionSummary({
    required this.staffId,
    required this.staffName,
    required this.role,
    required this.branchName,
    required this.appointmentCount,
    required this.totalRevenue,
    required this.totalCommission,
    required this.totalAdvances,
    required this.netCommission,
    required this.totalPaid,
    required this.balanceDue,
    this.commissionType,
    this.commissionValue,
    this.salaryType = 'commission_only',
    this.baseSalary = 0,
    this.presentDays = 0,
    this.dailySalaryEarned = 0,
    this.grossPayable = 0,
  });

  final String staffId;
  final String staffName;
  final String role;
  final String branchName;
  final int appointmentCount;
  final double totalRevenue;
  final double totalCommission;
  final double totalAdvances;
  final double netCommission;
  final double totalPaid;
  final double balanceDue;
  final String? commissionType;
  final double? commissionValue;
  final String salaryType;
  final double baseSalary;
  final int presentDays;
  final double dailySalaryEarned;
  final double grossPayable;

  double get salaryPortion {
    if (salaryType == 'daily_salary_plus_commission') return dailySalaryEarned;
    if (salaryType == 'salary_only' || salaryType == 'salary_plus_commission') {
      return baseSalary;
    }
    return 0;
  }

  static double _num(dynamic v) {
    if (v is num) return v.toDouble();
    return double.tryParse('$v') ?? 0;
  }

  factory StaffCommissionSummary.fromJson(Map<String, dynamic> json) {
    final totalCommission = _num(json['totalCommission']);
    final totalAdvances = _num(json['totalAdvances']);
    final netRaw = json['netCommission'];
    final netC = netRaw != null
        ? _num(netRaw)
        : (totalCommission - totalAdvances).clamp(0, double.infinity).toDouble();
    final tPaid = _num(json['totalPaid']);
    final balRaw = json['balanceDue'];
    final salaryType = '${json['salaryType'] ?? 'commission_only'}';
    final baseSalary = _num(json['baseSalary']);
    final presentDays = int.tryParse('${json['presentDays'] ?? 0}') ?? 0;
    final dailySalaryEarned = _num(json['dailySalaryEarned']);
    final grossRaw = json['grossPayable'];
    final gross = grossRaw != null
        ? _num(grossRaw)
        : (salaryType == 'daily_salary_plus_commission'
            ? dailySalaryEarned + totalCommission
            : (salaryType == 'salary_plus_commission'
                ? baseSalary + totalCommission
                : (salaryType == 'salary_only' ? baseSalary : totalCommission)));

    return StaffCommissionSummary(
      staffId: '${json['staffId'] ?? ''}',
      staffName: '${json['staffName'] ?? ''}',
      role: '${json['role'] ?? ''}',
      branchName: '${json['branchName'] ?? ''}',
      appointmentCount: int.tryParse('${json['appointmentCount'] ?? 0}') ?? 0,
      totalRevenue: _num(json['totalRevenue']),
      totalCommission: totalCommission,
      totalAdvances: totalAdvances,
      netCommission: netC,
      totalPaid: tPaid,
      balanceDue: balRaw != null
          ? _num(balRaw)
          : (netC - tPaid).clamp(0, double.infinity).toDouble(),
      commissionType: json['commissionType']?.toString(),
      commissionValue: json['commissionValue'] == null
          ? null
          : _num(json['commissionValue']),
      salaryType: salaryType,
      baseSalary: baseSalary,
      presentDays: presentDays,
      dailySalaryEarned: dailySalaryEarned,
      grossPayable: gross,
    );
  }
}
