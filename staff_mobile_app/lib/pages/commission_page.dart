import 'package:flutter/material.dart';

class CommissionPage extends StatelessWidget {
  const CommissionPage({super.key});

  @override
  Widget build(BuildContext context) {
    const rows = [
      ('Nadeesha', 'LKR 12,000'),
      ('Kavindu', 'LKR 9,500'),
      ('Sachini', 'LKR 5,000'),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Commission')),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: rows.length,
        itemBuilder: (context, index) {
          final row = rows[index];
          return Card(
            child: ListTile(
              leading: const Icon(Icons.monetization_on_outlined),
              title: Text(row.$1),
              trailing: Text(row.$2),
            ),
          );
        },
      ),
    );
  }
}
