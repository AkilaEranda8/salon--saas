import 'package:flutter/material.dart';

enum AppToastKind { error, success, info, warning }

/// Floating in-app notification with icon + soft surface (errors & success).
class AppToast {
  AppToast._();

  static void show(
    BuildContext context,
    String message, {
    AppToastKind kind = AppToastKind.info,
    String? title,
    Duration duration = const Duration(seconds: 3),
  }) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.fromLTRB(14, 0, 14, 18),
        padding: EdgeInsets.zero,
        duration: duration,
        dismissDirection: DismissDirection.horizontal,
        content: _AppToastCard(
          kind: kind,
          title: title ?? _defaultTitle(kind),
          message: message.trim().isEmpty ? 'Something went wrong' : message.trim(),
        ),
      ),
    );
  }

  static void error(BuildContext context, String message, {String? title}) =>
      show(context, message,
          kind: AppToastKind.error,
          title: title,
          duration: const Duration(seconds: 4));

  static void success(BuildContext context, String message, {String? title}) =>
      show(context, message, kind: AppToastKind.success, title: title);

  static void info(BuildContext context, String message, {String? title}) =>
      show(context, message, kind: AppToastKind.info, title: title);

  static void warning(BuildContext context, String message, {String? title}) =>
      show(context, message, kind: AppToastKind.warning, title: title);

  static String _defaultTitle(AppToastKind kind) {
    switch (kind) {
      case AppToastKind.error:
        return 'Couldn’t complete';
      case AppToastKind.success:
        return 'Done';
      case AppToastKind.info:
        return 'Notice';
      case AppToastKind.warning:
        return 'Check this';
    }
  }
}

class _ToastPalette {
  const _ToastPalette({
    required this.accent,
    required this.bg,
    required this.border,
    required this.iconBg,
    required this.icon,
  });

  final Color accent;
  final Color bg;
  final Color border;
  final Color iconBg;
  final IconData icon;

  static _ToastPalette of(AppToastKind kind) {
    switch (kind) {
      case AppToastKind.error:
        return const _ToastPalette(
          accent: Color(0xFFDC2626),
          bg: Color(0xFFFFF1F2),
          border: Color(0xFFFECDD3),
          iconBg: Color(0xFFFFE4E6),
          icon: Icons.error_outline_rounded,
        );
      case AppToastKind.success:
        return const _ToastPalette(
          accent: Color(0xFF059669),
          bg: Color(0xFFECFDF5),
          border: Color(0xFFA7F3D0),
          iconBg: Color(0xFFD1FAE5),
          icon: Icons.check_circle_outline_rounded,
        );
      case AppToastKind.info:
        return const _ToastPalette(
          accent: Color(0xFF2563EB),
          bg: Color(0xFFEFF6FF),
          border: Color(0xFFBFDBFE),
          iconBg: Color(0xFFDBEAFE),
          icon: Icons.info_outline_rounded,
        );
      case AppToastKind.warning:
        return const _ToastPalette(
          accent: Color(0xFFD97706),
          bg: Color(0xFFFFFBEB),
          border: Color(0xFFFDE68A),
          iconBg: Color(0xFFFEF3C7),
          icon: Icons.warning_amber_rounded,
        );
    }
  }
}

class _AppToastCard extends StatelessWidget {
  const _AppToastCard({
    required this.kind,
    required this.title,
    required this.message,
  });

  final AppToastKind kind;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final p = _ToastPalette.of(kind);
    return Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          color: p.bg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: p.border),
          boxShadow: [
            BoxShadow(
              color: p.accent.withValues(alpha: 0.12),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(width: 4, color: p.accent),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: p.iconBg,
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: Icon(p.icon, color: p.accent, size: 20),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                title,
                                style: TextStyle(
                                  color: p.accent,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.1,
                                  height: 1.2,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                message,
                                style: const TextStyle(
                                  color: Color(0xFF374151),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  height: 1.35,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 32,
                            minHeight: 32,
                          ),
                          onPressed: () =>
                              ScaffoldMessenger.of(context).hideCurrentSnackBar(),
                          icon: Icon(
                            Icons.close_rounded,
                            size: 18,
                            color: p.accent.withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
