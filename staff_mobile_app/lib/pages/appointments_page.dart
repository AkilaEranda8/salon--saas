import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'add_appointment_modal.dart';
import 'edit_appointment_modal.dart';
import '../models/appointment.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../models/staff_user.dart';
import '../state/app_state.dart';
import '../utils/appointment_notes.dart';

// ── Palette — mirrors dashboard tokens ───────────────────────────────────────
const Color _ink      = Color(0xFF111827);
const Color _forest   = Color(0xFF1B3A2D);   // _g900
const Color _emerald  = Color(0xFF2D6A4F);   // _g700
const Color _leaf     = Color(0xFF2D6A4F);   // _g700
const Color _mint     = Color(0xFFD1FAE5);   // _g100
const Color _gold     = Color(0xFFC9956C);   // _gold
const Color _goldL    = Color(0xFFE8C49A);   // light gold
const Color _canvas   = Color(0xFFF2F5F2);   // _bg
const Color _surface  = Color(0xFFFFFFFF);
const Color _border   = Color(0xFFE5E7EB);

// ── Status metadata ───────────────────────────────────────────────────────────
class _SM {
  const _SM(this.label, this.fg, this.bg, this.glow);
  final String label;
  final Color fg, bg, glow;
}

_SM _sm(String s) {
  switch (s.toLowerCase()) {
    case 'confirmed':
    case 'in_service':
      return const _SM('In Service', Color(0xFF1E40AF), Color(0xFFDBEAFE), Color(0xFF3B82F6));
    case 'completed':
      return const _SM('Completed',  Color(0xFF14532D), Color(0xFFDCFCE7), Color(0xFF22C55E));
    case 'cancelled':
      return const _SM('Cancelled',  Color(0xFF7F1D1D), Color(0xFFFFE4E6), Color(0xFFF43F5E));
    default:
      return const _SM('Pending',    Color(0xFF78350F), Color(0xFFFEF9C3), Color(0xFFF59E0B));
  }
}

String _sl(String s) => _sm(s).label;

// ─────────────────────────────────────────────────────────────────────────────
const int    _kLimit   = 20;
const List<String> _kFilters  = ['pending', 'confirmed', 'completed', 'cancelled'];
const List<String> _kForms    = ['pending', 'confirmed', 'cancelled'];

// ─────────────────────────────────────────────────────────────────────────────
class AppointmentsPage extends StatefulWidget {
  const AppointmentsPage({super.key});
  @override
  State<AppointmentsPage> createState() => _ApptState();
}

class _ApptState extends State<AppointmentsPage> with SingleTickerProviderStateMixin {
  bool    _loading = true;
  String? _err;
  int     _page    = 1;
  String  _q       = '';
  String  _fStatus = '';
  String  _fDate   = '';
  String  _fBranch = '';
  late final AnimationController _fadeCtrl;
  late final Animation<double>   _fadeAnim;

