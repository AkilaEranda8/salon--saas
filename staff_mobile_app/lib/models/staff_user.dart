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
    Map<String, bool>? mobileFeatures,
    this.role = 'staff',
    this.branchId,
    this.linkedStaffId,
    this.tenantSlug,
    this.tenantName,
    this.authToken,
  })  : permissions = Set<StaffPermission>.from(permissions),
        mobileFeatures = Map<String, bool>.from(mobileFeatures ?? const {});

  final String id;
  final String username;
  final String password;
  final String displayName;
  final bool isActive;
  final Set<StaffPermission> permissions;
  final Map<String, bool> mobileFeatures;
  final String role;
  final String? branchId;
  /// Staff table id from GET /api/auth/me → staffProfile (for commission, etc.).
  final String? linkedStaffId;
  final String? tenantSlug;
  final String? tenantName;
  final String? authToken;
}
