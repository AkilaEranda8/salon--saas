import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../widgets/walk_in_service_dropdown_section.dart';

/// Same as web `WalkInPage.jsx` — extra services go in `note`; API stores one `service_id`.
const String _kAdditionalServicesLinePrefix = 'Additional services:';

/// Sentinel id for the "Register new customer" autocomplete option.
const String _kWalkInNewCustId = '__walkin_register_new__';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _cForest  = Color(0xFF1B3A2D);
const Color _cEmerald = Color(0xFF2D6A4F);
const Color _cGreenL  = Color(0xFFECFDF5);
const Color _cGreenB  = Color(0xFFA7F3D0);
const Color _cBg      = Color(0xFFF9FAFB);
const Color _cBorder  = Color(0xFFE5E7EB);
const Color _cInk     = Color(0xFF111827);
const Color _cMuted   = Color(0xFF6B7280);

// ─────────────────────────────────────────────────────────────────────────────
class AddWalkInModalResult {
  const AddWalkInModalResult({
    required this.branchId,
    required this.customerName,
    required this.phone,
    required this.serviceId,
    required this.serviceIds,
    required this.note,
  });

  final String branchId;
  final String customerName;
  final String phone;
  final String serviceId;
  /// Ordered selection (primary first) — used by API to save `total_amount`.
  final List<String> serviceIds;
  final String note;
}

// ─────────────────────────────────────────────────────────────────────────────
class AddWalkInModal extends StatefulWidget {
  const AddWalkInModal({
    required this.branches,
    required this.services,
    this.customers = const [],
    this.initialBranchId,
    this.onRegisterNewCustomer,
    super.key,
  });

  final List<Map<String, String>> branches;
  final List<SalonService> services;
  final List<Customer> customers;
  final String? initialBranchId;
  /// Called when user taps "Add & Register". Returns created [Customer] or null.
  final Future<Customer?> Function(String name, String phone, String? branchId)? onRegisterNewCustomer;

  static Future<AddWalkInModalResult?> show(
    BuildContext context, {
    required List<Map<String, String>> branches,
    required List<SalonService> services,
    List<Customer> customers = const [],
    String? initialBranchId,
    Future<Customer?> Function(String name, String phone, String? branchId)? onRegisterNewCustomer,
  }) {
    return showModalBottomSheet<AddWalkInModalResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AddWalkInModal(
        branches: branches,
        services: services,
        customers: customers,
        initialBranchId: initialBranchId,
        onRegisterNewCustomer: onRegisterNewCustomer,
      ),
    );
  }

  @override
  State<AddWalkInModal> createState() => _AddWalkInModalState();
}

class _AddWalkInModalState extends State<AddWalkInModal> {
  final _formKey   = GlobalKey<FormState>();
  final _nameCtrl  = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _noteCtrl  = TextEditingController();

  String? _branchId;
  String? _primaryServiceId;
  final List<String> _extraServiceIds = [];

  bool _registerMode = false;
  bool _registering  = false;
  bool _registered   = false;

