import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';

class AddPaymentModalResult {
  const AddPaymentModalResult({
    required this.branchId,
    required this.customerId,
    required this.staffId,
    required this.serviceIds,
    required this.totalAmount,
    required this.loyaltyDiscount,
    required this.method,
    required this.paidAmount,
    required this.customerName,
  });

  final String branchId;
  final String customerId;
  final String staffId;
  final List<String> serviceIds;
  final String totalAmount;
  final String loyaltyDiscount;
  final String method;
  final String paidAmount;
  final String customerName;
}

class AddPaymentModal extends StatefulWidget {
  const AddPaymentModal({
    required this.branches,
    required this.customers,
    required this.staff,
    required this.services,
    this.initialBranchId,
    super.key,
  });

  final List<Map<String, String>> branches;
  final List<Customer> customers;
  final List<StaffMember> staff;
  final List<SalonService> services;
  final String? initialBranchId;

  static Future<AddPaymentModalResult?> show(
    BuildContext context, {
    required List<Map<String, String>> branches,
    required List<Customer> customers,
    required List<StaffMember> staff,
    required List<SalonService> services,
    String? initialBranchId,
  }) {
    return showDialog<AddPaymentModalResult>(
      context: context,
      builder: (_) => AddPaymentModal(
        branches: branches,
        customers: customers,
        staff: staff,
        services: services,
        initialBranchId: initialBranchId,
      ),
    );
  }

  @override
  State<AddPaymentModal> createState() => _AddPaymentModalState();
}

class _AddPaymentModalState extends State<AddPaymentModal> {
  static const _methods = <String>['Cash', 'Card', 'Online Transfer', 'Loyalty Points', 'Package'];

  final _formKey = GlobalKey<FormState>();
  final _customerNameController = TextEditingController();
  final _totalAmountController = TextEditingController();
  final _loyaltyDiscountController = TextEditingController(text: '0');
  final _paidAmountController = TextEditingController();
  String? _branchId;
  String? _customerId;
  String? _staffId;
  final Set<String> _selectedServiceIds = <String>{};
  String _method = _methods.first;

  @override
  void initState() {
    super.initState();
    _branchId = widget.initialBranchId;
  }

  @override
  void dispose() {
    _customerNameController.dispose();
    _totalAmountController.dispose();
    _loyaltyDiscountController.dispose();
    _paidAmountController.dispose();
    super.dispose();
  }

  void _syncPaidAmountIfEmpty() {
    if (_paidAmountController.text.trim().isNotEmpty) return;
    final total = double.tryParse(_totalAmountController.text.trim()) ?? 0;
    final discount = double.tryParse(_loyaltyDiscountController.text.trim()) ?? 0;
    final net = (total - discount);
    if (net >= 0) {
      _paidAmountController.text = net.toStringAsFixed(2);
    }
  }

