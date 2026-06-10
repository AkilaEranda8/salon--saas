import 'package:flutter/material.dart';

import '../models/salon_service.dart';
import '../models/staff_member.dart';

const Color _cForest  = Color(0xFF1B3A2D);
const Color _cEmerald = Color(0xFF2D6A4F);
const Color _cBg      = Color(0xFFF9FAFB);
const Color _cBorder  = Color(0xFFE5E7EB);
const Color _cInk     = Color(0xFF111827);
const Color _cMuted   = Color(0xFF6B7280);

class AddStaffModalResult {
  const AddStaffModalResult({
    required this.name,
    required this.phone,
    required this.roleTitle,
    required this.salaryType,
    required this.branchId,
    this.email,
    this.baseSalary,
    this.commissionType,
    this.commissionValue,
    this.serviceCommissions = const {},
    this.isActive = true,
    this.staffId,
  });

  final String name;
  final String phone;
  final String roleTitle;
  final String salaryType;
  final String branchId;
  final String? email;
  final String? baseSalary;
  final String? commissionType;
  final String? commissionValue;
  /// serviceId -> custom commission value (empty = use default)
  final Map<String, String> serviceCommissions;
  final bool isActive;
  final String? staffId;
}

class AddStaffModal extends StatefulWidget {
  const AddStaffModal({
    required this.branchId,
    required this.services,
    this.showServiceWiseCommission = false,
    this.initial,
    super.key,
  });

  final String branchId;
  final List<SalonService> services;
  final bool showServiceWiseCommission;
  final StaffMember? initial;

  static Future<AddStaffModalResult?> show(
    BuildContext context, {
    required String branchId,
    required List<SalonService> services,
    bool showServiceWiseCommission = false,
    StaffMember? initial,
  }) {
    return showModalBottomSheet<AddStaffModalResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: false,
      builder: (_) => AddStaffModal(
        branchId: branchId,
        services: services,
        showServiceWiseCommission: showServiceWiseCommission,
        initial: initial,
      ),
    );
  }

  @override
  State<AddStaffModal> createState() => _AddStaffModalState();
}

