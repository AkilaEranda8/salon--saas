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

  factory StaffCommissionSummary.fromJson(Map<String, dynamic> json) {
    final rev  = json['totalRevenue'];
    final comm = json['totalCommission'];
    final adv  = json['totalAdvances'];
    final net  = json['netCommission'];
    final cv   = json['commissionValue'];
    final paidRaw = json['totalPaid'];
    final balRaw  = json['balanceDue'];
    final totalCommission = comm is num ? comm.toDouble() : double.tryParse('$comm') ?? 0;
    final totalAdvances   = adv  is num ? adv.toDouble()  : double.tryParse('$adv')  ?? 0;
    final netC  = net  is num ? net.toDouble()  : (net  != null ? double.tryParse('$net')  ?? 0 : (totalCommission - totalAdvances).clamp(0, double.infinity).toDouble());
    final tPaid = paidRaw is num ? paidRaw.toDouble() : double.tryParse('$paidRaw') ?? 0;
    return StaffCommissionSummary(
      staffId:          '${json['staffId'] ?? ''}',
      staffName:        '${json['staffName'] ?? ''}',
      role:             '${json['role'] ?? ''}',
      branchName:       '${json['branchName'] ?? ''}',
      appointmentCount: int.tryParse('${json['appointmentCount'] ?? 0}') ?? 0,
      totalRevenue:     rev is num ? rev.toDouble() : double.tryParse('$rev') ?? 0,
      totalCommission: totalCommission,
      totalAdvances: totalAdvances,
      netCommission:    netC,
      totalPaid:        tPaid,
      balanceDue:       balRaw is num ? balRaw.toDouble() : double.tryParse('$balRaw') ?? (netC - tPaid).clamp(0, double.infinity).toDouble(),
      commissionType:   json['commissionType']?.toString(),
      commissionValue:  cv is num ? cv.toDouble() : double.tryParse('$cv'),
    );
  }
}
