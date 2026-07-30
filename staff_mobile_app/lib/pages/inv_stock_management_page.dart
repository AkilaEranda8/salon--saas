import 'package:flutter/material.dart';

import '../state/app_state.dart';

const _forest = Color(0xFF1B3A2D);
const _emerald = Color(0xFF2D6A4F);
const _canvas = Color(0xFFF2F5F2);

String _today() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

double _number(dynamic value) => double.tryParse('$value') ?? 0;

class InvStockManagementPage extends StatefulWidget {
  const InvStockManagementPage({this.initialTab = 0, super.key});
  final int initialTab;

  @override
  State<InvStockManagementPage> createState() => _InvStockManagementPageState();
}

class _InvStockManagementPageState extends State<InvStockManagementPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  bool _initialized = false;
  bool _loading = true;
  String _branchId = '';
  List<Map<String, String>> _branches = [];
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _receipts = [];
  List<Map<String, dynamic>> _adjustments = [];

  @override
  void initState() {
    super.initState();
    _tabs =
        TabController(
          length: 3,
          vsync: this,
          initialIndex: widget.initialTab.clamp(0, 2),
        )..addListener(() {
          if (!_tabs.indexIsChanging && mounted) setState(() {});
        });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

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
      await _load();
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _load() async {
    if (_branchId.isEmpty) return;
    setState(() => _loading = true);
    try {
      final app = AppStateScope.of(context);
      final results = await Future.wait<dynamic>([
        app.loadInventoryProducts(branchId: _branchId, consumableOnly: false),
        app.loadInventoryGoodsReceipts(branchId: _branchId),
        app.loadInventoryAdjustments(branchId: _branchId),
      ]);
      if (!mounted) return;
      setState(() {
        _products = List<Map<String, dynamic>>.from(results[0] as List);
        _receipts = List<Map<String, dynamic>>.from(results[1] as List);
        _adjustments = List<Map<String, dynamic>>.from(results[2] as List);
      });
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _openAction() async {
    if (_branchId.isEmpty) {
      _toast('Select a branch first.');
      return;
    }
    bool? saved;
    if (_tabs.index == 0) {
      saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _AddProductSheet(branchId: _branchId),
      );
    } else if (_tabs.index == 1) {
      if (_products.isEmpty) {
        _toast('Create a product first.');
        return;
      }
      saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) =>
            _GoodsReceivedSheet(branchId: _branchId, products: _products),
      );
    } else {
      if (_products.isEmpty) {
        _toast('Create a product first.');
        return;
      }
      saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) =>
            _AdjustmentSheet(branchId: _branchId, products: _products),
      );
    }
    if (saved == true) await _load();
  }

  String get _actionLabel => switch (_tabs.index) {
    0 => 'Add Product',
    1 => 'Receive Goods',
    _ => 'Adjustment',
  };

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
          title: const Text('Stock Management'),
        ),
        body: const Center(child: Text('Manager access is required.')),
      );
    }
    final assignedBranch = app.currentUser?.branchId?.trim() ?? '';

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        title: const Text(
          'Stock Management',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        bottom: TabBar(
          controller: _tabs,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          indicatorColor: const Color(0xFF6EE7B7),
          tabs: const [
            Tab(text: 'Products'),
            Tab(text: 'GRN'),
            Tab(text: 'Adjust'),
          ],
        ),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAction,
        backgroundColor: _emerald,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: Text(_actionLabel),
      ),
      body: Column(
        children: [
          if (assignedBranch.isEmpty)
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(12),
              child: DropdownButtonFormField<String>(
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
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(
                    controller: _tabs,
                    children: [
                      _ProductsList(products: _products),
                      _ReceiptList(receipts: _receipts),
                      _AdjustmentList(adjustments: _adjustments),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _ProductsList extends StatelessWidget {
  const _ProductsList({required this.products});
  final List<Map<String, dynamic>> products;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) return const Center(child: Text('No products'));
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
      itemCount: products.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (_, index) {
        final p = products[index];
        final stock = _number(p['current_stock']);
        final min = _number(p['min_stock']);
        return _StockCard(
          title: '${p['name'] ?? 'Product'}',
          subtitle: '${p['product_type'] ?? ''} · ${p['sku'] ?? 'No SKU'}',
          trailing: '${stock.toStringAsFixed(2)} ${p['unit'] ?? ''}',
          warning: stock <= min,
        );
      },
    );
  }
}

class _ReceiptList extends StatelessWidget {
  const _ReceiptList({required this.receipts});
  final List<Map<String, dynamic>> receipts;

  @override
  Widget build(BuildContext context) {
    if (receipts.isEmpty) return const Center(child: Text('No goods receipts'));
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
      itemCount: receipts.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (_, index) {
        final r = receipts[index];
        final items = r['items'] as List? ?? const [];
        return _StockCard(
          title: '${r['grn_number'] ?? 'GRN'}',
          subtitle: '${r['received_date'] ?? ''} · ${items.length} line(s)',
          trailing: '${r['status'] ?? ''}',
        );
      },
    );
  }
}

class _AdjustmentList extends StatelessWidget {
  const _AdjustmentList({required this.adjustments});
  final List<Map<String, dynamic>> adjustments;

  @override
  Widget build(BuildContext context) {
    if (adjustments.isEmpty) return const Center(child: Text('No adjustments'));
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
      itemCount: adjustments.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (_, index) {
        final row = adjustments[index];
        final product = row['product'] is Map
            ? row['product'] as Map
            : const {};
        final add = row['direction'] == 'add';
        return _StockCard(
          title: '${product['name'] ?? 'Product'}',
          subtitle: '${row['reason'] ?? ''} · ${row['status'] ?? ''}',
          trailing:
              '${add ? '+' : '−'}${_number(row['quantity']).toStringAsFixed(2)} ${product['unit'] ?? ''}',
          warning: !add,
        );
      },
    );
  }
}

