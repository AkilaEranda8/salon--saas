import 'package:flutter/material.dart';

import '../config.dart';
import '../state/app_state.dart';
import '../theme/app_motion.dart';
import '../theme/app_theme.dart';
import '../widgets/auth_chrome.dart';
import '../widgets/common.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage>
    with SingleTickerProviderStateMixin {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
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
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _otp.dispose();
    _otpFocus.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    final name = _name.text.trim();
    final phone = _phone.text.trim();
    if (name.isEmpty || phone.replaceAll(RegExp(r'\D'), '').length < 9) {
      setState(() => _error = 'Name and a valid phone number are required.');
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
      final res = await AppStateScope.of(context).api.registerPortal(
            name: name,
            phone: phone,
            email: _email.text.trim(),
          );
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

  void _editDetails() {
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
              _otpSent ? 'Verify your number' : 'Create your account',
              style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                    fontSize: 34,
                    height: 1.1,
                    letterSpacing: -0.6,
                  ),
            ),
            const SizedBox(height: 10),
            Text(
              _otpSent
                  ? 'Enter the code we sent to ${_phone.text.trim()}.'
                  : 'A few details — then a one-time code to confirm your phone.',
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
                      key: const ValueKey('form'),
                      child: Column(
                        children: [
                          TextField(
                            controller: _name,
                            textCapitalization: TextCapitalization.words,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Full name',
                              hintText: 'Your name',
                            ),
                          ),
                          const SizedBox(height: 14),
                          AuthPhoneField(
                            controller: _phone,
                            enabled: !_loading,
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            textInputAction: TextInputAction.done,
                            decoration: const InputDecoration(
                              labelText: 'Email (optional)',
                              hintText: 'you@email.com',
                            ),
                          ),
                        ],
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
              onPressed: _otpSent ? _verify : _register,
            ),
            if (_otpSent) ...[
              const SizedBox(height: 12),
              AppButton(
                label: 'Edit details',
                secondary: true,
                onPressed: _loading ? null : _editDetails,
              ),
            ],
            const SizedBox(height: 40),
            AuthFooterLink(
              prompt: 'Already have an account?',
              action: 'Sign in',
              onTap: () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    );
  }
}
