import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';

class AddAppointmentPage extends StatefulWidget {
  const AddAppointmentPage({super.key});

  @override
  State<AddAppointmentPage> createState() => _AddAppointmentPageState();
}

class _AddAppointmentPageState extends State<AddAppointmentPage> {
  final _formKey = GlobalKey<FormState>();
  final _customerName = TextEditingController();
  final _phone = TextEditingController();
  final _date = TextEditingController();
  final _time = TextEditingController();
  final _amount = TextEditingController();
  final _notes = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _error;
  List<SalonService> _services = const [];
  List<Map<String, String>> _branches = const [];
  List<StaffMember> _staff = const [];
  List<Customer> _customers = const [];

  final List<String> _serviceIds = [];
  String _branchId = '';
  String _staffId = '';

  bool get _isSuperAdmin {
    final role = AppStateScope.of(context).currentUser?.role ?? '';
    return role == 'superadmin';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadInitial());
  }

  Future<void> _loadInitial() async {
    final appState = AppStateScope.of(context);
    final d = DateTime.now();
    _date.text =
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _services = await appState.loadServices();
      try {
        _customers = await appState.loadCustomers();
      } catch (_) {
        _customers = const [];
      }
      final userBranch = appState.currentUser?.branchId ?? '';
      _branchId = userBranch;
      if (_isSuperAdmin) {
        _branches = await appState.loadBranches();
      }
      try {
        _staff = await appState.loadStaffList(
          branchId: _branchId.isEmpty ? null : _branchId,
        );
      } catch (_) {
        _staff = const [];
      }
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
    }
    if (!mounted) return;
    setState(() => _loading = false);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      initialDate: DateTime.tryParse(_date.text) ?? DateTime.now(),
    );
    if (picked == null) return;
    setState(() {
      _date.text =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (picked == null) return;
    setState(() {
      _time.text =
          '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    });
  }

  double _calcTotal() {
    var sum = 0.0;
    for (final id in _serviceIds) {
      for (final s in _services) {
        if (s.id == id) sum += s.price;
      }
    }
    return sum;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_serviceIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one service')),
      );
      return;
    }
    final appState = AppStateScope.of(context);
    final branch = _isSuperAdmin ? _branchId : (appState.currentUser?.branchId ?? '');
    setState(() => _saving = true);
    final ok = await appState.saveAppointment(
      branchId: branch,
      customerName: _customerName.text.trim(),
      phone: _phone.text.trim(),
      customerId: '',
      orderedServiceIds: List<String>.from(_serviceIds),
      date: _date.text.trim(),
      time: _time.text.trim(),
      staffId: _staffId,
      baseNotes: _notes.text.trim(),
      status: '',
      amountOverride: _amount.text.trim(),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(appState.lastError ?? 'Save failed')),
      );
      return;
    }
    Navigator.of(context).pop(true);
  }

  @override
  void dispose() {
    _customerName.dispose();
    _phone.dispose();
    _date.dispose();
    _time.dispose();
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeServices = _services.where((s) => s.isActive).toList();
    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FF),
      appBar: AppBar(
        title: const Text('Add Appointment'),
        backgroundColor: const Color(0xFFF4F7FF),
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(_error!)))
              : SafeArea(
                  child: Form(
                    key: _formKey,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(18),
                            gradient: const LinearGradient(
                              colors: [Color(0xFF4F46E5), Color(0xFF06B6D4)],
                            ),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x334F46E5),
                                blurRadius: 16,
                                offset: Offset(0, 8),
                              ),
                            ],
                          ),
                          child: const Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Create New Appointment',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 20,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    SizedBox(height: 4),
                                    Text(
                                      'Fill details and save to backend',
                                      style: TextStyle(
                                        color: Color(0xE6FFFFFF),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              CircleAvatar(
                                radius: 22,
                                backgroundColor: Color(0x33FFFFFF),
                                child: Icon(Icons.event_available, color: Colors.white),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: Column(
                            children: [
                              Autocomplete<Customer>(
                                optionsBuilder: (textEditingValue) {
                                  final q = textEditingValue.text.trim().toLowerCase();
                                  if (q.isEmpty) {
                                    return _customers.take(15);
                                  }
                                  return _customers.where((c) {
                                    return c.name.toLowerCase().contains(q) ||
                                        c.phone.toLowerCase().contains(q);
                                  }).take(20);
                                },
                                displayStringForOption: (c) => c.name,
                                onSelected: (customer) {
                                  _customerName.text = customer.name;
                                  _phone.text = customer.phone;
                                },
                                fieldViewBuilder:
                                    (context, textEditingController, focusNode, onFieldSubmitted) {
                                  textEditingController.text = _customerName.text;
                                  return TextFormField(
                                    controller: textEditingController,
                                    focusNode: focusNode,
                                    decoration: const InputDecoration(
                                      labelText: 'Customer (search by name/phone)',
                                      border: OutlineInputBorder(),
                                      prefixIcon: Icon(Icons.person_search_outlined),
                                    ),
                                    onChanged: (v) => _customerName.text = v,
                                    validator: (v) =>
                                        v == null || v.trim().isEmpty ? 'Required' : null,
                                  );
                                },
                                optionsViewBuilder: (context, onSelected, options) {
                                  return Align(
                                    alignment: Alignment.topLeft,
                                    child: Material(
                                      elevation: 6,
                                      borderRadius: BorderRadius.circular(10),
                                      child: ConstrainedBox(
                                        constraints: const BoxConstraints(
                                          maxHeight: 220,
                                          maxWidth: 520,
                                        ),
                                        child: ListView.builder(
                                          padding: EdgeInsets.zero,
                                          shrinkWrap: true,
                                          itemCount: options.length,
                                          itemBuilder: (context, index) {
                                            final c = options.elementAt(index);
                                            return ListTile(
                                              dense: true,
                                              leading: const Icon(Icons.person_outline),
                                              title: Text(c.name),
                                              subtitle: Text(c.phone),
                                              onTap: () => onSelected(c),
                                            );
                                          },
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              ),
                              const SizedBox(height: 10),
                              TextFormField(
                                controller: _phone,
                                decoration: const InputDecoration(
                                  labelText: 'Phone',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.call_outlined),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_isSuperAdmin) ...[
                          const SizedBox(height: 10),
                          DropdownButtonFormField<String>(
                            initialValue: _branchId.isEmpty ? null : _branchId,
                            decoration: const InputDecoration(
                              labelText: 'Branch',
                              border: OutlineInputBorder(),
                            ),
                            items: _branches
                                .map(
                                  (b) => DropdownMenuItem(
                                    value: b['id'],
                                    child: Text(b['name'] ?? ''),
                                  ),
                                )
                                .toList(),
                            onChanged: (v) async {
                              setState(() => _branchId = v ?? '');
                              final appState = AppStateScope.of(context);
                              _staff = await appState.loadStaffList(
                                branchId: _branchId.isEmpty ? null : _branchId,
                              );
                              if (mounted) setState(() {});
                            },
                            validator: (v) => v == null || v.isEmpty ? 'Branch required' : null,
                          ),
                        ],
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x11000000),
                                blurRadius: 10,
                                offset: Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Services',
                                style: TextStyle(
                                  color: Color(0xFF0F172A),
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: activeServices.map((s) {
                                  final on = _serviceIds.contains(s.id);
                                  return FilterChip(
                                    selected: on,
                                    selectedColor: const Color(0xFFEFF6FF),
                                    checkmarkColor: const Color(0xFF2563EB),
                                    side: BorderSide(
                                      color: on ? const Color(0xFF93C5FD) : const Color(0xFFE2E8F0),
                                    ),
                                    label: Text(
                                      '${s.name}  •  Rs. ${s.price.toStringAsFixed(0)}',
                                      style: TextStyle(
                                        color: on ? const Color(0xFF1E3A8A) : const Color(0xFF334155),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    onSelected: (v) {
                                      setState(() {
                                        if (v) {
                                          if (!_serviceIds.contains(s.id)) _serviceIds.add(s.id);
                                        } else {
                                          _serviceIds.remove(s.id);
                                        }
                                        final total = _calcTotal();
                                        _amount.text = total > 0 ? total.toStringAsFixed(0) : '';
                                      });
                                    },
                                  );
                                }).toList(),
                              ),
                              const SizedBox(height: 10),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF8FAFC),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: const Color(0xFFE2E8F0)),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.summarize_outlined, size: 18, color: Color(0xFF475569)),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Selected: ${_serviceIds.length}',
                                      style: const TextStyle(
                                        color: Color(0xFF334155),
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const Spacer(),
                                    Text(
                                      'Total: Rs. ${_calcTotal().toStringAsFixed(0)}',
                                      style: const TextStyle(
                                        color: Color(0xFF059669),
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: Column(
                            children: [
                              DropdownButtonFormField<String>(
                                initialValue: _staffId.isEmpty ? null : _staffId,
                                decoration: const InputDecoration(
                                  labelText: 'Staff (optional)',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.badge_outlined),
                                ),
                                items: [
                                  const DropdownMenuItem(value: '', child: Text('Any')),
                                  ..._staff.map(
                                    (s) => DropdownMenuItem(value: s.id, child: Text(s.name)),
                                  ),
                                ],
                                onChanged: (v) => setState(() => _staffId = v ?? ''),
                              ),
                              const SizedBox(height: 10),
                              TextFormField(
                                controller: _date,
                                readOnly: true,
                                onTap: _pickDate,
                                decoration: const InputDecoration(
                                  labelText: 'Date',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.date_range_outlined),
                                ),
                                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                              ),
                              const SizedBox(height: 10),
                              TextFormField(
                                controller: _time,
                                readOnly: true,
                                onTap: _pickTime,
                                decoration: const InputDecoration(
                                  labelText: 'Time',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.schedule_outlined),
                                ),
                                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: Column(
                            children: [
                              TextFormField(
                                controller: _amount,
                                keyboardType: TextInputType.number,
                                decoration: const InputDecoration(
                                  labelText: 'Amount (Rs.)',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.currency_exchange),
                                ),
                              ),
                              const SizedBox(height: 10),
                              TextFormField(
                                controller: _notes,
                                maxLines: 2,
                                decoration: const InputDecoration(
                                  labelText: 'Notes',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.sticky_note_2_outlined),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF4F46E5),
                            foregroundColor: Colors.white,
                            minimumSize: const Size(double.infinity, 50),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          onPressed: _saving ? null : _save,
                          icon: _saving
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.save),
                          label: Text(_saving ? 'Saving...' : 'Create Appointment'),
                        ),
                      ],
                    ),
                  ),
                ),
    );
  }
}
