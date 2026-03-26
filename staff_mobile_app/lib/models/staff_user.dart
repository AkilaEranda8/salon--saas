enum StaffPermission {
  canAdd,
  canEdit,
  canViewCustomers,
  canViewAppointments,
  canAddAppointments,
  canManagePermissions,
}

class StaffUser {
  StaffUser({
    required this.id,
    required this.username,
    required this.password,
    required this.displayName,
    required this.isActive,
    required Set<StaffPermission> permissions,
    this.role = 'staff',
    this.branchId,
    this.authToken,
  }) : permissions = Set<StaffPermission>.from(permissions);

  final String id;
  final String username;
  final String password;
  final String displayName;
  final bool isActive;
  final Set<StaffPermission> permissions;
  final String role;
  final String? branchId;
  final String? authToken;
}
