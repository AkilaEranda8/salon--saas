import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'register_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, this.asModal = false});

  final bool asModal;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  bool _otpSent = false;
  bool _loading = false;
  String? _error;
  String? _debugOtp;

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    final phone = _phone.text.trim();
    if (phone.isEmpty) {
      setState(() => _error = 'Enter your phone number.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _debugOtp = null;
    });
    try {
      await AppStateScope.of(context).api.requestPortalOtp(phone);
      if (!mounted) return;
      setState(() {
        _otpSent = true;
        _loading = false;
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

  @override
  Widget build(BuildContext context) {
    return AtmosphereBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(false),
          ),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
            children: [
              Text(
                AppConfig.brandName,
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                      fontSize: 36,
                      color: AppColors.ink,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                'Sign in with your phone to view appointments and loyalty.',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 36),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                enabled: !_otpSent,
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]'))],
                decoration: const InputDecoration(
                  labelText: 'Phone number',
                  hintText: '07XXXXXXXX',
                ),
              ),
              if (_otpSent) ...[
                const SizedBox(height: 14),
                TextField(
                  controller: _otp,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    labelText: 'OTP code',
                    hintText: '6-digit code',
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
              ],
              if (_debugOtp != null) ...[
                const SizedBox(height: 8),
                Text('Dev OTP: $_debugOtp', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
              ],
              const SizedBox(height: 24),
              AppButton(
                label: _otpSent ? 'Verify & continue' : 'Send OTP',
                loading: _loading,
                onPressed: _otpSent ? _verify : _requestOtp,
              ),
              if (_otpSent) ...[
                const SizedBox(height: 10),
                AppButton(
                  label: 'Change number',
                  secondary: true,
                  onPressed: _loading
                      ? null
                      : () => setState(() {
                            _otpSent = false;
                            _otp.clear();
                            _error = null;
                          }),
                ),
              ],
              const SizedBox(height: 28),
              TextButton(
                onPressed: () async {
                  final ok = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(builder: (_) => const RegisterPage()),
                  );
                  if (ok == true && context.mounted) {
                    Navigator.of(context).pop(true);
                  }
                },
                child: Text(
                  'New here? Create an account',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(color: AppColors.blushDeep),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
