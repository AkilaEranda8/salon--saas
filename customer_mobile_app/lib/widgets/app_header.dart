import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../state/app_state.dart';
import '../theme/app_theme.dart';

/// App-wide top bar — modern light chrome (owned by [HomeShell]).
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

  String get _mark {
    final t = brandName.trim();
    if (t.isEmpty) return 'H';
    final parts = t.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return t.substring(0, t.length >= 2 ? 2 : 1).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    final profileName = state.profile?.name.trim() ?? '';
    final greeting = profileName.isNotEmpty
        ? profileName.split(RegExp(r'\s+')).first
        : null;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: Material(
        color: Colors.transparent,
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.washTop,
                AppColors.surface,
              ],
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
              child: Row(
                children: [
                  _BrandMark(mark: _mark),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          brandName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                color: AppColors.ink,
                                fontWeight: FontWeight.w600,
                                letterSpacing: -0.5,
                                fontSize: 19,
                                height: 1.1,
                              ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          greeting != null ? 'Hi, $greeting' : 'Welcome',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.muted,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 0.1,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _HeaderIconButton(
                    icon: Icons.notifications_none_rounded,
                    onTap: onNotifications ??
                        () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('No new notifications'),
                            ),
                          );
                        },
                  ),
                  const SizedBox(width: 8),
                  _ProfileButton(
                    name: profileName,
                    onTap: onProfile,
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

class _BrandMark extends StatelessWidget {
  const _BrandMark({required this.mark});

  final String mark;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.accentMid,
            AppColors.blush,
            AppColors.blushDeep,
          ],
        ),
      ),
      child: Text(
        mark,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: 14,
          letterSpacing: 0.4,
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
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.line),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: SizedBox(
          width: 42,
          height: 42,
          child: Icon(icon, color: AppColors.inkSoft, size: 22),
        ),
      ),
    );
  }
}

class _ProfileButton extends StatelessWidget {
  const _ProfileButton({required this.name, required this.onTap});

  final String name;
  final VoidCallback onTap;

  String get _initial {
    final t = name.trim();
    if (t.isEmpty) return '';
    return t[0].toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final initial = _initial;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Ink(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            gradient: initial.isEmpty
                ? null
                : const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.blush, AppColors.blushDeep],
                  ),
            color: initial.isEmpty ? Colors.white : null,
            border: Border.all(
              color: initial.isEmpty ? AppColors.line : Colors.transparent,
            ),
          ),
          child: initial.isEmpty
              ? const Icon(
                  Icons.person_outline_rounded,
                  color: AppColors.inkSoft,
                  size: 22,
                )
              : Center(
                  child: Text(
                    initial,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}
