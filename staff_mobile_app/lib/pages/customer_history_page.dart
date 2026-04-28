import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../state/app_state.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const _forest  = Color(0xFF1B3A2D);
const _emerald = Color(0xFF2D6A4F);
const _canvas  = Color(0xFFF2F5F2);
const _surface = Color(0xFFFFFFFF);
const _border  = Color(0xFFE5E7EB);
const _ink     = Color(0xFF111827);
const _muted   = Color(0xFF6B7280);
const _gold    = Color(0xFFC9956C);

// ── Status colours ─────────────────────────────────────────────────────────
Color _statusColor(String s) {
  switch (s.toLowerCase()) {
    case 'completed':  return const Color(0xFF059669);
    case 'confirmed':  return const Color(0xFF2563EB);
    case 'cancelled':  return const Color(0xFFDC2626);
    case 'in_service': return const Color(0xFF7C3AED);
    default:           return const Color(0xFFD97706);
  }
}

Color _statusBg(String s) {
  switch (s.toLowerCase()) {
    case 'completed':  return const Color(0xFFECFDF5);
    case 'confirmed':  return const Color(0xFFEFF6FF);
    case 'cancelled':  return const Color(0xFFFEF2F2);
    case 'in_service': return const Color(0xFFF5F3FF);
    default:           return const Color(0xFFFEF3C7);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class CustomerHistoryPage extends StatefulWidget {
  const CustomerHistoryPage({super.key, required this.customer});
  final Customer customer;

  @override
  State<CustomerHistoryPage> createState() => _CustomerHistoryPageState();
}

class _CustomerHistoryPageState extends State<CustomerHistoryPage> {
  Map<String, dynamic>? _detail;
  List<Map<String, dynamic>> _payments = [];
  bool   _loading = true;
  String _error   = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = ''; });
    try {
      final app   = AppStateScope.of(context);
      final token = app.currentUser?.authToken ?? '';
      final results = await Future.wait([
        app.api.fetchCustomerDetail(token: token, customerId: widget.customer.id),
        app.api.fetchPayments(token: token, customerId: '${widget.customer.id}', limit: 50)
            .then((list) => list.map((p) => {
              'id': p.id, 'date': p.date, 'total_amount': p.totalAmount,
              'service': {'name': p.serviceName}, 'staff': {'name': p.staffName},
            }).toList()),
      ]);
      if (mounted) setState(() {
        _detail   = results[0] as Map<String, dynamic>;
        _payments = (results[1] as List).cast<Map<String, dynamic>>();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  // Derived helpers
  int get _loyaltyPoints =>
      int.tryParse('${_detail?['loyalty_points'] ?? 0}') ?? 0;

  String get _lastVisit {
    final appts = _appointments;
    if (appts.isEmpty) return 'No visits yet';
    final dates = appts
        .map((a) => '${a['date'] ?? ''}')
        .where((d) => d.isNotEmpty)
        .toList()
      ..sort((a, b) => b.compareTo(a));
    if (dates.isEmpty) return 'No visits yet';
    return _formatDate(dates.first);
  }

  List<Map<String, dynamic>> get _appointments {
    final list = _detail?['appointments'];
    if (list is! List) return const [];
    return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  int get _totalVisits => _appointments.where(
    (a) => '${a['status']}'.toLowerCase() == 'completed').length;

  static String _formatDate(String raw) {
    try {
      final d = DateTime.parse(raw);
      const mo = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${d.day} ${mo[d.month - 1]} ${d.year}';
    } catch (_) {
      return raw;
    }
  }

  @override
  Widget build(BuildContext context) {
    final name     = widget.customer.name;
    final initials = name.trim().isNotEmpty
        ? name.trim().split(' ').map((e) => e.isNotEmpty ? e[0].toUpperCase() : '').take(2).join()
        : '?';

    return Scaffold(
      backgroundColor: _canvas,
      body: CustomScrollView(
        slivers: [
          // ── Hero App Bar ──────────────────────────────────────────────
          SliverAppBar(
            expandedHeight: 220,
            pinned: true,
            backgroundColor: _forest,
            foregroundColor: Colors.white,
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh_rounded, size: 21),
                onPressed: _load,
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              collapseMode: CollapseMode.pin,
              background: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [_forest, _emerald, Color(0xFF3A8C62)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 52, 20, 20),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          // Avatar
                          Container(
                            width: 60, height: 60,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.18),
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 2),
                            ),
                            child: Center(
                              child: Text(initials,
                                style: const TextStyle(
                                  color: Colors.white, fontSize: 22,
                                  fontWeight: FontWeight.w900)),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name,
                                style: const TextStyle(
                                  color: Colors.white, fontSize: 20,
                                  fontWeight: FontWeight.w900, letterSpacing: -0.4)),
                              if (widget.customer.phone.isNotEmpty)
                                Text(widget.customer.phone,
                                  style: const TextStyle(
                                    color: Colors.white70, fontSize: 13,
                                    fontWeight: FontWeight.w500)),
                              if (widget.customer.email.isNotEmpty)
                                Text(widget.customer.email,
                                  style: const TextStyle(
                                    color: Colors.white60, fontSize: 12)),
                            ],
                          )),
                        ]),
                        const SizedBox(height: 16),
                        // Stats row
                        Row(children: [
                          _statChip(Icons.star_rounded, '$_loyaltyPoints pts', _gold),
                          const SizedBox(width: 8),
                          _statChip(Icons.check_circle_rounded,
                              '$_totalVisits visits', const Color(0xFF86EFAC)),
                          const SizedBox(width: 8),
                          _statChip(Icons.schedule_rounded, _lastVisit,
                              const Color(0xFFFDE68A)),
                        ]),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),

          // ── Body ────────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: _loading
                ? const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator(color: _emerald)))
                : _error.isNotEmpty
                    ? _ErrorView(error: _error, onRetry: _load)
                    : _Body(
                        detail: _detail!,
                        appointments: _appointments,
                        payments: _payments,
                        loyaltyPoints: _loyaltyPoints,
                        lastVisit: _lastVisit,
                        totalVisits: _totalVisits,
                      ),
          ),
        ],
      ),
    );
  }

  Widget _statChip(IconData icon, String label, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: color),
      const SizedBox(width: 5),
      Text(label,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
    ]),
  );
}

