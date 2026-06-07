import 'package:flutter/material.dart';

import '../models/mobile_feature.dart';
import '../state/app_state.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const _forest  = Color(0xFF1B3A2D);
const _emerald = Color(0xFF2D6A4F);
const _canvas  = Color(0xFFF2F5F2);
const _surface = Color(0xFFFFFFFF);
const _border  = Color(0xFFE5E7EB);
const _ink     = Color(0xFF111827);
const _muted   = Color(0xFF6B7280);

// ── Role metadata ─────────────────────────────────────────────────────────────
const _roles = ['superadmin', 'admin', 'manager', 'staff'];

Color _roleColor(String r) {
  switch (r) {
    case 'superadmin': return const Color(0xFF7C3AED);
    case 'admin':      return const Color(0xFF2563EB);
    case 'manager':    return const Color(0xFF059669);
    default:           return const Color(0xFF6B7280);
  }
}

Color _roleBg(String r) {
  switch (r) {
    case 'superadmin': return const Color(0xFFF5F3FF);
    case 'admin':      return const Color(0xFFEFF6FF);
    case 'manager':    return const Color(0xFFECFDF5);
    default:           return const Color(0xFFF9FAFB);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class PermissionsPage extends StatefulWidget {
  const PermissionsPage({super.key});
  @override
  State<PermissionsPage> createState() => _PermissionsPageState();
}

class _PermissionsPageState extends State<PermissionsPage> {
  List<Map<String, dynamic>> _users   = [];
  bool   _loading = true;
  String _search  = '';
  String _error   = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = ''; });
    try {
      final app = AppStateScope.of(context);
      final users = await app.loadUsers();
      if (mounted) setState(() => _users = users);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  List<Map<String, dynamic>> get _filtered {
    if (_search.trim().isEmpty) return _users;
    final q = _search.toLowerCase();
    return _users.where((u) =>
      '${u['name']}'.toLowerCase().contains(q) ||
      '${u['username']}'.toLowerCase().contains(q) ||
      '${u['role']}'.toLowerCase().contains(q),
    ).toList();
  }

  Future<void> _changeRole(Map<String, dynamic> user, String newRole) async {
    final app = AppStateScope.of(context);
    final ok  = await app.updateUserRole(userId: '${user['id']}', role: newRole);
    if (ok) {
      setState(() => user['role'] = newRole);
      _showSnack('Role updated to $newRole', success: true);
    } else {
      _showSnack(app.lastError ?? 'Update failed');
    }
  }

  Future<void> _toggleActive(Map<String, dynamic> user) async {
    final app       = AppStateScope.of(context);
    final newActive = !(user['is_active'] as bool? ?? true);
    final ok        = await app.toggleUserActive(userId: '${user['id']}', isActive: newActive);
    if (ok) {
      setState(() => user['is_active'] = newActive);
      _showSnack(newActive ? 'User activated' : 'User deactivated', success: true);
    } else {
      _showSnack(app.lastError ?? 'Update failed');
    }
  }

  void _showSnack(String msg, {bool success = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: success ? _emerald : const Color(0xFFDC2626),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  Future<void> _showRoleDefaultsEditor() async {
    final app = AppStateScope.of(context);
    if (app.currentUser?.role != 'superadmin') {
      _showSnack('Only superadmin can edit default access.');
      return;
    }
    try {
      final data = await app.loadMobileRoleDefaults();
      if (!mounted) return;
      final effective = data['effective'] as Map? ?? {};
      final initial = <String, Map<String, bool>>{};
      for (final role in ['admin', 'manager', 'staff']) {
        initial[role] = MobileFeatures.parseMap(effective[role]);
      }
      final saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _RoleDefaultsSheet(initialDefaults: initial),
      );
      if (saved == true) await _load();
    } catch (e) {
      _showSnack(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _showFeatureEditor(Map<String, dynamic> user) async {
    final app = AppStateScope.of(context);
    if (app.currentUser?.role != 'superadmin') {
      _showSnack('Only superadmin can manage app features.');
      return;
    }
    if ('${user['role']}' == 'superadmin') {
      _showSnack('Superadmin always has all app features.');
      return;
    }
    try {
      final data = await app.loadUserMobileFeatures('${user['id']}');
      if (!mounted) return;
      final effective = MobileFeatures.parseMap(data['effective']);
      final defaults = MobileFeatures.parseMap(data['defaults']);
      final saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _FeatureEditorSheet(
          userId: '${user['id']}',
          userName: '${user['name'] ?? user['username']}',
          role: '${user['role'] ?? 'staff'}',
          initialFeatures: effective,
          roleDefaults: defaults,
        ),
      );
      if (saved == true) {
        await _load();
      }
    } catch (e) {
      _showSnack(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  void _showRolePicker(Map<String, dynamic> user) {
    final app      = AppStateScope.of(context);
    final isSA     = app.currentUser?.role == 'superadmin';
    if (!isSA) {
      _showSnack('Only superadmin can change roles.');
      return;
    }
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _RolePickerSheet(
        currentRole: '${user['role']}',
        userName: '${user['name'] ?? user['username']}',
        onSelect: (r) => _changeRole(user, r),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app    = AppStateScope.of(context);
    final isSA   = app.currentUser?.role == 'superadmin';
    final isAdmin = ['superadmin', 'admin'].contains(app.currentUser?.role);

    if (!isAdmin) {
      return Scaffold(
        backgroundColor: _canvas,
        appBar: AppBar(
          backgroundColor: _forest,
          foregroundColor: Colors.white,
          title: const Text('User Permissions',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        ),
        body: const Center(
          child: Text('Only admins can view this page.',
            style: TextStyle(color: _muted, fontSize: 14)),
        ),
      );
    }

    final filtered = _filtered;

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(isSA ? 'Users & App Features' : 'User Permissions',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: -0.3)),
        actions: [
          if (isSA)
            IconButton(
              icon: const Icon(Icons.tune_rounded, size: 22),
              tooltip: 'Default access by role',
              onPressed: _showRoleDefaultsEditor,
            ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 22),
            onPressed: _load,
          ),
        ],
      ),
      body: Column(children: [
        // ── Header ──
        Container(
          color: _forest,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Row(children: [
            _headerChip('Total', '${_users.length}', Icons.people_rounded, const Color(0xFF86EFAC)),
            const SizedBox(width: 10),
            _headerChip('Active', '${_users.where((u) => u['is_active'] == true).length}',
                Icons.check_circle_rounded, const Color(0xFFFDE68A)),
          ]),
        ),

        // ── Search ──
        Container(
          color: _surface,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Container(
            height: 40,
            decoration: BoxDecoration(
              color: _canvas,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: _border),
            ),
            child: TextField(
              onChanged: (v) => setState(() => _search = v),
              style: const TextStyle(fontSize: 13, color: _ink),
              decoration: const InputDecoration(
                hintText: 'Search by name, username or role…',
                hintStyle: TextStyle(color: _muted, fontSize: 13),
                prefixIcon: Icon(Icons.search_rounded, size: 18, color: _muted),
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(vertical: 11),
              ),
            ),
          ),
        ),

        const Divider(height: 1, color: _border),

        // ── List ──
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: _emerald))
              : _error.isNotEmpty
                  ? Center(child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.error_outline_rounded, size: 40, color: Color(0xFFDC2626)),
                        const SizedBox(height: 12),
                        Text(_error, textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13, color: _muted)),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: _load,
                          icon: const Icon(Icons.refresh_rounded, size: 16),
                          label: const Text('Retry'),
                          style: ElevatedButton.styleFrom(backgroundColor: _emerald, foregroundColor: Colors.white),
                        ),
                      ]),
                    ))
                  : filtered.isEmpty
                      ? const Center(child: Text('No users found',
                          style: TextStyle(color: _muted, fontSize: 14)))
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                          itemCount: filtered.length,
                          itemBuilder: (_, i) => _UserCard(
                            user: filtered[i],
                            isSuperAdmin: isSA,
                            onRoleTap: () => _showRolePicker(filtered[i]),
                            onToggleActive: () => _toggleActive(filtered[i]),
                            onFeaturesTap: () => _showFeatureEditor(filtered[i]),
                          ),
                        ),
        ),
      ]),
    );
  }

  Widget _headerChip(String label, String value, IconData icon, Color color) =>
    Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        ),
        child: Row(children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(fontSize: 10, color: Colors.white70, fontWeight: FontWeight.w600)),
            Text(value, style: const TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.w800)),
          ]),
        ]),
      ),
    );
}

