import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../constants/staff_role_titles.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';

const Color _cForest  = Color(0xFF1B3A2D);
const Color _cEmerald = Color(0xFF2D6A4F);
const Color _cBg      = Color(0xFFF9FAFB);
const Color _cBorder  = Color(0xFFE5E7EB);
const Color _cInk     = Color(0xFF111827);
const Color _cMuted   = Color(0xFF6B7280);

const _kWeekdays = [
  ('0', 'Sunday'),
  ('1', 'Monday'),
  ('2', 'Tuesday'),
  ('3', 'Wednesday'),
  ('4', 'Thursday'),
  ('5', 'Friday'),
  ('6', 'Saturday'),
];

String _todayYmd() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

class AddStaffModalResult {
  const AddStaffModalResult({
    required this.name,
    required this.phone,
    required this.roleTitle,
    required this.salaryType,
    required this.branchId,
    this.branchIds = const [],
    this.email,
    this.baseSalary,
    this.commissionType,
    this.commissionValue,
    this.joinDate,
    this.serviceCommissions = const {},
    this.isActive = true,
    this.availableOnline = false,
    this.workingHours,
    this.offDays = const [],
    this.photoPath,
    this.removePhoto = false,
    this.staffId,
  });

  final String name;
  final String phone;
  final String roleTitle;
  final String salaryType;
  final String branchId;
  final List<String> branchIds;
  final String? email;
  final String? baseSalary;
  final String? commissionType;
  final String? commissionValue;
  final String? joinDate;
  final Map<String, String> serviceCommissions;
  final bool isActive;
  final bool availableOnline;
  final Map<String, StaffDayHours>? workingHours;
  final List<StaffOffDay> offDays;
  final String? photoPath;
  final bool removePhoto;
  final String? staffId;
}

class AddStaffModal extends StatefulWidget {
  const AddStaffModal({
    required this.branchId,
    required this.services,
    this.branches = const [],
    this.showServiceWiseCommission = false,
    this.defaultCommissionOnly = false,
    this.initial,
    super.key,
  });

  final String branchId;
  final List<SalonService> services;
  final List<Map<String, String>> branches;
  final bool showServiceWiseCommission;
  final bool defaultCommissionOnly;
  final StaffMember? initial;

