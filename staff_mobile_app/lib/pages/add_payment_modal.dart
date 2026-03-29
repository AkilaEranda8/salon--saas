import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _pGreen  = Color(0xFF059669);
const Color _pGreenL = Color(0xFFECFDF5);
const Color _pGreenB = Color(0xFFA7F3D0);
const Color _pBorder = Color(0xFFE5E7EB);
const Color _pBg     = Color(0xFFF9FAFB);

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
    return showModalBottomSheet<AddPaymentModalResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
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
  static const _methods = <String>[
    'Cash', 'Card', 'Online Transfer', 'Loyalty Points', 'Package'
  ];
  static const _methodIcons = <String, IconData>{
    'Cash':            Icons.payments_rounded,
    'Card':            Icons.credit_card_rounded,
    'Online Transfer': Icons.account_balance_rounded,
    'Loyalty Points':  Icons.stars_rounded,
    'Package':         Icons.card_giftcard_rounded,
  };

  final _formKey               = GlobalKey<FormState>();
  final _customerNameCtrl      = TextEditingController();
  final _totalAmountCtrl       = TextEditingController();
  final _loyaltyDiscountCtrl   = TextEditingController(text: '0');
  final _paidAmountCtrl        = TextEditingController();

  String? _branchId;
  String _customerId = '';
  Customer? _linkedCustomer;
  String? _staffId;
  final Set<String> _selectedServiceIds = {};
  String _method = _methods.first;

  @override
  void initState() {
    super.initState();
    _branchId = widget.initialBranchId;
  }

  @override
  void dispose() {
    _customerNameCtrl.dispose();
    _totalAmountCtrl.dispose();
    _loyaltyDiscountCtrl.dispose();
    _paidAmountCtrl.dispose();
    super.dispose();
  }

  void _syncPaid() {
    if (_paidAmountCtrl.text.trim().isNotEmpty) return;
    final total    = double.tryParse(_totalAmountCtrl.text.trim()) ?? 0;
    final discount = double.tryParse(_loyaltyDiscountCtrl.text.trim()) ?? 0;
    final net      = (total - discount).clamp(0, double.infinity);
    _paidAmountCtrl.text = net > 0 ? net.toStringAsFixed(0) : '';
  }

  void _recalcTotal() {
    var total = 0.0;
    for (final id in _selectedServiceIds) {
      for (final s in widget.services) {
        if (s.id == id) total += s.price;
      }
    }
    _totalAmountCtrl.text  = total > 0 ? total.toStringAsFixed(0) : '';
    _paidAmountCtrl.text   = total > 0 ? total.toStringAsFixed(0) : '';
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final cust = widget.customers.firstWhere(
      (c) => c.id == _customerId,
      orElse: () => Customer(id: '', name: 'Walk-in', phone: '', email: ''),
    );
    Navigator.of(context).pop(AddPaymentModalResult(
      branchId:       (_branchId ?? '').trim(),
      customerId:     _customerId.trim(),
      staffId:        (_staffId ?? '').trim(),
      serviceIds:     _selectedServiceIds.toList(),
      totalAmount:    _totalAmountCtrl.text.trim(),
      loyaltyDiscount: _loyaltyDiscountCtrl.text.trim(),
      method:         _method,
      paidAmount:     _paidAmountCtrl.text.trim(),
      customerName:   _customerNameCtrl.text.trim().isEmpty
                          ? cust.name
                          : _customerNameCtrl.text.trim(),
    ));
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  InputDecoration _deco(String hint, IconData icon) => InputDecoration(
        hintText: hint,
        hintStyle:
            const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _pGreen, size: 19),
        filled: true,
        fillColor: _pBg,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _pBorder)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _pBorder)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _pGreen, width: 1.8)),
        focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _pGreen, width: 1.8)),
        errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFF43F5E))),
      );

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: const TextStyle(
                color: Color(0xFF6B7280),
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4)),
      );

  @override
  Widget build(BuildContext context) {
    final bottom         = MediaQuery.of(context).viewInsets.bottom;
    final activeServices = widget.services.where((s) => s.isActive).toList();
    final filteredStaff  = (_branchId == null || _branchId!.isEmpty)
        ? widget.staff
        : widget.staff.where((s) => s.branchId == _branchId).toList();

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, bottom + 28),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [

              // ── Drag handle ─────────────────────────────────────────
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12, bottom: 18),
                  width: 40, height: 4,
                  decoration: BoxDecoration(
                      color: const Color(0xFFE5E7EB),
                      borderRadius: BorderRadius.circular(99)),
                ),
              ),

              // ── Title row ───────────────────────────────────────────
              Row(children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: _pGreenL,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _pGreenB),
                  ),
                  child: const Icon(Icons.payments_rounded,
                      color: _pGreen, size: 17),
                ),
                const SizedBox(width: 11),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Collect Payment',
                          style: TextStyle(
                              color: Color(0xFF111827),
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.2)),
                      Text('Record a new payment',
                          style: TextStyle(
                              color: Color(0xFFADB5BD),
                              fontSize: 12,
                              fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(),
                  child: Container(
                    width: 32, height: 32,
                    decoration: BoxDecoration(
                        color: const Color(0xFFF3F4F6),
                        borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.close_rounded,
                        size: 16, color: Color(0xFF6B7280)),
                  ),
                ),
              ]),

              const SizedBox(height: 20),

              // ── Branch ──────────────────────────────────────────────
              if (widget.branches.isNotEmpty) ...[
                _label('BRANCH'),
                DropdownButtonFormField<String>(
                  initialValue: _branchId,
                  isExpanded: true,
                  decoration: _deco('Select branch',
                      Icons.store_mall_directory_outlined),
                  items: widget.branches
                      .map((b) => DropdownMenuItem(
                            value: b['id'],
                            child: Text(b['name'] ?? '',
                                overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (v) =>
                      setState(() { _branchId = v; _staffId = null; }),
                  validator: (v) =>
                      v == null || v.trim().isEmpty ? 'Branch required' : null,
                ),
                const SizedBox(height: 12),
              ],

              // ── Customer (search by name / phone, or type walk-in) ───
              _label('CUSTOMER'),
              Autocomplete<Customer>(
                optionsBuilder: (val) {
                  final q = val.text.trim().toLowerCase();
                  final all = widget.customers;
                  if (q.isEmpty) return all.take(10);
                  return all
                      .where((c) {
                        final name = c.name.toLowerCase();
                        final phone = c.phone.replaceAll(RegExp(r'\s'), '');
                        final email = c.email.toLowerCase();
                        final qq = q.replaceAll(RegExp(r'\s'), '');
                        return name.contains(q) ||
                            phone.contains(qq) ||
                            email.contains(q);
                      })
                      .take(15);
                },
                displayStringForOption: (c) => c.name,
                onSelected: (c) {
                  setState(() {
                    _linkedCustomer = c;
                    _customerId = c.id;
                    _customerNameCtrl.text = c.name;
                  });
                },
                fieldViewBuilder: (ctx, ctrl, fn, _) {
                  if (_customerNameCtrl.text.isNotEmpty &&
                      ctrl.text != _customerNameCtrl.text) {
                    ctrl.text = _customerNameCtrl.text;
                  }
                  return TextFormField(
                    controller: ctrl,
                    focusNode: fn,
                    textCapitalization: TextCapitalization.words,
                    decoration: _deco(
                        widget.customers.isEmpty
                            ? 'Walk-in name'
                            : 'Search name, phone — or type walk-in',
                        Icons.person_search_rounded),
                    onChanged: (v) {
                      _customerNameCtrl.text = v;
                      if (_linkedCustomer != null &&
                          v.trim() != _linkedCustomer!.name) {
                        setState(() {
                          _linkedCustomer = null;
                          _customerId = '';
                        });
                      }
                    },
                  );
                },
                optionsViewBuilder: widget.customers.isEmpty
                    ? null
                    : (ctx, onSel, opts) => Align(
                          alignment: Alignment.topLeft,
                          child: Material(
                            elevation: 8,
                            borderRadius: BorderRadius.circular(14),
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(
                                  maxHeight: 220, maxWidth: 420),
                              child: ListView.builder(
                                shrinkWrap: true,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 6),
                                itemCount: opts.length,
                                itemBuilder: (_, i) {
                                  final c = opts.elementAt(i);
                                  final init = c.name.isNotEmpty
                                      ? c.name[0].toUpperCase()
                                      : '?';
                                  return ListTile(
                                    dense: true,
                                    leading: CircleAvatar(
                                      radius: 16,
                                      backgroundColor: _pGreenL,
                                      child: Text(init,
                                          style: const TextStyle(
                                              color: _pGreen,
                                              fontWeight: FontWeight.w800,
                                              fontSize: 13)),
                                    ),
                                    title: Text(c.name,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 13)),
                                    subtitle: Text(
                                        c.phone.isNotEmpty
                                            ? c.phone
                                            : (c.email.isNotEmpty
                                                ? c.email
                                                : ''),
                                        style: const TextStyle(fontSize: 11)),
                                    onTap: () => onSel(c),
                                  );
                                },
                              ),
                            ),
                          ),
                        ),
              ),

              const SizedBox(height: 12),

              // ── Staff ────────────────────────────────────────────────
              _label('STAFF'),
              DropdownButtonFormField<String>(
                initialValue: _staffId,
                isExpanded: true,
                decoration: _deco('Any staff', Icons.badge_outlined),
                items: [
                  const DropdownMenuItem(value: '', child: Text('None')),
                  ...filteredStaff.map((s) => DropdownMenuItem(
                        value: s.id,
                        child: Text(s.name,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13)),
                      )),
                ],
                onChanged: (v) => setState(() => _staffId = v),
              ),

              const SizedBox(height: 12),

              // ── Services ─────────────────────────────────────────────
              _label('SERVICES'),
              Wrap(
                spacing: 7,
                runSpacing: 7,
                children: activeServices.map((s) {
                  final on = _selectedServiceIds.contains(s.id);
                  return GestureDetector(
                    onTap: () {
                      setState(() {
                        if (on) {
                          _selectedServiceIds.remove(s.id);
                        } else {
                          _selectedServiceIds.add(s.id);
                        }
                        _recalcTotal();
                      });
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 140),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 11, vertical: 7),
                      decoration: BoxDecoration(
                        color: on ? _pGreenL : _pBg,
                        borderRadius: BorderRadius.circular(9),
                        border: Border.all(
                            color: on ? _pGreen : _pBorder,
                            width: on ? 1.5 : 1),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        if (on)
                          const Padding(
                            padding: EdgeInsets.only(right: 5),
                            child: Icon(Icons.check_circle_rounded,
                                size: 13, color: _pGreen),
                          ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(s.name,
                                style: TextStyle(
                                    color: on
                                        ? _pGreen
                                        : const Color(0xFF374151),
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w700)),
                            Text('LKR ${s.price.toStringAsFixed(0)}',
                                style: TextStyle(
                                    color: on
                                        ? _pGreen.withValues(alpha: 0.70)
                                        : const Color(0xFFADB5BD),
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ]),
                    ),
                  );
                }).toList(),
              ),

              const SizedBox(height: 12),

              // ── Amount row ───────────────────────────────────────────
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _label('TOTAL (LKR)'),
                      TextFormField(
                        controller: _totalAmountCtrl,
                        keyboardType: TextInputType.number,
                        decoration: _deco(
                            'Total', Icons.receipt_long_rounded),
                        onChanged: (_) => _syncPaid(),
                        validator: (v) {
                          if (_selectedServiceIds.isEmpty) {
                            return 'Select service';
                          }
                          if (v == null || v.trim().isEmpty) {
                            return 'Required';
                          }
                          if ((double.tryParse(v.trim()) ?? 0) <= 0) {
                            return 'Invalid';
                          }
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _label('PAID (LKR)'),
                      TextFormField(
                        controller: _paidAmountCtrl,
                        keyboardType: TextInputType.number,
                        decoration: _deco(
                            'Paid', Icons.currency_rupee_rounded),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return 'Required';
                          }
                          if ((double.tryParse(v.trim()) ?? -1) < 0) {
                            return 'Invalid';
                          }
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
              ]),

              const SizedBox(height: 10),

              // Discount
              _label('LOYALTY DISCOUNT (LKR)'),
              TextFormField(
                controller: _loyaltyDiscountCtrl,
                keyboardType: TextInputType.number,
                decoration: _deco('0', Icons.discount_outlined),
                onChanged: (_) {
                  _paidAmountCtrl.clear();
                  _syncPaid();
                },
              ),

              const SizedBox(height: 12),

              // ── Payment method chips ──────────────────────────────────
              _label('PAYMENT METHOD'),
              Wrap(
                spacing: 7,
                runSpacing: 7,
                children: _methods.map((m) {
                  final sel = _method == m;
                  return GestureDetector(
                    onTap: () => setState(() => _method = m),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 130),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: sel ? _pGreenL : _pBg,
                        borderRadius: BorderRadius.circular(9),
                        border: Border.all(
                            color: sel ? _pGreen : _pBorder,
                            width: sel ? 1.5 : 1),
                      ),
                      child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              _methodIcons[m] ?? Icons.payments_rounded,
                              size: 14,
                              color: sel
                                  ? _pGreen
                                  : const Color(0xFF9CA3AF),
                            ),
                            const SizedBox(width: 6),
                            Text(m,
                                style: TextStyle(
                                    color: sel
                                        ? _pGreen
                                        : const Color(0xFF6B7280),
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w700)),
                          ]),
                    ),
                  );
                }).toList(),
              ),

              const SizedBox(height: 20),

              // ── Confirm button ───────────────────────────────────────
              GestureDetector(
                onTap: _submit,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF047857), _pGreen],
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                    ),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                          color: _pGreen.withValues(alpha: 0.30),
                          blurRadius: 14,
                          offset: const Offset(0, 5)),
                    ],
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.check_circle_rounded,
                          color: Colors.white, size: 18),
                      SizedBox(width: 9),
                      Text('Confirm Payment',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.2)),
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