  @override
  void initState() {
    super.initState();
    _fadeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 400));
    _fadeAnim = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() { _fadeCtrl.dispose(); super.dispose(); }

  bool get _isSuper => (AppStateScope.of(context).currentUser?.role ?? '') == 'superadmin';
  bool get _canDel  {
    final r = AppStateScope.of(context).currentUser?.role ?? '';
    return r == 'superadmin' || r == 'admin' || r == 'manager';
  }

  Future<void> _load() async {
    final app = AppStateScope.of(context);
    if (!app.hasPermission(StaffPermission.canViewAppointments)) return;
    setState(() { _loading = true; _err = null; });
    try {
      if (_isSuper) await app.loadBranches();
      await Future.wait([
        app.loadServices(),
        app.loadAppointments(
          page: _page, limit: _kLimit,
          status:   _fStatus.isEmpty ? null : _fStatus,
          date:     _fDate.isEmpty   ? null : _fDate,
          branchId: _isSuper ? (_fBranch.isEmpty ? null : _fBranch)
                             : app.currentUser?.branchId,
        ),
      ]);
      if (mounted) { _fadeCtrl.forward(from: 0); }
    } catch (e) {
      if (mounted) setState(() => _err = e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  List<Appointment> get _shown {
    final app = AppStateScope.of(context);
    final raw = app.appointments;
    final catalog = app.services;
    final q = _q.trim().toLowerCase();
    if (q.isEmpty) return raw;
    return raw.where((a) {
      final svcLine = a.resolveServicesDisplay(catalog).toLowerCase();
      return a.customerName.toLowerCase().contains(q) ||
          a.phone.toLowerCase().contains(q) ||
          a.serviceName.toLowerCase().contains(q) ||
          svcLine.contains(q);
    }).toList();
  }

  Map<String, int> get _counts {
    final list = AppStateScope.of(context).appointments;
    return { for (final s in _kFilters) s: list.where((a) => a.status.toLowerCase() == s).length };
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(m, style: const TextStyle(fontWeight: FontWeight.w600)),
      backgroundColor: _forest,
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  Future<void> _goNew() async {
    final app = AppStateScope.of(context);
    if (!app.hasPermission(StaffPermission.canAddAppointments)) {
      _toast('No permission to add appointments.'); return;
    }
    final ok = await showAddAppointmentModal(context);
    if (ok == true && mounted) await _load();
  }

  Future<void> _goEdit({Appointment? e}) async {
    final app = AppStateScope.of(context);
    if (!app.hasPermission(StaffPermission.canAddAppointments)) {
      _toast('No permission to edit appointments.'); return;
    }
    // New appointment → use the quick modal
    if (e == null) {
      final ok = await showAddAppointmentModal(context);
      if (ok == true && mounted) await _load();
      return;
    }
    // Edit existing → navigate to the new full-screen edit page
    setState(() => _loading = true);
    final svcs = await app.loadServices();
    final brs  = await app.loadBranches();
    await app.loadCustomers();
    final ub   = app.currentUser?.branchId ?? '';
    String sb  = _isSuper
        ? (e.branchId.isNotEmpty ? e.branchId
            : (_fBranch.isNotEmpty ? _fBranch : ub))
        : ub;
    if (sb.isEmpty) sb = ub;
    List<StaffMember> staff = [];
    try { staff = await app.loadStaffList(branchId: sb.isEmpty ? null : sb); } catch (_) {}
    if (!mounted) return;
    setState(() => _loading = false);
    final ok = await showEditAppointmentModal(
      context,
      appointment:   e,
      services:      svcs,
      branches:      brs,
      staffList:     staff,
      isSuperAdmin:  _isSuper,
      fixedBranchId: ub,
    );
    if (ok == true && mounted) await _load();
  }

  Future<void> _delete(Appointment a) async {
    final ok = await showDialog<bool>(context: context,
      builder: (_) => _DeleteDialog(name: a.customerName));
    if (ok != true || !mounted) return;
    final app = AppStateScope.of(context);
    final success = await app.deleteAppointment(a.id);
    if (!mounted) return;
    if (!success) { _toast(app.lastError ?? 'Delete failed'); return; }
    _toast('Appointment deleted');
    await _load();
  }

  // ── BUILD ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final app = AppStateScope.of(context);
    if (!app.hasPermission(StaffPermission.canViewAppointments)) {
      return const Scaffold(body: Center(child: Text('No permission.')));
    }
    final list = _shown;
    final total = app.appointmentTotal;
    final pages = (total / _kLimit).ceil().clamp(1, 999999);
    final cnts  = _counts;

    final canAdd = app.hasPermission(StaffPermission.canAddAppointments) && !_loading;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: _canvas,
        floatingActionButton: canAdd
            ? Padding(
                padding: const EdgeInsets.only(bottom: 8, right: 4),
                child: GestureDetector(
                  onTap: _goNew,
                  child: Container(
                    width: 56, height: 56,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [_emerald, _forest]),
                      boxShadow: [BoxShadow(
                          color: _forest.withValues(alpha: 0.40),
                          blurRadius: 16, offset: const Offset(0, 6))],
                    ),
                    child: const Icon(Icons.add_rounded, color: Colors.white, size: 26),
                  ),
                ),
            )
          : null,
        floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
        body: Column(children: [
          _Header(
            total: total, page: _page, loading: _loading,
            counts: cnts,
            onBack: () => Navigator.of(context).pop(),
            onRefresh: _loading ? null : _load,
          ),
          Expanded(child: _loading
            ? _LoadingView()
            : _err != null
              ? _ErrorView(msg: _err!, onRetry: _load)
              : FadeTransition(
                  opacity: _fadeAnim,
                  child: RefreshIndicator(
                    color: _leaf, onRefresh: _load,
                    child: CustomScrollView(
                      physics: const BouncingScrollPhysics(
                        parent: AlwaysScrollableScrollPhysics()),
                      slivers: [
                        SliverToBoxAdapter(child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
                          child: Column(children: [
                            if (_isSuper) ...[
                              _BranchPicker(
                                value: _fBranch,
                                branches: app.branches,
                                onChange: (v) { setState(() { _fBranch = v; _page = 1; }); _load(); },
                              ),
                      const SizedBox(height: 12),
                            ],
                            _SearchField(onChanged: (v) => setState(() => _q = v)),
                            const SizedBox(height: 12),
                            _FilterChips(
                              selected: _fStatus, counts: cnts,
                              onSelect: (k) { setState(() { _fStatus = k; _page = 1; }); _load(); },
                            ),
                            const SizedBox(height: 12),
                            _DatePicker(
                              value: _fDate,
                              onPick: (v) { setState(() { _fDate = v; _page = 1; }); _load(); },
                              onClear: () { setState(() { _fDate = ''; _page = 1; }); _load(); },
                            ),
                            const SizedBox(height: 20),
                          ]),
                        )),
                        if (list.isEmpty)
                          SliverFillRemaining(
                            hasScrollBody: false,
                            child: _EmptyView(hasFilter: _fStatus.isNotEmpty || _fDate.isNotEmpty || _q.isNotEmpty),
                          )
                        else ...[
                          SliverPadding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            sliver: SliverList(
                              delegate: SliverChildBuilderDelegate(
                                (ctx, i) => _ApptCard(
                                  appt: list[i],
                                  services: app.services,
                                  role: app.currentUser?.role ?? '',
                                  onTap: () => _openSheet(context, list[i]),
                                ),
                                childCount: list.length,
                              ),
                            ),
                          ),
                          SliverToBoxAdapter(child: Padding(
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
                            child: _Pagination(
                              page: _page, total: pages,
                              onPrev: _page > 1 ? () { setState(() => _page--); _load(); } : null,
                              onNext: _page < pages ? () { setState(() => _page++); _load(); } : null,
                            ),
                          )),
                        ],
                      ],
                    ),
                  ),
                ),
          ),
        ]),
      ),
    );
  }

  // ── Detail sheet ───────────────────────────────────────────────────────────
  Future<void> _openSheet(BuildContext context, Appointment a) async {
    final meta     = _sm(a.status);
    final s        = a.status.toLowerCase();
    final canEdit  = ['superadmin','admin','manager','staff']
        .contains(AppStateScope.of(context).currentUser?.role ?? '');
    final canPay   = canEdit && (s == 'confirmed' || s == 'in_service');
    final canChg   = canEdit && s != 'completed' && s != 'cancelled';

    final services = AppStateScope.of(context).services;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _DetailSheet(
        appt: a,
        services: services,
        meta: meta, canPay: canPay, canChange: canChg,
        canDelete: _canDel,
        onStatus:  () { Navigator.pop(ctx); _changeStatus(a); },
        onEdit:    () { Navigator.pop(ctx); _goEdit(e: a); },
        onPay:     () { Navigator.pop(ctx); _pay(a); },
        onDelete:  () { Navigator.pop(ctx); _delete(a); },
      ),
    );
  }

  Future<void> _changeStatus(Appointment a) async {
    final app = AppStateScope.of(context);
    final picked = await showDialog<String>(context: context,
      builder: (ctx) => _StatusDialog(initial: a.status, onChanged: (_) {}));
    if (picked == null || picked == a.status) return;
    final ok = await app.changeAppointmentStatus(appointmentId: a.id, status: picked);
    if (!mounted) return;
    if (!ok) { _toast(app.lastError ?? 'Failed'); return; }
    await _load();
  }

  Future<void> _pay(Appointment a) async {
    final app = AppStateScope.of(context);
    await app.loadServices();
    if (!mounted) return;
    final svcs = app.services;

    final ids = <int>[];
    if (a.serviceIds.isNotEmpty) {
      for (final raw in a.serviceIds) {
        final v = int.tryParse(raw);
        if (v != null && !ids.contains(v)) ids.add(v);
      }
    } else {
      final sid = int.tryParse(a.serviceId);
      if (sid != null) ids.add(sid);
      for (final name in AppointmentNotes.parseAdditionalServiceNames(a.notes)) {
        for (final s in svcs) {
          if (s.name == name) {
            final id = int.tryParse(s.id);
            if (id != null && !ids.contains(id)) ids.add(id);
          }
        }
      }
    }
    final initialAmt = a.displayAmount > 0 ? a.displayAmount.toStringAsFixed(0) : '';

    final branchKey = a.branchId.trim().isNotEmpty
        ? a.branchId
        : (app.currentUser?.branchId ?? '');
    var discounts = const <Map<String, dynamic>>[];
    if (branchKey.isNotEmpty) {
      discounts = await app.loadDiscountsForPayment(branchKey);
    }
    if (!mounted) return;

    final result = await showModalBottomSheet<_PayResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _PaySheet(
        appointment: a,
        services: svcs,
        preSelected: ids,
        initialAmount: initialAmt,
        discounts: discounts,
      ),
    );

    if (result == null || !mounted) return;
    final success = await app.collectAppointmentPayment(
      appointment: a,
      amount: result.amount,
      method: result.method,
      paymentServiceIds: result.serviceIds,
      subtotal: result.subtotal,
      discountId:
          result.discountId.isNotEmpty ? result.discountId : null,
    );
    if (!mounted) return;
    if (!success) { _toast(app.lastError ?? 'Payment failed'); return; }
    _toast('Payment recorded');
    await _load();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HEADER — matches dashboard style (clean top bar + gradient welcome card)
// ═════════════════════════════════════════════════════════════════════════════
class _Header extends StatelessWidget {
  const _Header({
    required this.total, required this.page, required this.loading,
    required this.counts,
    required this.onBack, required this.onRefresh,
  });
  final int total, page;
  final bool loading;
  final Map<String, int> counts;
  final VoidCallback onBack;
  final VoidCallback? onRefresh;

  @override
  Widget build(BuildContext context) {
    final pending   = counts['pending']   ?? 0;
    final inService = counts['confirmed'] ?? 0;
    final completed = counts['completed'] ?? 0;

    return Container(
      color: _canvas,
      child: SafeArea(
        bottom: false,
        child: Column(children: [

          // ── Top bar ─────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
            child: Row(children: [
              GestureDetector(
                onTap: onBack,
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
                  Icon(Icons.event_note_rounded, color: _forest, size: 16),
                  SizedBox(width: 7),
                  Text('Appointments',
                      style: TextStyle(color: _forest, fontSize: 16,
                          fontWeight: FontWeight.w800, letterSpacing: 0.2)),
                ]),
              ),
              if (onRefresh != null)
                GestureDetector(
                  onTap: onRefresh,
                  child: Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle, color: _surface,
                      boxShadow: [BoxShadow(
                          color: Colors.black.withValues(alpha: 0.07),
                          blurRadius: 8, offset: const Offset(0, 2))],
                    ),
                    child: const Icon(Icons.refresh_rounded,
                        color: Color(0xFF6B7280), size: 17),
                  ),
                ),
            ]),
          ),

