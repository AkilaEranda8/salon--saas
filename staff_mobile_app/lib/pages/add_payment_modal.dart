import 'dart:async';

import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/recurring_template_option.dart';
import '../services/mobile_api.dart';
import 'helapay_qr_screen.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../widgets/payment_helper_staff_section.dart';
import '../widgets/recurring_booking_section.dart';
import '../widgets/walk_in_service_dropdown_section.dart';
import '../utils/package_helpers.dart';

// ── Sentinel id used to represent "Register new customer" option ──────────────
const String _kNewCustId = '__register_new__';

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
    required this.promoDiscount,
    required this.method,
    required this.paidAmount,
    required this.customerName,
    this.discountId = '',
    this.isRecurring = false,
    this.recurringNextDate = '',
    this.appointmentTime = '08:00',
    this.recurringMessageTemplateIds = const [],
    this.helpers = const [],
    this.customerPackageId = '',
  });

  final String branchId;
  final String customerId;
  final String staffId;
  final List<String> serviceIds;
  final String totalAmount;
  final String loyaltyDiscount;
  final String promoDiscount;
  final String method;
  final String paidAmount;
  final String customerName;
  /// Promo catalog discount id (optional).
  final String discountId;
  final bool isRecurring;
  final String recurringNextDate;
  final String appointmentTime;
  final List<String> recurringMessageTemplateIds;
  final List<Map<String, dynamic>> helpers;
  /// Customer package row id when method is Package.
  final String customerPackageId;
}

class AddPaymentModal extends StatefulWidget {
  const AddPaymentModal({
    required this.branches,
    required this.customers,
    required this.staff,
    required this.services,
    this.discounts = const [],
    this.initialBranchId,
    this.onRegisterNewCustomer,
    this.mobileApi,
    this.token = '',
    this.recurringAllowed = false,
    super.key,
  });

  final List<Map<String, String>> branches;
  final List<Customer> customers;
  final List<StaffMember> staff;
  final List<SalonService> services;
  /// Active promo rows from GET /api/discounts/payment
  final List<Map<String, dynamic>> discounts;
  final String? initialBranchId;
  /// Called when user taps "Add & Select" for a new customer.
  /// Returns the created [Customer] or null on failure.
  final Future<Customer?> Function(String name, String phone, String? branchId)? onRegisterNewCustomer;
  final MobileApi? mobileApi;
  final String token;
  final bool recurringAllowed;

  static Future<AddPaymentModalResult?> show(
    BuildContext context, {
    required List<Map<String, String>> branches,
    required List<Customer> customers,
    required List<StaffMember> staff,
    required List<SalonService> services,
    List<Map<String, dynamic>> discounts = const [],
    String? initialBranchId,
    Future<Customer?> Function(String name, String phone, String? branchId)? onRegisterNewCustomer,
    MobileApi? mobileApi,
    String token = '',
    bool recurringAllowed = false,
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
        discounts: discounts,
        initialBranchId: initialBranchId,
        onRegisterNewCustomer: onRegisterNewCustomer,
        mobileApi: mobileApi,
        token: token,
        recurringAllowed: recurringAllowed,
      ),
    );
  }

  @override
  State<AddPaymentModal> createState() => _AddPaymentModalState();
}

class _AddPaymentModalState extends State<AddPaymentModal> {
  static const _methods = <String>[
    'Cash', 'Card', 'Online Transfer', 'LankaQR', 'Loyalty Points', 'Package'
  ];
  static const _methodIcons = <String, IconData>{
    'Cash':            Icons.payments_rounded,
    'Card':            Icons.credit_card_rounded,
    'Online Transfer': Icons.account_balance_rounded,
    'LankaQR':         Icons.qr_code_rounded,
    'Loyalty Points':  Icons.stars_rounded,
    'Package':         Icons.card_giftcard_rounded,
  };

  final _formKey               = GlobalKey<FormState>();
  final _customerNameCtrl      = TextEditingController();
  final _customerFocus         = FocusNode();
  final _staffNameCtrl         = TextEditingController();
  final _totalAmountCtrl       = TextEditingController();
  final _paidAmountCtrl        = TextEditingController();
  final _newPhoneCtrl          = TextEditingController();

