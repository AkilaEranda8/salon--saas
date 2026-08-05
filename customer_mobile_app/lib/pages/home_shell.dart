import 'package:flutter/material.dart';

import '../config.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'appointments_page.dart';
import 'book/book_flow_page.dart';
import 'login_page.dart';
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

  Future<void> _onTap(int i) async {
    if (i == 1 || i == 3) {
      final ok = await ensureLoggedIn(context);
      if (!ok) return;
    }
    setState(() => _index = i);
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      const BookFlowPage(),
      const AppointmentsPage(),
      const OffersPage(),
      const ProfilePage(),
    ];

    return AtmosphereBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          bottom: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.brandName.isEmpty ? AppConfig.brandName : widget.brandName,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                    ),
                    if (!AppStateScope.of(context).isLoggedIn)
                      TextButton(
                        onPressed: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => const LoginPage()),
                          );
                        },
                        child: const Text(
                          'Sign in',
                          style: TextStyle(
                            color: AppColors.blushDeep,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: IndexedStack(
                  index: _index,
                  children: pages,
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: AppColors.line)),
          ),
          child: SafeArea(
            top: false,
            child: BottomNavigationBar(
              currentIndex: _index,
              onTap: _onTap,
              items: const [
                BottomNavigationBarItem(icon: Icon(Icons.calendar_month_outlined), label: 'Book'),
                BottomNavigationBarItem(icon: Icon(Icons.event_note_outlined), label: 'Appointments'),
                BottomNavigationBarItem(icon: Icon(Icons.local_offer_outlined), label: 'Offers'),
                BottomNavigationBarItem(icon: Icon(Icons.person_outline), label: 'Profile'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
