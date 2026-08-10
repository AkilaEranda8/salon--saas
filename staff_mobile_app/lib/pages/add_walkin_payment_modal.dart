import 'package:flutter/material.dart';

import '../models/recurring_template_option.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../services/mobile_api.dart';
import 'helapay_qr_screen.dart';
import '../widgets/payment_helper_staff_section.dart';
import '../widgets/recurring_booking_section.dart';
import '../widgets/walk_in_service_dropdown_section.dart';
import '../utils/appointment_notes.dart';
import '../utils/package_helpers.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _pGreen  = Color(0xFF059669);
const Color _pDark   = Color(0xFF047857);
const Color _pGreenL = Color(0xFFECFDF5);
const Color _pGreenB = Color(0xFFA7F3D0);
const Color _pBg     = Color(0xFFF9FAFB);
const Color _pBorder = Color(0xFFE5E7EB);
const Color _pInk    = Color(0xFF111827);
const Color _pMuted  = Color(0xFF6B7280);

// ─────────────────────────────────────────────────────────────────────────────
class AddWalkInPaymentModalResult {
  const AddWalkInPaymentModalResult({
    required this.method,
    required this.amount,
    required this.subtotal,
    required this.discountId,
    required this.serviceIds,
    this.loyaltyDiscount = '0',
    this.promoDiscount = '0',
    this.isRecurring = false,
    this.recurringNextDate = '',
    this.appointmentTime = '08:00',
    this.recurringMessageTemplateIds = const [],
    this.staffId = '',
    this.helpers = const [],
    this.customerPackageId = '',
  });

  final String method;
  /// Net paid (after promo + manual discount).
  final String amount;
  /// Gross before discounts (service sum).
  final String subtotal;
  final String discountId;
  /// Ordered: primary first, then additional — sent to `/api/payments` as `service_ids`.
  final List<String> serviceIds;
  /// Manual discount entered by staff (LKR).
  final String loyaltyDiscount;
  final String promoDiscount;
  final bool isRecurring;
  final String recurringNextDate;
  final String appointmentTime;
  final List<String> recurringMessageTemplateIds;
  final String staffId;
  final List<Map<String, dynamic>> helpers;
  final String customerPackageId;
}

// ─────────────────────────────────────────────────────────────────────────────
class AddWalkInPaymentModal extends StatefulWidget {
  const AddWalkInPaymentModal({
    required this.initialAmount,
    required this.services,
    required this.selectedServiceIds,
    this.staff = const [],
    this.initialStaffId = '',
    this.customerName = '',
    this.customerId = '',
    this.serviceName = '',
    this.initialNote = '',
    this.initialCustomerPackageId = '',
    this.discounts = const [],
    this.mobileApi,
    this.token = '',
    this.branchId,
    this.recurringAllowed = false,
    super.key,
  });

  final String initialAmount;
  final List<SalonService> services;
  /// Walk-in lines to pre-select; user may add more (additional services).
  final List<String> selectedServiceIds;
  final List<StaffMember> staff;
  final String initialStaffId;
  final String customerName;
  final String customerId;
  final String serviceName;
  /// Walk-in note — may contain `Package: #id - name` from check-in.
  final String initialNote;
  final String initialCustomerPackageId;
  final List<Map<String, dynamic>> discounts;
  final MobileApi? mobileApi;
  final String token;
  final String? branchId;
  final bool recurringAllowed;

  static Future<AddWalkInPaymentModalResult?> show(
    BuildContext context, {
    required String initialAmount,
    required List<SalonService> services,
    required List<String> selectedServiceIds,
    List<StaffMember> staff = const [],
    String initialStaffId = '',
    String customerName = '',
    String customerId = '',
    String serviceName = '',
    String initialNote = '',
    String initialCustomerPackageId = '',
    List<Map<String, dynamic>> discounts = const [],
    MobileApi? mobileApi,
    String token = '',
    String? branchId,
    bool recurringAllowed = false,
  }) {
    return showModalBottomSheet<AddWalkInPaymentModalResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AddWalkInPaymentModal(
        initialAmount: initialAmount,
        services: services,
        selectedServiceIds: selectedServiceIds,
        staff: staff,
        initialStaffId: initialStaffId,
        customerName: customerName,
        customerId: customerId,
        serviceName: serviceName,
        initialNote: initialNote,
        initialCustomerPackageId: initialCustomerPackageId,
        discounts: discounts,
        mobileApi: mobileApi,
        token: token,
        branchId: branchId,
        recurringAllowed: recurringAllowed,
      ),
    );
  }

  @override
  State<AddWalkInPaymentModal> createState() =>
      _AddWalkInPaymentModalState();
}

