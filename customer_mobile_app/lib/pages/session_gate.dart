import 'package:flutter/material.dart';

import '../config.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'home_shell.dart';
import 'login_page.dart';

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      AppStateScope.of(context).bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);

    if (state.booting) {
      return const AtmosphereBackground(
        child: Scaffold(
          backgroundColor: Colors.transparent,
          body: Center(
            child: CircularProgressIndicator(color: AppColors.blush),
          ),
        ),
      );
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

    // Guests can book/view offers; logged-in users land on home.
    // Always show home shell — auth gated per tab.
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
