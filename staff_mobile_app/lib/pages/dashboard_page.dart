import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/appointment.dart';
import '../models/salon_service.dart';
import '../models/staff_user.dart';
import '../state/app_state.dart';
import '../services/notification_store.dart';
import 'ai_chat_page.dart';
import 'appointments_page.dart';
import 'calendar_page.dart';
import 'commission_page.dart';
import 'customers_page.dart';
import 'login_page.dart';
import 'notifications_page.dart';
import 'payments_page.dart';
import 'permissions_page.dart';
import 'reminders_page.dart';
import 'services_page.dart';
import 'staff_page.dart';
import 'walkin_page.dart';

// ── Design tokens ─────────────────────────────────────────────────────────────
const _bg       = Color(0xFFF2F5F2);
const _card     = Colors.white;
const _g900     = Color(0xFF1B3A2D);
const _g700     = Color(0xFF2D6A4F);
const _g100     = Color(0xFFD1FAE5);
const _gold     = Color(0xFFC9956C);
const _text     = Color(0xFF111827);
const _sub      = Color(0xFF6B7280);
const _muted    = Color(0xFF9CA3AF);
const _divider  = Color(0xFFE5E7EB);
// ─────────────────────────────────────────────────────────────────────────────

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage>
    with SingleTickerProviderStateMixin {
  Future<void>? _loadFuture;
  String? _error;
  late AnimationController _ac;
  late Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ));
    _ac = AnimationController(vsync: this, duration: const Duration(milliseconds: 550));
    _fade = CurvedAnimation(parent: _ac, curve: Curves.easeOut);
    Future.microtask(() { if (mounted) _ac.forward(); });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _loadFuture ??= _load();
  }

  @override
  void dispose() { _ac.dispose(); super.dispose(); }

  Future<void> _load() async {
    final s = AppStateScope.of(context);
    try {
      await Future.wait([
        if (s.hasPermission(StaffPermission.canViewAppointments)) s.loadAppointments(),
        if (s.hasPermission(StaffPermission.canViewCustomers))    s.loadCustomers(),
        s.loadServices(),
      ]);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load data — check your connection.');
    }
  }

  Future<void> _refreshDashboard() async {
    if (!mounted) return;
    setState(() => _error = null);
    await _load();
  }

  void _logout() {
    AppStateScope.of(context).logout();
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginPage()), (_) => false);
  }

  void _go(Widget page) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));

  void _noPerm() => ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: const Text('No permission for this section'),
    backgroundColor: _g900,
    behavior: SnackBarBehavior.floating,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
  ));

  static String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  static String _dateStr() {
    final n = DateTime.now();
    const wd = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${wd[n.weekday-1]}, ${mo[n.month-1]} ${n.day}';
  }

  @override
  Widget build(BuildContext context) {
    final s    = AppStateScope.of(context);
    final user = s.currentUser;

    return Scaffold(
      backgroundColor: _bg,
      body: FadeTransition(
        opacity: _fade,
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Header (scrolls with content) ──────────────────────────────
              _Header(
                greeting:        _greeting(),
                dateStr:         _dateStr(),
                userName:        user?.displayName ?? 'Staff',
                role:            user?.role ?? 'staff',
                onRefresh:       _refreshDashboard,
                onLogout:        _logout,
                onNotifications: () => _go(const NotificationsPage()),
              ),

              // ── Body ───────────────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 36),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [

                    // ── Stats 2×2 ─────────────────────────────────────────────
                    _statRow([
                      _StatData('Appointments', '${s.appointments.length}',
                          Icons.event_rounded, _g900, _g100,
                          onTap: s.hasPermission(StaffPermission.canViewAppointments)
                              ? () => _go(const AppointmentsPage()) : null),
                      _StatData('Customers', '${s.customers.length}',
                          Icons.people_alt_rounded,
                          const Color(0xFF2563EB), const Color(0xFFDBEAFE),
                          onTap: s.hasPermission(StaffPermission.canViewCustomers)
                              ? () => _go(const CustomersPage()) : null),
                    ]),
                    const SizedBox(height: 10),
                    _statRow([
                      _StatData('Services', '${s.services.length}',
                          Icons.content_cut_rounded,
                          const Color(0xFF7C3AED), const Color(0xFFEDE9FE)),
                      _StatData('My Role',
                          (user?.role ?? 'staff').toUpperCase(),
                          Icons.shield_rounded, _gold,
                          const Color(0xFFFEF3C7)),
                    ]),
                    const SizedBox(height: 24),

                    // ── Quick Actions ─────────────────────────────────────────
                    const _SectionLabel(text: 'Quick Actions'),
                    const SizedBox(height: 12),
                    _buildActions(s),
                    const SizedBox(height: 24),

                    // ── Recent Appointments ───────────────────────────────────
                    Row(children: [
                      const Expanded(child: _SectionLabel(text: 'Recent Appointments')),
                      _TextChip(
                        label: 'See all',
                        onTap: s.hasPermission(StaffPermission.canViewAppointments)
                            ? () => _go(const AppointmentsPage()) : null,
                      ),
                    ]),
                    const SizedBox(height: 12),
                    _recentSection(s),

                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      _ErrorBanner(message: _error!),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  Widget _statRow(List<_StatData> items) => Row(
    children: items
        .map((d) => Expanded(child: _StatCard(data: d)))
        .expand((w) => [w, const SizedBox(width: 10)])
        .toList()..removeLast(),
  );

  Widget _buildActions(AppState s) {
    final items = [
      _NavData('Appointments', Icons.calendar_month_rounded,
          [const Color(0xFF1B3A2D), const Color(0xFF2D6A4F)],
          const AppointmentsPage(),
          ok: s.hasPermission(StaffPermission.canViewAppointments)),
      _NavData('Customers', Icons.people_alt_rounded,
          [const Color(0xFF1D4ED8), const Color(0xFF3B82F6)],
          const CustomersPage(),
          ok: s.hasPermission(StaffPermission.canViewCustomers)),
      _NavData('Services', Icons.design_services_rounded,
          [const Color(0xFF6D28D9), const Color(0xFF8B5CF6)],
          const ServicesPage()),
      _NavData('Payments', Icons.payments_rounded,
          [const Color(0xFF0369A1), const Color(0xFF06B6D4)],
          const PaymentsPage()),
      _NavData('Calendar', Icons.calendar_today_rounded,
          [const Color(0xFF9D174D), const Color(0xFFEC4899)],
          const CalendarPage()),
      _NavData('Walk-in', Icons.directions_walk_rounded,
          [const Color(0xFFB45309), const Color(0xFFF59E0B)],
          const WalkInPage()),
      _NavData('Staff', Icons.badge_rounded,
          [const Color(0xFF047857), const Color(0xFF10B981)],
          const StaffPage()),
      _NavData('Commission', Icons.monetization_on_rounded,
          [const Color(0xFF15803D), const Color(0xFF22C55E)],
          const CommissionPage()),
      _NavData('AI Chat', Icons.smart_toy_rounded,
          [const Color(0xFF6B21A8), const Color(0xFFA855F7)],
          const AiChatPage()),
      _NavData('Reminders', Icons.notifications_active_rounded,
          [const Color(0xFFBE123C), const Color(0xFFF43F5E)],
          const RemindersPage()),
      _NavData('Permissions', Icons.admin_panel_settings_rounded,
          [const Color(0xFF374151), const Color(0xFF9CA3AF)],
          const PermissionsPage(),
          ok: s.hasPermission(StaffPermission.canManagePermissions)),
    ];

    // 3-column grid
    const cols = 3;
    const gap  = 10.0;
    final rows = <Widget>[];
    for (int i = 0; i < items.length; i += cols) {
      final rowItems = items.sublist(i, (i + cols).clamp(0, items.length));
      rows.add(Row(
        children: [
          for (int j = 0; j < cols; j++) ...[
            if (j < rowItems.length)
              Expanded(
                child: _NavTile(
                  data: rowItems[j],
                  onTap: rowItems[j].ok
                      ? () => _go(rowItems[j].page)
                      : _noPerm,
                ),
              )
            else
              const Expanded(child: SizedBox()),
            if (j < cols - 1) const SizedBox(width: gap),
          ],
        ],
      ));
      if (i + cols < items.length) rows.add(const SizedBox(height: gap));
    }
    return Column(children: rows);
  }

  Widget _recentSection(AppState s) {
    if (!s.hasPermission(StaffPermission.canViewAppointments)) {
      return _HintCard(icon: Icons.lock_outline_rounded,
          text: 'No permission to view appointments.');
    }
    if (_loadFuture != null) {
      return FutureBuilder<void>(
        future: _loadFuture,
        builder: (_, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator(
                  color: _g700, strokeWidth: 2.5)),
            );
          }
          return _apptList(s);
        },
      );
    }
    return _apptList(s);
  }

  Widget _apptList(AppState s) {
    final list = s.appointments.toList()
      ..sort((a, b) {
        final d = a.date.compareTo(b.date);
        return d != 0 ? d : a.time.compareTo(b.time);
      });
    final top = list.reversed.take(4).toList();
    if (top.isEmpty) {
      return _HintCard(icon: Icons.event_busy_rounded,
          text: 'No appointments yet — tap Appointments to add one.');
    }
    return Column(
      children: top
          .map((a) => _ApptCard(appt: a, services: s.services))
          .toList(),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Header
// ═══════════════════════════════════════════════════════════════════════════════

class _Header extends StatelessWidget {
  const _Header({
    required this.greeting,
    required this.dateStr,
    required this.userName,
    required this.role,
    required this.onRefresh,
    required this.onLogout,
    required this.onNotifications,
  });

  final String greeting, dateStr, userName, role;
  final Future<void> Function() onRefresh;
  final VoidCallback onLogout;
  final VoidCallback onNotifications;

  @override
  Widget build(BuildContext context) {
    final initial = userName.isNotEmpty ? userName[0].toUpperCase() : 'S';

    return Container(
      color: _bg,
      child: SafeArea(
        bottom: false,
        child: Column(children: [

          // ── Top bar ─────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
            child: Row(children: [
              // Brand
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.content_cut_rounded, color: _g900, size: 16),
                const SizedBox(width: 7),
                const Text('HEXA SALON',
                    style: TextStyle(
                        color: _g900, fontSize: 16,
                        fontWeight: FontWeight.w800, letterSpacing: 0.2)),
              ]),
              const Spacer(),
              // ── Bell icon with unread badge ──────────────────────────
              ValueListenableBuilder<List<AppNotification>>(
                valueListenable: NotificationStore.instance.notifications,
                builder: (_, list, __) {
                  final unread = list.where((n) => !n.isRead).length;
                  return GestureDetector(
                    onTap: onNotifications,
                    child: Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        boxShadow: [
                          BoxShadow(
                              color: Colors.black.withValues(alpha: 0.08),
                              blurRadius: 8, offset: const Offset(0, 2)),
                        ],
                      ),
                      child: Stack(
                        clipBehavior: Clip.none,
                        alignment: Alignment.center,
                        children: [
                          const Icon(Icons.notifications_rounded,
                              color: Color(0xFF6B7280), size: 19),
                          if (unread > 0)
                            Positioned(
                              top: -2, right: -2,
                              child: Container(
                                width: 16, height: 16,
                                decoration: const BoxDecoration(
                                  color: Color(0xFFDC2626),
                                  shape: BoxShape.circle,
                                ),
                                child: Center(
                                  child: Text(
                                    unread > 9 ? '9+' : '$unread',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 9,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () => onRefresh(),
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 8, offset: const Offset(0, 2)),
                    ],
                  ),
                  child: const Icon(Icons.refresh_rounded,
                      color: Color(0xFF6B7280), size: 17),
                ),
              ),
              const SizedBox(width: 10),
              PopupMenuButton<String>(
                tooltip: 'Account',
                offset: const Offset(0, 44),
                onSelected: (value) {
                  if (value == 'logout') onLogout();
                },
                itemBuilder: (context) => [
                  const PopupMenuItem<String>(
                    value: 'logout',
                    child: Row(
                      children: [
                        Icon(Icons.logout_rounded, size: 20, color: _g900),
                        SizedBox(width: 10),
                        Text('Log out'),
                      ],
                    ),
                  ),
                ],
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [_g700, _g900],
                    ),
                    boxShadow: [
                      BoxShadow(
                          color: _g900.withValues(alpha: 0.30),
                          blurRadius: 8, offset: const Offset(0, 2)),
                    ],
                  ),
                  child: Center(
                    child: Text(initial,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 15,
                            fontWeight: FontWeight.w900)),
                  ),
                ),
              ),
            ]),
          ),

          // ── Welcome banner card ──────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: const LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: [_g900, _g700, Color(0xFF3A8C62)],
                ),
                boxShadow: [
                  BoxShadow(
                      color: _g900.withValues(alpha: 0.30),
                      blurRadius: 16, offset: const Offset(0, 6)),
                ],
              ),
              child: Row(children: [
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$greeting 👋',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18, fontWeight: FontWeight.w900,
                            letterSpacing: -0.3)),
                    const SizedBox(height: 5),
                    Text('$userName  ·  ${role[0].toUpperCase()}${role.substring(1)}',
                        style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.75),
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 8),
                    Row(children: [
                      const Icon(Icons.calendar_today_rounded,
                          color: _gold, size: 12),
                      const SizedBox(width: 5),
                      Text(dateStr,
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.60),
                              fontSize: 11, fontWeight: FontWeight.w500)),
                    ]),
                  ],
                )),
                // Decorative icon
                Container(
                  width: 52, height: 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.12),
                  ),
                  child: const Icon(Icons.trending_up_rounded,
                      color: _gold, size: 26),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Blob extends StatelessWidget {
  const _Blob(this.size, this.color);
  final double size; final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: size, height: size,
    decoration: BoxDecoration(shape: BoxShape.circle, color: color));
}