  static Future<AddStaffModalResult?> show(
    BuildContext context, {
    required String branchId,
    required List<SalonService> services,
    List<Map<String, String>> branches = const [],
    bool showServiceWiseCommission = false,
    bool defaultCommissionOnly = false,
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
        branches: branches,
        showServiceWiseCommission: showServiceWiseCommission,
        defaultCommissionOnly: defaultCommissionOnly,
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
  late String _rolePick;
  late final TextEditingController _roleCustomCtrl;
  late final TextEditingController _baseSalaryCtrl;
  late final TextEditingController _commCtrl;
  final _offReasonCtrl = TextEditingController();

  late String _salaryType;
  late String _commissionType;
  late bool _isActive;
  late bool _availableOnline;
  late String _joinDate;
  late Set<String> _branchIds;
  late Map<String, StaffDayHours> _workingHours;
  late List<StaffOffDay> _offDays;
  String? _photoPath;
  String? _existingPhotoUrl;
  bool _removePhoto = false;

  final Map<String, TextEditingController> _svcCommCtrls = {};
  final Set<String> _selectedServices = {};
  List<String> _roleTitles = List<String>.from(staffRoleTitles);
  bool _rolesLoading = true;
  bool _addingRole = false;

  bool get _isEdit => widget.initial != null;
  bool get _paysCommission => _salaryType != 'salary_only';
  bool get _canPickBranches => widget.branches.length > 1;

  List<SalonService> get _activeServices =>
      widget.services.where((s) => s.isActive).toList();

  String get _resolvedRoleTitle => _rolePick == staffRoleOther
      ? _roleCustomCtrl.text.trim()
      : _rolePick;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _nameCtrl = TextEditingController(text: i?.name ?? '');
    _phoneCtrl = TextEditingController(text: i?.phone ?? '');
    _emailCtrl = TextEditingController(text: i?.email ?? '');
    final roleTitle = (i?.roleTitle ?? '').trim();
    if (roleTitle.isEmpty) {
      _rolePick = '';
      _roleCustomCtrl = TextEditingController();
    } else if (_roleTitles.contains(roleTitle)) {
      _rolePick = roleTitle;
      _roleCustomCtrl = TextEditingController();
    } else {
      _rolePick = staffRoleOther;
      _roleCustomCtrl = TextEditingController(text: roleTitle);
    }
    _baseSalaryCtrl = TextEditingController(
      text: i?.baseSalary != null ? i!.baseSalary!.toStringAsFixed(0) : '',
    );
    _commCtrl = TextEditingController(
      text: i?.commissionValue != null ? '${i!.commissionValue!}' : '',
    );
    _salaryType = i?.salaryType ?? 'commission_only';
    _commissionType = i?.commissionType ?? 'percentage';
    _isActive = i?.isActive ?? true;
    _availableOnline = i?.availableOnline ?? false;
    _joinDate = (i?.joinDate ?? '').trim().isNotEmpty
        ? i!.joinDate!.trim().substring(0, 10)
        : _todayYmd();
    _branchIds = {
      if ((i?.branchIds ?? const []).isNotEmpty)
        ...i!.branchIds
      else if ((i?.branchId ?? '').isNotEmpty)
        i!.branchId
      else if (widget.branchId.isNotEmpty)
        widget.branchId,
    };
    _workingHours = Map<String, StaffDayHours>.from(
      i?.workingHours ?? defaultStaffWorkingHours(),
    );
    _offDays = List<StaffOffDay>.from(i?.offDays ?? const []);
    _existingPhotoUrl = i?.photoUrl;

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
      _linkAllServices(prefillCatalogue: !widget.defaultCommissionOnly);
    }

    WidgetsBinding.instance.addPostFrameCallback((_) => _loadRoles());
  }

  Future<void> _loadRoles() async {
    try {
      final app = AppStateScope.of(context);
      final list = await app.loadStaffRoleTitles();
      if (!mounted) return;
      setState(() {
        _roleTitles = list.isNotEmpty ? list : List<String>.from(staffRoleTitles);
        _rolesLoading = false;
        final current = (widget.initial?.roleTitle ?? '').trim();
        if (current.isNotEmpty && _roleTitles.contains(current)) {
          _rolePick = current;
          _roleCustomCtrl.clear();
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _roleTitles = List<String>.from(staffRoleTitles);
        _rolesLoading = false;
      });
    }
  }

  Future<void> _addRoleToSystem() async {
    final title = _roleCustomCtrl.text.trim();
    if (title.isEmpty) return;
    setState(() => _addingRole = true);
    try {
      final app = AppStateScope.of(context);
      final list = await app.addStaffRoleTitle(title);
      if (!mounted) return;
      setState(() {
        _roleTitles = list.isNotEmpty ? list : [..._roleTitles, title];
        _rolePick = title;
        _roleCustomCtrl.clear();
        _addingRole = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Role "$title" added to system')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _addingRole = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _roleCustomCtrl.dispose();
    _baseSalaryCtrl.dispose();
    _commCtrl.dispose();
    _offReasonCtrl.dispose();
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
            _svcCommCtrls[s.id]?.text = s.commissionValue!.toStringAsFixed(
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
        _linkAllServices(
          prefillCatalogue:
              !widget.defaultCommissionOnly && _selectedServices.isEmpty,
        );
      }
    });
  }

  Future<void> _pickJoinDate() async {
    final initial = DateTime.tryParse(_joinDate) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2035),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _joinDate =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _pickPhoto() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1200,
      maxHeight: 1200,
      imageQuality: 85,
    );
    if (file == null || !mounted) return;
    setState(() {
      _photoPath = file.path;
      _removePhoto = false;
    });
  }

