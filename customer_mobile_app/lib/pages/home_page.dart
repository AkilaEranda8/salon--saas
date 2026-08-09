import 'package:flutter/material.dart';

import '../config.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_motion.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'check_in_qr_page.dart';
import 'login_page.dart';
import 'session_gate.dart';

/// Modern customer home — loyalty, deals, book categories.
class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    required this.brandName,
    required this.onOpenBook,
    required this.onOpenOffers,
    required this.onOpenProfile,
    required this.onOpenAppointments,
  });

  final String brandName;
  final VoidCallback onOpenBook;
  final VoidCallback onOpenOffers;
  final VoidCallback onOpenProfile;
  final VoidCallback onOpenAppointments;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<MobileOfferItem> _offers = [];
  List<SalonService> _services = [];
  bool _loading = true;
  String? _error;
  bool _promoDismissed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = AppStateScope.of(context).api;
      final results = await Future.wait([
        api.getOffers(),
        api.getServices(),
      ]);
      if (!mounted) return;
      setState(() {
        _offers = results[0] as List<MobileOfferItem>;
        _services = results[1] as List<SalonService>;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  List<String> get _categories {
    final set = <String>{};
    for (final s in _services) {
      final c = (s.category ?? '').trim();
      if (c.isNotEmpty) set.add(c);
    }
    final list = set.toList()..sort();
    if (list.isEmpty) {
      return ['Hair', 'Nails', 'Skin', 'Spa', 'Makeup', 'Other'];
    }
    return list;
  }

  String get _greetingName {
    final p = AppStateScope.of(context).profile;
    if (p != null && p.name.trim().isNotEmpty) {
      final parts = p.name.trim().split(RegExp(r'\s+'));
      return parts.first;
    }
    return 'there';
  }

  Future<void> _openAppointments() async {
    final ok = await ensureLoggedIn(context);
    if (!ok || !mounted) return;
    widget.onOpenAppointments();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    final brand =
        widget.brandName.isEmpty ? AppConfig.brandName : widget.brandName;
    final pts = state.profile?.loyaltyPoints ?? 0;
    final tier = _tierFor(pts);

    // Header + footer live in HomeShell — this page is content only.
    return ColoredBox(
      color: AppColors.surface,
      child: RefreshIndicator(
        color: AppColors.blush,
        displacement: 40,
        onRefresh: () async {
          await _load();
          if (state.isLoggedIn) await state.refreshProfile();
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _subtitleForNow(),
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Hello, $_greetingName',
                      style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                            color: AppColors.ink,
                            fontSize: 32,
                            height: 1.1,
                            letterSpacing: -0.8,
                          ),
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: _LoyaltyCard(
                  brandName: brand,
                  points: pts,
                  tierName: tier,
                  loggedIn: state.isLoggedIn,
                  onTap: () async {
                    if (!state.isLoggedIn) {
                      await Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const LoginPage(),
                        ),
                      );
                      return;
                    }
                    final ok = await ensureLoggedIn(context);
                    if (!ok || !mounted) return;
                    final nav = Navigator.of(context);
                    await nav.push(
                      MaterialPageRoute(builder: (_) => const CheckInQrPage()),
                    );
                  },
                ),
              ),
            ),
            // Content sheet
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.only(top: 24),
                decoration: const BoxDecoration(
                  color: AppColors.washTop,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 8),
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AppColors.line,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                    if (_loading)
                      const Padding(
                        padding: EdgeInsets.fromLTRB(20, 24, 20, 40),
                        child: Column(
                          children: [
                            SoftSkeleton(height: 110),
                            SizedBox(height: 16),
                            SoftSkeleton(height: 150),
                          ],
                        ),
                      )
                    else if (_error != null &&
                        _offers.isEmpty &&
                        _services.isEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
                        child: EmptyState(
                          title: 'Couldn’t load home',
                          subtitle: _error!,
                          actionLabel: 'Retry',
                          onAction: _load,
                          icon: Icons.wifi_off_outlined,
                        ),
                      )
                    else ...[
                      if (!_promoDismissed && _offers.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                          child: _PromoBanner(
                            offer: _offers.first,
                            onDismiss: () =>
                                setState(() => _promoDismissed = true),
                            onTap: widget.onOpenOffers,
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 26, 12, 0),
                        child: _SectionHeader(
                          title: 'Deals for you',
                          onTap: widget.onOpenOffers,
                        ),
                      ),
                      SizedBox(
                        height: 196,
                        child: _offers.isEmpty
                            ? const Padding(
                                padding: EdgeInsets.fromLTRB(20, 14, 20, 0),
                                child: _EmptyDealHint(),
                              )
                            : ListView.separated(
                                scrollDirection: Axis.horizontal,
                                padding:
                                    const EdgeInsets.fromLTRB(20, 14, 20, 0),
                                itemCount: _offers.length,
                                separatorBuilder: (_, _) =>
                                    const SizedBox(width: 14),
                                itemBuilder: (context, i) {
                                  return TweenAnimationBuilder<double>(
                                    tween: Tween(begin: 0, end: 1),
                                    duration:
                                        Duration(milliseconds: 320 + i * 55),
                                    curve: AppMotion.easeOut,
                                    builder: (context, t, child) => Opacity(
                                      opacity: t,
                                      child: Transform.translate(
                                        offset: Offset((1 - t) * 18, 0),
                                        child: child,
                                      ),
                                    ),
                                    child: _DealCard(
                                      offer: _offers[i],
                                      onTap: widget.onOpenOffers,
                                    ),
                                  );
                                },
                              ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 28, 20, 0),
                        child: _BookServiceSection(
                          categories: _categories,
                          services: _services,
                          onOpenBook: widget.onOpenBook,
                          iconForCategory: _iconForCategory,
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 28, 20, 110),
                        child: _QuickRow(
                          onBook: widget.onOpenBook,
                          onAppointments: _openAppointments,
                          onOffers: widget.onOpenOffers,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _subtitleForNow() {
  final h = DateTime.now().hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

String _tierFor(int pts) {
  if (pts >= 5000) return 'Platinum';
  if (pts >= 1500) return 'Gold';
  if (pts >= 500) return 'Silver';
  if (pts >= 50) return 'Bronze';
  return 'Entry';
}

IconData _iconForCategory(String cat) {
  final c = cat.toLowerCase();
  if (c.contains('nail')) return Icons.back_hand_outlined;
  if (c.contains('skin') || c.contains('facial')) return Icons.spa_outlined;
  if (c.contains('spa') || c.contains('massage')) {
    return Icons.self_improvement_outlined;
  }
  if (c.contains('make')) return Icons.brush_outlined;
  if (c.contains('beard') || c.contains('barber')) {
    return Icons.content_cut_rounded;
  }
  return Icons.content_cut_rounded;
}

class _LoyaltyCard extends StatelessWidget {
  const _LoyaltyCard({
    required this.brandName,
    required this.points,
    required this.tierName,
    required this.loggedIn,
    required this.onTap,
  });

  final String brandName;
  final int points;
  final String tierName;
  final bool loggedIn;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.accentMid,
                AppColors.blush,
                AppColors.blushDeep,
                AppColors.blushDeep,
              ],
              stops: [0.0, 0.35, 0.72, 1.0],
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.95),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      brandName.toUpperCase(),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.92),
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      loggedIn ? 'Check-in QR' : 'Sign in',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    Icon(
                      loggedIn ? Icons.qr_code_2_rounded : Icons.arrow_outward_rounded,
                      size: 16,
                      color: Colors.white.withValues(alpha: 0.85),
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'POINTS',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.72),
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.0,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            loggedIn ? '$points' : '—',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 36,
                              fontWeight: FontWeight.w600,
                              height: 1,
                              letterSpacing: -1.2,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.28),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'TIER',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.7),
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.8,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            loggedIn ? tierName : 'Guest',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PromoBanner extends StatelessWidget {
  const _PromoBanner({
    required this.offer,
    required this.onDismiss,
    required this.onTap,
  });

  final MobileOfferItem offer;
  final VoidCallback onDismiss;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(22),
            child: Ink(
              height: 124,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppColors.washTop, AppColors.blushSoft],
                ),
                border: Border.all(color: AppColors.line),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: Row(
                  children: [
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(18, 16, 10, 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: AppColors.line),
                              ),
                              child: const Text(
                                'FEATURED',
                                style: TextStyle(
                                  color: AppColors.blushDeep,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              offer.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.ink,
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                                height: 1.2,
                                letterSpacing: -0.2,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              offer.body,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.inkSoft,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (offer.imageUrl != null && offer.imageUrl!.isNotEmpty)
                      SizedBox(
                        width: 108,
                        height: double.infinity,
                        child: Image.network(
                          offer.imageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) =>
                              const SizedBox.shrink(),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
        Positioned(
          top: 8,
          right: 8,
          child: Material(
            color: Colors.white,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onDismiss,
              child: const Padding(
                padding: EdgeInsets.all(5),
                child: Icon(Icons.close_rounded, size: 15, color: AppColors.inkSoft),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.onTap});

  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontSize: 22,
                    letterSpacing: -0.4,
                  ),
            ),
          ),
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.line),
            ),
            child: const Icon(
              Icons.arrow_forward_rounded,
              size: 18,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
    );
  }
}

