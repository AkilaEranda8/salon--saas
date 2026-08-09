import 'package:flutter/material.dart';

import '../models/salon_service.dart';

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
class AddServiceModalResult {
  const AddServiceModalResult({
    required this.name,
    required this.category,
    required this.durationMinutes,
    required this.price,
    required this.description,
    this.commissionType,
    this.commissionValue,
    this.isActive = true,
  });

  final String name;
  final String category;
  final String durationMinutes;
  final String price;
  final String description;
  final String? commissionType;
  final String? commissionValue;
  final bool isActive;
}

// ─────────────────────────────────────────────────────────────────────────────
class AddServiceModal extends StatefulWidget {
  const AddServiceModal({
    required this.categories,
    this.showServiceWiseCommission = false,
    this.initial,
    super.key,
  });

  final List<String> categories;
  final bool showServiceWiseCommission;
  /// When set, modal opens in edit mode.
  final SalonService? initial;

  static Future<AddServiceModalResult?> show(
    BuildContext context, {
    required List<String> categories,
    bool showServiceWiseCommission = false,
    SalonService? initial,
  }) {
    return showModalBottomSheet<AddServiceModalResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AddServiceModal(
        categories: categories,
        showServiceWiseCommission: showServiceWiseCommission,
        initial: initial,
      ),
    );
  }

  @override
  State<AddServiceModal> createState() => _AddServiceModalState();
}

class _AddServiceModalState extends State<AddServiceModal> {
  final _formKey      = GlobalKey<FormState>();
  final _nameCtrl     = TextEditingController();
  final _durationCtrl = TextEditingController(text: '30');
  final _priceCtrl    = TextEditingController();
  final _descCtrl     = TextEditingController();
  final _newCatCtrl   = TextEditingController();
  final _commCtrl     = TextEditingController();

  late String _category;
  String _commissionType = 'percentage';
  bool _addingNewCat = false;
  bool _isActive = true;

  bool get _isEdit => widget.initial != null;