// ── Body widget ───────────────────────────────────────────────────────────────
class _Body extends StatelessWidget {
  const _Body({
    required this.detail,
    required this.appointments,
    required this.payments,
    required this.loyaltyPoints,
    required this.lastVisit,
    required this.totalVisits,
  });

  final Map<String, dynamic> detail;
  final List<Map<String, dynamic>> appointments;
  final List<Map<String, dynamic>> payments;
  final int loyaltyPoints, totalVisits;
  final String lastVisit;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [

          // ── Summary cards ────────────────────────────────────────────
          Row(children: [
            Expanded(child: _SummaryCard(
              icon: Icons.star_rounded,
              label: 'Loyalty Points',
              value: '$loyaltyPoints',
              color: _gold,
              bg: const Color(0xFFFEF3C7),
            )),
            const SizedBox(width: 10),
            Expanded(child: _SummaryCard(
              icon: Icons.event_available_rounded,
              label: 'Total Visits',
              value: '$totalVisits',
              color: _emerald,
              bg: const Color(0xFFECFDF5),
            )),
            const SizedBox(width: 10),
            Expanded(child: _SummaryCard(
              icon: Icons.schedule_rounded,
              label: 'Last Visit',
              value: lastVisit,
              color: const Color(0xFF2563EB),
              bg: const Color(0xFFEFF6FF),
              small: true,
            )),
          ]),
          const SizedBox(height: 20),

          // ── Contact info ─────────────────────────────────────────────
          _SectionTitle(title: 'Contact Info'),
          const SizedBox(height: 10),
          _InfoCard(children: [
            if ('${detail['phone'] ?? ''}'.isNotEmpty)
              _InfoRow(icon: Icons.phone_rounded, label: 'Phone', value: '${detail['phone']}'),
            if ('${detail['email'] ?? ''}'.isNotEmpty)
              _InfoRow(icon: Icons.email_rounded, label: 'Email', value: '${detail['email']}'),
            if (detail['branch'] is Map)
              _InfoRow(icon: Icons.store_rounded, label: 'Branch',
                  value: '${(detail['branch'] as Map)['name'] ?? ''}'),
          ]),
          const SizedBox(height: 20),

          // ── Appointment history ───────────────────────────────────────
          _SectionTitle(title: 'Visit History', sub: '(last ${appointments.length})'),
          const SizedBox(height: 10),

          if (appointments.isEmpty)
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: _surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: _border),
              ),
              child: const Center(
                child: Text('No visit history yet.',
                  style: TextStyle(color: _muted, fontSize: 13)),
              ),
            )
          else
            ...appointments.map((appt) => _AppointmentRow(appt: appt)),

          const SizedBox(height: 24),

          // ── Payment History ───────────────────────────────────────────
          _SectionTitle(title: 'Payment History', sub: '(last ${payments.length})'),
          const SizedBox(height: 10),

          if (payments.isEmpty)
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: _surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: _border),
              ),
              child: const Center(
                child: Text('No payments found.',
                  style: TextStyle(color: _muted, fontSize: 13)),
              ),
            )
          else
            ...payments.map((pay) => _PaymentRow(pay: pay)),
        ],
      ),
    );
  }
}

