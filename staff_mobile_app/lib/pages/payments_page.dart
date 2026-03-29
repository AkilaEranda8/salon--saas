import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/customer.dart';
import '../models/payment_record.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';
import 'add_payment_modal.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest  = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas  = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border  = Color(0xFFE5E7EB);
const Color _ink     = Color(0xFF111827);
const Color _muted   = Color(0xFF6B7280);

// ── Method icon/colour map ────────────────────────────────────────────────────
IconData _methodIcon(String m) {
  final lower = m.toLowerCase();
  if (lower.contains('card')) { return Icons.credit_card_rounded; }
  if (lower.contains('online') || lower.contains('transfer')) {
    return Icons.account_balance_rounded;
  }
  if (lower.contains('loyalty')) { return Icons.stars_rounded; }
  if (lower.contains('package')) { return Icons.card_giftcard_rounded; }
  return Icons.payments_rounded; // cash default
}

Color _methodColor(String m) {
  final lower = m.toLowerCase();
  if (lower.contains('card')) { return const Color(0xFF2563EB); }
  if (lower.contains('online') || lower.contains('transfer')) {
    return const Color(0xFF7C3AED);
  }
  if (lower.contains('loyalty')) { return const Color(0xFFD97706); }
  if (lower.contains('package')) { return const Color(0xFF9D174D); }
  return const Color(0xFF059669); // cash
}

// ── Month name helper ─────────────────────────────────────────────────────────
String _monthName(int m) => const [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
][m];

// ─────────────────────────────────────────────────────────────────────────────
class PaymentsPage extends StatefulWidget {
  const PaymentsPage({super.key});
  @override
  State<PaymentsPage> createState() => _PaymentsPageState();
}