  @override
  void initState() {
    super.initState();
    _branchId = widget.initialBranchId;
    if ((_branchId == null || _branchId!.trim().isEmpty) &&
        widget.branches.length == 1) {
      _branchId = widget.branches.first['id'];
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  void _onBranchPicked(String? v) {
    setState(() => _branchId = v);
  }

  List<String> _orderedSelectedServiceIds() {
    final p = _primaryServiceId?.trim();
    if (p == null || p.isEmpty) return const [];
    return [p, ..._extraServiceIds];
  }

  /// Sum of selected service prices (matches API `total_amount` for multi-service).
  double _totalSelectedAmount() {
    var sum = 0.0;
    for (final id in _orderedSelectedServiceIds()) {
      for (final s in widget.services) {
        if (s.id == id) {
          sum += s.price;
          break;
        }
      }
    }
    return sum;
  }

  void _removeExtraAt(int index) {
    setState(() {
      if (index >= 0 && index < _extraServiceIds.length) {
        _extraServiceIds.removeAt(index);
      }
    });
  }

  void _onPrimaryDropdownChanged(String? v) {
    setState(() {
      final prev = _primaryServiceId;
      if (v == null) {
        _primaryServiceId = null;
        return;
      }
      if (prev != null && prev.isNotEmpty && prev != v) {
        _extraServiceIds.insert(0, prev);
      }
      _primaryServiceId = v;
    });
  }

  void _onAddExtraFromDropdown(String id) {
    setState(() {
      final p = _primaryServiceId?.trim();
      if (p == null || p.isEmpty) {
        _primaryServiceId = id;
      } else {
        _extraServiceIds.add(id);
      }
    });
  }

  String _noteForApi() {
    final base = _noteCtrl.text
        .split('\n')
        .where((l) => !l.trim().startsWith(_kAdditionalServicesLinePrefix))
        .join('\n')
        .trim();
    final ordered = _orderedSelectedServiceIds();
    if (ordered.length <= 1) return base;
    final extraNames = ordered
        .skip(1)
        .map((sid) {
          for (final s in widget.services) {
            if (s.id == sid) return s.name;
          }
          return '';
        })
        .where((n) => n.trim().isNotEmpty)
        .toList();
    if (extraNames.isEmpty) return base;
    final extraLine = '$_kAdditionalServicesLinePrefix ${extraNames.join(', ')}';
    if (base.isEmpty) return extraLine;
    return '$base\n$extraLine';
  }

  Future<void> _doRegister() async {
    final fn = widget.onRegisterNewCustomer;
    if (fn == null) return;
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) return;
    setState(() => _registering = true);
    final newCust = await fn(name, _phoneCtrl.text.trim(), _branchId);
    if (!mounted) return;
    if (newCust != null) {
      setState(() {
        _registered   = true;
        _registerMode = false;
        _registering  = false;
        _nameCtrl.text  = newCust.name;
        _phoneCtrl.text = newCust.phone.isNotEmpty ? newCust.phone : _phoneCtrl.text;
      });
    } else {
      setState(() => _registering = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Failed to register customer. Try again.'),
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final ids = _orderedSelectedServiceIds();
    Navigator.of(context).pop(AddWalkInModalResult(
      branchId:     (_branchId ?? '').trim(),
      customerName: _nameCtrl.text.trim(),
      phone:        _phoneCtrl.text.trim(),
      serviceId:    ids.isEmpty ? '' : ids.first.trim(),
      serviceIds:   List<String>.from(ids),
      note:         _noteForApi(),
    ));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text,
      style: const TextStyle(
        color: _cMuted, fontSize: 11.5,
        fontWeight: FontWeight.w700, letterSpacing: 0.5)),
  );

  InputDecoration _deco(String hint, IconData icon,
      {bool required = false}) =>
      InputDecoration(
        hintText: required ? hint : '$hint (optional)',
        hintStyle: const TextStyle(
            color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _cForest, size: 19),
        filled: true,
        fillColor: _cBg,
        contentPadding: const EdgeInsets.symmetric(
            horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _cBorder)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _cBorder)),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _cForest, width: 1.8)),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _cForest, width: 1.8)),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFF43F5E))),
      );

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final activeServices =
        widget.services.where((s) => s.isActive).toList();

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
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: _cGreenL,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _cGreenB),
                  ),
                  child: const Icon(Icons.directions_walk_rounded,
                      color: _cForest, size: 20),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('New Walk-in',
                        style: TextStyle(
                          color: _cInk, fontSize: 17,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2)),
                      Text('Customer first, then services',
                        style: TextStyle(
                          color: Color(0xFFADB5BD), fontSize: 12,
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
                        size: 16, color: _cMuted),
                  ),
                ),
              ]),

              const SizedBox(height: 22),

              // ── Customer (autocomplete + register new) ─────────────
              _label('CUSTOMER'),

              // Registered success chip
              if (_registered) ...[
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF86EFAC)),
                  ),
                  child: Row(children: [
                    const Icon(Icons.check_circle_rounded,
                        color: Color(0xFF15803D), size: 16),
                    const SizedBox(width: 8),
                    Text(
                      'New customer "${_nameCtrl.text}" registered!',
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF065F46)),
                    ),
                  ]),
                ),
              ],

              Autocomplete<Customer>(
                optionsBuilder: (val) {
                  final q   = val.text.trim().toLowerCase();
                  final all = widget.customers;
                  List<Customer> matches;
                  if (q.isEmpty) {
                    matches = all.take(10).toList();
                  } else {
                    matches = all
                        .where((c) =>
                            c.name.toLowerCase().contains(q) ||
                            c.phone.contains(q))
                        .take(15)
                        .toList();
                  }
                  // Sentinel when no exact match & ≥2 chars
                  final hasExact =
                      all.any((c) => c.name.toLowerCase() == q);
                  if (q.length >= 2 &&
                      !hasExact &&
                      widget.onRegisterNewCustomer != null) {
                    matches = [
                      ...matches,
                      Customer(
                          id: _kWalkInNewCustId,
                          name: val.text.trim(),
                          phone: '',
                          email: ''),
                    ];
                  }
                  return matches;
                },
                displayStringForOption: (c) => c.name,
                onSelected: (c) {
                  if (c.id == _kWalkInNewCustId) {
                    setState(() {
                      _registerMode = true;
                      _registered   = false;
                      _nameCtrl.text = c.name;
                    });
                    return;
                  }
                  setState(() {
                    _nameCtrl.text  = c.name;
                    _phoneCtrl.text = c.phone;
                    _registerMode   = false;
                    _registered     = false;
                  });
                },
                fieldViewBuilder: (ctx, ctrl, fn, _) {
                  if (_nameCtrl.text.isNotEmpty &&
                      ctrl.text != _nameCtrl.text) {
                    ctrl.text = _nameCtrl.text;
                  }
                  return TextFormField(
                    controller: ctrl,
                    focusNode: fn,
                    textCapitalization: TextCapitalization.words,
                    decoration: _deco(
                        widget.customers.isEmpty
                            ? 'Full name'
                            : 'Search or type name',
                        Icons.person_search_rounded,
                        required: true),
                    onChanged: (v) {
                      _nameCtrl.text = v;
                      if (_registerMode || _registered) {
                        setState(() {
                          _registerMode = false;
                          _registered   = false;
                        });
                      }
                    },
                    validator: (v) =>
                        (v == null || v.trim().isEmpty)
                            ? 'Name is required'
                            : null,
                  );
                },
                optionsViewBuilder: (ctx, onSel, opts) => Align(
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
                          if (c.id == _kWalkInNewCustId) {
                            return ListTile(
                              dense: true,
                              tileColor: const Color(0xFFF0FDF4),
                              leading: CircleAvatar(
                                radius: 16,
                                backgroundColor:
                                    const Color(0xFFDCFCE7),
                                child: const Icon(
                                    Icons.person_add_alt_1_rounded,
                                    size: 16,
                                    color: Color(0xFF15803D)),
                              ),
                              title: Text(
                                'Register "${c.name}" as new customer',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: Color(0xFF15803D)),
                              ),
                              subtitle: const Text(
                                  'Add name + phone, then register',
                                  style: TextStyle(fontSize: 11)),
                              onTap: () => onSel(c),
                            );
                          }
                          final init = c.name.isNotEmpty
                              ? c.name[0].toUpperCase()
                              : '?';
                          return ListTile(
                            dense: true,
                            leading: CircleAvatar(
                              radius: 16,
                              backgroundColor: _cGreenL,
                              child: Text(init,
                                  style: const TextStyle(
                                      color: _cForest,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13)),
                            ),
                            title: Text(c.name,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13.5)),
                            subtitle: c.phone.isNotEmpty
                                ? Text(c.phone,
                                    style: const TextStyle(
                                        color: _cMuted,
                                        fontSize: 12))
                                : null,
                            onTap: () => onSel(c),
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 14),

              // ── Phone ────────────────────────────────────────────────
              _label('PHONE NUMBER'),
              TextFormField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration:
                    _deco('e.g. 0771234567', Icons.phone_outlined),
              ),

              // ── Register banner (shown after sentinel selected) ──────
              if (_registerMode) ...[

                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF86EFAC)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Register "${_nameCtrl.text}" as new customer',
                        style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF065F46)),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Phone number above will be saved. Tap the button to register.',
                        style: TextStyle(
                            fontSize: 11, color: Color(0xFF6B7280)),
                      ),
                      const SizedBox(height: 10),
                      GestureDetector(
                        onTap: _registering ? null : _doRegister,
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                              vertical: 11),
                          decoration: BoxDecoration(
                            color: _registering
                                ? const Color(0xFF9CA3AF)
                                : const Color(0xFF059669),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Center(
                            child: _registering
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        color: Colors.white,
                                        strokeWidth: 2))
                                : const Text('Add & Register Customer',
                                    style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 14),

              // ── Branch (then services) ───────────────────────────────
              if (widget.branches.isNotEmpty) ...[
                _label('BRANCH'),
                DropdownButtonFormField<String>(
                  key: ValueKey<String?>('branch_$_branchId'),
                  initialValue: _branchId,
                  isExpanded: true,
                  decoration: _deco('Select branch',
                      Icons.store_mall_directory_outlined,
                      required: true),
                  items: widget.branches
                      .map((b) => DropdownMenuItem(
                            value: b['id'],
                            child: Text(b['name'] ?? '',
                                overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (v) => _onBranchPicked(v),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty)
                          ? 'Branch required' : null,
                ),
                const SizedBox(height: 14),
              ],

              WalkInServiceDropdownSection(
                activeServices: activeServices,
                primaryServiceId: _primaryServiceId,
                orderedServiceIds: _orderedSelectedServiceIds(),
                onPrimaryChanged: _onPrimaryDropdownChanged,
                onAddExtra: _onAddExtraFromDropdown,
                onRemoveExtraAt: _removeExtraAt,
                label: 'SERVICES',
                helperText:
                    'Pick the main service; add lines below — you can add the same service more than once.',
                accentColor: _cForest,
                borderColor: _cBorder,
                bgColor: _cBg,
                mutedColor: _cMuted,
              ),

              if (_orderedSelectedServiceIds().isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _cForest.withValues(alpha: 0.35),
                      width: 1.2),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _cGreenB,
                          ),
                        ),
                        child: const Icon(
                          Icons.payments_rounded,
                          color: _cForest,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Total amount',
                              style: TextStyle(
                                color: _cMuted.withValues(alpha: 0.95),
                                fontSize: 11.5,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.4,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'LKR ${_totalSelectedAmount().toStringAsFixed(0)}',
                              style: const TextStyle(
                                color: _cForest,
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.3,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${_orderedSelectedServiceIds().length} service(s) selected',
                              style: TextStyle(
                                color: _cForest.withValues(alpha: 0.55),
                                fontSize: 10.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 14),

              // ── Note ─────────────────────────────────────────────────
              _label('NOTE'),
              TextFormField(
                controller: _noteCtrl,
                maxLines: 2,
                decoration: InputDecoration(
                  hintText: 'Any special requests… (optional)',
                  hintStyle: const TextStyle(
                      color: Color(0xFFB0B8B0), fontSize: 14),
                  prefixIcon: const Padding(
                    padding: EdgeInsets.only(bottom: 22),
                    child: Icon(Icons.notes_rounded,
                        color: _cForest, size: 19),
                  ),
                  filled: true, fillColor: _cBg,
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 13),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: _cBorder)),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: _cBorder)),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                        color: _cForest, width: 1.8)),
                ),
              ),

              const SizedBox(height: 24),

              Container(height: 1, color: _cBorder,
                  margin: const EdgeInsets.only(bottom: 20)),

              // ── Submit ───────────────────────────────────────────────
              GestureDetector(
                onTap: () {
                  if (_orderedSelectedServiceIds().isEmpty) {
                    setState(() {}); // trigger validation hint
                    return;
                  }
                  _submit();
                },
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [_cForest, _cEmerald],
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [BoxShadow(
                      color: _cForest.withValues(alpha: 0.28),
                      blurRadius: 14, offset: const Offset(0, 5))],
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.directions_walk_rounded,
                          color: Colors.white, size: 18),
                      SizedBox(width: 9),
                      Text('Add to Queue',
                        style: TextStyle(
                          color: Colors.white, fontSize: 15,
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
