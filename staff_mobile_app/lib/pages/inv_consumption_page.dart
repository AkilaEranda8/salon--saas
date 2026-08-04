import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';

const _forest = Color(0xFF1B3A2D);
const _emerald = Color(0xFF2D6A4F);
const _canvas = Color(0xFFF2F5F2);
const _border = Color(0xFFE5E7EB);
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
      app.loadCustomers(),
    ]);
    if (!mounted) return;
    setState(() {
      _rows = List<Map<String, dynamic>>.from(results[0] as List);
      _products = List<Map<String, dynamic>>.from(
        results[1] as List,
      ).where((p) => p['product_type'] == 'consumable').toList();
      _staff = List<StaffMember>.from(results[2] as List);
      _services = List<SalonService>.from(results[3] as List);
      _customers = List<Customer>.from(results[4] as List);
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
          'Product Usage',
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
    final customer = row['customer'] is Map ? row['customer'] as Map : const {};
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
            '${customer['name'] != null ? ' · ${customer['name']}' : ''}'
            '${service['name'] != null ? ' · ${service['name']}' : ''}'
            '${staff['name'] != null ? ' · ${staff['name']}' : ''}',
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
  final _customerSearch = TextEditingController();
  final _serviceSearch = TextEditingController();
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
    _customerSearch.dispose();
    _serviceSearch.dispose();
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

  List<Customer> get _filteredCustomers {
    final q = _customerSearch.text.trim().toLowerCase();
    // Show all when searching; when idle show a capped preview so the dropdown stays usable.
    final source = q.isEmpty
        ? widget.customers
        : widget.customers.where((c) {
            return c.name.toLowerCase().contains(q) ||
                c.phone.toLowerCase().contains(q);
          });
    return source.take(q.isEmpty ? 150 : 200).toList();
  }

  List<SalonService> get _filteredServices {
    final q = _serviceSearch.text.trim().toLowerCase();
    if (q.isEmpty) return widget.services;
    return widget.services.where((s) {
      return s.name.toLowerCase().contains(q) ||
          s.category.toLowerCase().contains(q);
    }).toList();
  }

  int get _selectedCount => _lines.where((l) => l.selected).length;

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
    final filteredCustomers = _filteredCustomers;
    final filteredServices = _filteredServices;
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
                TextField(
                  controller: _customerSearch,
                  decoration: _deco(
                    widget.customers.isEmpty
                        ? 'No customers loaded'
                        : 'Search name or phone · ${widget.customers.length} loaded',
                    Icons.search_rounded,
                    dense: true,
                  ).copyWith(
                    hintText: widget.customers.isEmpty
                        ? 'No customers loaded'
                        : 'Search name or phone · ${widget.customers.length} loaded',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _customerId.isEmpty ||
                          filteredCustomers.any((c) => c.id == _customerId)
                      ? (_customerId.isEmpty ? '' : _customerId)
                      : '',
                  isExpanded: true,
                  decoration: _deco(
                    filteredCustomers.length < widget.customers.length
                        ? 'Showing ${filteredCustomers.length} matches'
                        : 'Select customer',
                    Icons.people_outline_rounded,
                  ),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('None')),
                    ...filteredCustomers.map(
                      (c) => DropdownMenuItem(
                        value: c.id,
                        child: Text(
                          c.phone.trim().isEmpty ? c.name : '${c.name} — ${c.phone}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ],
                  onChanged: (value) => setState(() => _customerId = value ?? ''),
                ),
                const SizedBox(height: 14),
                _label('SERVICE'),
                TextField(
                  controller: _serviceSearch,
                  decoration: _deco('Search service', Icons.search_rounded, dense: true)
                      .copyWith(hintText: 'Search service'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _serviceId.isEmpty ||
                          filteredServices.any((s) => s.id == _serviceId)
                      ? (_serviceId.isEmpty ? '' : _serviceId)
                      : '',
                  isExpanded: true,
                  decoration: _deco('Select service', Icons.content_cut_rounded),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('None')),
                    ...filteredServices.map(
                      (s) => DropdownMenuItem(
                        value: s.id,
                        child: Text(
                          s.category.trim().isEmpty ? s.name : '${s.name} — ${s.category}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ],
                  onChanged: (value) => setState(() => _serviceId = value ?? ''),
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
