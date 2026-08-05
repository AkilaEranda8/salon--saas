import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';

import '../state/app_state.dart';
import 'dashboard_page.dart';
import 'login_page.dart';

/// Loads saved login (if any) then shows [DashboardPage] or [LoginPage].
/// Biometric unlock is optional — only when the user has enabled it.
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

  static const _forest = Color(0xFF1B3A2D);
  static const _emerald = Color(0xFF2D6A4F);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _restore());
  }

  Future<void> _restore() async {
    final appState = AppStateScope.of(context);
    await appState.loadPersistedSession();
    if (!mounted) return;

    if (!appState.isLoggedIn) {
      setState(() => _loading = false);
      return;
    }

    // Stay logged in. Biometrics only if user opted in.
    if (!appState.biometricUnlockEnabled) {
      setState(() {
        _loading = false;
        _biometricLocked = false;
      });
      return;
    }

    setState(() {
      _loading = false;
      _biometricLocked = true;
    });
    await _authenticate();
  }

  Future<void> _authenticate() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final isDeviceSupported = await _auth.isDeviceSupported();
      if (!canCheck && !isDeviceSupported) {
        // Preference was on but device can't do it — enter app anyway.
        if (mounted) {
          await AppStateScope.of(context).setBiometricUnlockEnabled(false);
          setState(() => _biometricLocked = false);
        }
        return;
      }
      final didAuth = await _auth.authenticate(
        localizedReason: 'Unlock Hexaone',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
      if (!mounted) return;
      if (didAuth) {
        setState(() {
          _biometricLocked = false;
          _biometricError = null;
        });
      } else {
        setState(
          () => _biometricError = 'Authentication failed. Try again.',
        );
      }
    } catch (_) {
      // Any biometric error → still enter app (session stays valid).
      if (mounted) setState(() => _biometricLocked = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: _forest,
        body: Center(
          child: CircularProgressIndicator(color: Colors.white),
        ),
      );
    }

    if (_biometricLocked) {
      return Scaffold(
        backgroundColor: _forest,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(
                    Icons.fingerprint,
                    size: 40,
                    color: Color(0xFF86EFAC),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Hexaone',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(height: 8),
                if (_biometricError != null) ...[
                  Text(
                    _biometricError!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Color(0xFFFCA5A5),
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 16),
                ] else ...[
                  const Text(
                    'Unlock to continue',
                    style: TextStyle(color: Colors.white70, fontSize: 14),
                  ),
                  const SizedBox(height: 16),
                ],
                FilledButton.icon(
                  onPressed: _authenticate,
                  icon: const Icon(Icons.fingerprint),
                  label: const Text('Unlock'),
                  style: FilledButton.styleFrom(
                    backgroundColor: _emerald,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 28,
                      vertical: 14,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () async {
                    await AppStateScope.of(context).setBiometricUnlockEnabled(false);
                    if (!mounted) return;
                    setState(() {
                      _biometricLocked = false;
                      _biometricError = null;
                    });
                  },
                  child: const Text(
                    'Skip unlock this time',
                    style: TextStyle(color: Colors.white60),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    AppStateScope.of(context).logout();
                    setState(() {
                      _biometricLocked = false;
                      _biometricError = null;
                    });
                  },
                  child: const Text(
                    'Use password instead',
                    style: TextStyle(color: Colors.white38),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final loggedIn = AppStateScope.of(context).isLoggedIn;
    return loggedIn ? const DashboardPage() : const LoginPage();
  }
}
