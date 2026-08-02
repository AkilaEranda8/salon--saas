import 'package:flutter/material.dart';

import '../models/attendance_record.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';

const Color _forest = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border = Color(0xFFE5E7EB);
const Color _ink = Color(0xFF111827);
const Color _muted = Color(0xFF6B7280);

const _statuses = ['present', 'absent', 'leave', 'late'];

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

  bool get _teamMode {
    final role = AppStateScope.of(context).currentUser?.role ?? '';
    return role == 'superadmin' || role == 'admin' || role == 'manager';
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
        ]);
        if (!mounted) return;
        setState(() {
          _records = results[0] as List<AttendanceRecord>;
          _staff = (results[1] as List<StaffMember>)
              .where((s) => s.isActive)
              .toList();
        });
      } else {
        final staffId = app.currentUser?.linkedStaffId?.trim() ?? '';
        final rows = await app.loadAttendance(
          date: _date,
          staffId: staffId.isEmpty ? null : staffId,
        );
        if (!mounted) return;
        setState(() {
          _records = rows;
          _staff = const [];
        });
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

  AttendanceRecord? _mine() {
    final staffId = AppStateScope.of(context).currentUser?.linkedStaffId?.trim();
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
    final row = await app.upsertAttendance(
      staffId: staffId,
      date: _date,
      status: 'present',
      checkIn: _nowTime(),
    );
    setState(() => _busy = false);
    if (row == null) {
      _toast(app.lastError ?? 'Check-in failed');
      return;
    }
    _toast('Checked in');
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
    final row = await app.updateAttendanceRecord(
      id: mine.id,
      checkOut: _nowTime(),
    );
    setState(() => _busy = false);
    if (row == null) {
      _toast(app.lastError ?? 'Check-out failed');
      return;
    }
    _toast('Checked out');
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
    final row = await app.upsertAttendance(
      staffId: staffId,
      date: _date,
      status: status,
    );
    setState(() => _busy = false);
    if (row == null) {
      _toast(app.lastError ?? 'Update failed');
      return;
    }
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

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final isToday = _date == _today();
    final canGoNext = _date.compareTo(_today()) < 0;

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        title: Text(_teamMode ? 'Team Attendance' : 'My Attendance'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: _surface,
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Row(
              children: [
                IconButton(
                  onPressed: () {
                    setState(() => _date = _shiftDate(_date, -1));
                    _load();
                  },
                  icon: const Icon(Icons.chevron_left_rounded),
                ),
                Expanded(
                  child: Column(
                    children: [
                      Text(
                        _date,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          color: _ink,
                        ),
                      ),
                      Text(
                        isToday ? 'Today' : '',
                        style: const TextStyle(fontSize: 12, color: _muted),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: canGoNext
                      ? () {
                          setState(() => _date = _shiftDate(_date, 1));
                          _load();
                        }
                      : null,
                  icon: const Icon(Icons.chevron_right_rounded),
                ),
                if (!isToday)
                  TextButton(
                    onPressed: () {
                      setState(() => _date = _today());
                      _load();
                    },
                    child: const Text('Today'),
                  ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _emerald))
                : _teamMode
                    ? _buildTeam()
                    : _buildSelf(isToday: isToday),
          ),
        ],
      ),
    );
  }

  Widget _buildSelf({required bool isToday}) {
    final mine = _mine();
    final status = mine?.status ?? 'not_marked';
    final linked = AppStateScope.of(context).currentUser?.linkedStaffId?.trim();

    if (linked == null || linked.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'No staff profile is linked to this login. Ask an admin to link your account.',
            textAlign: TextAlign.center,
            style: TextStyle(color: _muted),
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: _surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: status == 'not_marked'
                          ? const Color(0xFFF8FAFC)
                          : _statusBg(status),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      status == 'not_marked' ? 'Not marked' : _cap(status),
                      style: TextStyle(
                        color: status == 'not_marked'
                            ? _muted
                            : _statusColor(status),
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  const Spacer(),
                  if (_busy)
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              _timeRow('Check-in', mine?.checkIn),
              const SizedBox(height: 8),
              _timeRow('Check-out', mine?.checkOut),
              if (isToday) ...[
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _busy || (mine?.checkIn != null)
                            ? null
                            : _checkIn,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _emerald,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        icon: const Icon(Icons.login_rounded),
                        label: const Text('Check in'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _busy ||
                                mine == null ||
                                mine.checkIn == null ||
                                mine.checkOut != null
                            ? null
                            : _checkOut,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _forest,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        icon: const Icon(Icons.logout_rounded),
                        label: const Text('Check out'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Text(
                  'Or mark status',
                  style: TextStyle(fontSize: 12, color: _muted, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _statuses.map((s) {
                    final selected = mine?.status == s;
                    return ChoiceChip(
                      label: Text(_cap(s)),
                      selected: selected,
                      selectedColor: _statusBg(s),
                      labelStyle: TextStyle(
                        color: selected ? _statusColor(s) : _ink,
                        fontWeight: FontWeight.w600,
                      ),
                      onSelected: _busy
                          ? null
                          : (_) => _markSelfStatus(s),
                    );
                  }).toList(),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _timeRow(String label, String? value) {
    return Row(
      children: [
        SizedBox(
          width: 90,
          child: Text(label, style: const TextStyle(color: _muted, fontSize: 13)),
        ),
        Text(
          value == null || value.isEmpty ? '—' : value,
          style: const TextStyle(
            color: _ink,
            fontWeight: FontWeight.w700,
            fontSize: 16,
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

    final present = _records.where((r) => r.status == 'present' || r.status == 'late').length;
    final leave = _records.where((r) => r.status == 'leave').length;
    final absent = _records.where((r) => r.status == 'absent').length;
    final unmarked = _staff.where((s) => !byStaff.containsKey(s.id)).length;

    if (_staff.isEmpty) {
      return const Center(
        child: Text('No active staff found', style: TextStyle(color: _muted)),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            _miniStat('Present', '$present', const Color(0xFF059669)),
            const SizedBox(width: 8),
            _miniStat('Leave', '$leave', const Color(0xFFD97706)),
            const SizedBox(width: 8),
            _miniStat('Absent', '$absent', const Color(0xFFDC2626)),
            const SizedBox(width: 8),
            _miniStat('Open', '$unmarked', _muted),
          ],
        ),
        const SizedBox(height: 14),
        ..._staff.map((s) {
          final rec = byStaff[s.id];
          final status = rec?.status;
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: _surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: _border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: const Color(0xFFD1FAE5),
                      child: Text(
                        s.name.isEmpty ? '?' : s.name[0].toUpperCase(),
                        style: const TextStyle(
                          color: _forest,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            s.name,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: _ink,
                            ),
                          ),
                          Text(
                            [
                              if (rec?.checkIn != null) 'In ${rec!.checkIn}',
                              if (rec?.checkOut != null) 'Out ${rec!.checkOut}',
                            ].where((e) => e.isNotEmpty).join(' · ').ifEmpty('No clock times'),
                            style: const TextStyle(fontSize: 12, color: _muted),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: status == null
                            ? const Color(0xFFF8FAFC)
                            : _statusBg(status),
                        borderRadius: BorderRadius.circular(12),
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
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ..._statuses.map((st) {
                      return ActionChip(
                        label: Text(_cap(st), style: const TextStyle(fontSize: 12)),
                        onPressed: _busy
                            ? null
                            : () => _markTeam(
                                  staffId: s.id,
                                  status: st,
                                  checkIn: st == 'present' && rec?.checkIn == null
                                      ? _nowTime()
                                      : null,
                                ),
                      );
                    }),
                  ],
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _miniStat(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: _surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _border),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: color,
              ),
            ),
            Text(label, style: const TextStyle(fontSize: 11, color: _muted)),
          ],
        ),
      ),
    );
  }
}

extension on String {
  String ifEmpty(String fallback) => trim().isEmpty ? fallback : this;
}
