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
    Map<String, bool>? tenantFeatures,
    this.role = 'staff',
    this.jobTitle,
    this.branchId,
    this.linkedStaffId,
    this.tenantSlug,
    this.tenantName,
    this.authToken,
  })  : permissions = Set<StaffPermission>.from(permissions),
        mobileFeatures = Map<String, bool>.from(mobileFeatures ?? const {}),
        tenantFeatures = Map<String, bool>.from(tenantFeatures ?? const {});

  final String id;
  final String username;
  final String password;
  final String displayName;
  final bool isActive;
  final Set<StaffPermission> permissions;
  final Map<String, bool> mobileFeatures;
  /// Platform-admin tenant feature flags from auth `tenant.effective_features`.
  final Map<String, bool> tenantFeatures;
  final String role;
  /// Job title from linked Staff.role_title (e.g. Stylist) — not access role.
  final String? jobTitle;
  final String? branchId;
  /// Staff table id from GET /api/auth/me → staffProfile (for commission, etc.).
  final String? linkedStaffId;
  final String? tenantSlug;
  final String? tenantName;
  final String? authToken;

  /// Same user with a refreshed access token (used after a 401 refresh).
  StaffUser copyWithAuthToken(String token) => StaffUser(
        id: id,
        username: username,
        password: password,
        displayName: displayName,
        isActive: isActive,
        permissions: permissions,
        mobileFeatures: mobileFeatures,
        tenantFeatures: tenantFeatures,
        role: role,
        jobTitle: jobTitle,
        branchId: branchId,
        linkedStaffId: linkedStaffId,
        tenantSlug: tenantSlug,
        tenantName: tenantName,
        authToken: token,
      );
}
