import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';

const _forest = Color(0xFF1B3A2D);
const _emerald = Color(0xFF2D6A4F);
const _canvas = Color(0xFFF2F5F2);
const _surface = Color(0xFFFFFFFF);
const _border = Color(0xFFE5E7EB);
const _ink = Color(0xFF111827);
const _muted = Color(0xFF6B7280);
const _units = ['ml', 'g', 'kg', 'L', 'pcs'];

String _today() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

double _number(dynamic value) => double.tryParse('$value') ?? 0;

String _unitOf(Map<String, dynamic> product) {
  final u = '${product['unit'] ?? 'pcs'}';
  return _units.contains(u) ? u : 'pcs';
}

class InvConsumptionPage extends StatefulWidget {
  const InvConsumptionPage({super.key});

  @override
  State<InvConsumptionPage> createState() => _InvConsumptionPageState();
}

class _InvConsumptionPageState extends State<InvConsumptionPage> {
  bool _initialized = false;
  bool _loading = true;
  String _status = 'pending';
  String _date = _today();
  String _branchId = '';
  List<Map<String, String>> _branches = [];
  List<Map<String, dynamic>> _rows = [];
  List<Map<String, dynamic>> _products = [];
  List<StaffMember> _staff = [];
  List<SalonService> _services = [];
  List<Customer> _customers = [];
  int _pendingCount = 0;
  int _processedCount = 0;
  int _cancelledCount = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    _branchId = AppStateScope.of(context).currentUser?.branchId?.trim() ?? '';
    _loadInitial();
  }

  Future<void> _loadInitial() async {
    final app = AppStateScope.of(context);
    setState(() => _loading = true);
    try {
      if (_branchId.isEmpty) {
        _branches = await app.loadBranches();
        if (_branches.isNotEmpty) _branchId = _branches.first['id'] ?? '';
      }
      await _reload();
    } catch (_) {
      if (mounted) _toast(app.lastError ?? 'Inventory load failed');
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _reload() async {
    if (_branchId.isEmpty) {
      if (mounted) setState(() => _rows = []);
      return;
    }
    final app = AppStateScope.of(context);
    String? error;

    Future<T?> safe<T>(Future<T> Function() run) async {
      try {
        return await run();
      } catch (e) {
        error ??= e.toString().replaceFirst('Exception: ', '');
        return null;
      }
    }

    final results = await Future.wait<dynamic>([
      safe(() => app.loadInventoryConsumptions(
            branchId: _branchId,
            status: _status.isEmpty ? null : _status,
            date: _date,
          )),
      safe(() => app.loadInventoryProducts(
            branchId: _branchId,
            consumableOnly: false,
          )),
      safe(() => app.loadStaffList(branchId: _branchId)),
      safe(() => app.loadServices()),
      safe(() => app.loadCustomers()),
      // Day totals (unfiltered by status) for summary cards
      safe(() => app.loadInventoryConsumptions(
            branchId: _branchId,
            date: _date,
          )),
    ]);
    if (!mounted) return;
    setState(() {
      if (results[0] != null) {
        _rows = List<Map<String, dynamic>>.from(results[0] as List);
      }
      if (results[1] != null) {
        // Show every active product in the branch inventory table (chemical, consumable, etc.).
        _products = List<Map<String, dynamic>>.from(results[1] as List);
      }
      if (results[2] != null) {
        _staff = List<StaffMember>.from(results[2] as List);
      }
      if (results[3] != null) {
        _services = List<SalonService>.from(results[3] as List)
            .where((s) => s.isActive)
            .toList();
      }
      if (results[4] != null) {
        _customers = List<Customer>.from(results[4] as List);
      }
      if (results[5] != null) {
        final day = List<Map<String, dynamic>>.from(results[5] as List);
        _pendingCount =
            day.where((r) => '${r['status']}' == 'pending').length;
        _processedCount =
            day.where((r) => '${r['status']}' == 'processed').length;
        _cancelledCount =
            day.where((r) => '${r['status']}' == 'cancelled').length;
      }
    });
    if (error != null &&
        (_services.isEmpty || _products.isEmpty || _customers.isEmpty)) {
      _toast(error!);
    }
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    try {
      await _reload();
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _pickDate() async {
    final initial = DateTime.tryParse(_date) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (picked == null) return;
    setState(() {
      _date =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
    await _refresh();
  }

  Future<void> _openRecord() async {
    if (_branchId.isEmpty) {
      _toast('Select a branch first.');
      return;
    }

    final app = AppStateScope.of(context);
    // Always refresh products + services before opening the sheet.
    try {
      final results = await Future.wait([
        app.loadInventoryProducts(
          branchId: _branchId,
          consumableOnly: false,
        ),
        app.loadServices(),
      ]);
      if (mounted) {
        setState(() {
          _products = List<Map<String, dynamic>>.from(results[0] as List);
          _services = List<SalonService>.from(results[1] as List)
              .where((s) => s.isActive)
              .toList();
        });
      }
    } catch (e) {
      if (_products.isEmpty || _services.isEmpty) {
        _toast(
          e.toString().replaceFirst('Exception: ', ''),
        );
      }
    }

    if (!mounted) return;
    if (_products.isEmpty) {
      _toast('No products found for this branch.');
      return;
    }

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RecordConsumptionSheet(
        branchId: _branchId,
        date: _date,
        products: _products,
        staff: _staff,
        services: _services,
        customers: _customers,
      ),
    );
    if (saved == true) await _refresh();
  }

  Future<void> _cancelRow(Map<String, dynamic> row) async {
    if ('${row['status']}' != 'pending') return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this usage?'),
        content: const Text('Pending usage will be cancelled. Stock is unchanged.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Cancel usage'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final success = await AppStateScope.of(context).cancelInventoryConsumption(
      consumptionId: '${row['id']}',
    );
    if (!mounted) return;
    if (success) {
      _toast('Usage cancelled.');
      await _refresh();
    } else {
      _toast(AppStateScope.of(context).lastError ?? 'Cancel failed');
    }
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

  Future<void> _setStatus(String status) async {
    setState(() => _status = status);
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final assignedBranch =
        AppStateScope.of(context).currentUser?.branchId?.trim() ?? '';
    final dayTotal = _pendingCount + _processedCount + _cancelledCount;

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Product Usage',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 22),
            onPressed: _refresh,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openRecord,
        backgroundColor: _emerald,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text(
          'Record Usage',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
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
                  child: _UsageSummaryCard(
                    label: 'Pending',
                    value: '$_pendingCount',
                    icon: Icons.hourglass_top_rounded,
                    color: const Color(0xFFFCD34D),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _UsageSummaryCard(
                    label: 'Processed',
                    value: '$_processedCount',
                    icon: Icons.task_alt_rounded,
                    color: const Color(0xFF86EFAC),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _UsageSummaryCard(
                    label: 'Today',
                    value: '$dayTotal',
                    icon: Icons.science_rounded,
                    color: const Color(0xFF93C5FD),
                  ),
                ),
              ],
            ),
          ),
          Container(
            color: _surface,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
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
                      await _refresh();
                    },
                  ),
                  const SizedBox(height: 10),
                ],
                Row(
                  children: [
                    Expanded(
                      child: Material(
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
                                const Icon(
                                  Icons.event_rounded,
                                  size: 18,
                                  color: _forest,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _date,
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
                                  size: 20,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _UsageFilterChip(
                        label: 'Pending',
                        selected: _status == 'pending',
                        onTap: () => _setStatus('pending'),
                        color: const Color(0xFFD97706),
                      ),
                      const SizedBox(width: 8),
                      _UsageFilterChip(
                        label: 'Processed',
                        selected: _status == 'processed',
                        onTap: () => _setStatus('processed'),
                        color: const Color(0xFF059669),
                      ),
                      const SizedBox(width: 8),
                      _UsageFilterChip(
                        label: 'Cancelled',
                        selected: _status == 'cancelled',
                        onTap: () => _setStatus('cancelled'),
                        color: const Color(0xFFDC2626),
                      ),
                      const SizedBox(width: 8),
                      _UsageFilterChip(
                        label: 'All',
                        selected: _status.isEmpty,
                        onTap: () => _setStatus(''),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            color: const Color(0xFFECFDF5),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: const Row(
              children: [
                Icon(Icons.info_outline_rounded, size: 16, color: Color(0xFF047857)),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Usage stays pending. Stock is deducted only at Day End Closing.',
                    style: TextStyle(
                      color: Color(0xFF047857),
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
                ? const Center(
                    child: CircularProgressIndicator(color: _forest),
                  )
                : _rows.isEmpty
                ? _UsageEmptyState(
                    status: _status,
                    onRecord: _openRecord,
                  )
                : RefreshIndicator(
                    color: _forest,
                    onRefresh: _refresh,
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                      itemCount: _rows.length,
                      itemBuilder: (_, index) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ConsumptionCard(
                          row: _rows[index],
                          onCancel: () => _cancelRow(_rows[index]),
                        ),
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _UsageSummaryCard extends StatelessWidget {
  const _UsageSummaryCard({
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
                const SizedBox(height: 1),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.3,
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

class _UsageFilterChip extends StatelessWidget {
  const _UsageFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.color,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? _emerald;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? c.withValues(alpha: 0.14) : _canvas,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: selected ? c : _border, width: selected ? 1.4 : 1),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            color: selected ? c : _muted,
          ),
        ),
      ),
    );
  }
}

class _UsageEmptyState extends StatelessWidget {
  const _UsageEmptyState({required this.status, required this.onRecord});
  final String status;
  final VoidCallback onRecord;

  @override
  Widget build(BuildContext context) {
    final label = switch (status) {
      'pending' => 'No pending usage',
      'processed' => 'No processed usage',
      'cancelled' => 'No cancelled usage',
      _ => 'No usage records',
    };
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
                color: const Color(0xFFECFDF5),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFA7F3D0)),
              ),
              child: const Icon(
                Icons.science_rounded,
                color: _forest,
                size: 28,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              label,
              style: const TextStyle(
                color: _ink,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Record consumable usage during the day.\nStock decreases at Day End.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _muted,
                fontSize: 13,
                height: 1.4,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: onRecord,
              style: FilledButton.styleFrom(
                backgroundColor: _emerald,
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text(
                'Record Usage',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConsumptionCard extends StatelessWidget {
  const _ConsumptionCard({required this.row, required this.onCancel});
  final Map<String, dynamic> row;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final product = row['product'] is Map ? row['product'] as Map : const {};
    final staff = row['staff'] is Map ? row['staff'] as Map : const {};
    final service = row['service'] is Map ? row['service'] as Map : const {};
    final customer = row['customer'] is Map ? row['customer'] as Map : const {};
    final status = '${row['status'] ?? 'pending'}';
    final pending = status == 'pending';
    final cancelled = status == 'cancelled';
    final qty = _number(row['quantity_used']);
    final unit = '${row['unit'] ?? product['unit'] ?? ''}';
    final qtyLabel = qty == qty.roundToDouble()
        ? qty.toStringAsFixed(0)
        : qty.toStringAsFixed(2);

    final statusColor = pending
        ? const Color(0xFFD97706)
        : cancelled
            ? const Color(0xFFDC2626)
            : const Color(0xFF059669);
    final statusBg = pending
        ? const Color(0xFFFEF3C7)
        : cancelled
            ? const Color(0xFFFEE2E2)
            : const Color(0xFFDCFCE7);

    final meta = [
      if ('${customer['name'] ?? ''}'.trim().isNotEmpty) '${customer['name']}',
      if ('${service['name'] ?? ''}'.trim().isNotEmpty) '${service['name']}',
      if ('${staff['name'] ?? ''}'.trim().isNotEmpty) '${staff['name']}',
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _border),
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFF0F766E).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.science_rounded,
                  color: Color(0xFF0F766E),
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
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
                    const SizedBox(height: 4),
                    Text(
                      '$qtyLabel${unit.isEmpty ? '' : ' $unit'}',
                      style: const TextStyle(
                        color: _emerald,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '${row['consumption_date'] ?? ''}'
            '${meta.isEmpty ? '' : ' · $meta'}',
            style: const TextStyle(
              color: _muted,
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
            ),
          ),
          if ('${row['reason'] ?? ''}'.trim().isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              '${row['reason']}',
              style: const TextStyle(
                color: _muted,
                fontSize: 12.5,
                height: 1.35,
              ),
            ),
          ],
          if (pending) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onCancel,
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFDC2626),
                  visualDensity: VisualDensity.compact,
                ),
                icon: const Icon(Icons.close_rounded, size: 16),
                label: const Text(
                  'Cancel usage',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProductLine {
  _ProductLine({
    required this.productId,
    required this.name,
    required this.stockLabel,
    required this.unit,
  });

  final String productId;
  final String name;
  final String stockLabel;
  bool selected = false;
  String unit;
  final TextEditingController qty = TextEditingController();

  void dispose() => qty.dispose();
}

class _RecordConsumptionSheet extends StatefulWidget {
  const _RecordConsumptionSheet({
    required this.branchId,
    required this.date,
    required this.products,
    required this.staff,
    required this.services,
    required this.customers,
  });

  final String branchId;
  final String date;
  final List<Map<String, dynamic>> products;
  final List<StaffMember> staff;
  final List<SalonService> services;
  final List<Customer> customers;

  @override
  State<_RecordConsumptionSheet> createState() =>
      _RecordConsumptionSheetState();
}

class _RecordConsumptionSheetState extends State<_RecordConsumptionSheet> {
  final _reason = TextEditingController();
  final _productSearch = TextEditingController();
  late final List<_ProductLine> _lines;
  String _staffId = '';
  String _customerId = '';
  String _serviceId = '';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _lines = widget.products.map((p) {
      final stock = _number(p['current_stock']).toStringAsFixed(2);
      final unit = _unitOf(p);
      return _ProductLine(
        productId: '${p['id']}',
        name: '${p['name'] ?? 'Product'}',
        stockLabel: '$stock $unit left',
        unit: unit,
      );
    }).toList();
  }

  @override
  void dispose() {
    _reason.dispose();
    _productSearch.dispose();
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }

  List<_ProductLine> get _filteredLines {
    final q = _productSearch.text.trim().toLowerCase();
    if (q.isEmpty) return _lines;
    return _lines.where((l) => l.name.toLowerCase().contains(q)).toList();
  }

  Customer? get _selectedCustomer {
    if (_customerId.isEmpty) return null;
    for (final c in widget.customers) {
      if (c.id == _customerId) return c;
    }
    return null;
  }

  SalonService? get _selectedService {
    if (_serviceId.isEmpty) return null;
    for (final s in widget.services) {
      if (s.id == _serviceId) return s;
    }
    return null;
  }

  int get _selectedCount => _lines.where((l) => l.selected).length;

  Future<void> _pickCustomer() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CustomerPickerSheet(
        customers: widget.customers,
        selectedId: _customerId,
      ),
    );
    if (picked == null || !mounted) return;
    setState(() => _customerId = picked);
  }

  Future<void> _pickService() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ServicePickerSheet(
        services: widget.services,
        selectedId: _serviceId,
      ),
    );
    if (picked == null || !mounted) return;
    setState(() => _serviceId = picked);
  }

  Future<void> _save() async {
    final selected = _lines.where((l) => l.selected).toList();
    if (selected.isEmpty) {
      _toast('Tick at least one product');
      return;
    }
    for (final line in selected) {
      final qty = double.tryParse(line.qty.text.trim()) ?? 0;
      if (qty <= 0) {
        _toast('Enter a valid quantity for ${line.name}');
        return;
      }
    }

    setState(() => _saving = true);
    final app = AppStateScope.of(context);
    var okCount = 0;
    String? lastError;
    for (final line in selected) {
      final qty = double.tryParse(line.qty.text.trim()) ?? 0;
      final ok = await app.recordInventoryConsumption(
        branchId: widget.branchId,
        productId: line.productId,
        quantity: qty,
        date: widget.date,
        unit: line.unit,
        staffId: _staffId.isEmpty ? null : _staffId,
        customerId: _customerId.isEmpty ? null : _customerId,
        serviceId: _serviceId.isEmpty ? null : _serviceId,
        reason: _reason.text,
      );
      if (ok) {
        okCount += 1;
      } else {
        lastError = app.lastError;
      }
    }
    if (!mounted) return;
    setState(() => _saving = false);

    if (okCount == selected.length) {
      Navigator.of(context).pop(true);
      return;
    }
    if (okCount > 0) {
      _toast('$okCount saved, ${selected.length - okCount} failed');
      Navigator.of(context).pop(true);
      return;
    }
    _toast(lastError ?? 'Failed to record usage');
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: const TextStyle(
            color: Color(0xFF6B7280),
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      );

  InputDecoration _deco(
    String hint,
    IconData icon, {
    bool required = false,
    bool dense = false,
  }) =>
      InputDecoration(
        hintText: required ? hint : (hint.contains('optional') ? hint : '$hint (optional)'),
        hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _forest, size: 19),
        filled: true,
        fillColor: const Color(0xFFF9FAFB),
        isDense: dense,
        contentPadding: EdgeInsets.symmetric(
          horizontal: 14,
          vertical: dense ? 10 : 13,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _forest, width: 1.8),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final height = MediaQuery.of(context).size.height * 0.92;
    final filteredLines = _filteredLines;

    return Container(
      height: height,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 10),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFFE5E7EB),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 16, 0),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: const Color(0xFFECFDF5),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFA7F3D0)),
                  ),
                  child: const Icon(Icons.science_rounded, color: _forest, size: 19),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Record Product Usage',
                        style: TextStyle(
                          color: Color(0xFF111827),
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2,
                        ),
                      ),
                      Text(
                        'Select products & optional customer details',
                        style: TextStyle(
                          color: Color(0xFFADB5BD),
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(),
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.close_rounded, size: 16, color: Color(0xFF6B7280)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          const Divider(height: 1, color: Color(0xFFF3F4F6)),
          Expanded(
            child: ListView(
              padding: EdgeInsets.fromLTRB(20, 16, 20, 12),
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFECFDF5),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFA7F3D0)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.event_rounded, size: 18, color: _forest),
                      const SizedBox(width: 8),
                      Text(
                        'Usage date · ${widget.date}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: _forest,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                _label('STYLIST'),
                DropdownButtonFormField<String>(
                  initialValue: _staffId,
                  isExpanded: true,
                  decoration: _deco('Select stylist', Icons.person_outline_rounded),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('None')),
                    ...widget.staff.map(
                      (s) => DropdownMenuItem(
                        value: s.id,
                        child: Text(s.name, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                  ],
                  onChanged: (value) => setState(() => _staffId = value ?? ''),
                ),
                const SizedBox(height: 14),
                _label('CUSTOMER'),
                Material(
                  color: const Color(0xFFF9FAFB),
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: _pickCustomer,
                    child: InputDecorator(
                      decoration: _deco(
                        widget.customers.isEmpty
                            ? 'No customers loaded from server'
                            : 'Tap to search · ${widget.customers.length} customers',
                        Icons.people_outline_rounded,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              _selectedCustomer == null
                                  ? (widget.customers.isEmpty
                                      ? 'No customers loaded'
                                      : 'None selected')
                                  : (_selectedCustomer!.phone.trim().isEmpty
                                      ? _selectedCustomer!.name
                                      : '${_selectedCustomer!.name} — ${_selectedCustomer!.phone}'),
                              style: TextStyle(
                                color: _selectedCustomer == null
                                    ? const Color(0xFFB0B8B0)
                                    : const Color(0xFF111827),
                                fontSize: 14,
                                fontWeight: _selectedCustomer == null
                                    ? FontWeight.w500
                                    : FontWeight.w600,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (_customerId.isNotEmpty)
                            GestureDetector(
                              onTap: () => setState(() => _customerId = ''),
                              child: const Padding(
                                padding: EdgeInsets.only(right: 4),
                                child: Icon(
                                  Icons.close_rounded,
                                  size: 18,
                                  color: Color(0xFF9CA3AF),
                                ),
                              ),
                            ),
                          const Icon(
                            Icons.keyboard_arrow_down_rounded,
                            color: Color(0xFF9CA3AF),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _label('SERVICE'),
                Material(
                  color: const Color(0xFFF9FAFB),
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: _pickService,
                    child: InputDecorator(
                      decoration: _deco(
                        widget.services.isEmpty
                            ? 'No services loaded from server'
                            : 'Tap to search · ${widget.services.length} services',
                        Icons.content_cut_rounded,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              _selectedService == null
                                  ? (widget.services.isEmpty
                                      ? 'No services loaded'
                                      : 'None selected')
                                  : (_selectedService!.category.trim().isEmpty
                                      ? _selectedService!.name
                                      : '${_selectedService!.name} — ${_selectedService!.category}'),
                              style: TextStyle(
                                color: _selectedService == null
                                    ? const Color(0xFFB0B8B0)
                                    : const Color(0xFF111827),
                                fontSize: 14,
                                fontWeight: _selectedService == null
                                    ? FontWeight.w500
                                    : FontWeight.w600,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (_serviceId.isNotEmpty)
                            GestureDetector(
                              onTap: () => setState(() => _serviceId = ''),
                              child: const Padding(
                                padding: EdgeInsets.only(right: 4),
                                child: Icon(
                                  Icons.close_rounded,
                                  size: 18,
                                  color: Color(0xFF9CA3AF),
                                ),
                              ),
                            ),
                          const Icon(
                            Icons.keyboard_arrow_down_rounded,
                            color: Color(0xFF9CA3AF),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _label('REASON'),
                TextField(
                  controller: _reason,
                  maxLines: 2,
                  decoration: _deco('e.g. Hair wash', Icons.notes_rounded),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    const Text(
                      'PRODUCTS',
                      style: TextStyle(
                        color: Color(0xFF6B7280),
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: _selectedCount > 0
                            ? const Color(0xFFECFDF5)
                            : const Color(0xFFF3F4F6),
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Text(
                        '$_selectedCount selected',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: _selectedCount > 0 ? _emerald : const Color(0xFF98A2B3),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _productSearch,
                  decoration: _deco('Search products', Icons.search_rounded, dense: true)
                      .copyWith(hintText: 'Search products'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 10),
                ...filteredLines.map((line) {
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.fromLTRB(8, 8, 10, 10),
                    decoration: BoxDecoration(
                      color: line.selected
                          ? const Color(0xFFECFDF5)
                          : const Color(0xFFF9FAFB),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: line.selected
                            ? const Color(0xFFA7F3D0)
                            : _border,
                      ),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Checkbox(
                              value: line.selected,
                              activeColor: _emerald,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(5),
                              ),
                              onChanged: (v) {
                                setState(() => line.selected = v ?? false);
                              },
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    line.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13.5,
                                      color: Color(0xFF111827),
                                    ),
                                  ),
                                  Text(
                                    line.stockLabel,
                                    style: const TextStyle(
                                      color: Color(0xFF6B7280),
                                      fontSize: 11.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (line.selected)
                          Padding(
                            padding: const EdgeInsets.only(left: 8, right: 4, top: 4),
                            child: Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: line.qty,
                                    keyboardType: const TextInputType.numberWithOptions(
                                      decimal: true,
                                    ),
                                    decoration: _deco('Qty', Icons.scale_rounded, dense: true)
                                        .copyWith(hintText: 'Qty'),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                SizedBox(
                                  width: 110,
                                  child: DropdownButtonFormField<String>(
                                    initialValue: line.unit,
                                    decoration: InputDecoration(
                                      filled: true,
                                      fillColor: const Color(0xFFF9FAFB),
                                      isDense: true,
                                      contentPadding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 10,
                                      ),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide: const BorderSide(color: _border),
                                      ),
                                      enabledBorder: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                        borderSide: const BorderSide(color: _border),
                                      ),
                                    ),
                                    items: _units
                                        .map(
                                          (u) => DropdownMenuItem(value: u, child: Text(u)),
                                        )
                                        .toList(),
                                    onChanged: (value) {
                                      setState(() => line.unit = value ?? line.unit);
                                    },
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  );
                }),
                if (filteredLines.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text(
                        'No products match your search.',
                        style: TextStyle(color: Color(0xFF6B7280)),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Container(
            padding: EdgeInsets.fromLTRB(20, 12, 20, bottom + 20),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Color(0xFFF3F4F6))),
            ),
            child: GestureDetector(
              onTap: _saving ? null : _save,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 15),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: _saving
                        ? [const Color(0xFF93C5AA), const Color(0xFF93C5AA)]
                        : const [_forest, _emerald],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: _forest.withValues(alpha: 0.28),
                      blurRadius: 14,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (_saving)
                      const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    else
                      const Icon(Icons.save_rounded, color: Colors.white, size: 18),
                    const SizedBox(width: 9),
                    Text(
                      _saving
                          ? 'Saving...'
                          : (_selectedCount > 0
                              ? 'Save Pending ($_selectedCount)'
                              : 'Save Pending'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CustomerPickerSheet extends StatefulWidget {
  const _CustomerPickerSheet({
    required this.customers,
    required this.selectedId,
  });

  final List<Customer> customers;
  final String selectedId;

  @override
  State<_CustomerPickerSheet> createState() => _CustomerPickerSheetState();
}

class _CustomerPickerSheetState extends State<_CustomerPickerSheet> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Customer> get _filtered {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return widget.customers;
    return widget.customers.where((c) {
      return c.name.toLowerCase().contains(q) ||
          c.phone.toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final items = _filtered;
    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(bottom: bottom),
      child: Column(
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: const Color(0xFFE5E7EB),
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Select customer',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF111827),
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context, ''),
                  child: const Text('Clear'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
            child: TextField(
              controller: _search,
              autofocus: true,
              decoration: InputDecoration(
                hintText: widget.customers.isEmpty
                    ? 'No customers on server'
                    : 'Search name or phone · ${widget.customers.length}',
                prefixIcon: const Icon(Icons.search_rounded, color: _forest),
                filled: true,
                fillColor: const Color(0xFFF9FAFB),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _forest, width: 1.8),
                ),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          Expanded(
            child: items.isEmpty
                ? Center(
                    child: Text(
                      widget.customers.isEmpty
                          ? 'Customers did not load from server.'
                          : 'No matching customers',
                      style: const TextStyle(
                        color: Color(0xFF6B7280),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                : ListView.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, __) =>
                        const Divider(height: 1, color: Color(0xFFF3F4F6)),
                    itemBuilder: (context, index) {
                      final c = items[index];
                      final selected = c.id == widget.selectedId;
                      final phone = c.phone.trim();
                      return ListTile(
                        selected: selected,
                        selectedTileColor: const Color(0xFFECFDF5),
                        title: Text(
                          c.name,
                          style: TextStyle(
                            fontWeight:
                                selected ? FontWeight.w800 : FontWeight.w600,
                            color: const Color(0xFF111827),
                          ),
                        ),
                        subtitle: phone.isEmpty
                            ? null
                            : Text(
                                phone,
                                style: const TextStyle(
                                  color: Color(0xFF6B7280),
                                  fontSize: 12.5,
                                ),
                              ),
                        trailing: selected
                            ? const Icon(
                                Icons.check_circle_rounded,
                                color: _emerald,
                              )
                            : null,
                        onTap: () => Navigator.pop(context, c.id),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _ServicePickerSheet extends StatefulWidget {
  const _ServicePickerSheet({
    required this.services,
    required this.selectedId,
  });

  final List<SalonService> services;
  final String selectedId;

  @override
  State<_ServicePickerSheet> createState() => _ServicePickerSheetState();
}

class _ServicePickerSheetState extends State<_ServicePickerSheet> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<SalonService> get _filtered {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return widget.services;
    return widget.services.where((s) {
      return s.name.toLowerCase().contains(q) ||
          s.category.toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final items = _filtered;
    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(bottom: bottom),
      child: Column(
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: const Color(0xFFE5E7EB),
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Select service',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF111827),
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context, ''),
                  child: const Text('Clear'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
            child: TextField(
              controller: _search,
              autofocus: true,
              decoration: InputDecoration(
                hintText: widget.services.isEmpty
                    ? 'No services on server'
                    : 'Search ${widget.services.length} services',
                prefixIcon: const Icon(Icons.search_rounded, color: _forest),
                filled: true,
                fillColor: const Color(0xFFF9FAFB),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _forest, width: 1.8),
                ),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          Expanded(
            child: items.isEmpty
                ? Center(
                    child: Text(
                      widget.services.isEmpty
                          ? 'Services did not load from server.'
                          : 'No matching services',
                      style: const TextStyle(
                        color: Color(0xFF6B7280),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                : ListView.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, __) =>
                        const Divider(height: 1, color: Color(0xFFF3F4F6)),
                    itemBuilder: (context, index) {
                      final s = items[index];
                      final selected = s.id == widget.selectedId;
                      final subtitle = s.category.trim();
                      return ListTile(
                        selected: selected,
                        selectedTileColor: const Color(0xFFECFDF5),
                        title: Text(
                          s.name,
                          style: TextStyle(
                            fontWeight:
                                selected ? FontWeight.w800 : FontWeight.w600,
                            color: const Color(0xFF111827),
                          ),
                        ),
                        subtitle: subtitle.isEmpty
                            ? null
                            : Text(
                                subtitle,
                                style: const TextStyle(
                                  color: Color(0xFF6B7280),
                                  fontSize: 12.5,
                                ),
                              ),
                        trailing: selected
                            ? const Icon(
                                Icons.check_circle_rounded,
                                color: _emerald,
                              )
                            : null,
                        onTap: () => Navigator.pop(context, s.id),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