  Future<void> _pickDayTime(String dayKey, {required bool isStart}) async {
    final day = _workingHours[dayKey] ?? const StaffDayHours();
    final raw = isStart ? day.start : day.end;
    final parts = raw.split(':');
    final initial = TimeOfDay(
      hour: int.tryParse(parts.isNotEmpty ? parts[0] : '9') ?? 9,
      minute: int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0,
    );
    final picked = await showTimePicker(context: context, initialTime: initial);
    if (picked == null || !mounted) return;
    final hh = picked.hour.toString().padLeft(2, '0');
    final mm = picked.minute.toString().padLeft(2, '0');
    setState(() {
      _workingHours[dayKey] = StaffDayHours(
        closed: false,
        start: isStart ? '$hh:$mm' : day.start,
        end: isStart ? day.end : '$hh:$mm',
      );
    });
  }

  Future<void> _addOffDay() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (picked == null || !mounted) return;
    final ymd =
        '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    if (_offDays.any((d) => d.date == ymd)) return;
    setState(() {
      _offDays = [
        ..._offDays,
        StaffOffDay(date: ymd, reason: _offReasonCtrl.text.trim()),
      ]..sort((a, b) => a.date.compareTo(b.date));
      _offReasonCtrl.clear();
    });
  }

  String? _resolvePhotoUrl(String? url) {
    if (url == null || url.trim().isEmpty) return null;
    final u = url.trim();
    if (u.startsWith('http')) return u;
    final base = AppStateScope.of(context).apiBaseUrl;
    return '$base$u';
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    if (_resolvedRoleTitle.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select a role for this staff member.')),
      );
      return;
    }
    if (_branchIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one branch.')),
      );
      return;
    }
    if (widget.showServiceWiseCommission &&
        _paysCommission &&
        _selectedServices.isEmpty &&
        _activeServices.isNotEmpty) {
      _linkAllServices();
    }
    if (_paysCommission && _commCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Set a default commission rate.')),
      );
      return;
    }

    final svcMap = <String, String>{};
    if (widget.showServiceWiseCommission && _paysCommission) {
      if (widget.defaultCommissionOnly) {
        for (final id in _selectedServices) {
          svcMap[id] = '';
        }
      } else {
        for (final id in _selectedServices) {
          svcMap[id] = _svcCommCtrls[id]?.text.trim() ?? '';
        }
      }
    }

    final primaryBranch = _branchIds.contains(widget.branchId)
        ? widget.branchId
        : _branchIds.first;

    Navigator.of(context).pop(AddStaffModalResult(
      staffId: widget.initial?.id,
      name: _nameCtrl.text.trim(),
      phone: _phoneCtrl.text.trim(),
      email: _emailCtrl.text.trim().isEmpty ? null : _emailCtrl.text.trim(),
      roleTitle: _resolvedRoleTitle,
      salaryType: _salaryType,
      branchId: primaryBranch,
      branchIds: _branchIds.toList(),
      baseSalary: _baseSalaryCtrl.text.trim().isEmpty
          ? null
          : _baseSalaryCtrl.text.trim(),
      commissionType: _paysCommission ? _commissionType : null,
      commissionValue: _paysCommission ? _commCtrl.text.trim() : null,
      joinDate: _joinDate,
      serviceCommissions: svcMap,
      isActive: _isActive,
      availableOnline: _availableOnline,
      workingHours: _workingHours,
      offDays: _offDays,
      photoPath: _photoPath,
      removePhoto: _removePhoto,
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

  Widget _sectionTitle(String title, String desc) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(
                    color: _cInk, fontSize: 14, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(desc,
                style: const TextStyle(color: _cMuted, fontSize: 12, height: 1.35)),
          ],
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
    final photoUrl = _removePhoto ? null : _resolvePhotoUrl(_existingPhotoUrl);
    final hasLocalPhoto = _photoPath != null && !_removePhoto;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.92,
      ),
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
                          'Same fields as web staff form',
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

              _sectionTitle('Profile', 'Photo and contact details'),
              Row(
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: const Color(0xFFEFF6FF),
                    backgroundImage: hasLocalPhoto
                        ? FileImage(File(_photoPath!))
                        : (photoUrl != null ? NetworkImage(photoUrl) : null)
                            as ImageProvider?,
                    child: (!hasLocalPhoto && photoUrl == null)
                        ? Text(
                            (_nameCtrl.text.trim().isNotEmpty
                                    ? _nameCtrl.text.trim()[0]
                                    : 'S')
                                .toUpperCase(),
                            style: const TextStyle(
                              color: _cForest,
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        OutlinedButton.icon(
                          onPressed: _pickPhoto,
                          icon: const Icon(Icons.photo_camera_outlined, size: 18),
                          label: Text(
                            (hasLocalPhoto || photoUrl != null)
                                ? 'Change Photo'
                                : 'Upload Photo',
                          ),
                        ),
                        if (hasLocalPhoto || photoUrl != null)
                          TextButton(
                            onPressed: () => setState(() {
                              _photoPath = null;
                              _removePhoto = true;
                            }),
                            style: TextButton.styleFrom(
                              foregroundColor: const Color(0xFFDC2626),
                            ),
                            child: const Text('Remove photo'),
                          ),
                        const Text('JPG or PNG, max 2MB',
                            style: TextStyle(color: _cMuted, fontSize: 11)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _label('FULL NAME'),
              TextFormField(
                controller: _nameCtrl,
                textCapitalization: TextCapitalization.words,
                onChanged: (_) => setState(() {}),
                decoration: _deco('Staff name', Icons.person_rounded,
                    required: true),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              _label('PHONE'),
              TextFormField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: _deco('07XXXXXXXX', Icons.phone_rounded),
              ),
              const SizedBox(height: 12),
              _label('EMAIL'),
              TextFormField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: _deco('name@example.com', Icons.mail_outline_rounded),
              ),

              _sectionTitle('Employment', 'Join date and account status'),
              _label('JOIN DATE'),
              GestureDetector(
                onTap: _pickJoinDate,
                child: InputDecorator(
                  decoration: _deco('Join date', Icons.event_rounded),
                  child: Text(_joinDate,
                      style: const TextStyle(
                          color: _cInk, fontSize: 14, fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(height: 12),
              _label('STATUS'),
              DropdownButtonFormField<bool>(
                initialValue: _isActive,
                decoration: _deco('Status', Icons.toggle_on_outlined),
                items: const [
                  DropdownMenuItem(value: true, child: Text('Active')),
                  DropdownMenuItem(value: false, child: Text('Inactive')),
                ],
                onChanged: (v) {
                  if (v != null) setState(() => _isActive = v);
                },
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _cBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _cBorder),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Checkbox(
                      value: _availableOnline,
                      activeColor: _cForest,
                      onChanged: (v) =>
                          setState(() => _availableOnline = v ?? false),
                    ),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Available for online booking',
                              style: TextStyle(
                                  color: _cInk,
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w700)),
                          SizedBox(height: 3),
                          Text(
                            'Show this staff on website / WordPress booking. Turn off for salon-only staff.',
                            style: TextStyle(
                                color: _cMuted, fontSize: 12, height: 1.35),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              _sectionTitle(
                  'Working hours', 'Weekly schedule for booking & attendance'),
              ..._kWeekdays.map((d) {
                final key = d.$1;
                final label = d.$2;
                final day = _workingHours[key] ?? const StaffDayHours();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 78,
                        child: Text(label,
                            style: const TextStyle(
                                color: _cInk,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700)),
                      ),
                      SizedBox(
                        width: 28,
                        height: 28,
                        child: Checkbox(
                          value: day.closed,
                          activeColor: _cForest,
                          onChanged: (v) => setState(() {
                            _workingHours[key] = StaffDayHours(
                              closed: v ?? false,
                              start: day.start,
                              end: day.end,
                            );
                          }),
                        ),
                      ),
                      const Text('Off',
                          style: TextStyle(color: _cMuted, fontSize: 11.5)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Opacity(
                          opacity: day.closed ? 0.4 : 1,
                          child: Row(
                            children: [
                              Expanded(
                                child: GestureDetector(
                                  onTap: day.closed
                                      ? null
                                      : () => _pickDayTime(key, isStart: true),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 10),
                                    decoration: BoxDecoration(
                                      color: _cBg,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: _cBorder),
                                    ),
                                    child: Text(day.start,
                                        textAlign: TextAlign.center,
                                        style: const TextStyle(
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.w700)),
                                  ),
                                ),
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 4),
                                child: Text('–',
                                    style: TextStyle(color: _cMuted)),
                              ),
                              Expanded(
                                child: GestureDetector(
                                  onTap: day.closed
                                      ? null
                                      : () => _pickDayTime(key, isStart: false),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 10),
                                    decoration: BoxDecoration(
                                      color: _cBg,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: _cBorder),
                                    ),
                                    child: Text(day.end,
                                        textAlign: TextAlign.center,
                                        style: const TextStyle(
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.w700)),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),

              _sectionTitle('Off days', 'Specific dates this staff is unavailable'),
              _label('REASON (OPTIONAL)'),
              TextFormField(
                controller: _offReasonCtrl,
                decoration:
                    _deco('Leave / holiday', Icons.beach_access_outlined),
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: _addOffDay,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add off day'),
                ),
              ),
              if (_offDays.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 6, bottom: 4),
                  child: Text('No off days marked.',
                      style: TextStyle(color: _cMuted, fontSize: 12.5)),
                )
              else
                ..._offDays.map((d) => Container(
                      margin: const EdgeInsets.only(top: 6),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: _cBg,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: _cBorder),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              d.reason.isEmpty
                                  ? d.date
                                  : '${d.date} · ${d.reason}',
                              style: const TextStyle(
                                  color: _cInk,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600),
                            ),
                          ),
                          GestureDetector(
                            onTap: () => setState(() {
                              _offDays =
                                  _offDays.where((x) => x.date != d.date).toList();
                            }),
                            child: const Text('Remove',
                                style: TextStyle(
                                    color: Color(0xFFEF4444),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ),
                    )),

              _sectionTitle('Role & branches', 'Job role and branch assignment'),
              _label('ROLE'),
              DropdownButtonFormField<String>(
                key: ValueKey('role_$_rolePick ${_roleTitles.length}'),
                initialValue: _rolePick.isEmpty
                    ? null
                    : (_roleTitles.contains(_rolePick) ||
                            _rolePick == staffRoleOther
                        ? _rolePick
                        : staffRoleOther),
                isExpanded: true,
                decoration: _deco(
                  _rolesLoading ? 'Loading roles…' : 'Select role',
                  Icons.work_outline_rounded,
                  required: true,
                ),
                items: [
                  ..._roleTitles.map(
                    (r) => DropdownMenuItem(value: r, child: Text(r)),
                  ),
                  const DropdownMenuItem(
                    value: staffRoleOther,
                    child: Text('+ Add new role…'),
                  ),
                ],
                onChanged: (v) {
                  if (v == null) return;
                  setState(() {
                    _rolePick = v;
                    if (v != staffRoleOther) _roleCustomCtrl.clear();
                  });
                },
                validator: (v) {
                  if (v == null || v.isEmpty) return 'Select a role';
                  if (v == staffRoleOther &&
                      _roleCustomCtrl.text.trim().isEmpty) {
                    return 'Enter new role name';
                  }
                  return null;
                },
              ),
              if (_rolePick == staffRoleOther) ...[
                const SizedBox(height: 12),
                _label('NEW ROLE (SAVED TO SYSTEM)'),
                TextFormField(
                  controller: _roleCustomCtrl,
                  textCapitalization: TextCapitalization.words,
                  decoration: _deco('e.g. Spa Therapist', Icons.edit_rounded,
                      required: true),
                  onChanged: (_) => setState(() {}),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _addingRole ? null : _addRoleToSystem,
                    icon: _addingRole
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.add, size: 18),
                    label: Text(_addingRole ? 'Adding…' : 'Add to system'),
                  ),
                ),
              ],
              if (_canPickBranches) ...[
                const SizedBox(height: 12),
                _label('BRANCHES'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: widget.branches.map((b) {
                    final id = '${b['id'] ?? ''}';
                    final name = '${b['name'] ?? id}';
                    final active = _branchIds.contains(id);
                    return GestureDetector(
                      onTap: () => setState(() {
                        if (active) {
                          if (_branchIds.length > 1) _branchIds.remove(id);
                        } else {
                          _branchIds.add(id);
                        }
                      }),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: active
                              ? const Color(0xFFEFF6FF)
                              : _cBg,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: active
                                ? const Color(0xFF2563EB)
                                : _cBorder,
                          ),
                        ),
                        child: Text(name,
                            style: TextStyle(
                              color: active
                                  ? const Color(0xFF2563EB)
                                  : _cInk,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                            )),
                      ),
                    );
                  }).toList(),
                ),
              ],

              _sectionTitle('Pay', 'Salary type and commission'),
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
                  DropdownMenuItem(
                    value: 'daily_salary_plus_commission',
                    child: Text('Per-day Salary + Commission'),
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
                  decoration: _deco(
                      'e.g. 30000', Icons.account_balance_wallet_outlined),
                ),
              ],
              if (_salaryType == 'daily_salary_plus_commission') ...[
                const SizedBox(height: 12),
                _label('PER-DAY SALARY (LKR / DAY)'),
                TextFormField(
                  controller: _baseSalaryCtrl,
                  keyboardType: TextInputType.number,
                  decoration: _deco(
                      'e.g. 1500', Icons.account_balance_wallet_outlined),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFDF2F8),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFBCFE8)),
                  ),
                  child: const Text(
                    'Linked to Attendance: Present or Late days × this rate + commission. Absent/Leave = no day pay.',
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.4,
                      color: Color(0xFF9D174D),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
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
                              if (v != null) {
                                setState(() => _commissionType = v);
                              }
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
                              required: _paysCommission,
                            ),
                            validator: _paysCommission
                                ? (v) {
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
                if (!widget.showServiceWiseCommission) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFBBF7D0)),
                    ),
                    child: Text(
                      _activeServices.isEmpty
                          ? 'Default commission applies to all services when this staff completes work.'
                          : 'Default commission applies to all ${_activeServices.length} active services — no per-service setup needed.',
                      style: const TextStyle(
                        color: Color(0xFF166534),
                        fontSize: 12,
                        height: 1.45,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ],
              if (widget.showServiceWiseCommission &&
                  _paysCommission &&
                  _activeServices.isNotEmpty) ...[
                const SizedBox(height: 16),
                if (widget.defaultCommissionOnly) ...[
                  _label('BRANCH SERVICES'),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFBBF7D0)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'All ${_activeServices.length} active services are linked. '
                          'Set per-service rates on the Services page. Default commission above is only a fallback.',
                          style: const TextStyle(
                            color: Color(0xFF166534),
                            fontSize: 12,
                            height: 1.45,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: _activeServices
                              .map(
                                (svc) => Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                        color: const Color(0xFFBBF7D0)),
                                  ),
                                  child: Text(
                                    svc.name,
                                    style: const TextStyle(
                                      color: Color(0xFF14532D),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  Row(
                    children: [
                      Expanded(child: _label('SERVICE COMMISSION')),
                      GestureDetector(
                        onTap: () => _linkAllServices(
                            prefillCatalogue: !widget.defaultCommissionOnly),
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
                    style:
                        TextStyle(color: _cMuted, fontSize: 11.5, height: 1.4),
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
                                    fontWeight: selected
                                        ? FontWeight.w700
                                        : FontWeight.w500,
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
