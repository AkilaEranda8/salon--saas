import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../config.dart';
import '../state/app_state.dart';
import '../theme/app_motion.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_page.dart';

/// Immersive salon check-in QR — staff scan this at the desk.
class CheckInQrPage extends StatefulWidget {
  const CheckInQrPage({super.key});

  @override
  State<CheckInQrPage> createState() => _CheckInQrPageState();
}

class _CheckInQrPageState extends State<CheckInQrPage>
    with TickerProviderStateMixin {
  String? _code;
  String? _name;
  String? _phone;
  DateTime? _expiresAt;
  int _ttlSec = 180;
  String? _error;
  bool _loading = true;
  Timer? _refreshTimer;
  Timer? _tickTimer;
  int _secondsLeft = 0;

  late final AnimationController _enter;
  late final AnimationController _pulse;
  late final AnimationController _qrPop;

  @override
  void initState() {
    super.initState();
    _enter = AnimationController(vsync: this, duration: AppMotion.slow);
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))
      ..repeat(reverse: true);
    _qrPop = AnimationController(vsync: this, duration: AppMotion.normal);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _tickTimer?.cancel();
    _enter.dispose();
    _pulse.dispose();
    _qrPop.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final state = AppStateScope.of(context);
    if (!state.isLoggedIn || state.token == null) {
      setState(() {
        _loading = false;
        _error = 'Sign in to show your check-in QR.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await state.api.getCheckInQr(state.token!);
      if (!mounted) return;
      final code = '${data['code'] ?? ''}'.trim();
      if (code.isEmpty) throw Exception('No QR code returned');

      final expiresRaw = '${data['expires_at'] ?? ''}';
      final expiresAt = DateTime.tryParse(expiresRaw)?.toLocal();
      final expiresIn = int.tryParse('${data['expires_in'] ?? ''}') ?? 180;
      final customer = data['customer'];
      final name = customer is Map ? '${customer['name'] ?? ''}' : '';
      final phone = customer is Map
          ? '${customer['phone'] ?? ''}'
          : (state.profile?.phone ?? '');

      setState(() {
        _code = code;
        _name = name.isNotEmpty ? name : state.profile?.name;
        _phone = phone.isNotEmpty ? phone : state.profile?.phone;
        _expiresAt = expiresAt;
        _ttlSec = expiresIn.clamp(60, 600);
        _loading = false;
        _secondsLeft = expiresAt == null
            ? 0
            : expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 600);
      });

      _enter.forward(from: 0);
      _qrPop.forward(from: 0);
      _scheduleRefresh();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _scheduleRefresh() {
    _refreshTimer?.cancel();
    _tickTimer?.cancel();

    final expiresAt = _expiresAt;
    if (expiresAt == null) return;

    final refreshIn =
        expiresAt.difference(DateTime.now()) - const Duration(seconds: 15);
    final delay =
        refreshIn.isNegative ? const Duration(seconds: 5) : refreshIn;
    _refreshTimer = Timer(delay, () {
      if (mounted) _load();
    });

    _tickTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _expiresAt == null) return;
      final left = _expiresAt!.difference(DateTime.now()).inSeconds;
      setState(() => _secondsLeft = left < 0 ? 0 : left);
      if (left <= 0) {
        _tickTimer?.cancel();
        _load();
      }
    });
  }

  String get _timerLabel {
    if (_secondsLeft <= 0) return 'Refreshing…';
    final m = _secondsLeft ~/ 60;
    final s = _secondsLeft % 60;
    if (m > 0) return '${m}m ${s.toString().padLeft(2, '0')}s';
    return '${s}s';
  }

  double get _progress {
    if (_ttlSec <= 0) return 0;
    return (_secondsLeft / _ttlSec).clamp(0.0, 1.0);
  }

  String get _initials {
    final n = (_name ?? '').trim();
    if (n.isEmpty) return 'C';
    final parts = n.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return parts.first.substring(0, math.min(2, parts.first.length)).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    final top = MediaQuery.paddingOf(context).top;
    final bottom = MediaQuery.paddingOf(context).bottom;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: Scaffold(
        backgroundColor: AppColors.surface,
        body: AtmosphereBackground(
          child: !state.isLoggedIn
              ? SafeArea(
                  child: EmptyState(
                    title: 'Sign in required',
                    subtitle: 'Sign in to show your salon check-in QR.',
                    actionLabel: 'Sign in',
                    onAction: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const LoginPage()),
                      );
                    },
                    icon: Icons.qr_code_2_rounded,
                  ),
                )
              : RefreshIndicator(
                  color: AppColors.blush,
                  displacement: 48,
                  onRefresh: _load,
                  child: CustomScrollView(
                    physics: const AlwaysScrollableScrollPhysics(
                      parent: BouncingScrollPhysics(),
                    ),
                    slivers: [
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(16, top + 8, 16, 0),
                          child: _TopBar(
                            onBack: () => Navigator.of(context).maybePop(),
                            onRefresh: _loading ? null : _load,
                            refreshing: _loading && _code != null,
                          ),
                        ),
                      ),
                      if (_loading && _code == null)
                        const SliverFillRemaining(
                          hasScrollBody: false,
                          child: Center(
                            child: _LoadingMark(),
                          ),
                        )
                      else if (_error != null && _code == null)
                        SliverFillRemaining(
                          hasScrollBody: false,
                          child: EmptyState(
                            title: 'Could not load QR',
                            subtitle: _error!,
                            actionLabel: 'Retry',
                            onAction: _load,
                            icon: Icons.error_outline_rounded,
                          ),
                        )
                      else if (_code != null)
                        SliverToBoxAdapter(
                          child: Padding(
                            padding: EdgeInsets.fromLTRB(20, 12, 20, bottom + 28),
                            child: AnimatedBuilder(
                              animation: _enter,
                              builder: (context, _) {
                                return AppMotion.fadeSlide(
                                  animation: _enter,
                                  begin: const Offset(0, 0.05),
                                  child: Column(
                                    children: [
                                      _BrandLine(brand: AppConfig.brandName),
                                      const SizedBox(height: 10),
                                      Text(
                                        'Your check-in',
                                        textAlign: TextAlign.center,
                                        style: Theme.of(context)
                                            .textTheme
                                            .headlineLarge
                                            ?.copyWith(
                                              fontSize: 34,
                                              height: 1.05,
                                              letterSpacing: -0.9,
                                            ),
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        'Hold this screen at the desk.\nStaff will scan to check you in.',
                                        textAlign: TextAlign.center,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodyMedium
                                            ?.copyWith(
                                              color: AppColors.inkSoft,
                                              height: 1.45,
                                            ),
                                      ),
                                      const SizedBox(height: 28),
                                      _LiveChip(
                                        pulse: _pulse,
                                        label: _secondsLeft > 0
                                            ? 'Live · $_timerLabel left'
                                            : 'Refreshing code…',
                                      ),
                                      const SizedBox(height: 22),
                                      ScaleTransition(
                                        scale: Tween<double>(begin: 0.92, end: 1)
                                            .animate(
                                          CurvedAnimation(
                                            parent: _qrPop,
                                            curve: AppMotion.easeOut,
                                          ),
                                        ),
                                        child: _QrHero(
                                          code: _code!,
                                          progress: _progress,
                                          secondsLeft: _secondsLeft,
                                        ),
                                      ),
                                      const SizedBox(height: 26),
                                      _IdentityStrip(
                                        initials: _initials,
                                        name: _name ?? 'Customer',
                                        phone: _phone ?? '',
                                      ),
                                      if (_error != null) ...[
                                        const SizedBox(height: 14),
                                        Text(
                                          _error!,
                                          textAlign: TextAlign.center,
                                          style: const TextStyle(
                                            color: AppColors.danger,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ],
                                      const SizedBox(height: 28),
                                      const _HowItWorks(),
                                      const SizedBox(height: 22),
                                      AppButton(
                                        label: 'Refresh code',
                                        secondary: true,
                                        loading: _loading,
                                        onPressed: _loading ? null : _load,
                                      ),
                                    ],
                                  ),
                                );
                              },
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

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.onBack,
    required this.onRefresh,
    required this.refreshing,
  });

  final VoidCallback onBack;
  final VoidCallback? onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _RoundIconButton(
          icon: Icons.arrow_back_ios_new_rounded,
          onTap: onBack,
        ),
        const Spacer(),
        Text(
          'CHECK-IN',
          style: TextStyle(
            color: AppColors.muted,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.6,
          ),
        ),
        const Spacer(),
        _RoundIconButton(
          icon: Icons.refresh_rounded,
          onTap: onRefresh,
          spinning: refreshing,
        ),
      ],
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({
    required this.icon,
    this.onTap,
    this.spinning = false,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final bool spinning;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.72),
      shape: const CircleBorder(
        side: BorderSide(color: AppColors.line),
      ),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 42,
          height: 42,
          child: spinning
              ? const Padding(
                  padding: EdgeInsets.all(11),
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.blushDeep,
                  ),
                )
              : Icon(icon, size: 18, color: AppColors.ink),
        ),
      ),
    );
  }
}