          // ── Gradient stats card ──────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Container(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [_forest, _emerald, Color(0xFF3A8C62)],
                ),
                boxShadow: [BoxShadow(
                    color: _forest.withValues(alpha: 0.30),
                    blurRadius: 16, offset: const Offset(0, 6))],
              ),
              child: Row(children: [
                // Left: title + subtitle
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
      children: [
                    const Text('Appointments',
                        style: TextStyle(color: Colors.white,
                            fontSize: 17, fontWeight: FontWeight.w900,
                            letterSpacing: -0.3)),
                    const SizedBox(height: 4),
                    Text('$total bookings total  ·  Page $page',
                        style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.65),
                            fontSize: 11.5, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 14),
                    // Stat pills row
                    Row(children: [
                      _StatPill(label: 'Pending',    val: pending,   color: const Color(0xFFFBBF24)),
        const SizedBox(width: 8),
                      _StatPill(label: 'In Service', val: inService, color: const Color(0xFF60A5FA)),
        const SizedBox(width: 8),
                      _StatPill(label: 'Done',       val: completed, color: const Color(0xFF34D399)),
                    ]),
                  ],
                )),
                const SizedBox(width: 12),
                // Right: icon bubble
                Container(
                  width: 52, height: 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.12),
                  ),
                  child: const Icon(Icons.calendar_month_rounded,
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

class _StatPill extends StatelessWidget {
  const _StatPill({required this.label, required this.val, required this.color});
  final String label;
  final int val;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.15),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 6, height: 6,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 5),
      Text('$val $label',
          style: const TextStyle(color: Colors.white,
              fontSize: 10.5, fontWeight: FontWeight.w700)),
    ]),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SEARCH FIELD
// ═════════════════════════════════════════════════════════════════════════════
class _SearchField extends StatelessWidget {
  const _SearchField({required this.onChanged});
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: _surface,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: _border),
      boxShadow: const [BoxShadow(color: Color(0x06000000),
        blurRadius: 10, offset: Offset(0, 3))],
    ),
    child: TextField(
      onChanged: onChanged,
      style: const TextStyle(fontSize: 14, color: _ink),
      decoration: InputDecoration(
        hintText: 'Search name, phone or service…',
        hintStyle: TextStyle(color: const Color(0xFF9CA3AF).withValues(alpha: 0.8), fontSize: 14),
          prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFF9CA3AF), size: 20),
        suffixIcon: const Padding(
          padding: EdgeInsets.only(right: 14),
          child: Icon(Icons.tune_rounded, color: Color(0xFFD1D5DB), size: 19),
        ),
        border: InputBorder.none,
        contentPadding: const EdgeInsets.symmetric(vertical: 15, horizontal: 4),
      ),
    ),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FILTER CHIPS
// ═════════════════════════════════════════════════════════════════════════════
class _FilterChips extends StatelessWidget {
  const _FilterChips({required this.selected, required this.counts, required this.onSelect});
  final String selected;
  final Map<String, int> counts;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final all = [
      ('', 'All', null as Color?, null as Color?),
      ...(_kFilters.map((s) {
        final m = _sm(s);
        return (s, m.label, m.fg, m.bg);
      })),
    ];
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: all.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final (key, label, fg, bg) = all[i];
          final active = selected == key;
          final cnt = key.isEmpty ? null : counts[key];
          return GestureDetector(
            onTap: () => onSelect(key),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: active ? (fg ?? _emerald) : _surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: active ? Colors.transparent : _border, width: 1),
                boxShadow: active ? [BoxShadow(
                  color: (fg ?? _emerald).withValues(alpha: 0.30),
                  blurRadius: 10, offset: const Offset(0, 3))] : [],
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (!active && fg != null) ...[
                  Container(width: 6, height: 6,
                    decoration: BoxDecoration(color: fg, shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                ],
                Text(
                  cnt != null ? '$label  $cnt' : label,
                  style: TextStyle(
                    color: active ? Colors.white : const Color(0xFF6B7280),
                    fontSize: 12.5, fontWeight: FontWeight.w700),
                ),
              ]),
            ),
          );
        },
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// DATE PICKER ROW
// ═════════════════════════════════════════════════════════════════════════════
class _DatePicker extends StatelessWidget {
  const _DatePicker({required this.value, required this.onPick, required this.onClear});
  final String value;
  final ValueChanged<String> onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final has = value.isNotEmpty;
    return Row(children: [
      Expanded(child: GestureDetector(
        onTap: () async {
              final now = DateTime.now();
              final d = await showDatePicker(
            context: context, firstDate: DateTime(2020), lastDate: DateTime(2035),
            initialDate: has ? DateTime.tryParse(value) ?? now : now,
          );
          if (d != null) {
            onPick('${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}');
          }
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            color: has ? _forest : _surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: has ? _forest : _border),
            boxShadow: has ? [BoxShadow(color: _forest.withValues(alpha: 0.25),
              blurRadius: 10, offset: const Offset(0, 4))] : [],
          ),
          child: Row(children: [
            Container(
              width: 30, height: 30,
              decoration: BoxDecoration(
                color: has ? _gold.withValues(alpha: 0.20) : _mint,
                borderRadius: BorderRadius.circular(8)),
              child: Icon(Icons.calendar_month_rounded, size: 15,
                color: has ? _goldL : _leaf),
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(
              has ? value : 'Filter by date',
              style: TextStyle(
                color: has ? Colors.white : const Color(0xFF9CA3AF),
                fontSize: 13.5, fontWeight: FontWeight.w600),
            )),
            Icon(has ? Icons.check_circle_rounded : Icons.arrow_drop_down_rounded,
              color: has ? _goldL : const Color(0xFFD1D5DB), size: 20),
          ]),
        ),
      )),
      if (has) ...[
          const SizedBox(width: 8),
        GestureDetector(
          onTap: onClear,
          child: Container(
            width: 46, height: 46,
            decoration: BoxDecoration(
              color: _surface, borderRadius: BorderRadius.circular(14),
              border: Border.all(color: _border)),
            child: const Icon(Icons.close_rounded, size: 18,
              color: Color(0xFF9CA3AF)),
          ),
        ),
      ],
    ]);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BRANCH PICKER
// ═════════════════════════════════════════════════════════════════════════════
class _BranchPicker extends StatelessWidget {
  const _BranchPicker({required this.value, required this.branches, required this.onChange});
  final String value;
  final List<Map<String, String>> branches;
  final ValueChanged<String> onChange;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: _surface, borderRadius: BorderRadius.circular(14),
      border: Border.all(color: _border)),
      child: DropdownButtonFormField<String>(
      initialValue: value.isEmpty ? null : value,
        decoration: InputDecoration(
          labelText: 'Branch',
        labelStyle: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 13),
        filled: true, fillColor: Colors.transparent,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        prefixIcon: const Icon(Icons.store_mall_directory_outlined,
          size: 18, color: Color(0xFF9CA3AF)),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none),
      ),
        items: [
          const DropdownMenuItem(value: '', child: Text('All branches')),
          ...branches.map((b) => DropdownMenuItem(value: b['id'], child: Text(b['name'] ?? ''))),
      ],
      onChanged: (v) => onChange(v ?? ''),
    ),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// APPOINTMENT CARD
