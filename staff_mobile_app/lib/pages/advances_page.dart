import 'package:flutter/material.dart';

import '../models/staff_member.dart';
import '../services/mobile_api.dart';
import '../state/app_state.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const _forest  = Color(0xFF1B3A2D);
const _emerald = Color(0xFF2D6A4F);
const _canvas  = Color(0xFFF2F5F2);
const _surface = Color(0xFFFFFFFF);
const _border  = Color(0xFFE5E7EB);
const _ink     = Color(0xFF111827);
const _muted   = Color(0xFF6B7280);
const _amber   = Color(0xFFD97706);
const _amberBg = Color(0xFFFEF3C7);
const _green   = Color(0xFF059669);
const _greenBg = Color(0xFFECFDF5);

// ─────────────────────────────────────────────────────────────────────────────
class AdvancesPage extends StatefulWidget {
  const AdvancesPage({super.key});
  @override
  State<AdvancesPage> createState() => _AdvancesPageState();
}

class _AdvancesPageState extends State<AdvancesPage> {
  List<Map<String, dynamic>> _advances = [];
  List<StaffMember>          _staff    = [];
  List<Map<String, String>>  _branches = [];
  bool   _loading = true;
  String _month   = ''; // empty = all months
  String _error   = '';

  static String _currentMonth() {
    final n = DateTime.now();
    return '${n.year}-${n.month.toString().padLeft(2, '0')}';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() { _loading = true; _error = ''; });
    try {
      final app = AppStateScope.of(context);
      // Load staff+branches first so the Add form always has data
      try {
        final stf = await app.loadStaffList();
        final brn = await app.loadBranches();
        if (mounted) setState(() { _staff = stf; _branches = brn; });
      } catch (_) {}
      // Load advances — keep old list visible on error
      final adv = await app.loadAdvances(
          month: _month.isNotEmpty ? _month : null);
      if (mounted) setState(() => _advances = adv);
    } catch (e) {
      if (mounted && !silent) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  double get _totalPending  => _advances
      .where((a) => a['status'] == 'pending')
      .fold(0, (s, a) => s + (double.tryParse('${a['amount']}') ?? 0));

  double get _totalDeducted => _advances
      .where((a) => a['status'] == 'deducted')
      .fold(0, (s, a) => s + (double.tryParse('${a['amount']}') ?? 0));

  bool get _canManage {
    final r = AppStateScope.of(context).currentUser?.role ?? '';
    return ['superadmin', 'admin', 'manager'].contains(r);
  }

  bool get _canDelete {
    final r = AppStateScope.of(context).currentUser?.role ?? '';
    return ['superadmin', 'admin'].contains(r);
  }

  // Next month in YYYY-MM format
  String _nextMonth(String ym) {
    try {
      final parts = ym.split('-');
      var y = int.parse(parts[0]);
      var m = int.parse(parts[1]);
      m++;
      if (m > 12) { m = 1; y++; }
      return '$y-${m.toString().padLeft(2, '0')}';
    } catch (_) { return ym; }
  }

  Future<void> _carryForward(Map<String, dynamic> adv) async {
    final staffId  = '${(adv['staff'] as Map?)?['id'] ?? adv['staff_id'] ?? ''}';
    final branchId = '${adv['branch_id'] ?? (adv['branch'] as Map?)?['id'] ?? ''}';
    final amount   = double.tryParse('${adv['amount']}') ?? 0;
    final month    = '${adv['month'] ?? ''}';
    final nextMo   = _nextMonth(month);
    if (staffId.isEmpty || amount <= 0) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Carry Forward Advance?'),
        content: Text(
          'Create a new pending advance of Rs. ${amount.toStringAsFixed(0)} '
          'for $nextMo (carry forward from $month)?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Carry Forward',
                style: TextStyle(color: Color(0xFF7C3AED), fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final app = AppStateScope.of(context);
    final now  = DateTime.now();
    final date = '${now.year}-${now.month.toString().padLeft(2,'0')}-${now.day.toString().padLeft(2,'0')}';
    final ok = await app.addAdvance(
      staffId:  staffId,
      branchId: branchId,
      amount:   amount,
      date:     date,
      month:    nextMo,
      reason:   'Carry forward from $month',
    );
    if (!mounted) return;
    if (ok) {
      _snack('Carried forward to $nextMo', success: true);
      _load(silent: true);
    } else {
      _snack(app.lastError ?? 'Failed');
    }
  }

  void _settleCommission(Map<String, dynamic> adv) {
    final staffId   = '${(adv['staff'] as Map?)?['id'] ?? adv['staff_id'] ?? ''}';
    final staffName = '${(adv['staff'] as Map?)?['name'] ?? 'Staff'}';
    final month     = '${adv['month'] ?? ''}';
    if (staffId.isEmpty) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CommissionSettleSheet(
        staffId: staffId, staffName: staffName, month: month,
      ),
    );
  }

  void _openAdd() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddAdvanceSheet(
        staff:    _staff,
        branches: _branches,
        month:    _month.isNotEmpty ? _month : _currentMonth(),
        defaultBranchId: AppStateScope.of(context).currentUser?.branchId ?? '',
        onSaved: () => _load(silent: true),
      ),
    );
  }