class _PaymentsPageState extends State<PaymentsPage> {
  Future<void>? _future;
  List<PaymentRecord>      _payments  = const [];
  List<Customer>           _customers = const [];
  List<StaffMember>        _staff     = const [];
  List<SalonService>       _services  = const [];
  List<Map<String, String>> _branches = const [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  String _currentMonth() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}';
  }

  Future<void> _load() async {
    final app = AppStateScope.of(context);
    final uid = app.currentUser?.branchId;
    final month = _currentMonth();

    final payments  = await app.loadPayments(branchId: uid, month: month);
    final customers = await app.loadCustomers();
    final services  = await app.loadServices();
    final staff     = await app.loadStaffList(branchId: uid);
    var branches    = app.branches;
    if (uid == null || uid.isEmpty) {
      branches = await app.loadBranches();
    } else if (branches.every((b) => b['id'] != uid)) {
      branches = [{'id': uid, 'name': 'My Branch'}];
    }

    if (!mounted) return;
    setState(() {
      _payments  = payments;
      _customers = customers;
      _services  = services;
      _staff     = staff;
      _branches  = branches;
    });
  }

  void _refresh() {
    setState(() {
      _future = _load();
    });
  }

  Future<void> _openAdd() async {
    final app = AppStateScope.of(context);
    var customers    = _customers;
    var services     = _services;
    var staff        = _staff;
    var branches     = _branches;
    final uid        = app.currentUser?.branchId;

    List<Map<String, dynamic>> discounts = const [];
    try {
      if (customers.isEmpty) customers = await app.loadCustomers();
      if (services.isEmpty)  services  = await app.loadServices();
      if (staff.isEmpty)     staff     = await app.loadStaffList(branchId: uid);
      if (branches.isEmpty) {
        branches = (uid == null || uid.isEmpty)
            ? await app.loadBranches()
            : [{'id': uid, 'name': 'My Branch'}];
      }
      final bid = (uid != null && uid.isNotEmpty)
          ? uid
          : (branches.isNotEmpty ? branches.first['id'] : null);
      final branchKey = bid?.toString().trim() ?? '';
      if (branchKey.isNotEmpty) {
        discounts = await app.loadDiscountsForPayment(branchKey);
      }
    } catch (_) {}

    if (!mounted) return;
    if (branches.isEmpty || services.isEmpty) {
      _toast(app.lastError ?? 'Missing data — reload and try again');
      return;
    }

    setState(() {
      _customers = customers;
      _services  = services;
      _staff     = staff;
      _branches  = branches;
    });

    final payload = await AddPaymentModal.show(
      context,
      branches: branches, customers: customers,
      staff: staff, services: services,
      discounts: discounts,
      initialBranchId: uid,
    );
    if (payload == null || !mounted) return;

    final ok = await app.addManualPayment(
      branchId:       payload.branchId,
      serviceId:      payload.serviceIds.isNotEmpty ? payload.serviceIds.first : '',
      serviceIds:     payload.serviceIds,
      staffId:        payload.staffId.isEmpty ? null : payload.staffId,
      customerId:     payload.customerId.isEmpty ? null : payload.customerId,
      customerName:   payload.customerName,
      totalAmount:    payload.totalAmount,
      loyaltyDiscount: payload.loyaltyDiscount,
      method:         payload.method,
      paidAmount:     payload.paidAmount,
      discountId:     payload.discountId.isEmpty ? null : payload.discountId,
    );
    if (!mounted) return;
    _toast(ok ? 'Payment recorded!' : (app.lastError ?? 'Failed to add payment'));
    if (ok) _refresh();
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      behavior: SnackBarBehavior.floating,
      backgroundColor: _forest,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ));
  }

  String _fmt(String raw) {
    if (raw.trim().isEmpty) return '';
    try {
      final d = DateTime.parse(raw);
      return '${d.day.toString().padLeft(2, '0')} ${_monthName(d.month).substring(0, 3)} ${d.year}';
    } catch (_) { return raw; }
  }

  // ── Revenue summary ────────────────────────────────────────────────────────
  double get _totalRevenue =>
      _payments.fold(0, (s, p) => s + p.netAmount);
  double get _totalDiscount =>
      _payments.fold(0, (s, p) => s + p.loyaltyDiscount);

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
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
            return _buildBody(now);
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
                Icon(Icons.add_card_rounded, color: Colors.white, size: 18),
                SizedBox(width: 8),
                Text('Record Payment',
                  style: TextStyle(
                    color: Colors.white, fontSize: 14,
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
    const Expanded(
      child: Center(
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
      const Text('Failed to load payments',
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
  Widget _buildBody(DateTime now) => Column(children: [
    _buildHeader(loading: false, now: now),
    Expanded(
      child: _payments.isEmpty
          ? _buildEmpty()
          : RefreshIndicator(
              color: _forest,
              onRefresh: () async => _refresh(),
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                itemCount: _payments.length,
                itemBuilder: (ctx, i) =>
                    _PaymentCard(payment: _payments[i], fmt: _fmt),
              ),
            ),
    ),
  ]);

  // ── Empty state ────────────────────────────────────────────────────────────
  Widget _buildEmpty() => Center(child: Column(mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 72, height: 72,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [_forest.withValues(alpha: 0.12),
                     _emerald.withValues(alpha: 0.06)],
            begin: Alignment.topLeft, end: Alignment.bottomRight),
          shape: BoxShape.circle),
        child: const Icon(Icons.receipt_long_rounded,
            color: _forest, size: 30),
      ),
      const SizedBox(height: 16),
      const Text('No payments this month',
        style: TextStyle(color: _ink, fontSize: 16,
            fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      const Text('Tap + to record a payment',
        style: TextStyle(color: _muted, fontSize: 13)),
    ],
  ));

  // ── Header with stats card ─────────────────────────────────────────────────
  Widget _buildHeader({required bool loading, DateTime? now}) {
    final month = now != null ? _monthName(now.month) : '';
    final year  = now?.year ?? 0;
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
                  Icon(Icons.account_balance_wallet_rounded,
                      color: _forest, size: 16),
                  SizedBox(width: 6),
                  Text('Payments',
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

          // Stats gradient card
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Month label
                  Row(children: [
                    const Icon(Icons.calendar_month_rounded,
                        color: Colors.white60, size: 13),
                    const SizedBox(width: 5),
                    Text(
                      loading ? 'Loading…' : '$month $year',
                      style: const TextStyle(
                        color: Colors.white60, fontSize: 12,
                        fontWeight: FontWeight.w600)),
                  ]),
                  const SizedBox(height: 10),
                  // Revenue row
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Total Revenue',
                              style: TextStyle(
                                color: Colors.white70, fontSize: 12,
                                fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            loading
                                ? Container(
                                    width: 100, height: 30,
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(8)))
                                : FittedBox(
                                    fit: BoxFit.scaleDown,
                                    alignment: Alignment.centerLeft,
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.end,
                                      children: [
                                        const Text('LKR ',
                                          style: TextStyle(
                                            color: Colors.white70,
                                            fontSize: 14,
                                            fontWeight: FontWeight.w700)),
                                        Text(
                                          _totalRevenue.toStringAsFixed(0),
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 30,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: -1)),
                                      ],
                                    ),
                                  ),
                          ],
                        ),
                      ),
                      // Right side stats
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _StatPill(
                            icon: Icons.receipt_rounded,
                            label: loading ? '—' : '${_payments.length} payments'),
                          const SizedBox(height: 6),
                          if (!loading && _totalDiscount > 0)
                            _StatPill(
                              icon: Icons.discount_rounded,
                              label: 'LKR ${_totalDiscount.toStringAsFixed(0)} disc'),
                        ],
                      ),
                    ],
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

