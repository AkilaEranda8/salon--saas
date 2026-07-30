import 'package:flutter/material.dart';

import '../state/app_state.dart';

const _forest = Color(0xFF1B3A2D);
const _blue = Color(0xFF2563EB);
const _canvas = Color(0xFFF2F5F2);

String _today() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

double _number(dynamic value) => double.tryParse('$value') ?? 0;

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
    if (!app.canManageSalonStaff) {
      if (mounted) setState(() => _loading = false);
      return;
    }
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
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = AppStateScope.of(context);
    if (!app.canManageSalonStaff) {
      return Scaffold(
        appBar: AppBar(
          backgroundColor: _forest,
          foregroundColor: Colors.white,
          title: const Text('Day End Closing'),
        ),
        body: const Center(
          child: Text(
            'Only managers and administrators can complete Day End Closing.',
          ),
        ),
      );
    }

    final assignedBranch = app.currentUser?.branchId?.trim() ?? '';
    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        title: const Text(
          'Day End Closing',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            onPressed: _loadPreview,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            onPressed: _items.isEmpty || _closing ? null : _confirm,
            style: FilledButton.styleFrom(
              backgroundColor: _blue,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            icon: _closing
                ? const SizedBox(
                    width: 17,
                    height: 17,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : const Icon(Icons.task_alt_rounded),
            label: Text(_closing ? 'Closing...' : 'Complete Day End Closing'),
          ),
        ),
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
                      await _loadPreview();
                    },
                  ),
                if (assignedBranch.isEmpty) const SizedBox(height: 10),
                InkWell(
                  onTap: _pickDate,
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Closing Date',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.event_rounded, size: 18),
                        const SizedBox(width: 8),
                        Text(_date),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            color: const Color(0xFFEFF6FF),
            padding: const EdgeInsets.all(12),
            child: Text(
              'Pending records: $_pendingCount · Grouped products: ${_items.length}',
              style: const TextStyle(
                color: Color(0xFF1D4ED8),
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _items.isEmpty
                ? const Center(
                    child: Text('No pending consumption for this date'),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: _items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 9),
                    itemBuilder: (_, index) {
                      final item = _items[index];
                      final product = item['product'] is Map
                          ? item['product'] as Map
                          : const {};
                      final current = _number(product['current_stock']);
                      final used = _number(item['quantity_used']);
                      final closing = current - used;
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
                            Text(
                              '${product['name'] ?? 'Product'}',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 9),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                _Metric(label: 'Current', value: current),
                                _Metric(
                                  label: 'Used',
                                  value: used,
                                  color: Colors.red,
                                ),
                                _Metric(
                                  label: 'Closing',
                                  value: closing,
                                  color: closing < 0 ? Colors.red : _forest,
                                ),
                              ],
                            ),
                            const SizedBox(height: 5),
                            Text(
                              'Unit: ${item['unit'] ?? product['unit'] ?? ''}',
                              style: const TextStyle(
                                color: Color(0xFF6B7280),
                                fontSize: 11.5,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
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
    this.color = const Color(0xFF374151),
  });
  final String label;
  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 11),
        ),
        const SizedBox(height: 2),
        Text(
          value.toStringAsFixed(2),
          style: TextStyle(
            color: color,
            fontSize: 14,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}
