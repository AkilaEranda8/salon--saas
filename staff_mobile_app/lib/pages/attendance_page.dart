import 'package:flutter/material.dart';

import '../models/attendance_record.dart';
import '../models/staff_member.dart';
import '../services/attendance_location.dart';
import '../state/app_state.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border = Color(0xFFE5E7EB);
const Color _ink = Color(0xFF111827);
const Color _muted = Color(0xFF6B7280);

const _statuses = ['present', 'absent', 'leave', 'late'];

const _monthShort = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

Color _statusColor(String s) {
  switch (s) {
    case 'present':
      return const Color(0xFF059669);
    case 'absent':
      return const Color(0xFFDC2626);
    case 'leave':
      return const Color(0xFFD97706);
    case 'late':
      return const Color(0xFF7C3AED);
    default:
      return _muted;
  }
}

Color _statusBg(String s) {
  switch (s) {
    case 'present':
      return const Color(0xFFECFDF5);
    case 'absent':
      return const Color(0xFFFEF2F2);
    case 'leave':
      return const Color(0xFFFFFBEB);
    case 'late':
      return const Color(0xFFF5F3FF);
    default:
      return const Color(0xFFF8FAFC);
  }
}

IconData _statusIcon(String s) {
  switch (s) {
    case 'present':
      return Icons.check_circle_rounded;
    case 'absent':
      return Icons.cancel_rounded;
    case 'leave':
      return Icons.beach_access_rounded;
    case 'late':
      return Icons.schedule_rounded;
    default:
      return Icons.help_outline_rounded;
  }
}

String _today() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

String _nowTime() {
  final n = DateTime.now();
  return '${n.hour.toString().padLeft(2, '0')}:${n.minute.toString().padLeft(2, '0')}:00';
}