// ── User card ─────────────────────────────────────────────────────────────────
class _UserCard extends StatelessWidget {
  const _UserCard({
    required this.user,
    required this.isSuperAdmin,
    required this.onRoleTap,
    required this.onToggleActive,
    required this.onFeaturesTap,
  });
  final Map<String, dynamic> user;
  final bool isSuperAdmin;
  final VoidCallback onRoleTap;
  final VoidCallback onToggleActive;
  final VoidCallback onFeaturesTap;

  @override
  Widget build(BuildContext context) {
    final name     = '${user['name'] ?? user['username'] ?? ''}';
    final username = '${user['username'] ?? ''}';
    final role     = '${user['role'] ?? 'staff'}';
    final branch   = (user['branch'] as Map?)?['name'] ?? '';
    final active   = user['is_active'] as bool? ?? true;
    final initial  = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final features = MobileFeatures.parseMap(user['mobile_features']);
    final featureCount = MobileFeatures.enabledCount(features);
    final canEditFeatures = isSuperAdmin && role != 'superadmin';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: active ? _border : const Color(0xFFFEE2E2)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          // Avatar
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: active ? _roleBg(role) : const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(initial,
                style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800,
                  color: active ? _roleColor(role) : _muted,
                )),
            ),
          ),
          const SizedBox(width: 12),
          // Info
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(
                  child: Text(name,
                    style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w700,
                      color: active ? _ink : _muted, letterSpacing: -0.2),
                    overflow: TextOverflow.ellipsis),
                ),
                if (!active)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEE2E2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('Inactive',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
                  ),
              ]),
              const SizedBox(height: 3),
              Text('@$username', style: const TextStyle(fontSize: 12, color: _muted)),
              if (branch.isNotEmpty)
                Text(branch, style: const TextStyle(fontSize: 11, color: _muted)),
              if (role != 'superadmin')
                Text(
                  '$featureCount / ${MobileFeatures.allKeys.length} app features enabled',
                  style: const TextStyle(fontSize: 11, color: _emerald, fontWeight: FontWeight.w600),
                ),
            ],
          )),
          const SizedBox(width: 10),
          // Role badge + actions
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              GestureDetector(
                onTap: isSuperAdmin ? onRoleTap : null,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: _roleBg(role),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: _roleColor(role).withValues(alpha: 0.25)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(role,
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _roleColor(role))),
                    if (isSuperAdmin) ...[
                      const SizedBox(width: 4),
                      Icon(Icons.edit_rounded, size: 11, color: _roleColor(role)),
                    ],
                  ]),
                ),
              ),
              if (canEditFeatures) ...[
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: onFeaturesTap,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text(
                      'App Features',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF2563EB)),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              GestureDetector(
                onTap: onToggleActive,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: active ? const Color(0xFFECFDF5) : const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    active ? 'Deactivate' : 'Activate',
                    style: TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w700,
                      color: active ? const Color(0xFF059669) : _muted),
                  ),
                ),
              ),
            ],
          ),
        ]),
      ),
    );
  }
}

