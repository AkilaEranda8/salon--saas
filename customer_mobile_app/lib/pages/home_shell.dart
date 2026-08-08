import 'package:flutter/material.dart';

import '../config.dart';
import '../theme/app_theme.dart';
import '../widgets/app_bottom_nav.dart';
import '../widgets/app_header.dart';
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

  static const _navItems = [
    AppBottomNavItem(
      icon: Icons.home_outlined,
      activeIcon: Icons.home_rounded,
      label: 'Home',
    ),
    AppBottomNavItem(
      icon: Icons.calendar_month_outlined,
      activeIcon: Icons.calendar_month_rounded,
      label: 'Book',
    ),
    AppBottomNavItem(
      icon: Icons.local_offer_outlined,
      activeIcon: Icons.local_offer_rounded,
      label: 'Offers',
    ),
    AppBottomNavItem(
      icon: Icons.person_outline_rounded,
      activeIcon: Icons.person_rounded,
      label: 'Profile',
    ),
  ];

  void _go(int i) => setState(() => _index = i);

  Future<void> _onTap(int i) async {
    if (i == 3) {
      final ok = await ensureLoggedIn(context);
      if (!ok) return;
    }
    _go(i);
  }

  Future<void> _openProfile() async {
    final ok = await ensureLoggedIn(context);
    if (ok && mounted) _go(3);
  }

  @override
  Widget build(BuildContext context) {
    final brand =
        widget.brandName.isEmpty ? AppConfig.brandName : widget.brandName;

    final pages = <Widget>[
      HomePage(
        brandName: brand,
        onOpenBook: () => _go(1),
        onOpenOffers: () => _go(2),
        onOpenProfile: _openProfile,
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
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header lives in the shell — not inside Home / Book / Offers pages.
          AppHeader(
            brandName: brand,
            onProfile: _openProfile,
          ),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: [
                pages[0],
                pages[1],
                pages[2],
                pages[3],
              ],
            ),
          ),
        ],
      ),
      // Footer menu lives in the shell — not inside page widgets.
      bottomNavigationBar: AppBottomNav(
        currentIndex: _index,
        onTap: _onTap,
        items: _navItems,
      ),
    );
  }
}
