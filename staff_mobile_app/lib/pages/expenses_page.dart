import 'package:flutter/material.dart';

import '../state/app_state.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest  = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas  = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border  = Color(0xFFE5E7EB);
const Color _ink     = Color(0xFF111827);
const Color _muted   = Color(0xFF6B7280);
const Color _red     = Color(0xFFDC2626);

// ── Category metadata ─────────────────────────────────────────────────────────
const _cats = ['Rent', 'Utilities', 'Supplies', 'Salary', 'Marketing', 'Maintenance', 'Other'];
const _methods = ['cash', 'bank_transfer', 'cheque', 'card'];

Color _catColor(String c) {
  switch (c) {
    case 'Rent':        return const Color(0xFF2563EB);
    case 'Utilities':   return const Color(0xFF7C3AED);
    case 'Supplies':    return const Color(0xFFD97706);
    case 'Salary':      return const Color(0xFF059669);
    case 'Marketing':   return const Color(0xFFEA580C);
    case 'Maintenance': return const Color(0xFF0284C7);
    default:            return const Color(0xFF64748B);
  }
}

Color _catBg(String c) {
  switch (c) {
    case 'Rent':        return const Color(0xFFEFF6FF);
    case 'Utilities':   return const Color(0xFFF5F3FF);
    case 'Supplies':    return const Color(0xFFFFFBEB);
    case 'Salary':      return const Color(0xFFECFDF5);
    case 'Marketing':   return const Color(0xFFFFF7ED);
    case 'Maintenance': return const Color(0xFFF0F9FF);
    default:            return const Color(0xFFF8FAFC);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class ExpensesPage extends StatefulWidget {
  const ExpensesPage({super.key});
  @override
  State<ExpensesPage> createState() => _ExpensesPageState();
}

class _ExpensesPageState extends State<ExpensesPage> {
  List<Map<String, dynamic>> _expenses = [];
  List<Map<String, String>>  _branches = [];
  bool   _loading = true;
  String _search  = '';
  String _month   = _currentMonth();

  static String _currentMonth() {
    final n = DateTime.now();
    return '${n.year}-${n.month.toString().padLeft(2, '0')}';
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final app = AppStateScope.of(context);
      final results = await Future.wait([
        app.loadExpenses(month: _month),
        app.loadBranches(),
      ]);
      if (mounted) {
        setState(() {
          _expenses = results[0] as List<Map<String, dynamic>>;
          _branches = results[1] as List<Map<String, String>>;
        });
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  List<Map<String, dynamic>> get _filtered {
    if (_search.trim().isEmpty) return _expenses;
    final q = _search.toLowerCase();
    return _expenses.where((e) {
      return ('${e['title']}').toLowerCase().contains(q) ||
             ('${e['category']}').toLowerCase().contains(q) ||
             ('${e['paid_to']}').toLowerCase().contains(q);
    }).toList();
  }

  double get _total => _expenses.fold(0, (s, e) => s + (double.tryParse('${e['amount']}') ?? 0));

  void _openAddSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddExpenseSheet(
        branches: _branches,
        defaultBranchId: AppStateScope.of(context).currentUser?.branchId ?? '',
        onSaved: _load,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app        = AppStateScope.of(context);
    final isSA       = app.currentUser?.role == 'superadmin';
    final filtered   = _filtered;

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Expenses',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: -0.3)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 22),
            onPressed: _load,
          ),
        ],
      ),
      floatingActionButton: isSA
          ? FloatingActionButton.extended(
              backgroundColor: _emerald,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add Expense',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              onPressed: _openAddSheet,
            )
          : null,
      body: Column(
        children: [
          // ── Header summary ──
          Container(
            color: _forest,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(children: [
              Row(children: [
                Expanded(
                  child: _SummaryCard(
                    label: 'Total Expenses',
                    value: 'Rs. ${_total.toStringAsFixed(0)}',
                    icon: Icons.receipt_long_rounded,
                    color: const Color(0xFFFCA5A5),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _SummaryCard(
                    label: 'Records',
                    value: '${_expenses.length}',
                    icon: Icons.list_alt_rounded,
                    color: const Color(0xFF86EFAC),
                  ),
                ),
              ]),
            ]),
          ),

          // ── Filters ──
          Container(
            color: _surface,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(children: [
              Expanded(
                child: Container(
                  height: 40,
                  decoration: BoxDecoration(
                    color: _canvas,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _border),
                  ),
                  child: TextField(
                    onChanged: (v) => setState(() => _search = v),
                    style: const TextStyle(fontSize: 13, color: _ink),
                    decoration: const InputDecoration(
                      hintText: 'Search expenses…',
                      hintStyle: TextStyle(color: _muted, fontSize: 13),
                      prefixIcon: Icon(Icons.search_rounded, size: 18, color: _muted),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(vertical: 11),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: DateTime.now(),
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2030),
                    initialEntryMode: DatePickerEntryMode.input,
                    helpText: 'Select month (any day)',
                  );
                  if (picked != null) {
                    setState(() {
                      _month = '${picked.year}-${picked.month.toString().padLeft(2, '0')}';
                    });
                    _load();
                  }
                },
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: _canvas,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _border),
                  ),
                  child: Row(children: [
                    const Icon(Icons.calendar_month_rounded, size: 16, color: _muted),
                    const SizedBox(width: 6),
                    Text(_month, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _ink)),
                  ]),
                ),
              ),
            ]),
          ),

          const Divider(height: 1, color: _border),

          // ── List ──
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _emerald))
                : filtered.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.receipt_long_outlined, size: 48, color: _muted.withValues(alpha: 0.4)),
                            const SizedBox(height: 12),
                            const Text('No expenses found',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _muted)),
                            const SizedBox(height: 4),
                            const Text('Try a different month or search',
                              style: TextStyle(fontSize: 13, color: _muted)),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                        itemCount: filtered.length,
                        itemBuilder: (_, i) => _ExpenseCard(expense: filtered[i]),
                      ),
          ),
        ],
      ),
    );
  }
}