String _shiftDate(String date, int delta) {
  final parts = date.split('-').map(int.parse).toList();
  final d = DateTime(parts[0], parts[1], parts[2]).add(Duration(days: delta));
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

String _cap(String s) =>
    s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

String _formatDateLabel(String ymd) {
  if (ymd == _today()) return 'Today';
  final p = DateTime.tryParse(ymd);
  if (p == null) return ymd;
  return '${_monthShort[p.month]} ${p.day}, ${p.year}';
}

String _fmtClock(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  final t = raw.length >= 5 ? raw.substring(0, 5) : raw;
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
class AttendancePage extends StatefulWidget {
  const AttendancePage({super.key});

  @override
  State<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<AttendancePage> {
  bool _loading = true;
  bool _busy = false;
  String _date = _today();
  List<AttendanceRecord> _records = [];
  List<StaffMember> _staff = [];
  bool _loadedOnce = false;
  Map<String, dynamic>? _branchGeo;
  double? _distanceM;
  bool _locChecking = false;
  String? _locHint;

  bool get _teamMode {
    final role = AppStateScope.of(context).currentUser?.role ?? '';
    return role == 'superadmin' || role == 'admin' || role == 'manager';
  }

  bool get _isToday => _date == _today();

  bool get _canGoNext {
    final base = DateTime.tryParse(_date) ?? DateTime.now();
    final today = DateTime.now();
    final todayOnly = DateTime(today.year, today.month, today.day);
    return base.isBefore(todayOnly);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_loadedOnce) {
      _loadedOnce = true;
      _load();
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final app = AppStateScope.of(context);
      if (_teamMode) {
        final results = await Future.wait([
          app.loadAttendance(date: _date),
          app.loadStaffList(),
          app.loadBranchAttendanceGeo(),
        ]);
        if (!mounted) return;
        setState(() {
          _records = results[0] as List<AttendanceRecord>;
          _staff = (results[1] as List<StaffMember>)
              .where((s) => s.isActive)
              .toList();
          _branchGeo = results[2] as Map<String, dynamic>?;
        });
      } else {
        final staffId = app.currentUser?.linkedStaffId?.trim() ?? '';
        final results = await Future.wait([
          app.loadAttendance(
            date: _date,
            staffId: staffId.isEmpty ? null : staffId,
          ),
          app.loadBranchAttendanceGeo(),
        ]);
        if (!mounted) return;
        setState(() {
          _records = results[0] as List<AttendanceRecord>;
          _staff = const [];
          _branchGeo = results[1] as Map<String, dynamic>?;
        });
        _refreshDistance();
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _records = [];
        _staff = [];
      });
    }
    if (mounted) setState(() => _loading = false);
  }

  bool get _geoConfigured => _branchGeo?['configured'] == true;

  bool _hasClock(String? t) => t != null && t.trim().isNotEmpty;

  Future<void> _refreshDistance() async {
    if (!_geoConfigured || _teamMode) return;
    final lat = _branchGeo?['latitude'] as double?;
    final lng = _branchGeo?['longitude'] as double?;
    if (lat == null || lng == null) return;
    setState(() {
      _locChecking = true;
      _locHint = null;
    });
    try {
      final pos = await getAttendancePosition();
      if (!mounted) return;
      final d = distanceMeters(
        fromLat: pos.latitude,
        fromLng: pos.longitude,
        toLat: lat,
        toLng: lng,
      );
      final radius = (_branchGeo?['attendance_radius_m'] as int?) ?? 150;
      setState(() {
        _distanceM = d;
        _locHint = d <= radius
            ? 'At salon · ${d.round()}m — you can Check In / Day End Out'
            : 'Too far · ${d.round()}m (need ≤ ${radius}m)';
        _locChecking = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _distanceM = null;
        _locHint = e.toString().replaceFirst('Exception: ', '');
        _locChecking = false;
      });
    }
  }

  /// GPS required when salon geofence is configured (self check-in / day end).
  Future<({double lat, double lng})?> _coordsIfNeeded({
    required bool needsGps,
  }) async {
    if (!needsGps || _teamMode || !_geoConfigured) return null;
    try {
      final pos = await getAttendancePosition();
      return (lat: pos.latitude, lng: pos.longitude);
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
      return null;
    }
  }

  bool _statusNeedsGps(String status) =>
      status == 'present' || status == 'late';

  void _setDate(String ymd) {
    if (ymd == _date) return;
    setState(() => _date = ymd);
    _load();
  }

  void _shift(int days) {
    final next = _shiftDate(_date, days);
    if (days > 0 && next.compareTo(_today()) > 0) return;
    _setDate(next);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final initial = DateTime.tryParse(_date) ?? now;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: now,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
            primary: _forest,
            onPrimary: Colors.white,
            surface: _surface,
            onSurface: _ink,
          ),
        ),
        child: child!,
      ),
    );
    if (picked == null || !mounted) return;
    _setDate(
      '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}',
    );
  }

  AttendanceRecord? _mine() {
    final staffId =
        AppStateScope.of(context).currentUser?.linkedStaffId?.trim();
    if (staffId == null || staffId.isEmpty) {
      return _records.isEmpty ? null : _records.first;
    }
    for (final r in _records) {
      if (r.staffId == staffId) return r;
    }
    return null;
  }

  Future<void> _checkIn() async {
    final app = AppStateScope.of(context);
    final staffId = app.currentUser?.linkedStaffId?.trim() ?? '';
    if (staffId.isEmpty) {
      _toast('No staff profile linked to this account.');
      return;
    }
    setState(() => _busy = true);
    final coords = await _coordsIfNeeded(needsGps: true);
    if (_geoConfigured && !_teamMode && coords == null) {
      setState(() => _busy = false);
      return;
    }
    final row = await app.upsertAttendance(
      staffId: staffId,
      date: _date,
      status: 'present',
      checkIn: _nowTime(),
      latitude: coords?.lat,
      longitude: coords?.lng,
    );
    setState(() => _busy = false);
    if (row == null) {
      _toast(app.lastError ?? 'Check-in failed');
      return;
    }
    _toast('Checked in at ${_fmtClock(row.checkIn)}', success: true);
    await _load();
  }

  Future<void> _checkOut() async {
    final app = AppStateScope.of(context);
    final mine = _mine();
    if (mine == null || mine.id.isEmpty) {
      _toast('Check in first');
      return;
    }
    setState(() => _busy = true);
    final coords = await _coordsIfNeeded(needsGps: true);
    if (_geoConfigured && !_teamMode && coords == null) {
      setState(() => _busy = false);
      return;
    }
    final row = await app.updateAttendanceRecord(
      id: mine.id,
      checkOut: _nowTime(),
      latitude: coords?.lat,
      longitude: coords?.lng,
    );
    setState(() => _busy = false);
    if (row == null) {
      _toast(app.lastError ?? 'Day end out failed');
      return;
    }
    _toast('Day end out at ${_fmtClock(row.checkOut)}', success: true);
    await _load();
  }

  Future<void> _markSelfStatus(String status) async {
    final app = AppStateScope.of(context);
    final staffId = app.currentUser?.linkedStaffId?.trim() ?? '';
    if (staffId.isEmpty) {
      _toast('No staff profile linked to this account.');
      return;
    }
    setState(() => _busy = true);
    final needs = _statusNeedsGps(status);
    final coords = await _coordsIfNeeded(needsGps: needs);
    if (needs && _geoConfigured && !_teamMode && coords == null) {
      setState(() => _busy = false);
      return;
    }
    final mine = _mine();
    final autoIn = (status == 'present' || status == 'late') &&
        !_hasClock(mine?.checkIn);
    final row = await app.upsertAttendance(
      staffId: staffId,
      date: _date,
      status: status,
      checkIn: autoIn ? _nowTime() : null,
      latitude: coords?.lat,
      longitude: coords?.lng,
    );
    setState(() => _busy = false);
    if (row == null) {
      _toast(app.lastError ?? 'Update failed');
      return;
    }
    _toast(
      autoIn
          ? 'Marked ${_cap(status)} · checked in ${_fmtClock(row.checkIn)}'
          : 'Marked ${_cap(status)}',
      success: true,
    );
    await _load();
  }

  Future<void> _markTeam({
    required String staffId,
    required String status,
    String? checkIn,
  }) async {
    final app = AppStateScope.of(context);
    setState(() => _busy = true);
    final row = await app.upsertAttendance(
      staffId: staffId,
      date: _date,
      status: status,
      checkIn: checkIn,
    );
    setState(() => _busy = false);
    if (row == null) {
      _toast(app.lastError ?? 'Update failed');
      return;
    }
    await _load();
  }

  void _toast(String msg, {bool success = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: success ? _emerald : const Color(0xFFDC2626),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  Map<String, int> get _teamStats {
    final byStaff = <String, AttendanceRecord>{};
    for (final r in _records) {
      byStaff[r.staffId] = r;
    }
    final present =
        _records.where((r) => r.status == 'present' || r.status == 'late').length;
    final leave = _records.where((r) => r.status == 'leave').length;
    final absent = _records.where((r) => r.status == 'absent').length;
    final unmarked = _staff.where((s) => !byStaff.containsKey(s.id)).length;
    return {
      'present': present,
      'leave': leave,
      'absent': absent,
      'open': unmarked,
    };
  }

  @override
  Widget build(BuildContext context) {
    final stats = _teamMode ? _teamStats : null;
    final mine = !_teamMode ? _mine() : null;

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          _teamMode ? 'Team Attendance' : 'My Attendance',
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 22),
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Forest summary header ──
          Container(
            color: _forest,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: _teamMode
                ? Row(children: [
                    Expanded(
                      child: _SummaryChip(
                        label: 'Present',
                        value: '${stats!['present']}',
                        icon: Icons.check_circle_rounded,
                        color: const Color(0xFF86EFAC),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _SummaryChip(
                        label: 'Leave',
                        value: '${stats['leave']}',
                        icon: Icons.beach_access_rounded,
                        color: const Color(0xFFFBBF24),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _SummaryChip(
                        label: 'Absent',
                        value: '${stats['absent']}',
                        icon: Icons.cancel_rounded,
                        color: const Color(0xFFFCA5A5),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _SummaryChip(
                        label: 'Open',
                        value: '${stats['open']}',
                        icon: Icons.radio_button_unchecked_rounded,
                        color: const Color(0xFFCBD5E1),
                      ),
                    ),
                  ])
                : Row(children: [
                    Expanded(
                      child: _SummaryChip(
                        label: 'Status',
                        value: mine == null
                            ? 'Not marked'
                            : _cap(mine.status),
                        icon: mine == null
                            ? Icons.help_outline_rounded
                            : _statusIcon(mine.status),
                        color: mine == null
                            ? const Color(0xFFCBD5E1)
                            : Color.lerp(
                                  _statusColor(mine.status),
                                  Colors.white,
                                  0.35,
                                )!,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _SummaryChip(
                        label: 'Check-in',
                        value: _fmtClock(mine?.checkIn),
                        icon: Icons.login_rounded,
                        color: const Color(0xFF86EFAC),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _SummaryChip(
                        label: 'Day end out',
                        value: _fmtClock(mine?.checkOut),
                        icon: Icons.logout_rounded,
                        color: const Color(0xFFFBBF24),
                      ),
                    ),
                  ]),
          ),

          // ── Date navigator ──
          Container(
            color: _surface,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Row(children: [
              _DateNavBtn(
                icon: Icons.chevron_left_rounded,
                onTap: () => _shift(-1),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: GestureDetector(
                  onTap: _loading ? null : _pickDate,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 11,
                    ),
                    decoration: BoxDecoration(
                      color: _isToday ? _forest : _surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: _isToday ? _forest : _border,
                      ),
                      boxShadow: _isToday
                          ? [
                              BoxShadow(
                                color: _forest.withValues(alpha: 0.22),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ]
                          : [],
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.calendar_today_rounded,
                          size: 16,
                          color: _isToday ? Colors.white70 : _forest,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _formatDateLabel(_date),
                          style: TextStyle(
                            color: _isToday ? Colors.white : _ink,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          Icons.arrow_drop_down_rounded,
                          color: _isToday ? Colors.white70 : _muted,
                          size: 22,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _DateNavBtn(
                icon: Icons.chevron_right_rounded,
                onTap: _canGoNext ? () => _shift(1) : null,
                enabled: _canGoNext,
              ),
              if (!_isToday) ...[
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _loading ? null : () => _setDate(_today()),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 11,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: _emerald.withValues(alpha: 0.35),
                      ),
                    ),
                    child: const Text(
                      'Today',
                      style: TextStyle(
                        color: _emerald,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ],
            ]),
          ),

          const Divider(height: 1, color: _border),

          if (!_loading) _buildGeoBanner(),

          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: _emerald),
                  )
                : _teamMode
                    ? _buildTeam()
                    : _buildSelf(),
          ),
        ],
      ),
    );
  }

  Widget _buildGeoBanner() {
    final radius = (_branchGeo?['attendance_radius_m'] as int?) ?? 150;
    final branchName = '${_branchGeo?['name'] ?? 'Salon'}';
    final within = _distanceM != null && _distanceM! <= radius;

    Color bg;
    Color fg;
    IconData icon;
    String title;
    String subtitle;

    if (_teamMode) {
      bg = const Color(0xFFF0F9FF);
      fg = const Color(0xFF0369A1);
      icon = Icons.admin_panel_settings_rounded;
      title = 'Manager mode';
      subtitle = _geoConfigured
          ? 'Team marks skip GPS. Staff must Check In / Day End Out at the salon.'
          : 'Set branch GPS on web so staff can only clock at the salon.';
    } else if (!_geoConfigured) {
      bg = const Color(0xFFFFFBEB);
      fg = const Color(0xFFB45309);
      icon = Icons.location_off_rounded;
      title = 'Salon GPS not set';
      subtitle =
          'Tap Check In / Day End Out — time is saved on button click. Ask admin to set branch GPS for location lock.';
    } else if (_locChecking) {
      bg = const Color(0xFFF8FAFC);
      fg = _muted;
      icon = Icons.my_location_rounded;
      title = 'Checking location…';
      subtitle = 'Confirming you are within ${radius}m of $branchName';
    } else if (within) {
      bg = const Color(0xFFECFDF5);
      fg = const Color(0xFF047857);
      icon = Icons.location_on_rounded;
      title = 'At $branchName';
      subtitle = _locHint ?? 'Tap Check In or Day End Out — time is taken now';
    } else {
      bg = const Color(0xFFFEF2F2);
      fg = const Color(0xFFB91C1C);
      icon = Icons.location_disabled_rounded;
      title = 'Outside salon zone';
      subtitle = _locHint ??
          'Move within ${radius}m of $branchName, then tap Check In / Day End Out';
    }

    return Material(
      color: bg,
      child: InkWell(
        onTap: _teamMode || !_geoConfigured ? null : _refreshDistance,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Row(
            children: [
              Icon(icon, size: 20, color: fg),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: fg,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 11.5,
                        color: fg.withValues(alpha: 0.85),
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              if (!_teamMode && _geoConfigured)
                Icon(Icons.refresh_rounded, size: 18, color: fg),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSelf() {
    final mine = _mine();
    final status = mine?.status ?? 'not_marked';
    final linked =
        AppStateScope.of(context).currentUser?.linkedStaffId?.trim();

    if (linked == null || linked.isEmpty) {
      return const _EmptyState(
        icon: Icons.link_off_rounded,
        title: 'No staff profile linked',
        subtitle:
            'Ask an admin to link your login to a staff profile to mark attendance.',
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Container(
          decoration: BoxDecoration(
            color: _surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: status == 'not_marked'
                          ? const Color(0xFFF1F5F9)
                          : _statusBg(status),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      status == 'not_marked'
                          ? Icons.fingerprint_rounded
                          : _statusIcon(status),
                      color: status == 'not_marked'
                          ? _muted
                          : _statusColor(status),
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _isToday
                              ? 'Today\'s attendance'
                              : _formatDateLabel(_date),
                          style: const TextStyle(
                            fontSize: 11,
                            color: _muted,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          status == 'not_marked'
                              ? 'Not marked yet'
                              : _cap(status),
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3,
                            color: status == 'not_marked'
                                ? _ink
                                : _statusColor(status),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_busy)
                    const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: _emerald,
                      ),
                    ),
                ]),
                const SizedBox(height: 18),
                Row(children: [
                  Expanded(
                    child: _ClockTile(
                      label: 'Check-in',
                      value: _fmtClock(mine?.checkIn),
                      icon: Icons.login_rounded,
                      color: const Color(0xFF059669),
                      bg: const Color(0xFFECFDF5),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _ClockTile(
                      label: 'Day end out',
                      value: _fmtClock(mine?.checkOut),
                      icon: Icons.logout_rounded,
                      color: _forest,
                      bg: const Color(0xFFECFDF3),
                    ),
                  ),
                ]),
                if (_isToday) ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'Button එක click කරන වෙලාවේ current time automatically save වෙනවා.',
                      style: TextStyle(
                        fontSize: 12,
                        color: _muted,
                        fontWeight: FontWeight.w600,
                        height: 1.35,
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(children: [
                    Expanded(
                      child: _PrimaryBtn(
                        label: 'Check In',
                        icon: Icons.login_rounded,
                        color: _emerald,
                        enabled: !_busy && !_hasClock(mine?.checkIn),
                        onTap: _checkIn,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _PrimaryBtn(
                        label: 'Day End Out',
                        icon: Icons.logout_rounded,
                        color: const Color(0xFFB45309),
                        enabled: !_busy &&
                            mine != null &&
                            _hasClock(mine.checkIn) &&
                            !_hasClock(mine.checkOut),
                        onTap: _checkOut,
                      ),
                    ),
                  ]),
                  const SizedBox(height: 18),
                  const Text(
                    'Or mark status',
                    style: TextStyle(
                      fontSize: 12,
                      color: _muted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 10),
                  _StatusPicker(
                    selected: mine?.status,
                    enabled: !_busy,
                    onSelect: _markSelfStatus,
                  ),
                ] else ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      'Viewing ${_formatDateLabel(_date)}. Switch to Today to check in or out.',
                      style: const TextStyle(
                        fontSize: 12,
                        color: _muted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTeam() {
    final byStaff = <String, AttendanceRecord>{};
    for (final r in _records) {
      byStaff[r.staffId] = r;
    }

    if (_staff.isEmpty) {
      return const _EmptyState(
        icon: Icons.groups_rounded,
        title: 'No active staff',
        subtitle: 'Add staff members to start marking attendance.',
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
      itemCount: _staff.length,
      itemBuilder: (_, i) {
        final s = _staff[i];
        final rec = byStaff[s.id];
        return _TeamStaffCard(
          staff: s,
          record: rec,
          busy: _busy,
          onMark: (status) => _markTeam(
            staffId: s.id,
            status: status,
            checkIn: status == 'present' && rec?.checkIn == null
                ? _nowTime()
                : null,
          ),
        );
      },
    );
  }
}

// ── Summary chip ──────────────────────────────────────────────────────────────
class _SummaryChip extends StatelessWidget {
  const _SummaryChip({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });
  final String label, value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(
                fontSize: 10,
                color: Colors.white70,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 15,
                color: Colors.white,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
      );
}

// ── Date nav button ───────────────────────────────────────────────────────────
class _DateNavBtn extends StatelessWidget {
  const _DateNavBtn({
    required this.icon,
    required this.onTap,
    this.enabled = true,
  });
  final IconData icon;
  final VoidCallback? onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: enabled ? _surface : const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _border),
        ),
        child: Icon(
          icon,
          color: enabled ? _forest : const Color(0xFFCBD5E1),
          size: 22,
        ),
      ),
    );
  }
}

// ── Clock tile ────────────────────────────────────────────────────────────────
class _ClockTile extends StatelessWidget {
  const _ClockTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.bg,
  });
  final String label, value;
  final IconData icon;
  final Color color, bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  color: color.withValues(alpha: 0.8),
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                value,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: color,
                  letterSpacing: -0.3,
                ),
              ),
            ],
          ),
        ),
      ]),
    );
  }
}

