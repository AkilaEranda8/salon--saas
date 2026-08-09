import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class AtmosphereBackground extends StatelessWidget {
  const AtmosphereBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.washTop, AppColors.washBottom],
        ),
      ),
      child: child,
    );
  }
}

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.secondary = false,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool secondary;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    final child = loading
        ? const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
          )
        : Text(label);

    final button = secondary
        ? OutlinedButton(
            onPressed: enabled ? onPressed : null,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.ink,
              side: const BorderSide(color: AppColors.line),
              minimumSize: const Size(48, 52),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            child: child,
          )
        : FilledButton(
            onPressed: enabled ? onPressed : null,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.blush,
              disabledBackgroundColor: AppColors.blush.withValues(alpha: 0.35),
              foregroundColor: Colors.white,
              minimumSize: const Size(48, 52),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            child: child,
          );

    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    required this.subtitle,
    this.actionLabel,
    this.onAction,
    this.icon = Icons.spa_outlined,
  });

  final String title;
  final String subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppColors.blushSoft,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Icon(icon, color: AppColors.blushDeep, size: 34),
            ),
            const SizedBox(height: 18),
            Text(title, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(subtitle, style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 20),
              AppButton(label: actionLabel!, onPressed: onAction, expand: false),
            ],
          ],
        ),
      ),
    );
  }
}

class SoftSkeleton extends StatelessWidget {
  const SoftSkeleton({super.key, this.height = 72, this.width = double.infinity});

  final double height;
  final double width;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.line.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
      ),
    );
  }
}

class StepHeader extends StatelessWidget {
  const StepHeader({
    super.key,
    required this.step,
    required this.total,
    required this.title,
    this.subtitle,
  });

  final int step;
  final int total;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: List.generate(total, (i) {
            final active = i < step;
            return Expanded(
              child: Container(
                height: 4,
                margin: EdgeInsets.only(right: i == total - 1 ? 0 : 6),
                decoration: BoxDecoration(
                  color: active ? AppColors.blush : AppColors.line,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 18),
        Text(title, style: Theme.of(context).textTheme.headlineMedium),
        if (subtitle != null) ...[
          const SizedBox(height: 6),
          Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
        ],
      ],
    );
  }
}

class ServiceTile extends StatelessWidget {
  const ServiceTile({
    super.key,
    required this.service,
    required this.selected,
    required this.onTap,
  });

  final dynamic service;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = '${service.name}';
    final mins = service.durationMinutes as int? ?? 30;
    final imageUrl = service.imageUrl?.toString();
    final price = service.price is num
        ? (service.price as num).toDouble()
        : double.tryParse('${service.price ?? ''}');
    final category = '${service.category ?? ''}';

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? AppColors.blush : AppColors.line,
              width: selected ? 2 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 5,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (imageUrl != null && imageUrl.isNotEmpty)
                      Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => _ServiceImageFallback(category: category),
                      )
                    else
                      _ServiceImageFallback(category: category),
                    if (selected)
                      Container(
                        color: AppColors.blush.withValues(alpha: 0.18),
                      ),
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          color: selected ? AppColors.blushDeep : Colors.white.withValues(alpha: 0.9),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: selected ? AppColors.blushDeep : AppColors.line,
                          ),
                        ),
                        child: Icon(
                          selected ? Icons.check_rounded : Icons.add_rounded,
                          size: 16,
                          color: selected ? Colors.white : AppColors.inkSoft,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                flex: 4,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.ink,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          height: 1.25,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        '$mins min',
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (price != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          'Rs. ${price % 1 == 0 ? price.toInt() : price.toStringAsFixed(0)}',
                          style: const TextStyle(
                            color: AppColors.blushDeep,
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
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
      ),
    );
  }
}

class _ServiceImageFallback extends StatelessWidget {
  const _ServiceImageFallback({required this.category});

  final String category;

  IconData get _icon {
    final c = category.toLowerCase();
    if (c.contains('hair')) return Icons.content_cut_rounded;
    if (c.contains('nail')) return Icons.back_hand_outlined;
    if (c.contains('skin') || c.contains('facial')) return Icons.spa_outlined;
    if (c.contains('spa') || c.contains('massage')) return Icons.self_improvement_outlined;
    if (c.contains('make')) return Icons.brush_outlined;
    return Icons.spa_outlined;
  }

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.washTop,
            AppColors.blushSoft,
            AppColors.washBottom,
          ],
        ),
      ),
      child: Center(
        child: Icon(_icon, size: 36, color: AppColors.blushDeep.withValues(alpha: 0.75)),
      ),
    );
  }
}

class OfferCard extends StatelessWidget {
  const OfferCard({super.key, required this.offer, this.index = 0});

  final dynamic offer;
  final int index;

  @override
  Widget build(BuildContext context) {
    final title = '${offer.title}';
    final body = '${offer.body}';
    final starts = offer.startsAt?.toString();
    final ends = offer.endsAt?.toString();
    final imageUrl = offer.imageUrl?.toString();

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 280 + (index * 60)),
      curve: Curves.easeOutCubic,
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(offset: Offset(0, (1 - t) * 12), child: child),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (imageUrl != null && imageUrl.isNotEmpty)
              AspectRatio(
                aspectRatio: 16 / 7,
                child: Image.network(
                  imageUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => _placeholder(),
                ),
              )
            else
              _placeholder(),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text(body, style: Theme.of(context).textTheme.bodyMedium),
                  if ((starts != null && starts.isNotEmpty) || (ends != null && ends.isNotEmpty)) ...[
                    const SizedBox(height: 12),
                    Text(
                      'Valid ${(starts ?? '—').toString().substring(0, (starts ?? '—').length.clamp(0, 10))} → ${(ends ?? '—').toString().substring(0, (ends ?? '—').length.clamp(0, 10))}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.blushDeep),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholder() {
    return Container(
      height: 88,
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.blushSoft, AppColors.washTop],
        ),
      ),
      child: const Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: EdgeInsets.only(left: 20),
          child: Icon(Icons.local_offer_outlined, color: AppColors.blushDeep, size: 28),
        ),
      ),
    );
  }
}