// ── Summary card ──────────────────────────────────────────────────────────────
class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.label, required this.value, required this.icon, required this.color});
  final String label, value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Row(children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, size: 18, color: color),
        ),
        const SizedBox(width: 10),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.white70, letterSpacing: 0.2)),
            const SizedBox(height: 2),
            Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -0.3)),
          ],
        )),
      ]),
    );
  }
}

// ── Expense list card ─────────────────────────────────────────────────────────
class _ExpenseCard extends StatelessWidget {
  const _ExpenseCard({required this.expense});
  final Map<String, dynamic> expense;

  @override
  Widget build(BuildContext context) {
    final cat    = '${expense['category'] ?? 'Other'}';
    final amount = double.tryParse('${expense['amount']}') ?? 0;
    final date   = expense['date'] != null
        ? _formatDate('${expense['date']}')
        : '';
    final method = '${expense['payment_method'] ?? ''}'.replaceAll('_', ' ');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              color: _catBg(cat),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.receipt_rounded, size: 20, color: _catColor(cat)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${expense['title'] ?? ''}',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _ink, letterSpacing: -0.2)),
              const SizedBox(height: 3),
              Row(children: [
                _Badge(label: cat, color: _catColor(cat), bg: _catBg(cat)),
                if (method.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Text(method, style: const TextStyle(fontSize: 11, color: _muted)),
                ],
              ]),
              if (expense['paid_to'] != null && '${expense['paid_to']}'.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text('To: ${expense['paid_to']}',
                    style: const TextStyle(fontSize: 11, color: _muted)),
                ),
            ],
          )),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('Rs. ${amount.toStringAsFixed(0)}',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _red, letterSpacing: -0.3)),
              const SizedBox(height: 4),
              Text(date, style: const TextStyle(fontSize: 11, color: _muted)),
            ],
          ),
        ]),
      ),
    );
  }

  static String _formatDate(String raw) {
    try {
      final d = DateTime.parse(raw);
      return '${d.day}/${d.month}/${d.year}';
    } catch (_) {
      return raw;
    }
  }
}

// ── Small badge ───────────────────────────────────────────────────────────────
class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color, required this.bg});
  final String label;
  final Color color, bg;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
    child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
  );
}

// ── Add Expense bottom sheet ───────────────────────────────────────────────────
class _AddExpenseSheet extends StatefulWidget {
  const _AddExpenseSheet({
    required this.branches,
    required this.defaultBranchId,
    required this.onSaved,
  });
  final List<Map<String, String>> branches;
  final String defaultBranchId;
  final VoidCallback onSaved;

  @override
  State<_AddExpenseSheet> createState() => _AddExpenseSheetState();
}

class _AddExpenseSheetState extends State<_AddExpenseSheet> {
  final _titleCtrl   = TextEditingController();
  final _amountCtrl  = TextEditingController();
  final _paidToCtrl  = TextEditingController();
  final _receiptCtrl = TextEditingController();
  final _notesCtrl   = TextEditingController();

  String _category      = 'Supplies';
  String _method        = 'cash';
  String _date          = _today();
  String _branchId      = '';
  bool   _saving        = false;
  String _error         = '';

  static String _today() {
    final n = DateTime.now();
    return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
  }

