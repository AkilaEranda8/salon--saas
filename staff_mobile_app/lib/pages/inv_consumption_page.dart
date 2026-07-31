import 'package:flutter/material.dart';

import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';

const _forest = Color(0xFF1B3A2D);
const _emerald = Color(0xFF2D6A4F);
const _canvas = Color(0xFFF2F5F2);
const _border = Color(0xFFE5E7EB);

String _today() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

double _number(dynamic value) => double.tryParse('$value') ?? 0;

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
    final results = await Future.wait<dynamic>([
      app.loadInventoryConsumptions(
        branchId: _branchId,
        status: _status.isEmpty ? null : _status,
        date: _date,
      ),
      app.loadInventoryProducts(branchId: _branchId),
      app.loadStaffList(branchId: _branchId),
      app.loadServices(),
    ]);
    if (!mounted) return;
    setState(() {
      _rows = List<Map<String, dynamic>>.from(results[0] as List);
      _products = List<Map<String, dynamic>>.from(
        results[1] as List,
      ).where((p) => p['product_type'] == 'consumable').toList();
      _staff = List<StaffMember>.from(results[2] as List);
      _services = List<SalonService>.from(results[3] as List);
    });
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
    if (_products.isEmpty) {
      _toast('No Consumable products found for this branch.');
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
          'Product Consumption',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            onPressed: _refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openRecord,
        backgroundColor: _emerald,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Record Usage'),
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
                      await _refresh();
                    },
                  ),
                if (assignedBranch.isEmpty) const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _status,
                        decoration: const InputDecoration(
                          labelText: 'Status',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: const [
                          DropdownMenuItem(value: '', child: Text('All')),
                          DropdownMenuItem(
                            value: 'pending',
                            child: Text('Pending'),
                          ),
                          DropdownMenuItem(
                            value: 'processed',
                            child: Text('Processed'),
                          ),
                          DropdownMenuItem(
                            value: 'cancelled',
                            child: Text('Cancelled'),
                          ),
                        ],
                        onChanged: (value) async {
                          setState(() => _status = value ?? '');
                          await _refresh();
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: InkWell(
                        onTap: _pickDate,
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Date',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.event_rounded, size: 18),
                              const SizedBox(width: 7),
                              Text(_date),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            color: const Color(0xFFECFDF5),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: const Text(
              'Usage is saved as pending. Stock is deducted only at Day End Closing.',
              style: TextStyle(color: Color(0xFF047857), fontSize: 12),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _rows.isEmpty
                ? const Center(child: Text('No consumption records'))
                : RefreshIndicator(
                    onRefresh: _refresh,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
                      itemCount: _rows.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 9),
                      itemBuilder: (_, index) => _ConsumptionCard(
                        row: _rows[index],
                        onCancel: () => _cancelRow(_rows[index]),
                      ),
                    ),
                  ),
          ),
        ],
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
    final status = '${row['status'] ?? 'pending'}';
    final pending = status == 'pending';

    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
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
                    color: Color(0xFF111827),
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: pending
                      ? const Color(0xFFFEF3C7)
                      : status == 'cancelled'
                          ? const Color(0xFFFEE2E2)
                          : const Color(0xFFDCFCE7),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    color: pending
                        ? const Color(0xFF92400E)
                        : status == 'cancelled'
                            ? const Color(0xFFDC2626)
                            : const Color(0xFF166534),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            '${_number(row['quantity_used']).toStringAsFixed(2)} ${row['unit'] ?? product['unit'] ?? ''}',
            style: const TextStyle(
              color: _emerald,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            '${row['consumption_date'] ?? ''}'
            '${staff['name'] != null ? ' · ${staff['name']}' : ''}'
            '${service['name'] != null ? ' · ${service['name']}' : ''}',
            style: const TextStyle(color: Color(0xFF6B7280), fontSize: 12),
          ),
          if ('${row['reason'] ?? ''}'.trim().isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              '${row['reason']}',
              style: const TextStyle(color: Color(0xFF6B7280), fontSize: 12),
            ),
          ],
          if (pending) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onCancel,
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFDC2626),
                  visualDensity: VisualDensity.compact,
                ),
                child: const Text('Cancel usage'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RecordConsumptionSheet extends StatefulWidget {
  const _RecordConsumptionSheet({
    required this.branchId,
    required this.date,
    required this.products,
    required this.staff,
    required this.services,
  });

  final String branchId;
  final String date;
  final List<Map<String, dynamic>> products;
  final List<StaffMember> staff;
  final List<SalonService> services;

  @override
  State<_RecordConsumptionSheet> createState() =>
      _RecordConsumptionSheetState();
}

class _RecordConsumptionSheetState extends State<_RecordConsumptionSheet> {
  final _formKey = GlobalKey<FormState>();
  final _quantity = TextEditingController();
  final _reason = TextEditingController();
  String _productId = '';
  String _staffId = '';
  String _serviceId = '';
  bool _saving = false;

  @override
  void dispose() {
    _quantity.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final product = widget.products.firstWhere(
      (p) => '${p['id']}' == _productId,
      orElse: () => <String, dynamic>{},
    );
    final quantity = double.tryParse(_quantity.text.trim()) ?? 0;
    setState(() => _saving = true);
    final ok = await AppStateScope.of(context).recordInventoryConsumption(
      branchId: widget.branchId,
      productId: _productId,
      quantity: quantity,
      date: widget.date,
      unit: '${product['unit'] ?? 'pcs'}',
      staffId: _staffId.isEmpty ? null : _staffId,
      serviceId: _serviceId.isEmpty ? null : _serviceId,
      reason: _reason.text,
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppStateScope.of(context).lastError ?? 'Failed'),
        ),
      );
      return;
    }
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(18, 18, 18, bottom + 22),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Record Product Usage',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 5),
              const Text(
                'Only Consumable products are available. Stock will not change yet.',
                style: TextStyle(color: Color(0xFF6B7280), fontSize: 12),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _productId.isEmpty ? null : _productId,
                decoration: const InputDecoration(
                  labelText: 'Consumable Product',
                  border: OutlineInputBorder(),
                ),
                items: widget.products
                    .map(
                      (p) => DropdownMenuItem(
                        value: '${p['id']}',
                        child: Text('${p['name']} (${p['unit']})'),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setState(() => _productId = value ?? ''),
                validator: (value) =>
                    value == null || value.isEmpty ? 'Select a product' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _quantity,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Quantity Used',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if ((double.tryParse(value ?? '') ?? 0) <= 0) {
                    return 'Enter a positive quantity';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _staffId,
                decoration: const InputDecoration(
                  labelText: 'Stylist (optional)',
                  border: OutlineInputBorder(),
                ),
                items: [
                  const DropdownMenuItem(value: '', child: Text('None')),
                  ...widget.staff.map(
                    (s) => DropdownMenuItem(value: s.id, child: Text(s.name)),
                  ),
                ],
                onChanged: (value) => setState(() => _staffId = value ?? ''),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _serviceId,
                decoration: const InputDecoration(
                  labelText: 'Service (optional)',
                  border: OutlineInputBorder(),
                ),
                items: [
                  const DropdownMenuItem(value: '', child: Text('None')),
                  ...widget.services.map(
                    (s) => DropdownMenuItem(value: s.id, child: Text(s.name)),
                  ),
                ],
                onChanged: (value) => setState(() => _serviceId = value ?? ''),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _reason,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Reason (optional)',
                  hintText: 'e.g. Hair wash',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_rounded),
                  label: Text(_saving ? 'Saving...' : 'Save Pending'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
