import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../models/walkin_entry.dart';
import '../services/walkin_queue_cache.dart';
import '../services/walkin_queue_socket.dart';
import '../state/app_state.dart';
import '../utils/appointment_notes.dart';
import 'add_walkin_modal.dart';
import 'add_walkin_payment_modal.dart';
import 'edit_walkin_modal.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest  = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas  = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border  = Color(0xFFE5E7EB);
const Color _ink     = Color(0xFF111827);
const Color _muted   = Color(0xFF6B7280);

// ── Status metadata ───────────────────────────────────────────────────────────
class _SM {
  const _SM(this.label, this.fg, this.bg);
  final String label;
  final Color fg, bg;
}

_SM _sm(String s) {
  switch (s) {
    case 'serving':   return const _SM('In Service', Color(0xFF1E40AF), Color(0xFFDBEAFE));
    case 'completed': return const _SM('Completed',  Color(0xFF14532D), Color(0xFFDCFCE7));
    case 'cancelled': return const _SM('Cancelled',  Color(0xFF7F1D1D), Color(0xFFFFE4E6));
    default:          return const _SM('Waiting',    Color(0xFF78350F), Color(0xFFFEF9C3));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class WalkInPage extends StatefulWidget {
  const WalkInPage({super.key});
  @override
  State<WalkInPage> createState() => _WalkInPageState();
}

List<WalkInEntry> _sortedWalkIns(List<WalkInEntry> raw) {
  final list = List<WalkInEntry>.from(raw);
  WalkInEntry.sortNewestFirst(list);
  return list;
}

class _WalkInPageState extends State<WalkInPage> {
  Future<void>? _future;
  bool _fromCache = false;
  List<WalkInEntry>         _walkIns   = const [];
  List<SalonService>        _services  = const [];
  List<Map<String, String>> _branches  = const [];
  List<StaffMember>         _staffList = const [];
  WalkInQueueSocket? _queueSocket;
  String? _activeBranchId;

  @override
  void dispose() {
    _queueSocket?.disconnect();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  Future<void> _load() async {
    final app = AppStateScope.of(context);
    final uid = app.currentUser?.branchId;
    final services = await app.loadServices();
    final List<Map<String, String>> branches;
    if (uid != null && uid.isNotEmpty) {
      await app.loadBranches();
      final match =
          app.branches.where((b) => b['id'] == uid).toList(growable: false);
      branches = match.isNotEmpty
          ? [match.first]
          : [
              {'id': uid, 'name': 'My Branch'},
            ];
    } else {
      branches = await app.loadBranches();
    }

    if (branches.isEmpty) {
      if (!mounted) return;
      _queueSocket?.disconnect();
      _activeBranchId = null;
      setState(() {
        _services = services;
        _branches = [];
        _walkIns = [];
        _fromCache = false;
      });
      return;
    }
    final branchId = uid ?? branches.first['id'] ?? '';
    List<WalkInEntry> queue;
    var fromCache = false;
    try {
      queue = await app.loadWalkIns(branchId: branchId);
      await WalkInQueueCache.save(branchId, queue);
    } catch (_) {
      final cached = await WalkInQueueCache.load(branchId);
      if (cached == null) rethrow;
      queue = cached;
      fromCache = true;
    }
    if (!mounted) return;
    _activeBranchId = branchId;
    setState(() {
      _services = services;
      _branches = branches;
      _walkIns = _sortedWalkIns(queue);
      _fromCache = fromCache;
    });
    _bindQueueSocket(branchId);
  }

  void _bindQueueSocket(String branchId) {
    final app = AppStateScope.of(context);
    final token = app.currentUser?.authToken;
    if (token == null || token.isEmpty || branchId.isEmpty) return;
    _queueSocket ??= WalkInQueueSocket();
    _queueSocket!.connect(
      apiBaseUrl: app.apiBaseUrl,
      token: token,
      branchId: branchId,
      onQueueUpdated: () {
        if (!mounted) return;
        _silentReloadQueue();
      },
    );
  }

  Future<void> _silentReloadQueue() async {
    final bid = _activeBranchId;
    if (bid == null || bid.isEmpty || !mounted) return;
    final app = AppStateScope.of(context);
    try {
      final queue = await app.loadWalkIns(branchId: bid);
      await WalkInQueueCache.save(bid, queue);
      if (!mounted) return;
      setState(() {
        _walkIns = _sortedWalkIns(queue);
        _fromCache = false;
      });
    } catch (_) {
      /* keep current list */
    }
  }

  void _refresh() {
    setState(() {
      _future = _load();
    });
  }

  Future<void> _openAdd() async {
    final app = AppStateScope.of(context);
    var branches = _branches;
    final uid = app.currentUser?.branchId;
    if (branches.isEmpty) {
      try {
        branches = (uid == null || uid.isEmpty)
            ? await app.loadBranches()
            : [{'id': uid, 'name': 'My Branch'}];
      } catch (_) {}
    }
    if (!mounted) return;
    if (branches.isEmpty) { _toast(app.lastError ?? 'No branches available'); return; }
    setState(() => _branches = branches);

    // Load customers from cache or fetch if empty
    var customers = app.customers;
    if (customers.isEmpty) {
      try { customers = await app.loadCustomers(); } catch (_) {}
    }
    if (!mounted) return;

    final payload = await AddWalkInModal.show(
      context,
      branches: branches,
      services: _services,
      customers: customers,
      initialBranchId: uid,
      onRegisterNewCustomer: (name, phone, branchId) =>
          AppStateScope.of(context).registerCustomer(
            name: name,
            phone: phone,
            branchId: branchId,
          ),
    );
    if (payload == null || !mounted) return;

    final created = await app.addWalkIn(
      branchId:     payload.branchId,
      customerName: payload.customerName,
      serviceId:    payload.serviceId,
      serviceIds:   payload.serviceIds,
      phone:        payload.phone,
      note:         payload.note,
    );
    if (!mounted) return;
    if (created == null) {
      _toast(app.lastError ?? 'Failed to add walk-in');
      return;
    }
    setState(() {
      _walkIns = _sortedWalkIns([
        created,
        ..._walkIns.where((w) => w.id != created.id),
      ]);
    });
    await WalkInQueueCache.save(payload.branchId, _walkIns);
    _refresh();
  }

  Future<void> _editWalkIn(WalkInEntry e) async {
    final app = AppStateScope.of(context);
    var customers = app.customers;
    if (customers.isEmpty) {
      try {
        customers = await app.loadCustomers();
      } catch (_) {}
    }
    if (!mounted) return;
    final payload = await EditWalkInModal.show(
      context,
      entry: e,
      branches: _branches,
      services: _services,
      customers: customers,
    );
    if (payload == null || !mounted) return;
    final updated = await app.updateWalkInEntry(
      walkInId: e.id,
      customerName: payload.customerName,
      serviceId: payload.serviceId,
      serviceIds: payload.serviceIds,
      phone: payload.phone,
      note: payload.note,
    );
    if (!mounted) return;
    if (updated == null) {
      _toast(app.lastError ?? 'Update failed');
      return;
    }
    setState(() {
      _walkIns = _sortedWalkIns([
        for (final w in _walkIns)
          if (w.id == updated.id) updated else w,
      ]);
    });
    await WalkInQueueCache.save(e.branchId, _walkIns);
    _toast('Walk-in updated');
  }

  Future<void> _cancelWalkIn(WalkInEntry e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel walk-in?'),
        content: Text(
          e.customerName.trim().isNotEmpty
              ? 'This will mark ${e.customerName.trim()} as cancelled.'
              : 'This walk-in will be marked as cancelled.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('No'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFDC2626),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Yes, cancel'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    final app = AppStateScope.of(context);
    final success = await app.updateWalkInStatus(
      walkInId: e.id,
      status: 'cancelled',
    );
    if (!mounted) return;
    if (!success) {
      _toast(app.lastError ?? 'Could not cancel');
      return;
    }
    _toast('Walk-in cancelled');
    _refresh();
  }

  Future<void> _assignStaff(WalkInEntry e) async {
    final app = AppStateScope.of(context);

    // Reuse cached staff or fetch
    var staff = _staffList;
    if (staff.isEmpty) {
      try {
        final uid = app.currentUser?.branchId;
        staff = await app.loadStaffList(
            branchId: uid?.isNotEmpty == true ? uid : null);
        if (mounted) setState(() => _staffList = staff);
      } catch (_) {}
    }
    if (!mounted) return;
    if (staff.isEmpty) { _toast('No staff available'); return; }

    final picked = await showModalBottomSheet<StaffMember>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _StaffPickerSheet(staffList: staff),
    );
    if (picked == null || !mounted) return;

    final ok = await app.assignWalkInStaff(
        walkInId: e.id, staffId: picked.id);
    if (!mounted) return;
    if (!ok) { _toast(app.lastError ?? 'Failed to assign staff'); return; }
    _toast('${picked.name} assigned');
    _refresh();
  }

  Future<void> _collectPayment(WalkInEntry e) async {
    final app = AppStateScope.of(context);
    final svc = _services.firstWhere(
      (s) => s.id == e.serviceId,
      orElse: () => SalonService(
        id: e.serviceId, name: e.serviceName,
        category: 'Other', price: 0, durationMinutes: 30),
    );
    final initialPay = e.totalAmount > 0
        ? e.totalAmount.toStringAsFixed(0)
        : (svc.price > 0 ? svc.price.toStringAsFixed(0) : '');
    final preIds = e.orderedServiceIds;
    final selectedForModal = preIds.isNotEmpty
        ? preIds
        : (e.serviceId.isNotEmpty ? [e.serviceId] : <String>[]);
    final bid = e.branchId.trim().isNotEmpty
        ? e.branchId
        : (app.currentUser?.branchId ?? '');
    final discounts = bid.isNotEmpty
        ? await app.loadDiscountsForPayment(bid)
        : const <Map<String, dynamic>>[];
    if (!mounted) return;

    final payload = await AddWalkInPaymentModal.show(
      context,
      customerName: e.customerName,
      serviceName: e.serviceName,
      initialAmount: initialPay,
      services: _services,
      selectedServiceIds: selectedForModal,
      discounts: discounts,
    );
    if (payload == null || !mounted) return;

    final payIds = payload.serviceIds;
    final ok = await app.addManualPayment(
      branchId:       e.branchId,
      serviceId:      payIds.isNotEmpty ? payIds.first : e.serviceId,
      serviceIds:     payIds.length > 1 ? payIds : null,
      staffId:        e.staffId.isEmpty ? null : e.staffId,
      customerName:   e.customerName,
      phone:          e.phone.trim().isEmpty ? null : e.phone.trim(),
      totalAmount:    payload.subtotal,
      loyaltyDiscount: payload.loyaltyDiscount,
      promoDiscount:   payload.promoDiscount,
      method:         payload.method,
      paidAmount:     payload.amount,
      discountId:
          payload.discountId.isNotEmpty ? payload.discountId : null,
    );
    if (!mounted) return;
    if (!ok) { _toast(app.lastError ?? 'Payment failed'); return; }

    // Persist services/total on walk-in row (DB + queue) so list matches payment.
    final orderedIds = payIds.isNotEmpty
        ? payIds
        : (e.serviceId.isNotEmpty ? [e.serviceId] : <String>[]);
    if (orderedIds.isNotEmpty) {
      final extraNames = orderedIds.length <= 1
          ? <String>[]
          : orderedIds
              .skip(1)
              .map((sid) {
                for (final s in _services) {
                  if (s.id == sid) return s.name;
                }
                return '';
              })
              .where((n) => n.trim().isNotEmpty)
              .toList();
      final noteSync = AppointmentNotes.combineNotes(e.note, extraNames);
      final synced = await app.updateWalkInEntry(
        walkInId: e.id,
        customerName: e.customerName,
        serviceId: orderedIds.first,
        serviceIds: orderedIds,
        phone: e.phone,
        note: noteSync,
      );
      if (!mounted) return;
      if (synced == null) {
        _toast(app.lastError ?? 'Payment recorded; walk-in could not sync');
      }
    }

    await app.updateWalkInStatus(walkInId: e.id, status: 'completed');
    if (!mounted) return;
    _toast('Payment recorded');
    _refresh();
  }

  void _toast(String msg) => ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(msg),
      behavior: SnackBarBehavior.floating,
      backgroundColor: _forest,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
  );

  // ── Counters ───────────────────────────────────────────────────────────────
  int get _waiting   => _walkIns.where((w) => w.status == 'waiting').length;
  int get _serving   => _walkIns.where((w) => w.status == 'serving').length;
  int get _completed => _walkIns.where((w) => w.status == 'completed').length;

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: _canvas,
        body: FutureBuilder<void>(
          future: _future,
          builder: (ctx, snap) {
            final loading = snap.connectionState != ConnectionState.done;
            if (loading) return _buildLoading();
            if (snap.hasError) return _buildError();
            return _buildBody();
          },
        ),
        floatingActionButton: Padding(
          padding: const EdgeInsets.only(bottom: 16, right: 4),
          child: GestureDetector(
            onTap: _openAdd,
            child: Container(
              height: 52,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [BoxShadow(
                  color: _forest.withValues(alpha: 0.35),
                  blurRadius: 16, offset: const Offset(0, 6))],
              ),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.person_add_rounded, color: Colors.white, size: 18),
                SizedBox(width: 8),
                Text('Add Walk-in',
                  style: TextStyle(color: Colors.white, fontSize: 14,
                      fontWeight: FontWeight.w800, letterSpacing: 0.1)),
              ]),
            ),
          ),
        ),
        floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      ),
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  Widget _buildLoading() => Column(children: [
    _buildHeader(loading: true),
    const Expanded(child: Center(
      child: CircularProgressIndicator(color: _forest, strokeWidth: 2.5))),
  ]);

  // ── Error ──────────────────────────────────────────────────────────────────
  Widget _buildError() => Column(children: [
    _buildHeader(loading: false),
    Expanded(child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 60, height: 60,
        decoration: BoxDecoration(
          color: const Color(0xFFFEF2F2),
          borderRadius: BorderRadius.circular(16)),
        child: const Icon(Icons.wifi_off_rounded,
            color: Color(0xFFDC2626), size: 26),
      ),
      const SizedBox(height: 14),
      const Text('Failed to load queue',
        style: TextStyle(color: _ink, fontWeight: FontWeight.w700, fontSize: 15)),
      const SizedBox(height: 6),
      GestureDetector(
        onTap: _refresh,
        child: const Text('Tap to retry',
          style: TextStyle(color: _emerald, fontSize: 13,
              fontWeight: FontWeight.w600)),
      ),
    ]))),
  ]);

  // ── Body ──────────────────────────────────────────────────────────────────
  Widget _buildBody() => Column(children: [
    _buildHeader(loading: false),
    Expanded(
      child: _walkIns.isEmpty
          ? RefreshIndicator(
              color: _forest,
              onRefresh: () async => _refresh(),
              child: LayoutBuilder(
                builder: (ctx, constraints) => SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: constraints.maxHeight),
                    child: _buildEmpty(),
                  ),
                ),
              ),
            )
          : RefreshIndicator(
              color: _forest,
              onRefresh: () async => _refresh(),
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
            itemCount: _walkIns.length,
                itemBuilder: (ctx, i) => _WalkInCard(
                  entry: _walkIns[i],
                  onEdit:    () => _editWalkIn(_walkIns[i]),
                  onPayment: () => _collectPayment(_walkIns[i]),
                  onAssign:  () => _assignStaff(_walkIns[i]),
                  onCancel:  () => _cancelWalkIn(_walkIns[i]),
                ),
              ),
            ),
    ),
  ]);

  // ── Empty ──────────────────────────────────────────────────────────────────
  Widget _buildEmpty() => Center(child: Padding(
    padding: const EdgeInsets.fromLTRB(24, 48, 24, 88),
    child: Column(mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 72, height: 72,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [_forest.withValues(alpha: 0.12),
                       _emerald.withValues(alpha: 0.06)],
              begin: Alignment.topLeft, end: Alignment.bottomRight),
            shape: BoxShape.circle),
          child: const Icon(Icons.directions_walk_rounded,
              color: _forest, size: 32),
        ),
        const SizedBox(height: 16),
        const Text('Queue is empty',
          style: TextStyle(color: _ink, fontSize: 16,
              fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(
          _fromCache
              ? 'Saved copy — connect to refresh. Tap + when online to add.'
              : 'Tap + to add a walk-in customer',
          textAlign: TextAlign.center,
          style: const TextStyle(color: _muted, fontSize: 13)),
      ],
    ),
  ));

  // ── Header ─────────────────────────────────────────────────────────────────
  Widget _buildHeader({required bool loading}) {
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
                  Icon(Icons.directions_walk_rounded,
                      color: _forest, size: 18),
                  SizedBox(width: 6),
                  Text('Walk-in Queue',
                    style: TextStyle(
                      color: _forest, fontSize: 16,
                      fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                ]),
              ),
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
            ]),
          ),

          if (!loading && _fromCache)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF7ED),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFFDBA74)),
                ),
                child: Row(children: [
                  Icon(Icons.cloud_off_rounded,
                      color: Colors.orange.shade800, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Showing saved queue — pull down to refresh',
                      style: TextStyle(
                          color: Colors.orange.shade900,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
                ]),
              ),
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
                // Total
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Total in Queue',
                        style: TextStyle(color: Colors.white70, fontSize: 12,
                            fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      loading
                          ? Container(width: 40, height: 28,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(6)))
                          : Text('${_walkIns.length}',
                              style: const TextStyle(
                                color: Colors.white, fontSize: 28,
                                fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                      const SizedBox(height: 2),
                      const Text('customers today',
                        style: TextStyle(color: Colors.white54, fontSize: 11.5)),
                    ],
                  ),
                ),
                // Status pills
                if (!loading) ...[
                  _StatPill(count: _waiting,   label: 'Waiting',    color: const Color(0xFFFBBF24)),
                  const SizedBox(width: 8),
                  _StatPill(count: _serving,   label: 'In Service', color: const Color(0xFF60A5FA)),
                  const SizedBox(width: 8),
                  _StatPill(count: _completed, label: 'Done',       color: const Color(0xFF34D399)),
                ],
              ]),
            ),
          ),

        ]),
      ),
    );
  }
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
class _StatPill extends StatelessWidget {
  const _StatPill({
    required this.count, required this.label, required this.color});
  final int count;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(children: [
    Container(
      width: 36, height: 36,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        shape: BoxShape.circle),
      child: Center(
        child: Text('$count',
          style: TextStyle(
            color: color, fontSize: 14,
            fontWeight: FontWeight.w900)),
      ),
    ),
    const SizedBox(height: 3),
    Text(label,
      style: TextStyle(
        color: color.withValues(alpha: 0.85),
        fontSize: 9.5, fontWeight: FontWeight.w700)),
  ]);
}

