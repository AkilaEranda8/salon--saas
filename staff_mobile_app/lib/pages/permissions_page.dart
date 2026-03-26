import 'package:flutter/material.dart';

import '../models/staff_user.dart';
import '../state/app_state.dart';

class PermissionsPage extends StatelessWidget {
  const PermissionsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final allowed = appState.hasPermission(StaffPermission.canManagePermissions);
    if (!allowed) {
      return Scaffold(
        appBar: AppBar(title: const Text('Permissions Page')),
        body: const Center(child: Text('No access to manage permissions.')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Permissions Page')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Enable or disable app permissions for staff users.'),
          const SizedBox(height: 12),
          ...appState.staffUsers.map((staff) => _StaffPermissionCard(staff: staff)),
        ],
      ),
    );
  }
}

class _StaffPermissionCard extends StatelessWidget {
  const _StaffPermissionCard({required this.staff});

  final StaffUser staff;

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${staff.displayName} (${staff.username})',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            _permissionSwitch(
              context: context,
              appState: appState,
              permission: StaffPermission.canAdd,
              label: 'Can Add',
            ),
            _permissionSwitch(
              context: context,
              appState: appState,
              permission: StaffPermission.canEdit,
              label: 'Can Edit',
            ),
            _permissionSwitch(
              context: context,
              appState: appState,
              permission: StaffPermission.canViewCustomers,
              label: 'Can View Customers',
            ),
            _permissionSwitch(
              context: context,
              appState: appState,
              permission: StaffPermission.canViewAppointments,
              label: 'Can View Appointments',
            ),
            _permissionSwitch(
              context: context,
              appState: appState,
              permission: StaffPermission.canAddAppointments,
              label: 'Can Add Appointments',
            ),
            _permissionSwitch(
              context: context,
              appState: appState,
              permission: StaffPermission.canManagePermissions,
              label: 'Can Manage Permissions',
            ),
          ],
        ),
      ),
    );
  }

  Widget _permissionSwitch({
    required BuildContext context,
    required AppState appState,
    required StaffPermission permission,
    required String label,
  }) {
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      value: staff.permissions.contains(permission),
      title: Text(label),
      onChanged: (value) {
        final ok = appState.updateStaffPermission(
          staffId: staff.id,
          permission: permission,
          enable: value,
        );
        if (!ok) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to update permission.')),
          );
        }
      },
    );
  }
}