  @override
  void initState() {
    super.initState();
    final valid = widget.categories.where((c) => c.trim().isNotEmpty).toList();
    final initial = widget.initial;
    if (initial != null) {
      _nameCtrl.text = initial.name;
      _durationCtrl.text = '${initial.durationMinutes}';
      _priceCtrl.text = initial.price.toStringAsFixed(
        initial.price.truncateToDouble() == initial.price ? 0 : 2,
      );
      _descCtrl.text = initial.description;
      _isActive = initial.isActive;
      final cat = initial.category.trim().isEmpty ? 'Other' : initial.category.trim();
      _category = valid.contains(cat)
          ? cat
          : (valid.isNotEmpty ? valid.first : cat);
      if (!valid.contains(cat) && cat.isNotEmpty) {
        // Keep service category even if not in dropdown list yet.
        _category = cat;
      }
      if (initial.commissionType != null &&
          initial.commissionType!.trim().isNotEmpty) {
        _commissionType = initial.commissionType!;
      }
      if (initial.commissionValue != null) {
        final v = initial.commissionValue!;
        _commCtrl.text = v.truncateToDouble() == v
            ? v.toStringAsFixed(0)
            : v.toStringAsFixed(1);
      }
    } else {
      _category = valid.isNotEmpty ? valid.first : 'Other';
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _durationCtrl.dispose();
    _priceCtrl.dispose();
    _descCtrl.dispose();
    _newCatCtrl.dispose();
    _commCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final cat = _addingNewCat
        ? _newCatCtrl.text.trim()
        : _category;
    Navigator.of(context).pop(AddServiceModalResult(
      name:            _nameCtrl.text.trim(),
      category:        cat.isNotEmpty ? cat : 'Other',
      durationMinutes: _durationCtrl.text.trim(),
      price:           _priceCtrl.text.trim(),
      description:     _descCtrl.text.trim(),
      commissionType:  widget.showServiceWiseCommission ? _commissionType : null,
      commissionValue: widget.showServiceWiseCommission ? _commCtrl.text.trim() : null,
      isActive:        _isActive,
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
        hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
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
                  child: const Icon(Icons.content_cut_rounded,
                      color: _cForest, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _isEdit ? 'Edit Service' : 'New Service',
                        style: const TextStyle(
                          color: _cInk, fontSize: 17,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2,
                        ),
                      ),
                      Text(
                        _isEdit
                            ? 'Update service details below'
                            : 'Fill in the service details below',
                        style: const TextStyle(
                          color: Color(0xFFADB5BD), fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
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

              // ── Service name ─────────────────────────────────────────
              _label('SERVICE NAME'),
              TextFormField(
                controller: _nameCtrl,
                textCapitalization: TextCapitalization.words,
                decoration: _deco('e.g. Hair Cut & Styling',
                    Icons.content_cut_rounded, required: true),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Name is required' : null,
              ),

              const SizedBox(height: 14),

              // ── Category ─────────────────────────────────────────────
              Row(children: [
                Expanded(child: _label('CATEGORY')),
                GestureDetector(
                  onTap: () => setState(() {
                    _addingNewCat = !_addingNewCat;
                    _newCatCtrl.clear();
                  }),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: _addingNewCat
                          ? _cGreenL : const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: _addingNewCat ? _cGreenB : _cBorder),
                    ),
                    child: Text(
                      _addingNewCat ? 'Pick existing' : '+ New category',
                      style: TextStyle(
                        color: _addingNewCat ? _cForest : _cMuted,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700)),
                  ),
                ),
              ]),
              const SizedBox(height: 6),
              if (_addingNewCat)
                TextFormField(
                  controller: _newCatCtrl,
                  textCapitalization: TextCapitalization.words,
                  decoration: _deco('e.g. Nail Art',
                      Icons.category_outlined, required: true),
                  validator: (v) => _addingNewCat &&
                          (v == null || v.trim().isEmpty)
                      ? 'Category name required'
                      : null,
                )
              else
                Builder(
                  builder: (context) {
                    final opts = <String>{
                      ...widget.categories.where((c) => c.trim().isNotEmpty),
                      if (_category.trim().isNotEmpty) _category,
                    }.toList()
                      ..sort();
                    final value = opts.contains(_category)
                        ? _category
                        : (opts.isNotEmpty ? opts.first : 'Other');
                    return DropdownButtonFormField<String>(
                      initialValue: value,
                      isExpanded: true,
                      decoration: _deco(
                        'Select category',
                        Icons.category_outlined,
                        required: true,
                      ),
                      items: opts
                          .map(
                            (c) => DropdownMenuItem(
                              value: c,
                              child: Text(c, overflow: TextOverflow.ellipsis),
                            ),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v != null) setState(() => _category = v);
                      },
                    );
                  },
                ),

              if (_isEdit) ...[
                const SizedBox(height: 14),
                _label('STATUS'),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: _cBg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _cBorder),
                  ),
                  child: SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      _isActive ? 'Active' : 'Inactive',
                      style: const TextStyle(
                        color: _cInk,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    subtitle: Text(
                      _isActive
                          ? 'Visible for booking'
                          : 'Hidden from booking lists',
                      style: const TextStyle(color: _cMuted, fontSize: 12),
                    ),
                    value: _isActive,
                    activeThumbColor: _cEmerald,
                    onChanged: (v) => setState(() => _isActive = v),
                  ),
                ),
              ],

              const SizedBox(height: 14),

              // ── Duration & Price row ─────────────────────────────────
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _label('DURATION (MIN)'),
                      TextFormField(
                        controller: _durationCtrl,
                        keyboardType: TextInputType.number,
                        decoration: _deco('30',
                            Icons.schedule_rounded, required: true),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return 'Required';
                          }
                          final m = int.tryParse(v.trim());
                          if (m == null || m <= 0) return 'Invalid';
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
                      _label('PRICE (LKR)'),
                      TextFormField(
                        controller: _priceCtrl,
                        keyboardType: TextInputType.number,
                        decoration: _deco('0',
                            Icons.payments_outlined, required: true),
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

              const SizedBox(height: 14),

              if (widget.showServiceWiseCommission) ...[
                _label('COMMISSION'),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFBEB),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFFDE68A)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Optional per-service commission rate',
                        style: TextStyle(
                          color: Color(0xFF92400E),
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            initialValue: _commissionType,
                            isExpanded: true,
                            decoration: _deco('Type', Icons.percent_rounded),
                            items: const [
                              DropdownMenuItem(
                                value: 'percentage',
                                child: Text('Percentage %'),
                              ),
                              DropdownMenuItem(
                                value: 'fixed',
                                child: Text('Fixed Rs.'),
                              ),
                            ],
                            onChanged: (v) {
                              if (v != null) setState(() => _commissionType = v);
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            controller: _commCtrl,
                            keyboardType: TextInputType.number,
                            decoration: _deco(
                              _commissionType == 'fixed' ? 'e.g. 500' : 'e.g. 10',
                              Icons.payments_outlined,
                            ),
                            validator: (v) {
                              final raw = v?.trim() ?? '';
                              if (raw.isEmpty) return null;
                              final n = double.tryParse(raw);
                              if (n == null || n < 0) return 'Invalid';
                              return null;
                            },
                          ),
                        ),
                      ]),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
              ],

              // ── Description ──────────────────────────────────────────
              _label('DESCRIPTION'),
              TextFormField(
                controller: _descCtrl,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: 'Brief description (optional)',
                  hintStyle: const TextStyle(
                      color: Color(0xFFB0B8B0), fontSize: 14),
                  prefixIcon: const Padding(
                    padding: EdgeInsets.only(bottom: 40),
                    child: Icon(Icons.notes_rounded,
                        color: _cForest, size: 19),
                  ),
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
                    borderSide: const BorderSide(
                        color: _cForest, width: 1.8)),
                ),
              ),

              const SizedBox(height: 24),

              // ── Divider ──────────────────────────────────────────────
              Container(
                height: 1, color: _cBorder,
                margin: const EdgeInsets.only(bottom: 20)),

              // ── Submit ───────────────────────────────────────────────
              GestureDetector(
                onTap: _submit,
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
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        _isEdit
                            ? Icons.save_rounded
                            : Icons.check_circle_rounded,
                        color: Colors.white,
                        size: 18,
                      ),
                      const SizedBox(width: 9),
                      Text(
                        _isEdit ? 'Save changes' : 'Add Service',
                        style: const TextStyle(
                          color: Colors.white, fontSize: 15,
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