// ═════════════════════════════════════════════════════════════════════════════
// WALK-IN CARD
// ═════════════════════════════════════════════════════════════════════════════
class _WalkInCard extends StatelessWidget {
  const _WalkInCard({
    required this.entry,
    required this.onEdit,
    required this.onPayment,
    required this.onAssign,
    required this.onCancel,
  });
  final WalkInEntry entry;
  final VoidCallback onEdit, onPayment, onAssign, onCancel;

  @override
  Widget build(BuildContext context) {
    final e   = entry;
    final sm  = _sm(e.status);
    final isWaiting   = e.status == 'waiting';
    final isServing   = e.status == 'serving';
    final isDone      = e.status == 'completed' || e.status == 'cancelled';
    final canEdit     = isWaiting || isServing;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _border),
        boxShadow: [BoxShadow(
          color: Colors.black.withValues(alpha: 0.05),
          blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Column(children: [

        // ── Main content ────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 13, 14, 10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [

            // Token bubble
            Container(
              width: 46, height: 46,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [sm.fg, sm.fg.withValues(alpha: 0.70)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(
                  color: sm.fg.withValues(alpha: 0.25),
                  blurRadius: 8, offset: const Offset(0, 3))],
              ),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      e.token.isNotEmpty ? e.token : '—',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        height: 1,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(width: 12),

            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Expanded(
                      child: Text(e.customerName,
                        style: const TextStyle(
                          color: _ink, fontSize: 14.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.1)),
                    ),
                    // Status badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(
                        color: sm.bg,
                        borderRadius: BorderRadius.circular(8)),
                      child: Text(sm.label,
                        style: TextStyle(
                          color: sm.fg, fontSize: 11,
                          fontWeight: FontWeight.w800)),
                    ),
                  ]),
                  const SizedBox(height: 4),
                  // Service
                  Row(children: [
                    const Icon(Icons.content_cut_rounded,
                        size: 12, color: _muted),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(e.serviceName,
                        style: const TextStyle(
                          color: _muted, fontSize: 12.5,
                          fontWeight: FontWeight.w500)),
                    ),
                    if (e.totalAmount > 0)
                      Text(
                        'LKR ${e.totalAmount.toStringAsFixed(0)}',
                        style: const TextStyle(
                          color: _forest,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                  ]),
                  // Phone
                  if (e.phone.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Row(children: [
                      const Icon(Icons.phone_outlined,
                          size: 12, color: _muted),
                      const SizedBox(width: 4),
                      Text(e.phone,
                        style: const TextStyle(
                          color: _muted, fontSize: 12,
                          fontWeight: FontWeight.w500)),
                    ]),
                  ],
                  // Staff
                  if (e.staffName.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Row(children: [
                      const Icon(Icons.badge_outlined,
                          size: 12, color: _muted),
                      const SizedBox(width: 4),
                      Text(e.staffName,
                        style: const TextStyle(
                          color: _muted, fontSize: 12,
                          fontWeight: FontWeight.w500)),
                    ]),
                  ],
                  // Wait time
                  if (e.estimatedWait > 0 && !isDone) ...[
                    const SizedBox(height: 4),
                    Row(children: [
                      const Icon(Icons.schedule_rounded,
                          size: 12, color: Color(0xFFF59E0B)),
                      const SizedBox(width: 4),
                      Text('~${e.estimatedWait} min wait',
                        style: const TextStyle(
                          color: Color(0xFFF59E0B), fontSize: 12,
                          fontWeight: FontWeight.w600)),
                    ]),
                  ],
                  // Note
                  if (e.note.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF9FAFB),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: _border)),
                      child: Row(children: [
                        const Icon(Icons.notes_rounded,
                            size: 11, color: _muted),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(e.note,
                            style: const TextStyle(
                              color: _muted, fontSize: 11.5)),
                        ),
                      ]),
                    ),
                  ],
                ],
              ),
            ),
          ]),
        ),

        // ── Action footer (only for active entries) ─────────────────────
        if (isWaiting || isServing)
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFFF9FAFB),
              border: Border(top: BorderSide(color: _border)),
              borderRadius: const BorderRadius.vertical(
                  bottom: Radius.circular(16)),
            ),
            padding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 10),
            child: Row(children: [
              if (canEdit) ...[
                GestureDetector(
                  onTap: onEdit,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: _surface,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: _border),
                    ),
                    child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                      Icon(Icons.edit_outlined,
                          size: 14, color: _forest),
                      SizedBox(width: 5),
                      Text('Edit',
                        style: TextStyle(
                          color: _forest, fontSize: 12.5,
                          fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: onCancel,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF1F2),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                          color: const Color(0xFFFECDD3), width: 1),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.cancel_outlined,
                            size: 14, color: Color(0xFFDC2626)),
                        SizedBox(width: 5),
                        Text(
                          'Cancel',
                          style: TextStyle(
                            color: Color(0xFFDC2626),
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              const Spacer(),
              // Right side (same slot as removed Start Service): assign staff
              if (isWaiting && e.staffName.isEmpty)
                GestureDetector(
                  onTap: onAssign,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                          color: const Color(0xFF86EFAC), width: 1.2),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF16A34A).withValues(alpha: 0.12),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.badge_outlined,
                            size: 15, color: Color(0xFF16A34A)),
                        SizedBox(width: 6),
                        Text(
                          'Assign Staff',
                          style: TextStyle(
                            color: Color(0xFF16A34A),
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              if (isServing)
                GestureDetector(
                  onTap: onPayment,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [_forest, _emerald],
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight),
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: [BoxShadow(
                        color: _forest.withValues(alpha: 0.25),
                        blurRadius: 8, offset: const Offset(0, 3))],
                    ),
                    child: const Row(
                        mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.payments_rounded,
                          size: 15, color: Colors.white),
                      SizedBox(width: 6),
                      Text('Collect Payment',
                        style: TextStyle(
                          color: Colors.white, fontSize: 13,
                          fontWeight: FontWeight.w800)),
                    ]),
                  ),
                ),
            ]),
          ),

      ]),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// STAFF PICKER SHEET
