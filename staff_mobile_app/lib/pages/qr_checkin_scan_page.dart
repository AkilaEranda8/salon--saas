import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../models/walkin_entry.dart';
import '../state/app_state.dart';
import '../utils/appointment_notes.dart';
import 'add_walkin_modal.dart';
import 'add_walkin_payment_modal.dart';
import 'customer_history_page.dart';
import 'walkin_page.dart';

// ── Design ───────────────────────────────────────────────────────────────────
const _ink = Color(0xFF0B1220);
const _forest = Color(0xFF16382C);
const _emerald = Color(0xFF1F7A55);
const _mint = Color(0xFF34D399);
const _muted = Color(0xFF94A3B8);
const _line = Color(0xFFE8EDF2);
const _sheet = Color(0xFFF8FAFC);

/// Immersive staff scanner for customer check-in QR codes.
class QrCheckInScanPage extends StatefulWidget {
  const QrCheckInScanPage({super.key});

  @override
  State<QrCheckInScanPage> createState() => _QrCheckInScanPageState();
}

class _QrCheckInScanPageState extends State<QrCheckInScanPage>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  late final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    facing: CameraFacing.back,
    torchEnabled: false,
    formats: const [BarcodeFormat.qrCode],
  );

  late final AnimationController _scanPulse;
  late final AnimationController _sheetCtrl;

  bool _busy = false;
  bool _torchOn = false;
  String? _lastCode;
  Map<String, dynamic>? _result;
  String? _error;
  /// Last walk-in created from this scan — used to take linked payment.
  WalkInEntry? _lastWalkIn;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
    );
    _scanPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);
    _sheetCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
      value: 1,
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scanPulse.dispose();
    _sheetCtrl.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!mounted || _result != null) return;
    if (state == AppLifecycleState.resumed) {
      _controller.start().catchError((_) {});
      if (!_scanPulse.isAnimating) _scanPulse.repeat(reverse: true);
    } else if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      _controller.stop().catchError((_) {});
    }
  }

  Future<void> _toggleTorch() async {
    try {
      await _controller.toggleTorch();
      if (mounted) setState(() => _torchOn = !_torchOn);
    } catch (_) {}
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_busy || _result != null) return;
    final raw = capture.barcodes
        .map((b) => b.rawValue?.trim() ?? '')
        .firstWhere((v) => v.isNotEmpty, orElse: () => '');
    if (raw.isEmpty || raw == _lastCode) return;

    final looksLikeCheckIn = raw.startsWith('HEXAONE_CI.') ||
        raw.startsWith('eyJ') ||
        raw.contains('HEXAONE_CI.');
    if (!looksLikeCheckIn) {
      setState(() {
        _error =
            'Not a Hexaone check-in QR. Open the customer app check-in screen.';
      });
      return;
    }

    final app = AppStateScope.of(context);
    final token = app.currentUser?.authToken?.trim() ?? '';
    if (token.isEmpty) {
      setState(() => _error = 'Not signed in.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _lastCode = raw;
    });

    try {
      await _controller.stop();
      HapticFeedback.mediumImpact();
      final resolved = await app.api.resolveCustomerQr(token: token, code: raw);
      if (!mounted) return;

      // Enrich with full customer profile when CRM id is present.
      final cust = resolved['customer'];
      if (cust is Map) {
        final id = '${cust['id'] ?? ''}'.trim();
        if (id.isNotEmpty && id != 'null') {
          try {
            final detail = await app.api.fetchCustomerDetail(
              token: token,
              customerId: id,
            );
            resolved['customer'] = {
              ...Map<String, dynamic>.from(cust),
              ...detail,
              'id': detail['id'] ?? cust['id'],
              'name': detail['name'] ?? cust['name'],
              'phone': detail['phone'] ?? cust['phone'],
              'loyalty_points':
                  detail['loyalty_points'] ?? cust['loyalty_points'] ?? 0,
            };
          } catch (_) {}
        }
      }

      _scanPulse.stop();
      setState(() {
        _result = resolved;
        _lastWalkIn = null;
        _busy = false;
      });
      await _sheetCtrl.forward(from: 0);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceFirst('Exception: ', '');
        _result = null;
      });
      await Future<void>.delayed(const Duration(milliseconds: 1100));
      if (mounted) {
        _lastCode = null;
        await _controller.start().catchError((_) {});
      }
    }
  }

  Future<void> _checkIn({int? appointmentId}) async {
    final code = _lastCode;
    if (code == null || code.isEmpty) return;
    final app = AppStateScope.of(context);
    final token = app.currentUser?.authToken?.trim() ?? '';
    if (token.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final body = await app.api.checkInCustomerQr(
        token: token,
        code: code,
        appointmentId: appointmentId,
      );
      if (!mounted) return;
      setState(() {
        _result = {
          ...?_result,
          ...body,
          if (body['appointments'] != null) 'appointments': body['appointments'],
          if (body['customer'] != null) 'customer': body['customer'],
        };
        _busy = false;
      });
      HapticFeedback.lightImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: _emerald,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          content: const Text('Checked in successfully'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _scanAgain() async {
    setState(() {
      _result = null;
      _error = null;
      _lastCode = null;
      _busy = false;
      _torchOn = false;
      _lastWalkIn = null;
    });
    _scanPulse.repeat(reverse: true);
    await _controller.start().catchError((_) {});
  }

  Map<String, dynamic>? get _customerMap {
    final c = _result?['customer'];
    return c is Map ? Map<String, dynamic>.from(c) : null;
  }

  void _openHistory() {
    final customer = _customerMap;
    if (customer == null) return;
    final id = '${customer['id'] ?? ''}'.trim();
    if (id.isEmpty || id == 'null') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No customer record linked to this QR yet.')),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CustomerHistoryPage(
          customer: Customer(
            id: id,
            name: '${customer['name'] ?? 'Customer'}',
            phone: '${customer['phone'] ?? ''}',
            email: '${customer['email'] ?? ''}',
          ),
        ),
      ),
    );
  }

  Future<void> _openNewWalkIn() async {
    final customer = _customerMap;
    if (customer == null) return;
    final app = AppStateScope.of(context);
    final token = app.currentUser?.authToken ?? '';
    final uid = app.currentUser?.branchId;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      var branches = <Map<String, String>>[];
      try {
        branches = (uid == null || uid.isEmpty)
            ? await app.loadBranches()
            : [
                {'id': uid, 'name': 'My Branch'},
              ];
      } catch (_) {}
      if (!mounted) return;
      if (branches.isEmpty) {
        setState(() {
          _busy = false;
          _error = 'No branches available for walk-in.';
        });
        return;
      }

      var services = List<SalonService>.from(app.services);
      if (services.isEmpty) {
        try {
          await app.loadServices();
          services = List<SalonService>.from(app.services);
        } catch (_) {}
      }
      if (!mounted) return;

      var customers = List<Customer>.from(app.customers);
      if (customers.isEmpty) {
        try {
          customers = await app.loadCustomers();
        } catch (_) {}
      }
      if (!mounted) return;

      setState(() => _busy = false);

      final custId = '${customer['id'] ?? ''}'.trim();
      final payload = await AddWalkInModal.show(
        context,
        branches: branches,
        services: services,
        customers: customers,
        initialBranchId: uid,
        initialCustomerId: (custId.isEmpty || custId == 'null') ? '' : custId,
        initialCustomerName: '${customer['name'] ?? ''}',
        initialPhone: '${customer['phone'] ?? ''}',
        mobileApi: app.api,
        token: token,
        onRegisterNewCustomer: (name, phone, branchId) =>
            AppStateScope.of(context).registerCustomer(
              name: name,
              phone: phone,
              branchId: branchId,
            ),
      );
      if (payload == null || !mounted) return;

      setState(() => _busy = true);
      final created = await app.addWalkIn(
        branchId: payload.branchId,
        customerName: payload.customerName,
        serviceId: payload.serviceId,
        serviceIds: payload.serviceIds,
        phone: payload.phone,
        note: payload.note,
        customerId: payload.customerId.isEmpty ? null : payload.customerId,
        customerPackageId: payload.customerPackageId.isEmpty
            ? null
            : payload.customerPackageId,
      );
      if (!mounted) return;
      if (created == null) {
        setState(() {
          _busy = false;
          _error = app.lastError ?? 'Could not create walk-in.';
        });
        return;
      }

      setState(() {
        _busy = false;
        _lastWalkIn = created;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: _emerald,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          content: const Text('Walk-in added — take payment if needed'),
        ),
      );

      // Linked payment for this walk-in (optional — cancel keeps managing here).
      await _collectPayment(walkIn: created);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _openPaymentOnly() => _collectPayment(walkIn: _lastWalkIn);

  Future<void> _collectPayment({WalkInEntry? walkIn}) async {
    final customer = _customerMap;
    if (customer == null && walkIn == null) return;
    final app = AppStateScope.of(context);
    final token = app.currentUser?.authToken ?? '';
    final bid = (walkIn?.branchId.trim().isNotEmpty == true
            ? walkIn!.branchId.trim()
            : (app.currentUser?.branchId ?? '').trim());

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      var services = List<SalonService>.from(app.services);
      if (services.isEmpty) {
        try {
          await app.loadServices();
          services = List<SalonService>.from(app.services);
        } catch (_) {}
      }
      if (!mounted) return;
      if (services.isEmpty) {
        setState(() {
          _busy = false;
          _error = 'No services available for payment.';
        });
        return;
      }

      var staff = <StaffMember>[];
      try {
        staff = await app.loadStaffList(branchId: bid.isEmpty ? null : bid);
      } catch (_) {}
      final discounts = bid.isNotEmpty
          ? await app.loadDiscountsForPayment(bid)
          : const <Map<String, dynamic>>[];
      if (!mounted) return;

      setState(() => _busy = false);

      final custId = (walkIn != null && walkIn.customerId.trim().isNotEmpty)
          ? walkIn.customerId.trim()
          : '${customer?['id'] ?? ''}'.trim();
      final custName = (walkIn != null && walkIn.customerName.trim().isNotEmpty)
          ? walkIn.customerName.trim()
          : '${customer?['name'] ?? ''}';
      final phone = (walkIn != null && walkIn.phone.trim().isNotEmpty)
          ? walkIn.phone.trim()
          : '${customer?['phone'] ?? ''}';

      final preIds = walkIn?.orderedServiceIds ?? const <String>[];
      final selectedForModal = preIds.isNotEmpty
          ? preIds
          : (walkIn != null && walkIn.serviceId.isNotEmpty
              ? [walkIn.serviceId]
              : <String>[]);
      final initialPay = walkIn != null && walkIn.totalAmount > 0
          ? walkIn.totalAmount.toStringAsFixed(0)
          : '';

      final payload = await AddWalkInPaymentModal.show(
        context,
        customerName: custName,
        customerId: (custId.isEmpty || custId == 'null') ? '' : custId,
        serviceName: walkIn?.serviceName ?? '',
        initialAmount: initialPay,
        initialNote: walkIn?.note ?? '',
        initialCustomerPackageId: walkIn != null
            ? (AppointmentNotes.parsePackageId(walkIn.note) ?? '')
            : '',
        services: services,
        selectedServiceIds: selectedForModal,
        staff: staff,
        initialStaffId: walkIn?.staffId ?? '',
        discounts: discounts,
        mobileApi: app.api,
        token: token,
        branchId: bid.isEmpty ? null : bid,
        recurringAllowed: app.recurringAllowed,
      );
      if (payload == null || !mounted) return;

      final payIds = payload.serviceIds;
      if (payIds.isEmpty) {
        setState(() => _error = 'Select at least one service for payment.');
        return;
      }
      if (bid.isEmpty) {
        setState(() => _error = 'Branch is required for payment.');
        return;
      }

      setState(() => _busy = true);
      final ok = await app.addManualPayment(
        branchId: bid,
        serviceId: payIds.first,
        serviceIds: payIds.length > 1 ? payIds : null,
        staffId: payload.staffId.isEmpty ? null : payload.staffId,
        helpers: payload.helpers.isEmpty ? null : payload.helpers,
        customerId: (custId.isEmpty || custId == 'null') ? null : custId,
        customerName: custName,
        phone: phone.trim().isEmpty ? null : phone.trim(),
        walkinToken: (walkIn?.token.trim().isNotEmpty == true)
            ? walkIn!.token.trim()
            : null,
        totalAmount: payload.subtotal,
        loyaltyDiscount: payload.loyaltyDiscount,
        promoDiscount: payload.promoDiscount,
        method: payload.method,
        paidAmount: payload.amount,
        discountId: payload.discountId.isNotEmpty ? payload.discountId : null,
        customerPackageId: payload.customerPackageId.isEmpty
            ? null
            : payload.customerPackageId,
        isRecurring: payload.isRecurring,
        recurringNextDate:
            payload.isRecurring ? payload.recurringNextDate : null,
        appointmentTime: payload.isRecurring ? payload.appointmentTime : null,
        recurringMessageTemplateIds:
            payload.isRecurring ? payload.recurringMessageTemplateIds : null,
      );
      if (!mounted) return;
      setState(() => _busy = false);
      if (!ok) {
        setState(() => _error = app.lastError ?? 'Payment failed.');
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: _emerald,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          content: Text(
            walkIn != null ? 'Walk-in payment recorded' : 'Payment recorded',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _openQueue() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const WalkInPage()),
    );
  }

  List<Map<String, dynamic>> get _appointments {
    final raw = _result?['appointments'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '?';
    final list = parts.take(2).map((p) => p[0].toUpperCase()).join();
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.paddingOf(context).top;
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    final customer = _result?['customer'];
    final name = customer is Map ? '${customer['name'] ?? 'Customer'}' : '';
    final phone = customer is Map ? '${customer['phone'] ?? ''}' : '';
    final points = customer is Map
        ? int.tryParse('${customer['loyalty_points'] ?? 0}') ?? 0
        : 0;
    final checkedIn = _result?['checked_in'] == true;
    final appointments = _appointments;
    final hasPending = appointments.any((a) => '${a['status']}' == 'pending');
    final scanning = _result == null;

    return Scaffold(
      backgroundColor: _ink,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Camera / success backdrop
          if (scanning)
            MobileScanner(
              controller: _controller,
              onDetect: _onDetect,
              errorBuilder: (context, error, child) {
                return _CameraError(
                  message: error.errorCode == MobileScannerErrorCode.permissionDenied
                      ? 'Camera access is needed to scan check-in codes. Enable it in Settings.'
                      : (error.errorDetails?.message ??
                          'Camera unavailable. Retry or restart the app.'),
                  onRetry: () => _controller.start().catchError((_) {}),
                );
              },
            )
          else
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    _forest,
                    _ink.withValues(alpha: 0.95),
                    _ink,
                  ],
                ),
              ),
            ),

          if (scanning) ...[
            // Dim vignette + animated frame
            AnimatedBuilder(
              animation: _scanPulse,
              builder: (context, _) {
                return CustomPaint(
                  painter: _ScanOverlayPainter(pulse: _scanPulse.value),
                );
              },
            ),
            if (_busy)
              const ColoredBox(
                color: Color(0x73000000),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(color: _mint, strokeWidth: 2.5),
                      SizedBox(height: 14),
                      Text(
                        'Identifying customer…',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],

          // Top chrome
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: EdgeInsets.fromLTRB(8, topPad + 6, 8, 14),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.55),
                    Colors.black.withValues(alpha: 0),
                  ],
                ),
              ),
              child: Row(
                children: [
                  _RoundIconBtn(
                    icon: Icons.arrow_back_ios_new_rounded,
                    onTap: () => Navigator.of(context).maybePop(),
                  ),
                  const Expanded(
                    child: Column(
                      children: [
                        Text(
                          'Check-in scan',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.2,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Align QR inside the frame',
                          style: TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  if (scanning)
                    _RoundIconBtn(
                      icon: _torchOn
                          ? Icons.flash_on_rounded
                          : Icons.flash_off_rounded,
                      active: _torchOn,
                      onTap: _busy ? null : _toggleTorch,
                    )
                  else
                    _RoundIconBtn(
                      icon: Icons.qr_code_scanner_rounded,
                      onTap: _busy ? null : _scanAgain,
                    ),
                ],
              ),
            ),
          ),

          // Bottom sheet
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, 0.12),
                end: Offset.zero,
              ).animate(CurvedAnimation(
                parent: _sheetCtrl,
                curve: Curves.easeOutCubic,
              )),
              child: FadeTransition(
                opacity: _sheetCtrl,
                child: Container(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(context).height * 0.58,
                  ),
                  decoration: const BoxDecoration(
                    color: _sheet,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                    boxShadow: [
                      BoxShadow(
                        color: Color(0x40000000),
                        blurRadius: 28,
                        offset: Offset(0, -8),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(height: 10),
                      Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: _line,
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                      Flexible(
                        child: ListView(
                          shrinkWrap: true,
                          padding: EdgeInsets.fromLTRB(20, 16, 20, 18 + bottomPad),
                          children: [
                            if (_error != null) ...[
                              _ErrorBanner(text: _error!),
                              const SizedBox(height: 14),
                            ],
                            if (scanning) ...[
                              const Text(
                                'Ready to scan',
                                style: TextStyle(
                                  color: _ink,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.4,
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Point at the customer app QR or a printable check-in code from the web Customers page.',
                                style: TextStyle(
                                  color: _muted,
                                  height: 1.45,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 18),
                              Row(
                                children: [
                                  Expanded(
                                    child: _HintTile(
                                      icon: Icons.phone_iphone_rounded,
                                      title: 'Customer app',
                                      body: 'Live QR on phone',
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _HintTile(
                                      icon: Icons.print_rounded,
                                      title: 'Printable',
                                      body: 'Web download QR',
                                    ),
                                  ),
                                ],
                              ),
                            ] else ...[
                              // Success / customer header
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    width: 58,
                                    height: 58,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      gradient: const LinearGradient(
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                        colors: [_forest, _emerald],
                                      ),
                                      borderRadius: BorderRadius.circular(18),
                                    ),
                                    child: Text(
                                      _initials(name.isEmpty ? 'C' : name),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 20,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          name.isEmpty ? 'Customer found' : name,
                                          style: const TextStyle(
                                            color: _ink,
                                            fontSize: 20,
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: -0.3,
                                          ),
                                        ),
                                        if (phone.isNotEmpty) ...[
                                          const SizedBox(height: 3),
                                          Text(
                                            phone,
                                            style: const TextStyle(
                                              color: _muted,
                                              fontSize: 14,
                                            ),
                                          ),
                                        ],
                                        const SizedBox(height: 10),
                                        Wrap(
                                          spacing: 8,
                                          runSpacing: 8,
                                          children: [
                                            _Pill(
                                              icon: Icons.stars_rounded,
                                              label: '$points pts',
                                              fg: const Color(0xFF9A6B3F),
                                              bg: const Color(0xFFFFF4E8),
                                            ),
                                            if (checkedIn)
                                              const _Pill(
                                                icon: Icons.verified_rounded,
                                                label: 'Checked in',
                                                fg: Color(0xFF047857),
                                                bg: Color(0xFFD1FAE5),
                                              ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              const Text(
                                'Manage customer',
                                style: TextStyle(
                                  color: _ink,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                hasPending
                                    ? 'Pending booking found — you can still add a walk-in or take payment.'
                                    : 'Walk-in, payment, and profile from this scan.',
                                style: const TextStyle(
                                  color: _muted,
                                  fontSize: 12.5,
                                  height: 1.35,
                                ),
                              ),
                              const SizedBox(height: 12),
                              SizedBox(
                                width: double.infinity,
                                height: 52,
                                child: FilledButton.icon(
                                  onPressed: _busy ? null : _openNewWalkIn,
                                  icon: const Icon(Icons.directions_walk_rounded),
                                  label: const Text(
                                    'New walk-in',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 15,
                                    ),
                                  ),
                                  style: FilledButton.styleFrom(
                                    backgroundColor: _emerald,
                                    foregroundColor: Colors.white,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    elevation: 0,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  Expanded(
                                    child: _GhostBtn(
                                      icon: Icons.payments_rounded,
                                      label: _lastWalkIn != null
                                          ? 'Pay walk-in'
                                          : 'Payment',
                                      onTap: _busy ? null : _openPaymentOnly,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _GhostBtn(
                                      icon: Icons.person_rounded,
                                      label: 'Profile',
                                      onTap: _busy ? null : _openHistory,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              SizedBox(
                                width: double.infinity,
                                child: _GhostBtn(
                                  icon: Icons.queue_rounded,
                                  label: 'Open walk-in queue',
                                  onTap: _busy ? null : _openQueue,
                                ),
                              ),
                              if (_lastWalkIn != null) ...[
                                const SizedBox(height: 10),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFECFDF5),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                      color: const Color(0xFFA7F3D0),
                                    ),
                                  ),
                                  child: Text(
                                    'Walk-in queued: ${_lastWalkIn!.serviceName.isEmpty ? 'Service' : _lastWalkIn!.serviceName}',
                                    style: const TextStyle(
                                      color: Color(0xFF047857),
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 20),
                              Row(
                                children: [
                                  Text(
                                    appointments.isEmpty
                                        ? 'No visits today'
                                        : 'Today · ${appointments.length}',
                                    style: const TextStyle(
                                      color: _ink,
                                      fontSize: 15,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const Spacer(),
                                  if (!scanning)
                                    TextButton(
                                      onPressed: _busy ? null : _scanAgain,
                                      child: const Text(
                                        'Scan again',
                                        style: TextStyle(
                                          color: _emerald,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              if (appointments.isEmpty)
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(color: _line),
                                  ),
                                  child: const Text(
                                    'No booking for today. Use New walk-in to add this guest to the queue.',
                                    style: TextStyle(color: _muted, height: 1.4),
                                  ),
                                )
                              else
                                ...appointments.map((a) {
                                  final id = int.tryParse('${a['id'] ?? ''}');
                                  final service = a['service'];
                                  final serviceName = service is Map
                                      ? '${service['name'] ?? 'Service'}'
                                      : 'Service';
                                  final timeRaw = '${a['time'] ?? ''}';
                                  final time = timeRaw.length >= 5
                                      ? timeRaw.substring(0, 5)
                                      : timeRaw;
                                  final status = '${a['status'] ?? ''}';
                                  final branch = a['branch'];
                                  final branchName = branch is Map
                                      ? '${branch['name'] ?? ''}'
                                      : '';
                                  final canCheckIn =
                                      status == 'pending' && id != null;
                                  final arrived = status == 'confirmed' ||
                                      status == 'in_service';

                                  return Container(
                                    margin: const EdgeInsets.only(bottom: 10),
                                    padding: const EdgeInsets.fromLTRB(
                                      14,
                                      14,
                                      10,
                                      14,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(color: _line),
                                    ),
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 42,
                                          height: 42,
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFECFDF5),
                                            borderRadius:
                                                BorderRadius.circular(12),
                                          ),
                                          child: const Icon(
                                            Icons.content_cut_rounded,
                                            color: _emerald,
                                            size: 20,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                serviceName,
                                                style: const TextStyle(
                                                  color: _ink,
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                              const SizedBox(height: 3),
                                              Text(
                                                [
                                                  if (time.isNotEmpty) time,
                                                  if (branchName.isNotEmpty)
                                                    branchName,
                                                  status.replaceAll('_', ' '),
                                                ].join(' · '),
                                                style: const TextStyle(
                                                  color: _muted,
                                                  fontSize: 12.5,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        if (canCheckIn)
                                          TextButton(
                                            onPressed: _busy
                                                ? null
                                                : () => _checkIn(
                                                      appointmentId: id,
                                                    ),
                                            child: const Text(
                                              'Check in',
                                              style: TextStyle(
                                                color: _emerald,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                          )
                                        else if (arrived)
                                          const Padding(
                                            padding: EdgeInsets.only(right: 8),
                                            child: _Pill(
                                              icon: Icons.check_rounded,
                                              label: 'Arrived',
                                              fg: Color(0xFF047857),
                                              bg: Color(0xFFD1FAE5),
                                            ),
                                          ),
                                      ],
                                    ),
                                  );
                                }),
                              if (hasPending) ...[
                                const SizedBox(height: 6),
                                SizedBox(
                                  width: double.infinity,
                                  height: 52,
                                  child: FilledButton(
                                    onPressed:
                                        _busy ? null : () => _checkIn(),
                                    style: FilledButton.styleFrom(
                                      backgroundColor: _emerald,
                                      foregroundColor: Colors.white,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(16),
                                      ),
                                      elevation: 0,
                                    ),
                                    child: _busy
                                        ? const SizedBox(
                                            width: 22,
                                            height: 22,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2.2,
                                              color: Colors.white,
                                            ),
                                          )
                                        : const Text(
                                            'Check in first appointment',
                                            style: TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15,
                                            ),
                                          ),
                                  ),
                                ),
                              ],
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Overlay painter ──────────────────────────────────────────────────────────

class _ScanOverlayPainter extends CustomPainter {
  _ScanOverlayPainter({required this.pulse});
  final double pulse;

  @override
  void paint(Canvas canvas, Size size) {
    final side = math.min(size.width, size.height) * 0.62;
    final rect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height * 0.38),
      width: side,
      height: side,
    );

    final dim = Path()
      ..addRect(Offset.zero & size)
      ..addRRect(RRect.fromRectAndRadius(rect, const Radius.circular(28)))
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(
      dim,
      Paint()..color = const Color(0x99000000),
    );

    // Soft glow ring
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect.inflate(2 + pulse * 4), const Radius.circular(30)),
      Paint()
        ..color = _mint.withValues(alpha: 0.12 + pulse * 0.1)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10,
    );

    final cornerPaint = Paint()
      ..color = Color.lerp(Colors.white, _mint, pulse)!
      ..strokeWidth = 4.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    const len = 34.0;
    void corner(Offset a, Offset b, Offset c) {
      canvas.drawLine(a, b, cornerPaint);
      canvas.drawLine(a, c, cornerPaint);
    }

    corner(rect.topLeft, rect.topLeft + const Offset(len, 0),
        rect.topLeft + const Offset(0, len));
    corner(rect.topRight, rect.topRight + const Offset(-len, 0),
        rect.topRight + const Offset(0, len));
    corner(rect.bottomLeft, rect.bottomLeft + const Offset(len, 0),
        rect.bottomLeft + const Offset(0, -len));
    corner(rect.bottomRight, rect.bottomRight + const Offset(-len, 0),
        rect.bottomRight + const Offset(0, -len));

    // Sweep line
    final y = rect.top + 18 + (rect.height - 36) * pulse;
    final linePaint = Paint()
      ..shader = LinearGradient(
        colors: [
          _mint.withValues(alpha: 0),
          _mint.withValues(alpha: 0.95),
          _mint.withValues(alpha: 0),
        ],
      ).createShader(Rect.fromLTWH(rect.left, y - 1, rect.width, 2));
    canvas.drawRect(
      Rect.fromLTWH(rect.left + 16, y, rect.width - 32, 2.2),
      linePaint,
    );
  }

  @override
  bool shouldRepaint(covariant _ScanOverlayPainter oldDelegate) =>
      oldDelegate.pulse != pulse;
}

// ── Small UI pieces ──────────────────────────────────────────────────────────

class _RoundIconBtn extends StatelessWidget {
  const _RoundIconBtn({
    required this.icon,
    this.onTap,
    this.active = false,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? _mint.withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.14),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: Colors.white, size: 20),
        ),
      ),
    );
  }
}

class _HintTile extends StatelessWidget {
  const _HintTile({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: _emerald, size: 22),
          const SizedBox(height: 10),
          Text(
            title,
            style: const TextStyle(
              color: _ink,
              fontWeight: FontWeight.w800,
              fontSize: 13.5,
            ),
          ),
          const SizedBox(height: 2),
          Text(body, style: const TextStyle(color: _muted, fontSize: 12)),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.icon,
    required this.label,
    required this.fg,
    required this.bg,
  });

  final IconData icon;
  final String label;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _GhostBtn extends StatelessWidget {
  const _GhostBtn({
    required this.icon,
    required this.label,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: _forest,
        side: const BorderSide(color: _line),
        backgroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFECACA)),
      ),
      child: Text(
        text,
        style: const TextStyle(color: Color(0xFFB91C1C), height: 1.35),
      ),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: _ink,
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.videocam_off_outlined, color: Colors.white54, size: 52),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, height: 1.45),
            ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: onRetry,
              style: FilledButton.styleFrom(
                backgroundColor: _emerald,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text('Retry camera'),
            ),
          ],
        ),
      ),
    );
  }
}