// ── Stat pill ─────────────────────────────────────────────────────────────────
class _StatPill extends StatelessWidget {
  const _StatPill({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.14),
      borderRadius: BorderRadius.circular(8)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 12, color: Colors.white70),
      const SizedBox(width: 5),
      Text(label,
        style: const TextStyle(
          color: Colors.white, fontSize: 11.5,
          fontWeight: FontWeight.w700)),
    ]),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAYMENT CARD
// ═════════════════════════════════════════════════════════════════════════════
class _PaymentCard extends StatelessWidget {
  const _PaymentCard({
    required this.payment,
    required this.fmt,
  });
  final PaymentRecord payment;
  final String Function(String) fmt;

  @override
  Widget build(BuildContext context) {
    final p        = payment;
    final name     = p.customerName.isEmpty ? 'Walk-in' : p.customerName;
    final initials = name.trim().split(' ')
        .map((e) => e.isNotEmpty ? e[0].toUpperCase() : '')
        .take(2).join();

    // Primary method from splits or fallback
    final method = p.splits.isNotEmpty ? p.splits.first.method : 'Cash';
    final mColor = _methodColor(method);
    final mIcon  = _methodIcon(method);

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

        // ── Main row ────────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 13, 14, 10),
          child: Row(children: [

            // Avatar
            Container(
              width: 46, height: 46,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(
                  color: _forest.withValues(alpha: 0.25),
                  blurRadius: 8, offset: const Offset(0, 3))],
              ),
              child: Center(
                child: Text(initials,
                  style: const TextStyle(
                    color: Colors.white, fontSize: 15,
                    fontWeight: FontWeight.w800)),
              ),
            ),

            const SizedBox(width: 12),

            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                    style: const TextStyle(
                      color: _ink, fontSize: 14.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.1)),
                  const SizedBox(height: 3),
                  if (p.serviceName.isNotEmpty)
                    Text(p.serviceName,
                      style: const TextStyle(
                        color: _muted, fontSize: 12.5,
                        fontWeight: FontWeight.w500)),
                  if (p.staffName.isNotEmpty)
                    Row(children: [
                      const Icon(Icons.badge_outlined,
                          size: 11, color: _muted),
                      const SizedBox(width: 3),
                      Text(p.staffName,
                        style: const TextStyle(
                          color: _muted, fontSize: 11.5,
                          fontWeight: FontWeight.w500)),
                    ]),
                ],
              ),
            ),

            // Amount block
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('LKR',
                style: TextStyle(
                  color: _forest.withValues(alpha: 0.55),
                  fontSize: 10, fontWeight: FontWeight.w700)),
              Text(p.netAmount.toStringAsFixed(0),
                style: const TextStyle(
                  color: _forest, fontSize: 20,
                  fontWeight: FontWeight.w900, letterSpacing: -0.5)),
              if (p.loyaltyDiscount > 0)
                Text('−${p.loyaltyDiscount.toStringAsFixed(0)} disc',
                  style: const TextStyle(
                    color: Color(0xFFD97706), fontSize: 10.5,
                    fontWeight: FontWeight.w600)),
            ]),

          ]),
        ),

        // ── Footer row ──────────────────────────────────────────────────
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFFF9FAFB),
            border: Border(top: BorderSide(color: _border)),
            borderRadius: const BorderRadius.vertical(
                bottom: Radius.circular(16)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(children: [

            // Method chips
            Expanded(
              child: Wrap(
                spacing: 6, runSpacing: 4,
                children: p.splits.isNotEmpty
                    ? p.splits.map((s) => _MethodChip(
                          icon: _methodIcon(s.method),
                          color: _methodColor(s.method),
                          label: s.method,
                          amount: s.amount,
                        )).toList()
                    : [_MethodChip(
                        icon: mIcon, color: mColor,
                        label: method, amount: p.netAmount)],
              ),
            ),

            // Date
            Text(fmt(p.date),
              style: const TextStyle(
                color: _muted, fontSize: 11,
                fontWeight: FontWeight.w500)),

          ]),
        ),

      ]),
    );
  }
}

// ── Method chip ───────────────────────────────────────────────────────────────
class _MethodChip extends StatelessWidget {
  const _MethodChip({
    required this.icon, required this.color,
    required this.label, required this.amount,
  });
  final IconData icon;
  final Color color;
  final String label;
  final double amount;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(7),
      border: Border.all(color: color.withValues(alpha: 0.25)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 11, color: color),
      const SizedBox(width: 4),
      Text('$label  LKR ${amount.toStringAsFixed(0)}',
        style: TextStyle(
          color: color, fontSize: 11,
          fontWeight: FontWeight.w700)),
    ]),
  );
}
