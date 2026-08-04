import 'package:flutter/material.dart';

import '../state/app_state.dart';
import 'inv_consumption_page.dart';
import 'inv_day_end_page.dart';
import 'inv_stock_management_page.dart';
import 'inv_stock_history_page.dart';

const _forest = Color(0xFF1B3A2D);
const _canvas = Color(0xFFF2F5F2);

class InventoryPage extends StatelessWidget {
  const InventoryPage({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppStateScope.of(context);
    final allowed = app.canAccessInventory;

    if (!allowed) {
      return Scaffold(
        appBar: AppBar(
          backgroundColor: _forest,
          foregroundColor: Colors.white,
          title: const Text('Inventory'),
        ),
        body: const Center(child: Text('Inventory access is not enabled.')),
      );
    }

    final actions = <_InventoryAction>[
      if (app.canManageInventoryStock)
        const _InventoryAction(
          title: 'Products',
          subtitle: 'Catalog, opening stock, edit & deactivate',
          icon: Icons.inventory_rounded,
          colors: [Color(0xFFB45309), Color(0xFFF59E0B)],
          page: InvStockManagementPage(initialTab: 0),
        ),
      if (app.canManageInventoryStock)
        const _InventoryAction(
          title: 'Goods Received',
          subtitle: 'GRN — receive goods and increase stock',
          icon: Icons.local_shipping_rounded,
          colors: [Color(0xFF047857), Color(0xFF10B981)],
          page: InvStockManagementPage(initialTab: 1),
        ),
      const _InventoryAction(
        title: 'Usage',
        subtitle: 'Record consumable usage (pending until day end)',
        icon: Icons.science_rounded,
        colors: [Color(0xFF0F766E), Color(0xFF14B8A6)],
        page: InvConsumptionPage(),
      ),
      const _InventoryAction(
        title: 'Day End',
        subtitle: 'Confirm usage and deduct stock',
        icon: Icons.task_alt_rounded,
        colors: [Color(0xFF1D4ED8), Color(0xFF3B82F6)],
        page: InvDayEndPage(),
      ),
      if (app.canManageInventoryStock)
        const _InventoryAction(
          title: 'Adjustments',
          subtitle: 'Immediate stock + or − with reason',
          icon: Icons.tune_rounded,
          colors: [Color(0xFF9333EA), Color(0xFFC084FC)],
          page: InvStockManagementPage(initialTab: 2),
        ),
      const _InventoryAction(
        title: 'History',
        subtitle: 'View every stock movement',
        icon: Icons.history_rounded,
        colors: [Color(0xFF7C3AED), Color(0xFFA855F7)],
        page: InvStockHistoryPage(),
      ),
    ];

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        title: const Text(
          'Inventory',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFECFDF5),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFA7F3D0)),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Daily inventory flow',
                  style: TextStyle(
                    color: Color(0xFF065F46),
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 5),
                Text(
                  'Consumption stays pending during the day. Stock decreases only when an authorized user completes Day End Closing.',
                  style: TextStyle(
                    color: Color(0xFF047857),
                    fontSize: 12.5,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ...actions.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _ActionCard(item: item),
            ),
          ),
        ],
      ),
    );
  }
}

class _InventoryAction {
  const _InventoryAction({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.colors,
    required this.page,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final List<Color> colors;
  final Widget page;
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({required this.item});
  final _InventoryAction item;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(
          context,
        ).push(MaterialPageRoute(builder: (_) => item.page)),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: item.colors),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(item.icon, color: Colors.white),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      style: const TextStyle(
                        color: Color(0xFF111827),
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      item.subtitle,
                      style: const TextStyle(
                        color: Color(0xFF6B7280),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Color(0xFF9CA3AF)),
            ],
          ),
        ),
      ),
    );
  }
}
