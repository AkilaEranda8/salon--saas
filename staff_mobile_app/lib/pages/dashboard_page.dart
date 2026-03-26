import 'package:flutter/material.dart';

import '../models/staff_user.dart';
import '../state/app_state.dart';
import 'ai_chat_page.dart';
import 'appointments_page.dart';
import 'calendar_page.dart';
import 'commission_page.dart';
import 'customers_page.dart';
import 'login_page.dart';
import 'payments_page.dart';
import 'permissions_page.dart';
import 'reminders_page.dart';
import 'services_page.dart';
import 'staff_page.dart';
import 'walkin_page.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Future<void>? _initialLoad;
  String? _dashboardError;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _initialLoad ??= _loadInitial();
  }

  Future<void> _loadInitial() async {
    final appState = AppStateScope.of(context);
    try {
      // Load only if user has permission.
      if (appState.hasPermission(StaffPermission.canViewAppointments)) {
        await appState.loadAppointments();
      }
      if (appState.hasPermission(StaffPermission.canViewCustomers)) {
        await appState.loadCustomers();
      }
      await appState.loadServices();
    } catch (_) {
      // Avoid crashing dashboard due to network issues; show a hint in UI.
      setState(() {
        _dashboardError = 'Failed to load dashboard data. Check API URL/token.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final user = appState.currentUser;

    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FF),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFFF4F7FF),
        foregroundColor: const Color(0xFF0F172A),
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () {
              appState.logout();
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const LoginPage()),
                (route) => false,
              );
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              color: Colors.white,
              boxShadow: const [
                BoxShadow(
                  color: Color(0x14000000),
                  blurRadius: 16,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF4F46E5), Color(0xFF06B6D4)],
                    ),
                  ),
                  child: const Icon(Icons.space_dashboard_outlined, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hello, ${user?.displayName ?? 'Staff'}',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Professional salon operations hub',
                        style: TextStyle(
                          color: Colors.blueGrey.shade600,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _infoCard(
                  context: context,
                  title: 'Appointments',
                  value: '${appState.appointments.length}',
                  icon: Icons.event,
                  color: const Color(0xFFEEF2FF),
                  iconColor: const Color(0xFF4F46E5),
                  onTap: appState.hasPermission(StaffPermission.canViewAppointments)
                      ? () => Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => const AppointmentsPage()),
                          )
                      : null,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _infoCard(
                  context: context,
                  title: 'Customers',
                  value: '${appState.customers.length}',
                  icon: Icons.groups,
                  color: const Color(0xFFECFDF5),
                  iconColor: const Color(0xFF059669),
                  onTap: appState.hasPermission(StaffPermission.canViewCustomers)
                      ? () => Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => const CustomersPage()),
                          )
                      : null,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _infoCard(
                  context: context,
                  title: 'Services',
                  value: '${appState.services.length}',
                  icon: Icons.content_cut,
                  color: const Color(0xFFFFFBEB),
                  iconColor: const Color(0xFFD97706),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _infoCard(
                  context: context,
                  title: 'Role',
                  value: (user?.role ?? 'staff').toUpperCase(),
                  icon: Icons.verified_user_outlined,
                  color: const Color(0xFFF5F3FF),
                  iconColor: const Color(0xFF7C3AED),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Quick Actions',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 18,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 10),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 3,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1,
            children: [
              _tile(context, 'Appts', Icons.calendar_month, const AppointmentsPage(),
                  enabled: appState.hasPermission(StaffPermission.canViewAppointments)),
              _tile(context, 'Customers', Icons.people_alt, const CustomersPage(),
                  enabled: appState.hasPermission(StaffPermission.canViewCustomers)),
              _tile(context, 'Services', Icons.design_services, const ServicesPage()),
              _tile(context, 'Payments', Icons.payments_outlined, const PaymentsPage()),
              _tile(context, 'Calendar', Icons.calendar_today, const CalendarPage()),
              _tile(context, 'Walk-in', Icons.directions_walk, const WalkInPage()),
              _tile(context, 'Staff', Icons.badge_outlined, const StaffPage()),
              _tile(context, 'Commission', Icons.monetization_on, const CommissionPage()),
              _tile(context, 'AI Chat', Icons.smart_toy_outlined, const AiChatPage()),
              _tile(context, 'Reminders', Icons.notifications_none, const RemindersPage()),
              _tile(context, 'Permissions', Icons.admin_panel_settings, const PermissionsPage(),
                  enabled: appState.hasPermission(StaffPermission.canManagePermissions)),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Recent Appointments',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    color: Color(0xFF0F172A),
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: appState.hasPermission(StaffPermission.canViewAppointments)
                    ? () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const AppointmentsPage()),
                        )
                    : null,
                icon: const Icon(Icons.open_in_new, size: 16),
                label: const Text('Open'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (_initialLoad != null)
            FutureBuilder<void>(
              future: _initialLoad,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 18),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                return _recentAppointmentsList(appState: appState);
              },
            )
          else
            _recentAppointmentsList(appState: appState),
          if (_dashboardError != null) ...[
            const SizedBox(height: 12),
            Text(
              _dashboardError!,
              style: const TextStyle(
                color: Color(0xFFDC2626),
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _recentAppointmentsList({required AppState appState}) {
    final canView = appState.hasPermission(StaffPermission.canViewAppointments);
    if (!canView) {
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: const Row(
          children: [
            Icon(Icons.lock_outline, color: Color(0xFF94A3B8)),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'No permission to view appointments.',
                style: TextStyle(color: Color(0xFF475569), fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );
    }

    final list = appState.appointments.toList()
      ..sort((a, b) {
        final ad = a.date.compareTo(b.date);
        if (ad != 0) return ad;
        return a.time.compareTo(b.time);
      });
    final top = list.reversed.take(3).toList();

    if (top.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: const Row(
          children: [
            Icon(Icons.event_busy, color: Color(0xFF94A3B8)),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'No appointments yet. Tap Appointments to add one.',
                style: TextStyle(color: Color(0xFF475569), fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      children: top.map((appt) {
        final style = _statusStyle(appt.status);
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: style.bgColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Text(
                    appt.time,
                    style: TextStyle(
                      color: style.color,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
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
                      appt.customerName,
                      style: const TextStyle(
                        color: Color(0xFF0F172A),
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      appt.serviceName,
                      style: const TextStyle(
                        color: Color(0xFF64748B),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      appt.date,
                      style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: style.bgColor,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  appt.status,
                  style: TextStyle(
                    color: style.color,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
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

  Widget _infoCard({
    required BuildContext context,
    required String title,
    required String value,
    required IconData icon,
    required Color color,
    required Color iconColor,
    VoidCallback? onTap,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(
                color: Color(0x12000000),
                blurRadius: 12,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 16,
                backgroundColor: color,
                child: Icon(icon, size: 18, color: iconColor),
              ),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF64748B),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 20,
                  color: Color(0xFF0F172A),
                ),
              ),
              if (onTap != null)
                const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text(
                    'Tap to open',
                    style: TextStyle(
                      fontSize: 11,
                      color: Color(0xFF6366F1),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showNoPermission(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('No permission for this section')),
    );
  }

  Widget _tile(
    BuildContext context,
    String label,
    IconData icon,
    Widget page, {
    bool enabled = true,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: enabled
            ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page))
            : () => _showNoPermission(context),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: enabled ? const Color(0xFF4F46E5) : const Color(0xFF94A3B8)),
              const SizedBox(height: 6),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: enabled ? const Color(0xFF0F172A) : const Color(0xFF94A3B8),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusStyle {
  const _StatusStyle(this.color, this.bgColor);
  final Color color;
  final Color bgColor;
}