// ═════════════════════════════════════════════════════════════════════════════
class _ApptCard extends StatelessWidget {
  const _ApptCard({
    required this.appt,
    required this.services,
    required this.role,
    required this.onTap,
  });
  final Appointment appt;
  final List<SalonService> services;
  final String role;
  final VoidCallback onTap;

  String get _initial =>
      appt.customerName.trim().isNotEmpty ? appt.customerName.trim()[0].toUpperCase() : 'C';

  @override
  Widget build(BuildContext context) {
    final meta    = _sm(appt.status);
    final service = appt.resolveServicesDisplay(services);
    final amt     = appt.displayAmount > 0 ? appt.displayAmount : 0.0;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFEAECF0), width: 1),
          boxShadow: const [
            BoxShadow(color: Color(0x08000000), blurRadius: 16, offset: Offset(0, 4)),
            BoxShadow(color: Color(0x04000000), blurRadius: 4, offset: Offset(0, 1)),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Column(children: [

            // ── Top status bar (3px) ───────────────────────────────────
            Container(height: 3, color: meta.glow),

            // ── Card body ─────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
                  // Avatar
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [_forest, _emerald],
                      ),
                    ),
                    child: Center(
                      child: Text(_initial,
                          style: const TextStyle(color: Colors.white,
                              fontSize: 17, fontWeight: FontWeight.w900)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Name + phone
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                        Text(appt.customerName,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: Color(0xFF111827),
                                fontSize: 15, fontWeight: FontWeight.w700,
                                letterSpacing: -0.2)),
                        const SizedBox(height: 2),
                        if (appt.phone.isNotEmpty)
                          Row(children: [
                            const Icon(Icons.phone_outlined,
                                size: 11, color: Color(0xFFADB5BD)),
                            const SizedBox(width: 4),
                            Text(appt.phone,
                                style: const TextStyle(
                                    color: Color(0xFFADB5BD),
                                    fontSize: 12, fontWeight: FontWeight.w500)),
                          ]),
                      ],
                    ),
                  ),
                  // Status pill
                Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: meta.bg,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                          color: meta.glow.withValues(alpha: 0.25), width: 1),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Container(
                        width: 6, height: 6,
                        decoration: BoxDecoration(
                            shape: BoxShape.circle, color: meta.glow),
                      ),
                      const SizedBox(width: 5),
                      Text(meta.label,
                          style: TextStyle(
                              color: meta.fg,
                              fontSize: 10.5, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ],
              ),
            ),

            // ── Service row ───────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: Row(children: [
                Container(
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    color: _mint,
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: const Icon(Icons.content_cut_rounded,
                      size: 13, color: _emerald),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(service,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Color(0xFF374151),
                          fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ]),
            ),

            const SizedBox(height: 12),

            // ── Footer band ───────────────────────────────────────────
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: const BoxDecoration(
                color: Color(0xFFF8F9FA),
                border: Border(top: BorderSide(color: Color(0xFFEAECF0))),
              ),
              child: Row(children: [
                const Icon(Icons.calendar_today_rounded,
                    size: 11, color: Color(0xFF9CA3AF)),
                const SizedBox(width: 5),
                Text(appt.date,
                    style: const TextStyle(
                        color: Color(0xFF6B7280),
                        fontSize: 12, fontWeight: FontWeight.w500)),
                const SizedBox(width: 10),
                const Icon(Icons.access_time_rounded,
                    size: 11, color: Color(0xFF9CA3AF)),
                const SizedBox(width: 4),
                Text(appt.time,
                    style: const TextStyle(
                        color: Color(0xFF6B7280),
                        fontSize: 12, fontWeight: FontWeight.w500)),
                const Spacer(),
                if (appt.createdBy.isNotEmpty) ...[
                  const Icon(Icons.person_outline_rounded,
                      size: 11, color: Color(0xFFCBD5E1)),
                  const SizedBox(width: 3),
                  Text(appt.createdBy,
                      style: const TextStyle(
                          color: Color(0xFFADB5BD), fontSize: 11)),
                  const SizedBox(width: 10),
                ],
                // Amount
                Text('LKR ${amt.toStringAsFixed(0)}',
                    style: const TextStyle(
                        color: _forest,
                        fontSize: 14, fontWeight: FontWeight.w800)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// EMPTY VIEW
// ═════════════════════════════════════════════════════════════════════════════
class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.hasFilter});
  final bool hasFilter;
  @override
  Widget build(BuildContext context) => Center(child: Padding(
    padding: const EdgeInsets.all(32),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 80, height: 80,
        decoration: const BoxDecoration(color: _mint, shape: BoxShape.circle),
        child: const Icon(Icons.event_note_rounded, color: _leaf, size: 36),
      ),
      const SizedBox(height: 18),
      Text(
        hasFilter ? 'No matches found' : 'No appointments yet',
        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: _ink)),
      const SizedBox(height: 8),
      Text(
        hasFilter
          ? 'Try clearing your filters or searching with different keywords.'
          : 'Tap the New button above to create the first appointment.',
        textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 13.5, height: 1.5)),
    ]),
  ));
}

// ═════════════════════════════════════════════════════════════════════════════
// LOADING VIEW
// ═════════════════════════════════════════════════════════════════════════════
class _LoadingView extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
    Container(
      width: 54, height: 54,
      decoration: const BoxDecoration(color: _mint, shape: BoxShape.circle),
      child: const Padding(
        padding: EdgeInsets.all(14),
        child: CircularProgressIndicator(color: _emerald, strokeWidth: 2.5))),
    const SizedBox(height: 14),
    const Text('Loading…', style: TextStyle(
      color: Color(0xFF9CA3AF), fontSize: 13, fontWeight: FontWeight.w600)),
  ]));
}

// ═════════════════════════════════════════════════════════════════════════════
// ERROR VIEW
// ═════════════════════════════════════════════════════════════════════════════
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.msg, required this.onRetry});
  final String msg;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(child: Padding(
    padding: const EdgeInsets.all(32),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 70, height: 70,
        decoration: const BoxDecoration(color: Color(0xFFFFF1F2), shape: BoxShape.circle),
        child: const Icon(Icons.cloud_off_rounded, color: Color(0xFFF43F5E), size: 32),
      ),
      const SizedBox(height: 16),
      const Text('Unable to load', style: TextStyle(
        fontWeight: FontWeight.w800, fontSize: 17, color: _ink)),
      const SizedBox(height: 8),
      Text(msg, textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 13, height: 1.5)),
      const SizedBox(height: 22),
      GestureDetector(
        onTap: onRetry,
                    child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 13),
                      decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [_forest, _emerald]),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: _forest.withValues(alpha: 0.30),
              blurRadius: 12, offset: const Offset(0, 5))]),
          child: const Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.refresh_rounded, color: Colors.white, size: 17),
            SizedBox(width: 8),
            Text('Try again', style: TextStyle(color: Colors.white,
              fontWeight: FontWeight.w700, fontSize: 14)),
          ]),
        ),
      ),
    ]),
  ));
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGINATION
// ═════════════════════════════════════════════════════════════════════════════
class _Pagination extends StatelessWidget {
  const _Pagination({required this.page, required this.total, required this.onPrev, required this.onNext});
  final int page, total;
  final VoidCallback? onPrev, onNext;
  @override
  Widget build(BuildContext context) => Row(mainAxisAlignment: MainAxisAlignment.center, children: [
    _PBtn(icon: Icons.chevron_left_rounded, label: 'Prev', enabled: onPrev != null, onTap: onPrev),
    const SizedBox(width: 12),
                      Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 11),
      decoration: BoxDecoration(
        color: _surface, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _border)),
      child: Text('$page / $total', style: const TextStyle(
        fontWeight: FontWeight.w800, fontSize: 13, color: _ink)),
    ),
    const SizedBox(width: 12),
    _PBtn(icon: Icons.chevron_right_rounded, label: 'Next', enabled: onNext != null, onTap: onNext, trailing: true),
  ]);
}

