import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_page.dart';

class AppointmentsPage extends StatefulWidget {
  const AppointmentsPage({super.key});

  @override
  State<AppointmentsPage> createState() => _AppointmentsPageState();
}

class _AppointmentsPageState extends State<AppointmentsPage> {
  List<BookingItem>? _rows;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final state = AppStateScope.of(context);
    if (!state.isLoggedIn || state.token == null) {
      setState(() {
        _loading = false;
        _rows = [];
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await state.api.getBookings(state.token!);
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'confirmed':
      case 'in_service':
        return AppColors.success;
      case 'pending':
        return AppColors.warning;
      case 'completed':
        return AppColors.muted;
      case 'cancelled':
      case 'no_show':
        return AppColors.danger;
      default:
        return AppColors.muted;
    }
  }

  Future<void> _rebook(BookingItem item) async {
    final state = AppStateScope.of(context);
    if (item.staffId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This booking has no staff assigned for rebook.')),
      );
      return;
    }

    DateTime day = DateTime.now().add(const Duration(days: 1));
    String? selectedSlot;
    List<String> slots = [];
    var loadingSlots = false;
    String? err;

    Future<void> loadSlots(StateSetter setModal) async {
      setModal(() {
        loadingSlots = true;
        err = null;
        selectedSlot = null;
      });
      try {
        final date = DateFormat('yyyy-MM-dd').format(day);
        final result = await state.api.getAvailability(
          staffId: item.staffId!,
          date: date,
          duration: item.durationMinutes ?? 30,
        );
        setModal(() {
          slots = result;
          loadingSlots = false;
        });
      } catch (e) {
        setModal(() {
          loadingSlots = false;
          err = e.toString().replaceFirst('Exception: ', '');
          slots = [];
        });
      }
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModal) {
            return Padding(
              padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.of(ctx).viewInsets.bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Rebook', style: Theme.of(ctx).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  Text(
                    item.serviceName ?? 'Service',
                    style: Theme.of(ctx).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 16),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(DateFormat('EEE, d MMM yyyy').format(day)),
                    trailing: const Icon(Icons.calendar_today_outlined),
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: ctx,
                        initialDate: day,
                        firstDate: DateTime.now(),
                        lastDate: DateTime.now().add(const Duration(days: 90)),
                      );
                      if (picked != null) {
                        day = picked;
                        await loadSlots(setModal);
                      }
                    },
                  ),
                  if (slots.isEmpty && !loadingSlots)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: TextButton(
                        onPressed: () => loadSlots(setModal),
                        child: const Text('Load available times'),
                      ),
                    ),
                  if (loadingSlots)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator(color: AppColors.blush)),
                    ),
                  if (err != null)
                    Text(err!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
                  if (slots.isNotEmpty)
                    SizedBox(
                      height: 160,
                      child: GridView.builder(
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          mainAxisSpacing: 8,
                          crossAxisSpacing: 8,
                          childAspectRatio: 2.4,
                        ),
                        itemCount: slots.length,
                        itemBuilder: (_, i) {
                          final s = slots[i];
                          final sel = selectedSlot == s;
                          return ChoiceChip(
                            label: Text(s),
                            selected: sel,
                            onSelected: (_) => setModal(() => selectedSlot = s),
                            selectedColor: AppColors.blushSoft,
                            labelStyle: TextStyle(
                              color: sel ? AppColors.blushDeep : AppColors.ink,
                              fontWeight: FontWeight.w600,
                            ),
                          );
                        },
                      ),
                    ),
                  const SizedBox(height: 12),
                  AppButton(
                    label: 'Confirm rebook',
                    onPressed: selectedSlot == null
                        ? null
                        : () async {
                            try {
                              await state.api.rebook(
                                token: state.token!,
                                appointmentId: item.id,
                                date: DateFormat('yyyy-MM-dd').format(day),
                                time: selectedSlot!,
                              );
                              if (ctx.mounted) Navigator.pop(ctx);
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Rebooking submitted.')),
                                );
                                _load();
                              }
                            } catch (e) {
                              setModal(() => err = e.toString().replaceFirst('Exception: ', ''));
                            }
                          },
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    if (!state.isLoggedIn) {
      return EmptyState(
        title: 'Your appointments',
        subtitle: 'Sign in to see upcoming and past visits.',
        actionLabel: 'Sign in',
        onAction: () async {
          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginPage()));
          _load();
        },
      );
    }

    if (_loading && _rows == null) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          SoftSkeleton(),
          SizedBox(height: 12),
          SoftSkeleton(),
          SizedBox(height: 12),
          SoftSkeleton(),
        ],
      );
    }

    if (_error != null && (_rows == null || _rows!.isEmpty)) {
      return EmptyState(
        title: 'Couldn’t load bookings',
        subtitle: _error!,
        actionLabel: 'Retry',
        onAction: _load,
      );
    }

    final rows = _rows ?? [];
    final upcoming = rows.where((r) => r.isUpcoming).toList();
    final past = rows.where((r) => !r.isUpcoming).toList();

    if (rows.isEmpty) {
      return RefreshIndicator(
        color: AppColors.blush,
        onRefresh: _load,
        child: ListView(
          children: const [
            SizedBox(height: 80),
            EmptyState(
              title: 'No visits yet',
              subtitle: 'Book a service and your history will show up here.',
              icon: Icons.event_available_outlined,
            ),
          ],
        ),
      );
    }

    Widget section(String title, List<BookingItem> items) {
      if (items.isEmpty) return const SizedBox.shrink();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 10, top: 8),
            child: Text(title, style: Theme.of(context).textTheme.titleLarge),
          ),
          ...items.map((b) {
            final color = _statusColor(b.status);
            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 4,
                        height: 40,
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              b.serviceName ?? 'Appointment',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${b.date} · ${b.time}${b.staffName != null ? ' · ${b.staffName}' : ''}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      Text(
                        b.status.replaceAll('_', ' '),
                        style: TextStyle(
                          color: color,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                  if (b.staffId != null) ...[
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => _rebook(b),
                        child: const Text('Rebook', style: TextStyle(color: AppColors.blushDeep, fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ],
                ],
              ),
            );
          }),
        ],
      );
    }

    return RefreshIndicator(
      color: AppColors.blush,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          section('Upcoming', upcoming),
          section('Past', past),
        ],
      ),
    );
  }
}
