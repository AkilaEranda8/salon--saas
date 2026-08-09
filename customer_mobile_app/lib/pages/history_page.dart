import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'appointments_page.dart';
import 'login_page.dart';

class HistoryPage extends StatelessWidget {
  const HistoryPage({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppColors.surface,
        appBar: AppBar(
          backgroundColor: AppColors.surface,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          title: Text(
            'History',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          bottom: TabBar(
            labelColor: AppColors.blushDeep,
            unselectedLabelColor: AppColors.muted,
            indicatorColor: AppColors.blush,
            indicatorWeight: 2.5,
            labelStyle: Theme.of(context).textTheme.titleMedium,
            tabs: const [
              Tab(text: 'Visits'),
              Tab(text: 'Products'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            AppointmentsPage(),
            _ProductsHistoryTab(),
          ],
        ),
      ),
    );
  }
}

class _ProductsHistoryTab extends StatefulWidget {
  const _ProductsHistoryTab();

  @override
  State<_ProductsHistoryTab> createState() => _ProductsHistoryTabState();
}

class _ProductsHistoryTabState extends State<_ProductsHistoryTab> {
  CustomerHistory? _data;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final state = AppStateScope.of(context);
    if (!state.isLoggedIn || state.token == null) {
      setState(() {
        _loading = false;
        _data = CustomerHistory(
          visits: const [],
          usedProducts: const [],
          usedProductsSummary: const [],
        );
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await state.api.getHistory(state.token!);
      if (!mounted) return;
      setState(() {
        _data = data;
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

  String _fmtDate(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    final d = DateTime.tryParse(raw);
    if (d == null) return raw;
    return DateFormat('d MMM yyyy').format(d);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    if (!state.isLoggedIn) {
      return EmptyState(
        title: 'Products used',
        subtitle: 'Sign in to see products used during your salon visits.',
        actionLabel: 'Sign in',
        onAction: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const LoginPage()),
          );
          _load();
        },
        icon: Icons.spa_outlined,
      );
    }

    if (_loading && _data == null) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          SoftSkeleton(),
          SizedBox(height: 12),
          SoftSkeleton(),
          SizedBox(height: 12),
          SoftSkeleton(),
        ],
      );
    }

    if (_error != null && _data == null) {
      return EmptyState(
        title: 'Couldn’t load products',
        subtitle: _error!,
        actionLabel: 'Retry',
        onAction: _load,
      );
    }

    final summary = _data?.usedProductsSummary ?? const <UsedProductSummary>[];
    final log = _data?.usedProducts ?? const <UsedProductItem>[];

    if (summary.isEmpty && log.isEmpty) {
      return RefreshIndicator(
        color: AppColors.blush,
        onRefresh: _load,
        child: ListView(
          children: const [
            SizedBox(height: 80),
            EmptyState(
              title: 'No products yet',
              subtitle:
                  'Products used during your appointments will appear here.',
              icon: Icons.spa_outlined,
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.blush,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        children: [
          if (summary.isNotEmpty) ...[
            Text(
              'Previously used',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 6),
            Text(
              'Products your stylist has used for you',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 14),
            ...summary.map((p) {
              final qty = p.totalQty == p.totalQty.roundToDouble()
                  ? p.totalQty.toInt().toString()
                  : p.totalQty.toStringAsFixed(1);
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppColors.line),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppColors.blushSoft,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.spa_rounded,
                        color: AppColors.blushDeep,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            p.name,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            [
                              '${p.timesUsed}× used',
                              if (p.lastUsed != null)
                                'Last ${_fmtDate(p.lastUsed)}',
                            ].join(' · '),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    Text(
                      '$qty ${p.unit}',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: AppColors.blushDeep,
                          ),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: 18),
          ],
          if (log.isNotEmpty) ...[
            Text(
              'Recent usage',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            ...log.map((row) {
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            row.productName ?? 'Product',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        Text(
                          row.qtyLabel,
                          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                                color: AppColors.inkSoft,
                              ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      [
                        _fmtDate(row.consumptionDate),
                        if ((row.serviceName ?? '').isNotEmpty) row.serviceName!,
                        if ((row.staffName ?? '').isNotEmpty) row.staffName!,
                      ].where((s) => s.isNotEmpty).join(' · '),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}
