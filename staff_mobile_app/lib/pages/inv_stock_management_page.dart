import 'package:flutter/material.dart';

import '../state/app_state.dart';

// ── Palette (same as Expenses / Services) ─────────────────────────────────────
const Color _forest = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border = Color(0xFFE5E7EB);
const Color _ink = Color(0xFF111827);
const Color _muted = Color(0xFF6B7280);
const Color _red = Color(0xFFDC2626);

String _today() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

double _number(dynamic value) => double.tryParse('$value') ?? 0;

String _fmtQty(dynamic n, [String? unit]) {
  final v = _number(n);
  final s = v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);
  return unit == null || unit.isEmpty ? s : '$s $unit';
}

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
  String _search = '';
  String _typeFilter = '';
  bool _lowOnly = false;
  List<Map<String, String>> _branches = [];
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _receipts = [];
  List<Map<String, dynamic>> _adjustments = [];
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabs = TabController(
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
    _searchCtrl.dispose();
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
    if (!app.canManageInventoryStock) {
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
        app.loadInventoryProducts(
          branchId: _branchId,
          consumableOnly: false,
          q: _search.isEmpty ? null : _search,
          productType: _typeFilter.isEmpty ? null : _typeFilter,
          lowStockOnly: _lowOnly,
        ),
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
        builder: (_) => _ProductSheet(branchId: _branchId),
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

  Future<void> _editProduct(Map<String, dynamic> product) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProductSheet(branchId: _branchId, product: product),
    );
    if (saved == true) await _load();
  }

  Future<void> _deactivateProduct(Map<String, dynamic> product) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Deactivate product?'),
        content: Text(
          '${product['name'] ?? 'This product'} will be marked inactive.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: _red),
            child: const Text('Deactivate'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final success = await AppStateScope.of(context).deactivateInventoryProduct(
      productId: '${product['id']}',
    );
    if (!mounted) return;
    if (success) {
      _toast('Product deactivated.');
      await _load();
    } else {
      _toast(AppStateScope.of(context).lastError ?? 'Deactivate failed');
    }
  }

  String get _actionLabel => switch (_tabs.index) {
        0 => 'Add Product',
        1 => 'Receive Goods',
        _ => 'Adjustment',
      };

  int get _lowStockCount => _products.where((p) {
        return _number(p['current_stock']) <= _number(p['min_stock']);
      }).length;

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
    if (!app.canManageInventoryStock) {
      return Scaffold(
        backgroundColor: _canvas,
        appBar: AppBar(
          backgroundColor: _forest,
          foregroundColor: Colors.white,
          elevation: 0,
          title: const Text(
            'Stock Management',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
        ),
        body: const Center(
          child: Text(
            'Manager access is required.',
            style: TextStyle(color: _muted, fontWeight: FontWeight.w600),
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
        elevation: 0,
        title: const Text(
          'Stock Management',
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAction,
        backgroundColor: _emerald,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: Text(
          _actionLabel,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
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
                    label: 'Products',
                    value: '${_products.length}',
                    icon: Icons.inventory_2_rounded,
                    color: const Color(0xFFFCD34D),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SummaryCard(
                    label: 'Low stock',
                    value: '$_lowStockCount',
                    icon: Icons.warning_amber_rounded,
                    color: const Color(0xFFFCA5A5),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SummaryCard(
                    label: 'GRNs',
                    value: '${_receipts.length}',
                    icon: Icons.local_shipping_rounded,
                    color: const Color(0xFF86EFAC),
                  ),
                ),
              ],
            ),
          ),
          Container(
            color: _surface,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
            child: Row(
              children: [
                _PillTab(
                  label: 'Products',
                  selected: _tabs.index == 0,
                  onTap: () => _tabs.animateTo(0),
                ),
                const SizedBox(width: 8),
                _PillTab(
                  label: 'GRN',
                  selected: _tabs.index == 1,
                  onTap: () => _tabs.animateTo(1),
                ),
                const SizedBox(width: 8),
                _PillTab(
                  label: 'Adjust',
                  selected: _tabs.index == 2,
                  onTap: () => _tabs.animateTo(2),
                ),
              ],
            ),
          ),
          if (assignedBranch.isEmpty)
            Container(
              color: _surface,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: DropdownButtonFormField<String>(
                initialValue: _branchId.isEmpty ? null : _branchId,
                decoration: InputDecoration(
                  labelText: 'Branch',
                  filled: true,
                  fillColor: _canvas,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: _border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: _border),
                  ),
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
          if (_tabs.index == 0)
            Container(
              color: _surface,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Column(
                children: [
                  Container(
                    height: 40,
                    decoration: BoxDecoration(
                      color: _canvas,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: _border),
                    ),
                    child: TextField(
                      controller: _searchCtrl,
                      style: const TextStyle(fontSize: 13, color: _ink),
                      textInputAction: TextInputAction.search,
                      onSubmitted: (v) {
                        setState(() => _search = v.trim());
                        _load();
                      },
                      decoration: InputDecoration(
                        hintText: 'Search name / SKU / brand…',
                        hintStyle: const TextStyle(color: _muted, fontSize: 13),
                        prefixIcon: const Icon(
                          Icons.search_rounded,
                          size: 18,
                          color: _muted,
                        ),
                        suffixIcon: _search.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(
                                  Icons.clear_rounded,
                                  size: 18,
                                  color: _muted,
                                ),
                                onPressed: () {
                                  _searchCtrl.clear();
                                  setState(() => _search = '');
                                  _load();
                                },
                              ),
                        border: InputBorder.none,
                        contentPadding:
                            const EdgeInsets.symmetric(vertical: 11),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _FilterChip(
                          label: 'All',
                          selected: _typeFilter.isEmpty && !_lowOnly,
                          onTap: () {
                            setState(() {
                              _typeFilter = '';
                              _lowOnly = false;
                            });
                            _load();
                          },
                        ),
                        const SizedBox(width: 8),
                        _FilterChip(
                          label: 'Consumable',
                          selected: _typeFilter == 'consumable',
                          color: const Color(0xFF2563EB),
                          onTap: () {
                            setState(() {
                              _typeFilter = 'consumable';
                              _lowOnly = false;
                            });
                            _load();
                          },
                        ),
                        const SizedBox(width: 8),
                        _FilterChip(
                          label: 'Equipment',
                          selected: _typeFilter == 'equipment',
                          color: const Color(0xFFD97706),
                          onTap: () {
                            setState(() {
                              _typeFilter = 'equipment';
                              _lowOnly = false;
                            });
                            _load();
                          },
                        ),
                        const SizedBox(width: 8),
                        _FilterChip(
                          label: 'Low stock',
                          selected: _lowOnly,
                          color: _red,
                          onTap: () {
                            setState(() => _lowOnly = !_lowOnly);
                            _load();
                          },
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const Divider(height: 1, color: _border),
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: _emerald),
                  )
                : TabBarView(
                    controller: _tabs,
                    children: [
                      _ProductsList(
                        products: _products,
                        onEdit: _editProduct,
                        onDeactivate: _deactivateProduct,
                      ),
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

class _PillTab extends StatelessWidget {
  const _PillTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? _forest : _canvas,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: selected ? _forest : _border),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : _muted,
            ),
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
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? c.withValues(alpha: 0.12) : _canvas,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? c : _border),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: selected ? c : _muted,
          ),
        ),
      ),
    );
  }
}

Widget _emptyState({
  required IconData icon,
  required String title,
  required String subtitle,
}) {
  return Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 48, color: _muted.withValues(alpha: 0.4)),
        const SizedBox(height: 12),
        Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: _muted,
          ),
        ),
        const SizedBox(height: 4),
        Text(subtitle, style: const TextStyle(fontSize: 13, color: _muted)),
      ],
    ),
  );
}