// ── Primary button ────────────────────────────────────────────────────────────
class _PrimaryBtn extends StatelessWidget {
  const _PrimaryBtn({
    required this.label,
    required this.icon,
    required this.color,
    required this.enabled,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final Color color;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: AnimatedOpacity(
        opacity: enabled ? 1 : 0.45,
        duration: const Duration(milliseconds: 150),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(12),
            boxShadow: enabled
                ? [
                    BoxShadow(
                      color: color.withValues(alpha: 0.28),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : [],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: Colors.white),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Status picker ─────────────────────────────────────────────────────────────
class _StatusPicker extends StatelessWidget {
  const _StatusPicker({
    required this.selected,
    required this.enabled,
    required this.onSelect,
  });
  final String? selected;
  final bool enabled;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _statuses.map((s) {
        final isSelected = selected == s;
        return GestureDetector(
          onTap: enabled ? () => onSelect(s) : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isSelected ? _statusBg(s) : _canvas,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: isSelected
                    ? _statusColor(s).withValues(alpha: 0.45)
                    : _border,
                width: isSelected ? 1.5 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _statusIcon(s),
                  size: 14,
                  color: isSelected ? _statusColor(s) : _muted,
                ),
                const SizedBox(width: 6),
                Text(
                  _cap(s),
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: isSelected ? _statusColor(s) : _ink,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Team staff card ───────────────────────────────────────────────────────────
class _TeamStaffCard extends StatelessWidget {
  const _TeamStaffCard({
    required this.staff,
    required this.record,
    required this.busy,
    required this.onMark,
  });
  final StaffMember staff;
  final AttendanceRecord? record;
  final bool busy;
  final ValueChanged<String> onMark;

  @override
  Widget build(BuildContext context) {
    final status = record?.status;
    final dayPay = staff.salaryType == 'daily_salary_plus_commission';
    final rate = staff.baseSalary ?? 0;
    final earns = status == 'present' || status == 'late';
    final times = [
      if (record?.checkIn != null) 'In ${_fmtClock(record!.checkIn)}',
      if (record?.checkOut != null) 'Out ${_fmtClock(record!.checkOut)}',
    ].join(' · ');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: status == null
              ? _border
              : _statusColor(status).withValues(alpha: 0.25),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: status == null
                      ? const Color(0xFFF1F5F9)
                      : _statusBg(status),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Text(
                    staff.name.isEmpty ? '?' : staff.name[0].toUpperCase(),
                    style: TextStyle(
                      color: status == null ? _muted : _statusColor(status),
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      staff.name,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: _ink,
                        letterSpacing: -0.2,
                      ),
                    ),
                    if (dayPay)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          earns
                              ? 'Day pay +LKR ${rate.toStringAsFixed(0)} today'
                              : 'Day pay LKR ${rate.toStringAsFixed(0)}/day',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: earns
                                ? const Color(0xFF059669)
                                : const Color(0xFFDB2777),
                          ),
                        ),
                      ),
                    Text(
                      times.isEmpty ? 'No clock times' : times,
                      style: const TextStyle(fontSize: 12, color: _muted),
                    ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: status == null
                      ? const Color(0xFFF8FAFC)
                      : _statusBg(status),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  status == null ? 'Open' : _cap(status),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: status == null ? _muted : _statusColor(status),
                  ),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            const Divider(height: 1, color: _border),
            const SizedBox(height: 10),
            Row(
              children: _statuses.map((st) {
                final selected = status == st;
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(
                      right: st == _statuses.last ? 0 : 6,
                    ),
                    child: GestureDetector(
                      onTap: busy ? null : () => onMark(st),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        padding: const EdgeInsets.symmetric(vertical: 9),
                        decoration: BoxDecoration(
                          color: selected ? _statusBg(st) : _canvas,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: selected
                                ? _statusColor(st).withValues(alpha: 0.4)
                                : _border,
                          ),
                        ),
                        child: Column(
                          children: [
                            Icon(
                              _statusIcon(st),
                              size: 15,
                              color: selected ? _statusColor(st) : _muted,
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _cap(st),
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: selected ? _statusColor(st) : _muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────
class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final String title, subtitle;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: const Color(0xFFECFDF5),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(icon, size: 30, color: _emerald),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: _ink,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: _muted, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}
