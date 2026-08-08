import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_page.dart';

/// Shows a short-lived check-in QR for salon staff to scan.
class CheckInQrPage extends StatefulWidget {
  const CheckInQrPage({super.key});

  @override
  State<CheckInQrPage> createState() => _CheckInQrPageState();
}

class _CheckInQrPageState extends State<CheckInQrPage> {
  String? _code;
  String? _name;
  String? _phone;
  DateTime? _expiresAt;
  String? _error;
  bool _loading = true;
  Timer? _refreshTimer;
  Timer? _tickTimer;
  int _secondsLeft = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _tickTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final state = AppStateScope.of(context);
    if (!state.isLoggedIn || state.token == null) {
      setState(() {
        _loading = false;
        _error = 'Sign in to show your check-in QR.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await state.api.getCheckInQr(state.token!);
      if (!mounted) return;
      final code = '${data['code'] ?? ''}'.trim();
      if (code.isEmpty) throw Exception('No QR code returned');

      final expiresRaw = '${data['expires_at'] ?? ''}';
      final expiresAt = DateTime.tryParse(expiresRaw)?.toLocal();
      final customer = data['customer'];
      final name = customer is Map ? '${customer['name'] ?? ''}' : '';
      final phone = customer is Map
          ? '${customer['phone'] ?? ''}'
          : (state.profile?.phone ?? '');

      setState(() {
        _code = code;
        _name = name.isNotEmpty ? name : state.profile?.name;
        _phone = phone.isNotEmpty ? phone : state.profile?.phone;
        _expiresAt = expiresAt;
        _loading = false;
        _secondsLeft = expiresAt == null
            ? 0
            : expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 600);
      });

      _scheduleRefresh();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _scheduleRefresh() {
    _refreshTimer?.cancel();
    _tickTimer?.cancel();

    final expiresAt = _expiresAt;
    if (expiresAt == null) return;

    final refreshIn = expiresAt.difference(DateTime.now()) - const Duration(seconds: 15);
    final delay = refreshIn.isNegative ? const Duration(seconds: 5) : refreshIn;
    _refreshTimer = Timer(delay, () {
      if (mounted) _load();
    });

    _tickTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _expiresAt == null) return;
      final left = _expiresAt!.difference(DateTime.now()).inSeconds;
      setState(() => _secondsLeft = left < 0 ? 0 : left);
      if (left <= 0) {
        _tickTimer?.cancel();
        _load();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Check-in QR'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
        elevation: 0,
      ),
      body: !state.isLoggedIn
          ? EmptyState(
              title: 'Sign in required',
              subtitle: 'Sign in to show your salon check-in QR.',
              actionLabel: 'Sign in',
              onAction: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const LoginPage()),
                );
              },
              icon: Icons.qr_code_2_rounded,
            )
          : RefreshIndicator(
              color: AppColors.blush,
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 40),
                children: [
                  Text(
                    'Show this code at the salon',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          color: AppColors.ink,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Staff will scan it to find you and check in your appointment.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppColors.inkSoft,
                        ),
                  ),
                  const SizedBox(height: 28),
                  if (_loading && _code == null)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 80),
                      child: Center(child: CircularProgressIndicator(color: AppColors.blush)),
                    )
                  else if (_error != null && _code == null)
                    EmptyState(
                      title: 'Could not load QR',
                      subtitle: _error!,
                      actionLabel: 'Retry',
                      onAction: _load,
                      icon: Icons.error_outline,
                    )
                  else if (_code != null) ...[
                    Container(
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: AppColors.line),
                      ),
                      child: Column(
                        children: [
                          if ((_name ?? '').isNotEmpty) ...[
                            Text(
                              _name!,
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                    color: AppColors.ink,
                                  ),
                            ),
                            if ((_phone ?? '').isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                _phone!,
                                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                      color: AppColors.inkSoft,
                                    ),
                              ),
                            ],
                            const SizedBox(height: 18),
                          ],
                          QrImageView(
                            data: _code!,
                            version: QrVersions.auto,
                            size: 240,
                            backgroundColor: Colors.white,
                            eyeStyle: const QrEyeStyle(
                              eyeShape: QrEyeShape.square,
                              color: AppColors.ink,
                            ),
                            dataModuleStyle: const QrDataModuleStyle(
                              dataModuleShape: QrDataModuleShape.square,
                              color: AppColors.ink,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            _secondsLeft > 0
                                ? 'Refreshes in ${_secondsLeft}s'
                                : 'Refreshing…',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: AppColors.muted,
                                ),
                          ),
                        ],
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        style: const TextStyle(color: AppColors.danger, fontSize: 13),
                      ),
                    ],
                    const SizedBox(height: 20),
                    AppButton(
                      label: 'Refresh now',
                      secondary: true,
                      onPressed: _loading ? null : _load,
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
