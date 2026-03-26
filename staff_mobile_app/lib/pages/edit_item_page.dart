import 'package:flutter/material.dart';

import '../models/staff_user.dart';
import '../state/app_state.dart';

class EditItemPage extends StatelessWidget {
  const EditItemPage({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final allowed = appState.hasPermission(StaffPermission.canEdit);
    if (!allowed) {
      return Scaffold(
        appBar: AppBar(title: const Text('Edit Page')),
        body: const Center(child: Text('No permission to edit items.')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Edit Page')),
      body: ListView.builder(
        itemCount: appState.items.length,
        itemBuilder: (context, index) {
          final item = appState.items[index];
          return Card(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: ListTile(
              title: Text(item.title),
              subtitle: Text(item.description),
              trailing: const Icon(Icons.edit),
              onTap: () async {
                final result = await showDialog<_EditPayload>(
                  context: context,
                  builder: (_) => _EditDialog(
                    initialTitle: item.title,
                    initialDescription: item.description,
                  ),
                );
                if (result == null) return;
                appState.editItem(item.id, result.title, result.description);
              },
            ),
          );
        },
      ),
    );
  }
}

class _EditPayload {
  const _EditPayload({required this.title, required this.description});

  final String title;
  final String description;
}

class _EditDialog extends StatefulWidget {
  const _EditDialog({
    required this.initialTitle,
    required this.initialDescription,
  });

  final String initialTitle;
  final String initialDescription;

  @override
  State<_EditDialog> createState() => _EditDialogState();
}

class _EditDialogState extends State<_EditDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.initialTitle);
    _descriptionController = TextEditingController(text: widget.initialDescription);
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit Item'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(labelText: 'Title'),
              validator: (value) =>
                  value == null || value.trim().isEmpty ? 'Title required' : null,
            ),
            TextFormField(
              controller: _descriptionController,
              decoration: const InputDecoration(labelText: 'Description'),
              validator: (value) => value == null || value.trim().isEmpty
                  ? 'Description required'
                  : null,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            if (!_formKey.currentState!.validate()) return;
            Navigator.of(context).pop(
              _EditPayload(
                title: _titleController.text,
                description: _descriptionController.text,
              ),
            );
          },
          child: const Text('Update'),
        ),
      ],
    );
  }
}
