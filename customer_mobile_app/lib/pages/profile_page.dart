import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_page.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    if (!state.isLoggedIn || state.profile == null) {
      return EmptyState(
        title: 'Your profile',
        subtitle: 'Sign in to see loyalty points and account details.',
        actionLabel: 'Sign in',
        onAction: () {
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginPage()));
        },
        icon: Icons.person_outline,
      );
    }

    final p = state.profile!;
    return RefreshIndicator(
      color: AppColors.blush,
      onRefresh: () => state.refreshProfile(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF2A221E), Color(0xFF4A3530)],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: Colors.white),
                ),
                const SizedBox(height: 6),
                Text(
                  p.phone,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white70),
                ),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.stars_rounded, color: Color(0xFFE8C4A8)),
                      const SizedBox(width: 10),
                      Text(
                        '${p.loyaltyPoints} loyalty points',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          AppButton(
            label: 'Sign out',
            secondary: true,
            onPressed: () async {
              await state.logout();
            },
          ),
        ],
      ),
    );
  }
}