// ═══════════════════════════════════════════════════════════════════════════════
// Section label
// ═══════════════════════════════════════════════════════════════════════════════

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Row(children: [
    Container(
      width: 3, height: 16,
      decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(2), color: _g700)),
    const SizedBox(width: 8),
    Text(text,
        style: const TextStyle(color: _text, fontSize: 15,
            fontWeight: FontWeight.w800, letterSpacing: 0.1)),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stat card  — horizontal icon | value / label layout
// ═══════════════════════════════════════════════════════════════════════════════

class _StatData {
  const _StatData(this.label, this.value, this.icon,
      this.accent, this.bg, {this.onTap});
  final String label, value;
  final IconData icon;
  final Color accent, bg;
  final VoidCallback? onTap;
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.data});
  final _StatData data;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: data.onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
        decoration: BoxDecoration(
          color: _card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: data.accent.withValues(alpha: 0.14)),
          boxShadow: [
            BoxShadow(color: data.accent.withValues(alpha: 0.07),
                blurRadius: 10, offset: const Offset(0, 4)),
          ],
        ),
        child: Row(children: [
          // Icon bubble
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
                color: data.bg, borderRadius: BorderRadius.circular(11)),
            child: Icon(data.icon, color: data.accent, size: 20),
          ),
          const SizedBox(width: 11),
          // Value + label
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(data.value,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: data.accent,
                    fontSize: data.value.length > 5 ? 12 : 22,
                    fontWeight: FontWeight.w800,
                    letterSpacing: data.value.length > 5 ? 0.6 : -0.5,
                  )),
                const SizedBox(height: 2),
                Text(data.label,
                  style: const TextStyle(color: _sub, fontSize: 11,
                      fontWeight: FontWeight.w500)),
              ],
            ),
          ),
          if (data.onTap != null)
            Icon(Icons.chevron_right_rounded,
                color: data.accent.withValues(alpha: 0.45), size: 18),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Nav tile  — 3-column gradient card
