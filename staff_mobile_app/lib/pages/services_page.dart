import 'package:flutter/material.dart';

import '../state/app_state.dart';

class ServicesPage extends StatefulWidget {
  const ServicesPage({super.key});

  @override
  State<ServicesPage> createState() => _ServicesPageState();
}

class _ServicesPageState extends State<ServicesPage> {
  Future<void>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  Future<void> _load() async {
    final appState = AppStateScope.of(context);
    await appState.loadServices();
  }

  Future<void> _addProduct() async {
    final name = TextEditingController();
    final category = TextEditingController(text: 'Other');
    final price = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final payload = await showDialog<(String, String, String)>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Add Product/Service'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Name'),
                validator: (v) => v == null || v.trim().isEmpty ? 'Name required' : null,
              ),
              TextFormField(
                controller: category,
                decoration: const InputDecoration(labelText: 'Category'),
              ),
              TextFormField(
                controller: price,
                decoration: const InputDecoration(labelText: 'Price'),
                keyboardType: TextInputType.number,
                validator: (v) => v == null || v.trim().isEmpty ? 'Price required' : null,
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
              if (!formKey.currentState!.validate()) return;
              Navigator.of(context).pop((name.text, category.text, price.text));
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    name.dispose();
    category.dispose();
    price.dispose();
    if (payload == null) return;
    if (!mounted) return;
    final appState = AppStateScope.of(context);
    final ok = await appState.addService(
      name: payload.$1,
      category: payload.$2,
      price: payload.$3,
    );
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(appState.lastError ?? 'Failed to save product')),
      );
      return;
    }
    if (mounted) {
      setState(() {
        _future = _load();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Services / Products'),
        actions: [
          IconButton(onPressed: _addProduct, icon: const Icon(Icons.add_business)),
          IconButton(
            onPressed: () => setState(() {
              _future = _load();
            }),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: FutureBuilder<void>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (appState.services.isEmpty) {
            return const Center(child: Text('No products/services found.'));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: appState.services.length,
            itemBuilder: (context, index) {
              final s = appState.services[index];
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.content_cut),
                  title: Text(s.name),
                  subtitle: Text('${s.category} • ${s.durationMinutes} min'),
                  trailing: Text('LKR ${s.price.toStringAsFixed(0)}'),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
