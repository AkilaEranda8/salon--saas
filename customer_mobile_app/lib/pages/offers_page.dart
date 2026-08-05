import 'package:flutter/material.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class OffersPage extends StatefulWidget {
  const OffersPage({super.key});

  @override
  State<OffersPage> createState() => _OffersPageState();
}

class _OffersPageState extends State<OffersPage> {
  List<MobileOfferItem>? _offers;
  String? _error;
  bool _loading = true;

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
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _offers == null) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          SoftSkeleton(height: 160),
          SizedBox(height: 14),
          SoftSkeleton(height: 160),
        ],
      );
    }

    if (_error != null && (_offers == null || _offers!.isEmpty)) {
      return EmptyState(
        title: 'Couldn’t load offers',
        subtitle: _error!,
        actionLabel: 'Retry',
        onAction: _load,
        icon: Icons.wifi_off_outlined,
      );
    }

    final offers = _offers ?? [];
    if (offers.isEmpty) {
      return RefreshIndicator(
        color: AppColors.blush,
        onRefresh: _load,
        child: ListView(
          children: const [
            SizedBox(height: 80),
            EmptyState(
              title: 'No offers right now',
              subtitle: 'When your salon publishes a promo, it will appear here.',
              icon: Icons.local_offer_outlined,
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.blush,
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        itemCount: offers.length + 1,
        itemBuilder: (context, i) {
          if (i == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text('Offers', style: Theme.of(context).textTheme.headlineMedium),
            );
          }
          return OfferCard(offer: offers[i - 1], index: i - 1);
        },
      ),
    );
  }
}