class _PBtn extends StatelessWidget {
  const _PBtn({required this.icon, required this.label, required this.enabled,
    required this.onTap, this.trailing = false});
  final IconData icon;
  final String label;
  final bool enabled, trailing;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
      decoration: BoxDecoration(
        gradient: enabled
          ? const LinearGradient(colors: [_forest, _emerald])
          : null,
        color: enabled ? null : const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(12),
        boxShadow: enabled ? [BoxShadow(color: _forest.withValues(alpha: 0.25),
          blurRadius: 10, offset: const Offset(0, 4))] : [],
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (!trailing) Icon(icon, size: 17,
          color: enabled ? Colors.white : const Color(0xFFD1D5DB)),
        Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
          color: enabled ? Colors.white : const Color(0xFFD1D5DB))),
        if (trailing) Icon(icon, size: 17,
          color: enabled ? Colors.white : const Color(0xFFD1D5DB)),
      ]),
    ),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DETAIL SHEET
// ═════════════════════════════════════════════════════════════════════════════
class _DetailSheet extends StatelessWidget {
  const _DetailSheet({
    required this.appt,
    required this.services,
    required this.meta,
    required this.canPay, required this.canChange, required this.canDelete,
    required this.onStatus, required this.onEdit,
    required this.onPay, required this.onDelete,
  });
  final Appointment appt;
  final List<SalonService> services;
  final _SM meta;
  final bool canPay, canChange, canDelete;
  final VoidCallback onStatus, onEdit, onPay, onDelete;

  String get _initial =>
      appt.customerName.trim().isNotEmpty
          ? appt.customerName.trim()[0].toUpperCase()
          : 'C';

  @override
  Widget build(BuildContext context) {
    final service = appt.resolveServicesDisplay(services);
    final notes = AppointmentNotes
        .stripAdditionalServicesLine(appt.notes);

    return Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Container(
        constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.90),
          decoration: const BoxDecoration(
            color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [

          // ── Drag handle ──────────────────────────────────────────
                  Center(
                    child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 4),
              width: 38, height: 4,
                      decoration: BoxDecoration(
                  color: const Color(0xFFE5E7EB),
                  borderRadius: BorderRadius.circular(99)),
            ),
          ),

          // ── Customer row ─────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 14),
            child: Row(children: [
              // Avatar
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: meta.bg,
                  border: Border.all(
                      color: meta.glow.withValues(alpha: 0.30), width: 1.5),
                ),
                child: Center(
                  child: Text(_initial,
                      style: TextStyle(
                          color: meta.fg,
                          fontSize: 18,
                          fontWeight: FontWeight.w900)),
                ),
              ),
              const SizedBox(width: 13),
              // Name + phone
                      Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(appt.customerName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Color(0xFF111827),
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3)),
                    if (appt.phone.isNotEmpty)
                      Text(appt.phone,
                          style: const TextStyle(
                              color: Color(0xFFADB5BD),
                              fontSize: 12.5,
                              fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
              // Status chip
                      Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: meta.bg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                      color: meta.glow.withValues(alpha: 0.25)),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: 6, height: 6,
                    decoration: BoxDecoration(
                        shape: BoxShape.circle, color: meta.glow),
                  ),
                  const SizedBox(width: 5),
                  Text(meta.label,
                      style: TextStyle(
                          color: meta.fg,
                          fontSize: 11,
                          fontWeight: FontWeight.w800)),
                ]),
              ),
              // Close
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: 30, height: 30,
                  decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.close_rounded,
                      size: 15, color: Color(0xFF9CA3AF)),
                ),
              ),
            ]),
          ),

          // ── Thin divider ─────────────────────────────────────────
          const Divider(height: 1, color: Color(0xFFF3F4F6)),

          // ── Scrollable body ──────────────────────────────────────
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                      children: [

                  // ── Info grid (2 columns) ──────────────────────
                  Row(children: [
                    Expanded(child: _InfoTile(
                      icon: Icons.content_cut_rounded,
                      label: 'Service',
                      value: service.isEmpty ? '—' : service,
                    )),
                    const SizedBox(width: 10),
                    Expanded(child: _InfoTile(
                      icon: Icons.payments_outlined,
                      label: 'Amount',
                      value: 'LKR ${appt.displayAmount.toStringAsFixed(0)}',
                      valueColor: const Color(0xFF059669),
                    )),
                  ]),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(child: _InfoTile(
                      icon: Icons.calendar_today_rounded,
                      label: 'Date',
                      value: appt.date,
                    )),
                    const SizedBox(width: 10),
                    Expanded(child: _InfoTile(
                      icon: Icons.access_time_rounded,
                      label: 'Time',
                      value: appt.time,
                    )),
                  ]),
                  if (appt.branchName.isNotEmpty || appt.createdBy.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Row(children: [
                      if (appt.branchName.isNotEmpty)
                        Expanded(child: _InfoTile(
                          icon: Icons.store_outlined,
                          label: 'Branch',
                          value: appt.branchName,
                        )),
                      if (appt.branchName.isNotEmpty && appt.createdBy.isNotEmpty)
                        const SizedBox(width: 10),
                      if (appt.createdBy.isNotEmpty)
                        Expanded(child: _InfoTile(
                          icon: Icons.person_outline_rounded,
                          label: 'Staff',
                          value: appt.createdBy,
                        )),
                    ]),
                  ],

                  // ── Notes ─────────────────────────────────────
                  if (notes.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFFBF5),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                            color: const Color(0xFFE8C49A)
                                .withValues(alpha: 0.40)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.notes_rounded,
                              size: 15,
                              color: Color(0xFFC9956C)),
                        const SizedBox(width: 8),
                        Expanded(
                            child: Text(notes,
                                style: const TextStyle(
                                    color: Color(0xFF6B7280),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500)),
                          ),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 18),

                  // ── Action buttons ────────────────────────────
                  if (canChange) ...[
                    Row(children: [
                      Expanded(
                        child: _SheetBtn(
                          icon: Icons.swap_horiz_rounded,
                          label: 'Status',
                          bg: const Color(0xFFEFF6FF),
                          fg: const Color(0xFF1D4ED8),
                          onTap: onStatus,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _SheetBtn(
                          icon: Icons.edit_rounded,
                          label: 'Edit',
                          bg: const Color(0xFFF0FDF4),
                          fg: const Color(0xFF16A34A),
                          onTap: onEdit,
                        ),
                      ),
                    ]),
                    const SizedBox(height: 10),
                  ],
                  if (canPay) ...[
                    _SheetBtn(
                      icon: Icons.payments_rounded,
                      label: 'Collect Payment',
                      bg: const Color(0xFF059669),
                      fg: Colors.white,
                      full: true,
                      onTap: onPay,
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (canDelete) ...[
                    _SheetBtn(
                      icon: Icons.delete_outline_rounded,
                      label: 'Delete',
                      bg: const Color(0xFFFFF1F2),
                      fg: const Color(0xFFF43F5E),
                      full: true,
                      onTap: onDelete,
                    ),
                    const SizedBox(height: 10),
                  ],

                  SafeArea(
                    top: false,
                    child: const SizedBox(height: 4),
                  ),
                ],
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });
  final IconData icon;
  final String label, value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
    decoration: BoxDecoration(
      color: const Color(0xFFF9FAFB),
      borderRadius: BorderRadius.circular(13),
      border: Border.all(color: const Color(0xFFF3F4F6)),
    ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
        Container(
          width: 28, height: 28,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Icon(icon, size: 14, color: const Color(0xFF6B7280)),
        ),
        const SizedBox(width: 9),
          Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(
                      color: Color(0xFFADB5BD),
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3)),
              const SizedBox(height: 2),
              Text(value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: valueColor ?? const Color(0xFF111827),
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700)),
            ],
          ),
          ),
        ],
      ),
    );
  }

