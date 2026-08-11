/// Salon wall-clock helpers (Asia/Colombo = UTC+05:30).
const Duration kSalonOffset = Duration(hours: 5, minutes: 30);

DateTime salonNow() => DateTime.now().toUtc().add(kSalonOffset);

String salonToday() {
  final d = salonNow();
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

String salonNowHm() {
  final d = salonNow();
  return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

/// Normalize API TIME / picker values to HH:MM.
String normalizeHm(String? raw) {
  final s = (raw ?? '').trim();
  if (s.isEmpty) return '';
  final m = RegExp(r'(\d{1,2}):(\d{2})').firstMatch(s);
  if (m == null) return s.length >= 5 ? s.substring(0, 5) : s;
  final h = int.tryParse(m.group(1)!) ?? 0;
  final min = int.tryParse(m.group(2)!) ?? 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return '';
  return '${h.toString().padLeft(2, '0')}:${min.toString().padLeft(2, '0')}';
}

int hmToMinutes(String? raw) {
  final t = normalizeHm(raw);
  if (t.length < 5) return 0;
  final h = int.tryParse(t.substring(0, 2)) ?? 0;
  final m = int.tryParse(t.substring(3, 5)) ?? 0;
  return h * 60 + m;
}

bool isPastSalonDateTime(String date, String time) {
  final d = date.trim();
  final t = normalizeHm(time);
  if (d.isEmpty || t.isEmpty) return false;
  final today = salonToday();
  if (d.compareTo(today) < 0) return true;
  if (d.compareTo(today) > 0) return false;
  return hmToMinutes(t) < hmToMinutes(salonNowHm());
}

List<String> filterFutureSlots(List<String> slots, String date, {String? serverDate, String? serverTime}) {
  final d = date.trim();
  final today = (serverDate != null && serverDate.isNotEmpty) ? serverDate.sliceYmd() : salonToday();
  final nowHm = (serverTime != null && serverTime.isNotEmpty) ? normalizeHm(serverTime) : salonNowHm();
  if (d.compareTo(today) < 0) return const [];
  if (d.compareTo(today) > 0) {
    return slots.map(normalizeHm).where((s) => s.isNotEmpty).toList();
  }
  final nowMin = hmToMinutes(nowHm);
  return slots
      .map(normalizeHm)
      .where((s) => s.isNotEmpty && hmToMinutes(s) >= nowMin)
      .toList();
}

extension on String {
  String sliceYmd() => length >= 10 ? substring(0, 10) : this;
}
