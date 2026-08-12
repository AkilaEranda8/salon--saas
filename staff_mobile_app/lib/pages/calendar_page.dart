import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/appointment.dart';
import '../models/salon_service.dart';
import '../state/app_state.dart';
import '../utils/salon_time.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas = Color(0xFFF2F5F2);
const Color _ink = Color(0xFF111827);
const Color _muted = Color(0xFF6B7280);
const Color _border = Color(0xFFE5E7EB);

/// Day grid hours (salon wall clock).
const int _gridStartHour = 7;
const int _gridEndHour = 21;
const double _hourH = 64;

class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key});

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  late DateTime _selectedDate;
  late DateTime _visibleMonth;

  @override
  void initState() {
    super.initState();
    final today = _parseYmd(salonToday()) ?? DateTime.now();
    _selectedDate = DateTime(today.year, today.month, today.day);
    _visibleMonth = DateTime(_selectedDate.year, _selectedDate.month, 1);
    WidgetsBinding.instance.addPostFrameCallback((_) => _ensureData());
  }

  Future<void> _ensureData() async {
    if (!mounted) return;
    final app = AppStateScope.of(context);
    try {
      if (app.services.isEmpty) await app.loadServices();
      await app.loadAppointments();
    } catch (_) {}
    if (mounted) setState(() {});
  }

  DateTime? _parseYmd(String raw) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(raw.trim());
    if (m == null) return null;
    return DateTime(
      int.parse(m.group(1)!),
      int.parse(m.group(2)!),
      int.parse(m.group(3)!),
    );
  }

  String _ymd(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')} ${_fullMonth(d.month)} ${d.year}';

  String _fullMonth(int m) => const [
        '',
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ][m];

  String _shortMonth(int m) => const [
        '',
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ][m];

  String _timeLabel(String raw) {
    final t = normalizeHm(raw);
    if (t.length < 5) return raw;
    final h = int.tryParse(t.substring(0, 2)) ?? 0;
    final min = int.tryParse(t.substring(3, 5)) ?? 0;
    final suffix = h >= 12 ? 'PM' : 'AM';
    final hh = h % 12 == 0 ? 12 : h % 12;
    return '$hh:${min.toString().padLeft(2, '0')} $suffix';
  }

  String _endHm(String start, int durationMin) {
    final end = hmToMinutes(start) + durationMin;
    final h = (end ~/ 60) % 24;
    final m = end % 60;
    return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}';
  }

  List<DateTime?> _monthGrid(DateTime month) {
    final first = DateTime(month.year, month.month, 1);
    final start = (first.weekday + 6) % 7;
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final cells = <DateTime?>[
      for (var i = 0; i < start; i++) null,
      for (var d = 1; d <= daysInMonth; d++)
        DateTime(month.year, month.month, d),
    ];
    while (cells.length < 42) {
      cells.add(null);
    }
    return cells;
  }

  _StatusStyle _statusStyle(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return const _StatusStyle(
            Color(0xFF1D4ED8), Color(0xFFEFF6FF), Color(0xFFBFDBFE));
      case 'in_service':
        return const _StatusStyle(
            Color(0xFF6D28D9), Color(0xFFF5F3FF), Color(0xFFC4B5FD));
      case 'completed':
        return const _StatusStyle(
            Color(0xFF065F46), Color(0xFFF0FDF4), Color(0xFF6EE7B7));
      case 'cancelled':
        return const _StatusStyle(
            Color(0xFF991B1B), Color(0xFFFFF1F2), Color(0xFFFCA5A5));
      default:
        return const _StatusStyle(
            Color(0xFF92400E), Color(0xFFFFFBEB), Color(0xFFFCD34D));
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final dateKey = _ymd(_selectedDate);
    final dayAppts = appState.appointments
        .where((a) => a.date == dateKey)
        .toList()
      ..sort((a, b) => a.time.compareTo(b.time));

    final busyDays = <String>{};
    for (final a in appState.appointments) {
      busyDays.add(a.date);
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: _canvas,
        body: SafeArea(
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 20, 20, 4),
                  child: Row(children: [
                    GestureDetector(
                      onTap: () => Navigator.of(context).maybePop(),
                      child: Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(11),
                          border: Border.all(color: _border),
                        ),
                        child: const Icon(Icons.arrow_back_ios_new_rounded,
                            size: 16, color: _forest),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Calendar',
                              style: TextStyle(
                                  color: _ink,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.3)),
                          Text(
                              '${_shortMonth(_visibleMonth.month)} ${_visibleMonth.year}',
                              style: const TextStyle(
                                  color: _muted,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500)),
                        ]),
                  ]),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: _buildCalendar(busyDays),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 22, 20, 10),
                  child: Row(children: [
                    Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _fmt(_selectedDate),
                              style: const TextStyle(
                                  color: _ink,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              dayAppts.isEmpty
                                  ? 'No appointments'
                                  : '${dayAppts.length} appointment${dayAppts.length == 1 ? '' : 's'} · duration blocks',
                              style: const TextStyle(
                                  color: _muted,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500),
                            ),
                          ]),
                    ),
                    if (dayAppts.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: _forest.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          '${dayAppts.length}',
                          style: const TextStyle(
                              color: _forest,
                              fontSize: 12,
                              fontWeight: FontWeight.w800),
                        ),
                      ),
                  ]),
                ),
              ),
              if (dayAppts.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 36),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: _border),
                      ),
                      child: Column(children: [
                        Icon(Icons.event_available_rounded,
                            size: 40,
                            color: _muted.withValues(alpha: 0.35)),
                        const SizedBox(height: 10),
                        const Text('No appointments scheduled',
                            style: TextStyle(
                                color: _muted,
                                fontSize: 14,
                                fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        const Text(
                            'Pick another day or book a new appointment',
                            style: TextStyle(
                                color: Color(0xFF9CA3AF), fontSize: 12)),
                      ]),
                    ),
                  ),
                )
              else
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    child: _buildDayTimeline(dayAppts, appState.services),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCalendar(Set<String> busyDays) {
    final grid = _monthGrid(_visibleMonth);
    final selected =
        DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day);
    final today = _parseYmd(salonToday()) ?? DateTime.now();
    final todayKey = DateTime(today.year, today.month, today.day);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
              color: _forest.withValues(alpha: 0.07),
              blurRadius: 20,
              offset: const Offset(0, 6)),
        ],
      ),
      child: Column(children: [
        Row(children: [
          GestureDetector(
            onTap: () => setState(() {
              _visibleMonth =
                  DateTime(_visibleMonth.year, _visibleMonth.month - 1, 1);
            }),
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: _canvas,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _border),
              ),
              child: const Icon(Icons.chevron_left_rounded,
                  size: 18, color: _forest),
            ),
          ),
          Expanded(
            child: Center(
              child: Text(
                '${_fullMonth(_visibleMonth.month)} ${_visibleMonth.year}',
                style: const TextStyle(
                    color: _ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2),
              ),
            ),
          ),
          GestureDetector(
            onTap: () => setState(() {
              _visibleMonth =
                  DateTime(_visibleMonth.year, _visibleMonth.month + 1, 1);
            }),
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: _canvas,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _border),
              ),
              child: const Icon(Icons.chevron_right_rounded,
                  size: 18, color: _forest),
            ),
          ),
        ]),
        const SizedBox(height: 14),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
              .map((d) => SizedBox(
                    width: 36,
                    child: Center(
                      child: Text(d,
                          style: const TextStyle(
                              fontSize: 10.5,
                              color: _muted,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.2)),
                    ),
                  ))
              .toList(),
        ),
        const SizedBox(height: 6),
        ...List.generate(6, (row) {
          final rowCells = grid.sublist(row * 7, row * 7 + 7);
          if (rowCells.every((c) => c == null)) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: rowCells.map((item) {
                if (item == null) return const SizedBox(width: 36, height: 40);
                final dateObj = DateTime(item.year, item.month, item.day);
                final isSel = dateObj == selected;
                final isToday = dateObj == todayKey;
                final dateStr = _ymd(item);
                final hasDot = busyDays.contains(dateStr) && !isSel;

                return GestureDetector(
                  onTap: () => setState(() => _selectedDate = item),
                  child: Container(
                    width: 36,
                    height: 40,
                    decoration: BoxDecoration(
                      color: isSel
                          ? _forest
                          : isToday
                              ? _forest.withValues(alpha: 0.08)
                              : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                      border: isToday && !isSel
                          ? Border.all(
                              color: _forest.withValues(alpha: 0.35),
                              width: 1.2)
                          : null,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          '${item.day}',
                          style: TextStyle(
                            color: isSel
                                ? Colors.white
                                : isToday
                                    ? _forest
                                    : _ink,
                            fontWeight: isSel || isToday
                                ? FontWeight.w800
                                : FontWeight.w500,
                            fontSize: 13,
                          ),
                        ),
                        if (hasDot)
                          Container(
                            margin: const EdgeInsets.only(top: 3),
                            width: 4,
                            height: 4,
                            decoration: BoxDecoration(
                              color: _emerald.withValues(alpha: 0.7),
                              shape: BoxShape.circle,
                            ),
                          )
                        else
                          const SizedBox(height: 7),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          );
        }),
      ]),
    );
  }

  /// Day schedule: block height = service duration (e.g. 120 min → 2 hours).
  Widget _buildDayTimeline(
      List<Appointment> dayAppts, List<SalonService> services) {
    final hours = List.generate(
        _gridEndHour - _gridStartHour + 1, (i) => _gridStartHour + i);
    final gridH = (_gridEndHour - _gridStartHour) * _hourH;
    final isToday = _ymd(_selectedDate) == salonToday();
    final nowMin = hmToMinutes(salonNowHm());
    final nowTop =
        ((nowMin - _gridStartHour * 60) / 60.0 * _hourH).clamp(0.0, gridH);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 52,
            height: gridH,
            child: Column(
              children: hours.take(hours.length - 1).map((h) {
                final label = h == 0
                    ? '12 am'
                    : h == 12
                        ? '12 pm'
                        : h < 12
                            ? '$h am'
                            : '${h - 12} pm';
                return SizedBox(
                  height: _hourH,
                  child: Align(
                    alignment: Alignment.topRight,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 8, top: 0),
                      child: Text(label,
                          style: const TextStyle(
                              fontSize: 10,
                              color: _muted,
                              fontWeight: FontWeight.w600)),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: SizedBox(
              height: gridH,
              child: Stack(
                children: [
                  ...hours.take(hours.length - 1).map((h) {
                    final top = (h - _gridStartHour) * _hourH;
                    return Positioned(
                      top: top,
                      left: 0,
                      right: 0,
                      child: Container(
                        height: _hourH,
                        decoration: const BoxDecoration(
                          border: Border(
                            bottom: BorderSide(color: Color(0xFFF1F5F9)),
                            left: BorderSide(color: _border),
                          ),
                        ),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Container(
                            margin: EdgeInsets.only(top: _hourH / 2),
                            height: 1,
                            color: const Color(0xFFF8FAFC),
                          ),
                        ),
                      ),
                    );
                  }),
                  if (isToday && nowTop > 0 && nowTop < gridH)
                    Positioned(
                      top: nowTop,
                      left: 0,
                      right: 0,
                      child: Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: Color(0xFFEF4444),
                              shape: BoxShape.circle,
                            ),
                          ),
                          Expanded(
                            child: Container(
                              height: 2,
                              color: const Color(0xFFEF4444).withValues(alpha: 0.75),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ...dayAppts.map((a) {
                    final dur = a.resolveDurationMinutes(services);
                    final startMin = hmToMinutes(a.time);
                    final top = ((startMin - _gridStartHour * 60) / 60.0 * _hourH)
                        .clamp(0.0, gridH - 8);
                    final hPx = (dur / 60.0 * _hourH - 4).clamp(44.0, gridH - top);
                    final style = _statusStyle(a.status);
                    final end = _endHm(a.time, dur);
                    final svc = a.resolveServicesDisplay(services);
                    return Positioned(
                      top: top + 2,
                      left: 6,
                      right: 8,
                      height: hPx,
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(10, 6, 8, 6),
                        decoration: BoxDecoration(
                          color: style.chipBg,
                          borderRadius: const BorderRadius.horizontal(
                              right: Radius.circular(10)),
                          border: Border(
                            left: BorderSide(color: style.barColor, width: 3),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${_timeLabel(a.time)} – ${_timeLabel(end)}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: style.textColor,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              a.customerName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: _ink,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (hPx >= 64) ...[
                              const SizedBox(height: 2),
                              Text(
                                '$svc · $dur min',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: _muted,
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusStyle {
  const _StatusStyle(this.textColor, this.chipBg, this.barColor);
  final Color textColor;
  final Color chipBg;
  final Color barColor;
}