  Future<void> _markDeducted(Map<String, dynamic> adv) async {
    final app = AppStateScope.of(context);
    final ok  = await app.markAdvanceDeducted('${adv['id']}');
    if (ok) {
      setState(() => adv['status'] = 'deducted');
      _snack('Marked as deducted', success: true);
    } else {
      _snack(app.lastError ?? 'Failed');
    }
  }

  Future<void> _delete(Map<String, dynamic> adv) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete Advance?'),
        content: Text('Delete Rs. ${adv['amount']} advance for '
            '${(adv['staff'] as Map?)?['name'] ?? 'staff'}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFDC2626))),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!mounted) return;
    final app = AppStateScope.of(context);
    final ok  = await app.deleteAdvance('${adv['id']}');
    if (ok) {
      setState(() => _advances.removeWhere((a) => a['id'] == adv['id']));
      _snack('Deleted', success: true);
    } else {
      _snack(app.lastError ?? 'Failed');
    }
  }

  void _snack(String msg, {bool success = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: success ? _emerald : const Color(0xFFDC2626),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Staff Advances',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: -0.3)),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded, size: 22), onPressed: _load),
        ],
      ),
      floatingActionButton: _canManage
          ? FloatingActionButton.extended(
              backgroundColor: _emerald,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add Advance',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              onPressed: _openAdd,
            )
          : null,
      body: Column(children: [
        // ── Header summary ───────────────────────────────────────────
        Container(
          color: _forest,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(children: [
            Row(children: [
              Expanded(child: _SummaryChip(
                label: 'Pending',
                value: 'Rs. ${_totalPending.toStringAsFixed(0)}',
                icon: Icons.hourglass_empty_rounded,
                color: const Color(0xFFFBBF24),
              )),
              const SizedBox(width: 12),
              Expanded(child: _SummaryChip(
                label: 'Deducted',
                value: 'Rs. ${_totalDeducted.toStringAsFixed(0)}',
                icon: Icons.check_circle_rounded,
                color: const Color(0xFF86EFAC),
              )),
            ]),
          ]),
        ),

        // ── Month filter ─────────────────────────────────────────────
        Container(
          color: _surface,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(children: [
            const Icon(Icons.calendar_month_rounded, size: 16, color: _muted),
            const SizedBox(width: 8),
            const Text('Month:', style: TextStyle(fontSize: 13, color: _muted, fontWeight: FontWeight.w600)),
            const SizedBox(width: 8),
            // All months chip
            GestureDetector(
              onTap: () { setState(() => _month = ''); _load(); },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                margin: const EdgeInsets.only(right: 6),
                decoration: BoxDecoration(
                  color: _month.isEmpty ? _emerald : _canvas,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _month.isEmpty ? _emerald : _border),
                ),
                child: Text('All',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                      color: _month.isEmpty ? Colors.white : _muted)),
              ),
            ),
            GestureDetector(
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2030),
                  helpText: 'Select month (any day)',
                  initialEntryMode: DatePickerEntryMode.input,
                );
                if (picked != null) {
                  setState(() => _month =
                    '${picked.year}-${picked.month.toString().padLeft(2, '0')}');
                  _load();
                }
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  color: _canvas,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: _border),
                ),
                child: Text(_month,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _ink)),
              ),
            ),
          ]),
        ),

        const Divider(height: 1, color: _border),

        // ── List ─────────────────────────────────────────────────────
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: _emerald))
              : _error.isNotEmpty
                  ? _ErrorView(error: _error, onRetry: _load)
                  : _advances.isEmpty
                      ? const Center(child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.money_off_rounded, size: 48, color: _muted),
                            SizedBox(height: 12),
                            Text('No advances this month',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _muted)),
                          ],
                        ))
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                          itemCount: _advances.length,
                          itemBuilder: (_, i) => _AdvanceCard(
                            advance:      _advances[i],
                            canManage:    _canManage,
                            canDelete:    _canDelete,
                            onDeduct:     () => _markDeducted(_advances[i]),
                            onDelete:     () => _delete(_advances[i]),
                            onSettle:     () => _settleCommission(_advances[i]),
                            onCarryFwd:   () => _carryForward(_advances[i]),
                          ),
                        ),
        ),
      ]),
    );
  }
}