class _StockCard extends StatelessWidget {
  const _StockCard({
    required this.title,
    required this.subtitle,
    required this.trailing,
    this.warning = false,
  });
  final String title;
  final String subtitle;
  final String trailing;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: Color(0xFF6B7280),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Text(
            trailing,
            style: TextStyle(
              color: warning ? const Color(0xFFDC2626) : _emerald,
              fontSize: 13,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _AddProductSheet extends StatefulWidget {
  const _AddProductSheet({required this.branchId});
  final String branchId;

  @override
  State<_AddProductSheet> createState() => _AddProductSheetState();
}

class _AddProductSheetState extends State<_AddProductSheet> {
  final _key = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _sku = TextEditingController();
  final _opening = TextEditingController(text: '0');
  final _min = TextEditingController(text: '0');
  final _max = TextEditingController(text: '0');
  final _cost = TextEditingController(text: '0');
  String _type = 'consumable';
  String _unit = 'pcs';
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _sku.dispose();
    _opening.dispose();
    _min.dispose();
    _max.dispose();
    _cost.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_key.currentState!.validate()) return;
    setState(() => _saving = true);
    final ok = await AppStateScope.of(context).addInventoryProduct(
      branchId: widget.branchId,
      name: _name.text,
      productType: _type,
      unit: _unit,
      openingStock: _number(_opening.text),
      minStock: _number(_min.text),
      maxStock: _number(_max.text),
      costPrice: _number(_cost.text),
      sku: _sku.text,
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      _showError(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Create Product + Opening Stock',
      saving: _saving,
      onSave: _save,
      child: Form(
        key: _key,
        child: Column(
          children: [
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(
                labelText: 'Product Name',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _sku,
              decoration: const InputDecoration(
                labelText: 'SKU (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _type,
              decoration: const InputDecoration(
                labelText: 'Product Type',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                  value: 'consumable',
                  child: Text('Consumable'),
                ),
                DropdownMenuItem(value: 'equipment', child: Text('Equipment')),
              ],
              onChanged: (v) => setState(() => _type = v ?? 'consumable'),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _unit,
              decoration: const InputDecoration(
                labelText: 'Unit',
                border: OutlineInputBorder(),
              ),
              items: const [
                'ml',
                'g',
                'kg',
                'L',
                'pcs',
              ].map((u) => DropdownMenuItem(value: u, child: Text(u))).toList(),
              onChanged: (v) => setState(() => _unit = v ?? 'pcs'),
            ),
            const SizedBox(height: 10),
            _NumberField(controller: _opening, label: 'Opening Stock'),
            const SizedBox(height: 10),
            _NumberField(controller: _cost, label: 'Cost Price'),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _NumberField(controller: _min, label: 'Min Stock'),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _NumberField(controller: _max, label: 'Max Stock'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _GoodsReceivedSheet extends StatefulWidget {
  const _GoodsReceivedSheet({required this.branchId, required this.products});
  final String branchId;
  final List<Map<String, dynamic>> products;

  @override
  State<_GoodsReceivedSheet> createState() => _GoodsReceivedSheetState();
}

class _GoodsReceivedSheetState extends State<_GoodsReceivedSheet> {
  final _key = GlobalKey<FormState>();
  final _qty = TextEditingController();
  final _cost = TextEditingController();
  final _notes = TextEditingController();
  String _productId = '';
  String _date = _today();
  bool _saving = false;

  @override
  void dispose() {
    _qty.dispose();
    _cost.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_key.currentState!.validate()) return;
    setState(() => _saving = true);
    final ok = await AppStateScope.of(context).receiveInventoryGoods(
      branchId: widget.branchId,
      receivedDate: _date,
      items: [
        {
          'product_id': int.tryParse(_productId) ?? _productId,
          'quantity_received': _number(_qty.text),
          'unit_cost': _number(_cost.text),
        },
      ],
      notes: _notes.text,
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      _showError(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Goods Received (GRN)',
      saving: _saving,
      onSave: _save,
      saveLabel: 'Confirm & Increase Stock',
      child: Form(
        key: _key,
        child: Column(
          children: [
            DropdownButtonFormField<String>(
              initialValue: _productId.isEmpty ? null : _productId,
              decoration: const InputDecoration(
                labelText: 'Product',
                border: OutlineInputBorder(),
              ),
              items: widget.products
                  .map(
                    (p) => DropdownMenuItem(
                      value: '${p['id']}',
                      child: Text('${p['name']}'),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() {
                _productId = v ?? '';
                final p = widget.products.firstWhere(
                  (item) => '${item['id']}' == _productId,
                  orElse: () => <String, dynamic>{},
                );
                _cost.text = '${p['cost_price'] ?? ''}';
              }),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 10),
            _NumberField(
              controller: _qty,
              label: 'Quantity Received',
              requiredPositive: true,
            ),
            const SizedBox(height: 10),
            _NumberField(controller: _cost, label: 'Unit Cost'),
            const SizedBox(height: 10),
            TextFormField(
              initialValue: _date,
              decoration: const InputDecoration(
                labelText: 'Received Date',
                border: OutlineInputBorder(),
              ),
              onChanged: (v) => _date = v,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _notes,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdjustmentSheet extends StatefulWidget {
  const _AdjustmentSheet({required this.branchId, required this.products});
  final String branchId;
  final List<Map<String, dynamic>> products;

  @override
  State<_AdjustmentSheet> createState() => _AdjustmentSheetState();
}

class _AdjustmentSheetState extends State<_AdjustmentSheet> {
  final _key = GlobalKey<FormState>();
  final _qty = TextEditingController();
  final _reason = TextEditingController();
  String _productId = '';
  String _direction = 'add';
  bool _saving = false;

  @override
  void dispose() {
    _qty.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_key.currentState!.validate()) return;
    setState(() => _saving = true);
    final ok = await AppStateScope.of(context).adjustInventoryStock(
      branchId: widget.branchId,
      productId: _productId,
      direction: _direction,
      quantity: _number(_qty.text),
      reason: _reason.text,
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      _showError(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Stock Adjustment (+ / −)',
      saving: _saving,
      onSave: _save,
      child: Form(
        key: _key,
        child: Column(
          children: [
            DropdownButtonFormField<String>(
              initialValue: _productId.isEmpty ? null : _productId,
              decoration: const InputDecoration(
                labelText: 'Product',
                border: OutlineInputBorder(),
              ),
              items: widget.products
                  .map(
                    (p) => DropdownMenuItem(
                      value: '${p['id']}',
                      child: Text('${p['name']}'),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _productId = v ?? ''),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _direction,
              decoration: const InputDecoration(
                labelText: 'Direction',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'add', child: Text('Add Stock (+)')),
                DropdownMenuItem(
                  value: 'remove',
                  child: Text('Remove Stock (−)'),
                ),
              ],
              onChanged: (v) => setState(() => _direction = v ?? 'add'),
            ),
            const SizedBox(height: 10),
            _NumberField(
              controller: _qty,
              label: 'Quantity',
              requiredPositive: true,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _reason,
              decoration: const InputDecoration(
                labelText: 'Reason',
                hintText: 'Damage / expired / found stock',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Required' : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _NumberField extends StatelessWidget {
  const _NumberField({
    required this.controller,
    required this.label,
    this.requiredPositive = false,
  });
  final TextEditingController controller;
  final String label;
  final bool requiredPositive;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      validator: requiredPositive
          ? (v) => _number(v) <= 0 ? 'Enter a positive quantity' : null
          : null,
    );
  }
}

class _SheetShell extends StatelessWidget {
  const _SheetShell({
    required this.title,
    required this.saving,
    required this.onSave,
    required this.child,
    this.saveLabel = 'Save',
  });
  final String title;
  final bool saving;
  final VoidCallback onSave;
  final Widget child;
  final String saveLabel;

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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),
            child,
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: saving ? null : onSave,
                child: Text(saving ? 'Saving...' : saveLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void _showError(BuildContext context) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(AppStateScope.of(context).lastError ?? 'Operation failed'),
      behavior: SnackBarBehavior.floating,
    ),
  );
}