// ═══════════════════════════════════════════════════════════════════════════════

class _NavData {
  const _NavData(this.label, this.icon, this.colors, this.page, {this.ok = true});
  final String label;
  final IconData icon;
  final List<Color> colors;
  final Widget page;
  final bool ok;
}

class _NavTile extends StatelessWidget {
  const _NavTile({required this.data, required this.onTap});
  final _NavData data;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = data.ok;
    final c0 = enabled ? data.colors[0] : const Color(0xFFCBD5E1);
    final c1 = enabled ? data.colors[1] : const Color(0xFFE2E8F0);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 86,
        clipBehavior: Clip.hardEdge,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [c0, c1],
          ),
          boxShadow: enabled
              ? [BoxShadow(color: c1.withValues(alpha: 0.38),
                    blurRadius: 12, offset: const Offset(0, 5))]
              : const [BoxShadow(color: Color(0x10000000),
                    blurRadius: 4, offset: Offset(0, 2))],
        ),
        child: Stack(children: [
          // Orb
          if (enabled) Positioned(
            top: -16, right: -16,
            child: _Blob(56, Colors.white.withValues(alpha: 0.10)),
          ),
          // Content
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 13, 10, 11),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Icon
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    color: Colors.white.withValues(alpha: enabled ? 0.18 : 0.28),
                  ),
                  child: Icon(data.icon,
                    color: Colors.white.withValues(alpha: enabled ? 1.0 : 0.50),
                    size: 19),
                ),
                // Label row
                Row(children: [
                  Expanded(
                    child: Text(data.label,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: enabled ? 0.95 : 0.45),
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                      )),
                  ),
                  Icon(
                    enabled ? Icons.arrow_forward_rounded : Icons.lock_outline_rounded,
                    color: Colors.white.withValues(alpha: enabled ? 0.50 : 0.35),
                    size: 12,
                  ),
                ]),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Appointment card