// ── Summary chip ──────────────────────────────────────────────────────────────
class _SummaryChip extends StatelessWidget {
  const _SummaryChip({required this.label, required this.value,
      required this.icon, required this.color});
  final String label, value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
    ),
    child: Row(children: [
      Icon(icon, size: 18, color: color),
      const SizedBox(width: 10),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 10, color: Colors.white70, fontWeight: FontWeight.w600)),
        Text(value, style: const TextStyle(fontSize: 15, color: Colors.white, fontWeight: FontWeight.w800)),
      ]),
    ]),
  );
}

// ── Advance card ──────────────────────────────────────────────────────────────
class _AdvanceCard extends StatelessWidget {
  const _AdvanceCard({
    required this.advance,
    required this.canManage,
    required this.canDelete,
    required this.onDeduct,
    required this.onDelete,
    required this.onSettle,
    required this.onCarryFwd,
  });
  final Map<String, dynamic> advance;
  final bool canManage, canDelete;
  final VoidCallback onDeduct, onDelete, onSettle, onCarryFwd;

  @override
  Widget build(BuildContext context) {
    final staffName = (advance['staff'] as Map?)?['name'] ?? 'Unknown';
    final amount    = double.tryParse('${advance['amount']}') ?? 0;
    final date      = _fmt('${advance['date'] ?? ''}');
    final month     = '${advance['month'] ?? ''}';
    final reason    = '${advance['reason'] ?? ''}';
    final pending   = advance['status'] == 'pending';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: pending ? const Color(0xFFFDE68A) : _border),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            // Avatar
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(
                color: pending ? _amberBg : _greenBg,
                borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.person_rounded, size: 20,
                  color: pending ? _amber : _green),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(staffName,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700,
                      color: _ink, letterSpacing: -0.2)),
                Text('$date · $month',
                  style: const TextStyle(fontSize: 11, color: _muted)),
              ],
            )),
            // Amount + status
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('Rs. ${amount.toStringAsFixed(0)}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800,
                    color: Color(0xFFDC2626), letterSpacing: -0.3)),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: pending ? _amberBg : _greenBg,
                  borderRadius: BorderRadius.circular(20)),
                child: Text(
                  pending ? 'Pending' : 'Deducted',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                      color: pending ? _amber : _green),
                ),
              ),
            ]),
          ]),
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Reason: $reason',
              style: const TextStyle(fontSize: 12, color: _muted)),
          ],
          if ((canManage && pending) || canDelete || (canManage && !pending)) ...[
            const SizedBox(height: 10),
            const Divider(height: 1, color: _border),
            const SizedBox(height: 8),
            Row(children: [
              if (canManage && pending)
                Expanded(
                  child: GestureDetector(
                    onTap: onDeduct,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: _greenBg,
                        borderRadius: BorderRadius.circular(10)),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.check_rounded, size: 15, color: _green),
                          SizedBox(width: 6),
                          Text('Mark Deducted',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _green)),
                        ],
                      ),
                    ),
                  ),
                ),
              if (!pending && canManage) ...[
                Expanded(
                  child: GestureDetector(
                    onTap: onSettle,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(10)),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.payments_rounded, size: 15, color: Color(0xFF2563EB)),
                          SizedBox(width: 6),
                          Text('Settle',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                                color: Color(0xFF2563EB))),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: GestureDetector(
                    onTap: onCarryFwd,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF5F3FF),
                        borderRadius: BorderRadius.circular(10)),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.redo_rounded, size: 15, color: Color(0xFF7C3AED)),
                          SizedBox(width: 6),
                          Text('Carry Fwd',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                                color: Color(0xFF7C3AED))),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
              ],
              if (canManage && pending && canDelete) const SizedBox(width: 8),
              if (canDelete)
                GestureDetector(
                  onTap: onDelete,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.delete_rounded, size: 16, color: Color(0xFFDC2626)),
                  ),
                ),
            ]),
          ],
        ]),
      ),
    );
  }

  static String _fmt(String raw) {
    try {
      final d = DateTime.parse(raw);
      const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${d.day} ${mo[d.month-1]} ${d.year}';
    } catch (_) { return raw; }
  }
}