// ── Summary card ──────────────────────────────────────────────────────────────
class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    required this.bg,
    this.small = false,
  });
  final IconData icon;
  final String label, value;
  final Color color, bg;
  final bool small;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: _surface,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: _border),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04),
          blurRadius: 6, offset: const Offset(0, 2))],
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        width: 32, height: 32,
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(9)),
        child: Icon(icon, size: 16, color: color),
      ),
      const SizedBox(height: 8),
      Text(value,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: small ? 11 : 18,
          fontWeight: FontWeight.w800,
          color: _ink, letterSpacing: -0.3)),
      const SizedBox(height: 2),
      Text(label, style: const TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w600)),
    ]),
  );
}

// ── Section title ─────────────────────────────────────────────────────────────
class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.sub});
  final String title;
  final String? sub;

  @override
  Widget build(BuildContext context) => Row(children: [
    Container(width: 3, height: 16,
      decoration: BoxDecoration(color: _emerald, borderRadius: BorderRadius.circular(2))),
    const SizedBox(width: 8),
    Text(title,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800,
          color: _ink, letterSpacing: -0.2)),
    if (sub != null) ...[
      const SizedBox(width: 6),
      Text(sub!, style: const TextStyle(fontSize: 12, color: _muted)),
    ],
  ]);
}

// ── Contact info card ─────────────────────────────────────────────────────────
class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: _surface,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: _border),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03),
          blurRadius: 6, offset: const Offset(0, 2))],
    ),
    child: children.isEmpty
        ? const Padding(padding: EdgeInsets.all(16),
            child: Text('No info available', style: TextStyle(color: _muted, fontSize: 13)))
        : Column(
            children: children.asMap().entries.map((e) {
              final isLast = e.key == children.length - 1;
              return Column(children: [
                e.value,
                if (!isLast) const Divider(height: 1, color: _border, indent: 48),
              ]);
            }).toList(),
          ),
  );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label, value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    child: Row(children: [
      Container(
        width: 32, height: 32,
        decoration: BoxDecoration(
          color: _forest.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(9)),
        child: Icon(icon, size: 15, color: _forest),
      ),
      const SizedBox(width: 12),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
              color: _muted, letterSpacing: 0.3)),
        const SizedBox(height: 2),
        Text(value,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _ink)),
      ]),
    ]),
  );
}

// ── Appointment row ───────────────────────────────────────────────────────────
class _AppointmentRow extends StatelessWidget {
  const _AppointmentRow({required this.appt});
  final Map<String, dynamic> appt;

