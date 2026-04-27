import 'dart:async';

import 'package:flutter/material.dart';

import '../services/mobile_api.dart';

// ── HelaPay QR Screen ─────────────────────────────────────────────────────────
// Pushed as a full-screen route from within the payment modals.
// Returns true  → payment received (close modal + record payment)
// Returns false/null → cancelled or failed (stay in modal)

class HelaPayQRScreen extends StatefulWidget {
  const HelaPayQRScreen({
    required this.api,
    required this.token,
    required this.amount,
    required this.reference,
    super.key,
  });

  final MobileApi api;
  final String    token;
  final double    amount;
  final String    reference;

  @override
  State<HelaPayQRScreen> createState() => _HelaPayQRScreenState();
}

enum _QRStatus { generating, waiting, success, failed, error }

class _HelaPayQRScreenState extends State<HelaPayQRScreen> {
  _QRStatus _status  = _QRStatus.generating;
  String    _qrData  = '';
  String    _qrRef   = '';
  String    _apiRef  = '';
  String    _errMsg  = '';
  Timer?    _pollTimer;

  @override
  void initState() {
    super.initState();
    _generate();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _generate() async {
    setState(() { _status = _QRStatus.generating; _errMsg = ''; });
    try {
      final res = await widget.api.generateQR(
        token:     widget.token,
        reference: widget.reference,
        amount:    widget.amount,
      );
      if (!mounted) return;
      setState(() {
        _qrData = '${res['qr_data'] ?? ''}';
        _qrRef  = '${res['qr_reference'] ?? ''}';
        _apiRef = '${res['reference'] ?? widget.reference}';
        _status = _QRStatus.waiting;
      });
      _startPolling();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errMsg = e.toString().replaceFirst('Exception: ', '');
        _status = _QRStatus.error;
      });
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      if (!mounted) { _pollTimer?.cancel(); return; }
      try {
        final res = await widget.api.checkQRStatus(
          token:       widget.token,
          reference:   _apiRef,
          qrReference: _qrRef,
        );
        final ps = res['sale']?['payment_status'];
        if (ps == 2) {
          _pollTimer?.cancel();
          if (!mounted) return;
          setState(() => _status = _QRStatus.success);
          await Future.delayed(const Duration(milliseconds: 1400));
          if (mounted) Navigator.of(context).pop(true);
        } else if (ps == -1) {
          _pollTimer?.cancel();
          if (!mounted) return;
          setState(() => _status = _QRStatus.failed);
        }
      } catch (_) { /* silent — keep polling */ }
    });
  }

  void _cancel() {
    _pollTimer?.cancel();
    Navigator.of(context).pop(false);
  }

  // ── QR image via qrserver.com (no extra package needed) ──────────────────
  Widget _qrImage() {
    if (_qrData.isEmpty) return const SizedBox.shrink();
    final url =
        'https://api.qrserver.com/v1/create-qr-code/'
        '?size=240x240&ecc=M&data=${Uri.encodeComponent(_qrData)}';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE4E7EC), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          url,
          width: 220,
          height: 220,
          fit: BoxFit.contain,
          loadingBuilder: (_, child, progress) {
            if (progress == null) return child;
            return const SizedBox(
              width: 220, height: 220,
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          },
          errorBuilder: (_, __, ___) => const SizedBox(
            width: 220, height: 220,
            child: Center(
              child: Text('QR load failed\nCheck internet',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.red, fontSize: 13)),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F2340),
      body: SafeArea(
        child: Column(
          children: [
            // ── Top bar ──────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: _cancel,
                    child: Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.close_rounded,
                          color: Colors.white, size: 18),
                    ),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('LankaQR Payment',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.2)),
                        Text('HelaPay Merchant QR',
                            style: TextStyle(
                                color: Color(0xFF93C5FD),
                                fontSize: 12,
                                fontWeight: FontWeight.w500)),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // ── Amount chip ──────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.20)),
                ),
                child: Text(
                  'Rs. ${widget.amount.toStringAsFixed(widget.amount.truncateToDouble() == widget.amount ? 0 : 2)}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5),
                ),
              ),
            ),

            // ── Body card ────────────────────────────────────────────────────
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.20),
                        blurRadius: 30,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 28, 24, 28),
                    child: Column(
                      children: [
                        // ── Status badge ───────────────────────────────────
                        _StatusBadge(status: _status),

                        const SizedBox(height: 24),

                        // ── QR / icon ──────────────────────────────────────
                        if (_status == _QRStatus.generating) ...[
                          const SizedBox(height: 20),
                          const CircularProgressIndicator(
                              color: Color(0xFF2563EB), strokeWidth: 2.5),
                          const SizedBox(height: 16),
                          const Text('Generating QR code…',
                              style: TextStyle(
                                  color: Color(0xFF667085), fontSize: 13)),
                          const SizedBox(height: 20),
                        ],

                        if (_status == _QRStatus.waiting) ...[
                          _qrImage(),
                          const SizedBox(height: 16),
                          const Text(
                            'Ask customer to scan with any\nLankaQR / banking app',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                color: Color(0xFF667085),
                                fontSize: 13,
                                height: 1.5),
                          ),
                        ],

                        if (_status == _QRStatus.success) ...[
                          Container(
                            width: 84, height: 84,
                            decoration: const BoxDecoration(
                                color: Color(0xFFECFDF5),
                                shape: BoxShape.circle),
                            child: const Icon(Icons.check_circle_rounded,
                                color: Color(0xFF059669), size: 44),
                          ),
                          const SizedBox(height: 16),
                          const Text('Payment Received!',
                              style: TextStyle(
                                  color: Color(0xFF059669),
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          const Text('Recording payment…',
                              style: TextStyle(
                                  color: Color(0xFF667085), fontSize: 13)),
                        ],

                        if (_status == _QRStatus.failed) ...[
                          Container(
                            width: 84, height: 84,
                            decoration: const BoxDecoration(
                                color: Color(0xFFFEF2F2),
                                shape: BoxShape.circle),
                            child: const Icon(Icons.cancel_rounded,
                                color: Color(0xFFDC2626), size: 44),
                          ),
                          const SizedBox(height: 16),
                          const Text('Payment Failed',
                              style: TextStyle(
                                  color: Color(0xFFDC2626),
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800)),
                        ],

                        if (_status == _QRStatus.error) ...[
                          const Icon(Icons.warning_amber_rounded,
                              color: Color(0xFFD97706), size: 52),
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFEF3C7),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                  color: const Color(0xFFFDE68A)),
                            ),
                            child: Text(
                              _errMsg.isNotEmpty
                                  ? _errMsg
                                  : 'HelaPay settings not configured.\nContact your admin.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: Color(0xFF92400E),
                                  fontSize: 13,
                                  height: 1.5),
                            ),
                          ),
                        ],

                        const SizedBox(height: 28),

                        // ── Action buttons ─────────────────────────────────
                        if (_status == _QRStatus.waiting)
                          _OutlineBtn(
                            label: 'Cancel',
                            icon: Icons.close_rounded,
                            onTap: _cancel,
                          ),

                        if (_status == _QRStatus.failed) ...[
                          _FillBtn(
                            label: 'Try Again',
                            icon: Icons.refresh_rounded,
                            color: const Color(0xFF2563EB),
                            onTap: _generate,
                          ),
                          const SizedBox(height: 10),
                          _OutlineBtn(
                            label: 'Cancel',
                            icon: Icons.close_rounded,
                            onTap: _cancel,
                          ),
                        ],

                        if (_status == _QRStatus.error) ...[
                          _FillBtn(
                            label: 'Retry',
                            icon: Icons.refresh_rounded,
                            color: const Color(0xFF2563EB),
                            onTap: _generate,
                          ),
                          const SizedBox(height: 10),
                          _OutlineBtn(
                            label: 'Cancel',
                            icon: Icons.close_rounded,
                            onTap: _cancel,
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Status badge widget ───────────────────────────────────────────────────────
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final _QRStatus status;

  @override
  Widget build(BuildContext context) {
    final cfg = _cfg();
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
      decoration: BoxDecoration(
        color: cfg.$3,
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: cfg.$2.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(cfg.$1, color: cfg.$2, size: 15),
          const SizedBox(width: 7),
          Text(cfg.$4,
              style: TextStyle(
                  color: cfg.$2,
                  fontSize: 13,
                  fontWeight: FontWeight.w700)),
          if (status == _QRStatus.waiting) ...[
            const SizedBox(width: 8),
            SizedBox(
              width: 13, height: 13,
              child: CircularProgressIndicator(
                  color: cfg.$2, strokeWidth: 2),
            ),
          ],
        ],
      ),
    );
  }

  // (icon, color, bg, label)
  (IconData, Color, Color, String) _cfg() => switch (status) {
    _QRStatus.generating => (Icons.hourglass_top_rounded,
        const Color(0xFF2563EB), const Color(0xFFEFF6FF), 'Generating QR…'),
    _QRStatus.waiting    => (Icons.qr_code_scanner_rounded,
        const Color(0xFFD97706), const Color(0xFFFFFBEB), 'Waiting for payment…'),
    _QRStatus.success    => (Icons.check_circle_rounded,
        const Color(0xFF059669), const Color(0xFFECFDF5), 'Payment Received!'),
    _QRStatus.failed     => (Icons.cancel_rounded,
        const Color(0xFFDC2626), const Color(0xFFFEF2F2), 'Payment Failed'),
    _QRStatus.error      => (Icons.warning_amber_rounded,
        const Color(0xFFD97706), const Color(0xFFFFFBEB), 'Error'),
  };
}

// ── Shared button helpers ─────────────────────────────────────────────────────
class _FillBtn extends StatelessWidget {
  const _FillBtn({
    required this.label, required this.icon,
    required this.color, required this.onTap,
  });
  final String label; final IconData icon;
  final Color color; final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
          color: color, borderRadius: BorderRadius.circular(13)),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, color: Colors.white, size: 17),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(
            color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700)),
      ]),
    ),
  );
}

class _OutlineBtn extends StatelessWidget {
  const _OutlineBtn({required this.label, required this.icon, required this.onTap});
  final String label; final IconData icon; final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 13),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, color: const Color(0xFF6B7280), size: 16),
        const SizedBox(width: 7),
        Text(label, style: const TextStyle(
            color: Color(0xFF374151), fontSize: 14, fontWeight: FontWeight.w600)),
      ]),
    ),
  );
}