class _SheetBtn extends StatelessWidget {
  const _SheetBtn({
    required this.icon,
    required this.label,
    required this.bg,
    required this.fg,
    required this.onTap,
    this.full = false,
  });
  final IconData icon;
  final String label;
  final Color bg, fg;
  final VoidCallback onTap;
  final bool full;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: full ? double.infinity : null,
      padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(13),
      ),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, size: 16, color: fg),
        const SizedBox(width: 7),
        Text(label,
            style: TextStyle(
                color: fg,
                fontSize: 13.5,
                fontWeight: FontWeight.w700)),
      ]),
    ),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STATUS DIALOG
// ═════════════════════════════════════════════════════════════════════════════
class _StatusDialog extends StatefulWidget {
  const _StatusDialog({required this.initial, required this.onChanged});
  final String initial;
  final ValueChanged<String> onChanged;
  @override
  State<_StatusDialog> createState() => _StatusDialogState();
}

class _StatusDialogState extends State<_StatusDialog> {
  late String _val;
  @override
  void initState() { super.initState(); _val = widget.initial; }
  @override
  Widget build(BuildContext context) => AlertDialog(
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    title: const Text('Change Status', style: TextStyle(fontWeight: FontWeight.w800)),
        content: DropdownButtonFormField<String>(
      initialValue: _val,
      decoration: const InputDecoration(border: OutlineInputBorder()),
      items: _kFilters.map((s) => DropdownMenuItem(value: s, child: Text(_sl(s)))).toList(),
      onChanged: (v) { if (v != null) { setState(() => _val = v); widget.onChanged(v); } },
    ),
        actions: [
      TextButton(onPressed: () => Navigator.pop(context),
        child: const Text('Cancel', style: TextStyle(color: Color(0xFF9CA3AF)))),
      FilledButton(
        style: FilledButton.styleFrom(backgroundColor: _forest,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
        onPressed: () => Navigator.pop(context, _val),
        child: const Text('Save'),
      ),
    ],
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DELETE DIALOG
// ═════════════════════════════════════════════════════════════════════════════
class _DeleteDialog extends StatelessWidget {
  const _DeleteDialog({required this.name});
  final String name;
  @override
  Widget build(BuildContext context) => AlertDialog(
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    title: Row(children: [
      Container(
        width: 36, height: 36,
        decoration: const BoxDecoration(color: Color(0xFFFFF1F2), shape: BoxShape.circle),
        child: const Icon(Icons.delete_outline_rounded, color: Color(0xFFF43F5E), size: 19)),
      const SizedBox(width: 10),
      const Text('Delete?', style: TextStyle(fontWeight: FontWeight.w800)),
    ]),
    content: RichText(text: TextSpan(
      style: const TextStyle(color: Color(0xFF6B7280), fontSize: 14, height: 1.55),
      children: [
        const TextSpan(text: 'This will permanently delete the appointment for '),
        TextSpan(text: name, style: const TextStyle(
          fontWeight: FontWeight.w800, color: _ink)),
        const TextSpan(text: '. This action cannot be undone.'),
      ],
    )),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context, false),
        child: const Text('Cancel', style: TextStyle(color: Color(0xFF9CA3AF)))),
      FilledButton(
        style: FilledButton.styleFrom(backgroundColor: const Color(0xFFF43F5E),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
        onPressed: () => Navigator.pop(context, true),
        child: const Text('Delete'),
      ),
    ],
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAY DIALOG
// ═════════════════════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════
// PAY SHEET — bottom-sheet payment modal for existing appointments
// ═════════════════════════════════════════════════════════════════════════════
class _PayResult {
  const _PayResult({
    required this.amount,
    required this.method,
    required this.serviceIds,
    required this.subtotal,
    this.discountId = '',
  });
  /// Net collected (after promo).
  final String amount;
  final String method;
  final List<String> serviceIds;
  /// Gross before promo.
  final String subtotal;
  final String discountId;
}

class _PaySheet extends StatefulWidget {
  const _PaySheet({
    required this.appointment,
    required this.services,
    required this.preSelected,
    required this.initialAmount,
    this.discounts = const [],
  });
  final Appointment appointment;
  final List<SalonService> services;
  final List<int> preSelected;
  final String initialAmount;
  final List<Map<String, dynamic>> discounts;

  @override
  State<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<_PaySheet> {
  static const _pGreen  = Color(0xFF059669);
  static const _pDark   = Color(0xFF047857);
  static const _pGreenL = Color(0xFFECFDF5);
  static const _pGreenB = Color(0xFFA7F3D0);
  static const _pBg     = Color(0xFFF9FAFB);
  static const _pBorder = Color(0xFFE5E7EB);

  static const _methods = [
    'Cash', 'Card', 'Online Transfer', 'Loyalty Points', 'Package',
  ];
  static const _methodIcons = <String, IconData>{
    'Cash':            Icons.payments_rounded,
    'Card':            Icons.credit_card_rounded,
    'Online Transfer': Icons.account_balance_rounded,
    'Loyalty Points':  Icons.stars_rounded,
    'Package':         Icons.card_giftcard_rounded,
  };

  late final List<int> _sel;
  late final TextEditingController _amtCtrl;
  String _method = 'Cash';
  String _calcTotal = '';
  String _discountId = '';

  @override
  void initState() {
    super.initState();
    _sel = List<int>.from(widget.preSelected);
    _calcTotal = widget.initialAmount;
    _amtCtrl = TextEditingController(text: widget.initialAmount);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _recalc();
    });
  }

  @override
  void dispose() {
    _amtCtrl.dispose();
    super.dispose();
  }

  double _grossFromSelection() {
    var sum = 0.0;
    for (final x in _sel) {
      for (final sv in widget.services) {
        if (int.tryParse(sv.id) == x) sum += sv.price;
      }
    }
    return sum;
  }

  double _computedPromo() {
    if (_discountId.isEmpty) return 0;
    Map<String, dynamic>? d;
    for (final raw in widget.discounts) {
      if ('${raw['id']}' == _discountId) {
        d = raw;
        break;
      }
    }
    if (d == null) return 0;
    final total = _grossFromSelection();
    final minBill = double.tryParse('${d['min_bill'] ?? 0}') ?? 0;
    if (total < minBill) return 0;
    final type = '${d['discount_type'] ?? 'percent'}';
    if (type == 'fixed') {
      final v = double.tryParse('${d['value']}') ?? 0;
      return v.clamp(0, total);
    }
    final pct = (double.tryParse('${d['value']}') ?? 0).clamp(0, 100);
    var off = total * pct / 100;
    final cap = d['max_discount_amount'];
    if (cap != null && '$cap'.trim().isNotEmpty) {
      final c = double.tryParse('$cap');
      if (c != null) off = off.clamp(0, c);
    }
    return (off * 100).round() / 100;
  }

  void _recalc() {
    final sum = _grossFromSelection();
    final val = sum > 0 ? sum.toStringAsFixed(0) : '';
    final promo = _computedPromo();
    final net = (sum - promo).clamp(0, double.infinity);
    setState(() {
      _calcTotal = val;
      if (val.isNotEmpty) {
        _amtCtrl.text = net > 0 ? net.toStringAsFixed(0) : '';
      } else {
        _amtCtrl.text = '';
      }
    });
  }

  void _confirm() {
    if (_sel.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one service')),
      );
      return;
    }
    final paid = double.tryParse(_amtCtrl.text.trim()) ?? 0;
    if (paid <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid amount')),
      );
      return;
    }
    final gross = _grossFromSelection();
    Navigator.of(context).pop(_PayResult(
      amount: _amtCtrl.text.trim(),
      method: _method,
      serviceIds: _sel.map((e) => e.toString()).toList(),
      subtotal: gross > 0 ? gross.toStringAsFixed(0) : _calcTotal,
      discountId: _discountId,
    ));
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text,
      style: const TextStyle(
        color: Color(0xFF6B7280),
        fontSize: 11.5,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5)),
  );

  InputDecoration _deco(String hint, IconData icon) => InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
    prefixIcon: Icon(icon, color: _pGreen, size: 19),
    filled: true,
    fillColor: _pBg,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: _pBorder)),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: _pBorder)),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: _pGreen, width: 1.8)),
  );

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final activeServices = widget.services.where((s) => s.isActive).toList();
    final name = widget.appointment.customerName;
    final initials = name.trim().isNotEmpty
        ? name.trim().split(' ').map((e) => e.isNotEmpty ? e[0].toUpperCase() : '').take(2).join()
        : '?';

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, bottom + 28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [

            // ── Drag handle ────────────────────────────────────────────
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 12, bottom: 18),
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFE5E7EB),
                  borderRadius: BorderRadius.circular(99)),
              ),
            ),

            // ── Title row ──────────────────────────────────────────────
            Row(children: [
              Container(
                width: 38, height: 38,
                decoration: BoxDecoration(
                  color: _pGreenL,
                  borderRadius: BorderRadius.circular(11),
                  border: Border.all(color: _pGreenB),
                ),
                child: const Icon(Icons.payments_rounded,
                    color: _pGreen, size: 18),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Collect Payment',
                      style: TextStyle(
                        color: Color(0xFF111827),
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.2)),
                    Text('Record payment for appointment',
                      style: TextStyle(
                        color: Color(0xFFADB5BD),
                        fontSize: 12,
                        fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: Container(
                  width: 32, height: 32,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.close_rounded,
                      size: 16, color: Color(0xFF6B7280)),
                ),
              ),
            ]),

            const SizedBox(height: 16),

            // ── Customer info card ─────────────────────────────────────
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: _pGreenL,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: _pGreenB),
              ),
              child: Row(children: [
                Container(
                  width: 44, height: 44,
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [_pDark, _pGreen],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(initials,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                        style: const TextStyle(
                          color: Color(0xFF111827),
                          fontSize: 14,
                          fontWeight: FontWeight.w800)),
                      if (widget.appointment.phone.isNotEmpty)
                        Text(widget.appointment.phone,
                          style: const TextStyle(
                            color: Color(0xFF6B7280), fontSize: 12)),
                      Text(
                        '${widget.appointment.date}  ${widget.appointment.time}',
                        style: const TextStyle(
                          color: Color(0xFF9CA3AF), fontSize: 11.5)),
                    ],
                  ),
                ),
                if (_calcTotal.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: _pGreen,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text('LKR $_calcTotal',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w800)),
                  ),
              ]),
            ),

            const SizedBox(height: 16),

            // ── Services ───────────────────────────────────────────────
            _label('SERVICES'),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: activeServices.map((s) {
                      final id = int.tryParse(s.id);
                      if (id == null) return const SizedBox.shrink();
                final on = _sel.contains(id);
                return GestureDetector(
                  onTap: () {
                    if (on) {
                      _sel.remove(id);
                    } else {
                      _sel.add(id);
                    }
                    _recalc();
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 140),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 11, vertical: 7),
                    decoration: BoxDecoration(
                      color: on ? _pGreenL : _pBg,
                      borderRadius: BorderRadius.circular(9),
                      border: Border.all(
                          color: on ? _pGreen : _pBorder,
                          width: on ? 1.5 : 1),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      if (on)
                        const Padding(
                          padding: EdgeInsets.only(right: 5),
                          child: Icon(Icons.check_circle_rounded,
                              size: 13, color: _pGreen),
                        ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s.name,
                            style: TextStyle(
                              color: on ? _pGreen : const Color(0xFF374151),
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700)),
                          Text('LKR ${s.price.toStringAsFixed(0)}',
                            style: TextStyle(
                              color: on
                                  ? _pGreen.withValues(alpha: 0.70)
                                  : const Color(0xFFADB5BD),
                              fontSize: 10.5,
                              fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ]),
                  ),
                );
                    }).toList(),
            ),

            if (widget.discounts.isNotEmpty) ...[
              const SizedBox(height: 14),
              _label('PROMO DISCOUNT'),
              DropdownButtonFormField<String>(
                value: _discountId.isEmpty
                    ? ''
                    : widget.discounts.any((d) => '${d['id']}' == _discountId)
                        ? _discountId
                        : '',
                isExpanded: true,
                decoration: _deco('Select promo (optional)', Icons.local_offer_rounded),
                items: [
                  const DropdownMenuItem(value: '', child: Text('None')),
                  ...widget.discounts.map((d) => DropdownMenuItem(
                        value: '${d['id']}',
                        child: Text(
                          '${d['name'] ?? ''} (${d['discount_type'] == 'fixed' ? 'Rs. ${d['value']}' : '${d['value']}% off'})',
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13),
                        ),
                      )),
                ],
                onChanged: (v) {
                  setState(() => _discountId = v ?? '');
                  _recalc();
                },
              ),
            ],

            const SizedBox(height: 14),

            // ── Amount row ─────────────────────────────────────────────
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _label('TOTAL (LKR)'),
                    Container(
                      height: 50,
                      decoration: BoxDecoration(
                        color: _pGreenL,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _pGreenB),
                      ),
                      child: Center(
                        child: Text(
                          _calcTotal.isNotEmpty ? _calcTotal : '—',
                          style: TextStyle(
                            color: _calcTotal.isNotEmpty
                                ? _pGreen
                                : const Color(0xFFADB5BD),
                            fontSize: 16,
                            fontWeight: FontWeight.w800)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _label('PAID (LKR)'),
                  TextField(
                      controller: _amtCtrl,
                    keyboardType: TextInputType.number,
                      decoration: _deco('After promo', Icons.edit_rounded),
                    ),
                  ],
                ),
              ),
            ]),

            const SizedBox(height: 14),

            // ── Payment method ─────────────────────────────────────────
            _label('PAYMENT METHOD'),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: _methods.map((m) {
                final sel = _method == m;
                return GestureDetector(
                  onTap: () => setState(() => _method = m),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 130),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: sel ? _pGreenL : _pBg,
                      borderRadius: BorderRadius.circular(9),
                      border: Border.all(
                          color: sel ? _pGreen : _pBorder,
                          width: sel ? 1.5 : 1),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(
                        _methodIcons[m] ?? Icons.payments_rounded,
                        size: 14,
                        color: sel ? _pGreen : const Color(0xFF9CA3AF),
                      ),
                      const SizedBox(width: 6),
                      Text(m,
                        style: TextStyle(
                          color: sel ? _pGreen : const Color(0xFF6B7280),
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700)),
                    ]),
                  ),
                );
              }).toList(),
            ),

            const SizedBox(height: 22),

            // ── Confirm button ─────────────────────────────────────────
            GestureDetector(
              onTap: _confirm,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 15),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [_pDark, _pGreen],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: _pGreen.withValues(alpha: 0.30),
                      blurRadius: 14,
                      offset: const Offset(0, 5)),
                  ],
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.check_circle_rounded,
                        color: Colors.white, size: 18),
                    SizedBox(width: 9),
                    Text('Confirm Payment',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2)),
                  ],
                ),
              ),
            ),

          ],
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// EDITOR DIALOG
// ═════════════════════════════════════════════════════════════════════════════
class _EditorDialog extends StatefulWidget {
  const _EditorDialog({
    required this.isEdit, required this.initial,
    required this.services, required this.branches, required this.staffList,
    required this.isSuperAdmin, required this.fixedBranchId, required this.filterBranchId,
  });
  final bool isEdit;
  final Appointment? initial;
  final List<SalonService> services;
  final List<Map<String, String>> branches;
  final List<StaffMember> staffList;
  final bool isSuperAdmin;
  final String fixedBranchId, filterBranchId;
  @override
  State<_EditorDialog> createState() => _EditorState();
}