class _DealCard extends StatelessWidget {
  const _DealCard({required this.offer, required this.onTap});

  final MobileOfferItem offer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: SizedBox(
          width: 160,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(20),
                  ),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (offer.imageUrl != null && offer.imageUrl!.isNotEmpty)
                        Image.network(
                          offer.imageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) =>
                              _imgFallback(),
                        )
                      else
                        _imgFallback(),
                      Positioned(
                        top: 10,
                        left: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.gold,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            offer.displayBadge ?? 'Deal',
                            style: const TextStyle(
                              color: AppColors.ink,
                              fontWeight: FontWeight.w800,
                              fontSize: 11,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Text(
                  offer.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                    height: 1.25,
                    letterSpacing: -0.1,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _imgFallback() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.blushSoft, AppColors.washTop],
        ),
      ),
      child: const Center(
        child: Icon(Icons.local_offer_outlined, color: AppColors.blushDeep),
      ),
    );
  }
}

class _EmptyDealHint extends StatelessWidget {
  const _EmptyDealHint();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 160,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        'Fresh deals coming soon',
        style: Theme.of(context).textTheme.bodyMedium,
      ),
    );
  }
}

class _BookServiceSection extends StatelessWidget {
  const _BookServiceSection({
    required this.categories,
    required this.services,
    required this.onOpenBook,
    required this.iconForCategory,
  });