// ═════════════════════════════════════════════════════════════════════════════
class _StaffPickerSheet extends StatelessWidget {
  const _StaffPickerSheet({required this.staffList});
  final List<StaffMember> staffList;

  static const List<List<Color>> _gradients = [
    [Color(0xFF1B3A2D), Color(0xFF2D6A4F)],
    [Color(0xFF1E3A5F), Color(0xFF2563EB)],
    [Color(0xFF4C1D95), Color(0xFF7C3AED)],
    [Color(0xFF7F1D1D), Color(0xFFDC2626)],
    [Color(0xFF78350F), Color(0xFFD97706)],
    [Color(0xFF064E3B), Color(0xFF059669)],
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.65),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [

        // Drag handle
        Center(
          child: Container(
            margin: const EdgeInsets.only(top: 12, bottom: 4),
            width: 38, height: 4,
            decoration: BoxDecoration(
                color: const Color(0xFFE5E7EB),
                borderRadius: BorderRadius.circular(99)),
          ),
        ),

        // Title row
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 12),
          child: Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                color: const Color(0xFFECFDF5),
                borderRadius: BorderRadius.circular(11),
                border: Border.all(color: const Color(0xFFA7F3D0)),
              ),
              child: const Icon(Icons.badge_outlined,
                  color: _forest, size: 19),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Assign Staff',
                      style: TextStyle(
                          color: Color(0xFF111827),
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2)),
                  Text('Select a staff member for this walk-in',
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

        const Divider(height: 1, color: Color(0xFFF3F4F6)),

        // Staff list
        Flexible(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
            shrinkWrap: true,
            itemCount: staffList.length,
            separatorBuilder: (_, i2) => const SizedBox(height: 4),
            itemBuilder: (ctx, i) {
              final s = staffList[i];
              final grad = _gradients[i % _gradients.length];
              final init = s.name.isNotEmpty
                  ? s.name.trim()[0].toUpperCase() : '?';
              return GestureDetector(
                onTap: () => Navigator.of(context).pop(s),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: Row(children: [
                    Container(
                      width: 40, height: 40,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                            colors: grad,
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight),
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(init,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w900)),
                      ),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Text(s.name,
                          style: const TextStyle(
                              color: Color(0xFF111827),
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700)),
                    ),
                    const Icon(Icons.chevron_right_rounded,
                        color: Color(0xFFD1D5DB), size: 20),
                  ]),
                ),
              );
            },
          ),
        ),

        SafeArea(top: false, child: const SizedBox(height: 4)),
      ]),
    );
  }
}
