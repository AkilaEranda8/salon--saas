import 'package:flutter/material.dart';

import '../utils/phone_validation.dart';

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
class AddCustomerModalResult {
  const AddCustomerModalResult({
    required this.name,
    required this.phone,
    required this.email,
    required this.branchId,
  });

  final String name;
  final String phone;
  final String email;
  final String? branchId;
}

// ─────────────────────────────────────────────────────────────────────────────
class AddCustomerModal extends StatefulWidget {
  const AddCustomerModal({
    required this.branches,
    this.initialBranchId,
    super.key,
  });

  final List<Map<String, String>> branches;
  final String? initialBranchId;

  static Future<AddCustomerModalResult?> show(
    BuildContext context, {
    required List<Map<String, String>> branches,
    String? initialBranchId,
  }) {
    return showModalBottomSheet<AddCustomerModalResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AddCustomerModal(
        branches: branches,
        initialBranchId: initialBranchId,
      ),
    );
  }

  @override
  State<AddCustomerModal> createState() => _AddCustomerModalState();
}

class _AddCustomerModalState extends State<AddCustomerModal> {
  final _formKey   = GlobalKey<FormState>();
  final _nameCtrl  = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  String? _branchId;

  @override
  void initState() {
    super.initState();
    _branchId = widget.initialBranchId;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.of(context).pop(AddCustomerModalResult(
      name:     _nameCtrl.text.trim(),
      phone:    normalizeCustomerPhone(_phoneCtrl.text),
      email:    _emailCtrl.text.trim(),
      branchId: _branchId,
    ));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text,
      style: const TextStyle(
        color: _cMuted,
        fontSize: 11.5,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5)),
  );

  InputDecoration _deco(String hint, IconData icon, {bool required = false}) =>
      InputDecoration(
        hintText: required ? hint : '$hint (optional)',
        hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _cForest, size: 19),
        filled: true,
        fillColor: _cBg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
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
                  child: const Icon(Icons.person_add_rounded,
                      color: _cForest, size: 19),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('New Customer',
                        style: TextStyle(
                          color: _cInk,
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2)),
                      Text('Fill in the customer details below',
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
                        size: 16, color: _cMuted),
                  ),
                ),
              ]),

              const SizedBox(height: 22),

              // ── Name ────────────────────────────────────────────────
              _label('FULL NAME'),
              TextFormField(
                controller: _nameCtrl,
                textCapitalization: TextCapitalization.words,
                decoration: _deco('Customer name', Icons.person_outline_rounded,
                    required: true),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Name is required' : null,
              ),

              const SizedBox(height: 14),

              // ── Phone ───────────────────────────────────────────────
              _label('PHONE NUMBER'),
              TextFormField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: _deco('e.g. 0771234567',
                    Icons.phone_outlined, required: true),
                validator: validateCustomerPhone,
              ),

              const SizedBox(height: 14),

              // ── Email (optional) ────────────────────────────────────
              _label('EMAIL ADDRESS (OPTIONAL)'),
              TextFormField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration:
                    _deco('customer@email.com', Icons.mail_outline_rounded),
                validator: (v) {
                  final t = (v ?? '').trim();
                  if (t.isEmpty) return null;
                  if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(t)) {
                    return 'Enter a valid email or leave blank';
                  }
                  return null;
                },
              ),

              // ── Branch ──────────────────────────────────────────────
              if (widget.branches.isNotEmpty) ...[
                const SizedBox(height: 14),
                _label('BRANCH'),
                DropdownButtonFormField<String>(
                  initialValue: _branchId,
                  isExpanded: true,
                  decoration: _deco('Select branch',
                      Icons.store_mall_directory_outlined, required: true),
                  items: widget.branches
                      .map((b) => DropdownMenuItem(
                            value: b['id'],
                            child: Text(b['name'] ?? '',
                                overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (v) => setState(() => _branchId = v),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Branch required' : null,
                ),
              ],

              const SizedBox(height: 24),

              // ── Divider ─────────────────────────────────────────────
              Container(
                height: 1,
                color: _cBorder,
                margin: const EdgeInsets.only(bottom: 20)),

              // ── Submit button ────────────────────────────────────────
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
                        offset: const Offset(0, 5)),
                    ],
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.person_add_rounded,
                          color: Colors.white, size: 18),
                      SizedBox(width: 9),
                      Text('Add Customer',
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
