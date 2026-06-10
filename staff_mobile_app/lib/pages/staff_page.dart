import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/staff_member.dart';
import '../state/app_state.dart';
import 'add_staff_modal.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest  = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas  = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border  = Color(0xFFE5E7EB);
const Color _ink     = Color(0xFF111827);
const Color _muted   = Color(0xFF6B7280);

// ── Avatar gradient pool (cycles per index) ───────────────────────────────────
const _gradients = [
  [Color(0xFF1B3A2D), Color(0xFF2D6A4F)],
  [Color(0xFF1E3A8A), Color(0xFF2563EB)],
  [Color(0xFF7C3AED), Color(0xFFA78BFA)],
  [Color(0xFF9D174D), Color(0xFFEC4899)],
  [Color(0xFF92400E), Color(0xFFC9956C)],
  [Color(0xFF065F46), Color(0xFF059669)],
];

// ─────────────────────────────────────────────────────────────────────────────
class StaffPage extends StatefulWidget {
  const StaffPage({super.key});
  @override
  State<StaffPage> createState() => _StaffPageState();
}

class _StaffPageState extends State<StaffPage> {
  bool _initialized = false;
  bool _loading     = true;
  String? _error;
  final _searchCtrl = TextEditingController();
  bool _searching   = false;
  String _query     = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      await AppStateScope.of(context).loadStaffList();
      if (!mounted) return;
      setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _refresh() {
    _searchCtrl.clear();
    _query = '';
    _searching = false;
    _load();
  }