// ── Commission Settle Sheet ───────────────────────────────────────────────────
class _CommissionSettleSheet extends StatefulWidget {
  const _CommissionSettleSheet({
    required this.staffId,
    required this.staffName,
    required this.month,
  });
  final String staffId, staffName, month;

  @override
  State<_CommissionSettleSheet> createState() => _CommissionSettleSheetState();
}

class _CommissionSettleSheetState extends State<_CommissionSettleSheet> {
  MyCommissionResult? _data;
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final result = await AppStateScope.of(context)
          .loadStaffCommissionReport(staffId: widget.staffId, month: widget.month);
      if (mounted) setState(() { _data = result; _loading = false; });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // Handle
        Center(child: Container(
          margin: const EdgeInsets.only(top: 12, bottom: 8),
          width: 36, height: 4,
          decoration: BoxDecoration(
            color: _border, borderRadius: BorderRadius.circular(4)),
        )),
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
          child: Row(children: [
            const Icon(Icons.payments_rounded, color: Color(0xFF2563EB), size: 22),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Commission Settlement', style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w800, color: _ink)),
              Text('${widget.staffName} · ${widget.month}',
                  style: const TextStyle(fontSize: 12, color: _muted)),
            ])),
          ]),
        ),
        const Divider(height: 1, color: _border),
        // Body
        if (_loading)
          const Padding(
            padding: EdgeInsets.all(32),
            child: CircularProgressIndicator(color: _emerald),
          )
        else if (_error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(_error, style: const TextStyle(color: Color(0xFFDC2626))),
          )
        else if (_data != null)
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(children: [
              _row('Total Commission',   _data!.total,          const Color(0xFFD97706)),
              const SizedBox(height: 10),
              _row('Advances Deducted', -_data!.totalAdvances,  const Color(0xFFDC2626)),
              const SizedBox(height: 10),
              const Divider(color: _border),
              const SizedBox(height: 10),
              _row('Net Payable',        _data!.netCommission,  _emerald, bold: true),
              const SizedBox(height: 10),
              _row('Already Paid',      -_data!.totalPaid,      _muted),
              const SizedBox(height: 10),
              const Divider(color: _border),
              const SizedBox(height: 10),
              _row('Balance Due',        _data!.balanceDue,     _data!.balanceDue > 0
                  ? const Color(0xFF2563EB) : _green, bold: true),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _emerald, foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: const Text('Close', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ]),
          ),
        SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
      ]),
    );
  }

  Widget _row(String label, double value, Color color, {bool bold = false}) =>
    Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(label, style: TextStyle(fontSize: 13, color: _muted,
          fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
      Text('Rs. ${value.abs().toStringAsFixed(0)}',
          style: TextStyle(fontSize: bold ? 16 : 14,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: color)),
    ]);
}

// ── Add Advance bottom sheet ──────────────────────────────────────────────────
class _AddAdvanceSheet extends StatefulWidget {
  const _AddAdvanceSheet({
    required this.staff,
    required this.branches,
    required this.month,
    required this.defaultBranchId,
    required this.onSaved,
  });
  final List<StaffMember>         staff;
  final List<Map<String, String>> branches;
  final String month, defaultBranchId;
  final VoidCallback onSaved;

  @override
  State<_AddAdvanceSheet> createState() => _AddAdvanceSheetState();
}

class _AddAdvanceSheetState extends State<_AddAdvanceSheet> {
  final _amountCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();

