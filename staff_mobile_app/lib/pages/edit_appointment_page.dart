import 'package:flutter/material.dart';

import '../models/appointment.dart';
import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';
import '../utils/appointment_notes.dart';

// ── Design tokens ─────────────────────────────────────────────────────────────
const Color _kG900  = Color(0xFF1B3A2D);
const Color _kG700  = Color(0xFF2D6A4F);
const Color _kGold  = Color(0xFFC9956C);
const Color _kBg    = Color(0xFFF2F5F2);
const Color _kBorder = Color(0xFFE5E7EB);

// Completed is set only after Collect Payment — not selectable here.
const List<String> _kStatuses = [
  'pending', 'confirmed', 'in_service', 'cancelled'
];

String _statusLabel(String s) {
  switch (s.toLowerCase()) {
    case 'pending':    return 'Pending';
    case 'confirmed':  return 'Confirmed';
    case 'in_service': return 'In Service';
    case 'completed':  return 'Completed';
    case 'cancelled':  return 'Cancelled';
    default:           return s;
  }
}

Color _statusColor(String s) {
  switch (s.toLowerCase()) {
    case 'confirmed':
    case 'in_service':  return const Color(0xFF3B82F6);
    case 'completed':   return const Color(0xFF22C55E);
    case 'cancelled':   return const Color(0xFFF43F5E);
    default:            return const Color(0xFFF59E0B);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class EditAppointmentPage extends StatefulWidget {
  const EditAppointmentPage({
    super.key,
    required this.appointment,
    required this.services,
    required this.branches,
    required this.staffList,
    required this.isSuperAdmin,
    required this.fixedBranchId,
  });

  final Appointment appointment;
  final List<SalonService> services;
  final List<Map<String, String>> branches;
  final List<StaffMember> staffList;
  final bool isSuperAdmin;
  final String fixedBranchId;

  @override
  State<EditAppointmentPage> createState() => _EditAppointmentPageState();
}

class _EditAppointmentPageState extends State<EditAppointmentPage> {
  final _formKey       = GlobalKey<FormState>();
  final _customerName  = TextEditingController();
  final _phone         = TextEditingController();
  final _date          = TextEditingController();
  final _time          = TextEditingController();
  final _amount        = TextEditingController();
  final _notes         = TextEditingController();

  bool   _saving   = false;
  String _custId   = '';
  String _branchId = '';
  String _staffId  = '';
  String _status   = 'pending';
  final List<String> _serviceIds = [];
  List<Customer> _customers = const [];

  @override
  void initState() {
    super.initState();
    final a = widget.appointment;
    _customerName.text = a.customerName;
    _custId            = a.customerId;
    _phone.text        = a.phone;
    _date.text         = a.date.length >= 10 ? a.date.substring(0, 10) : a.date;
    _time.text         = a.time;
    _amount.text       = a.displayAmount > 0 ? a.displayAmount.toStringAsFixed(0) : '';
    _notes.text        = AppointmentNotes.stripAdditionalServicesLine(a.notes);
    _branchId          = a.branchId.isNotEmpty ? a.branchId : widget.fixedBranchId;
    _staffId           = a.staffId;
    _status            = a.status == 'completed'
        ? 'completed'
        : (_kStatuses.contains(a.status) ? a.status : 'pending');
    _initServiceIds(a);
  }

  void _initServiceIds(Appointment a) {
    if (a.serviceIds.isNotEmpty) {
      _serviceIds.addAll(a.serviceIds);
      return;
    }
    if (a.serviceId.isNotEmpty) _serviceIds.add(a.serviceId);
    for (final name in AppointmentNotes.parseAdditionalServiceNames(a.notes)) {
      for (final s in widget.services) {
        if (s.name == name && !_serviceIds.contains(s.id)) _serviceIds.add(s.id);
      }
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _loadCustomers();
  }

  Future<void> _loadCustomers() async {
    try {
      final list = await AppStateScope.of(context).loadCustomers();
      if (mounted) setState(() => _customers = list);
    } catch (_) {}
  }

  double get _calcTotal {
    var sum = 0.0;
    for (final id in _serviceIds) {
      for (final s in widget.services) {
        if (s.id == id) sum += s.price;
      }
    }
    return sum;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      initialDate: DateTime.tryParse(_date.text) ?? DateTime.now(),
    );
    if (picked == null) return;
    setState(() {
      _date.text =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (picked == null) return;
    setState(() {
      _time.text =
          '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_serviceIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one service')),
      );
      return;
    }
    final appState = AppStateScope.of(context);
    final branch = widget.isSuperAdmin
        ? _branchId
        : (widget.appointment.branchId.isNotEmpty
            ? widget.appointment.branchId
            : widget.fixedBranchId);

    setState(() => _saving = true);
    final ok = await appState.saveAppointment(
      appointmentId: widget.appointment.id,
      branchId: branch,
      customerName: _customerName.text.trim(),
      phone: _phone.text.trim(),
      customerId: _custId,
      orderedServiceIds: List<String>.from(_serviceIds),
      date: _date.text.trim(),
      time: _time.text.trim(),
      staffId: _staffId,
      baseNotes: _notes.text.trim(),
      status: _status,
      amountOverride: _amount.text.trim(),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(appState.lastError ?? 'Update failed')),
      );
      return;
    }
    Navigator.of(context).pop(true);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  InputDecoration _inputDeco(String label, IconData icon) => InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 14),
        prefixIcon: Icon(icon, color: _kG700, size: 20),
        filled: true,
        fillColor: const Color(0xFFF9FAF9),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _kBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _kBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _kG700, width: 1.5),
        ),
      );

  Widget _section({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) =>
      Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFEEF0EE)),
          boxShadow: const [
            BoxShadow(
                color: Color(0x08000000), blurRadius: 8, offset: Offset(0, 3)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: Row(children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: _kG900,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: _kGold, size: 15),
                ),
                const SizedBox(width: 10),
                Text(title,
                    style: const TextStyle(
                        color: Color(0xFF111827),
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2)),
              ]),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: children),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final activeServices =
        widget.services.where((s) => s.isActive).toList();
    final initial = widget.appointment.customerName.isNotEmpty
        ? widget.appointment.customerName[0].toUpperCase()
        : 'C';

    return Scaffold(
      backgroundColor: _kBg,
      body: Column(children: [
        // ── Header ─────────────────────────────────────────────────────────
        ClipRRect(
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(24),
            bottomRight: Radius.circular(24),
          ),
          child: Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF0F2318), _kG900, Color(0xFF224030)],
              ),
            ),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Top bar
                    Row(children: [
                      GestureDetector(
                        onTap: () => Navigator.of(context).pop(),
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(10),
                            color: Colors.white.withValues(alpha: 0.08),
                            border: Border.all(
                                color: Colors.white.withValues(alpha: 0.14)),
                          ),
                          child: const Icon(Icons.arrow_back_ios_new_rounded,
                              color: Colors.white, size: 16),
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text('Edit Appointment',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.2)),
                      ),
                    ]),
                    const SizedBox(height: 16),
                    // Customer preview card
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                            color: Colors.white.withValues(alpha: 0.12)),
                      ),
                      child: Row(children: [
                        // Avatar
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _kGold.withValues(alpha: 0.18),
                            border: Border.all(
                                color: _kGold.withValues(alpha: 0.40),
                                width: 1.5),
                          ),
                          child: Center(
                            child: Text(initial,
                                style: const TextStyle(
                                    color: _kGold,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w900)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(widget.appointment.customerName,
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700)),
                              if (widget.appointment.phone.isNotEmpty)
                                Text(widget.appointment.phone,
                                    style: TextStyle(
                                        color: Colors.white
                                            .withValues(alpha: 0.55),
                                        fontSize: 12)),
                            ],
                          ),
                        ),
                        // Current status pill
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: _statusColor(_status).withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color: _statusColor(_status)
                                    .withValues(alpha: 0.35)),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: _statusColor(_status)),
                            ),
                            const SizedBox(width: 5),
                            Text(_statusLabel(_status),
                                style: TextStyle(
                                    color: _statusColor(_status),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700)),
                          ]),
                        ),
                      ]),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),

        // ── Body ───────────────────────────────────────────────────────────
        Expanded(
          child: Form(
            key: _formKey,
            child: ListView(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
              children: [

                // ── 1. Customer ─────────────────────────────────────────
                _section(
                  title: 'Customer',
                  icon: Icons.person_outline_rounded,
                  children: [
                    Autocomplete<Customer>(
                      optionsBuilder: (textEditingValue) {
                        final q = textEditingValue.text.trim().toLowerCase();
                        if (q.isEmpty) return _customers.take(15);
                        return _customers
                            .where((c) =>
                                c.name.toLowerCase().contains(q) ||
                                c.phone.toLowerCase().contains(q))
                            .take(20);
                      },
                      displayStringForOption: (c) => c.name,
                      initialValue:
                          TextEditingValue(text: _customerName.text),
                      onSelected: (customer) {
                        setState(() {
                          _customerName.text = customer.name;
                          _phone.text = customer.phone;
                          _custId = customer.id;
                        });
                      },
                      fieldViewBuilder: (ctx, ctrl, focusNode, onSubmit) {
                        return TextFormField(
                          controller: ctrl,
                          focusNode: focusNode,
                          decoration: _inputDeco('Customer name / phone',
                              Icons.person_search_rounded),
                          onChanged: (v) {
                            _customerName.text = v;
                            _custId = '';
                          },
                          validator: (v) => v == null || v.trim().isEmpty
                              ? 'Required'
                              : null,
                        );
                      },
                      optionsViewBuilder: (ctx, onSelected, options) {
                        return Align(
                          alignment: Alignment.topLeft,
                          child: Material(
                            elevation: 8,
                            borderRadius: BorderRadius.circular(14),
                            shadowColor: Colors.black26,
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(
                                  maxHeight: 220, maxWidth: 520),
                              child: ListView.builder(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 6),
                                shrinkWrap: true,
                                itemCount: options.length,
                                itemBuilder: (_, i) {
                                  final c = options.elementAt(i);
                                  return ListTile(
                                    dense: true,
                                    leading: CircleAvatar(
                                      radius: 16,
                                      backgroundColor:
                                          _kG900.withValues(alpha: 0.08),
                                      child: Text(
                                        c.name.isNotEmpty
                                            ? c.name[0].toUpperCase()
                                            : '?',
                                        style: const TextStyle(
                                            color: _kG700,
                                            fontWeight: FontWeight.w800,
                                            fontSize: 13),
                                      ),
                                    ),
                                    title: Text(c.name,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 14)),
                                    subtitle: Text(c.phone,
                                        style:
                                            const TextStyle(fontSize: 12)),
                                    onTap: () => onSelected(c),
                                  );
                                },
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration:
                          _inputDeco('Phone', Icons.call_outlined),
                    ),
                  ],
                ),

                // ── 2. Status (completed only via Collect Payment) ──────
                const SizedBox(height: 12),
                _section(
                  title: 'Status',
                  icon: Icons.flag_outlined,
                  children: [
                    if (_status == 'completed')
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 9),
                        decoration: BoxDecoration(
                          color: _kG900,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: _statusColor('completed')),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 7,
                              height: 7,
                              decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: _statusColor('completed')),
                            ),
                            const SizedBox(width: 6),
                            Text(_statusLabel('completed'),
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13)),
                          ],
                        ),
                      )
                    else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _kStatuses.map((s) {
                        final selected = _status == s;
                        final color = _statusColor(s);
                        return GestureDetector(
                          onTap: () => setState(() => _status = s),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 160),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 9),
                            decoration: BoxDecoration(
                              color: selected
                                  ? _kG900
                                  : const Color(0xFFF3F4F6),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: selected
                                    ? color
                                    : const Color(0xFFE5E7EB),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 7,
                                  height: 7,
                                  decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: selected
                                          ? color
                                          : const Color(0xFFD1D5DB)),
                                ),
                                const SizedBox(width: 6),
                                Text(_statusLabel(s),
                                    style: TextStyle(
                                        color: selected
                                            ? Colors.white
                                            : const Color(0xFF6B7280),
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13)),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ),

                // ── 3. Branch ───────────────────────────────────────────
                const SizedBox(height: 12),
                _section(
                  title: 'Branch',
                  icon: Icons.store_outlined,
                  children: [
                    if (widget.isSuperAdmin && widget.branches.isNotEmpty)
                      DropdownButtonFormField<String>(
                        initialValue: _branchId.isEmpty ? null : _branchId,
                        decoration: _inputDeco('Select branch',
                            Icons.store_mall_directory_outlined),
                        items: widget.branches
                            .map((b) => DropdownMenuItem(
                                value: b['id'], child: Text(b['name'] ?? '')))
                            .toList(),
                        onChanged: (v) =>
                            setState(() => _branchId = v ?? ''),
                        validator: (v) =>
                            v == null || v.isEmpty ? 'Branch required' : null,
                      )
                    else
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9FAF9),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _kBorder),
                        ),
                        child: Row(children: [
                          const Icon(Icons.store_mall_directory_outlined,
                              color: _kG700, size: 20),
                          const SizedBox(width: 10),
                          Text(
                            widget.appointment.branchName.isNotEmpty
                                ? widget.appointment.branchName
                                : 'Assigned branch',
                            style: const TextStyle(
                                color: Color(0xFF374151),
                                fontSize: 14,
                                fontWeight: FontWeight.w500),
                          ),
                        ]),
                      ),
                  ],
                ),

                // ── 4. Services ─────────────────────────────────────────
                const SizedBox(height: 12),
                _section(
                  title: 'Services',
                  icon: Icons.content_cut_rounded,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: activeServices.map((s) {
                        final on = _serviceIds.contains(s.id);
                        return GestureDetector(
                          onTap: () {
                            setState(() {
                              if (on) {
                                _serviceIds.remove(s.id);
                              } else {
                                if (!_serviceIds.contains(s.id)) {
                                  _serviceIds.add(s.id);
                                }
                              }
                              final total = _calcTotal;
                              _amount.text =
                                  total > 0 ? total.toStringAsFixed(0) : '';
                            });
                          },
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 160),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: on
                                  ? _kG900
                                  : const Color(0xFFF3F4F6),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: on
                                    ? _kG700
                                    : const Color(0xFFE5E7EB),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (on)
                                  const Padding(
                                    padding: EdgeInsets.only(right: 5),
                                    child: Icon(Icons.check_circle_rounded,
                                        color: _kGold, size: 14),
                                  ),
                                Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(s.name,
                                        style: TextStyle(
                                            color: on
                                                ? Colors.white
                                                : const Color(0xFF374151),
                                            fontWeight: FontWeight.w700,
                                            fontSize: 13)),
                                    Text(
                                        'Rs. ${s.price.toStringAsFixed(0)}',
                                        style: TextStyle(
                                            color: on
                                                ? _kGold
                                                : const Color(0xFF9CA3AF),
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600)),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    if (activeServices.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('No active services available.',
                            style: TextStyle(color: Color(0xFF9CA3AF))),
                      ),
                    const SizedBox(height: 12),
                    // Total summary
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 11),
                      decoration: BoxDecoration(
                        color: _kG900,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(children: [
                        const Icon(Icons.receipt_long_rounded,
                            color: _kGold, size: 16),
                        const SizedBox(width: 8),
                        Text(
                            '${_serviceIds.length} service${_serviceIds.length == 1 ? '' : 's'} selected',
                            style: TextStyle(
                                color:
                                    Colors.white.withValues(alpha: 0.75),
                                fontSize: 13,
                                fontWeight: FontWeight.w600)),
                        const Spacer(),
                        Text('Rs. ${_calcTotal.toStringAsFixed(0)}',
                            style: const TextStyle(
                                color: _kGold,
                                fontWeight: FontWeight.w800,
                                fontSize: 15)),
                      ]),
                    ),
                  ],
                ),

                // ── 5. Schedule ─────────────────────────────────────────
                const SizedBox(height: 12),
                _section(
                  title: 'Schedule',
                  icon: Icons.schedule_rounded,
                  children: [
                    // Staff picker
                    DropdownButtonFormField<String>(
                      initialValue: _staffId.isEmpty ? null : _staffId,
                      decoration: _inputDeco(
                          'Staff member (optional)',
                          Icons.badge_outlined),
                      items: [
                        const DropdownMenuItem(
                            value: '', child: Text('Any available')),
                        ...widget.staffList.map((s) =>
                            DropdownMenuItem(
                                value: s.id, child: Text(s.name))),
                      ],
                      onChanged: (v) =>
                          setState(() => _staffId = v ?? ''),
                    ),
                    const SizedBox(height: 10),
                    // Date & Time
                    Row(children: [
                      Expanded(
                        child: GestureDetector(
                          onTap: _pickDate,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 14),
                            decoration: BoxDecoration(
                              color: _date.text.isNotEmpty
                                  ? _kG900
                                  : const Color(0xFFF9FAF9),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: _date.text.isNotEmpty
                                    ? _kG700
                                    : _kBorder,
                              ),
                            ),
                            child: Row(children: [
                              Icon(Icons.calendar_today_rounded,
                                  size: 16,
                                  color: _date.text.isNotEmpty
                                      ? _kGold
                                      : const Color(0xFF9CA3AF)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _date.text.isEmpty ? 'Date' : _date.text,
                                  style: TextStyle(
                                    color: _date.text.isNotEmpty
                                        ? Colors.white
                                        : const Color(0xFF9CA3AF),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ]),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: GestureDetector(
                          onTap: _pickTime,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 14),
                            decoration: BoxDecoration(
                              color: _time.text.isNotEmpty
                                  ? _kG900
                                  : const Color(0xFFF9FAF9),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: _time.text.isNotEmpty
                                    ? _kG700
                                    : _kBorder,
                              ),
                            ),
                            child: Row(children: [
                              Icon(Icons.access_time_rounded,
                                  size: 16,
                                  color: _time.text.isNotEmpty
                                      ? _kGold
                                      : const Color(0xFF9CA3AF)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _time.text.isEmpty ? 'Time' : _time.text,
                                  style: TextStyle(
                                    color: _time.text.isNotEmpty
                                        ? Colors.white
                                        : const Color(0xFF9CA3AF),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ]),
                          ),
                        ),
                      ),
                    ]),
                    // Hidden validators
                    Opacity(
                      opacity: 0,
                      child: SizedBox(
                        height: 0,
                        child: TextFormField(
                          controller: _date,
                          validator: (v) =>
                              v == null || v.isEmpty ? 'Required' : null,
                        ),
                      ),
                    ),
                    Opacity(
                      opacity: 0,
                      child: SizedBox(
                        height: 0,
                        child: TextFormField(
                          controller: _time,
                          validator: (v) =>
                              v == null || v.isEmpty ? 'Required' : null,
                        ),
                      ),
                    ),
                  ],
                ),

                // ── 6. Payment & Notes ──────────────────────────────────
                const SizedBox(height: 12),
                _section(
                  title: 'Payment & Notes',
                  icon: Icons.payments_outlined,
                  children: [
                    TextFormField(
                      controller: _amount,
                      keyboardType: TextInputType.number,
                      decoration: _inputDeco(
                          'Amount (Rs.)', Icons.currency_rupee_rounded),
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _notes,
                      maxLines: 3,
                      decoration: _inputDeco(
                          'Notes (optional)', Icons.sticky_note_2_outlined),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // ── Save button ─────────────────────────────────────────
                GestureDetector(
                  onTap: _saving ? null : _save,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    decoration: BoxDecoration(
                      gradient: _saving
                          ? null
                          : const LinearGradient(
                              colors: [Color(0xFF224030), _kG700],
                            ),
                      color: _saving ? const Color(0xFFE5E7EB) : null,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: _saving
                          ? []
                          : [
                              BoxShadow(
                                color: _kG900.withValues(alpha: 0.35),
                                blurRadius: 16,
                                offset: const Offset(0, 6),
                              ),
                            ],
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (_saving)
                          const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                                color: _kG700, strokeWidth: 2),
                          )
                        else
                          const Icon(Icons.save_rounded,
                              color: _kGold, size: 20),
                        const SizedBox(width: 10),
                        Text(
                          _saving ? 'Saving...' : 'Save Changes',
                          style: TextStyle(
                            color: _saving
                                ? const Color(0xFF9CA3AF)
                                : Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ]),
    );
  }

  @override
  void dispose() {
    _customerName.dispose();
    _phone.dispose();
    _date.dispose();
    _time.dispose();
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }
}
