import 'package:flutter/material.dart';

import '../state/app_state.dart';

const _forest = Color(0xFF1B3A2D);
const _emerald = Color(0xFF2D6A4F);
const _blue = Color(0xFF2563EB);
const _canvas = Color(0xFFF2F5F2);
const _surface = Color(0xFFFFFFFF);
const _border = Color(0xFFE5E7EB);
const _ink = Color(0xFF111827);
const _muted = Color(0xFF6B7280);

String _today() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

double _number(dynamic value) => double.tryParse('$value') ?? 0;

String _fmt(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

class InvDayEndPage extends StatefulWidget {
  const InvDayEndPage({super.key});

  @override
  State<InvDayEndPage> createState() => _InvDayEndPageState();
}

class _InvDayEndPageState extends State<InvDayEndPage> {
  bool _initialized = false;
  bool _loading = true;
  bool _closing = false;
  String _branchId = '';
  String _date = _today();
  int _pendingCount = 0;
  List<Map<String, String>> _branches = [];
  List<Map<String, dynamic>> _items = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    final app = AppStateScope.of(context);
    _branchId = app.currentUser?.branchId?.trim() ?? '';
    _loadInitial();
  }

  Future<void> _loadInitial() async {
    final app = AppStateScope.of(context);
    try {
      if (_branchId.isEmpty) {
        _branches = await app.loadBranches();
        if (_branches.isNotEmpty) _branchId = _branches.first['id'] ?? '';
      }
      await _loadPreview();
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadPreview() async {
    if (_branchId.isEmpty) {
      if (mounted) {
        setState(() {
          _pendingCount = 0;
          _items = [];
        });
      }
      return;
    }
    setState(() => _loading = true);
    try {
      final data = await AppStateScope.of(
        context,
      ).loadInventoryDayEndPreview(branchId: _branchId, date: _date);
      final raw = data['items'] as List? ?? const [];
      if (!mounted) return;
      setState(() {
        _pendingCount = int.tryParse('${data['pendingCount'] ?? 0}') ?? 0;
        _items = raw
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      });
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_date) ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (picked == null) return;
    setState(() {
      _date =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
    await _loadPreview();
  }

  Future<void> _confirm() async {
    if (_items.isEmpty || _branchId.isEmpty) return;
    final accepted = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Complete Day End Closing?'),
        content: Text(
          'This will deduct $_pendingCount pending usage records from stock. '
          'The stock movements will be saved in History.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: _blue),
            child: const Text('Confirm Closing'),
          ),
        ],
      ),
    );
    if (accepted != true || !mounted) return;

    setState(() => _closing = true);
    final payload = _items.map((item) {
      return <String, dynamic>{
        'product_id': item['product_id'],
        'quantity_used': _number(item['quantity_used']),
        'unit': item['unit'] ?? 'pcs',
        'consumption_ids': item['consumption_ids'] is List
            ? List<dynamic>.from(item['consumption_ids'] as List)
            : <dynamic>[],
      };
    }).toList();
    final ok = await AppStateScope.of(context).closeInventoryDay(
      branchId: _branchId,
      date: _date,
      items: payload,
      notes: 'Mobile Day End Closing',
    );
    if (!mounted) return;
    setState(() => _closing = false);
    if (!ok) {
      _toast(AppStateScope.of(context).lastError ?? 'Day End Closing failed');
      return;
    }
    _toast('Day End Closing completed. Stock deducted successfully.');
    await _loadPreview();
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: _forest,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = AppStateScope.of(context);
    final assignedBranch = app.currentUser?.branchId?.trim() ?? '';

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Day End Closing',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 22),
            onPressed: _loadPreview,
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: GestureDetector(
            onTap: _items.isEmpty || _closing ? null : _confirm,
            child: Opacity(
              opacity: _items.isEmpty || _closing ? 0.5 : 1,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 15),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF1D4ED8), Color(0xFF3B82F6)],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: _blue.withValues(alpha: 0.28),
                      blurRadius: 14,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: _closing
                    ? const Center(
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        ),
                      )
                    : const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.task_alt_rounded, color: Colors.white, size: 18),
                          SizedBox(width: 9),
                          Text(
                            'Complete Day End Closing',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          Container(
            color: _forest,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
            child: Row(
              children: [
                Expanded(
                  child: _SummaryCard(
                    label: 'Pending',
                    value: '$_pendingCount',
                    icon: Icons.hourglass_top_rounded,
                    color: const Color(0xFFFCD34D),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SummaryCard(
                    label: 'Products',
                    value: '${_items.length}',
                    icon: Icons.inventory_2_rounded,
                    color: const Color(0xFF93C5FD),
                  ),
                ),
              ],
            ),
          ),
          Container(
            color: _surface,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Column(
              children: [
                if (assignedBranch.isEmpty) ...[
                  DropdownButtonFormField<String>(
                    initialValue: _branchId.isEmpty ? null : _branchId,
                    decoration: InputDecoration(
                      labelText: 'Branch',
                      filled: true,
                      fillColor: _canvas,
                      isDense: true,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: _border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: _border),
                      ),
                    ),
                    items: _branches
                        .map(
                          (b) => DropdownMenuItem(
                            value: b['id'],
                            child: Text(b['name'] ?? ''),
                          ),
                        )
                        .toList(),
                    onChanged: (value) async {
                      setState(() => _branchId = value ?? '');
                      await _loadPreview();
                    },
                  ),
                  const SizedBox(height: 10),
                ],
                Material(
                  color: _canvas,
                  borderRadius: BorderRadius.circular(10),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: _pickDate,
                    child: Container(
                      height: 42,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: _border),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.event_rounded, size: 18, color: _forest),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Closing date · $_date',
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w700,
                                color: _ink,
                              ),
                            ),
                          ),
                          const Icon(
                            Icons.keyboard_arrow_down_rounded,
                            color: _muted,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            color: const Color(0xFFEFF6FF),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: const Row(
              children: [
                Icon(Icons.info_outline_rounded, size: 16, color: Color(0xFF1D4ED8)),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Confirming deducts pending usage from stock and writes History.',
                    style: TextStyle(
                      color: Color(0xFF1D4ED8),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _forest))
                : _items.isEmpty
                ? const _EmptyState()
                : RefreshIndicator(
                    color: _forest,
                    onRefresh: _loadPreview,
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      itemCount: _items.length,
                      itemBuilder: (_, index) {
                        final item = _items[index];
                        final product = item['product'] is Map
                            ? item['product'] as Map
                            : const {};
                        final current = _number(product['current_stock']);
                        final used = _number(item['quantity_used']);
                        final closing = current - used;
                        final unit = '${item['unit'] ?? product['unit'] ?? ''}';
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: _surface,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: closing < 0
                                  ? const Color(0xFFFECACA)
                                  : _border,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.03),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: _blue.withValues(alpha: 0.12),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: const Icon(
                                      Icons.inventory_2_rounded,
                                      color: _blue,
                                      size: 22,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${product['name'] ?? 'Product'}',
                                          style: const TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w800,
                                            color: _ink,
                                            letterSpacing: -0.2,
                                          ),
                                        ),
                                        if (unit.isNotEmpty) ...[
                                          const SizedBox(height: 3),
                                          Text(
                                            'Unit · $unit',
                                            style: const TextStyle(
                                              color: _muted,
                                              fontSize: 12,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: _Metric(
                                      label: 'Current',
                                      value: _fmt(current),
                                    ),
                                  ),
                                  Expanded(
                                    child: _Metric(
                                      label: 'Used',
                                      value: _fmt(used),
                                      color: const Color(0xFFDC2626),
                                    ),
                                  ),
                                  Expanded(
                                    child: _Metric(
                                      label: 'Closing',
                                      value: _fmt(closing),
                                      color: closing < 0
                                          ? const Color(0xFFDC2626)
                                          : _emerald,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });
  final String label, value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 17, color: color),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: Colors.white70,
                  ),
                ),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.label,
    required this.value,
    this.color = _ink,
  });
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: const TextStyle(
            color: _muted,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          style: TextStyle(
            color: color,
            fontSize: 15,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFBFDBFE)),
              ),
              child: const Icon(Icons.task_alt_rounded, color: _blue, size: 28),
            ),
            const SizedBox(height: 14),
            const Text(
              'Nothing to close',
              style: TextStyle(
                color: _ink,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'No pending usage for this date.\nRecord usage first, then come back.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _muted,
                fontSize: 13,
                height: 1.4,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