// ═══════════════════════════════════════════════════════════════════════════════

class _ApptCard extends StatelessWidget {
  const _ApptCard({required this.appt, required this.services});
  final Appointment appt;
  final List<SalonService> services;

  Color _accent() {
    switch (appt.status.toLowerCase()) {
      case 'confirmed': return const Color(0xFF2563EB);
      case 'completed': return const Color(0xFF059669);
      case 'cancelled': return const Color(0xFFDC2626);
      default:          return const Color(0xFFD97706);
    }
  }

  Color _bg() {
    switch (appt.status.toLowerCase()) {
      case 'confirmed': return const Color(0xFFDBEAFE);
      case 'completed': return const Color(0xFFD1FAE5);
      case 'cancelled': return const Color(0xFFFEE2E2);
      default:          return const Color(0xFFFEF3C7);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accent = _accent();
    final bg     = _bg();
    final serviceLine = appt.resolveServicesDisplay(services);
    return Container(
      margin: const EdgeInsets.only(bottom: 9),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(color: Color(0x09000000), blurRadius: 8, offset: Offset(0, 3)),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // Left accent strip
            Container(width: 3.5, color: accent),
            // Main card body
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: _card,
                  border: Border(
                    top:    BorderSide(color: _divider),
                    right:  BorderSide(color: _divider),
                    bottom: BorderSide(color: _divider),
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
                child: Row(children: [
                  // Time badge
                  Container(
                    width: 48, height: 48,
                    decoration: BoxDecoration(color: bg,
                        borderRadius: BorderRadius.circular(11)),
                    child: Center(
                      child: Text(appt.time,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: accent,
                            fontWeight: FontWeight.w800, fontSize: 11)),
                    ),
                  ),
                  const SizedBox(width: 11),
                  // Info
                  Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(appt.customerName,
                        style: const TextStyle(color: _text,
                            fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: 2),
                      Text(
                        serviceLine,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: _sub, fontSize: 12),
                      ),
                      const SizedBox(height: 1),
                      Text(appt.date,
                        style: const TextStyle(color: _muted, fontSize: 11.5)),
                    ],
                  )),
                  // Status chip
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: bg, borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: accent.withValues(alpha: 0.30)),
                    ),
                    child: Text(appt.status,
                      style: TextStyle(color: accent, fontSize: 10.5,
                          fontWeight: FontWeight.w700)),
                  ),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility widgets
