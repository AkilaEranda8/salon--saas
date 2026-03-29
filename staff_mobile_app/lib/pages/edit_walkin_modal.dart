import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/walkin_entry.dart';
import '../widgets/walk_in_service_dropdown_section.dart';
import 'add_walkin_modal.dart';

/// Same prefix as web / add walk-in for note line.
const String _kAdditionalServicesLinePrefix = 'Additional services:';

// ── Palette (match add walk-in) ──────────────────────────────────────────────
const Color _cForest  = Color(0xFF1B3A2D);
const Color _cEmerald = Color(0xFF2D6A4F);
const Color _cGreenL  = Color(0xFFECFDF5);
const Color _cGreenB  = Color(0xFFA7F3D0);
const Color _cBg      = Color(0xFFF9FAFB);
const Color _cBorder  = Color(0xFFE5E7EB);
const Color _cInk     = Color(0xFF111827);
const Color _cMuted   = Color(0xFF6B7280);

// ─────────────────────────────────────────────────────────────────────────────
class EditWalkInModal extends StatefulWidget {
  const EditWalkInModal({
    required this.entry,
    required this.branches,
    required this.services,
    this.customers = const [],
    super.key,
  });

  final WalkInEntry entry;
  final List<Map<String, String>> branches;
  final List<SalonService> services;
  final List<Customer> customers;

  static Future<AddWalkInModalResult?> show(
    BuildContext context, {
    required WalkInEntry entry,
    required List<Map<String, String>> branches,
    required List<SalonService> services,
    List<Customer> customers = const [],
  }) {
    return showModalBottomSheet<AddWalkInModalResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => EditWalkInModal(
        entry: entry,
        branches: branches,
        services: services,
        customers: customers,
      ),
    );
  }

  @override
  State<EditWalkInModal> createState() => _EditWalkInModalState();
}

class _EditWalkInModalState extends State<EditWalkInModal> {
  final _formKey   = GlobalKey<FormState>();
  final _nameCtrl  = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _noteCtrl  = TextEditingController();

  String? _primaryServiceId;
  final List<String> _extraServiceIds = [];

  String _branchDisplayName() {
    final bid = widget.entry.branchId;
    for (final b in widget.branches) {
      if (b['id'] == bid) return b['name'] ?? bid;
    }
    return bid.isNotEmpty ? bid : 'Branch';
  }

  static String _baseNoteFromEntry(String note) {
    return note
        .split('\n')
        .where((l) => !l.trim().startsWith(_kAdditionalServicesLinePrefix))
        .join('\n')
        .trim();
  }