  final List<String> categories;
  final List<SalonService> services;
  final VoidCallback onOpenBook;
  final IconData Function(String) iconForCategory;

  int _countFor(String cat) {
    final key = cat.trim().toLowerCase();
    return services.where((s) {
      final c = (s.category ?? '').trim().toLowerCase();
      return c == key;
    }).length;
  }

  @override
  Widget build(BuildContext context) {
    final cats = categories.take(8).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Book a service',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontSize: 22,
                letterSpacing: -0.4,
                color: AppColors.ink,
              ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Pick a category — we’ll guide you to a time.',
          style: TextStyle(
            color: AppColors.muted,
            fontSize: 13.5,
            height: 1.35,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 16),
        TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: AppMotion.normal,
          curve: AppMotion.easeOut,
          builder: (context, t, child) => Opacity(
            opacity: t,
            child: Transform.translate(
              offset: Offset(0, (1 - t) * 12),
              child: child,
            ),
          ),
          child: _BookHeroCta(onTap: onOpenBook),
        ),
        const SizedBox(height: 18),
        SizedBox(
          height: 132,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: cats.length + 1,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (context, i) {
              if (i == cats.length) {
                return TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: 1),
                  duration: Duration(milliseconds: 280 + i * 40),
                  curve: AppMotion.easeOut,
                  builder: (context, t, child) => Opacity(
                    opacity: t,
                    child: Transform.translate(
                      offset: Offset((1 - t) * 16, 0),
                      child: child,
                    ),
                  ),
                  child: _BookSeeAllTile(onTap: onOpenBook),
                );
              }
              final cat = cats[i];
              final count = _countFor(cat);
              return TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: Duration(milliseconds: 280 + i * 40),
                curve: AppMotion.easeOut,
                builder: (context, t, child) => Opacity(
                  opacity: t,
                  child: Transform.translate(
                    offset: Offset((1 - t) * 16, 0),
                    child: child,
                  ),
                ),
                child: _BookCategoryTile(
                  label: cat,
                  icon: iconForCategory(cat),
                  count: count,
                  onTap: onOpenBook,
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _BookHeroCta extends StatelessWidget {
  const _BookHeroCta({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Ink(
          height: 92,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.accentMid,
                AppColors.blush,
                AppColors.blushDeep,
              ],
              stops: [0.0, 0.55, 1.0],
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                right: -18,
                top: -24,
                child: Container(
                  width: 110,
                  height: 110,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.1),
                  ),
                ),
              ),
              Positioned(
                right: 36,
                bottom: -36,
                child: Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.08),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 16, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Book now',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 18,
                                  letterSpacing: -0.3,
                                ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Services · stylist · time',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.88),
                              fontSize: 12.5,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.28),
                        ),
                      ),
                      child: const Icon(
                        Icons.arrow_forward_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BookCategoryTile extends StatelessWidget {
  const _BookCategoryTile({
    required this.label,
    required this.icon,
    required this.count,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          width: 118,
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.line),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.blushSoft, AppColors.washTop],
                    ),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(icon, color: AppColors.blushDeep, size: 20),
                ),
                const Spacer(),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  count > 0 ? '$count services' : 'Explore',
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    color: AppColors.muted,
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

class _BookSeeAllTile extends StatelessWidget {
  const _BookSeeAllTile({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          width: 104,
          decoration: BoxDecoration(
            color: AppColors.blushSoft,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.blush.withValues(alpha: 0.22)),
          ),
          child: const Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.grid_view_rounded, color: AppColors.blushDeep, size: 22),
              SizedBox(height: 10),
              Text(
                'See all',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: AppColors.blushDeep,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickRow extends StatelessWidget {
  const _QuickRow({
    required this.onBook,
    required this.onAppointments,
    required this.onOffers,
  });

  final VoidCallback onBook;
  final VoidCallback onAppointments;
  final VoidCallback onOffers;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _QuickTile(
            icon: Icons.calendar_month_outlined,
            label: 'Book',
            onTap: onBook,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _QuickTile(
            icon: Icons.history_rounded,
            label: 'History',
            onTap: onAppointments,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _QuickTile(
            icon: Icons.local_offer_outlined,
            label: 'Offers',
            onTap: onOffers,
          ),
        ),
      ],
    );
  }
}

class _QuickTile extends StatelessWidget {
  const _QuickTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            children: [
              Icon(icon, color: AppColors.blushDeep, size: 22),
              const SizedBox(height: 8),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
