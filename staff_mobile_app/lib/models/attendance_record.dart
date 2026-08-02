class AttendanceRecord {
  AttendanceRecord({
    required this.id,
    required this.staffId,
    required this.date,
    this.checkIn,
    this.checkOut,
    this.status = 'present',
    this.note,
    this.staffName,
  });

  final String id;
  final String staffId;
  final String date;
  final String? checkIn;
  final String? checkOut;
  final String status;
  final String? note;
  final String? staffName;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    final staff = json['staff'];
    String? staffName;
    if (staff is Map) {
      staffName = '${staff['name'] ?? ''}'.trim();
      if (staffName.isEmpty) staffName = null;
    }
    return AttendanceRecord(
      id: '${json['id'] ?? ''}',
      staffId: '${json['staff_id'] ?? ''}',
      date: '${json['date'] ?? ''}'.length >= 10
          ? '${json['date']}'.substring(0, 10)
          : '${json['date'] ?? ''}',
      checkIn: _time(json['check_in']),
      checkOut: _time(json['check_out']),
      status: '${json['status'] ?? 'present'}'.toLowerCase(),
      note: json['note']?.toString(),
      staffName: staffName,
    );
  }

  static String? _time(dynamic raw) {
    if (raw == null) return null;
    final s = '$raw'.trim();
    if (s.isEmpty || s == 'null') return null;
    return s.length >= 5 ? s.substring(0, 5) : s;
  }
}
