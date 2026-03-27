import 'package:flutter/material.dart';

import '../models/commission_record.dart';
import '../state/app_state.dart';

class CommissionPage extends StatefulWidget {
  const CommissionPage({super.key});

  @override
  State<CommissionPage> createState() => _CommissionPageState();
}

class _CommissionPageState extends State<CommissionPage> {
  bool _loading = true;
  String? _error;
  String _month = _currentMonth();
  double _total = 0;
  String? _staffName;
  List<CommissionRecord> _rows = const [];

  static String _currentMonth() {
    final now = DateTime.now();
    final mm = now.month.toString().padLeft(2, '0');
    return '${now.year}-$mm';
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading) {
      _load();
    }
  }

  Future<void> _load() async {
    final appState = AppStateScope.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await appState.loadMyCommission(month: _month);
      if (!mounted) return;
      setState(() {
        _rows = result.records;
        _total = result.total;
        _staffName = result.staffName;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _pickMonth() async {
    final base = DateTime.tryParse('$_month-01') ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: base,
      firstDate: DateTime(2020, 1, 1),
      lastDate: DateTime(2100, 12, 31),
      initialDatePickerMode: DatePickerMode.year,
    );
    if (picked == null) return;
    final mm = picked.month.toString().padLeft(2, '0');
    setState(() => _month = '${picked.year}-$mm');
    await _load();
  }

  String _money(double value) => 'LKR ${value.toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Commission')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                leading: const Icon(Icons.person_outline),
                title: Text(_staffName ?? 'My commission'),
                subtitle: Text('Month: $_month'),
                trailing: TextButton.icon(
                  onPressed: _pickMonth,
                  icon: const Icon(Icons.calendar_month_outlined, size: 18),
                  label: const Text('Change'),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Card(
              color: const Color(0xFFF0FDF4),
              child: ListTile(
                leading: const Icon(Icons.monetization_on_outlined, color: Color(0xFF15803D)),
                title: const Text('Total commission'),
                trailing: Text(
                  _money(_total),
                  style: const TextStyle(
                    color: Color(0xFF166534),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(_error!, textAlign: TextAlign.center),
              )
            else if (_rows.isEmpty)
              const Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  'No commission records for selected month.',
                  textAlign: TextAlign.center,
                ),
              )
            else
              ..._rows.map(
                (row) => Card(
                  child: ListTile(
                    leading: const Icon(Icons.receipt_long_outlined),
                    title: Text(row.customerName),
                    subtitle: Text('${row.date} • ${row.serviceName}'),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _money(row.commissionAmount),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          _money(row.totalAmount),
                          style: const TextStyle(fontSize: 12, color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
