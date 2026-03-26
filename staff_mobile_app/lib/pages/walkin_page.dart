import 'package:flutter/material.dart';

class WalkInPage extends StatefulWidget {
  const WalkInPage({super.key});

  @override
  State<WalkInPage> createState() => _WalkInPageState();
}

class _WalkInPageState extends State<WalkInPage> {
  final List<String> _walkIns = ['Nimali - Hair Cut', 'Saman - Beard Trim'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Walk-in')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final controller = TextEditingController();
          final result = await showDialog<String>(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('Add Walk-in'),
              content: TextField(
                controller: controller,
                decoration: const InputDecoration(
                  labelText: 'Customer - Service',
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(controller.text.trim()),
                  child: const Text('Save'),
                ),
              ],
            ),
          );
          if (result == null || result.isEmpty) return;
          setState(() {
            _walkIns.insert(0, result);
          });
        },
        icon: const Icon(Icons.add),
        label: const Text('Add'),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _walkIns.length,
        itemBuilder: (context, index) => Card(
          child: ListTile(
            leading: const Icon(Icons.directions_walk),
            title: Text(_walkIns[index]),
          ),
        ),
      ),
    );
  }
}
