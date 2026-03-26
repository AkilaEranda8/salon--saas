import 'package:flutter/material.dart';

import '../models/appointment.dart';
import '../state/app_state.dart';

class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key});

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  DateTime _selectedDate = DateTime.now();
  late DateTime _visibleMonth = DateTime(_selectedDate.year, _selectedDate.month, 1);

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final dateKey = _selectedDate.toIso8601String().split('T').first;
    final dayAppointments = appState.appointments
        .where((a) => a.date == dateKey)
        .toList()
      ..sort((a, b) => a.time.compareTo(b.time));

    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FB),
      appBar: AppBar(
        title: const Text('Calendar'),
        backgroundColor: const Color(0xFFF5F6FB),
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _monthCard(),
          const SizedBox(height: 14),
          _dayScheduleCard(dayAppointments),
        ],
      ),
    );
  }

  Widget _monthCard() {
    final monthLabel = '${_monthName(_visibleMonth.month)} ${_visibleMonth.year}';
    final grid = _monthGrid(_visibleMonth);
    final selected = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day);
    final today = DateTime.now();
    final todayKey = DateTime(today.year, today.month, today.day);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(color: Color(0x12000000), blurRadius: 16, offset: Offset(0, 8)),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              const CircleAvatar(
                radius: 12,
                backgroundColor: Color(0xFFEDE9FE),
                child: Text('S', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 8),
              const Text('slothui', style: TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              IconButton(
                onPressed: () => setState(() {
                  _visibleMonth = DateTime(_visibleMonth.year, _visibleMonth.month - 1, 1);
                }),
                icon: const Icon(Icons.chevron_left, size: 18),
                visualDensity: VisualDensity.compact,
              ),
              Text(monthLabel, style: const TextStyle(fontWeight: FontWeight.w700)),
              IconButton(
                onPressed: () => setState(() {
                  _visibleMonth = DateTime(_visibleMonth.year, _visibleMonth.month + 1, 1);
                }),
                icon: const Icon(Icons.chevron_right, size: 18),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                .map(
                  (d) => SizedBox(
                    width: 34,
                    child: Center(
                      child: Text(
                        d,
                        style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 4),
          ...List.generate(6, (row) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(7, (col) {
                  final item = grid[row * 7 + col];
                  if (item == null) return const SizedBox(width: 34, height: 34);
                  final dateObj = DateTime(item.year, item.month, item.day);
                  final isSel = dateObj == selected;
                  final isToday = dateObj == todayKey;
                  return InkWell(
                    onTap: () => setState(() {
                      _selectedDate = item;
                    }),
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: isSel ? const Color(0xFF4F46E5) : (isToday ? const Color(0xFFEFF6FF) : Colors.transparent),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Center(
                        child: Text(
                          '${item.day}',
                          style: TextStyle(
                            color: isSel ? Colors.white : const Color(0xFF0F172A),
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _dayScheduleCard(List<Appointment> dayAppointments) {
    final dateLabel =
        '${_monthName(_selectedDate.month)} ${_selectedDate.day}, ${_selectedDate.year}';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(color: Color(0x12000000), blurRadius: 16, offset: Offset(0, 8)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const CircleAvatar(
                radius: 12,
                backgroundColor: Color(0xFFEDE9FE),
                child: Text('S', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 8),
              const Text('slothui', style: TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              const Icon(Icons.search, size: 18, color: Color(0xFF64748B)),
              const SizedBox(width: 10),
              const Icon(Icons.more_horiz, size: 18, color: Color(0xFF64748B)),
            ],
          ),
          const SizedBox(height: 8),
          Text(dateLabel, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          const SizedBox(height: 10),
          if (dayAppointments.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 14),
              child: Text(
                'No appointments for this day',
                style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w600),
              ),
            )
          else
            ...dayAppointments.map(
              (appt) {
                final style = _statusStyle(appt.status);
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: style.bgColor,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${appt.customerName} (${appt.serviceName})',
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: style.color,
                            fontWeight: FontWeight.w700,
                            fontSize: 12.5,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _timeLabel(appt.time),
                        style: const TextStyle(
                          color: Color(0xFF475569),
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  String _monthName(int month) {
    const names = [
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
    ];
    return names[month - 1];
  }

  List<DateTime?> _monthGrid(DateTime month) {
    final first = DateTime(month.year, month.month, 1);
    final start = (first.weekday + 6) % 7; // Monday-start
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final cells = <DateTime?>[];
    for (var i = 0; i < start; i++) {
      cells.add(null);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      cells.add(DateTime(month.year, month.month, d));
    }
    while (cells.length < 42) {
      cells.add(null);
    }
    return cells;
  }

  String _timeLabel(String raw) {
    final parts = raw.split(':');
    if (parts.length < 2) return raw;
    final h = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 0;
    final suffix = h >= 12 ? 'pm' : 'am';
    final hh = (h % 12 == 0) ? 12 : h % 12;
    return '$hh:${m.toString().padLeft(2, '0')} $suffix';
  }

  _StatusStyle _statusStyle(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return const _StatusStyle(Color(0xFF2563EB), Color(0xFFDBEAFE));
      case 'completed':
        return const _StatusStyle(Color(0xFF059669), Color(0xFFD1FAE5));
      case 'cancelled':
        return const _StatusStyle(Color(0xFFDC2626), Color(0xFFFEE2E2));
      default:
        return const _StatusStyle(Color(0xFFD97706), Color(0xFFFEF3C7));
    }
  }
}

class _StatusStyle {
  const _StatusStyle(this.color, this.bgColor);

  final Color color;
  final Color bgColor;
}
