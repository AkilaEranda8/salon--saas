import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'check_in_qr_page.dart';
import 'history_page.dart';
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
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 110),
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.washTop, AppColors.blushSoft],
              ),
              border: Border.all(color: AppColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        color: AppColors.ink,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  p.phone,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: AppColors.inkSoft,
                      ),
                ),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.8),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.stars_rounded, color: AppColors.blushDeep),
                      const SizedBox(width: 10),
                      Text(
                        '${p.loyaltyPoints} loyalty points',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              color: AppColors.ink,
                            ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          AppButton(
            label: 'Visit history',
            secondary: true,
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const HistoryPage()),
              );
            },
          ),
          const SizedBox(height: 12),
          AppButton(
            label: 'Show check-in QR',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const CheckInQrPage()),
              );
            },
          ),
          const SizedBox(height: 12),
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
