import 'package:flutter/material.dart';

import '../state/app_state.dart';
import 'inv_consumption_page.dart';
import 'inv_day_end_page.dart';
import 'inv_stock_management_page.dart';
import 'inv_stock_history_page.dart';

const _forest = Color(0xFF1B3A2D);
const _canvas = Color(0xFFF2F5F2);
const _surface = Color(0xFFFFFFFF);
const _border = Color(0xFFE5E7EB);
const _ink = Color(0xFF111827);
const _muted = Color(0xFF6B7280);

class InventoryPage extends StatelessWidget {
  const InventoryPage({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppStateScope.of(context);
    final allowed = app.canAccessInventory;

    if (!allowed) {
      return Scaffold(
        backgroundColor: _canvas,
        appBar: AppBar(
          backgroundColor: _forest,
          foregroundColor: Colors.white,
          elevation: 0,
          title: const Text(
            'Inventory',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
        ),
        body: const Center(
          child: Text(
            'Inventory access is not enabled.',
            style: TextStyle(color: _muted, fontWeight: FontWeight.w600),
          ),
        ),
      );
    }

    final actions = <_InventoryAction>[
      if (app.canManageInventoryStock)
        const _InventoryAction(
          title: 'Products',
          subtitle: 'Catalog, opening stock, edit & deactivate',
          icon: Icons.inventory_2_rounded,
          color: Color(0xFFD97706),
          page: InvStockManagementPage(initialTab: 0),
        ),
      if (app.canManageInventoryStock)
        const _InventoryAction(
          title: 'Goods Received',
          subtitle: 'GRN — receive goods and increase stock',
          icon: Icons.local_shipping_rounded,
          color: Color(0xFF059669),
          page: InvStockManagementPage(initialTab: 1),
        ),
      const _InventoryAction(
        title: 'Usage',
        subtitle: 'Record consumable usage (pending until day end)',
        icon: Icons.science_rounded,
        color: Color(0xFF0F766E),
        page: InvConsumptionPage(),
      ),
      const _InventoryAction(
        title: 'Day End',
        subtitle: 'Confirm usage and deduct stock',
        icon: Icons.task_alt_rounded,
        color: Color(0xFF2563EB),
        page: InvDayEndPage(),
      ),
      if (app.canManageInventoryStock)
        const _InventoryAction(
          title: 'Adjustments',
          subtitle: 'Immediate stock + or − with reason',
          icon: Icons.tune_rounded,
          color: Color(0xFF7C3AED),
          page: InvStockManagementPage(initialTab: 2),
        ),
      const _InventoryAction(
        title: 'History',
        subtitle: 'View every stock movement',
        icon: Icons.history_rounded,
        color: Color(0xFF9333EA),
        page: InvStockHistoryPage(),
      ),
    ];

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        backgroundColor: _forest,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Inventory',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
        ),
      ),
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          Container(
            color: _forest,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 22),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded, color: Color(0xFF86EFAC), size: 20),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Daily inventory flow',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Usage stays pending during the day. Stock decreases only when Day End Closing is completed.',
                          style: TextStyle(
                            color: Colors.white70,
                            fontSize: 12.5,
                            height: 1.4,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            child: Column(
              children: [
                for (final item in actions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _ActionCard(item: item),
                  ),
              ],
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
    required this.color,
    required this.page,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final Widget page;
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({required this.item});
  final _InventoryAction item;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: _surface,
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
            border: Border.all(color: _border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: item.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(item.icon, color: item.color, size: 24),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      style: const TextStyle(
                        color: _ink,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.2,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      item.subtitle,
                      style: const TextStyle(
                        color: _muted,
                        fontSize: 12.5,
                        height: 1.3,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: _canvas,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.chevron_right_rounded,
                  color: _muted,
                  size: 20,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