class _EditorState extends State<_EditorDialog> {
  final _fk   = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _date = TextEditingController();
  final _time = TextEditingController();
  final _amt  = TextEditingController();
  final _note = TextEditingController();

  String _custId  = '';
  String _branchId = '';
  String _staffId  = '';
  String _status   = 'pending';
  final List<String> _sids = [];

  @override
  void initState() {
    super.initState();
    final a = widget.initial;
    if (a != null) {
      _name.text  = a.customerName; _custId = a.customerId;
      _phone.text = a.phone;
      _date.text  = a.date.length >= 10 ? a.date.substring(0,10) : a.date;
      _time.text  = a.time;
      _amt.text   = a.displayAmount > 0 ? a.displayAmount.toStringAsFixed(0) : '';
      _note.text  = AppointmentNotes.stripAdditionalServicesLine(a.notes);
      _branchId   = a.branchId; _staffId = a.staffId;
      _status     = _kForms.contains(a.status) ? a.status : 'pending';
      _initSids(a);
    } else {
      final d = DateTime.now();
      _date.text  = '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';
      _branchId   = widget.isSuperAdmin
          ? (widget.filterBranchId.isNotEmpty ? widget.filterBranchId : widget.fixedBranchId)
          : widget.fixedBranchId;
    }
  }

