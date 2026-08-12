import 'dart:async';

import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';
import '../utils/appointment_notes.dart';
import '../utils/package_helpers.dart';
import '../utils/phone_validation.dart';
import '../utils/salon_time.dart';
import '../widgets/app_toast.dart';
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
  final _customerFocus = FocusNode();
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
  List<Customer>            _remoteCustomers = [];
  bool                      _searchingCustomers = false;
  Timer?                    _customerSearchTimer;

  String _branchId = '';
  String _staffId  = '';
  String _custId   = '';
  String _date     = '';
  String _time     = '';
  String? _primaryServiceId;
  final List<String> _extraServiceIds = [];

  /// Per-service staff/date/time when multiple bookings is on.
  final Map<String, Map<String, String>> _serviceAssignments = {};
  /// When true: can add multiple services (+ per-service staff). Off = one service.
  bool _multiBooking = false;
  bool _collectAdvance = false;
  String _advanceMethod = 'Cash';

  List<String> _slots = [];
  bool _slotsLoading = false;
  int _slotsGen = 0;
  final Map<String, List<String>> _multiSlots = {};
  final Map<String, bool> _multiSlotsLoading = {};

  List<Map<String, dynamic>> _customerPackages = [];
  List<Map<String, dynamic>> _packageTemplates = [];
  String  _selectedPkgId   = '';
  String  _selectedTemplateId = '';
  String  _selectedPkgName = '';
  bool    _loadingPackages  = false;
  bool    _linkingPackage   = false;
  double? _packageOfferPrice;
  int     _packagesLoadGen  = 0;
  int     _packageLinkGen   = 0;
  int     _customerSearchGen = 0;
  /// Template service ids last applied — used to detect manual service edits.
  List<String> _packageServiceSnapshot = const [];

  bool get _isSuper =>
      AppStateScope.of(context).currentUser?.role == 'superadmin';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final app = AppStateScope.of(context);
    _date = salonToday();
    setState(() { _loading = true; _error = null; });
    try {
      _services = await app.loadServices();
      // Full tenant customer list from DB (all branches) for picker + phone search.
      try {
        _customers = await app.loadCustomers(allBranches: true);
      } catch (e) {
        final token = app.currentUser?.authToken ?? '';
        if (token.isNotEmpty) {
          try {
            _customers = await app.api.fetchCustomers(token: token, limit: 1000);
          } catch (_) {
            _error = e.toString().replaceFirst('Exception: ', '');
          }
        } else {
          _error = e.toString().replaceFirst('Exception: ', '');
        }
      }
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
    _reloadSlots();
  }

  List<Customer> get _customerPool {
    final map = <String, Customer>{};
    for (final c in [..._customers, ..._remoteCustomers]) {
      if (c.id.isNotEmpty) map[c.id] = c;
    }
    return map.values.toList();
  }

  static String _digitsOnly(String s) =>
      s.replaceAll(RegExp(r'[^\d]'), '');

  bool _customerMatchesQuery(Customer c, String q) {
    if (q.isEmpty) return true;
    final qq = q.replaceAll(RegExp(r'\s'), '');
    final phoneCompact = c.phone.replaceAll(RegExp(r'\s'), '').toLowerCase();
    final phoneDigits = _digitsOnly(c.phone);
    final qDigits = _digitsOnly(q);
    if (c.name.toLowerCase().contains(q)) return true;
    if (phoneCompact.contains(qq) || c.phone.toLowerCase().contains(q)) {
      return true;
    }
    if (qDigits.length >= 3 && phoneDigits.contains(qDigits)) return true;
    // Match local mobile suffixes (ignore 0 / 94 prefix differences).
    if (qDigits.length >= 7 && phoneDigits.length >= 7) {
      final qTail = qDigits.length >= 9 ? qDigits.substring(qDigits.length - 9) : qDigits;
      final pTail = phoneDigits.length >= 9
          ? phoneDigits.substring(phoneDigits.length - 9)
          : phoneDigits;
      if (pTail.contains(qTail) || qTail.contains(pTail)) return true;
    }
    return false;
  }

  void _scheduleCustomerSearch(String raw) {
    _customerSearchTimer?.cancel();
    final q = raw.trim();
    if (q.length < 2) {
      if (_remoteCustomers.isNotEmpty || _searchingCustomers) {
        setState(() {
          _remoteCustomers = const [];
          _searchingCustomers = false;
        });
      }
      return;
    }
    final gen = ++_customerSearchGen;
    setState(() => _searchingCustomers = true);
    _customerSearchTimer = Timer(const Duration(milliseconds: 280), () async {
      final app = AppStateScope.of(context);
      final token = app.currentUser?.authToken ?? '';
      if (token.isEmpty) {
        if (mounted && gen == _customerSearchGen) {
          setState(() => _searchingCustomers = false);
        }
        return;
      }
      try {
        // Prefer digit query for phone-shaped input so API LIKE matches DB formats.
        final digits = _digitsOnly(q);
        final looksLikePhone =
            digits.length >= 3 && digits.length >= (q.length * 0.6).floor();
        final searchQ = looksLikePhone ? digits : q;
        final rows = await app.api.fetchCustomers(
          token: token,
          search: searchQ,
          limit: 50,
        );
        if (!mounted || gen != _customerSearchGen) return;
        setState(() {
          _remoteCustomers = rows;
          _searchingCustomers = false;
        });
        // Nudge RawAutocomplete to rebuild options.
        if (_namCtrl.text == raw) {
          _namCtrl.value = _namCtrl.value;
        }
      } catch (_) {
        if (!mounted || gen != _customerSearchGen) return;
        setState(() {
          _remoteCustomers = const [];
          _searchingCustomers = false;
        });
        if (_namCtrl.text == raw) {
          _namCtrl.value = _namCtrl.value;
        }
      }
    });
  }

  void _clearPackageSelection({bool clearServices = false}) {
    _selectedPkgId = '';
    _selectedTemplateId = '';
    _selectedPkgName = '';
    _packageOfferPrice = null;
    _packageServiceSnapshot = const [];
    _linkingPackage = false;
    _packageLinkGen++;
    if (clearServices) {
      _primaryServiceId = null;
      _extraServiceIds.clear();
      _syncAssignments();
    }
  }

  void _clearCustomerLinkedState() {
    _custId = '';
    _packagesLoadGen++;
    _clearPackageSelection();
    _customerPackages = [];
    _packageTemplates = [];
    _loadingPackages = false;
  }

  /// If services were changed after a package pick, drop package pricing/id.
  void _invalidatePackageIfServicesChanged() {
    if (_selectedTemplateId.isEmpty && _selectedPkgId.isEmpty) return;
    if (_packageServiceSnapshot.isEmpty) return;
    final current = _orderedServiceIds();
    if (current.length != _packageServiceSnapshot.length) {
      _clearPackageSelection();
      return;
    }
    for (var i = 0; i < current.length; i++) {
      if (current[i] != _packageServiceSnapshot[i]) {
        _clearPackageSelection();
        return;
      }
    }
  }

  Future<void> _reloadStaffForBranch(String branchId) async {
    final app = AppStateScope.of(context);
    try {
      final staff = await app.loadStaffList(
        branchId: branchId.isEmpty ? null : branchId,
      );
      if (!mounted) return;
      setState(() {
        _staff = staff;
        final ids = staff.map((s) => s.id).toSet();
        if (_staffId.isNotEmpty && !ids.contains(_staffId)) {
          _staffId = '';
        }
        for (final entry in _serviceAssignments.entries) {
          final sid = (entry.value['staff_id'] ?? '').trim();
          if (sid.isNotEmpty && !ids.contains(sid)) {
            entry.value['staff_id'] = '';
          }
        }
      });
    } catch (_) {}
  }

  bool _isPastSlot(String date, String time) => isPastSalonDateTime(date, time);

  int _bookingDurationMinutes() {
    var sum = 0;
    for (final id in _orderedServiceIds()) {
      for (final s in _services) {
        if (s.id == id) sum += s.durationMinutes;
      }
    }
    return sum > 0 ? sum : 30;
  }

  Future<void> _reloadSlots() async {
    if (!mounted || _multiBooking) return;
    final staffId = _staffId.trim();
    final date = _date.trim();
    if (staffId.isEmpty || date.isEmpty) {
      setState(() {
        _slots = [];
        _slotsLoading = false;
      });
      return;
    }
    final gen = ++_slotsGen;
    setState(() => _slotsLoading = true);
    try {
      final app = AppStateScope.of(context);
      final token = app.currentUser?.authToken ?? '';
      if (token.isEmpty) return;
      final data = await app.api.fetchAvailability(
        token: token,
        staffId: staffId,
        date: date,
        duration: _bookingDurationMinutes(),
      );
      if (!mounted || gen != _slotsGen) return;
      final serverNow = data['server_now'];
      String? sd;
      String? st;
      if (serverNow is Map) {
        sd = '${serverNow['date'] ?? ''}';
        st = '${serverNow['time'] ?? ''}';
      }
      final next = filterFutureSlots(
        List<String>.from(data['slots'] as List? ?? const []),
        date,
        serverDate: sd,
        serverTime: st,
      );
      setState(() {
        _slots = next;
        _slotsLoading = false;
        final nt = normalizeHm(_time);
        if (nt.isNotEmpty && next.isNotEmpty && !next.contains(nt) && _isPastSlot(date, nt)) {
          _time = '';
        } else if (nt.isNotEmpty) {
          _time = nt;
        }
      });
    } catch (_) {
      if (!mounted || gen != _slotsGen) return;
      setState(() {
        _slots = [];
        _slotsLoading = false;
      });
    }
  }

  Future<void> _reloadMultiSlots(String serviceId) async {
    final a = _serviceAssignments[serviceId] ?? {};
    final staffId = (a['staff_id'] ?? '').trim();
    final date = (a['date'] ?? '').trim();
    if (staffId.isEmpty || date.isEmpty) {
      setState(() {
        _multiSlots[serviceId] = [];
        _multiSlotsLoading[serviceId] = false;
      });
      return;
    }
    setState(() => _multiSlotsLoading[serviceId] = true);
    try {
      final app = AppStateScope.of(context);
      final token = app.currentUser?.authToken ?? '';
      SalonService? svc;
      for (final s in _services) {
        if (s.id == serviceId) svc = s;
      }
      final data = await app.api.fetchAvailability(
        token: token,
        staffId: staffId,
        date: date,
        duration: svc?.durationMinutes ?? 30,
      );
      if (!mounted) return;
      final serverNow = data['server_now'];
      String? sd;
      String? st;
      if (serverNow is Map) {
        sd = '${serverNow['date'] ?? ''}';
        st = '${serverNow['time'] ?? ''}';
      }
      final next = filterFutureSlots(
        List<String>.from(data['slots'] as List? ?? const []),
        date,
        serverDate: sd,
        serverTime: st,
      );
      setState(() {
        _multiSlots[serviceId] = next;
        _multiSlotsLoading[serviceId] = false;
        final nt = normalizeHm(a['time']);
        if (nt.isNotEmpty) {
          _serviceAssignments.putIfAbsent(serviceId, () => {});
          _serviceAssignments[serviceId]!['time'] = nt;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _multiSlots[serviceId] = [];
        _multiSlotsLoading[serviceId] = false;
      });
    }
  }

  Widget _slotChips({
    required List<String> slots,
    required bool loading,
    required String value,
    required ValueChanged<String> onPick,
    String? durationLabel,
  }) {
    final selected = normalizeHm(value);
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            durationLabel == null
                ? 'Available slots (salon time)'
                : 'Available slots · $durationLabel',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: Color(0xFF64748B),
            ),
          ),
          const SizedBox(height: 6),
          if (loading)
            const Text('Loading slots…',
                style: TextStyle(fontSize: 12, color: Color(0xFF64748B)))
          else if (slots.isEmpty)
            const Text(
              'No free slots for this staff/time. Pick another day or stylist.',
              style: TextStyle(fontSize: 12, color: Color(0xFFB45309)),
            )
          else
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: slots.map((t) {
                final on = t == selected;
                return InkWell(
                  onTap: () => onPick(t),
                  borderRadius: BorderRadius.circular(20),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: on ? _cDark : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: on ? _cDark : _cBorder),
                    ),
                    child: Text(
                      t,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: on ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
        ],
      ),
    );
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
    _reloadSlots();
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
      _time = normalizeHm(
          '${p.hour.toString().padLeft(2, '0')}:${p.minute.toString().padLeft(2, '0')}');
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
    _reloadMultiSlots(serviceId);
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
      if (v == null) {
        _primaryServiceId = null;
        _invalidatePackageIfServicesChanged();
        _syncAssignments();
        _updateTotal();
        return;
      }
      _extraServiceIds.remove(v);
      if (prev != null && prev.isNotEmpty && prev != v) {
        _extraServiceIds.insert(0, prev);
      }
      _primaryServiceId = v;
      _invalidatePackageIfServicesChanged();
      _syncAssignments();
      _updateTotal();
    });
    _reloadSlots();
  }

  void _onAddExtra(String id) {
    if (!_multiBooking) return;
    setState(() {
      final p = _primaryServiceId?.trim();
      if (p == null || p.isEmpty) {
        _primaryServiceId = id;
      } else {
        _extraServiceIds.add(id);
      }
      _invalidatePackageIfServicesChanged();
      _syncAssignments();
      _updateTotal();
    });
    _reloadSlots();
  }

  void _removeExtraAt(int index) {
    setState(() {
      if (index >= 0 && index < _extraServiceIds.length) {
        _extraServiceIds.removeAt(index);
      }
      _invalidatePackageIfServicesChanged();
      _syncAssignments();
      _updateTotal();
    });
    _reloadSlots();
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
        _clearPackageSelection();
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
    final custIdAtStart = _custId.trim();
    final linkGen = ++_packageLinkGen;
    setState(() {
      _selectedTemplateId = templateId;
      _selectedPkgName = '${selected['name'] ?? ''}';
      _packageOfferPrice = price > 0 ? price : null;
      _packageServiceSnapshot = List<String>.from(serviceIds);
      applyResolvedServiceIds(
        ids: serviceIds,
        setPrimary: (v) => _primaryServiceId = v,
        extras: _extraServiceIds,
      );
      _syncAssignments();
      _linkingPackage = true;
    });
    _updateTotal();

    if (custIdAtStart.isEmpty) {
      setState(() => _linkingPackage = false);
      _snack('Select a customer before applying a package.');
      return;
    }

    final app = AppStateScope.of(context);
    final branch = (_isSuper || (app.currentUser?.branchId ?? '').isEmpty)
        ? _branchId
        : (app.currentUser?.branchId ?? '');
    final cp = await app.ensureCustomerPackageForTemplate(
      customerId: custIdAtStart,
      templateId: templateId,
      branchId: branch,
      existingCustomerPackages: _customerPackages,
    );
    if (!mounted) return;
    if (linkGen != _packageLinkGen || _custId.trim() != custIdAtStart) {
      return;
    }
    if (cp == null) {
      setState(() {
        _clearPackageSelection(clearServices: true);
      });
      _snack(app.lastError ?? 'Failed to link package to customer.');
      _updateTotal();
      return;
    }
    setState(() {
      _selectedPkgId = '${cp['id']}';
      _linkingPackage = false;
      final existing =
          findCustomerPackageForTemplate(_customerPackages, templateId);
      if (existing == null || !packageCanRedeemNow(existing)) {
        _customerPackages = [..._customerPackages, cp];
      }
    });
  }

  Future<void> _save() async {
    if (_saving) return;
    if (!_formKey.currentState!.validate()) return;
    if (_linkingPackage) {
      _snack('Please wait — linking package…',
          kind: AppToastKind.info, title: 'One moment');
      return;
    }
    if (_selectedTemplateId.isNotEmpty && _selectedPkgId.trim().isEmpty) {
      _snack('Package is still linking. Try again in a moment.',
          kind: AppToastKind.warning, title: 'Almost ready');
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

    if (_date.isEmpty) { _snack('Pick a date'); return; }
    if (_time.isEmpty) { _snack('Pick a time'); return; }
    if (_isPastSlot(_date, _time)) {
      _snack('Cannot book a past date/time');
      return;
    }

    final pkgNote = _selectedPkgId.isNotEmpty
        ? '${AppointmentNotes.packagePrefix} #$_selectedPkgId - $_selectedPkgName'
        : '';

    // Multiple services stay on ONE appointment (optional per-service staff).
    final amountOverride = (_packageOfferPrice != null && _packageOfferPrice! > 0)
        ? _packageOfferPrice!.toStringAsFixed(0)
        : _amtCtrl.text.trim();

    final ids = _orderedServiceIds();
    _syncAssignments();
    final serviceStaff = ids.map((id) {
      final a = _serviceAssignments[id] ?? {};
      final staff = (a['staff_id'] ?? '').trim().isNotEmpty
          ? (a['staff_id'] ?? '').trim()
          : _staffId;
      return <String, dynamic>{
        'service_id': id,
        if (staff.isNotEmpty) 'staff_id': staff,
      };
    }).toList();
    final primaryStaff = () {
      for (final row in serviceStaff) {
        final s = '${row['staff_id'] ?? ''}'.trim();
        if (s.isNotEmpty) return s;
      }
      return _staffId;
    }();

    setState(() => _saving = true);
    final ok = await app.saveAppointment(
      branchId: branch,
      customerName: _namCtrl.text.trim(),
      phone: _phCtrl.text.trim(),
      customerId: _custId,
      orderedServiceIds: ids,
      date: _date,
      time: _time,
      staffId: primaryStaff,
      baseNotes: pkgNote,
      status: '',
      amountOverride: amountOverride,
      bookingItems: null,
      serviceStaff: serviceStaff,
      advanceAmount: _collectAdvance && advanceNum > 0 ? advanceNum : null,
      advanceMethod: _collectAdvance ? _advanceMethod : null,
      customerPackageId:
          _selectedPkgId.trim().isEmpty ? null : _selectedPkgId.trim(),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) { _snack(app.lastError ?? 'Failed'); return; }
    Navigator.of(context).pop(true);
  }

  void _snack(
    String msg, {
    AppToastKind kind = AppToastKind.error,
    String? title,
  }) {
    if (!mounted) return;
    AppToast.show(context, msg, kind: kind, title: title);
  }

  Future<void> _doRegister() async {
    final app  = AppStateScope.of(context);
    final name = _namCtrl.text.trim();
    final phoneErr = validateCustomerPhone(_phCtrl.text);
    if (name.isEmpty) {
      _snack('Enter customer name');
      return;
    }
    if (phoneErr != null) {
      _snack(phoneErr);
      return;
    }
    final phone = normalizeCustomerPhone(_phCtrl.text);
    setState(() => _registering = true);
    final newCust = await app.registerCustomer(
      name: name,
      phone: phone,
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
        _clearPackageSelection();
      });
      await _loadCustomerPackages(newCust.id);
    } else {
      setState(() => _registering = false);
      _snack(app.lastError ?? 'Failed to register customer');
    }
  }

  @override
  void dispose() {
    _customerSearchTimer?.cancel();
    _customerFocus.dispose();
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

                  RawAutocomplete<Customer>(
                    textEditingController: _namCtrl,
                    focusNode: _customerFocus,
                    optionsBuilder: (val) {
                      final q   = val.text.trim().toLowerCase();
                      final all = _customerPool;
                      List<Customer> matches;
                      if (q.isEmpty) {
                        matches = all.take(12).toList();
                      } else {
                        matches = all
                            .where((c) => _customerMatchesQuery(c, q))
                            .take(20)
                            .toList();
                      }
                      final qDigits = _digitsOnly(q);
                      final looksLikePhone = qDigits.length >= 3 &&
                          qDigits.length >= (q.length * 0.6).floor();
                      final hasExact = all.any(
                          (c) => c.name.toLowerCase() == q);
                      if (q.length >= 2 &&
                          !hasExact &&
                          !_searchingCustomers &&
                          (!looksLikePhone || matches.isEmpty)) {
                        matches = [
                          ...matches,
                          Customer(
                              id: _kApptNewCustId,
                              name: looksLikePhone && matches.isEmpty
                                  ? 'New customer'
                                  : val.text.trim(),
                              phone: looksLikePhone ? qDigits : '',
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
                          _clearCustomerLinkedState();
                          _namCtrl.text = c.name == 'New customer'
                              ? ''
                              : c.name;
                          if (c.phone.isNotEmpty) {
                            _phCtrl.text = c.phone;
                          }
                        });
                        return;
                      }
                      setState(() {
                        _namCtrl.text    = c.name;
                        _phCtrl.text     = c.phone;
                        _custId          = c.id;
                        _registerMode    = false;
                        _registered      = false;
                        _clearPackageSelection();
                        _customerPackages = [];
                        _packageTemplates = [];
                      });
                      _loadCustomerPackages(c.id);
                    },
                    fieldViewBuilder: (ctx, ctrl, fn, _) {
                      return TextFormField(
                        controller: ctrl,
                        focusNode: fn,
                        keyboardType: TextInputType.text,
                        decoration: _deco(
                            'Name or phone', Icons.person_search_rounded),
                        onChanged: (v) {
                          setState(() {
                            _clearCustomerLinkedState();
                            if (_registerMode || _registered) {
                              _registerMode = false;
                              _registered   = false;
                            }
                          });
                          _updateTotal();
                          _scheduleCustomerSearch(v);
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
                              maxHeight: 220, maxWidth: 400),
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
                                    c.phone.isNotEmpty
                                        ? 'No match — register with this phone'
                                        : 'Register "${c.name}" as new customer',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13,
                                        color: Color(0xFF15803D)),
                                  ),
                                  subtitle: Text(
                                      c.phone.isNotEmpty
                                          ? 'Phone ${c.phone} — add name, then register'
                                          : 'Add phone below, then register',
                                      style: const TextStyle(fontSize: 11)),
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
                    validator: (v) {
                      // Always required when registering a new customer.
                      if (_registerMode) return validateCustomerPhone(v);
                      final t = (v ?? '').trim();
                      if (t.isEmpty) return null;
                      return validateCustomerPhone(v);
                    },
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

                  // Multiple services toggle
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
                            const Text('Multiple services',
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF111827))),
                            const SizedBox(height: 2),
                            Text(
                              _multiBooking
                                  ? 'On — add several services (same appointment, staff per service)'
                                  : 'Off — one service only',
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
                          if (!v) {
                            _extraServiceIds.clear();
                            _syncAssignments();
                            _invalidatePackageIfServicesChanged();
                          } else {
                            _syncAssignments();
                          }
                        }),
                      ),
                    ]),
                  ),

                  const SizedBox(height: 10),

                  // Services (dropdown)
                  WalkInServiceDropdownSection(
                    key: ValueKey(
                      'appt_svc_${_multiBooking}_${_orderedServiceIds().join(',')}',
                    ),
                    activeServices: active,
                    primaryServiceId: _primaryServiceId,
                    orderedServiceIds: _orderedServiceIds(),
                    onPrimaryChanged: _onPrimaryChanged,
                    onAddExtra: _onAddExtra,
                    onRemoveExtraAt: _removeExtraAt,
                    allowMultiple: _multiBooking,
                    label: 'SERVICES',
                    helperText: _multiBooking
                        ? 'Pick primary service; add more lines below.'
                        : 'Pick one service.',
                    accentColor: _cMid,
                    borderColor: _cBorder,
                    bgColor: _cBg,
                    mutedColor: const Color(0xFF6B7280),
                  ),

                  if (_multiBooking && _orderedServiceIds().length > 1) ...[
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
                            const SizedBox(height: 8),
                            DropdownButtonFormField<String?>(
                              key: ValueKey(
                                  'line_staff_${id}_${_staff.length}_${a['staff_id'] ?? ''}'),
                              initialValue: (() {
                                final raw = (staffVal ?? '').trim();
                                if (raw.isEmpty) return null;
                                return _staff.any((s) => s.id == raw) ? raw : null;
                              })(),
                              isExpanded: true,
                              decoration: _deco('Staff', Icons.badge_outlined),
                              items: [
                                const DropdownMenuItem<String?>(
                                    value: null, child: Text('Any available')),
                                ..._staff.map((s) => DropdownMenuItem<String?>(
                                      value: s.id,
                                      child: Text(s.name,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontSize: 13)),
                                    )),
                              ],
                              onChanged: (v) {
                                setState(() {
                                  _serviceAssignments.putIfAbsent(id, () => {});
                                  _serviceAssignments[id]!['staff_id'] = v ?? '';
                                  if (id == _orderedServiceIds().first) {
                                    _staffId = v ?? '';
                                  }
                                });
                              },
                            ),
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
                            onChanged: (_) => setState(() {}),
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
                  if (!_multiBooking && _staffId.isNotEmpty && _date.isNotEmpty)
                    _slotChips(
                      slots: _slots,
                      loading: _slotsLoading,
                      value: _time,
                      durationLabel: '${_bookingDurationMinutes()} min',
                      onPick: (t) => setState(() => _time = t),
                    ),

                  if (!_multiBooking) const SizedBox(height: 12),

                  // Staff + Branch row (shared staff when single / multi off)
                  if (!_multiBooking || _orderedServiceIds().length <= 1 || (_isSuper && _branches.isNotEmpty))
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Staff (shared when not multi-service lines)
                      if (!_multiBooking || _orderedServiceIds().length <= 1)
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _label('STAFF'),
                            DropdownButtonFormField<String>(
                              key: ValueKey(
                                  'staff_${_branchId}_${_staff.length}_$_staffId'),
                              initialValue: _staffId.isEmpty
                                  ? ''
                                  : (_staff.any((s) => s.id == _staffId)
                                      ? _staffId
                                      : ''),
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
                              onChanged: (v) {
                                setState(() => _staffId = v ?? '');
                                _reloadSlots();
                              },
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
                                  final next = v ?? '';
                                  setState(() => _branchId = next);
                                  _reloadStaffForBranch(next);
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
                                  : 'Book Appointment',
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