class _AddWalkInPaymentModalState extends State<AddWalkInPaymentModal> {
  static const _methods = [
    'Cash', 'Card', 'Online Transfer', 'LankaQR', 'Loyalty Points',
  ];
  static const _methodIcons = <String, IconData>{
    'Cash':            Icons.payments_rounded,
    'Card':            Icons.credit_card_rounded,
    'Online Transfer': Icons.account_balance_rounded,
    'LankaQR':         Icons.qr_code_rounded,
    'Loyalty Points':  Icons.stars_rounded,
  };

  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _totalCtrl;
  late final TextEditingController _amtCtrl;
  final Map<String, TextEditingController> _servicePriceCtrls = {};
  String _method = 'Cash';
  String _discountId = '';

  String? _primaryServiceId;
  final List<String> _extraServiceIds = [];
  String _mainStaffId = '';
  List<PaymentHelperDraft> _helpers = [];
  bool _isRecurring = false;
  String _recurringNextDate = defaultRecurringNextDate();
  String _recurringSmsTime = '08:00';
  List<String> _recurringTemplateIds = [];
  List<RecurringTemplateOption> _recurringTemplates = const [];
  bool _loadingTemplates = false;
  List<Map<String, dynamic>> _customerPackages = [];
  List<Map<String, dynamic>> _packageTemplates = [];
  bool _loadingPackages = false;
  bool _linkingPackage = false;
  String _selectedTemplateId = '';
  String _selectedPackageId = '';
  double? _packageOfferPrice;
  int _packagesLoadGen = 0;