// ═══════════════════════════════════════════════════════════════════════════════

class _TextChip extends StatelessWidget {
  const _TextChip({required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: _g100,
        border: Border.all(color: _g700.withValues(alpha: 0.30)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(label,
          style: const TextStyle(color: _g700, fontSize: 11.5,
              fontWeight: FontWeight.w700)),
        const SizedBox(width: 3),
        const Icon(Icons.arrow_forward_rounded, color: _g700, size: 12),
      ]),
    ),
  );
}

class _HintCard extends StatelessWidget {
  const _HintCard({required this.icon, required this.text});
  final IconData icon; final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: _card,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: _divider),
    ),
    child: Row(children: [
      Icon(icon, color: const Color(0xFFD1D5DB), size: 21),
      const SizedBox(width: 11),
      Expanded(child: Text(text,
          style: const TextStyle(color: _sub, fontSize: 13))),
    ]),
  );
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
    decoration: BoxDecoration(
      color: const Color(0xFFFEF2F2),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFFCA5A5)),
    ),
    child: Row(children: [
      const Icon(Icons.warning_amber_rounded,
          color: Color(0xFFDC2626), size: 17),
      const SizedBox(width: 9),
      Expanded(child: Text(message,
          style: const TextStyle(color: Color(0xFFB91C1C),
              fontSize: 12.5, fontWeight: FontWeight.w600))),
    ]),
  );
}