  void _initSids(Appointment a) {
    if (a.serviceId.isNotEmpty) _sids.add(a.serviceId);
    for (final name in AppointmentNotes.parseAdditionalServiceNames(a.notes)) {
      for (final s in widget.services) {
        if (s.name == name && !_sids.contains(s.id)) _sids.add(s.id);
      }
    }
  }

  @override
  void dispose() {
    _name.dispose(); _phone.dispose(); _date.dispose();
    _time.dispose(); _amt.dispose(); _note.dispose();
    super.dispose();
  }

  double get _total {
    var t = 0.0;
    for (final id in _sids) {
      for (final s in widget.services) { if (s.id == id) t += s.price; }
    }
    return t;
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(context: context,
      firstDate: DateTime(2020), lastDate: DateTime(2035),
      initialDate: DateTime.tryParse(_date.text) ?? DateTime.now());
    if (d != null) {
      setState(() => _date.text =
        '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}');
    }
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.now());
    if (t != null) {
      setState(() => _time.text =
        '${t.hour.toString().padLeft(2,'0')}:${t.minute.toString().padLeft(2,'0')}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final active = widget.services.where((s) => s.isActive).toList();
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text(widget.isEdit ? 'Edit Appointment' : 'New Appointment',
        style: const TextStyle(fontWeight: FontWeight.w800)),
      content: Form(key: _fk, child: SingleChildScrollView(child: Column(
        mainAxisSize: MainAxisSize.min, children: [
          TextFormField(controller: _name,
            decoration: const InputDecoration(labelText: 'Customer name', border: OutlineInputBorder()),
            onChanged: (v) => _custId = '',
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null),
              const SizedBox(height: 8),
          TextFormField(controller: _phone,
            decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder())),
              if (widget.isSuperAdmin) ...[
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _branchId.isEmpty ? null : _branchId,
                  decoration: const InputDecoration(labelText: 'Branch', border: OutlineInputBorder()),
              items: widget.branches.map((b) =>
                DropdownMenuItem(value: b['id'], child: Text(b['name'] ?? ''))).toList(),
                  onChanged: (v) => setState(() => _branchId = v ?? ''),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null),
          ],
              const SizedBox(height: 8),
          Align(alignment: Alignment.centerLeft,
            child: Text('Services', style: Theme.of(context).textTheme.titleSmall)),
              const SizedBox(height: 4),
              ...active.map((s) {
            final on = _sids.contains(s.id);
                return CheckboxListTile(
              dense: true, value: on,
                  title: Text('${s.name} (Rs. ${s.price.toStringAsFixed(0)})'),
                  onChanged: (v) {
                    setState(() {
                  if (v == true) { if (!_sids.contains(s.id)) { _sids.add(s.id); } }
                  else { _sids.remove(s.id); }
                  final t = _total;
                  _amt.text = t > 0 ? t.toStringAsFixed(0) : '';
                    });
                  },
                );
              }),
              DropdownButtonFormField<String>(
                initialValue: _staffId.isEmpty ? null : _staffId,
            decoration: const InputDecoration(
              labelText: 'Staff (optional)', border: OutlineInputBorder()),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Any')),
                  ...widget.staffList.map((s) => DropdownMenuItem(value: s.id, child: Text(s.name))),
            ],
            onChanged: (v) => setState(() => _staffId = v ?? '')),
              const SizedBox(height: 8),
          TextFormField(controller: _date, readOnly: true, onTap: _pickDate,
                decoration: const InputDecoration(labelText: 'Date', border: OutlineInputBorder()),
            validator: (v) => v == null || v.isEmpty ? 'Required' : null),
              const SizedBox(height: 8),
          TextFormField(controller: _time, readOnly: true, onTap: _pickTime,
                decoration: const InputDecoration(labelText: 'Time', border: OutlineInputBorder()),
            validator: (v) => v == null || v.isEmpty ? 'Required' : null),
              const SizedBox(height: 8),
          TextFormField(controller: _amt, keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Amount (Rs.)', border: OutlineInputBorder())),
              if (widget.isEdit) ...[
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _status,
                  decoration: const InputDecoration(labelText: 'Status', border: OutlineInputBorder()),
              items: _kForms.map((s) => DropdownMenuItem(value: s, child: Text(_sl(s)))).toList(),
              onChanged: (v) => setState(() => _status = v ?? _status)),
          ],
              const SizedBox(height: 8),
          TextFormField(controller: _note, maxLines: 2,
            decoration: const InputDecoration(labelText: 'Notes', border: OutlineInputBorder())),
        ],
      ))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel', style: TextStyle(color: Color(0xFF9CA3AF)))),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: _forest,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
          onPressed: () async {
            if (!_fk.currentState!.validate()) return;
            if (_sids.isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Select at least one service')));
              return;
            }
            final app    = AppStateScope.of(context);
            final branch = widget.isSuperAdmin ? _branchId
                : (widget.initial?.branchId.isNotEmpty == true
                    ? widget.initial!.branchId : widget.fixedBranchId);
            final ok = await app.saveAppointment(
              appointmentId:    widget.isEdit ? widget.initial!.id : null,
              branchId:         branch,
              customerName:     _name.text.trim(),
              phone:            _phone.text.trim(),
              customerId:       _custId,
              orderedServiceIds: List<String>.from(_sids),
              date:             _date.text.trim(),
              time:             _time.text.trim(),
              staffId:          _staffId,
              baseNotes:        _note.text,
              status:           widget.isEdit ? _status : '',
              amountOverride:   _amt.text.trim(),
            );
            if (!context.mounted) return;
            if (!ok) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(app.lastError ?? 'Save failed')));
              return;
            }
            Navigator.pop(context, true);
          },
          child: Text(widget.isEdit ? 'Save Changes' : 'Create'),
        ),
      ],
    );
  }
}
