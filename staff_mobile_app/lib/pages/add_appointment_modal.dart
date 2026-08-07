import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';
import '../utils/appointment_notes.dart';
import '../utils/package_helpers.dart';
import '../widgets/walk_in_service_dropdown_section.dart';

// ── Sentinel id for "Register new customer" autocomplete option ──────────────
const String _kApptNewCustId = '__appt_register_new__';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _cDark   = Color(0xFF1D4ED8);   // blue-700
const Color _cMid    = Color(0xFF2563EB);   // blue-600
const Color _cLight  = Color(0xFFEFF6FF);   // blue-50
const Color _cLightB = Color(0xFFBFDBFE);   // blue-200
const Color _cBorder = Color(0xFFE5E7EB);
const Color _cBg     = Color(0xFFF9FAFB);

// ─────────────────────────────────────────────────────────────────────────────
/// Show the quick-add appointment bottom sheet.
/// Returns `true` if the appointment was created successfully.
Future<bool?> showAddAppointmentModal(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _AddApptSheet(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
class _AddApptSheet extends StatefulWidget {
  const _AddApptSheet();
  @override
  State<_AddApptSheet> createState() => _AddApptSheetState();
}

class _AddApptSheetState extends State<_AddApptSheet> {
  final _formKey      = GlobalKey<FormState>();
  final _namCtrl      = TextEditingController();
  final _phCtrl       = TextEditingController();
  final _amtCtrl      = TextEditingController();
  final _advAmtCtrl   = TextEditingController();

  bool   _loading       = true;
  bool   _saving        = false;
  bool   _registerMode  = false;
  bool   _registering   = false;
  bool   _registered    = false;
  String? _error;

  List<SalonService>        _services  = [];
  List<Map<String, String>> _branches  = [];
  List<StaffMember>         _staff     = [];
  List<Customer>            _customers = [];

  String _branchId = '';
  String _staffId  = '';
  String _custId   = '';
  String _date     = '';
  String _time     = '';
  String? _primaryServiceId;
  final List<String> _extraServiceIds = [];

  /// Per-service staff/date/time when multiple bookings is on.
  final Map<String, Map<String, String>> _serviceAssignments = {};
  bool _multiBooking = false;
  bool _collectAdvance = false;
  String _advanceMethod = 'Cash';

  List<Map<String, dynamic>> _customerPackages = [];
  List<Map<String, dynamic>> _packageTemplates = [];
  String  _selectedPkgId   = '';
  String  _selectedTemplateId = '';
  String  _selectedPkgName = '';
  bool    _loadingPackages  = false;
  bool    _linkingPackage   = false;
  double? _packageOfferPrice;
  int     _packagesLoadGen  = 0;

  bool get _isSuper =>
      AppStateScope.of(context).currentUser?.role == 'superadmin';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final app = AppStateScope.of(context);
    final d   = DateTime.now();
    _date =
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    setState(() { _loading = true; _error = null; });
    try {
      _services = await app.loadServices();
      try { _customers = await app.loadCustomers(); } catch (_) {}
      final ub = app.currentUser?.branchId ?? '';
      _branchId = ub;
      if (_isSuper || ub.isEmpty) {
        _branches = await app.loadBranches();
        if (_branchId.isEmpty && _branches.isNotEmpty) {
          _branchId = _branches.first['id'] ?? '';
        }
      }
      try {
        _staff = await app.loadStaffList(
            branchId: _branchId.isEmpty ? null : _branchId);
      } catch (_) {}
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
    }
    if (!mounted) return;
    setState(() => _loading = false);
  }

  Future<void> _pickDate() async {
    final p = await showDatePicker(
      context: context,
      firstDate: DateTime(2020), lastDate: DateTime(2035),
      initialDate: DateTime.tryParse(_date) ?? DateTime.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: _cDark, onPrimary: Colors.white,
              surface: Colors.white),
        ),
        child: child!,
      ),
    );
    if (p == null) return;
    setState(() {
      _date =
          '${p.year}-${p.month.toString().padLeft(2, '0')}-${p.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _pickTime() async {
    final p = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: _cDark, onPrimary: Colors.white),
        ),
        child: child!,
      ),
    );
    if (p == null) return;
    setState(() {
      _time =
          '${p.hour.toString().padLeft(2, '0')}:${p.minute.toString().padLeft(2, '0')}';
    });
  }

  List<String> _orderedServiceIds() {
    final p = _primaryServiceId?.trim();
    if (p == null || p.isEmpty) return const [];
    return [p, ..._extraServiceIds];
  }

  void _syncAssignments() {
    final ids = _orderedServiceIds();
    for (final id in ids) {
      _serviceAssignments.putIfAbsent(id, () => {
            'staff_id': _staffId,
            'date': _date,
            'time': _time,
          });
      final a = _serviceAssignments[id]!;
      if ((a['date'] ?? '').isEmpty) a['date'] = _date;
      if ((a['time'] ?? '').isEmpty) a['time'] = _time;
    }
    _serviceAssignments.removeWhere((k, _) => !ids.contains(k));
  }

  Future<void> _pickAssignmentDate(String serviceId) async {
    final cur = _serviceAssignments[serviceId]?['date'] ?? _date;
    final p = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      initialDate: DateTime.tryParse(cur) ?? DateTime.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: _cDark, onPrimary: Colors.white, surface: Colors.white),
        ),
        child: child!,
      ),
    );
    if (p == null) return;
    setState(() {
      _serviceAssignments.putIfAbsent(serviceId, () => {});
      _serviceAssignments[serviceId]!['date'] =
          '${p.year}-${p.month.toString().padLeft(2, '0')}-${p.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _pickAssignmentTime(String serviceId) async {
    final p = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: _cDark, onPrimary: Colors.white),
        ),
        child: child!,
      ),
    );
    if (p == null) return;
    setState(() {
      _serviceAssignments.putIfAbsent(serviceId, () => {});
      _serviceAssignments[serviceId]!['time'] =
          '${p.hour.toString().padLeft(2, '0')}:${p.minute.toString().padLeft(2, '0')}';
    });
  }

  double get _calcTotal {
    final offer = _packageOfferPrice;
    if (offer != null && offer > 0) {
      return offer;
    }
    var sum = 0.0;
    for (final id in _orderedServiceIds()) {
      for (final s in _services) { if (s.id == id) sum += s.price; }
    }
    return sum;
  }

  void _updateTotal() {
    final total = _calcTotal;
    _amtCtrl.text = total > 0 ? total.toStringAsFixed(0) : '';
  }

  void _onPrimaryChanged(String? v) {
    setState(() {
      final prev = _primaryServiceId;
      if (v == null) { _primaryServiceId = null; _syncAssignments(); _updateTotal(); return; }
      _extraServiceIds.remove(v);
      if (prev != null && prev.isNotEmpty && prev != v) {
        _extraServiceIds.insert(0, prev);
      }
      _primaryServiceId = v;
      _syncAssignments();
      _updateTotal();
    });
  }

  void _onAddExtra(String id) {
    setState(() {
      final p = _primaryServiceId?.trim();
      if (p == null || p.isEmpty) {
        _primaryServiceId = id;
      } else {
        _extraServiceIds.add(id);
      }
      _syncAssignments();
      _updateTotal();
    });
  }

  void _removeExtraAt(int index) {
    setState(() {
      if (index >= 0 && index < _extraServiceIds.length) {
        _extraServiceIds.removeAt(index);
      }
      _syncAssignments();
      _updateTotal();
    });
  }

  Future<void> _loadCustomerPackages(String custId) async {
    if (custId.isEmpty) return;
    final gen = ++_packagesLoadGen;
    setState(() {
      _loadingPackages = true;
      _customerPackages = [];
      _packageTemplates = [];
      _selectedPkgId = '';
      _selectedTemplateId = '';
      _selectedPkgName = '';
      _packageOfferPrice = null;
    });
    final app = AppStateScope.of(context);
    try {
      final branch = (_isSuper || (app.currentUser?.branchId ?? '').isEmpty)
          ? _branchId
          : (app.currentUser?.branchId ?? '');
      final templates = await app.loadPackageTemplates(branchId: branch);
      final pkgs = await app.loadCustomerActivePackages(custId);
      if (!mounted || gen != _packagesLoadGen) return;
      setState(() {
        _packageTemplates = filterBookablePackageTemplates(templates);
        _customerPackages = pkgs;
        _loadingPackages = false;
      });
    } catch (_) {
      if (!mounted || gen != _packagesLoadGen) return;
      setState(() {
        _customerPackages = [];
        _packageTemplates = [];
        _loadingPackages = false;
      });
    }
  }

  Future<void> _applyAppointmentTemplate(String templateId) async {
    if (templateId.isEmpty) {
      setState(() {
        _selectedPkgId = '';
        _selectedTemplateId = '';
        _selectedPkgName = '';
        _packageOfferPrice = null;
      });
      _updateTotal();
      return;
    }
    Map<String, dynamic>? tpl;
    for (final p in _packageTemplates) {
      if ('${p['id']}' == templateId) {
        tpl = p;
        break;
      }
    }
    if (tpl == null) return;

    final selected = tpl;
    final serviceIds = resolveTemplateServiceIds(selected, _services);
    final price = getTemplateBundlePrice(selected);
    setState(() {
      _selectedTemplateId = templateId;
      _selectedPkgName = '${selected['name'] ?? ''}';
      _packageOfferPrice = price > 0 ? price : null;
      applyResolvedServiceIds(
        ids: serviceIds,
        setPrimary: (v) => _primaryServiceId = v,
        extras: _extraServiceIds,
      );
      _syncAssignments();
      _linkingPackage = true;
    });
    _updateTotal();

    final app = AppStateScope.of(context);
    final branch = (_isSuper || (app.currentUser?.branchId ?? '').isEmpty)
        ? _branchId
        : (app.currentUser?.branchId ?? '');
    final cp = await app.ensureCustomerPackageForTemplate(
      customerId: _custId,
      templateId: templateId,
      branchId: branch,
      existingCustomerPackages: _customerPackages,
    );
    if (!mounted) return;
    if (cp == null) {
      setState(() {
        _selectedTemplateId = '';
        _selectedPkgId = '';
        _selectedPkgName = '';
        _packageOfferPrice = null;
        _linkingPackage = false;
      });
      _snack(app.lastError ?? 'Failed to link package to customer.');
      _updateTotal();
      return;
    }
    setState(() {
      _selectedPkgId = '${cp['id']}';
      _linkingPackage = false;
      // Refresh owned list in background state
      final existing = findCustomerPackageForTemplate(_customerPackages, templateId);
      if (existing == null) {
        _customerPackages = [..._customerPackages, cp];
      }
    });
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_linkingPackage) {
      _snack('Please wait — linking package…');
      return;
    }
    if (_selectedTemplateId.isNotEmpty && _selectedPkgId.trim().isEmpty) {
      _snack('Package is still linking. Try again in a moment.');
      return;
    }
    if (_orderedServiceIds().isEmpty) {
      _snack('Select at least one service'); return;
    }

    final app    = AppStateScope.of(context);
    final branch = (_isSuper || (app.currentUser?.branchId ?? '').isEmpty)
        ? _branchId : (app.currentUser?.branchId ?? '');
    if (branch.trim().isEmpty) { _snack('Branch required'); return; }

    final advanceNum = double.tryParse(_advAmtCtrl.text.trim()) ?? 0;
    if (_collectAdvance) {
      if (!(advanceNum > 0)) {
        _snack('Enter a valid advance amount');
        return;
      }
      if (_calcTotal > 0 && advanceNum > _calcTotal) {
        _snack('Advance cannot exceed total');
        return;
      }
    }

    List<Map<String, dynamic>>? items;
    if (_multiBooking) {
      _syncAssignments();
      for (final id in _orderedServiceIds()) {
        final a = _serviceAssignments[id] ?? {};
        if ((a['date'] ?? '').isEmpty || (a['time'] ?? '').isEmpty) {
          String label = 'each service';
          for (final s in _services) {
            if (s.id == id) { label = s.name; break; }
          }
          _snack('Set date and time for $label');
          return;
        }
      }
      items = _orderedServiceIds().map((id) {
        final a = _serviceAssignments[id] ?? {};
        final staff = (a['staff_id'] ?? '').trim();
        return <String, dynamic>{
          'service_id': id,
          'date': a['date'],
          'time': a['time'],
          if (staff.isNotEmpty) 'staff_id': staff,
        };
      }).toList();
    } else {
      if (_date.isEmpty) { _snack('Pick a date'); return; }
      if (_time.isEmpty) { _snack('Pick a time'); return; }
    }

    final pkgNote = _selectedPkgId.isNotEmpty
        ? '${AppointmentNotes.packagePrefix} #$_selectedPkgId - $_selectedPkgName'
        : '';

    setState(() => _saving = true);
    final ok = await app.saveAppointment(
      branchId: branch,
      customerName: _namCtrl.text.trim(),
      phone: _phCtrl.text.trim(),
      customerId: _custId,
      orderedServiceIds: _orderedServiceIds(),
      date: _date,
      time: _time,
      staffId: _staffId,
      baseNotes: pkgNote,
      status: '',
      amountOverride: _amtCtrl.text.trim(),
      bookingItems: items,
      advanceAmount: _collectAdvance && advanceNum > 0 ? advanceNum : null,
      advanceMethod: _collectAdvance ? _advanceMethod : null,
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) { _snack(app.lastError ?? 'Failed'); return; }
    Navigator.of(context).pop(true);
  }

  void _snack(String msg) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(msg)));

  Future<void> _doRegister() async {
    final app  = AppStateScope.of(context);
    final name = _namCtrl.text.trim();
    if (name.isEmpty) return;
    setState(() => _registering = true);
    final newCust = await app.registerCustomer(
      name: name,
      phone: _phCtrl.text.trim(),
      branchId: _branchId.isEmpty ? null : _branchId,
    );
    if (!mounted) return;
    if (newCust != null) {
      setState(() {
        _customers   = [newCust, ..._customers];
        _custId      = newCust.id;
        _namCtrl.text = newCust.name;
        if (newCust.phone.isNotEmpty) _phCtrl.text = newCust.phone;
        _registered   = true;
        _registerMode = false;
        _registering  = false;
      });
    } else {
      setState(() => _registering = false);
      _snack(app.lastError ?? 'Failed to register customer');
    }
  }

  @override
  void dispose() {
    _namCtrl.dispose(); _phCtrl.dispose(); _amtCtrl.dispose(); _advAmtCtrl.dispose();
    super.dispose();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  InputDecoration _deco(String hint, IconData icon) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _cMid, size: 19),
        filled: true,
        fillColor: _cBg,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _cBorder)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _cBorder)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _cMid, width: 1.8)),
        focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _cMid, width: 1.8)),
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
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final active = servicesForPackagePicker(
      _services,
      _orderedServiceIds(),
    );

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, bottom + 24),
        child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [

          // ── Drag handle ─────────────────────────────────────────────
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 18),
              width: 40, height: 4,
              decoration: BoxDecoration(
                  color: const Color(0xFFE5E7EB),
                  borderRadius: BorderRadius.circular(99)),
            ),
          ),

          // ── Title row ───────────────────────────────────────────────
          Row(children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: _cLight,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _cLightB),
              ),
              child: Icon(Icons.event_available_rounded,
                  color: _cDark, size: 17),
            ),
            const SizedBox(width: 11),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Quick Booking',
                      style: TextStyle(
                          color: Color(0xFF111827),
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2)),
                  Text('New appointment',
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

          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: CircularProgressIndicator(
                    color: _cMid, strokeWidth: 2.5),
              ),
            )
          else if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(children: [
                const Icon(Icons.error_outline_rounded,
                    color: Color(0xFFF43F5E), size: 36),
                const SizedBox(height: 8),
                Text(_error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Color(0xFF9CA3AF), fontSize: 13)),
                const SizedBox(height: 12),
                TextButton(onPressed: _load, child: const Text('Retry')),
              ]),
            )
          else
            Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [

                  // Customer name
                  _label('CUSTOMER'),

                  if (_registered) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 8),
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
                        Expanded(
                          child: Text(
                            'New customer "${_namCtrl.text}" registered!',
                            style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF065F46)),
                          ),
                        ),
                      ]),
                    ),
                  ],

                  Autocomplete<Customer>(
                    optionsBuilder: (val) {
                      final q   = val.text.trim().toLowerCase();
                      List<Customer> matches;
                      if (q.isEmpty) {
                        matches = _customers.take(10).toList();
                      } else {
                        matches = _customers
                            .where((c) =>
                                c.name.toLowerCase().contains(q) ||
                                c.phone.contains(q))
                            .take(15)
                            .toList();
                      }
                      final hasExact = _customers
                          .any((c) => c.name.toLowerCase() == q);
                      if (q.length >= 2 && !hasExact) {
                        matches = [
                          ...matches,
                          Customer(
                              id: _kApptNewCustId,
                              name: val.text.trim(),
                              phone: '',
                              email: ''),
                        ];
                      }
                      return matches;
                    },
                    displayStringForOption: (c) => c.name,
                    onSelected: (c) {
                      if (c.id == _kApptNewCustId) {
                        setState(() {
                          _registerMode = true;
                          _registered   = false;
                          _custId       = '';
                          _namCtrl.text = c.name;
                        });
                        return;
                      }
                      setState(() {
                        _namCtrl.text    = c.name;
                        _phCtrl.text     = c.phone;
                        _custId          = c.id;
                        _registerMode    = false;
                        _registered      = false;
                        _selectedPkgId   = '';
                        _selectedTemplateId = '';
                        _selectedPkgName = '';
                        _packageOfferPrice = null;
                        _customerPackages = [];
                        _packageTemplates = [];
                      });
                      _loadCustomerPackages(c.id);
                    },
                    fieldViewBuilder: (ctx, ctrl, fn, _) {
                      ctrl.text = _namCtrl.text;
                      return TextFormField(
                        controller: ctrl, focusNode: fn,
                        decoration: _deco(
                            'Name or phone', Icons.person_search_rounded),
                        onChanged: (v) {
                          _namCtrl.text = v;
                          _custId = '';
                          if (_registerMode || _registered) {
                            setState(() {
                              _registerMode = false;
                              _registered   = false;
                            });
                          }
                        },
                        validator: (v) => v == null || v.trim().isEmpty
                            ? 'Required' : null,
                      );
                    },
                    optionsViewBuilder: (ctx, onSel, opts) => Align(
                      alignment: Alignment.topLeft,
                      child: Material(
                        elevation: 8,
                        borderRadius: BorderRadius.circular(14),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(
                              maxHeight: 200, maxWidth: 400),
                          child: ListView.builder(
                            shrinkWrap: true,
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            itemCount: opts.length,
                            itemBuilder: (_, i) {
                              final c = opts.elementAt(i);
                              if (c.id == _kApptNewCustId) {
                                return ListTile(
                                  dense: true,
                                  tileColor: const Color(0xFFF0FDF4),
                                  leading: CircleAvatar(
                                    radius: 15,
                                    backgroundColor: const Color(0xFFDCFCE7),
                                    child: const Icon(
                                        Icons.person_add_alt_1_rounded,
                                        size: 15,
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
                                      'Add phone below, then register',
                                      style: TextStyle(fontSize: 11)),
                                  onTap: () => onSel(c),
                                );
                              }
                              return ListTile(
                                dense: true,
                                leading: CircleAvatar(
                                  radius: 15,
                                  backgroundColor: _cLight,
                                  child: Text(
                                    c.name.isNotEmpty
                                        ? c.name[0].toUpperCase()
                                        : '?',
                                    style: TextStyle(
                                        color: _cDark,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 12),
                                  ),
                                ),
                                title: Text(c.name,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13)),
                                subtitle: Text(c.phone,
                                    style: const TextStyle(fontSize: 11)),
                                onTap: () => onSel(c),
                              );
                            },
                          ),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 10),

                  // Phone
                  _label('PHONE'),
                  TextFormField(
                    controller: _phCtrl,
                    keyboardType: TextInputType.phone,
                    decoration:
                        _deco('Phone number', Icons.call_outlined),
                  ),

                  // Register banner
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
                            'Register "${_namCtrl.text}" as new customer',
                            style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF065F46)),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Phone number above will be saved. Tap to register.',
                            style: TextStyle(
                                fontSize: 11, color: Color(0xFF6B7280)),
                          ),
                          const SizedBox(height: 10),
                          GestureDetector(
                            onTap: _registering ? null : _doRegister,
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 11),
                              decoration: BoxDecoration(
                                color: _registering
                                    ? const Color(0xFF9CA3AF)
                                    : _cMid,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Center(
                                child: _registering
                                    ? const SizedBox(
                                        width: 16, height: 16,
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

                  const SizedBox(height: 10),

                  // Package templates (same as web booking)
                  if (_custId.isNotEmpty) ...[
                    _label('PACKAGE (OPTIONAL)'),
                    Container(
                      decoration: BoxDecoration(
                        color: _cBg,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _selectedTemplateId.isNotEmpty ? _cMid : _cBorder,
                          width: _selectedTemplateId.isNotEmpty ? 1.8 : 1,
                        ),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                      child: (_loadingPackages || _linkingPackage)
                          ? Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Row(children: [
                                const SizedBox(width: 16, height: 16,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: _cMid)),
                                const SizedBox(width: 10),
                                Text(
                                  _linkingPackage
                                      ? 'Linking package…'
                                      : 'Loading packages…',
                                  style: const TextStyle(
                                      fontSize: 13, color: Color(0xFF9CA3AF)),
                                ),
                              ]),
                            )
                          : DropdownButtonHideUnderline(
                              child: DropdownButton<String>(
                                value: safePackageTemplateDropdownValue(
                                  _selectedTemplateId,
                                  _packageTemplates,
                                ),
                                isExpanded: true,
                                icon: const Icon(Icons.expand_more_rounded,
                                    color: _cMid, size: 20),
                                items: [
                                  DropdownMenuItem(
                                    value: '',
                                    child: Text(
                                      _packageTemplates.isEmpty
                                          ? 'No packages — create one on web first'
                                          : 'No package / normal appointment',
                                      style: TextStyle(
                                        fontSize: 13,
                                        color: _packageTemplates.isEmpty
                                            ? const Color(0xFFD1D5DB)
                                            : const Color(0xFF6B7280),
                                      ),
                                    ),
                                  ),
                                  ..._packageTemplates.map((pkg) {
                                    return DropdownMenuItem<String>(
                                      value: '${pkg['id']}',
                                      child: Text(
                                        formatPackageTemplateLabel(pkg),
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontSize: 13),
                                      ),
                                    );
                                  }),
                                ],
                                onChanged: _packageTemplates.isEmpty
                                    ? null
                                    : (val) =>
                                        _applyAppointmentTemplate(val ?? ''),
                              ),
                            ),
                    ),
                    const SizedBox(height: 10),
                  ],

                  // Services (dropdown)
                  WalkInServiceDropdownSection(
                    key: ValueKey(
                      'appt_svc_${_orderedServiceIds().join(',')}',
                    ),
                    activeServices: active,
                    primaryServiceId: _primaryServiceId,
                    orderedServiceIds: _orderedServiceIds(),
                    onPrimaryChanged: _onPrimaryChanged,
                    onAddExtra: _onAddExtra,
                    onRemoveExtraAt: _removeExtraAt,
                    label: 'SERVICES',
                    helperText: 'Pick primary service; add more lines below.',
                    accentColor: _cMid,
                    borderColor: _cBorder,
                    bgColor: _cBg,
                    mutedColor: const Color(0xFF6B7280),
                  ),

                  const SizedBox(height: 10),

                  // Multiple bookings toggle
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: _multiBooking ? const Color(0xFFF0FDF4) : _cBg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _multiBooking ? const Color(0xFF86EFAC) : _cBorder,
                      ),
                    ),
                    child: Row(children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Multiple bookings',
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF111827))),
                            const SizedBox(height: 2),
                            Text(
                              _multiBooking
                                  ? 'Each service gets its own staff, date & time'
                                  : 'One staff and time for all services',
                              style: const TextStyle(
                                  fontSize: 11, color: Color(0xFF6B7280)),
                            ),
                          ],
                        ),
                      ),
                      Switch.adaptive(
                        value: _multiBooking,
                        activeThumbColor: _cMid,
                        onChanged: (v) => setState(() {
                          _multiBooking = v;
                          if (v) _syncAssignments();
                        }),
                      ),
                    ]),
                  ),

                  if (_multiBooking && _orderedServiceIds().isNotEmpty) ...[
                    const SizedBox(height: 10),
                    ..._orderedServiceIds().map((id) {
                      SalonService? svc;
                      for (final s in _services) {
                        if (s.id == id) { svc = s; break; }
                      }
                      final a = _serviceAssignments[id] ??
                          {'staff_id': _staffId, 'date': _date, 'time': _time};
                      final staffVal = (a['staff_id'] ?? '').isEmpty
                          ? null
                          : a['staff_id'];
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _cLightB),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(svc?.name ?? 'Service',
                                style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF111827))),
                            if (svc != null)
                              Text('LKR ${svc.price.toStringAsFixed(0)}',
                                  style: const TextStyle(
                                      fontSize: 11,
                                      color: Color(0xFF059669),
                                      fontWeight: FontWeight.w700)),
                            const SizedBox(height: 8),
                            DropdownButtonFormField<String>(
                              initialValue: staffVal,
                              isExpanded: true,
                              decoration: _deco('Staff', Icons.badge_outlined),
                              items: [
                                const DropdownMenuItem(
                                    value: '', child: Text('Any')),
                                ..._staff.map((s) => DropdownMenuItem(
                                      value: s.id,
                                      child: Text(s.name,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontSize: 13)),
                                    )),
                              ],
                              onChanged: (v) => setState(() {
                                _serviceAssignments.putIfAbsent(id, () => {});
                                _serviceAssignments[id]!['staff_id'] = v ?? '';
                              }),
                            ),
                            const SizedBox(height: 8),
                            Row(children: [
                              Expanded(
                                child: _pickPill(
                                  value: a['date'] ?? '',
                                  hint: 'Date',
                                  icon: Icons.calendar_today_rounded,
                                  onTap: () => _pickAssignmentDate(id),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _pickPill(
                                  value: a['time'] ?? '',
                                  hint: 'Time',
                                  icon: Icons.access_time_rounded,
                                  onTap: () => _pickAssignmentTime(id),
                                ),
                              ),
                            ]),
                          ],
                        ),
                      );
                    }),
                  ],

                  const SizedBox(height: 10),

                  // Total + Amount row
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Auto total
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 13),
                          decoration: BoxDecoration(
                            color: _orderedServiceIds().isEmpty ? _cBg : _cLight,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: _orderedServiceIds().isEmpty
                                  ? _cBorder
                                  : _cLightB,
                              width: _orderedServiceIds().isEmpty ? 1 : 1.5,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${_orderedServiceIds().length} service${_orderedServiceIds().length == 1 ? '' : 's'}',
                                style: TextStyle(
                                    color: _orderedServiceIds().isEmpty
                                        ? const Color(0xFFADB5BD)
                                        : _cMid,
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w600),
                              ),
                              Text(
                                'LKR ${_calcTotal.toStringAsFixed(0)}',
                                style: TextStyle(
                                    color: _orderedServiceIds().isEmpty
                                        ? const Color(0xFF9CA3AF)
                                        : _cDark,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      // Override amount
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _label('AMOUNT (LKR)'),
                            TextFormField(
                              controller: _amtCtrl,
                              keyboardType: TextInputType.number,
                              decoration: _deco(
                                  'Override amount',
                                  Icons.edit_outlined),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 12),

                  // Advance payment
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _collectAdvance ? const Color(0xFFEFF6FF) : _cBg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _collectAdvance ? _cLightB : _cBorder,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Collect advance now',
                                    style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w800,
                                        color: Color(0xFF111827))),
                                const SizedBox(height: 2),
                                Text(
                                  _collectAdvance
                                      ? 'Deposit recorded; commission on final settle'
                                      : 'Optional booking deposit',
                                  style: const TextStyle(
                                      fontSize: 11, color: Color(0xFF6B7280)),
                                ),
                              ],
                            ),
                          ),
                          Switch.adaptive(
                            value: _collectAdvance,
                            activeThumbColor: _cMid,
                            onChanged: (v) => setState(() => _collectAdvance = v),
                          ),
                        ]),
                        if (_collectAdvance) ...[
                          const SizedBox(height: 10),
                          TextFormField(
                            controller: _advAmtCtrl,
                            keyboardType: TextInputType.number,
                            decoration: _deco(
                                'Advance amount', Icons.payments_outlined),
                          ),
                          const SizedBox(height: 8),
                          DropdownButtonFormField<String>(
                            initialValue: _advanceMethod,
                            isExpanded: true,
                            decoration: _deco('Method', Icons.credit_card_outlined),
                            items: const [
                              DropdownMenuItem(value: 'Cash', child: Text('Cash')),
                              DropdownMenuItem(value: 'Card', child: Text('Card')),
                              DropdownMenuItem(
                                  value: 'Online Transfer',
                                  child: Text('Online Transfer')),
                            ],
                            onChanged: (v) => setState(
                                () => _advanceMethod = v ?? 'Cash'),
                          ),
                          if (_calcTotal > 0 &&
                              (double.tryParse(_advAmtCtrl.text) ?? 0) > 0)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                'Remaining after advance: LKR ${(_calcTotal - (double.tryParse(_advAmtCtrl.text) ?? 0)).clamp(0, double.infinity).toStringAsFixed(0)}',
                                style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xFF1D4ED8)),
                              ),
                            ),
                        ],
                      ],
                    ),
                  ),

                  const SizedBox(height: 12),

                  // Date + Time row (hidden when multi — set per service)
                  if (!_multiBooking)
                  Row(children: [
                    // Date
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _label('DATE'),
                          _pickPill(
                            value: _date,
                            hint: 'Pick date',
                            icon: Icons.calendar_today_rounded,
                            onTap: _pickDate,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    // Time
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _label('TIME'),
                          _pickPill(
                            value: _time,
                            hint: 'Pick time',
                            icon: Icons.access_time_rounded,
                            onTap: _pickTime,
                          ),
                        ],
                      ),
                    ),
                  ]),

                  if (!_multiBooking) const SizedBox(height: 12),

                  // Staff + Branch row
                  if (!_multiBooking || (_isSuper && _branches.isNotEmpty))
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Staff (shared when not multi)
                      if (!_multiBooking)
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _label('STAFF'),
                            DropdownButtonFormField<String>(
                              initialValue: _staffId.isEmpty ? null : _staffId,
                              isExpanded: true,
                              decoration: _deco('Any', Icons.badge_outlined),
                              items: [
                                const DropdownMenuItem(
                                    value: '', child: Text('Any')),
                                ..._staff.map((s) => DropdownMenuItem(
                                      value: s.id,
                                      child: Text(s.name,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                              fontSize: 13)),
                                    )),
                              ],
                              onChanged: (v) =>
                                  setState(() => _staffId = v ?? ''),
                            ),
                          ],
                        ),
                      ),
                      // Branch (superadmin only)
                      if (_isSuper && _branches.isNotEmpty) ...[
                        if (!_multiBooking) const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _label('BRANCH'),
                              DropdownButtonFormField<String>(
                                initialValue: _branchId.isEmpty ? null : _branchId,
                                isExpanded: true,
                                decoration:
                                    _deco('Branch', Icons.store_outlined),
                                items: _branches
                                    .map((b) => DropdownMenuItem(
                                          value: b['id'],
                                          child: Text(b['name'] ?? '',
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                  fontSize: 13)),
                                        ))
                                    .toList(),
                                onChanged: (v) {
                                  setState(() => _branchId = v ?? '');
                                  if (_custId.trim().isNotEmpty) {
                                    _loadCustomerPackages(_custId);
                                  }
                                },
                                validator: (v) =>
                                    v == null || v.isEmpty ? 'Required' : null,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),

                  const SizedBox(height: 20),

                  // Book button
                  GestureDetector(
                    onTap: _saving ? null : _save,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      decoration: BoxDecoration(
                        gradient: _saving
                            ? null
                            : LinearGradient(
                                colors: [_cDark, _cMid],
                                begin: Alignment.centerLeft,
                                end: Alignment.centerRight,
                              ),
                        color: _saving ? const Color(0xFFF3F4F6) : null,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: _saving
                            ? []
                            : [
                                BoxShadow(
                                    color: _cDark.withValues(alpha: 0.30),
                                    blurRadius: 14,
                                    offset: const Offset(0, 5))
                              ],
                      ),
                      child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if (_saving)
                              const SizedBox(
                                  width: 18, height: 18,
                                  child: CircularProgressIndicator(
                                      color: _cMid, strokeWidth: 2))
                            else
                              const Icon(Icons.event_available_rounded,
                                  color: Colors.white, size: 18),
                            const SizedBox(width: 9),
                            Text(
                              _saving
                                  ? 'Booking...'
                                  : (_multiBooking
                                      ? 'Book Appointments'
                                      : 'Book Appointment'),
                              style: TextStyle(
                                  color: _saving
                                      ? const Color(0xFF9CA3AF)
                                      : Colors.white,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.2),
                            ),
                          ]),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
      ),
    );
  }

  Widget _pickPill({
    required String value,
    required String hint,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    final filled = value.isNotEmpty;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          color: _cBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: filled ? const Color(0xFF9CA3AF) : _cBorder),
        ),
        child: Row(children: [
          Icon(icon,
              size: 16,
              color: filled
                  ? const Color(0xFF374151)
                  : const Color(0xFFADB5BD)),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              value.isEmpty ? hint : value,
              style: TextStyle(
                  color: filled
                      ? const Color(0xFF111827)
                      : const Color(0xFFADB5BD),
                  fontSize: 13,
                  fontWeight: FontWeight.w600),
            ),
          ),
          if (filled)
            const Icon(Icons.check_circle_rounded,
                size: 14, color: Color(0xFF6B7280)),
        ]),
      ),
    );
  }
}