  @override
  void initState() {
    super.initState();
    final e = widget.entry;
    _nameCtrl.text = e.customerName;
    _phoneCtrl.text = e.phone;
    _noteCtrl.text = _baseNoteFromEntry(e.note);
    final ids = e.orderedServiceIds;
    final list = ids.isNotEmpty
        ? ids
        : (e.serviceId.isNotEmpty ? [e.serviceId] : <String>[]);
    if (list.isNotEmpty) {
      _primaryServiceId = list.first;
      _extraServiceIds.addAll(list.length > 1 ? list.sublist(1) : []);
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  List<String> _orderedSelectedServiceIds() {
    final p = _primaryServiceId?.trim();
    if (p == null || p.isEmpty) return const [];
    return [p, ..._extraServiceIds];
  }

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

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final ids = _orderedSelectedServiceIds();
    if (ids.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one service')),
      );
      return;
    }
    Navigator.of(context).pop(AddWalkInModalResult(
      branchId:     widget.entry.branchId,
      customerName: _nameCtrl.text.trim(),
      phone:        _phoneCtrl.text.trim(),
      serviceId:    ids.first.trim(),
      serviceIds:   List<String>.from(ids),
      note:         _noteForApi(),
    ));
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: const TextStyle(
                color: _cMuted,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5)),
      );

  InputDecoration _deco(String hint, IconData icon,
          {bool required = false}) =>
      InputDecoration(
        hintText: required ? hint : '$hint (optional)',
        hintStyle:
            const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _cForest, size: 19),
        filled: true,
        fillColor: _cBg,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _cBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _cBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _cForest, width: 1.8),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _cForest, width: 1.8),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFF43F5E)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final activeServices = widget.services.where((s) => s.isActive).toList();
    final tok = widget.entry.token;

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

              Row(children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: _cGreenL,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _cGreenB),
                  ),
                  child: const Icon(Icons.edit_rounded,
                      color: _cForest, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Edit Walk-in',
                          style: TextStyle(
                              color: _cInk,
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.2)),
                      Text(
                        tok.isNotEmpty ? 'Token $tok' : 'Update details',
                        style: const TextStyle(
                            color: Color(0xFFADB5BD),
                            fontSize: 12,
                            fontWeight: FontWeight.w500),
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
                    child: const Icon(Icons.close_rounded,
                        size: 16, color: _cMuted),
                  ),
                ),
              ]),

              const SizedBox(height: 22),

              _label('BRANCH'),
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                decoration: BoxDecoration(
                  color: _cBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _cBorder),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.store_mall_directory_outlined,
                        color: _cForest, size: 19),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _branchDisplayName(),
                        style: const TextStyle(
                          color: _cInk,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 14),

              _label('CUSTOMER'),
              Autocomplete<Customer>(
                optionsBuilder: (val) {
                  final q = val.text.trim().toLowerCase();
                  final all = widget.customers;
                  if (q.isEmpty) return all.take(10);
                  return all
                      .where((c) =>
                          c.name.toLowerCase().contains(q) ||
                          c.phone.contains(q))
                      .take(15);
                },
                displayStringForOption: (c) => c.name,
                onSelected: (c) {
                  setState(() {
                    _nameCtrl.text = c.name;
                    _phoneCtrl.text = c.phone;
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
                    onChanged: (v) => _nameCtrl.text = v,
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? 'Name is required'
                        : null,
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
                                  maxHeight: 200, maxWidth: 420),
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
                                                color: _cMuted, fontSize: 12))
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

              _label('PHONE NUMBER'),
              TextFormField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: _deco('e.g. 0771234567', Icons.phone_outlined),
              ),

              const SizedBox(height: 14),

              WalkInServiceDropdownSection(
                activeServices: activeServices,
                primaryServiceId: _primaryServiceId,
                orderedServiceIds: _orderedSelectedServiceIds(),
                onPrimaryChanged: _onPrimaryDropdownChanged,
                onAddExtra: _onAddExtraFromDropdown,
                onRemoveExtraAt: _removeExtraAt,
                label: 'SERVICES',
                helperText:
                    'Pick the main service; add lines — same service can repeat.',
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
                      width: 1.2,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: _cGreenB),
                        ),
                        child: const Icon(Icons.payments_rounded,
                            color: _cForest, size: 20),
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
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 14),

              _label('NOTE'),
              TextFormField(
                controller: _noteCtrl,
                maxLines: 2,
                decoration: InputDecoration(
                  hintText: 'Any special requests… (optional)',
                  hintStyle:
                      const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
                  prefixIcon: const Padding(
                    padding: EdgeInsets.only(bottom: 22),
                    child: Icon(Icons.notes_rounded, color: _cForest, size: 19),
                  ),
                  filled: true,
                  fillColor: _cBg,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: _cBorder),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: _cBorder),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide:
                        const BorderSide(color: _cForest, width: 1.8),
                  ),
                ),
              ),

              const SizedBox(height: 24),

              Container(
                  height: 1,
                  color: _cBorder,
                  margin: const EdgeInsets.only(bottom: 20)),

              GestureDetector(
                onTap: _submit,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [_cForest, _cEmerald],
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                    ),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: _cForest.withValues(alpha: 0.28),
                        blurRadius: 14,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.save_rounded, color: Colors.white, size: 18),
                      SizedBox(width: 9),
                      Text('Save changes',
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