  @override
  Widget build(BuildContext context) {
    final status      = '${appt['status'] ?? 'pending'}';
    final date        = _formatDate('${appt['date'] ?? ''}');
    final time        = '${appt['time'] ?? ''}';
    final serviceName = (appt['service'] as Map?)?['name'] ?? 'Service';
    final amount      = appt['amount'] != null
        ? 'Rs. ${double.tryParse('${appt['amount']}')?.toStringAsFixed(0) ?? appt['amount']}'
        : '';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 5, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(children: [
          // Date badge
          Container(
            width: 46, height: 46,
            decoration: BoxDecoration(
              color: _statusBg(status),
              borderRadius: BorderRadius.circular(12)),
            child: Center(
              child: Icon(Icons.calendar_today_rounded,
                size: 20, color: _statusColor(status)),
            ),
          ),
          const SizedBox(width: 12),
          // Info
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(serviceName,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                    color: _ink, letterSpacing: -0.2),
                maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 3),
              Row(children: [
                Text(date,
                  style: const TextStyle(fontSize: 11, color: _muted)),
                if (time.isNotEmpty) ...[
                  const Text(' · ', style: TextStyle(color: _muted, fontSize: 11)),
                  Text(time, style: const TextStyle(fontSize: 11, color: _muted)),
                ],
              ]),
            ],
          )),
          const SizedBox(width: 8),
          // Right side
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: _statusBg(status),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                status.replaceAll('_', ' '),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                    color: _statusColor(status)),
              ),
            ),
            if (amount.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(amount,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                    color: _emerald)),
            ],
          ]),
        ]),
      ),
    );
  }

  static String _formatDate(String raw) {
    try {
      final d = DateTime.parse(raw);
      const mo = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${d.day} ${mo[d.month - 1]} ${d.year}';
    } catch (_) {
      return raw;
    }
  }
}

// ── Payment row ───────────────────────────────────────────────────────────────
class _PaymentRow extends StatelessWidget {
  const _PaymentRow({required this.pay});
  final Map<String, dynamic> pay;

  static String _fmt(String raw) {
    try {
      final d = DateTime.parse(raw);
      const mo = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${d.day} ${mo[d.month - 1]} ${d.year}';
    } catch (_) { return raw; }
  }

  @override
  Widget build(BuildContext context) {
    final service = (pay['service'] as Map?)?['name'] ?? '—';
    final staff   = (pay['staff']   as Map?)?['name'] ?? '';
    final date    = _fmt('${pay['date'] ?? ''}');
    final amount  = double.tryParse('${pay['total_amount']}') ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 5, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(children: [
          Container(
            width: 46, height: 46,
            decoration: BoxDecoration(
              color: const Color(0xFFECFDF5),
              borderRadius: BorderRadius.circular(12)),
            child: const Center(
              child: Icon(Icons.payments_rounded, size: 20, color: Color(0xFF059669)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(service,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                    color: _ink, letterSpacing: -0.2),
                maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 3),
              Row(children: [
                Text(date, style: const TextStyle(fontSize: 11, color: _muted)),
                if (staff.isNotEmpty) ...[
                  const Text(' · ', style: TextStyle(color: _muted, fontSize: 11)),
                  Text(staff, style: const TextStyle(fontSize: 11, color: _muted)),
                ],
              ]),
            ],
          )),
          Text(
            'Rs. ${amount.toStringAsFixed(0)}',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800,
                color: Color(0xFF059669)),
          ),
        ]),
      ),
    );
  }
}

// ── Error view ────────────────────────────────────────────────────────────────
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});
  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.wifi_off_rounded, size: 40, color: Color(0xFFDC2626)),
      const SizedBox(height: 12),
      Text(error, textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 13, color: _muted)),
      const SizedBox(height: 16),
      ElevatedButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh_rounded, size: 16),
        label: const Text('Retry'),
        style: ElevatedButton.styleFrom(
          backgroundColor: _emerald, foregroundColor: Colors.white),
      ),
    ]),
  );
}