  @override
  void initState() {
    super.initState();
    _hydrateSelection();
    _mainStaffId = widget.initialStaffId;
    final initial = widget.initialAmount.trim();
    final initialOffer = double.tryParse(initial);
    final hasPkgHint = widget.initialCustomerPackageId.trim().isNotEmpty ||
        (AppointmentNotes.parsePackageId(widget.initialNote) ?? '')
            .isNotEmpty;
    if (hasPkgHint && initialOffer != null && initialOffer > 0) {
      _packageOfferPrice = initialOffer;
    }
    _totalCtrl = TextEditingController(
      text: initial.isNotEmpty ? initial : '0',
    );
    _amtCtrl = TextEditingController(
      text: initial.isNotEmpty ? initial : '0',
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_packageOfferPrice == null) {
        _syncAmountFromServices();
      }
      if (widget.recurringAllowed) _loadRecurringTemplates();
      if (widget.customerId.trim().isNotEmpty) {
        _loadCustomerPackages(widget.customerId);
      }
    });
  }

  Future<void> _loadCustomerPackages(String custId) async {
    final api = widget.mobileApi;
    if (api == null || widget.token.isEmpty || custId.trim().isEmpty) return;
    final gen = ++_packagesLoadGen;
    setState(() {
      _loadingPackages = true;
      _customerPackages = [];
      _packageTemplates = [];
    });
    try {
      final branch = (widget.branchId ?? '').trim();
      final results = await Future.wait([
        api.fetchPackageTemplates(
          token: widget.token,
          branchId: branch.isEmpty ? null : branch,
        ),
        api.fetchActivePackages(
          token: widget.token,
          customerId: custId.trim(),
        ),
      ]);
      if (!mounted || gen != _packagesLoadGen) return;
      setState(() {
        _packageTemplates = filterBookablePackageTemplates(results[0]);
        _customerPackages = results[1];
        _loadingPackages = false;
      });
      await _restorePackageFromWalkIn();
    } catch (e) {
      if (!mounted || gen != _packagesLoadGen) return;
      setState(() {
        _customerPackages = [];
        _packageTemplates = [];
        _loadingPackages = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
        ),
      );
    }
  }

  /// Pre-select package services + offer amount from the walk-in check-in.
  Future<void> _restorePackageFromWalkIn() async {
    final cpId = widget.initialCustomerPackageId.trim().isNotEmpty
        ? widget.initialCustomerPackageId.trim()
        : (AppointmentNotes.parsePackageId(widget.initialNote) ?? '').trim();
    if (cpId.isEmpty) return;

    Map<String, dynamic>? cp;
    for (final p in _customerPackages) {
      if ('${p['id']}' == cpId) {
        cp = p;
        break;
      }
    }

    var templateId =
        '${cp?['package_id'] ?? packageOf(cp ?? {})?['id'] ?? ''}'.trim();
    Map<String, dynamic>? tpl;
    if (templateId.isNotEmpty) {
      for (final p in _packageTemplates) {
        if ('${p['id']}' == templateId) {
          tpl = p;
          break;
        }
      }
    }
    // Note may store template id when CP row is missing.
    if (tpl == null) {
      for (final p in _packageTemplates) {
        if ('${p['id']}' == cpId) {
          tpl = p;
          templateId = cpId;
          break;
        }
      }
    }

    final serviceIds = cp != null
        ? resolvePackageServiceIds(cp, widget.services)
        : (tpl != null
            ? resolveTemplateServiceIds(tpl, widget.services)
            : <String>[]);
    final bundleFromPkg = cp != null
        ? getPackageBundlePrice(cp)
        : (tpl != null ? getTemplateBundlePrice(tpl) : 0.0);
    final initialOffer = double.tryParse(widget.initialAmount.trim()) ?? 0.0;
    final double bundle = bundleFromPkg > 0
        ? bundleFromPkg
        : (initialOffer > 0 ? initialOffer : 0.0);

    if (!mounted) return;
    if (serviceIds.isEmpty && !(bundle > 0)) return;

    final templateInList = templateId.isNotEmpty &&
        _packageTemplates.any((p) => '${p['id']}' == templateId);

    setState(() {
      if (templateInList) _selectedTemplateId = templateId;
      // Only set CP id when we found a sold package row (not a bare template id).
      _selectedPackageId = cp != null ? cpId : '';
      if (_method == 'Package') _method = 'Cash';
      _discountId = '';
      _packageOfferPrice = bundle > 0 ? bundle : null;
      if (serviceIds.isNotEmpty) {
        applyResolvedServiceIds(
          ids: serviceIds,
          setPrimary: (v) => _primaryServiceId = v,
          extras: _extraServiceIds,
        );
      }
      if (bundle > 0) {
        _totalCtrl.text = bundle.toStringAsFixed(0);
        _amtCtrl.text = bundle.toStringAsFixed(0);
      }
    });
  }

  Future<void> _applyTemplate(String templateId) async {
    if (templateId.isEmpty) {
      setState(() {
        _selectedPackageId = '';
        _selectedTemplateId = '';
        _packageOfferPrice = null;
      });
      _syncAmountFromServices();
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
    final ids = resolveTemplateServiceIds(selected, widget.services);
    final bundle = getTemplateBundlePrice(selected);
    setState(() {
      _selectedTemplateId = templateId;
      if (_method == 'Package') _method = 'Cash';
      _discountId = '';
      _packageOfferPrice = bundle > 0 ? bundle : null;
      applyResolvedServiceIds(
        ids: ids,
        setPrimary: (v) => _primaryServiceId = v,
        extras: _extraServiceIds,
      );
      _totalCtrl.text = bundle > 0 ? bundle.toStringAsFixed(0) : '0';
      _amtCtrl.text = _totalCtrl.text;
      _linkingPackage = true;
    });

    final api = widget.mobileApi;
    if (api == null || widget.token.isEmpty || widget.customerId.trim().isEmpty) {
      setState(() => _linkingPackage = false);
      return;
    }
    try {
      var cp = findCustomerPackageForTemplate(_customerPackages, templateId);
      if (cp == null || !packageCanRedeemNow(cp)) {
        cp = await api.purchasePackage(
          token: widget.token,
          customerId: widget.customerId.trim(),
          packageId: templateId,
        );
        final refreshed = await api.fetchActivePackages(
          token: widget.token,
          customerId: widget.customerId.trim(),
        );
        if (mounted) {
          setState(() => _customerPackages = refreshed);
          cp = findCustomerPackageForTemplate(refreshed, templateId) ?? cp;
        }
      }
      if (!mounted) return;
      setState(() {
        _selectedPackageId = '${cp?['id'] ?? ''}'.trim();
        _linkingPackage = false;
        // Re-lock after async link — all package services + offer price.
        applyResolvedServiceIds(
          ids: ids,
          setPrimary: (v) => _primaryServiceId = v,
          extras: _extraServiceIds,
        );
        _packageOfferPrice = bundle > 0 ? bundle : null;
        _totalCtrl.text = bundle > 0 ? bundle.toStringAsFixed(0) : '0';
        _amtCtrl.text = _totalCtrl.text;
      });
      if (_selectedPackageId.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not link package to this customer.')),
        );
      }
      if (ids.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Package selected, but its services were not found in this salon list.',
            ),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _selectedTemplateId = '';
        _selectedPackageId = '';
        _packageOfferPrice = null;
        _linkingPackage = false;
        if (_method == 'Package') _method = 'Cash';
      });
      _syncAmountFromServices();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
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

  void _hydrateSelection() {
    final ids = widget.selectedServiceIds
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toList();
    if (ids.isEmpty) {
      _primaryServiceId = null;
      _extraServiceIds.clear();
      return;
    }
    _primaryServiceId = ids.first;
    _extraServiceIds
      ..clear()
      ..addAll(ids.length > 1 ? ids.sublist(1) : []);
  }

  List<String> _orderedSelectedServiceIds() {
    final p = _primaryServiceId?.trim();
    if (p == null || p.isEmpty) return const [];
    return [p, ..._extraServiceIds];
  }

  double _catalogPriceFor(String id) {
    for (final s in widget.services) {
      if (s.id == id) return s.price;
    }
    return 0;
  }

  void _syncServicePriceCtrls({bool resetValues = false}) {
    final ids = _orderedSelectedServiceIds();
    for (final id in ids) {
      final catalog = _catalogPriceFor(id);
      final text = catalog > 0 ? catalog.toStringAsFixed(0) : '0';
      if (!_servicePriceCtrls.containsKey(id)) {
        _servicePriceCtrls[id] = TextEditingController(text: text);
      } else if (resetValues) {
        _servicePriceCtrls[id]!.text = text;
      }
    }
    final stale =
        _servicePriceCtrls.keys.where((k) => !ids.contains(k)).toList();
    for (final k in stale) {
      _servicePriceCtrls.remove(k)?.dispose();
    }
  }

  double _catalogSelectedAmount() {
    final offer = _packageOfferPrice;
    if (offer != null && offer > 0) return offer;
    _syncServicePriceCtrls();
    var sum = 0.0;
    for (final id in _orderedSelectedServiceIds()) {
      sum += double.tryParse(_servicePriceCtrls[id]?.text.trim() ?? '') ?? 0;
    }
    return sum;
  }

  double _billGross() {
    final offer = _packageOfferPrice;
    if (offer != null && offer > 0) return offer;
    final typed = double.tryParse(_totalCtrl.text.trim());
    if (typed != null && typed >= 0) return typed;
    return _catalogSelectedAmount();
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
    final total = _billGross();
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

  void _syncAmountFromServices({bool resetTotalFromCatalog = true}) {
    final offer = _packageOfferPrice;
    if (offer != null && offer > 0) {
      _totalCtrl.text = offer.toStringAsFixed(0);
      final promo = _computedPromo();
      final net = (offer - promo).clamp(0, double.infinity);
      _amtCtrl.text = net > 0 ? net.toStringAsFixed(0) : '0';
      return;
    }
    if (resetTotalFromCatalog) {
      _syncServicePriceCtrls(resetValues: true);
      if (_orderedSelectedServiceIds().isEmpty) {
        _totalCtrl.text = '0';
        _amtCtrl.text = '0';
        return;
      }
      final catalog = _catalogSelectedAmount();
      _totalCtrl.text = catalog > 0 ? catalog.toStringAsFixed(0) : '0';
    } else {
      _syncServicePriceCtrls();
    }
    final gross = _billGross();
    final promo = _computedPromo();
    final net = (gross - promo).clamp(0, double.infinity);
    _amtCtrl.text = net > 0 ? net.toStringAsFixed(0) : '';
  }

  void _onServicePriceEdited() {
    final sum = _catalogSelectedAmount();
    _totalCtrl.text = sum > 0 ? sum.toStringAsFixed(0) : '0';
    setState(() {});
    _syncAmountFromServices(resetTotalFromCatalog: false);
  }

  void _removeExtraAt(int index) {
    setState(() {
      if (index >= 0 && index < _extraServiceIds.length) {
        _extraServiceIds.removeAt(index);
      }
    });
    _syncAmountFromServices();
  }

  void _onPrimaryDropdownChanged(String? v) {
    setState(() {
      final prev = _primaryServiceId;
      if (v == null) {
        _primaryServiceId = null;
        return;
      }
      _extraServiceIds.remove(v);
      if (prev != null && prev.isNotEmpty && prev != v) {
        _extraServiceIds.insert(0, prev);
      }
      _primaryServiceId = v;
    });
    _syncAmountFromServices();
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
    _syncAmountFromServices();
  }

  @override
  void dispose() {
    _totalCtrl.dispose();
    _amtCtrl.dispose();
    for (final c in _servicePriceCtrls.values) {
      c.dispose();
    }
    _servicePriceCtrls.clear();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_linkingPackage) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please wait — linking package…')),
      );
      return;
    }
    if (_selectedTemplateId.isNotEmpty && _selectedPackageId.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Package is still linking. Try again in a moment.')),
      );
      return;
    }
    if (_orderedSelectedServiceIds().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one service')),
      );
      return;
    }
    if (widget.recurringAllowed && _isRecurring && _recurringNextDate.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select the next recurring visit date')),
      );
      return;
    }
    if (_mainStaffId.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select main staff')),
      );
      return;
    }
    if (!helpersDraftValid(_helpers)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Each helper needs a staff member and commission value.'),
        ),
      );
      return;
    }
    final gross = _billGross();
    final promo  = _computedPromo();
    final totalText = _totalCtrl.text.trim().isNotEmpty
        ? _totalCtrl.text.trim()
        : (gross > 0 ? gross.toStringAsFixed(0) : '0');
    final result = AddWalkInPaymentModalResult(
      method:          _method,
      amount:          _amtCtrl.text.trim(),
      subtotal:        totalText,
      discountId:      _discountId,
      serviceIds:      List<String>.from(_orderedSelectedServiceIds()),
      loyaltyDiscount: '0',
      promoDiscount:   promo.toStringAsFixed(2),
      isRecurring: widget.recurringAllowed && _isRecurring,
      recurringNextDate: _recurringNextDate,
      appointmentTime: _recurringSmsTime,
      recurringMessageTemplateIds: List<String>.from(_recurringTemplateIds),
      staffId: _mainStaffId.trim(),
      helpers: helpersApiPayload(_helpers),
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
      final amount = double.tryParse(_amtCtrl.text.trim()) ?? 0;
      final ref = 'WI-${DateTime.now().millisecondsSinceEpoch}';
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

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: const TextStyle(
                color: _pMuted,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5)),
      );

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final activeServices = servicesForPackagePicker(
      widget.services,
      _orderedSelectedServiceIds(),
    );
    final name = widget.customerName;
    final initials = name.trim().isNotEmpty
        ? name.trim().split(' ').map((e) => e.isNotEmpty ? e[0].toUpperCase() : '').take(2).join()
        : '?';

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
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: _pGreenL,
                    borderRadius: BorderRadius.circular(11),
                    border: Border.all(color: _pGreenB),
                  ),
                  child: const Icon(Icons.payments_rounded,
                      color: _pGreen, size: 18),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Collect Payment',
                          style: TextStyle(
                              color: _pInk,
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.2)),
                      Text('Walk-in payment',
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
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.close_rounded,
                        size: 16, color: _pMuted),
                  ),
                ),
              ]),

              const SizedBox(height: 16),

              if (name.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: _pGreenL,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: _pGreenB),
                  ),
                  child: Row(children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          colors: [_pDark, _pGreen],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(initials,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.w800)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name,
                              style: const TextStyle(
                                  color: _pInk,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800)),
                          if (widget.serviceName.isNotEmpty)
                            Text(widget.serviceName,
                                style: const TextStyle(
                                    color: _pMuted, fontSize: 12.5)),
                        ],
                      ),
                    ),
                  ]),
                ),

              const SizedBox(height: 18),

              PaymentHelperStaffSection(
                staffOptions: widget.staff,
                mainStaffId: _mainStaffId,
                helpers: _helpers,
                onMainStaffChanged: (id) => setState(() {
                  _mainStaffId = id;
                  _helpers = _helpers.where((h) => h.staffId != id).toList();
                }),
                onHelpersChanged: (rows) => setState(() => _helpers = rows),
              ),

              const SizedBox(height: 18),

              Builder(builder: (_) {
                final pkgLocked =
                    _packageOfferPrice != null && _packageOfferPrice! > 0;
                if (!pkgLocked) _syncServicePriceCtrls();
                return WalkInServiceDropdownSection(
                key: ValueKey(
                  'walkin_svc_${_orderedSelectedServiceIds().join(',')}',
                ),
                activeServices: activeServices,
                primaryServiceId: _primaryServiceId,
                orderedServiceIds: _orderedSelectedServiceIds(),
                pricesEditable: !pkgLocked,
                priceControllers: pkgLocked ? null : _servicePriceCtrls,
                onPriceEdited: pkgLocked ? null : _onServicePriceEdited,
                onPrimaryChanged: _onPrimaryDropdownChanged,
                onAddExtra: _onAddExtraFromDropdown,
                onRemoveExtraAt: _removeExtraAt,
                label: 'SERVICES',
                helperText:
                    'Select services and set each price on the right.',
                accentColor: _pGreen,
                borderColor: _pBorder,
                bgColor: _pBg,
                mutedColor: _pMuted,
              );
              }),

              const SizedBox(height: 18),
              _label('DISCOUNT'),
              DropdownButtonFormField<String>(
                  key: ValueKey<String>('walkin_promo_$_discountId'),
                  initialValue: _discountId.isEmpty
                      ? ''
                      : widget.discounts.any((d) => '${d['id']}' == _discountId)
                          ? _discountId
                          : '',
                  isExpanded: true,
                  decoration: InputDecoration(
                    hintText: 'Select promo (optional)',
                    hintStyle:
                        const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
                    prefixIcon:
                        const Icon(Icons.local_offer_rounded, color: _pGreen, size: 19),
                    filled: true,
                    fillColor: _pBg,
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: _pBorder),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: _pBorder),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: _pGreen, width: 1.8),
                    ),
                  ),
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
                    setState(() => _discountId = v ?? '');
                    _syncAmountFromServices(resetTotalFromCatalog: false);
                  },
                ),

              const SizedBox(height: 18),

              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: _pGreenL,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _pGreenB),
                ),
                child: Row(
                  children: [
                    const Text(
                      'Bill total',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF065F46),
                      ),
                    ),
                    const Spacer(),
                    Text(
                      'LKR ${_totalCtrl.text.trim().isEmpty ? '—' : _totalCtrl.text.trim()}',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: _pGreen,
                      ),
                    ),
                  ],
                ),
              ),
              // Keep controller in form tree for validation / submit.
              Offstage(
                offstage: true,
                child: TextFormField(
                  controller: _totalCtrl,
                  validator: (v) {
                    if (_orderedSelectedServiceIds().isEmpty) {
                      return 'Select a service';
                    }
                    if (v == null || v.trim().isEmpty) return 'Required';
                    if ((double.tryParse(v.trim()) ?? 0) <= 0) {
                      return 'Enter a valid amount';
                    }
                    return null;
                  },
                ),
              ),

              const SizedBox(height: 14),

              _label('COLLECT / PAID (LKR)'),
              TextFormField(
                controller: _amtCtrl,
                keyboardType: TextInputType.number,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: _pInk,
                ),
                decoration: InputDecoration(
                  hintText: '0',
                  hintStyle:
                      const TextStyle(color: Color(0xFFB0B8B0), fontSize: 18),
                  prefixIcon: const Icon(Icons.account_balance_wallet_rounded,
                      color: _pGreen, size: 20),
                  filled: true,
                  fillColor: _pBg,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: _pBorder),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: _pBorder),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: _pGreen, width: 1.8),
                  ),
                  focusedErrorBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: _pGreen, width: 1.8),
                  ),
                  errorBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFFF43F5E)),
                  ),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) {
                    return 'Amount required';
                  }
                  if ((double.tryParse(v.trim()) ?? 0) <= 0) {
                    return 'Enter a valid amount';
                  }
                  return null;
                },
              ),

              const SizedBox(height: 16),

              if (widget.customerId.trim().isNotEmpty) ...[
                _label('PACKAGE'),
                if (_loadingPackages || _linkingPackage)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(children: [
                      const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: _pGreen,
                        ),
                      ),
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
                else
                  DropdownButtonFormField<String>(
                    key: ValueKey(
                      'walkin_pkgs_${widget.customerId}_${_packageTemplates.length}_$_selectedTemplateId',
                    ),
                    initialValue: safePackageTemplateDropdownValue(
                      _selectedTemplateId,
                      _packageTemplates,
                    ),
                    isExpanded: true,
                    decoration: InputDecoration(
                      hintText: _packageTemplates.isEmpty
                          ? 'No packages — create one on web first'
                          : 'Select package (optional)',
                      prefixIcon: const Icon(Icons.card_giftcard_rounded,
                          color: _pGreen, size: 19),
                      filled: true,
                      fillColor: _pBg,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: _pBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: _pBorder),
                      ),
                    ),
                    items: [
                      DropdownMenuItem(
                        value: '',
                        child: Text(
                          _packageTemplates.isEmpty
                              ? 'No packages available'
                              : 'No package — pay normally',
                        ),
                      ),
                      ..._packageTemplates.map((pkg) {
                        return DropdownMenuItem<String>(
                          value: '${pkg['id']}',
                          child: Text(
                            formatPackageTemplateLabel(pkg),
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }),
                    ],
                    onChanged: _packageTemplates.isEmpty
                        ? null
                        : (v) => _applyTemplate(v ?? ''),
                  ),
                const SizedBox(height: 16),
              ],

              _label('PAYMENT METHOD'),
              Wrap(
                spacing: 7,
                runSpacing: 7,
                children: _methods.map((m) {
                  final sel = _method == m;
                  return GestureDetector(
                    onTap: () {
                      setState(() => _method = m);
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
                          width: sel ? 1.5 : 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _methodIcons[m] ?? Icons.payments_rounded,
                            size: 14,
                            color: sel ? _pGreen : const Color(0xFF9CA3AF),
                          ),
                          const SizedBox(width: 6),
                          Text(m,
                              style: TextStyle(
                                color: sel
                                    ? _pGreen
                                    : const Color(0xFF6B7280),
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              )),
                        ],
                      ),
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

              const SizedBox(height: 24),

              Container(
                  height: 1,
                  color: _pBorder,
                  margin: const EdgeInsets.only(bottom: 20)),

              GestureDetector(
                onTap: _submit,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [_pDark, _pGreen],
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                    ),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: _pGreen.withValues(alpha: 0.30),
                        blurRadius: 14,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.check_circle_rounded,
                          color: Colors.white, size: 18),
                      SizedBox(width: 9),
                      Text(
                        'Confirm Payment',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
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