  String? _branchId;
  String _customerId = '';
  Customer? _linkedCustomer;
  Customer? _newlyRegistered;
  bool _registerMode = false;
  bool _registering  = false;
  String? _staffId;
  List<PaymentHelperDraft> _helpers = [];
  String? _primaryServiceId;
  final List<String> _extraServiceIds = [];
  String _method = _methods.first;
  String _discountId = '';
  bool _isRecurring = false;
  String _recurringNextDate = defaultRecurringNextDate();
  String _recurringSmsTime = '08:00';
  List<String> _recurringTemplateIds = [];
  List<RecurringTemplateOption> _recurringTemplates = const [];
  bool _loadingTemplates = false;
  List<Customer> _remoteCustomers = const [];
  bool _searchingCustomers = false;
  Timer? _customerSearchTimer;
  List<Map<String, dynamic>> _customerPackages = [];
  bool _loadingPackages = false;
  String _selectedPackageId = '';

  @override
  void initState() {
    super.initState();
    _branchId = widget.initialBranchId;
    if (widget.recurringAllowed) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadRecurringTemplates());
    }
  }

  List<Customer> get _customerPool {
    final map = <String, Customer>{};
    for (final c in [...widget.customers, ..._remoteCustomers]) {
      if (c.id.isNotEmpty) map[c.id] = c;
    }
    return map.values.toList();
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
    setState(() => _searchingCustomers = true);
    _customerSearchTimer = Timer(const Duration(milliseconds: 280), () async {
      final api = widget.mobileApi;
      if (api == null || widget.token.isEmpty) {
        if (mounted) setState(() => _searchingCustomers = false);
        return;
      }
      try {
        final rows = await api.fetchCustomers(
          token: widget.token,
          branchId: _branchId,
          search: q,
          limit: 40,
        );
        if (!mounted) return;
        setState(() {
          _remoteCustomers = rows;
          _searchingCustomers = false;
        });
        // Refresh Autocomplete options without remounting the field
        _customerNameCtrl.value = _customerNameCtrl.value;
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _remoteCustomers = const [];
          _searchingCustomers = false;
        });
        _customerNameCtrl.value = _customerNameCtrl.value;
      }
    });
  }

  Future<void> _loadCustomerPackages(String custId) async {
    final api = widget.mobileApi;
    if (api == null || widget.token.isEmpty || custId.trim().isEmpty) {
      setState(() {
        _customerPackages = [];
        _selectedPackageId = '';
        _loadingPackages = false;
      });
      return;
    }
    setState(() {
      _loadingPackages = true;
      _customerPackages = [];
      _selectedPackageId = '';
    });
    try {
      final rows = await api.fetchActivePackages(
        token: widget.token,
        customerId: custId.trim(),
      );
      if (!mounted) return;
      setState(() {
        _customerPackages = rows;
        _loadingPackages = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _customerPackages = [];
        _loadingPackages = false;
      });
    }
  }

  void _clearPackageSelection({bool keepMethod = false}) {
    setState(() {
      _selectedPackageId = '';
      if (!keepMethod && _method == 'Package') _method = 'Cash';
    });
  }

  void _applyPackage(String packageId) {
    if (packageId.isEmpty) {
      _clearPackageSelection();
      _recalcTotal();
      return;
    }
    Map<String, dynamic>? cp;
    for (final p in _customerPackages) {
      if ('${p['id']}' == packageId) {
        cp = p;
        break;
      }
    }
    if (cp == null || !packageCanRedeemNow(cp)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This package cannot be used right now.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    final ids = resolvePackageServiceIds(cp, widget.services);
    final bundle = getPackageBundlePrice(cp);
    setState(() {
      _selectedPackageId = packageId;
      _method = 'Package';
      _discountId = '';
      if (ids.isNotEmpty) {
        _primaryServiceId = ids.first;
        _extraServiceIds
          ..clear()
          ..addAll(ids.skip(1));
      }
      _totalAmountCtrl.text =
          bundle > 0 ? bundle.toStringAsFixed(0) : '0';
      _applyNetToPaid();
    });
  }

  Future<void> _loadRecurringTemplates() async {
    final api = widget.mobileApi;
    if (api == null || widget.token.isEmpty) return;
    setState(() => _loadingTemplates = true);
    try {
      final options = await api.fetchRecurringTemplateOptions(token: widget.token);
      if (!mounted) return;
      setState(() {
        _recurringTemplates = options;
        _loadingTemplates = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _recurringTemplates = const [];
        _loadingTemplates = false;
      });
    }
  }

  @override
  void dispose() {
    _customerSearchTimer?.cancel();
    _customerNameCtrl.dispose();
    _customerFocus.dispose();
    _staffNameCtrl.dispose();
    _totalAmountCtrl.dispose();
    _paidAmountCtrl.dispose();
    _newPhoneCtrl.dispose();
    super.dispose();
  }

  double _computedPromo() {
    if (_discountId.isEmpty) return 0;
    Map<String, dynamic>? d;
    for (final raw in widget.discounts) {
      if ('${raw['id']}' == _discountId) {
        d = raw;
        break;
      }
    }
    if (d == null) return 0;
    final total = double.tryParse(_totalAmountCtrl.text.trim()) ?? 0;
    final minBill = double.tryParse('${d['min_bill'] ?? 0}') ?? 0;
    if (total < minBill) return 0;
    final type = '${d['discount_type'] ?? 'percent'}';
    if (type == 'fixed') {
      final v = double.tryParse('${d['value']}') ?? 0;
      return v.clamp(0, total);
    }
    final pct = (double.tryParse('${d['value']}') ?? 0).clamp(0, 100);
    var off = total * pct / 100;
    final cap = d['max_discount_amount'];
    if (cap != null && '$cap'.trim().isNotEmpty) {
      final c = double.tryParse('$cap');
      if (c != null) off = off.clamp(0, c);
    }
    return (off * 100).round() / 100;
  }

  void _applyNetToPaid() {
    final total = double.tryParse(_totalAmountCtrl.text.trim()) ?? 0;
    final promo = _computedPromo();
    final net = (total - promo).clamp(0, double.infinity);
    _paidAmountCtrl.text = net > 0 ? net.toStringAsFixed(0) : '';
  }

  List<String> _orderedServiceIds() {
    final p = _primaryServiceId?.trim();
    if (p == null || p.isEmpty) return const [];
    return [p, ..._extraServiceIds];
  }

  void _recalcTotal() {
    var total = 0.0;
    for (final id in _orderedServiceIds()) {
      for (final s in widget.services) {
        if (s.id == id) total += s.price;
      }
    }
    _totalAmountCtrl.text = total > 0 ? total.toStringAsFixed(0) : '';
    _applyNetToPaid();
  }

  Future<void> _doRegister() async {
    final fn = widget.onRegisterNewCustomer;
    if (fn == null) return;
    final name = _customerNameCtrl.text.trim();
    if (name.isEmpty) return;
    setState(() => _registering = true);
    final newCust = await fn(name, _newPhoneCtrl.text.trim(), _branchId);
    if (!mounted) return;
    if (newCust != null) {
      setState(() {
        _newlyRegistered = newCust;
        _linkedCustomer  = newCust;
        _customerId      = newCust.id;
        _registerMode    = false;
        _registering     = false;
        _newPhoneCtrl.clear();
      });
      _loadCustomerPackages(newCust.id);
    } else {
      setState(() => _registering = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Failed to register customer. Try again.'),
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_customerId.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_registerMode
              ? 'Tap "Add & Select" to register the new customer first.'
              : 'Search and select a customer, or register a new one.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if (widget.recurringAllowed && _isRecurring && _recurringNextDate.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Select the next recurring visit date.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if ((_staffId ?? '').trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Select main staff.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if (_method == 'Package' && _selectedPackageId.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Select a customer package for Package payment'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if (!helpersDraftValid(_helpers)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Each helper needs a staff member and commission value.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    final allCusts = [
      ?_newlyRegistered,
      ...widget.customers,
    ];
    final cust = allCusts.firstWhere(
      (c) => c.id == _customerId,
      orElse: () => Customer(id: '', name: 'Walk-in', phone: '', email: ''),
    );
    final promo = _computedPromo();
    final result = AddPaymentModalResult(
      branchId:       (_branchId ?? '').trim(),
      customerId:     _customerId.trim(),
      staffId:        (_staffId ?? '').trim(),
      helpers:        helpersApiPayload(_helpers),
      serviceIds:     _orderedServiceIds(),
      totalAmount:    _totalAmountCtrl.text.trim(),
      loyaltyDiscount: '0',
      promoDiscount:  promo.toStringAsFixed(2),
      method:         _method,
      paidAmount:     _paidAmountCtrl.text.trim(),
      discountId:     _discountId,
      customerName:   _customerNameCtrl.text.trim().isEmpty
                          ? cust.name
                          : _customerNameCtrl.text.trim(),
      isRecurring: widget.recurringAllowed && _isRecurring,
      recurringNextDate: _recurringNextDate,
      appointmentTime: _recurringSmsTime,
      recurringMessageTemplateIds: List<String>.from(_recurringTemplateIds),
      customerPackageId: _selectedPackageId.trim(),
    );

    if (_method == 'LankaQR') {
      final api = widget.mobileApi;
      if (api == null || widget.token.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('HelaPay not configured. Contact admin.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
        return;
      }
      final amount = double.tryParse(_paidAmountCtrl.text.trim()) ?? 0;
      final ref = 'PAY-${DateTime.now().millisecondsSinceEpoch}';
      if (!mounted) return;
      final paid = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => HelaPayQRScreen(
            api: api, token: widget.token,
            amount: amount, reference: ref,
          ),
        ),
      );
      if (paid != true || !mounted) return;
    }

    Navigator.of(context).pop(result);
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
                  onChanged: (v) => setState(() {
                    _branchId = v;
                    _staffId = null;
                    _helpers = [];
                    _staffNameCtrl.clear();
                  }),
                  validator: (v) =>
                      v == null || v.trim().isEmpty ? 'Branch required' : null,
                ),
                const SizedBox(height: 12),
              ],

              // ── Customer — search existing or register new inline ─────
              _label('CUSTOMER *'),
              RawAutocomplete<Customer>(
                textEditingController: _customerNameCtrl,
                focusNode: _customerFocus,
                optionsBuilder: (val) {
                  final q   = val.text.trim().toLowerCase();
                  final all = _customerPool;
                  List<Customer> matches;
                  if (q.isEmpty) {
                    matches = all.take(10).toList();
                  } else {
                    final qq = q.replaceAll(RegExp(r'\s'), '');
                    matches = all.where((c) {
                      return c.name.toLowerCase().contains(q) ||
                          c.phone.replaceAll(RegExp(r'\s'), '').contains(qq) ||
                          c.email.toLowerCase().contains(q);
                    }).take(15).toList();
                  }
                  // Append sentinel "register new" when no exact match & ≥2 chars
                  final hasExact = all.any(
                      (c) => c.name.toLowerCase() == q);
                  if (q.length >= 2 &&
                      !hasExact &&
                      !_searchingCustomers &&
                      widget.onRegisterNewCustomer != null) {
                    matches = [
                      ...matches,
                      Customer(
                          id: _kNewCustId,
                          name: val.text.trim(),
                          phone: '',
                          email: ''),
                    ];
                  }
                  return matches;
                },
                displayStringForOption: (c) =>
                    c.id == _kNewCustId ? c.name : c.name,
                onSelected: (c) {
                  if (c.id == _kNewCustId) {
                    setState(() {
                      _registerMode = true;
                      _customerId   = '';
                      _linkedCustomer = null;
                      _customerNameCtrl.text = c.name;
                      _customerPackages = [];
                      _selectedPackageId = '';
                    });
                    return;
                  }
                  setState(() {
                    _linkedCustomer = c;
                    _customerId     = c.id;
                    _registerMode   = false;
                    _customerNameCtrl.text = c.name;
                  });
                  _loadCustomerPackages(c.id);
                },
                fieldViewBuilder: (ctx, ctrl, fn, _) {
                  return TextFormField(
                    controller: ctrl,
                    focusNode: fn,
                    textCapitalization: TextCapitalization.words,
                    decoration: _deco(
                        widget.customers.isEmpty
                            ? 'Type name to register new customer'
                            : 'Search name / phone, or type new name',
                        Icons.person_search_rounded),
                    onChanged: (v) {
                      _scheduleCustomerSearch(v);
                      if (_linkedCustomer != null &&
                          v.trim() != _linkedCustomer!.name) {
                        setState(() {
                          _linkedCustomer = null;
                          _customerId     = '';
                          _registerMode   = false;
                          _customerPackages = [];
                          _selectedPackageId = '';
                          if (_method == 'Package') _method = 'Cash';
                        });
                      }
                    },
                  );
                },
                optionsViewBuilder: (ctx, onSel, opts) => Align(
                  alignment: Alignment.topLeft,
                  child: Material(
                    elevation: 8,
                    borderRadius: BorderRadius.circular(14),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                          maxHeight: 240, maxWidth: 420),
                      child: ListView.builder(
                        shrinkWrap: true,
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        itemCount: opts.length,
                        itemBuilder: (_, i) {
                          final c = opts.elementAt(i);
                          final isNew = c.id == _kNewCustId;
                          if (isNew) {
                            return ListTile(
                              dense: true,
                              leading: CircleAvatar(
                                radius: 16,
                                backgroundColor: const Color(0xFFDCFCE7),
                                child: const Icon(Icons.person_add_alt_1_rounded,
                                    size: 16, color: Color(0xFF15803D)),
                              ),
                              title: Text(
                                'Register "${c.name}" as new customer',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: Color(0xFF15803D)),
                              ),
                              subtitle: const Text('Tap to add name + phone',
                                  style: TextStyle(fontSize: 11)),
                              tileColor: const Color(0xFFF0FDF4),
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
                                    : (c.email.isNotEmpty ? c.email : ''),
                                style: const TextStyle(fontSize: 11)),
                            onTap: () => onSel(c),
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ),

              // ── Inline register form (shown when sentinel selected) ───
              if (_registerMode) ...[
                const SizedBox(height: 8),
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
                        'Register "${_customerNameCtrl.text}" as new customer',
                        style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF065F46)),
                      ),
                      const SizedBox(height: 8),
                      Row(children: [
                        Expanded(
                          child: TextFormField(
                            controller: _newPhoneCtrl,
                            keyboardType: TextInputType.phone,
                            decoration: _deco(
                                'Phone number (optional)',
                                Icons.phone_outlined),
                          ),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: _registering ? null : _doRegister,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 13),
                            decoration: BoxDecoration(
                              color: _registering
                                  ? const Color(0xFF9CA3AF)
                                  : _pGreen,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: _registering
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        color: Colors.white, strokeWidth: 2))
                                : const Text('Add & Select',
                                    style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700)),
                          ),
                        ),
                      ]),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 12),

              PaymentHelperStaffSection(
                staffOptions: filteredStaff,
                mainStaffId: _staffId ?? '',
                helpers: _helpers,
                onMainStaffChanged: (id) {
                  setState(() {
                    _staffId = id;
                    String name = '';
                    for (final s in filteredStaff) {
                      if (s.id == id) {
                        name = s.name;
                        break;
                      }
                    }
                    _staffNameCtrl.text = name;
                    _helpers = _helpers.where((h) => h.staffId != id).toList();
                  });
                },
                onHelpersChanged: (rows) => setState(() => _helpers = rows),
              ),

              const SizedBox(height: 12),

              // ── Services (dropdowns — same pattern as Walk-in Collect Payment) ──
              WalkInServiceDropdownSection(
                activeServices: activeServices,
                primaryServiceId: _primaryServiceId,
                orderedServiceIds: _orderedServiceIds(),
                onPrimaryChanged: (v) {
                  setState(() {
                    _primaryServiceId = v;
                    _recalcTotal();
                  });
                },
                onAddExtra: (id) {
                  setState(() {
                    final p = _primaryServiceId?.trim();
                    if (p == null || p.isEmpty) {
                      _primaryServiceId = id;
                    } else {
                      _extraServiceIds.add(id);
                    }
                    _recalcTotal();
                  });
                },
                onRemoveExtraAt: (i) {
                  setState(() {
                    if (i >= 0 && i < _extraServiceIds.length) {
                      _extraServiceIds.removeAt(i);
                    }
                    _recalcTotal();
                  });
                },
                label: 'SERVICES',
                helperText:
                    'Primary first; add lines below — same service can be added more than once.',
                accentColor: _pGreen,
                borderColor: _pBorder,
                bgColor: _pBg,
                mutedColor: const Color(0xFF6B7280),
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
                        onChanged: (_) => setState(_applyNetToPaid),
                        validator: (v) {
                          if (_orderedServiceIds().isEmpty) {
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
                            'Paid', Icons.account_balance_wallet_rounded),
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
              _label('PROMO DISCOUNT'),
              DropdownButtonFormField<String>(
                  key: ValueKey<String>('promo_$_discountId'),
                  initialValue: _discountId,
                  isExpanded: true,
                  decoration: _deco('Select promo (optional)', Icons.local_offer_rounded),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('None')),
                    ...widget.discounts.map((d) => DropdownMenuItem(
                          value: '${d['id']}',
                          child: Text(
                            '${d['name'] ?? ''} (${d['discount_type'] == 'fixed' ? 'Rs. ${d['value']}' : '${d['value']}% off'})',
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13),
                          ),
                        )),
                  ],
                  onChanged: (v) {
                    setState(() {
                      _discountId = v ?? '';
                      _applyNetToPaid();
                    });
                  },
                ),

              const SizedBox(height: 12),

              // ── Customer package ─────────────────────────────────────
              if (_customerId.trim().isNotEmpty) ...[
                _label('CUSTOMER PACKAGE'),
                if (_loadingPackages)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Row(children: [
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: _pGreen,
                        ),
                      ),
                      SizedBox(width: 10),
                      Text(
                        'Loading packages…',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF9CA3AF),
                        ),
                      ),
                    ]),
                  )
                else
                  DropdownButtonFormField<String>(
                    initialValue:
                        _selectedPackageId.isEmpty ? '' : _selectedPackageId,
                    isExpanded: true,
                    decoration: _deco(
                      _customerPackages.isEmpty
                          ? 'No packages for this customer'
                          : 'Select package (optional)',
                      Icons.card_giftcard_rounded,
                    ),
                    items: [
                      DropdownMenuItem(
                        value: '',
                        child: Text(
                          _customerPackages.isEmpty
                              ? 'No active packages'
                              : 'No package — pay normally',
                          style: TextStyle(
                            fontSize: 13,
                            color: _customerPackages.isEmpty
                                ? const Color(0xFFD1D5DB)
                                : const Color(0xFF6B7280),
                          ),
                        ),
                      ),
                      ..._customerPackages.map((pkg) {
                        final id = '${pkg['id']}';
                        final can = packageCanRedeemNow(pkg);
                        return DropdownMenuItem<String>(
                          value: id,
                          enabled: can,
                          child: Text(
                            can
                                ? formatCustomerPackageLabel(pkg)
                                : '${formatCustomerPackageLabel(pkg)} — unavailable',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              color: can
                                  ? const Color(0xFF111827)
                                  : const Color(0xFF9CA3AF),
                            ),
                          ),
                        );
                      }),
                    ],
                    onChanged: _customerPackages.isEmpty
                        ? null
                        : (v) => _applyPackage(v ?? ''),
                  ),
                const SizedBox(height: 12),
              ],

              // ── Payment method chips ──────────────────────────────────
              _label('PAYMENT METHOD'),
              Wrap(
                spacing: 7,
                runSpacing: 7,
                children: _methods.map((m) {
                  final sel = _method == m;
                  return GestureDetector(
                    onTap: () {
                      if (m == 'Package' && _selectedPackageId.isEmpty) {
                        if (_customerPackages.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'No redeemable packages for this customer',
                              ),
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                          return;
                        }
                        // Prefer first redeemable package.
                        for (final p in _customerPackages) {
                          if (packageCanRedeemNow(p)) {
                            _applyPackage('${p['id']}');
                            return;
                          }
                        }
                        return;
                      }
                      setState(() {
                        _method = m;
                        if (m != 'Package') _selectedPackageId = '';
                      });
                    },
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

              if (widget.recurringAllowed) ...[
                const SizedBox(height: 14),
                RecurringBookingSection(
                  enabled: _isRecurring,
                  nextDate: _recurringNextDate,
                  smsTime: _recurringSmsTime,
                  selectedTemplateIds: _recurringTemplateIds,
                  templates: _recurringTemplates,
                  loadingTemplates: _loadingTemplates,
                  accentColor: _pGreen,
                  onEnabledChanged: (v) => setState(() => _isRecurring = v),
                  onNextDateChanged: (v) => setState(() => _recurringNextDate = v),
                  onSmsTimeChanged: (v) => setState(() => _recurringSmsTime = v),
                  onTemplateIdsChanged: (ids) =>
                      setState(() => _recurringTemplateIds = ids),
                ),
              ],

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