  String              _staffId     = '';
  String              _branchId    = '';
  String              _date        = _today();
  String              _month       = '';
  bool                _saving      = false;
  String              _error       = '';
  MyCommissionResult? _commInfo;
  bool                _loadingComm = false;

  static String _today() {
    final n = DateTime.now();
    return '${n.year}-${n.month.toString().padLeft(2,'0')}-${n.day.toString().padLeft(2,'0')}';
  }

  @override
  void initState() {
    super.initState();
    _branchId = widget.defaultBranchId.isNotEmpty
        ? widget.defaultBranchId
        : (widget.branches.isNotEmpty ? widget.branches.first['id'] ?? '' : '');
    _month = widget.month;
  }

  Future<void> _loadComm(String staffId) async {
    if (staffId.isEmpty) {
      setState(() => _commInfo = null);
      return;
    }
    setState(() { _loadingComm = true; _commInfo = null; });
    try {
      final app    = AppStateScope.of(context);
      final result = await app.loadStaffCommissionReport(
          staffId: staffId, month: _month);
      if (mounted) setState(() => _commInfo = result);
    } catch (_) {
      if (mounted) setState(() => _commInfo = null);
    }
    if (mounted) setState(() => _loadingComm = false);
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final amount = double.tryParse(_amountCtrl.text.trim());
    if (_staffId.isEmpty) {
      setState(() => _error = 'Please select a staff member.');
      return;
    }
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter a valid amount.');
      return;
    }
    // Auto-pick first branch if still empty (single-branch tenants)
    if (_branchId.isEmpty && widget.branches.isNotEmpty) {
      _branchId = widget.branches.first['id'] ?? '';
    }
    setState(() { _saving = true; _error = ''; });
    final app = AppStateScope.of(context);
    final ok  = await app.addAdvance(
      staffId:  _staffId,
      branchId: _branchId,
      amount:   amount,
      date:     _date,
      month:    _month,
      reason:   _reasonCtrl.text.trim().isEmpty ? null : _reasonCtrl.text.trim(),
    );
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: const Text('Advance added successfully'),
        backgroundColor: _emerald,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ));
      Navigator.of(context).pop();
      widget.onSaved();
    } else {
      setState(() { _error = app.lastError ?? 'Save failed.'; _saving = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: const BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Text('Add Advance',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800,
                  color: _ink, letterSpacing: -0.3)),
            const Spacer(),
            GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: const Icon(Icons.close_rounded, color: _muted, size: 22)),
          ]),
          const SizedBox(height: 18),

          if (_error.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFFEE2E2)),
              ),
              child: Text(_error,
                style: const TextStyle(fontSize: 13, color: Color(0xFFDC2626))),
            ),

          // Staff picker
          _label('Staff Member *'),
          _dropdown<String>(
            value: widget.staff.any((s) => s.id == _staffId) ? _staffId : '',
            items: [
              const DropdownMenuItem(value: '', child: Text('Select staff')),
              ...widget.staff.map((s) => DropdownMenuItem(value: s.id, child: Text(s.name))),
            ],
            onChanged: (v) { setState(() => _staffId = v ?? ''); _loadComm(v ?? ''); },
          ),
          const SizedBox(height: 10),
          // Commission preview
          if (_loadingComm)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Row(children: [
                SizedBox(width: 14, height: 14,
                    child: CircularProgressIndicator(strokeWidth: 1.8, color: _emerald)),
                SizedBox(width: 10),
                Text('Loading commission...', style: TextStyle(fontSize: 12, color: _muted)),
              ]),
            )
          else if (_commInfo != null)
            Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFF0FDF4),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFBBF7D0)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _commChip('Commission', _commInfo!.total, const Color(0xFFD97706)),
                  _commChip('Advances', _commInfo!.totalAdvances, const Color(0xFFDC2626)),
                  _commChip('Net', _commInfo!.netCommission, _emerald),
                ],
              ),
            ),
          const SizedBox(height: 10),

          // Branch picker (only if multi-branch)
          if (widget.branches.length > 1) ...[
            _label('Branch *'),
            _dropdown<String>(
              value: widget.branches.any((b) => b['id'] == _branchId) ? _branchId : '',
              items: [
                const DropdownMenuItem(value: '', child: Text('Select branch')),
                ...widget.branches.map((b) => DropdownMenuItem(value: b['id']!, child: Text(b['name']!))),
              ],
              onChanged: (v) => setState(() => _branchId = v ?? ''),
            ),
            const SizedBox(height: 14),
          ],

          // Amount & Date row
          Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _label('Amount (Rs.) *'),
              _field(_amountCtrl, 'e.g. 5000', keyboardType: TextInputType.number),
            ])),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _label('Date'),
              GestureDetector(
                onTap: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: DateTime.now(),
                    firstDate: DateTime(2020), lastDate: DateTime(2030),
                  );
                  if (d != null) {
                    setState(() => _date =
                      '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}');
                  }
                },
                child: Container(
                  height: 44,
                  decoration: BoxDecoration(
                    border: Border.all(color: _border),
                    borderRadius: BorderRadius.circular(10),
                    color: _canvas,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(children: [
                    const Icon(Icons.calendar_today_rounded, size: 15, color: _muted),
                    const SizedBox(width: 8),
                    Text(_date, style: const TextStyle(fontSize: 13, color: _ink)),
                  ]),
                ),
              ),
            ])),
          ]),
          const SizedBox(height: 14),

          // Deduction month
          _label('Deduction Month'),
          GestureDetector(
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: DateTime.now(),
                firstDate: DateTime(2020), lastDate: DateTime(2030),
                helpText: 'Select deduction month',
                initialEntryMode: DatePickerEntryMode.input,
              );
              if (d != null) {
                setState(() => _month =
                  '${d.year}-${d.month.toString().padLeft(2,'0')}');
              }
            },
            child: Container(
              height: 44,
              decoration: BoxDecoration(
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(10),
                color: _canvas,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(children: [
                const Icon(Icons.calendar_month_rounded, size: 15, color: _muted),
                const SizedBox(width: 8),
                Text(_month, style: const TextStyle(fontSize: 13, color: _ink,
                    fontWeight: FontWeight.w600)),
                const SizedBox(width: 6),
                const Text('(commission deduction month)',
                  style: TextStyle(fontSize: 11, color: _muted)),
              ]),
            ),
          ),
          const SizedBox(height: 14),

          // Reason
          _label('Reason (optional)'),
          _field(_reasonCtrl, 'e.g. Emergency medical expense'),
          const SizedBox(height: 22),

          // Save button
          SizedBox(
            width: double.infinity, height: 50,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(
                backgroundColor: _emerald,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
              child: _saving
                  ? const SizedBox(width: 20, height: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Save Advance',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: -0.2)),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _label(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(t, style: const TextStyle(
        fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 0.3)),
  );

  Widget _commChip(String label, double value, Color color) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(label, style: const TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w600)),
      const SizedBox(height: 2),
      Text('Rs. ${value.toStringAsFixed(0)}',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: color)),
    ],
  );

  Widget _field(TextEditingController ctrl, String hint,
      {TextInputType? keyboardType}) => TextField(
    controller: ctrl, keyboardType: keyboardType,
    style: const TextStyle(fontSize: 14, color: _ink),
    decoration: InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: _muted, fontSize: 13),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _emerald, width: 1.5)),
      filled: true, fillColor: _canvas,
    ),
  );

  Widget _dropdown<T>({required T value, required List<DropdownMenuItem<T>> items,
      required ValueChanged<T?> onChanged}) => Container(
    height: 44,
    decoration: BoxDecoration(
        border: Border.all(color: _border),
        borderRadius: BorderRadius.circular(10), color: _canvas),
    padding: const EdgeInsets.symmetric(horizontal: 12),
    child: DropdownButton<T>(
      value: value, items: items, onChanged: onChanged,
      isExpanded: true, underline: const SizedBox(),
      style: const TextStyle(fontSize: 13, color: _ink),
      dropdownColor: _surface,
    ),
  );
}

// ── Error view ────────────────────────────────────────────────────────────────
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});
  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(child: Padding(
    padding: const EdgeInsets.all(32),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.error_outline_rounded, size: 40, color: Color(0xFFDC2626)),
      const SizedBox(height: 12),
      Text(error, textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 13, color: _muted)),
      const SizedBox(height: 16),
      ElevatedButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh_rounded, size: 16),
        label: const Text('Retry'),
        style: ElevatedButton.styleFrom(backgroundColor: _emerald, foregroundColor: Colors.white),
      ),
    ]),
  ));
}