class _ProductsList extends StatelessWidget {
  const _ProductsList({
    required this.products,
    required this.onEdit,
    required this.onDeactivate,
  });
  final List<Map<String, dynamic>> products;
  final Future<void> Function(Map<String, dynamic>) onEdit;
  final Future<void> Function(Map<String, dynamic>) onDeactivate;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) {
      return _emptyState(
        icon: Icons.inventory_2_outlined,
        title: 'No products yet',
        subtitle: 'Add a product with opening stock to start',
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
      itemCount: products.length,
      itemBuilder: (_, index) {
        final p = products[index];
        final stock = _number(p['current_stock']);
        final min = _number(p['min_stock']);
        final low = stock <= min;
        final type = '${p['product_type'] ?? 'consumable'}';
        final typeColor = type == 'equipment'
            ? const Color(0xFFD97706)
            : const Color(0xFF2563EB);
        final meta = [
          if ('${p['sku'] ?? ''}'.trim().isNotEmpty) '${p['sku']}',
          if ('${p['brand'] ?? ''}'.trim().isNotEmpty) '${p['brand']}',
        ].join(' · ');

        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: low ? const Color(0xFFFECACA) : _border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: typeColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  type == 'equipment'
                      ? Icons.build_rounded
                      : Icons.science_rounded,
                  color: typeColor,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${p['name'] ?? 'Product'}',
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
                            type,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: typeColor,
                            ),
                          ),
                        ),
                        if (meta.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              meta,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12, color: _muted),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      low
                          ? 'In stock ${_fmtQty(stock, '${p['unit']}')}  ·  alert ${_fmtQty(min)}  ⚠'
                          : 'In stock ${_fmtQty(stock, '${p['unit']}')}  ·  alert ${_fmtQty(min)}',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: low ? _red : _emerald,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                children: [
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    onPressed: () => onEdit(p),
                    icon: const Icon(
                      Icons.edit_rounded,
                      size: 18,
                      color: Color(0xFFD97706),
                    ),
                    tooltip: 'Edit',
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    onPressed: () => onDeactivate(p),
                    icon: const Icon(
                      Icons.delete_outline_rounded,
                      size: 18,
                      color: _red,
                    ),
                    tooltip: 'Deactivate',
                  ),
                ],
              ),
            ],
          ),
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
    if (receipts.isEmpty) {
      return _emptyState(
        icon: Icons.local_shipping_outlined,
        title: 'No goods receipts',
        subtitle: 'Receive goods to increase stock',
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
      itemCount: receipts.length,
      itemBuilder: (_, index) {
        final r = receipts[index];
        final items = r['items'] as List? ?? const [];
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _border),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.local_shipping_rounded,
                  color: Color(0xFF059669),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${r['grn_number'] ?? 'GRN'}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: _ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${r['received_date'] ?? ''} · ${items.length} line(s)',
                      style: const TextStyle(fontSize: 12, color: _muted),
                    ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFDCFCE7),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${r['status'] ?? 'confirmed'}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF166534),
                  ),
                ),
              ),
            ],
          ),
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
    if (adjustments.isEmpty) {
      return _emptyState(
        icon: Icons.tune_rounded,
        title: 'No adjustments',
        subtitle: 'Add or remove stock with a reason',
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
      itemCount: adjustments.length,
      itemBuilder: (_, index) {
        final row = adjustments[index];
        final product =
            row['product'] is Map ? row['product'] as Map : const {};
        final add = row['direction'] == 'add';
        final color = add ? _emerald : _red;
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _border),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  add ? Icons.add_circle_rounded : Icons.remove_circle_rounded,
                  color: color,
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
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: _ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${row['reason'] ?? ''}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: _muted),
                    ),
                  ],
                ),
              ),
              Text(
                '${add ? '+' : '−'}${_fmtQty(row['quantity'], '${product['unit'] ?? ''}')}',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ProductSheet extends StatefulWidget {
  const _ProductSheet({required this.branchId, this.product});
  final String branchId;
  final Map<String, dynamic>? product;

  @override
  State<_ProductSheet> createState() => _ProductSheetState();
}

class _ProductSheetState extends State<_ProductSheet> {
  final _key = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _sku;
  late final TextEditingController _brand;
  late final TextEditingController _opening;
  late final TextEditingController _min;
  late final TextEditingController _cost;
  late String _type;
  late String _unit;
  bool _saving = false;
  String _error = '';

  bool get _isEdit => widget.product != null;

  static const _units = ['ml', 'g', 'kg', 'L', 'pcs'];

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    _name = TextEditingController(text: '${p?['name'] ?? ''}');
    _sku = TextEditingController(text: '${p?['sku'] ?? ''}');
    _brand = TextEditingController(text: '${p?['brand'] ?? ''}');
    _opening = TextEditingController(text: '0');
    _min = TextEditingController(
      text: p == null ? '0' : _number(p['min_stock']).toStringAsFixed(0),
    );
    _cost = TextEditingController(
      text: p == null
          ? ''
          : (_number(p['cost_price']) == 0
              ? ''
              : '${_number(p['cost_price'])}'),
    );
    _type = '${p?['product_type'] ?? 'consumable'}';
    if (_type != 'consumable' && _type != 'equipment') _type = 'consumable';
    _unit = '${p?['unit'] ?? 'ml'}';
    if (!_units.contains(_unit)) _unit = 'ml';
  }

  @override
  void dispose() {
    _name.dispose();
    _sku.dispose();
    _brand.dispose();
    _opening.dispose();
    _min.dispose();
    _cost.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_key.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = '';
    });
    final app = AppStateScope.of(context);
    final bool ok;
    if (_isEdit) {
      ok = await app.updateInventoryProduct(
        productId: '${widget.product!['id']}',
        name: _name.text,
        productType: _type,
        unit: _unit,
        minStock: _number(_min.text),
        costPrice: _number(_cost.text),
        sku: _sku.text,
        brand: _brand.text,
      );
    } else {
      ok = await app.addInventoryProduct(
        branchId: widget.branchId,
        name: _name.text,
        productType: _type,
        unit: _unit,
        openingStock: _number(_opening.text),
        minStock: _number(_min.text),
        costPrice: _number(_cost.text),
        sku: _sku.text,
        brand: _brand.text,
      );
    }
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _error = app.lastError ?? 'Save failed.';
        _saving = false;
      });
    }
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: const TextStyle(
            color: _muted,
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      );

  InputDecoration _deco(String hint, IconData icon, {bool required = false}) =>
      InputDecoration(
        hintText: required ? hint : '$hint (optional)',
        hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _forest, size: 19),
        filled: true,
        fillColor: _canvas,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
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
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _forest, width: 1.8),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFF43F5E)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, bottom + 28),
        child: Form(
          key: _key,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12, bottom: 18),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE5E7EB),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFA7F3D0)),
                    ),
                    child: const Icon(
                      Icons.inventory_2_rounded,
                      color: _forest,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _isEdit ? 'Edit Product' : 'Add Product',
                          style: const TextStyle(
                            color: _ink,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.2,
                          ),
                        ),
                        Text(
                          _isEdit
                              ? 'Update product details'
                              : 'Create product with opening stock',
                          style: const TextStyle(
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
                      child: const Icon(
                        Icons.close_rounded,
                        size: 16,
                        color: _muted,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),

              if (_error.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFEE2E2)),
                  ),
                  child: Text(
                    _error,
                    style: const TextStyle(fontSize: 13, color: _red),
                  ),
                ),

              _label('PRODUCT NAME'),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: _deco(
                  'e.g. Shampoo 1L',
                  Icons.label_outline_rounded,
                  required: true,
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Name is required' : null,
              ),
              const SizedBox(height: 14),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('TYPE'),
                        DropdownButtonFormField<String>(
                          initialValue: _type,
                          isExpanded: true,
                          decoration: _deco('Type', Icons.category_outlined),
                          items: const [
                            DropdownMenuItem(
                              value: 'consumable',
                              child: Text('Consumable'),
                            ),
                            DropdownMenuItem(
                              value: 'equipment',
                              child: Text('Equipment'),
                            ),
                          ],
                          onChanged: (v) =>
                              setState(() => _type = v ?? 'consumable'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('UNIT'),
                        DropdownButtonFormField<String>(
                          initialValue: _unit,
                          isExpanded: true,
                          decoration: _deco('Unit', Icons.straighten_rounded),
                          items: _units
                              .map(
                                (u) => DropdownMenuItem(
                                  value: u,
                                  child: Text(u),
                                ),
                              )
                              .toList(),
                          onChanged: (v) => setState(() => _unit = v ?? 'ml'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('COST PRICE'),
                        TextFormField(
                          controller: _cost,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: _deco('0', Icons.payments_outlined),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label(
                          _isEdit ? 'LOW STOCK ALERT' : 'OPENING STOCK',
                        ),
                        TextFormField(
                          controller: _isEdit ? _min : _opening,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: _deco(
                            '0',
                            _isEdit
                                ? Icons.notifications_none_rounded
                                : Icons.inventory_rounded,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (!_isEdit) ...[
                const SizedBox(height: 14),
                _label('LOW STOCK ALERT AT'),
                TextFormField(
                  controller: _min,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: _deco('0', Icons.notifications_none_rounded),
                ),
              ],
              const SizedBox(height: 14),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('SKU'),
                        TextFormField(
                          controller: _sku,
                          decoration: _deco('SKU code', Icons.qr_code_rounded),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('BRAND'),
                        TextFormField(
                          controller: _brand,
                          decoration:
                              _deco('Brand name', Icons.storefront_outlined),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFECFDF5),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFA7F3D0)),
                ),
                child: const Text(
                  'Only Consumable products can be recorded as usage. Equipment is tracked for stock but never consumed.',
                  style: TextStyle(
                    color: Color(0xFF047857),
                    fontSize: 12,
                    height: 1.4,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(height: 22),

              Container(
                height: 1,
                color: _border,
                margin: const EdgeInsets.only(bottom: 20),
              ),

              GestureDetector(
                onTap: _saving ? null : _save,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [_forest, _emerald],
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
                  child: _saving
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
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              _isEdit
                                  ? Icons.check_circle_rounded
                                  : Icons.add_circle_rounded,
                              color: Colors.white,
                              size: 18,
                            ),
                            const SizedBox(width: 9),
                            Text(
                              _isEdit ? 'Save Changes' : 'Add Product',
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
            ],
          ),
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
  String _error = '';

  static const _units = ['ml', 'g', 'kg', 'L', 'pcs'];

  @override
  void dispose() {
    _qty.dispose();
    _cost.dispose();
    _notes.dispose();
    super.dispose();
  }

  Map<String, dynamic>? get _selectedProduct {
    if (_productId.isEmpty) return null;
    for (final p in widget.products) {
      if ('${p['id']}' == _productId) return p;
    }
    return null;
  }

  String get _unit {
    final raw = '${_selectedProduct?['unit'] ?? ''}';
    return _units.contains(raw) ? raw : (raw.isEmpty ? 'pcs' : raw);
  }

  Future<void> _pickProduct() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProductPickerSheet(
        products: widget.products,
        selectedId: _productId,
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _productId = picked;
      final p = _selectedProduct;
      if (p != null) {
        final cost = _number(p['cost_price']);
        _cost.text = cost == 0 ? '' : '$cost';
      }
    });
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
  }

  Future<void> _save() async {
    if (_productId.isEmpty) {
      setState(() => _error = 'Select a product');
      return;
    }
    if (!_key.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = '';
    });
    final ok = await AppStateScope.of(context).receiveInventoryGoods(
      branchId: widget.branchId,
      receivedDate: _date,
      items: [
        {
          'product_id': int.tryParse(_productId) ?? _productId,
          'quantity_received': _number(_qty.text),
          'unit_cost': _number(_cost.text),
          'unit': _unit,
        },
      ],
      notes: _notes.text,
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _error =
            AppStateScope.of(context).lastError ?? 'Goods received failed.';
        _saving = false;
      });
    }
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: const TextStyle(
            color: _muted,
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      );

  InputDecoration _deco(String hint, IconData icon, {bool required = false}) =>
      InputDecoration(
        hintText: required ? hint : '$hint (optional)',
        hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _forest, size: 19),
        filled: true,
        fillColor: _canvas,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
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
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _forest, width: 1.8),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFF43F5E)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final product = _selectedProduct;
    final stock = product == null
        ? null
        : _fmtQty(product['current_stock'], _unit);

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, bottom + 28),
      child: Form(
        key: _key,
        child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
          children: [
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12, bottom: 18),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE5E7EB),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFA7F3D0)),
                    ),
                    child: const Icon(
                      Icons.local_shipping_rounded,
                      color: _forest,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Goods Received',
                          style: TextStyle(
                            color: _ink,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.2,
                          ),
                        ),
                        Text(
                          'GRN — receive goods and increase stock',
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
                      child: const Icon(
                        Icons.close_rounded,
                        size: 16,
                        color: _muted,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),

              if (_error.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFEE2E2)),
                  ),
                  child: Text(
                    _error,
                    style: const TextStyle(fontSize: 13, color: _red),
                  ),
                ),

              _label('PRODUCT'),
              Material(
                color: _canvas,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _pickProduct,
                  child: InputDecorator(
                    decoration: _deco(
                      widget.products.isEmpty
                          ? 'No products loaded'
                          : 'Tap to search · ${widget.products.length} products',
                      Icons.inventory_2_outlined,
                      required: true,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            product == null
                                ? (widget.products.isEmpty
                                    ? 'No products loaded'
                                    : 'Select product')
                                : '${product['name']}',
                            style: TextStyle(
                              color: product == null
                                  ? const Color(0xFFB0B8B0)
                                  : _ink,
                              fontSize: 14,
                              fontWeight: product == null
                                  ? FontWeight.w500
                                  : FontWeight.w600,
                            ),
                            overflow: TextOverflow.ellipsis,
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
              if (stock != null) ...[
                const SizedBox(height: 8),
                Text(
                  'Current stock · $stock',
                  style: const TextStyle(
                    color: Color(0xFF047857),
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(height: 14),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 3,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('QUANTITY'),
                        TextFormField(
              controller: _qty,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: _deco(
                            'e.g. 10',
                            Icons.numbers_rounded,
                            required: true,
                          ),
                          validator: (v) => _number(v) <= 0
                              ? 'Enter a positive quantity'
                              : null,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('UNIT'),
                        InputDecorator(
                          decoration: _deco(
                            product == null ? '—' : _unit,
                            Icons.straighten_rounded,
                          ),
                          child: Text(
                            product == null ? '—' : _unit,
                            style: TextStyle(
                              color: product == null
                                  ? const Color(0xFFB0B8B0)
                                  : _ink,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (product != null) ...[
                const SizedBox(height: 6),
                Text(
                  'Receiving in $_unit (from product)',
                  style: const TextStyle(
                    color: _muted,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
              const SizedBox(height: 14),

              _label('UNIT COST'),
            TextFormField(
                controller: _cost,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: _deco(
                  _unit == 'pcs' ? 'Cost per piece' : 'Cost per $_unit',
                  Icons.payments_outlined,
                ),
              ),
              const SizedBox(height: 14),

              _label('RECEIVED DATE'),
              Material(
                color: _canvas,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _pickDate,
                  child: InputDecorator(
                    decoration: _deco(_date, Icons.event_rounded, required: true),
                    child: Text(
                      _date,
                      style: const TextStyle(
                        color: _ink,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),

              _label('NOTES'),
            TextFormField(
              controller: _notes,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: _deco(
                  'Supplier / invoice note',
                  Icons.notes_rounded,
                ),
              ),
              const SizedBox(height: 16),

              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFECFDF5),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFA7F3D0)),
                ),
                child: Text(
                  product == null
                      ? 'Stock increases immediately when you confirm GRN.'
                      : 'Confirming will add ${_qty.text.trim().isEmpty ? '…' : _qty.text.trim()} $_unit to ${product['name']}.',
                  style: const TextStyle(
                    color: Color(0xFF047857),
                    fontSize: 12,
                    height: 1.4,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(height: 22),

              Container(
                height: 1,
                color: _border,
                margin: const EdgeInsets.only(bottom: 20),
              ),

              GestureDetector(
                onTap: _saving ? null : _save,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [_forest, _emerald],
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
                  child: _saving
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
                            Icon(
                              Icons.add_circle_rounded,
                              color: Colors.white,
                              size: 18,
                            ),
                            SizedBox(width: 9),
                            Text(
                              'Confirm & Increase Stock',
                              style: TextStyle(
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
            ],
          ),
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
  String _error = '';

  @override
  void dispose() {
    _qty.dispose();
    _reason.dispose();
    super.dispose();
  }

  Map<String, dynamic>? get _selectedProduct {
    if (_productId.isEmpty) return null;
    for (final p in widget.products) {
      if ('${p['id']}' == _productId) return p;
    }
    return null;
  }

  Future<void> _pickProduct() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProductPickerSheet(
        products: widget.products,
        selectedId: _productId,
      ),
    );
    if (picked == null || !mounted) return;
    setState(() => _productId = picked);
  }

  Future<void> _save() async {
    if (_productId.isEmpty) {
      setState(() => _error = 'Select a product');
      return;
    }
    if (!_key.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = '';
    });
    final ok = await AppStateScope.of(context).adjustInventoryStock(
      branchId: widget.branchId,
      productId: _productId,
      direction: _direction,
      quantity: _number(_qty.text),
      reason: _reason.text,
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _error =
            AppStateScope.of(context).lastError ?? 'Adjustment failed.';
        _saving = false;
      });
    }
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: const TextStyle(
            color: _muted,
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      );

  InputDecoration _deco(String hint, IconData icon, {bool required = false}) =>
      InputDecoration(
        hintText: required ? hint : '$hint (optional)',
        hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _forest, size: 19),
        filled: true,
        fillColor: _canvas,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
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
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _forest, width: 1.8),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFF43F5E)),
        ),
      );

  Widget _directionChip({
    required String value,
    required String label,
    required IconData icon,
    required Color color,
  }) {
    final selected = _direction == value;
    return Expanded(
      child: Material(
        color: selected ? color.withValues(alpha: 0.12) : _canvas,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => setState(() => _direction = value),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected ? color : _border,
                width: selected ? 1.6 : 1,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 18, color: selected ? color : _muted),
                const SizedBox(width: 7),
                Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13.5,
                    color: selected ? color : _ink,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final product = _selectedProduct;
    final unit = product == null ? '' : '${product['unit'] ?? ''}';
    final stock = product == null
        ? null
        : _fmtQty(product['current_stock'], unit);

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, bottom + 28),
      child: Form(
        key: _key,
        child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
          children: [
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12, bottom: 18),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE5E7EB),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3E8FF),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFE9D5FF)),
                    ),
                    child: const Icon(
                      Icons.tune_rounded,
                      color: Color(0xFF7C3AED),
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Stock Adjustment',
                          style: TextStyle(
                            color: _ink,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.2,
                          ),
                        ),
                        Text(
                          'Immediate stock + or − with reason',
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
                      child: const Icon(
                        Icons.close_rounded,
                        size: 16,
                        color: _muted,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),

              if (_error.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFEE2E2)),
                  ),
                  child: Text(
                    _error,
                    style: const TextStyle(fontSize: 13, color: _red),
                  ),
                ),

              _label('PRODUCT'),
              Material(
                color: _canvas,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _pickProduct,
                  child: InputDecorator(
                    decoration: _deco(
                      widget.products.isEmpty
                          ? 'No products loaded'
                          : 'Tap to search · ${widget.products.length} products',
                      Icons.inventory_2_outlined,
                      required: true,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            product == null
                                ? (widget.products.isEmpty
                                    ? 'No products loaded'
                                    : 'Select product')
                                : '${product['name']}',
                            style: TextStyle(
                              color: product == null
                                  ? const Color(0xFFB0B8B0)
                                  : _ink,
                              fontSize: 14,
                              fontWeight: product == null
                                  ? FontWeight.w500
                                  : FontWeight.w600,
                            ),
                            overflow: TextOverflow.ellipsis,
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
              if (stock != null) ...[
                const SizedBox(height: 8),
                Text(
                  'Current stock · $stock',
                  style: const TextStyle(
                    color: Color(0xFF047857),
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(height: 14),

              _label('DIRECTION'),
              Row(
                children: [
                  _directionChip(
                    value: 'add',
                    label: 'Add (+)',
                    icon: Icons.add_circle_outline_rounded,
                    color: const Color(0xFF059669),
                  ),
                  const SizedBox(width: 10),
                  _directionChip(
                  value: 'remove',
                    label: 'Remove (−)',
                    icon: Icons.remove_circle_outline_rounded,
                    color: const Color(0xFFDC2626),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              _label('QUANTITY'),
              TextFormField(
              controller: _qty,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: _deco(
                  unit.isEmpty ? 'e.g. 10' : 'e.g. 10 $unit',
                  Icons.numbers_rounded,
                  required: true,
                ),
                validator: (v) =>
                    _number(v) <= 0 ? 'Enter a positive quantity' : null,
              ),
              const SizedBox(height: 14),

              _label('REASON'),
            TextFormField(
              controller: _reason,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: _deco(
                  'Damage / expired / found stock',
                  Icons.notes_rounded,
                  required: true,
              ),
              validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Reason is required' : null,
              ),
              const SizedBox(height: 16),

              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF5F3FF),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE9D5FF)),
                ),
                child: const Text(
                  'Adjustments apply immediately — no Day End step. Use a clear reason for audit history.',
                  style: TextStyle(
                    color: Color(0xFF6D28D9),
                    fontSize: 12,
                    height: 1.4,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(height: 22),

              Container(
                height: 1,
                color: _border,
                margin: const EdgeInsets.only(bottom: 20),
              ),

              GestureDetector(
                onTap: _saving ? null : _save,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: _direction == 'remove'
                          ? const [Color(0xFF9F1239), Color(0xFFDC2626)]
                          : const [_forest, _emerald],
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                    ),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: (_direction == 'remove'
                                ? const Color(0xFFDC2626)
                                : _forest)
                            .withValues(alpha: 0.28),
                        blurRadius: 14,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  child: _saving
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
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              _direction == 'remove'
                                  ? Icons.remove_circle_rounded
                                  : Icons.add_circle_rounded,
                              color: Colors.white,
                              size: 18,
                            ),
                            const SizedBox(width: 9),
                            Text(
                              _direction == 'remove'
                                  ? 'Remove Stock'
                                  : 'Add Stock',
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
            ],
          ),
        ),
      ),
    );
  }
}

class _ProductPickerSheet extends StatefulWidget {
  const _ProductPickerSheet({
    required this.products,
    required this.selectedId,
  });

  final List<Map<String, dynamic>> products;
  final String selectedId;

  @override
  State<_ProductPickerSheet> createState() => _ProductPickerSheetState();
}

class _ProductPickerSheetState extends State<_ProductPickerSheet> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return widget.products;
    return widget.products.where((p) {
      final name = '${p['name'] ?? ''}'.toLowerCase();
      final sku = '${p['sku'] ?? ''}'.toLowerCase();
      final brand = '${p['brand'] ?? ''}'.toLowerCase();
      return name.contains(q) || sku.contains(q) || brand.contains(q);
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
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Select product',
                style: TextStyle(
                  fontSize: 17,
                fontWeight: FontWeight.w800,
                color: _ink,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
            child: TextField(
              controller: _search,
              autofocus: true,
              decoration: InputDecoration(
                hintText: widget.products.isEmpty
                    ? 'No products'
                    : 'Search ${widget.products.length} products',
                prefixIcon: const Icon(Icons.search_rounded, color: _forest),
                filled: true,
                fillColor: _canvas,
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
                ? const Center(
                child: Text(
                      'No matching products',
                      style: TextStyle(
                        color: _muted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                : ListView.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, _) =>
                        const Divider(height: 1, color: Color(0xFFF3F4F6)),
                    itemBuilder: (context, index) {
                      final p = items[index];
                      final id = '${p['id']}';
                      final selected = id == widget.selectedId;
                      final unit = '${p['unit'] ?? ''}';
                      final stock = _fmtQty(p['current_stock'], unit);
                      return ListTile(
                        selected: selected,
                        selectedTileColor: const Color(0xFFECFDF5),
                        title: Text(
                          '${p['name'] ?? 'Product'}',
                          style: TextStyle(
                            fontWeight:
                                selected ? FontWeight.w800 : FontWeight.w600,
                            color: _ink,
                          ),
                        ),
                        subtitle: Text(
                          'Stock · $stock',
                          style: const TextStyle(
                            color: _muted,
                            fontSize: 12.5,
                          ),
                        ),
                        trailing: selected
                            ? const Icon(
                                Icons.check_circle_rounded,
                                color: _emerald,
                              )
                            : null,
                        onTap: () => Navigator.pop(context, id),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

