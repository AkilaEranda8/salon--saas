import 'package:flutter/material.dart';

import '../models/salon_service.dart';
import '../services/mobile_api.dart';
import 'helapay_qr_screen.dart';
import '../widgets/walk_in_service_dropdown_section.dart';

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
}

// ─────────────────────────────────────────────────────────────────────────────
class AddWalkInPaymentModal extends StatefulWidget {
  const AddWalkInPaymentModal({
    required this.initialAmount,
    required this.services,
    required this.selectedServiceIds,
    this.customerName = '',
    this.serviceName = '',
    this.discounts = const [],
    this.mobileApi,
    this.token = '',
    super.key,
  });

  final String initialAmount;
  final List<SalonService> services;
  /// Walk-in lines to pre-select; user may add more (additional services).
  final List<String> selectedServiceIds;
  final String customerName;
  final String serviceName;
  final List<Map<String, dynamic>> discounts;
  final MobileApi? mobileApi;
  final String token;

  static Future<AddWalkInPaymentModalResult?> show(
    BuildContext context, {
    required String initialAmount,
    required List<SalonService> services,
    required List<String> selectedServiceIds,
    String customerName = '',
    String serviceName = '',
    List<Map<String, dynamic>> discounts = const [],
    MobileApi? mobileApi,
    String token = '',
  }) {
    return showModalBottomSheet<AddWalkInPaymentModalResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AddWalkInPaymentModal(
        initialAmount: initialAmount,
        services: services,
        selectedServiceIds: selectedServiceIds,
        customerName: customerName,
        serviceName: serviceName,
        discounts: discounts,
        mobileApi: mobileApi,
        token: token,
      ),
    );
  }

  @override
  State<AddWalkInPaymentModal> createState() =>
      _AddWalkInPaymentModalState();
}

class _AddWalkInPaymentModalState extends State<AddWalkInPaymentModal> {
  static const _methods = [
    'Cash', 'Card', 'Online Transfer', 'LankaQR', 'Loyalty Points', 'Package',
  ];
  static const _methodIcons = <String, IconData>{
    'Cash':            Icons.payments_rounded,
    'Card':            Icons.credit_card_rounded,
    'Online Transfer': Icons.account_balance_rounded,
    'LankaQR':         Icons.qr_code_rounded,
    'Loyalty Points':  Icons.stars_rounded,
    'Package':         Icons.card_giftcard_rounded,
  };

  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _amtCtrl;
  String _method = 'Cash';
  String _discountId = '';

  String? _primaryServiceId;
  final List<String> _extraServiceIds = [];

  @override
  void initState() {
    super.initState();
    _hydrateSelection();
    _amtCtrl = TextEditingController(text: '0');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncAmountFromServices();
    });
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
    final total = _totalSelectedAmount();
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

  void _syncAmountFromServices() {
    if (_orderedSelectedServiceIds().isEmpty) {
      _amtCtrl.text = '0';
      return;
    }
    final gross = _totalSelectedAmount();
    final promo = _computedPromo();
    final net = (gross - promo).clamp(0, double.infinity);
    _amtCtrl.text = net > 0 ? net.toStringAsFixed(0) : '';
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
    _amtCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_orderedSelectedServiceIds().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one service')),
      );
      return;
    }
    final gross  = _totalSelectedAmount();
    final promo  = _computedPromo();
    final result = AddWalkInPaymentModalResult(
      method:          _method,
      amount:          _amtCtrl.text.trim(),
      subtotal:        gross > 0 ? gross.toStringAsFixed(0) : '0',
      discountId:      _discountId,
      serviceIds:      List<String>.from(_orderedSelectedServiceIds()),
      loyaltyDiscount: '0',
      promoDiscount:   promo.toStringAsFixed(2),
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
    final activeServices = widget.services.where((s) => s.isActive).toList();
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

              WalkInServiceDropdownSection(
                activeServices: activeServices,
                primaryServiceId: _primaryServiceId,
                orderedServiceIds: _orderedSelectedServiceIds(),
                onPrimaryChanged: _onPrimaryDropdownChanged,
                onAddExtra: _onAddExtraFromDropdown,
                onRemoveExtraAt: _removeExtraAt,
                label: 'SERVICES (ADDITIONAL ALLOWED)',
                helperText:
                    'Primary + extra lines; same service can be added multiple times. Amount follows prices and promo.',
                accentColor: _pGreen,
                borderColor: _pBorder,
                bgColor: _pBg,
                mutedColor: _pMuted,
              ),

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
                    _syncAmountFromServices();
                  },
                ),

              const SizedBox(height: 18),

              _label('PAID (LKR)'),
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

              _label('PAYMENT METHOD'),
              Wrap(
                spacing: 7,
                runSpacing: 7,
                children: _methods.map((m) {
                  final sel = _method == m;
                  return GestureDetector(
                    onTap: () => setState(() => _method = m),
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