  void _recalculateTotalFromServices() {
    var total = 0.0;
    for (final id in _selectedServiceIds) {
      final svc = widget.services.firstWhere(
        (s) => s.id == id,
        orElse: () => SalonService(
          id: id,
          name: '',
          category: 'Other',
          price: 0,
          durationMinutes: 30,
        ),
      );
      total += svc.price;
    }
    _totalAmountController.text = total <= 0 ? '' : total.toStringAsFixed(2);
    _paidAmountController.text = total <= 0 ? '' : total.toStringAsFixed(2);
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final selectedCustomer = widget.customers.firstWhere(
      (c) => c.id == _customerId,
      orElse: () => Customer(id: '', name: 'Walk-in', phone: '', email: ''),
    );
    Navigator.of(context).pop(
      AddPaymentModalResult(
        branchId: (_branchId ?? '').trim(),
        customerId: (_customerId ?? '').trim(),
        staffId: (_staffId ?? '').trim(),
        serviceIds: _selectedServiceIds.toList(),
        totalAmount: _totalAmountController.text.trim(),
        loyaltyDiscount: _loyaltyDiscountController.text.trim(),
        method: _method,
        paidAmount: _paidAmountController.text.trim(),
        customerName: _customerNameController.text.trim().isEmpty ? selectedCustomer.name : _customerNameController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredStaff = (_branchId == null || _branchId!.isEmpty)
        ? widget.staff
        : widget.staff.where((s) => s.branchId == _branchId).toList();
    final activeServices = widget.services.where((s) => s.isActive).toList();
    return AlertDialog(
      title: const Text('Record Payment'),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: _branchId,
                decoration: const InputDecoration(labelText: 'Branch'),
                items: widget.branches
                    .map((b) => DropdownMenuItem<String>(value: b['id'], child: Text(b['name'] ?? '')))
                    .toList(),
                onChanged: (value) {
                  setState(() {
                    _branchId = value;
                    _staffId = null;
                  });
                },
                validator: (value) => value == null || value.trim().isEmpty ? 'Branch required' : null,
              ),
              DropdownButtonFormField<String>(
                initialValue: _customerId,
                decoration: const InputDecoration(labelText: 'Customer'),
                items: [
                  const DropdownMenuItem<String>(value: '', child: Text('Walk-in')),
                  ...widget.customers.map((c) => DropdownMenuItem<String>(value: c.id, child: Text('${c.name} (${c.phone})'))),
                ],
                onChanged: (value) {
                  setState(() {
                    _customerId = value;
                    final selected = widget.customers.firstWhere(
                      (c) => c.id == value,
                      orElse: () => Customer(id: '', name: '', phone: '', email: ''),
                    );
                    if (selected.name.isNotEmpty) {
                      _customerNameController.text = selected.name;
                    }
                  });
                },
              ),
              TextFormField(
                controller: _customerNameController,
                decoration: const InputDecoration(labelText: 'Customer Name (Walk-in)'),
              ),
              DropdownButtonFormField<String>(
                initialValue: _staffId,
                decoration: const InputDecoration(labelText: 'Staff'),
                items: [
                  const DropdownMenuItem<String>(value: '', child: Text('None')),
                  ...filteredStaff.map((s) => DropdownMenuItem<String>(value: s.id, child: Text(s.name))),
                ],
                onChanged: (value) => setState(() => _staffId = value),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(top: 10, bottom: 6),
                  child: Text(
                    'Services',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ),
              Container(
                constraints: const BoxConstraints(maxHeight: 180),
                decoration: BoxDecoration(
                  border: Border.all(color: Theme.of(context).dividerColor),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: ListView(
                  shrinkWrap: true,
                  children: activeServices
                      .map(
                        (s) => CheckboxListTile(
                          value: _selectedServiceIds.contains(s.id),
                          dense: true,
                          title: Text('${s.name} (LKR ${s.price.toStringAsFixed(0)})'),
                          controlAffinity: ListTileControlAffinity.leading,
                          onChanged: (checked) {
                            setState(() {
                              if (checked == true) {
                                _selectedServiceIds.add(s.id);
                              } else {
                                _selectedServiceIds.remove(s.id);
                              }
                              _recalculateTotalFromServices();
                            });
                          },
                        ),
                      )
                      .toList(),
                ),
              ),
              TextFormField(
                controller: _totalAmountController,
                decoration: const InputDecoration(labelText: 'Total Amount'),
                keyboardType: TextInputType.number,
                onChanged: (_) => _syncPaidAmountIfEmpty(),
                validator: (value) {
                  if (_selectedServiceIds.isEmpty) return 'Select at least one service';
                  if (value == null || value.trim().isEmpty) return 'Total amount required';
                  if ((double.tryParse(value.trim()) ?? 0) <= 0) return 'Enter valid amount';
                  return null;
                },
              ),
              TextFormField(
                controller: _loyaltyDiscountController,
                decoration: const InputDecoration(labelText: 'Loyalty Discount'),
                keyboardType: TextInputType.number,
                onChanged: (_) => _syncPaidAmountIfEmpty(),
              ),
              DropdownButtonFormField<String>(
                initialValue: _method,
                decoration: const InputDecoration(labelText: 'Payment Method'),
                items: _methods
                    .map((m) => DropdownMenuItem<String>(value: m, child: Text(m)))
                    .toList(),
                onChanged: (value) {
                  if (value == null || value.isEmpty) return;
                  setState(() => _method = value);
                },
              ),
              TextFormField(
                controller: _paidAmountController,
                decoration: const InputDecoration(labelText: 'Paid Amount'),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) return 'Paid amount required';
                  if ((double.tryParse(value.trim()) ?? 0) < 0) return 'Enter valid amount';
                  return null;
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: const Text('Save'),
        ),
      ],
    );
  }
}