  @override
  void initState() {
    super.initState();
    _branchId = widget.defaultBranchId;
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _amountCtrl.dispose();
    _paidToCtrl.dispose();
    _receiptCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final title  = _titleCtrl.text.trim();
    final amount = double.tryParse(_amountCtrl.text.trim());
    if (title.isEmpty || amount == null || _branchId.isEmpty) {
      setState(() => _error = 'Branch, title and amount are required.');
      return;
    }
    setState(() { _saving = true; _error = ''; });
    final app = AppStateScope.of(context);
    final ok = await app.addExpense(
      branchId:      _branchId,
      category:      _category,
      title:         title,
      amount:        amount,
      date:          _date,
      paidTo:        _paidToCtrl.text.trim().isEmpty ? null : _paidToCtrl.text.trim(),
      paymentMethod: _method,
      receiptNumber: _receiptCtrl.text.trim().isEmpty ? null : _receiptCtrl.text.trim(),
      notes:         _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
    );
    if (!mounted) return;
    if (ok) {
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Text('Add Expense',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _ink, letterSpacing: -0.3)),
              const Spacer(),
              GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: const Icon(Icons.close_rounded, color: _muted, size: 22),
              ),
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
                child: Text(_error, style: const TextStyle(fontSize: 13, color: _red)),
              ),

            // Branch
            if (widget.branches.isNotEmpty) ...[
              _label('Branch'),
              _dropdown(
                value: widget.branches.any((b) => b['id'] == _branchId) ? _branchId : '',
                items: [
                  const DropdownMenuItem(value: '', child: Text('Select branch')),
                  ...widget.branches.map((b) => DropdownMenuItem(value: b['id']!, child: Text(b['name']!))),
                ],
                onChanged: (v) => setState(() => _branchId = v ?? ''),
              ),
              const SizedBox(height: 14),
            ],

            // Category & Date row
            Row(children: [
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label('Category'),
                  _dropdown(
                    value: _category,
                    items: _cats.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                    onChanged: (v) => setState(() => _category = v ?? _category),
                  ),
                ],
              )),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label('Date'),
                  GestureDetector(
                    onTap: () async {
                      final d = await showDatePicker(
                        context: context,
                        initialDate: DateTime.now(),
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2030),
                      );
                      if (d != null) {
                        setState(() => _date = '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}');
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
                ],
              )),
            ]),
            const SizedBox(height: 14),

            // Title
            _label('Title *'),
            _field(_titleCtrl, 'e.g. Monthly Rent'),
            const SizedBox(height: 14),

            // Amount & Method row
            Row(children: [
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label('Amount (Rs.) *'),
                  _field(_amountCtrl, '0.00', keyboardType: TextInputType.number),
                ],
              )),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label('Payment Method'),
                  _dropdown(
                    value: _method,
                    items: _methods.map((m) => DropdownMenuItem(value: m, child: Text(m.replaceAll('_', ' ')))).toList(),
                    onChanged: (v) => setState(() => _method = v ?? _method),
                  ),
                ],
              )),
            ]),
            const SizedBox(height: 14),

            // Paid To & Receipt row
            Row(children: [
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label('Paid To'),
                  _field(_paidToCtrl, 'Vendor or person'),
                ],
              )),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label('Receipt #'),
                  _field(_receiptCtrl, 'Optional'),
                ],
              )),
            ]),
            const SizedBox(height: 14),

            // Notes
            _label('Notes'),
            _field(_notesCtrl, 'Optional notes'),
            const SizedBox(height: 22),

            // Save button
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _saving ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _emerald,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 0,
                ),
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('Save Expense',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: -0.2)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(t, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _muted, letterSpacing: 0.3)),
  );

  Widget _field(TextEditingController ctrl, String hint, {TextInputType? keyboardType}) => TextField(
    controller: ctrl,
    keyboardType: keyboardType,
    style: const TextStyle(fontSize: 14, color: _ink),
    decoration: InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: _muted, fontSize: 13),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _emerald, width: 1.5)),
      filled: true,
      fillColor: _canvas,
    ),
  );

  Widget _dropdown<T>({required T value, required List<DropdownMenuItem<T>> items, required ValueChanged<T?> onChanged}) =>
    Container(
      height: 44,
      decoration: BoxDecoration(
        border: Border.all(color: _border),
        borderRadius: BorderRadius.circular(10),
        color: _canvas,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: DropdownButton<T>(
        value: value,
        items: items,
        onChanged: onChanged,
        isExpanded: true,
        underline: const SizedBox(),
        style: const TextStyle(fontSize: 13, color: _ink),
        dropdownColor: _surface,
      ),
    );
}