class _BrandLine extends StatelessWidget {
  const _BrandLine({required this.brand});

  final String brand;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: const BoxDecoration(
            color: AppColors.blush,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          brand.toUpperCase(),
          style: const TextStyle(
            color: AppColors.blushDeep,
            fontWeight: FontWeight.w700,
            fontSize: 11,
            letterSpacing: 1.4,
          ),
        ),
      ],
    );
  }
}

class _LiveChip extends StatelessWidget {
  const _LiveChip({required this.pulse, required this.label});

  final Animation<double> pulse;
  final String label;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: pulse,
      builder: (context, _) {
        final t = pulse.value;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.successSoft,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: AppColors.success.withValues(alpha: 0.18 + t * 0.12),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: 0.55 + t * 0.45),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  color: AppColors.success,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _QrHero extends StatelessWidget {
  const _QrHero({
    required this.code,
    required this.progress,
    required this.secondsLeft,
  });

  final String code;
  final double progress;
  final int secondsLeft;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 292,
      height: 292,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: const Size(292, 292),
            painter: _RingPainter(
              progress: progress,
              trackColor: AppColors.line,
              progressColor: secondsLeft < 30
                  ? AppColors.warning
                  : AppColors.blushDeep,
            ),
          ),
          Container(
            width: 248,
            height: 248,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: AppColors.line),
              boxShadow: [
                BoxShadow(
                  color: AppColors.ink.withValues(alpha: 0.05),
                  blurRadius: 28,
                  offset: const Offset(0, 14),
                ),
              ],
            ),
            child: QrImageView(
              data: code,
              version: QrVersions.auto,
              backgroundColor: Colors.white,
              eyeStyle: const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color: AppColors.ink,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color: AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.progress,
    required this.trackColor,
    required this.progressColor,
  });

  final double progress;
  final Color trackColor;
  final Color progressColor;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.shortestSide / 2) - 5;
    final track = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round;
    final active = Paint()
      ..color = progressColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(center, radius, track);
    final sweep = 2 * math.pi * progress.clamp(0.0, 1.0);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      sweep,
      false,
      active,
    );
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.progressColor != progressColor;
  }
}

