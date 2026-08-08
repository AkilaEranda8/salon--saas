import 'package:flutter/material.dart';

import '../config.dart';
import '../theme/app_theme.dart';
import 'appointments_page.dart';
import 'book/book_flow_page.dart';
import 'home_page.dart';
import 'offers_page.dart';
import 'profile_page.dart';
import 'session_gate.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({
    super.key,
    required this.brandName,
    this.initiallyLoggedIn = false,
  });

  final String brandName;
  final bool initiallyLoggedIn;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  void _go(int i) => setState(() => _index = i);

  Future<void> _onTap(int i) async {
    if (i == 3) {
      final ok = await ensureLoggedIn(context);
      if (!ok) return;
    }
    _go(i);
  }

  @override
  Widget build(BuildContext context) {
    final brand = widget.brandName.isEmpty ? AppConfig.brandName : widget.brandName;

    final pages = <Widget>[
      HomePage(
        brandName: brand,
        onOpenBook: () => _go(1),
        onOpenOffers: () => _go(2),
        onOpenProfile: () async {
          final ok = await ensureLoggedIn(context);
          if (ok && mounted) _go(3);
        },
        onOpenAppointments: () async {
          final nav = Navigator.of(context);
          final ok = await ensureLoggedIn(context);
          if (!mounted || !ok) return;
          await nav.push(
            MaterialPageRoute(builder: (_) => const AppointmentsPage()),
          );
        },
      ),
      const BookFlowPage(),
      const OffersPage(),
      const ProfilePage(),
    ];

    return Scaffold(
      backgroundColor: AppColors.surface,
      extendBody: true,
      body: IndexedStack(
        index: _index,
        children: [
          pages[0],
          SafeArea(child: pages[1]),
          SafeArea(child: pages[2]),
          SafeArea(child: pages[3]),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              _NavItem(
                icon: Icons.home_outlined,
                activeIcon: Icons.home_rounded,
                label: 'Home',
                selected: _index == 0,
                onTap: () => _onTap(0),
              ),
              _NavItem(
                icon: Icons.calendar_month_outlined,
                activeIcon: Icons.calendar_month_rounded,
                label: 'Book',
                selected: _index == 1,
                onTap: () => _onTap(1),
              ),
              _NavItem(
                icon: Icons.local_offer_outlined,
                activeIcon: Icons.local_offer_rounded,
                label: 'Offers',
                selected: _index == 2,
                onTap: () => _onTap(2),
              ),
              _NavItem(
                icon: Icons.person_outline_rounded,
                activeIcon: Icons.person_rounded,
                label: 'Profile',
                selected: _index == 3,
                onTap: () => _onTap(3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? AppColors.ink : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                selected ? activeIcon : icon,
                size: 21,
                color: selected ? Colors.white : AppColors.muted,
              ),
              const SizedBox(height: 3),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? Colors.white : AppColors.muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
