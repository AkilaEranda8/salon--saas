import 'package:flutter/material.dart';

import '../models/staff_user.dart';
import '../state/app_state.dart';
import 'add_item_page.dart';
import 'ai_chat_page.dart';
import 'advances_page.dart';
import 'expenses_page.dart';
import 'appointments_page.dart';
import 'calendar_page.dart';
import 'commission_page.dart';
import 'customers_page.dart';
import 'dashboard_page.dart';
import 'edit_item_page.dart';
import 'login_page.dart';
import 'payments_page.dart';
import 'permissions_page.dart';
import 'reminders_page.dart';
import 'services_page.dart';
import 'staff_page.dart';
import 'walkin_page.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final currentUser = appState.currentUser;
    if (currentUser == null) {
      return const LoginPage();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Staff Mobile Home'),
        actions: [
          IconButton(
            onPressed: () {
              appState.logout();
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const LoginPage()),
                (route) => false,
              );
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              title: Text('Welcome ${currentUser.displayName}'),
              subtitle: Text('Username: ${currentUser.username}'),
            ),
          ),
          const SizedBox(height: 12),
          _actionTile(
            context: context,
            title: 'Dashboard',
            subtitle: 'Overview and quick stats',
            icon: Icons.dashboard_outlined,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DashboardPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Calendar',
            subtitle: 'View schedule by date',
            icon: Icons.calendar_today_outlined,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const CalendarPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Walk-in',
            subtitle: 'Manage walk-in queue',
            icon: Icons.directions_walk_outlined,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const WalkInPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Appointments',
            subtitle: 'Load and add appointments',
            icon: Icons.calendar_month_outlined,
            enabled: appState.hasPermission(StaffPermission.canViewAppointments),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AppointmentsPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Payments',
            subtitle: 'Payment records and status',
            icon: Icons.payments_outlined,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PaymentsPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Customers',
            subtitle: 'Load and view customers',
            icon: Icons.people_alt_outlined,
            enabled: appState.hasPermission(StaffPermission.canViewCustomers),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const CustomersPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Services',
            subtitle: 'Salon service catalogue',
            icon: Icons.content_cut_outlined,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ServicesPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Staff',
            subtitle: 'Staff list and status',
            icon: Icons.people_outline,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const StaffPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Commission',
            subtitle: 'Commission overview',
            icon: Icons.monetization_on_outlined,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const CommissionPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Expenses',
            subtitle: 'View and track business expenses',
            icon: Icons.receipt_long_outlined,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ExpensesPage()),
              );
            },
          ),
          _actionTile(
            context: context,
            title: 'Staff Advances',
            subtitle: 'Record and track salary advances',
            icon: Icons.account_balance_wallet_outlined,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AdvancesPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'AI Chat',
            subtitle: 'Assistant for staff',
            icon: Icons.smart_toy_outlined,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AiChatPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Reminders',
            subtitle: 'Task and reminder notes',
            icon: Icons.notifications_none,
            enabled: true,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const RemindersPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Permissions Page',
            subtitle: 'Grant/revoke app permissions to staff',
            icon: Icons.admin_panel_settings_outlined,
            enabled: appState.hasPermission(StaffPermission.canManagePermissions),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PermissionsPage()),
              );
            },
          ),
          const SizedBox(height: 16),
          Text(
            'Extra Tools',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Add Page',
            subtitle: 'Create a new item',
            icon: Icons.add_box_outlined,
            enabled: appState.hasPermission(StaffPermission.canAdd),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AddItemPage()),
              );
            },
          ),
          const SizedBox(height: 8),
          _actionTile(
            context: context,
            title: 'Edit Page',
            subtitle: 'Edit existing items',
            icon: Icons.edit_outlined,
            enabled: appState.hasPermission(StaffPermission.canEdit),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const EditItemPage()),
              );
            },
          ),
          const SizedBox(height: 16),
          Text(
            'Current Items',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          if (appState.items.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text('No items yet.'),
              ),
            )
          else
            ...appState.items.map(
              (item) => Card(
                child: ListTile(
                  title: Text(item.title),
                  subtitle: Text('${item.description}\nBy: ${item.createdBy}'),
                  isThreeLine: true,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _actionTile({
    required BuildContext context,
    required String title,
    required String subtitle,
    required IconData icon,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: enabled
            ? const Icon(Icons.arrow_forward_ios, size: 16)
            : const Text('No access'),
        enabled: enabled,
        onTap: enabled
            ? onTap
            : () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('You do not have permission for this page.'),
                  ),
                );
              },
      ),
    );
  }
}