class _IdentityStrip extends StatelessWidget {
  const _IdentityStrip({
    required this.initials,
    required this.name,
    required this.phone,
  });

  final String initials;
  final String name;
  final String phone;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.washTop, AppColors.blushSoft],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.blush,
              shape: BoxShape.circle,
            ),
            child: Text(
              initials,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: AppColors.ink,
                      ),
                ),
                if (phone.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    phone,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.inkSoft,
                          fontSize: 13,
                        ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HowItWorks extends StatelessWidget {
  const _HowItWorks();

  @override
  Widget build(BuildContext context) {
    const steps = [
      ('1', 'Open this screen at the salon'),
      ('2', 'Staff scans your code'),
      ('3', 'You are checked in'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'HOW IT WORKS',
          style: TextStyle(
            color: AppColors.muted,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 12),
        ...steps.map((s) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Text(
                    s.$1,
                    style: const TextStyle(
                      color: AppColors.blushDeep,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    s.$2,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppColors.inkSoft,
                        ),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _LoadingMark extends StatelessWidget {
  const _LoadingMark();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: AppColors.line),
          ),
          child: const Padding(
            padding: EdgeInsets.all(20),
            child: CircularProgressIndicator(
              strokeWidth: 2.4,
              color: AppColors.blush,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Preparing your code…',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppColors.muted,
              ),
        ),
      ],
    );
  }
}
