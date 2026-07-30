import 'package:flutter/material.dart';

import '../state/app_state.dart';

const _forest = Color(0xFF1B3A2D);
const _canvas = Color(0xFFF2F5F2);

String _dateKey(DateTime value) =>
    '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

double _number(dynamic value) => double.tryParse('$value') ?? 0;

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

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  @override
  Widget build(BuildContext context) {
    final assignedBranch =
        AppStateScope.of(context).currentUser?.branchId?.trim() ?? '';
    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        title: const Text(
          'Stock History',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                if (assignedBranch.isEmpty)
                  DropdownButtonFormField<String>(
                    initialValue: _branchId.isEmpty ? null : _branchId,
                    decoration: const InputDecoration(
                      labelText: 'Branch',
                      border: OutlineInputBorder(),
                      isDense: true,
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
                if (assignedBranch.isEmpty) const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: _movementType,
                  decoration: const InputDecoration(
                    labelText: 'Movement Type',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: const [
                    DropdownMenuItem(value: '', child: Text('All movements')),
                    DropdownMenuItem(
                      value: 'opening',
                      child: Text('Opening Stock'),
                    ),
                    DropdownMenuItem(
                      value: 'purchase',
                      child: Text('Goods Received'),
                    ),
                    DropdownMenuItem(
                      value: 'consumption',
                      child: Text('Consumption'),
                    ),
                    DropdownMenuItem(
                      value: 'adjustment',
                      child: Text('Adjustment'),
                    ),
                    DropdownMenuItem(
                      value: 'stock_count',
                      child: Text('Stock Count'),
                    ),
                  ],
                  onChanged: (value) async {
                    setState(() => _movementType = value ?? '');
                    await _load();
                  },
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _DateFilter(
                        label: 'From',
                        value: _from,
                        onTap: () => _pickDate(from: true),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _DateFilter(
                        label: 'To',
                        value: _to,
                        onTap: () => _pickDate(from: false),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _rows.isEmpty
                ? const Center(child: Text('No stock movements found'))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _rows.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 9),
                      itemBuilder: (_, index) =>
                          _MovementCard(row: _rows[index]),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _DateFilter extends StatelessWidget {
  const _DateFilter({
    required this.label,
    required this.value,
    required this.onTap,
  });
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        child: Text(value),
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

  @override
  Widget build(BuildContext context) {
    final product = row['product'] is Map ? row['product'] as Map : const {};
    final user = row['user'] is Map ? row['user'] as Map : const {};
    final change = _number(row['quantity_changed']);
    final positive = change >= 0;

    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${product['name'] ?? 'Product'}',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Text(
                '${positive ? '+' : ''}${change.toStringAsFixed(2)} ${product['unit'] ?? ''}',
                style: TextStyle(
                  color: positive
                      ? const Color(0xFF059669)
                      : const Color(0xFFDC2626),
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            '${row['movement_type'] ?? ''} · ${_dateLabel(row['moved_at'])}',
            style: const TextStyle(color: Color(0xFF6B7280), fontSize: 12),
          ),
          const SizedBox(height: 5),
          Text(
            'Opening ${_number(row['opening_qty']).toStringAsFixed(2)}  →  '
            'Closing ${_number(row['closing_qty']).toStringAsFixed(2)}',
            style: const TextStyle(
              color: Color(0xFF374151),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          if ('${row['remarks'] ?? ''}'.trim().isNotEmpty ||
              '${user['name'] ?? user['username'] ?? ''}'
                  .trim()
                  .isNotEmpty) ...[
            const SizedBox(height: 5),
            Text(
              [
                if ('${row['remarks'] ?? ''}'.trim().isNotEmpty)
                  '${row['remarks']}',
                if ('${user['name'] ?? user['username'] ?? ''}'
                    .trim()
                    .isNotEmpty)
                  '${user['name'] ?? user['username']}',
              ].join(' · '),
              style: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 11.5),
            ),
          ],
        ],
      ),
    );
  }
}
