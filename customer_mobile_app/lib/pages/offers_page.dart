import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

/// Keells-style deals list fed by server mobile offers.
class OffersPage extends StatefulWidget {
  const OffersPage({super.key});

  @override
  State<OffersPage> createState() => _OffersPageState();
}

class _OffersPageState extends State<OffersPage> {
  List<MobileOfferItem>? _offers;
  String? _error;
  bool _loading = true;
  String _category = 'All deals';

  static final _money = NumberFormat('#,##0', 'en_US');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await AppStateScope.of(context).api.getOffers();
      if (!mounted) return;
      setState(() {
        _offers = rows;
        _loading = false;
        if (_category != 'All deals' &&
            !rows.any((o) => o.categoryLabel == _category)) {
          _category = 'All deals';
        }
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
    for (final o in _offers ?? const <MobileOfferItem>[]) {
      set.add(o.categoryLabel);
    }
    final cats = set.toList()..sort();
    return ['All deals', ...cats];
  }

  List<MobileOfferItem> get _filtered {
    final all = _offers ?? const <MobileOfferItem>[];
    if (_category == 'All deals') return all;
    return all.where((o) => o.categoryLabel == _category).toList();
  }

  void _openDetail(MobileOfferItem offer) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
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
              const SizedBox(height: 16),
              Text(
                offer.title,
                style: Theme.of(ctx).textTheme.headlineSmall,
              ),
              const SizedBox(height: 10),
              Text(
                offer.body,
                style: Theme.of(ctx).textTheme.bodyMedium,
              ),
              if (offer.daysLeftLabel != null) ...[
                const SizedBox(height: 12),
                Text(
                  offer.daysLeftLabel!,
                  style: const TextStyle(
                    color: AppColors.blushDeep,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _offers == null) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          SoftSkeleton(height: 44),
          SizedBox(height: 14),
          SoftSkeleton(height: 96),
          SizedBox(height: 10),
          SoftSkeleton(height: 96),
          SizedBox(height: 10),
          SoftSkeleton(height: 96),
        ],
      );
    }

    if (_error != null && (_offers == null || _offers!.isEmpty)) {
      return EmptyState(
        title: 'Couldn’t load deals',
        subtitle: _error!,
        actionLabel: 'Retry',
        onAction: _load,
        icon: Icons.wifi_off_outlined,
      );
    }

    final offers = _filtered;
    final cats = _categories;

    return RefreshIndicator(
      color: AppColors.blush,
      onRefresh: _load,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Text(
                'All deals',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.3,
                    ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 56,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                scrollDirection: Axis.horizontal,
                itemCount: cats.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final cat = cats[i];
                  final selected = cat == _category;
                  return _CategoryChip(
                    label: cat,
                    selected: selected,
                    icon: _iconForCategory(cat),
                    onTap: () => setState(() => _category = cat),
                  );
                },
              ),
            ),
          ),
          if ((_offers ?? []).isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                title: 'No deals right now',
                subtitle: 'When your salon publishes a promo, it will appear here.',
                icon: Icons.local_offer_outlined,
              ),
            )
          else if (offers.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                title: 'No deals in this category',
                subtitle: 'Try another filter above.',
                icon: Icons.filter_alt_outlined,
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(0, 8, 0, 110),
              sliver: SliverList.separated(
                itemCount: offers.length,
                separatorBuilder: (_, _) => const Divider(
                  height: 1,
                  thickness: 1,
                  color: AppColors.line,
                  indent: 20,
                  endIndent: 20,
                ),
                itemBuilder: (context, i) {
                  final offer = offers[i];
                  return _DealRow(
                    offer: offer,
                    money: _money,
                    onTap: () => _openDetail(offer),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  IconData _iconForCategory(String cat) {
    final c = cat.toLowerCase();
    if (c.contains('all') || c.contains('you')) return Icons.person_outline_rounded;
    if (c.contains('hair')) return Icons.content_cut_rounded;
    if (c.contains('nail')) return Icons.back_hand_outlined;
    if (c.contains('skin') || c.contains('facial')) return Icons.spa_outlined;
    if (c.contains('package') || c.contains('bank')) return Icons.card_giftcard_outlined;
    if (c.contains('spa')) return Icons.self_improvement_outlined;
    return Icons.local_offer_outlined;
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.blushSoft : Colors.white,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected ? AppColors.blush : AppColors.line,
          width: selected ? 1.4 : 1,
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 16,
                color: selected ? AppColors.blushDeep : AppColors.muted,
              ),
              const SizedBox(width: 7),
              Text(
                label,
                style: TextStyle(
                  color: selected ? AppColors.blushDeep : AppColors.inkSoft,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DealRow extends StatelessWidget {
  const _DealRow({
    required this.offer,
    required this.money,
    required this.onTap,
  });

  final MobileOfferItem offer;
  final NumberFormat money;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final badge = offer.displayBadge;
    final left = offer.daysLeftLabel;
    final hasPrices = offer.offerPrice != null || offer.originalPrice != null;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Thumb(imageUrl: offer.imageUrl),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (badge != null || left != null)
                    Row(
                      children: [
                        if (badge != null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.gold,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              badge,
                              style: const TextStyle(
                                color: AppColors.ink,
                                fontWeight: FontWeight.w800,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        if (badge != null && left != null) const Spacer(),
                        if (left != null)
                          Text(
                            left,
                            style: const TextStyle(
                              color: AppColors.muted,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                      ],
                    ),
                  if (badge != null || left != null) const SizedBox(height: 8),
                  Text(
                    offer.title.toUpperCase(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      height: 1.25,
                      letterSpacing: 0.1,
                    ),
                  ),
                  if (hasPrices) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        if (offer.originalPrice != null) ...[
                          Text(
                            'Rs. ${money.format(offer.originalPrice)}',
                            style: const TextStyle(
                              color: AppColors.muted,
                              fontSize: 13,
                              decoration: TextDecoration.lineThrough,
                              decorationColor: AppColors.muted,
                            ),
                          ),
                          const SizedBox(width: 10),
                        ],
                        if (offer.offerPrice != null)
                          Text(
                            'Rs. ${money.format(offer.offerPrice)}',
                            style: const TextStyle(
                              color: AppColors.ink,
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                            ),
                          )
                        else if (offer.body.trim().isNotEmpty)
                          Expanded(
                            child: Text(
                              offer.body,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.inkSoft,
                                fontSize: 13,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ] else if (offer.body.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      offer.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.inkSoft,
                        fontSize: 13,
                        height: 1.35,
                      ),
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
}

class _Thumb extends StatelessWidget {
  const _Thumb({this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 72,
        height: 72,
        color: AppColors.blushSoft,
        child: imageUrl != null && imageUrl!.isNotEmpty
            ? Image.network(
                imageUrl!,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const Icon(
                  Icons.local_offer_outlined,
                  color: AppColors.blushDeep,
                ),
              )
            : const Icon(
                Icons.local_offer_outlined,
                color: AppColors.blushDeep,
              ),
      ),
    );
  }
}