  void _toast(String msg) => ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(msg),
      behavior: SnackBarBehavior.floating,
      backgroundColor: _forest,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
  );

  Future<void> _openStaffForm({StaffMember? edit}) async {
    final app = AppStateScope.of(context);
    if (!app.canManageSalonStaff) return;
    final branchId = (app.currentUser?.branchId ?? '').trim();
    if (branchId.isEmpty && edit == null) {
      _toast('Branch is required to add staff.');
      return;
    }
    try {
      if (app.services.isEmpty) await app.loadServices();
    } catch (_) {}
    if (!mounted) return;
    final payload = await AddStaffModal.show(
      context,
      branchId: edit?.branchId.isNotEmpty == true ? edit!.branchId : branchId,
      services: app.services,
      showServiceWiseCommission: app.serviceWiseCommissionForUser,
      initial: edit,
    );
    if (payload == null || !mounted) return;
    final ok = await app.saveSalonStaff(
      staffId: payload.staffId,
      name: payload.name,
      phone: payload.phone,
      roleTitle: payload.roleTitle,
      salaryType: payload.salaryType,
      branchId: payload.branchId,
      email: payload.email,
      baseSalary: payload.baseSalary,
      commissionType: payload.commissionType,
      commissionValue: payload.commissionValue,
      serviceCommissions: payload.serviceCommissions,
      isActive: payload.isActive,
    );
    if (!mounted) return;
    if (!ok) {
      _toast(app.lastError ?? 'Failed to save staff');
      return;
    }
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final all      = appState.salonStaff;
    final list     = _query.isEmpty
        ? all
        : all.where((s) =>
            s.name.toLowerCase().contains(_query) ||
            (s.roleTitle ?? '').toLowerCase().contains(_query) ||
            (s.phone ?? '').toLowerCase().contains(_query)).toList();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: _canvas,
        body: Column(children: [
          _buildHeader(all: all),
          Expanded(child: _buildBody(list, canManage: appState.canManageSalonStaff)),
        ]),
        floatingActionButton: appState.canManageSalonStaff
            ? Padding(
                padding: const EdgeInsets.only(bottom: 16, right: 4),
                child: GestureDetector(
                  onTap: () => _openStaffForm(),
                  child: Container(
                    height: 52,
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [_forest, _emerald],
                      ),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: _forest.withValues(alpha: 0.35),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.person_add_rounded,
                            color: Colors.white, size: 20),
                        SizedBox(width: 7),
                        Text(
                          'Add Staff',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              )
            : null,
        floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      ),
    );
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  Widget _buildHeader({required List<StaffMember> all}) {
    final active = all.where((s) => s.isActive).length;
    return Container(
      color: _canvas,
      child: SafeArea(
        bottom: false,
        child: Column(children: [

          // Top bar
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
            child: Row(children: [
              GestureDetector(
                onTap: () => Navigator.of(context).maybePop(),
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle, color: _surface,
                    boxShadow: [BoxShadow(
                      color: Colors.black.withValues(alpha: 0.07),
                      blurRadius: 8, offset: const Offset(0, 2))],
                  ),
                  child: const Icon(Icons.arrow_back_ios_new_rounded,
                      color: _forest, size: 15),
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Row(children: [
                  Icon(Icons.badge_rounded, color: _forest, size: 17),
                  SizedBox(width: 6),
                  Text('Staff',
                    style: TextStyle(
                      color: _forest, fontSize: 16,
                      fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                ]),
              ),
              // Refresh
              GestureDetector(
                onTap: _refresh,
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: _surface, shape: BoxShape.circle,
                    boxShadow: [BoxShadow(
                      color: Colors.black.withValues(alpha: 0.07),
                      blurRadius: 8, offset: const Offset(0, 2))],
                  ),
                  child: const Icon(Icons.refresh_rounded,
                      color: _forest, size: 17),
                ),
              ),
              const SizedBox(width: 6),
              // Search
              GestureDetector(
                onTap: () => setState(() {
                  _searching = !_searching;
                  if (!_searching) { _searchCtrl.clear(); _query = ''; }
                }),
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: _surface, shape: BoxShape.circle,
                    boxShadow: [BoxShadow(
                      color: Colors.black.withValues(alpha: 0.07),
                      blurRadius: 8, offset: const Offset(0, 2))],
                  ),
                  child: Icon(
                    _searching
                        ? Icons.search_off_rounded
                        : Icons.search_rounded,
                    color: _forest, size: 17),
                ),
              ),
            ]),
          ),

          // Search bar
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeInOut,
            child: _searching
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: Container(
                      height: 42,
                      decoration: BoxDecoration(
                        color: _surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _border),
                        boxShadow: [BoxShadow(
                          color: Colors.black.withValues(alpha: 0.04),
                          blurRadius: 6, offset: const Offset(0, 2))],
                      ),
                      child: Row(children: [
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Icon(Icons.search_rounded,
                              color: _muted, size: 18),
                        ),
                        Expanded(
                          child: TextField(
                            controller: _searchCtrl,
                            autofocus: true,
                            onChanged: (q) =>
                                setState(() => _query = q.toLowerCase()),
                            style: const TextStyle(
                                color: _ink, fontSize: 14),
                            decoration: const InputDecoration(
                              border: InputBorder.none,
                              hintText: 'Search name, username, role…',
                              hintStyle: TextStyle(
                                  color: Color(0xFFB0B8B0), fontSize: 14)),
                          ),
                        ),
                        if (_searchCtrl.text.isNotEmpty)
                          GestureDetector(
                            onTap: () => setState(() {
                              _searchCtrl.clear(); _query = '';
                            }),
                            child: const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 12),
                              child: Icon(Icons.close_rounded,
                                  color: _muted, size: 17),
                            ),
                          ),
                      ]),
                    ),
                  )
                : const SizedBox.shrink(),
          ),

          // Stats card
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [BoxShadow(
                  color: _forest.withValues(alpha: 0.30),
                  blurRadius: 16, offset: const Offset(0, 6))],
              ),
              child: Row(children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Total Staff',
                        style: TextStyle(color: Colors.white70,
                            fontSize: 12, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      _loading
                          ? Container(
                              width: 48, height: 28,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(6)))
                          : Text('${all.length}',
                              style: const TextStyle(
                                color: Colors.white, fontSize: 28,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.5)),
                      const SizedBox(height: 2),
                      const Text('registered accounts',
                        style: TextStyle(color: Colors.white54,
                            fontSize: 11.5, fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
                // Divider
                Container(
                  width: 1, height: 40,
                  color: Colors.white.withValues(alpha: 0.20),
                  margin: const EdgeInsets.symmetric(horizontal: 16)),
                // Active count
                if (!_loading)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const Text('Active',
                        style: TextStyle(color: Colors.white70,
                            fontSize: 11, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Text('$active',
                        style: const TextStyle(
                          color: Colors.white, fontSize: 22,
                          fontWeight: FontWeight.w800)),
                    ],
                  ),
                const SizedBox(width: 16),
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.group_rounded,
                      color: Colors.white, size: 24),
                ),
              ]),
            ),
          ),

        ]),
      ),
    );
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  Widget _buildBody(List<StaffMember> list, {required bool canManage}) {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: _forest, strokeWidth: 2.5));
    }
    if (_error != null) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 60, height: 60,
          decoration: BoxDecoration(
            color: const Color(0xFFFEF2F2),
            borderRadius: BorderRadius.circular(16)),
          child: const Icon(Icons.wifi_off_rounded,
              color: Color(0xFFDC2626), size: 26),
        ),
        const SizedBox(height: 14),
        Text(_error!,
          textAlign: TextAlign.center,
          style: const TextStyle(color: _ink, fontSize: 14,
              fontWeight: FontWeight.w600)),
        const SizedBox(height: 10),
        GestureDetector(
          onTap: _refresh,
          child: const Text('Tap to retry',
            style: TextStyle(color: _emerald, fontSize: 13,
                fontWeight: FontWeight.w600)),
        ),
      ]));
    }
    if (list.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 72, height: 72,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [_forest.withValues(alpha: 0.12),
                       _emerald.withValues(alpha: 0.06)],
              begin: Alignment.topLeft, end: Alignment.bottomRight),
            shape: BoxShape.circle),
          child: const Icon(Icons.group_outlined, color: _forest, size: 30),
        ),
        const SizedBox(height: 16),
        Text(
          _query.isNotEmpty ? 'No staff match your search' : 'No staff found',
          style: const TextStyle(color: _ink, fontSize: 16,
              fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(
          _query.isNotEmpty
              ? 'Try a different name or role'
              : 'Staff accounts will appear here',
          style: const TextStyle(color: _muted, fontSize: 13)),
      ]));
    }
    return RefreshIndicator(
      color: _forest,
      onRefresh: () async => _refresh(),
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: list.length,
        itemBuilder: (ctx, i) => _StaffCard(
          member: list[i],
          index: i,
          showServiceCommission:
              AppStateScope.of(context).serviceWiseCommissionForUser,
          onTap: canManage ? () => _openStaffForm(edit: list[i]) : null,
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// STAFF CARD
// ═════════════════════════════════════════════════════════════════════════════
class _StaffCard extends StatelessWidget {
  const _StaffCard({
    required this.member,
    required this.index,
    this.onTap,
    this.showServiceCommission = false,
  });
  final StaffMember member;
  final int index;
  final VoidCallback? onTap;
  final bool showServiceCommission;

  String _salaryLabel(String t) {
    switch (t) {
      case 'salary_only':
        return 'Salary';
      case 'salary_plus_commission':
        return 'Salary+Comm';
      default:
        return 'Commission';
    }
  }

  String? _commLabel() {
    if (member.salaryType == 'salary_only') return null;
    final v = member.commissionValue;
    if (v == null) return null;
    return member.commissionType == 'fixed'
        ? 'Rs.${v.toStringAsFixed(0)}'
        : '${v.toStringAsFixed(v.truncateToDouble() == v ? 0 : 1)}%';
  }

  @override
  Widget build(BuildContext context) {
    final grad = _gradients[index % _gradients.length];
    final name = member.name.trim();
    final initials = name.isNotEmpty
        ? name.split(' ').map((e) => e.isNotEmpty ? e[0].toUpperCase() : '')
              .take(2).join()
        : '?';
    final comm = _commLabel();

    return GestureDetector(
      onTap: onTap,
      child: Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _border),
        boxShadow: [BoxShadow(
          color: Colors.black.withValues(alpha: 0.05),
          blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(children: [

          // Avatar
          Container(
            width: 50, height: 50,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: grad,
                begin: Alignment.topLeft,
                end: Alignment.bottomRight),
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(
                color: grad[0].withValues(alpha: 0.28),
                blurRadius: 8, offset: const Offset(0, 3))],
            ),
            child: Center(
              child: Text(initials,
                style: const TextStyle(
                  color: Colors.white, fontSize: 17,
                  fontWeight: FontWeight.w800)),
            ),
          ),

          const SizedBox(width: 14),

          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Name + active badge
                Row(children: [
                  Expanded(
                    child: Text(name,
                      style: const TextStyle(
                        color: _ink, fontSize: 15,
                        fontWeight: FontWeight.w800, letterSpacing: -0.1)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: member.isActive
                          ? const Color(0xFFDCFCE7)
                          : const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(6)),
                    child: Text(
                      member.isActive ? 'Active' : 'Inactive',
                      style: TextStyle(
                        color: member.isActive
                            ? const Color(0xFF14532D) : _muted,
                        fontSize: 10.5, fontWeight: FontWeight.w700)),
                  ),
                ]),
                const SizedBox(height: 4),
                if (member.roleTitle != null &&
                    member.roleTitle!.isNotEmpty)
                  Text(member.roleTitle!,
                    style: const TextStyle(
                      color: _muted, fontSize: 12.5,
                      fontWeight: FontWeight.w500)),
                const SizedBox(height: 5),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(6)),
                      child: Text(_salaryLabel(member.salaryType),
                        style: const TextStyle(
                          color: Color(0xFF1D4ED8), fontSize: 11,
                          fontWeight: FontWeight.w700)),
                    ),
                    if (comm != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFFBEB),
                          borderRadius: BorderRadius.circular(6)),
                        child: Text(comm,
                          style: const TextStyle(
                            color: Color(0xFFB45309), fontSize: 11,
                            fontWeight: FontWeight.w700)),
                      ),
                    if (showServiceCommission &&
                        member.specializations.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF5F3FF),
                          borderRadius: BorderRadius.circular(6)),
                        child: Text(
                          '${member.specializations.length} svcs',
                          style: const TextStyle(
                            color: Color(0xFF6D28D9), fontSize: 11,
                            fontWeight: FontWeight.w700)),
                      ),
                  ],
                ),
              ],
            ),
          ),

          // Chevron
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              color: _forest.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.chevron_right_rounded,
                color: _forest, size: 17),
          ),

        ]),
      ),
    ),
    );
  }
}
