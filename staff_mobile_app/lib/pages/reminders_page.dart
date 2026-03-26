import 'package:flutter/material.dart';

class RemindersPage extends StatefulWidget {
  const RemindersPage({super.key});

  @override
  State<RemindersPage> createState() => _RemindersPageState();
}

class _RemindersPageState extends State<RemindersPage> {
  final TextEditingController _controller = TextEditingController();
  final List<_ReminderItem> _items = [
    _ReminderItem(text: 'Call Ayesha about tomorrow booking'),
    _ReminderItem(text: 'Check payment pending list'),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reminders')),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          showDialog<void>(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('Add Reminder'),
              content: TextField(
                controller: _controller,
                decoration: const InputDecoration(
                  labelText: 'Reminder',
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    _controller.clear();
                    Navigator.of(context).pop();
                  },
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () {
                    final text = _controller.text.trim();
                    if (text.isNotEmpty) {
                      setState(() {
                        _items.insert(0, _ReminderItem(text: text));
                      });
                    }
                    _controller.clear();
                    Navigator.of(context).pop();
                  },
                  child: const Text('Save'),
                ),
              ],
            ),
          );
        },
        child: const Icon(Icons.add),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items.length,
        itemBuilder: (context, index) {
          final item = _items[index];
          return CheckboxListTile(
            value: item.done,
            title: Text(item.text),
            onChanged: (value) {
              setState(() {
                item.done = value ?? false;
              });
            },
          );
        },
      ),
    );
  }
}

class _ReminderItem {
  _ReminderItem({required this.text});

  final String text;
  bool done = false;
}
