import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';

/// App-wide top bar — light chrome (owned by [HomeShell]).
class AppHeader extends StatelessWidget {
  const AppHeader({
    super.key,
    required this.brandName,
    required this.onProfile,
    this.onNotifications,
  });

  final String brandName;
  final VoidCallback onProfile;
  final VoidCallback? onNotifications;

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Material(
        color: AppColors.surface,
        child: SafeArea(
          bottom: false,
          child: Container(
            height: 56,
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.line)),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _HeaderIconButton(
                    icon: Icons.person_outline_rounded,
                    onTap: onProfile,
                  ),
                  Expanded(
                    child: Text(
                      brandName,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            color: AppColors.ink,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.4,
                            fontSize: 18,
                          ),
                    ),
                  ),
                  _HeaderIconButton(
                    icon: Icons.notifications_none_rounded,
                    onTap: onNotifications ??
                        () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('No new notifications')),
                          );
                        },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.blushSoft,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 42,
          height: 42,
          child: Icon(icon, color: AppColors.blushDeep, size: 22),
        ),
      ),
    );
  }
}
