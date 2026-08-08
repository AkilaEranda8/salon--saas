import 'package:flutter/material.dart';

import '../config.dart';
import '../state/app_state.dart';
import '../theme/app_motion.dart';
import '../theme/app_theme.dart';
import '../widgets/auth_chrome.dart';
import '../widgets/common.dart';
import 'register_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, this.asModal = false});

  final bool asModal;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> with SingleTickerProviderStateMixin {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  final _otpFocus = FocusNode();
  bool _otpSent = false;
  bool _loading = false;
  String? _error;
  String? _debugOtp;
  late final AnimationController _enter;

  @override
  void initState() {
    super.initState();
    _enter = AnimationController(vsync: this, duration: AppMotion.slow)..forward();
  }

  @override
  void dispose() {
    _enter.dispose();
    _phone.dispose();
    _otp.dispose();
    _otpFocus.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    final phone = _phone.text.trim();
    if (phone.replaceAll(RegExp(r'\D'), '').length < 9) {
      setState(() => _error = 'Enter a valid phone number.');
      return;
    }
    if (AppConfig.tenantIdInt == null) {
      setState(() => _error = 'App is not configured with a salon (TENANT_ID).');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _debugOtp = null;
    });
    try {
      final res = await AppStateScope.of(context).api.requestPortalOtp(phone);
      if (!mounted) return;
      final debug = '${res['debug_otp'] ?? ''}'.trim();
      setState(() {
        _otpSent = true;
        _loading = false;
        _debugOtp = debug.isEmpty ? null : debug;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _otpFocus.requestFocus();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _verify() async {
    final phone = _phone.text.trim();
    final otp = _otp.text.trim();
    if (otp.length < 4) {
      setState(() => _error = 'Enter the OTP sent to your phone.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = AppStateScope.of(context).api;
      final token = await api.verifyPortalOtp(phone: phone, otp: otp);
      if (!mounted) return;
      await AppStateScope.of(context).setSession(token: token, phone: phone);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _changeNumber() {
    setState(() {
      _otpSent = false;
      _otp.clear();
      _error = null;
      _debugOtp = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final brand = AppConfig.brandName;

    return AuthChrome(
      onClose: () => Navigator.of(context).pop(false),
      child: AppMotion.fadeSlide(
        animation: _enter,
        begin: const Offset(0, 0.035),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AuthBrandMark(brandName: brand),
            const SizedBox(height: 28),
            Text(
              _otpSent ? 'Enter your code' : 'Welcome back',
              style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                    fontSize: 34,
                    height: 1.1,
                    letterSpacing: -0.6,
                  ),
            ),
            const SizedBox(height: 10),
            Text(
              _otpSent
                  ? 'We sent a one-time code to ${_phone.text.trim()}.'
                  : 'Sign in with your phone to view appointments and loyalty.',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.inkSoft,
                    height: 1.45,
                  ),
            ),
            const SizedBox(height: 36),
            AnimatedSwitcher(
              duration: AppMotion.normal,
              switchInCurve: AppMotion.easeOut,
              switchOutCurve: AppMotion.easeOut,
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0.02, 0.04),
                    end: Offset.zero,
                  ).animate(anim),
                  child: child,
                ),
              ),
              child: _otpSent
                  ? KeyedSubtree(
                      key: const ValueKey('otp'),
                      child: AuthOtpField(
                        controller: _otp,
                        focusNode: _otpFocus,
                        onSubmitted: _loading ? null : _verify,
                      ),
                    )
                  : KeyedSubtree(
                      key: const ValueKey('phone'),
                      child: AuthPhoneField(
                        controller: _phone,
                        enabled: !_loading,
                        onSubmitted: _loading ? null : _requestOtp,
                      ),
                    ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              AuthErrorBanner(message: _error!),
            ],
            if (_debugOtp != null) ...[
              const SizedBox(height: 8),
              Text(
                'Dev OTP: $_debugOtp',
                style: const TextStyle(color: AppColors.muted, fontSize: 12),
              ),
            ],
            const SizedBox(height: 28),
            AppButton(
              label: _otpSent ? 'Verify & continue' : 'Send code',
              loading: _loading,
              onPressed: _otpSent ? _verify : _requestOtp,
            ),
            if (_otpSent) ...[
              const SizedBox(height: 12),
              AppButton(
                label: 'Use a different number',
                secondary: true,
                onPressed: _loading ? null : _changeNumber,
              ),
            ],
            const SizedBox(height: 40),
            AuthFooterLink(
              prompt: 'New here?',
              action: 'Create an account',
              onTap: () async {
                final ok = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(builder: (_) => const RegisterPage()),
                );
                if (ok == true && context.mounted) {
                  Navigator.of(context).pop(true);
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
