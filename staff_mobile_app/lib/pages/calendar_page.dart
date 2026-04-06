import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/appointment.dart';
import '../models/salon_service.dart';
import '../state/app_state.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest  = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas  = Color(0xFFF2F5F2);
const Color _ink     = Color(0xFF111827);
const Color _muted   = Color(0xFF6B7280);
const Color _border  = Color(0xFFE5E7EB);

class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key});

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  DateTime _selectedDate = DateTime.now();
  late DateTime _visibleMonth =
      DateTime(_selectedDate.year, _selectedDate.month, 1);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')} ${_fullMonth(d.month)} ${d.year}';

  String _fullMonth(int m) => const [
        '', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ][m];

  String _shortMonth(int m) => const [
        '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ][m];

  String _timeLabel(String raw) {
    final parts = raw.split(':');
    if (parts.length < 2) return raw;
    final h = int.tryParse(parts[0]) ?? 0;
    final min = int.tryParse(parts[1]) ?? 0;
    final suffix = h >= 12 ? 'PM' : 'AM';
    final hh = h % 12 == 0 ? 12 : h % 12;
    return '$hh:${min.toString().padLeft(2, '0')} $suffix';
  }

  List<DateTime?> _monthGrid(DateTime month) {
    final first = DateTime(month.year, month.month, 1);
    final start = (first.weekday + 6) % 7;
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final cells = <DateTime?>[
      for (var i = 0; i < start; i++) null,
      for (var d = 1; d <= daysInMonth; d++) DateTime(month.year, month.month, d),
    ];
    while (cells.length < 42) { cells.add(null); }
    return cells;
  }

  _StatusStyle _statusStyle(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return const _StatusStyle(
            Color(0xFF1D4ED8), Color(0xFFEFF6FF), Color(0xFFBFDBFE));
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

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final dateKey =
        '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';
    final dayAppts = appState.appointments
        .where((a) => a.date == dateKey)
        .toList()
      ..sort((a, b) => a.time.compareTo(b.time));

    // Days that have at least one appointment this visible month
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
              // ── Header ──────────────────────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 20, 20, 4),
                  child: Row(children: [
                    GestureDetector(
                      onTap: () => Navigator.of(context).maybePop(),
                      child: Container(
                        width: 38, height: 38,
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
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Calendar',
                          style: TextStyle(
                              color: _ink,
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.3)),
                      Text('${_shortMonth(_visibleMonth.month)} ${_visibleMonth.year}',
                          style: const TextStyle(
                              color: _muted,
                              fontSize: 12,
                              fontWeight: FontWeight.w500)),
                    ]),
                  ]),
                ),
              ),

              // ── Calendar card ────────────────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: _buildCalendar(busyDays),
                ),
              ),

              // ── Day header ───────────────────────────────────────────────
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
                                  : '${dayAppts.length} appointment${dayAppts.length == 1 ? '' : 's'}',
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

              // ── Appointment list ─────────────────────────────────────────
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
                        const Text('Pick another day or book a new appointment',
                            style: TextStyle(
                                color: Color(0xFF9CA3AF), fontSize: 12)),
                      ]),
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (_, i) => _buildApptCard(
                          dayAppts[i], appState.services),
                      childCount: dayAppts.length,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Calendar grid ─────────────────────────────────────────────────────────
  Widget _buildCalendar(Set<String> busyDays) {
    final grid     = _monthGrid(_visibleMonth);
    final selected = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day);
    final now      = DateTime.now();
    final todayKey = DateTime(now.year, now.month, now.day);

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

        // Month nav row
        Row(children: [
          GestureDetector(
            onTap: () => setState(() {
              _visibleMonth =
                  DateTime(_visibleMonth.year, _visibleMonth.month - 1, 1);
            }),
            child: Container(
              width: 34, height: 34,
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
              width: 34, height: 34,
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

        // Day-of-week labels
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

        // Day cells
        ...List.generate(6, (row) {
          final rowCells = grid.sublist(row * 7, row * 7 + 7);
          // Skip empty trailing rows
          if (rowCells.every((c) => c == null)) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: rowCells.map((item) {
                if (item == null) return const SizedBox(width: 36, height: 40);
                final dateObj  = DateTime(item.year, item.month, item.day);
                final isSel    = dateObj == selected;
                final isToday  = dateObj == todayKey;
                final dateStr  =
                    '${item.year}-${item.month.toString().padLeft(2, '0')}-${item.day.toString().padLeft(2, '0')}';
                final hasDot   = busyDays.contains(dateStr) && !isSel;

                return GestureDetector(
                  onTap: () => setState(() => _selectedDate = item),
                  child: Container(
                    width: 36, height: 40,
                    decoration: BoxDecoration(
                      color: isSel
                          ? _forest
                          : isToday
                              ? _forest.withValues(alpha: 0.08)
                              : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                      border: isToday && !isSel
                          ? Border.all(
                              color: _forest.withValues(alpha: 0.35), width: 1.2)
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
                            width: 4, height: 4,
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

  // ── Appointment card ──────────────────────────────────────────────────────
  Widget _buildApptCard(Appointment appt, List<SalonService> services) {
    final style = _statusStyle(appt.status);
    final svc   = appt.resolveServicesDisplay(services);
    final time  = _timeLabel(appt.time);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Row(children: [
        // Left colour bar
        Container(
          width: 4,
          height: 70,
          decoration: BoxDecoration(
            color: style.barColor,
            borderRadius: const BorderRadius.horizontal(
                left: Radius.circular(14)),
          ),
        ),
        const SizedBox(width: 12),
        // Time column
        SizedBox(
          width: 54,
          child: Text(time,
              style: const TextStyle(
                  color: _ink,
                  fontSize: 12,
                  fontWeight: FontWeight.w800)),
        ),
        Container(width: 1, height: 36, color: _border),
        const SizedBox(width: 12),
        // Details
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(appt.customerName,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: _ink,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 3),
              Text(svc,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: _muted,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w500)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        // Status chip
        Container(
          margin: const EdgeInsets.only(right: 12),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: style.chipBg,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            appt.status.isEmpty ? 'Pending' : _capitalize(appt.status),
            style: TextStyle(
                color: style.textColor,
                fontSize: 10.5,
                fontWeight: FontWeight.w700),
          ),
        ),
      ]),
    );
  }

  String _capitalize(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1).toLowerCase();
}

class _StatusStyle {
  const _StatusStyle(this.textColor, this.chipBg, this.barColor);
  final Color textColor;
  final Color chipBg;
  final Color barColor;
}
