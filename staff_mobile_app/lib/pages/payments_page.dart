import 'package:flutter/material.dart';

class PaymentsPage extends StatelessWidget {
  const PaymentsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final payments = const [
      ('Ayesha Malik', 'LKR 4,500', 'Paid'),
      ('Hassan Raza', 'LKR 2,000', 'Pending'),
      ('Zara Ahmed', 'LKR 7,200', 'Paid'),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Payments')),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: payments.length,
        itemBuilder: (context, index) {
          final item = payments[index];
          return Card(
            child: ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: Text(item.$1),
              subtitle: Text(item.$2),
              trailing: Text(item.$3),
            ),
          );
        },
      ),
    );
  }
}
