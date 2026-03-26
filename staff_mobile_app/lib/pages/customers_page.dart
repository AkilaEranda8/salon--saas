import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/staff_user.dart';
import '../state/app_state.dart';

class CustomersPage extends StatefulWidget {
  const CustomersPage({super.key});

  @override
  State<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends State<CustomersPage> {
  Future<List<Customer>>? _customersFuture;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _customersFuture ??= _loadCustomers();
  }

  Future<List<Customer>> _loadCustomers() {
    final appState = AppStateScope.of(context);
    return appState.loadCustomers();
  }

  Future<void> _showAddDialog() async {
    final formKey = GlobalKey<FormState>();
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final emailController = TextEditingController();
    final payload = await showDialog<(String, String, String)>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Add Customer'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: nameController,
                decoration: const InputDecoration(labelText: 'Name'),
                validator: (v) => v == null || v.trim().isEmpty ? 'Name required' : null,
              ),
              TextFormField(
                controller: phoneController,
                decoration: const InputDecoration(labelText: 'Phone'),
                validator: (v) => v == null || v.trim().isEmpty ? 'Phone required' : null,
              ),
              TextFormField(
                controller: emailController,
                decoration: const InputDecoration(labelText: 'Email'),
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
              Navigator.of(context).pop((
                nameController.text,
                phoneController.text,
                emailController.text,
              ));
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    nameController.dispose();
    phoneController.dispose();
    emailController.dispose();
    if (payload == null) return;
    if (!mounted) return;
    final appState = AppStateScope.of(context);
    final ok = await appState.addCustomer(
      name: payload.$1,
      phone: payload.$2,
      email: payload.$3,
    );
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(appState.lastError ?? 'Failed to add customer')),
      );
    }
    if (mounted) {
      setState(() {
        _customersFuture = _loadCustomers();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final allowed = appState.hasPermission(StaffPermission.canViewCustomers);
    if (!allowed) {
      return Scaffold(
        appBar: AppBar(title: const Text('Customers')),
        body: const Center(child: Text('No permission to view customers.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Customers'),
        actions: [
          IconButton(
            onPressed: _showAddDialog,
            icon: const Icon(Icons.person_add_alt_1),
          ),
          IconButton(
            onPressed: () {
              setState(() {
                _customersFuture = _loadCustomers();
              });
            },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: FutureBuilder<List<Customer>>(
        future: _customersFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return const Center(child: Text('Failed to load customers.'));
          }
          final customers = snapshot.data ?? const [];
          if (customers.isEmpty) {
            return const Center(child: Text('No customers found.'));
          }
          return ListView.builder(
            itemCount: customers.length,
            itemBuilder: (context, index) {
              final c = customers[index];
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                child: ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.person)),
                  title: Text(c.name),
                  subtitle: Text('${c.phone}\n${c.email}'),
                  isThreeLine: true,
                ),
              );
            },
          );
        },
      ),
    );
  }
}