// ── Role picker sheet ─────────────────────────────────────────────────────────
class _RolePickerSheet extends StatelessWidget {
  const _RolePickerSheet({
    required this.currentRole,
    required this.userName,
    required this.onSelect,
  });
  final String currentRole, userName;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 36),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Change Role — $userName',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _ink, letterSpacing: -0.2)),
          const SizedBox(height: 6),
          const Text('Select a new role for this user.',
            style: TextStyle(fontSize: 13, color: _muted)),
          const SizedBox(height: 18),
          ..._roles.map((r) {
            final selected = r == currentRole;
            return GestureDetector(
              onTap: () {
                Navigator.of(context).pop();
                if (!selected) onSelect(r);
              },
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                decoration: BoxDecoration(
                  color: selected ? _roleBg(r) : _canvas,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: selected ? _roleColor(r).withValues(alpha: 0.4) : _border,
                    width: selected ? 1.5 : 1,
                  ),
                ),
                child: Row(children: [
                  Container(
                    width: 10, height: 10,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _roleColor(r),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(r,
                      style: TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w700,
                        color: selected ? _roleColor(r) : _ink,
                      )),
                  ),
                  if (selected)
                    Icon(Icons.check_circle_rounded, size: 18, color: _roleColor(r)),
                ]),
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ── Role default access editor (superadmin) ───────────────────────────────────
class _RoleDefaultsSheet extends StatefulWidget {
  const _RoleDefaultsSheet({required this.initialDefaults});
  final Map<String, Map<String, bool>> initialDefaults;

  @override
  State<_RoleDefaultsSheet> createState() => _RoleDefaultsSheetState();
}

class _RoleDefaultsSheetState extends State<_RoleDefaultsSheet> {
  static const _roles = ['admin', 'manager', 'staff'];
  late Map<String, Map<String, bool>> _defaults;
  String _selectedRole = 'staff';
  bool _saving = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _defaults = {
      for (final r in _roles)
        r: Map<String, bool>.from(widget.initialDefaults[r] ?? {}),
    };
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = ''; });
    final app = AppStateScope.of(context);
    final ok = await app.saveMobileRoleDefaults(_defaults);
    setState(() => _saving = false);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _error = app.lastError ?? 'Save failed');
    }
  }

  @override
  Widget build(BuildContext context) {
    final roleFeatures = _defaults[_selectedRole] ?? {};
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Container(
        decoration: const BoxDecoration(
          color: _surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(99))),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Default Access by Role',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _ink)),
                  SizedBox(height: 4),
                  Text('Set which app features are ON by default for each role. Individual users can still be customized.',
                    style: TextStyle(fontSize: 12, color: _muted)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: _roles.map((r) {
                  final selected = r == _selectedRole;
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: GestureDetector(
                        onTap: () => setState(() => _selectedRole = r),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: selected ? _roleBg(r) : _canvas,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: selected ? _roleColor(r) : _border),
                          ),
                          child: Text(
                            r[0].toUpperCase() + r.substring(1),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: selected ? _roleColor(r) : _muted,
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(_error, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 12)),
              ),
            Expanded(
              child: ListView.builder(
                controller: scrollController,
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                itemCount: MobileFeatures.allKeys.length,
                itemBuilder: (_, i) {
                  final key = MobileFeatures.allKeys[i];
                  final enabled = roleFeatures[key] == true;
                  return SwitchListTile(
                    title: Text(MobileFeatures.labelFor(key),
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _ink)),
                    subtitle: Text('Default for $_selectedRole',
                      style: const TextStyle(fontSize: 11, color: _muted)),
                    value: enabled,
                    activeThumbColor: _emerald,
                    onChanged: (v) => setState(() {
                      _defaults[_selectedRole] = {
                        ...roleFeatures,
                        key: v,
                      };
                    }),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              child: Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => Navigator.of(context).pop(false),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(backgroundColor: _emerald, foregroundColor: Colors.white),
                    child: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Save Defaults'),
                  ),
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Mobile app feature editor (superadmin) ────────────────────────────────────
class _FeatureEditorSheet extends StatefulWidget {
  const _FeatureEditorSheet({
    required this.userId,
    required this.userName,
    required this.role,
    required this.initialFeatures,
    required this.roleDefaults,
  });

  final String userId;
  final String userName;
  final String role;
  final Map<String, bool> initialFeatures;
  final Map<String, bool> roleDefaults;

  @override
  State<_FeatureEditorSheet> createState() => _FeatureEditorSheetState();
}

class _FeatureEditorSheetState extends State<_FeatureEditorSheet> {
  late Map<String, bool> _features;
  bool _saving = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _features = Map<String, bool>.from(widget.initialFeatures);
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = ''; });
    final app = AppStateScope.of(context);
    final ok = await app.saveUserMobileFeatures(
      userId: widget.userId,
      features: _features,
    );
    setState(() => _saving = false);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _error = app.lastError ?? 'Save failed');
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.82,
      minChildSize: 0.45,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Container(
        decoration: const BoxDecoration(
          color: _surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(99))),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('App Features — ${widget.userName}',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _ink)),
                  const SizedBox(height: 4),
                  Text('Role: ${widget.role}. Disabled items are hidden from this user\'s dashboard.',
                    style: const TextStyle(fontSize: 12, color: _muted)),
                ],
              ),
            ),
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(_error, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 12)),
              ),
            Expanded(
              child: ListView.builder(
                controller: scrollController,
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                itemCount: MobileFeatures.allKeys.length,
                itemBuilder: (_, i) {
                  final key = MobileFeatures.allKeys[i];
                  final enabled = _features[key] == true;
                  final isDefault = widget.roleDefaults[key] == true;
                  return SwitchListTile(
                    title: Text(MobileFeatures.labelFor(key),
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _ink)),
                    subtitle: Text(
                      isDefault ? 'Default for ${widget.role}' : 'Off by default for ${widget.role}',
                      style: const TextStyle(fontSize: 11, color: _muted),
                    ),
                    value: enabled,
                    activeThumbColor: _emerald,
                    onChanged: (v) => setState(() => _features[key] = v),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              child: Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => Navigator.of(context).pop(false),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(backgroundColor: _emerald, foregroundColor: Colors.white),
                    child: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Save'),
                  ),
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}
