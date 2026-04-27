import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';

import '../state/app_state.dart';
import 'dashboard_page.dart';
import 'login_page.dart';

/// Loads saved login (if any) then shows [DashboardPage] or [LoginPage].
/// If a saved session exists, biometric authentication is requested first.
class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  bool _loading = true;
  bool _biometricLocked = false;
  String? _biometricError;
  final _auth = LocalAuthentication();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _restore());
  }

  Future<void> _restore() async {
    final appState = AppStateScope.of(context);
    await appState.loadPersistedSession();
    if (!mounted) return;

    if (appState.isLoggedIn) {
      // Session found — lock with biometric
      setState(() { _loading = false; _biometricLocked = true; });
      await _authenticate();
    } else {
      setState(() => _loading = false);
    }
  }

  Future<void> _authenticate() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final isDeviceSupported = await _auth.isDeviceSupported();
      if (!canCheck && !isDeviceSupported) {
        // Device has no biometric — go straight to dashboard
        if (mounted) setState(() => _biometricLocked = false);
        return;
      }
      final didAuth = await _auth.authenticate(
        localizedReason: 'Verify your identity to access Hexa Salon',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
      if (!mounted) return;
      if (didAuth) {
        setState(() { _biometricLocked = false; _biometricError = null; });
      } else {
        setState(() => _biometricError = 'Authentication failed. Try again.');
      }
    } catch (e) {
      if (mounted) setState(() => _biometricLocked = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0D0912),
        body: Center(child: CircularProgressIndicator(color: Color(0xFFC9956C))),
      );
    }

    if (_biometricLocked) {
      return Scaffold(
        backgroundColor: const Color(0xFF0D0912),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.fingerprint, size: 72, color: Color(0xFFC9956C)),
              const SizedBox(height: 20),
              const Text(
                'Hexa Salon',
                style: TextStyle(color: Color(0xFFF5EEE8), fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: 3),
              ),
              const SizedBox(height: 8),
              if (_biometricError != null) ...[
                const SizedBox(height: 12),
                Text(_biometricError!, style: const TextStyle(color: Color(0xFFFF7B7B), fontSize: 13)),
                const SizedBox(height: 16),
              ] else ...[
                const SizedBox(height: 12),
                const Text('Authenticate to continue', style: TextStyle(color: Color(0x80F5EEE8), fontSize: 14)),
                const SizedBox(height: 16),
              ],
              ElevatedButton.icon(
                onPressed: _authenticate,
                icon: const Icon(Icons.fingerprint),
                label: const Text('Authenticate'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFC9956C),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () {
                  AppStateScope.of(context).logout();
                  setState(() { _biometricLocked = false; _biometricError = null; });
                },
                child: const Text('Use password instead', style: TextStyle(color: Color(0x70F5EEE8))),
              ),
            ],
          ),
        ),
      );
    }

    final loggedIn = AppStateScope.of(context).isLoggedIn;
    return loggedIn ? const DashboardPage() : const LoginPage();
  }
}