class _AddStaffModalState extends State<AddStaffModal> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameCtrl;
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _emailCtrl;
  late final TextEditingController _roleCtrl;
  late final TextEditingController _baseSalaryCtrl;
  late final TextEditingController _commCtrl;

  late String _salaryType;
  late String _commissionType;
  late bool _isActive;
  final Map<String, TextEditingController> _svcCommCtrls = {};
  final Set<String> _selectedServices = {};

  bool get _isEdit => widget.initial != null;
  bool get _paysCommission =>
      _salaryType != 'salary_only';

  List<SalonService> get _activeServices =>
      widget.services.where((s) => s.isActive).toList();

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _nameCtrl = TextEditingController(text: i?.name ?? '');
    _phoneCtrl = TextEditingController(text: i?.phone ?? '');
    _emailCtrl = TextEditingController(text: i?.email ?? '');
    _roleCtrl = TextEditingController(text: i?.roleTitle ?? '');
    _baseSalaryCtrl = TextEditingController(
      text: i?.baseSalary != null ? '${i!.baseSalary!.toStringAsFixed(0)}' : '',
    );
    _commCtrl = TextEditingController(
      text: i?.commissionValue != null ? '${i!.commissionValue!}' : '',
    );
    _salaryType = i?.salaryType ?? 'commission_only';
    _commissionType = i?.commissionType ?? 'percentage';
    _isActive = i?.isActive ?? true;

    for (final s in _activeServices) {
      _svcCommCtrls[s.id] = TextEditingController();
    }

    if (i != null && widget.showServiceWiseCommission && _paysCommission) {
      for (final spec in i.specializations) {
        final sid = '${spec.serviceId}';
        _selectedServices.add(sid);
        if (spec.commissionValue != null) {
          _svcCommCtrls[sid]?.text = '${spec.commissionValue}';
        }
      }
    } else if (widget.showServiceWiseCommission && _paysCommission) {
      _linkAllServices(prefillCatalogue: true);
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _roleCtrl.dispose();
    _baseSalaryCtrl.dispose();
    _commCtrl.dispose();
    for (final c in _svcCommCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _linkAllServices({bool prefillCatalogue = false}) {
    setState(() {
      _selectedServices
        ..clear()
        ..addAll(_activeServices.map((s) => s.id));
      if (prefillCatalogue) {
        for (final s in _activeServices) {
          if (s.commissionValue != null) {
            _svcCommCtrls[s.id]?.text = s.commissionValue!
                .toStringAsFixed(
                    s.commissionValue!.truncateToDouble() == s.commissionValue
                        ? 0
                        : 1);
          }
        }
      }
    });
  }

  void _onSalaryTypeChanged(String? v) {
    if (v == null) return;
    setState(() {
      _salaryType = v;
      if (v == 'salary_only') {
        _selectedServices.clear();
      } else if (widget.showServiceWiseCommission) {
        _linkAllServices(prefillCatalogue: _selectedServices.isEmpty);
      }
    });
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    if (widget.showServiceWiseCommission &&
        _paysCommission &&
        _selectedServices.isEmpty &&
        _activeServices.isNotEmpty) {
      _linkAllServices();
    }
    if (widget.showServiceWiseCommission &&
        _paysCommission &&
        _commCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Set a default commission rate.')),
      );
      return;
    }

    final svcMap = <String, String>{};
    if (widget.showServiceWiseCommission && _paysCommission) {
      for (final id in _selectedServices) {
        svcMap[id] = _svcCommCtrls[id]?.text.trim() ?? '';
      }
    }

    Navigator.of(context).pop(AddStaffModalResult(
      staffId: widget.initial?.id,
      name: _nameCtrl.text.trim(),
      phone: _phoneCtrl.text.trim(),
      email: _emailCtrl.text.trim().isEmpty ? null : _emailCtrl.text.trim(),
      roleTitle: _roleCtrl.text.trim(),
      salaryType: _salaryType,
      branchId: widget.branchId,
      baseSalary: _baseSalaryCtrl.text.trim().isEmpty
          ? null
          : _baseSalaryCtrl.text.trim(),
      commissionType: _paysCommission ? _commissionType : null,
      commissionValue: _paysCommission ? _commCtrl.text.trim() : null,
      serviceCommissions: svcMap,
      isActive: _isActive,
    ));
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: const TextStyle(
            color: _cMuted,
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      );

  InputDecoration _deco(String hint, IconData icon, {bool required = false}) =>
      InputDecoration(
        hintText: required ? hint : '$hint (optional)',
        hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
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
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
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
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFBFDBFE)),
                    ),
                    child: const Icon(Icons.badge_rounded,
                        color: _cForest, size: 18),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _isEdit ? 'Edit Staff' : 'Add Staff',
                          style: const TextStyle(
                            color: _cInk,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const Text(
                          'Salary, commission & service rates',
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
                      child: const Icon(Icons.close_rounded,
                          size: 16, color: _cMuted),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              _label('FULL NAME'),
              TextFormField(
                controller: _nameCtrl,
                textCapitalization: TextCapitalization.words,
                decoration: _deco('Staff name', Icons.person_rounded,
                    required: true),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('PHONE'),
                        TextFormField(
                          controller: _phoneCtrl,
                          keyboardType: TextInputType.phone,
                          decoration: _deco('07XXXXXXXX', Icons.phone_rounded),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('ROLE TITLE'),
                        TextFormField(
                          controller: _roleCtrl,
                          decoration: _deco('Stylist', Icons.work_outline_rounded),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _label('PAY TYPE'),
              DropdownButtonFormField<String>(
                initialValue: _salaryType,
                isExpanded: true,
                decoration: _deco('Pay type', Icons.payments_outlined,
                    required: true),
                items: const [
                  DropdownMenuItem(
                    value: 'commission_only',
                    child: Text('Commission only'),
                  ),
                  DropdownMenuItem(
                    value: 'salary_only',
                    child: Text('Fixed salary only'),
                  ),
                  DropdownMenuItem(
                    value: 'salary_plus_commission',
                    child: Text('Salary + Commission'),
                  ),
                ],
                onChanged: _onSalaryTypeChanged,
              ),
              if (_salaryType == 'salary_only' ||
                  _salaryType == 'salary_plus_commission') ...[
                const SizedBox(height: 12),
                _label('BASE SALARY (LKR / MONTH)'),
                TextFormField(
                  controller: _baseSalaryCtrl,
                  keyboardType: TextInputType.number,
                  decoration: _deco('e.g. 30000', Icons.account_balance_wallet_outlined),
                ),
              ],
              if (_paysCommission) ...[
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _label('COMM. TYPE'),
                          DropdownButtonFormField<String>(
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
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _label('DEFAULT COMM.'),
                          TextFormField(
                            controller: _commCtrl,
                            keyboardType: TextInputType.number,
                            decoration: _deco(
                              _commissionType == 'fixed' ? '500' : '10',
                              Icons.trending_up_rounded,
                              required: widget.showServiceWiseCommission,
                            ),
                            validator: widget.showServiceWiseCommission
                                ? (v) {
                                    if (!_paysCommission) return null;
                                    if (v == null || v.trim().isEmpty) {
                                      return 'Required';
                                    }
                                    return null;
                                  }
                                : null,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
              if (widget.showServiceWiseCommission &&
                  _paysCommission &&
                  _activeServices.isNotEmpty) ...[
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _label('SERVICE COMMISSION')),
                    GestureDetector(
                      onTap: () => _linkAllServices(prefillCatalogue: true),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEFF6FF),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFBFDBFE)),
                        ),
                        child: const Text(
                          'Link all',
                          style: TextStyle(
                            color: _cForest,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'All branch services are linked. Leave custom empty to use default commission.',
                  style: TextStyle(color: _cMuted, fontSize: 11.5, height: 1.4),
                ),
                const SizedBox(height: 8),
                ..._activeServices.map((svc) {
                  final selected = _selectedServices.contains(svc.id);
                  final catLabel = svc.commissionValue != null
                      ? (svc.commissionType == 'fixed'
                          ? 'Rs.${svc.commissionValue!.toStringAsFixed(0)}'
                          : '${svc.commissionValue}%')
                      : '—';
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: selected ? const Color(0xFFFAFBFF) : _cBg,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: selected
                            ? const Color(0xFFBFDBFE)
                            : _cBorder,
                      ),
                    ),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 24,
                          height: 24,
                          child: Checkbox(
                            value: selected,
                            activeColor: _cForest,
                            onChanged: (v) {
                              setState(() {
                                if (v == true) {
                                  _selectedServices.add(svc.id);
                                } else {
                                  _selectedServices.remove(svc.id);
                                }
                              });
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                svc.name,
                                style: TextStyle(
                                  color: _cInk,
                                  fontSize: 13,
                                  fontWeight:
                                      selected ? FontWeight.w700 : FontWeight.w500,
                                ),
                              ),
                              Text(
                                'Catalogue: $catLabel',
                                style: const TextStyle(
                                  color: _cMuted,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (selected)
                          SizedBox(
                            width: 72,
                            child: TextFormField(
                              controller: _svcCommCtrls[svc.id],
                              keyboardType: TextInputType.number,
                              style: const TextStyle(fontSize: 13),
                              decoration: InputDecoration(
                                hintText: 'Def.',
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 8),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  );
                }),
              ],
              const SizedBox(height: 20),
              GestureDetector(
                onTap: _submit,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [_cForest, _cEmerald],
                    ),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    _isEdit ? 'Save Changes' : 'Add Staff',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
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
