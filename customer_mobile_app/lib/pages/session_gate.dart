import 'package:flutter/material.dart';

import '../config.dart';
import '../state/app_state.dart';
import '../widgets/app_loading.dart';
import '../widgets/common.dart';
import 'home_shell.dart';
import 'login_page.dart';

/// Keep the Lottie splash visible at least this long.
const Duration _kMinSplash = Duration(milliseconds: 2800);

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  bool _minSplashDone = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  Future<void> _start() async {
    final boot = AppStateScope.of(context).bootstrap();
    final wait = Future<void>.delayed(_kMinSplash);
    await Future.wait([boot, wait]);
    if (!mounted) return;
    setState(() => _minSplashDone = true);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    final showSplash = state.booting || !_minSplashDone;

    if (showSplash) {
      return const AppLoadingScreen();
    }

    if (state.bootError != null && !state.hasTenant) {
      return AtmosphereBackground(
        child: Scaffold(
          backgroundColor: Colors.transparent,
          body: EmptyState(
            title: 'Setup required',
            subtitle: state.bootError!,
            icon: Icons.settings_outlined,
          ),
        ),
      );
    }

    return HomeShell(
      brandName: AppConfig.brandName,
      initiallyLoggedIn: state.isLoggedIn,
    );
  }
}

/// Helper to open login and return whether login succeeded.
Future<bool> ensureLoggedIn(BuildContext context) async {
  final state = AppStateScope.of(context);
  if (state.isLoggedIn) return true;
  final ok = await Navigator.of(context).push<bool>(
    MaterialPageRoute(builder: (_) => const LoginPage()),
  );
  if (!context.mounted) return false;
  return ok == true || AppStateScope.of(context).isLoggedIn;
}
