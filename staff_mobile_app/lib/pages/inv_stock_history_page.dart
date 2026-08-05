import 'package:flutter/material.dart';

import '../state/app_state.dart';

const _forest = Color(0xFF1B3A2D);
const _emerald = Color(0xFF2D6A4F);
const _canvas = Color(0xFFF2F5F2);
const _surface = Color(0xFFFFFFFF);
const _border = Color(0xFFE5E7EB);
const _ink = Color(0xFF111827);
const _muted = Color(0xFF6B7280);

String _dateKey(DateTime value) =>
    '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

double _number(dynamic value) => double.tryParse('$value') ?? 0;

String _fmt(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

class InvStockHistoryPage extends StatefulWidget {
  const InvStockHistoryPage({super.key});

  @override
  State<InvStockHistoryPage> createState() => _InvStockHistoryPageState();
}

class _InvStockHistoryPageState extends State<InvStockHistoryPage> {
  bool _initialized = false;
  bool _loading = true;
  String _branchId = '';
  String _movementType = '';
  String _from = _dateKey(DateTime.now().subtract(const Duration(days: 30)));
  String _to = _dateKey(DateTime.now());
  List<Map<String, String>> _branches = [];
  List<Map<String, dynamic>> _rows = [];

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
    try {
      if (_branchId.isEmpty) {
        _branches = await app.loadBranches();
        if (_branches.isNotEmpty) _branchId = _branches.first['id'] ?? '';
      }
      await _load();
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _load() async {
    if (_branchId.isEmpty) {
      if (mounted) setState(() => _rows = []);
      return;
    }
    setState(() => _loading = true);
    try {
      final rows = await AppStateScope.of(context).loadInventoryHistory(
        branchId: _branchId,
        movementType: _movementType.isEmpty ? null : _movementType,
        from: _from,
        to: _to,
      );
      if (mounted) setState(() => _rows = rows);
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _pickDate({required bool from}) async {
    final current = DateTime.tryParse(from ? _from : _to) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (picked == null) return;
    setState(() {
      if (from) {
        _from = _dateKey(picked);
      } else {
        _to = _dateKey(picked);
      }
    });
    await _load();
  }

  Future<void> _setType(String type) async {
    setState(() => _movementType = type);
    await _load();
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

  int get _inCount =>
      _rows.where((r) => _number(r['quantity_changed']) >= 0).length;
  int get _outCount =>
      _rows.where((r) => _number(r['quantity_changed']) < 0).length;

  @override
  Widget build(BuildContext context) {
    final assignedBranch =
        AppStateScope.of(context).currentUser?.branchId?.trim() ?? '';

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Stock History',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 22),
            onPressed: _load,
          ),
        ],
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
                    label: 'Movements',
                    value: '${_rows.length}',
                    icon: Icons.history_rounded,
                    color: const Color(0xFFC4B5FD),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SummaryCard(
                    label: 'In (+)',
                    value: '$_inCount',
                    icon: Icons.south_west_rounded,
                    color: const Color(0xFF86EFAC),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SummaryCard(
                    label: 'Out (−)',
                    value: '$_outCount',
                    icon: Icons.north_east_rounded,
                    color: const Color(0xFFFCA5A5),
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
                      await _load();
                    },
                  ),
                  const SizedBox(height: 10),
                ],
                Row(
                  children: [
                    Expanded(
                      child: _DateChip(
                        label: 'From',
                        value: _from,
                        onTap: () => _pickDate(from: true),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _DateChip(
                        label: 'To',
                        value: _to,
                        onTap: () => _pickDate(from: false),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _FilterChip(
                        label: 'All',
                        selected: _movementType.isEmpty,
                        onTap: () => _setType(''),
                      ),
                      const SizedBox(width: 8),
                      _FilterChip(
                        label: 'Opening',
                        selected: _movementType == 'opening',
                        onTap: () => _setType('opening'),
                        color: const Color(0xFF2563EB),
                      ),
                      const SizedBox(width: 8),
                      _FilterChip(
                        label: 'GRN',
                        selected: _movementType == 'purchase',
                        onTap: () => _setType('purchase'),
                        color: const Color(0xFF059669),
                      ),
                      const SizedBox(width: 8),
                      _FilterChip(
                        label: 'Usage',
                        selected: _movementType == 'consumption',
                        onTap: () => _setType('consumption'),
                        color: const Color(0xFF0F766E),
                      ),
                      const SizedBox(width: 8),
                      _FilterChip(
                        label: 'Adjust',
                        selected: _movementType == 'adjustment',
                        onTap: () => _setType('adjustment'),
                        color: const Color(0xFF7C3AED),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _forest))
                : _rows.isEmpty
                ? const _EmptyState()
                : RefreshIndicator(
                    color: _forest,
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      itemCount: _rows.length,
                      itemBuilder: (_, index) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _MovementCard(row: _rows[index]),
                      ),
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

class _DateChip extends StatelessWidget {
  const _DateChip({
    required this.label,
    required this.value,
    required this.onTap,
  });
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: _canvas,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          height: 42,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: _border),
          ),
          child: Row(
            children: [
              const Icon(Icons.event_rounded, size: 16, color: _forest),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 10,
                        color: _muted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      value,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: _ink,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
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
          border: Border.all(
            color: selected ? c : _border,
            width: selected ? 1.4 : 1,
          ),
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
                color: const Color(0xFFF5F3FF),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFE9D5FF)),
              ),
              child: const Icon(
                Icons.history_rounded,
                color: Color(0xFF7C3AED),
                size: 28,
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'No stock movements',
              style: TextStyle(
                color: _ink,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Try another date range or movement type.',
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

class _MovementCard extends StatelessWidget {
  const _MovementCard({required this.row});
  final Map<String, dynamic> row;

  String _dateLabel(dynamic raw) {
    final parsed = DateTime.tryParse('$raw')?.toLocal();
    if (parsed == null) return '$raw';
    return '${_dateKey(parsed)} '
        '${parsed.hour.toString().padLeft(2, '0')}:'
        '${parsed.minute.toString().padLeft(2, '0')}';
  }

  Color _typeColor(String type) {
    switch (type) {
      case 'opening':
        return const Color(0xFF2563EB);
      case 'purchase':
        return const Color(0xFF059669);
      case 'consumption':
        return const Color(0xFF0F766E);
      case 'adjustment':
        return const Color(0xFF7C3AED);
      case 'stock_count':
        return const Color(0xFFD97706);
      default:
        return _muted;
    }
  }

  IconData _typeIcon(String type) {
    switch (type) {
      case 'opening':
        return Icons.flag_rounded;
      case 'purchase':
        return Icons.local_shipping_rounded;
      case 'consumption':
        return Icons.science_rounded;
      case 'adjustment':
        return Icons.tune_rounded;
      case 'stock_count':
        return Icons.fact_check_rounded;
      default:
        return Icons.swap_vert_rounded;
    }
  }

  String _typeLabel(String type) {
    switch (type) {
      case 'opening':
        return 'Opening';
      case 'purchase':
        return 'GRN';
      case 'consumption':
        return 'Usage';
      case 'adjustment':
        return 'Adjust';
      case 'stock_count':
        return 'Count';
      default:
        return type;
    }
  }

  @override
  Widget build(BuildContext context) {
    final product = row['product'] is Map ? row['product'] as Map : const {};
    final user = row['user'] is Map ? row['user'] as Map : const {};
    final change = _number(row['quantity_changed']);
    final positive = change >= 0;
    final type = '${row['movement_type'] ?? ''}';
    final typeColor = _typeColor(type);
    final unit = '${product['unit'] ?? ''}';

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
                  color: typeColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(_typeIcon(type), color: typeColor, size: 22),
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
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: typeColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            _typeLabel(type),
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: typeColor,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _dateLabel(row['moved_at']),
                            style: const TextStyle(
                              color: _muted,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Text(
                '${positive ? '+' : ''}${_fmt(change)}${unit.isEmpty ? '' : ' $unit'}',
                style: TextStyle(
                  color: positive
                      ? const Color(0xFF059669)
                      : const Color(0xFFDC2626),
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Opening ${_fmt(_number(row['opening_qty']))}  →  '
            'Closing ${_fmt(_number(row['closing_qty']))}',
            style: const TextStyle(
              color: Color(0xFF374151),
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
          if ('${row['remarks'] ?? ''}'.trim().isNotEmpty ||
              '${user['name'] ?? user['username'] ?? ''}'
                  .trim()
                  .isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              [
                if ('${row['remarks'] ?? ''}'.trim().isNotEmpty)
                  '${row['remarks']}',
                if ('${user['name'] ?? user['username'] ?? ''}'
                    .trim()
                    .isNotEmpty)
                  '${user['name'] ?? user['username']}',
              ].join(' · '),
              style: const TextStyle(
                color: _muted,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
