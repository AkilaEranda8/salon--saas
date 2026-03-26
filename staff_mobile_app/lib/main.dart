import 'package:flutter/material.dart';

import 'pages/login_page.dart';
import 'state/app_state.dart';

void main() {
  runApp(const StaffOnlyApp());
}

class StaffOnlyApp extends StatelessWidget {
  const StaffOnlyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AppStateScope(
      notifier: AppState(),
      child: MaterialApp(
        title: 'Staff Mobile',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        ),
        home: const LoginPage(),
      ),
    );
  }
}
