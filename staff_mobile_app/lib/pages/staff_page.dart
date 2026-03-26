import 'package:flutter/material.dart';

import '../state/app_state.dart';

class StaffPage extends StatelessWidget {
  const StaffPage({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Staff')),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: appState.staffUsers.length,
        itemBuilder: (context, index) {
          final staff = appState.staffUsers[index];
          return Card(
            child: ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(staff.displayName),
              subtitle: Text(staff.username),
              trailing: Text(staff.isActive ? 'Active' : 'Inactive'),
            ),
          );
        },
      ),
    );
  }
}
