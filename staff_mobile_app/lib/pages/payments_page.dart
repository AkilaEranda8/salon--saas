import 'package:flutter/material.dart';

import '../models/customer.dart';
import '../models/payment_record.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';
import 'add_payment_modal.dart';

class PaymentsPage extends StatefulWidget {
  const PaymentsPage({super.key});

  @override
  State<PaymentsPage> createState() => _PaymentsPageState();
}

class _PaymentsPageState extends State<PaymentsPage> {
  Future<void>? _future;
  List<PaymentRecord> _payments = const [];
  List<Customer> _customers = const [];
  List<StaffMember> _staff = const [];
  List<SalonService> _services = const [];
  List<Map<String, String>> _branches = const [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  String _currentMonth() {
    final now = DateTime.now();
    final month = now.month.toString().padLeft(2, '0');
    return '${now.year}-$month';
  }

  Future<void> _load() async {
    final appState = AppStateScope.of(context);
    final userBranchId = appState.currentUser?.branchId;
    final month = _currentMonth();

    final payments = await appState.loadPayments(
      branchId: userBranchId,
      month: month,
    );
    final customers = await appState.loadCustomers();
    final services = await appState.loadServices();
    final staff = await appState.loadStaffList(branchId: userBranchId);
    List<Map<String, String>> branches = appState.branches;
    if (userBranchId == null || userBranchId.isEmpty) {
      branches = await appState.loadBranches();
    } else if (branches.every((b) => b['id'] != userBranchId)) {
      branches = [
        {'id': userBranchId, 'name': 'My Branch'},
      ];
    }

    if (!mounted) return;
    setState(() {
      _payments = payments;
      _customers = customers;
      _services = services;
      _staff = staff;
      _branches = branches;
    });
  }

  Future<void> _openAddPayment() async {
    final appState = AppStateScope.of(context);
    var customers = _customers;
    var services = _services;
    var staff = _staff;
    var branchOptions = _branches;
    final fixedBranchId = appState.currentUser?.branchId;

    if (customers.isEmpty) {
      try {
        customers = await appState.loadCustomers();
      } catch (_) {
        customers = const [];
      }
    }
    if (services.isEmpty) {
      try {
        services = await appState.loadServices();
      } catch (_) {
        services = const [];
      }
    }
    if (staff.isEmpty) {
      try {
        staff = await appState.loadStaffList(branchId: fixedBranchId);
      } catch (_) {
        staff = const [];
      }
    }

    if (branchOptions.isEmpty) {
      try {
        if (fixedBranchId == null || fixedBranchId.isEmpty) {
          branchOptions = await appState.loadBranches();
        } else {
          branchOptions = [
            {'id': fixedBranchId, 'name': 'My Branch'},
          ];
        }
      } catch (_) {
        branchOptions = const [];
      }
    }
    if (!mounted) return;
    if (branchOptions.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(appState.lastError ?? 'No branches available for payment')),
      );
      return;
    }
    if (!mounted) return;
    if (services.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(appState.lastError ?? 'No services available for payment')),
      );
      return;
    }
    setState(() {
      _customers = customers;
      _services = services;
      _staff = staff;
      _branches = branchOptions;
    });

    final payload = await AddPaymentModal.show(
      context,
      branches: branchOptions,
      customers: customers,
      staff: staff,
      services: services,
      initialBranchId: fixedBranchId,
    );
    if (payload == null) return;
    if (!mounted) return;

    final ok = await appState.addManualPayment(
      branchId: payload.branchId,
      serviceId: payload.serviceIds.first,
      serviceIds: payload.serviceIds,
      staffId: payload.staffId.isEmpty ? null : payload.staffId,
      customerId: payload.customerId.isEmpty ? null : payload.customerId,
      customerName: payload.customerName,
      totalAmount: payload.totalAmount,
      loyaltyDiscount: payload.loyaltyDiscount,
      method: payload.method,
      paidAmount: payload.paidAmount,
    );

    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(appState.lastError ?? 'Failed to add payment')),
      );
      return;
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment recorded successfully')),
      );
      setState(() {
        _future = _load();
      });
    }
  }

  String _formatDate(String raw) {
    if (raw.trim().isEmpty) return '';
    try {
      final d = DateTime.parse(raw);
      final dd = d.day.toString().padLeft(2, '0');
      final mm = d.month.toString().padLeft(2, '0');
      return '$dd/$mm/${d.year}';
    } catch (_) {
      return raw;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Payments'),
        actions: [
          IconButton(
            onPressed: _openAddPayment,
            icon: const Icon(Icons.add_card),
          ),
          IconButton(
            onPressed: () {
              setState(() {
                _future = _load();
              });
            },
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
          if (snapshot.hasError) {
            return const Center(child: Text('Failed to load payments.'));
          }
          if (_payments.isEmpty) {
            return const Center(child: Text('No payments found.'));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _payments.length,
            itemBuilder: (context, index) {
              final p = _payments[index];
              final splitText = p.splits.isEmpty
                  ? 'No split'
                  : p.splits.map((s) => '${s.method}: LKR ${s.amount.toStringAsFixed(0)}').join(' | ');
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: const Icon(Icons.payments_outlined),
                  title: Text(p.customerName.isEmpty ? 'Walk-in' : p.customerName),
                  subtitle: Text(
                    '${p.serviceName.isEmpty ? 'Service' : p.serviceName}\n$splitText\n${_formatDate(p.date)}',
                  ),
                  isThreeLine: true,
                  trailing: Text(
                    'LKR ${p.netAmount.toStringAsFixed(0)}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
