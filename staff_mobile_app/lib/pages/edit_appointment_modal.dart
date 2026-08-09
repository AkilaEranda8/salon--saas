import 'package:flutter/material.dart';

import '../models/appointment.dart';
import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../state/app_state.dart';
import '../utils/appointment_notes.dart';

// ── Palette (same as add modal) ───────────────────────────────────────────────
const Color _eBlue   = Color(0xFF1D4ED8);
const Color _eMid    = Color(0xFF2563EB);
const Color _eLight  = Color(0xFFEFF6FF);
const Color _eLightB = Color(0xFFBFDBFE);
const Color _eBorder = Color(0xFFE5E7EB);
const Color _eBg     = Color(0xFFF9FAFB);

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
    case 'in_service': return const Color(0xFF3B82F6);
    case 'completed':  return const Color(0xFF22C55E);
    case 'cancelled':  return const Color(0xFFF43F5E);
    default:           return const Color(0xFFF59E0B);
  }
}

Color _statusBg(String s) {
  switch (s.toLowerCase()) {
    case 'confirmed':
    case 'in_service': return const Color(0xFFDBEAFE);
    case 'completed':  return const Color(0xFFDCFCE7);
    case 'cancelled':  return const Color(0xFFFFE4E6);
    default:           return const Color(0xFFFEF9C3);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
/// Show the edit appointment bottom sheet.
/// Returns `true` if updated successfully.
Future<bool?> showEditAppointmentModal(
  BuildContext context, {
  required Appointment appointment,
  required List<SalonService> services,
  required List<Map<String, String>> branches,
  required List<StaffMember> staffList,
  required bool isSuperAdmin,
  required String fixedBranchId,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _EditApptSheet(
      appointment: appointment,
      services: services,
      branches: branches,
      staffList: staffList,
      isSuperAdmin: isSuperAdmin,
      fixedBranchId: fixedBranchId,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
class _EditApptSheet extends StatefulWidget {
  const _EditApptSheet({
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
  State<_EditApptSheet> createState() => _EditApptSheetState();
}

class _EditApptSheetState extends State<_EditApptSheet> {
  final _formKey  = GlobalKey<FormState>();
  final _namCtrl  = TextEditingController();
  final _phCtrl   = TextEditingController();
  final _amtCtrl  = TextEditingController();
  final _noteCtrl = TextEditingController();

  bool   _saving   = false;
  String _custId   = '';
  String _branchId = '';
  String _staffId  = '';
  String _status   = 'pending';
  String _date     = '';
  String _time     = '';
  final List<String> _serviceIds = [];
  List<Customer> _customers = const [];

  @override
  void initState() {
    super.initState();
    final a = widget.appointment;
    _namCtrl.text  = a.customerName;
    _custId        = a.customerId;
    _phCtrl.text   = a.phone;
    _date          = a.date.length >= 10 ? a.date.substring(0, 10) : a.date;
    _time          = a.time;
    _amtCtrl.text  = a.displayAmount > 0 ? a.displayAmount.toStringAsFixed(0) : '';
    _noteCtrl.text = AppointmentNotes.stripAdditionalServicesLine(a.notes);
    _branchId      = a.branchId.isNotEmpty ? a.branchId : widget.fixedBranchId;
    _staffId       = a.staffId;
    _status        = a.status == 'completed'
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
      for (final s in widget.services) { if (s.id == id) sum += s.price; }
    }
    return sum;
  }

  void _toggleService(String id) {
    setState(() {
      if (_serviceIds.contains(id)) {
        _serviceIds.remove(id);
      } else {
        _serviceIds.add(id);
      }
      final total = _calcTotal;
      _amtCtrl.text = total > 0 ? total.toStringAsFixed(0) : '';
    });
  }

  Future<void> _pickDate() async {
    final p = await showDatePicker(
      context: context,
      firstDate: DateTime(2020), lastDate: DateTime(2035),
      initialDate: DateTime.tryParse(_date) ?? DateTime.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: _eBlue, onPrimary: Colors.white,
              surface: Colors.white),
        ),
        child: child!,
      ),
    );
    if (p == null) return;
    setState(() {
      _date = '${p.year}-${p.month.toString().padLeft(2, '0')}-${p.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _pickTime() async {
    final p = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: _eBlue, onPrimary: Colors.white),
        ),
        child: child!,
      ),
    );
    if (p == null) return;
    setState(() {
      _time = '${p.hour.toString().padLeft(2, '0')}:${p.minute.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_serviceIds.isEmpty) { _snack('Select at least one service'); return; }
    if (_date.isEmpty) { _snack('Pick a date'); return; }
    if (_time.isEmpty) { _snack('Pick a time'); return; }

    final app    = AppStateScope.of(context);
    final branch = widget.isSuperAdmin
        ? _branchId
        : (widget.appointment.branchId.isNotEmpty
            ? widget.appointment.branchId
            : widget.fixedBranchId);
    if (branch.trim().isEmpty) { _snack('Branch required'); return; }

    setState(() => _saving = true);
    final ok = await app.saveAppointment(
      appointmentId: widget.appointment.id,
      branchId: branch,
      customerName: _namCtrl.text.trim(),
      phone: _phCtrl.text.trim(),
      customerId: _custId,
      orderedServiceIds: List<String>.from(_serviceIds),
      date: _date,
      time: _time,
      staffId: _staffId,
      baseNotes: _noteCtrl.text.trim(),
      status: _status,
      amountOverride: _amtCtrl.text.trim(),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) { _snack(app.lastError ?? 'Update failed'); return; }
    Navigator.of(context).pop(true);
  }

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  @override
  void dispose() {
    _namCtrl.dispose(); _phCtrl.dispose();
    _amtCtrl.dispose(); _noteCtrl.dispose();
    super.dispose();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  InputDecoration _deco(String hint, IconData icon) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
        prefixIcon: Icon(icon, color: _eMid, size: 19),
        filled: true,
        fillColor: _eBg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _eBorder)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _eBorder)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _eMid, width: 1.8)),
        focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _eMid, width: 1.8)),
        errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFF43F5E))),
      );

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: const TextStyle(
                color: Color(0xFF6B7280),
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4)),
      );

  Widget _pickPill({
    required String value,
    required String hint,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    final filled = value.isNotEmpty;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          color: filled ? _eLight : _eBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: filled ? _eMid : _eBorder,
              width: filled ? 1.5 : 1),
        ),
        child: Row(children: [
          Icon(icon, size: 16,
              color: filled ? _eBlue : const Color(0xFFADB5BD)),
          const SizedBox(width: 7),
          Expanded(
            child: Text(value.isEmpty ? hint : value,
                style: TextStyle(
                    color: filled ? _eBlue : const Color(0xFFADB5BD),
                    fontSize: 13,
                    fontWeight: FontWeight.w600)),
          ),
          if (filled)
            Icon(Icons.check_circle_rounded, size: 14, color: _eMid),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottom  = MediaQuery.of(context).viewInsets.bottom;
    final active  = widget.services.where((s) => s.isActive).toList();
    final initial = widget.appointment.customerName.isNotEmpty
        ? widget.appointment.customerName[0].toUpperCase() : 'C';

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, bottom + 24),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [

              // ── Drag handle ───────────────────────────────────────────
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12, bottom: 18),
                  width: 40, height: 4,
                  decoration: BoxDecoration(
                      color: const Color(0xFFE5E7EB),
                      borderRadius: BorderRadius.circular(99)),
                ),
              ),

              // ── Title row ─────────────────────────────────────────────
              Row(children: [
                // Avatar
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _eLight,
                    border: Border.all(color: _eLightB, width: 1.5),
                  ),
                  child: Center(
                    child: Text(initial,
                        style: TextStyle(color: _eBlue,
                            fontSize: 16, fontWeight: FontWeight.w900)),
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Edit Appointment',
                          style: TextStyle(
                              color: Color(0xFF111827),
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.2)),
                      Text(widget.appointment.customerName,
                          style: const TextStyle(
                              color: Color(0xFFADB5BD),
                              fontSize: 12,
                              fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(),
                  child: Container(
                    width: 32, height: 32,
                    decoration: BoxDecoration(
                        color: const Color(0xFFF3F4F6),
                        borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.close_rounded,
                        size: 16, color: Color(0xFF6B7280)),
                  ),
                ),
              ]),

              const SizedBox(height: 20),

              // ── Status chips (completed only via Collect Payment) ─────
              _label('STATUS'),
              if (_status == 'completed')
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: _statusBg('completed'),
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(
                      color: _statusColor('completed').withValues(alpha: 0.50),
                      width: 1.5,
                    ),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      width: 7, height: 7,
                      decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _statusColor('completed')),
                    ),
                    const SizedBox(width: 6),
                    Text(_statusLabel('completed'),
                        style: TextStyle(
                            color: _statusColor('completed'),
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700)),
                  ]),
                )
              else
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _kStatuses.map((s) {
                      final sel   = _status == s;
                      final color = _statusColor(s);
                      final bg    = _statusBg(s);
                      return GestureDetector(
                        onTap: () => setState(() => _status = s),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 140),
                          margin: const EdgeInsets.only(right: 7),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 7),
                          decoration: BoxDecoration(
                            color: sel ? bg : const Color(0xFFF9FAFB),
                            borderRadius: BorderRadius.circular(9),
                            border: Border.all(
                              color: sel
                                  ? color.withValues(alpha: 0.50)
                                  : _eBorder,
                              width: sel ? 1.5 : 1,
                            ),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Container(
                              width: 7, height: 7,
                              decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: sel ? color : const Color(0xFFD1D5DB)),
                            ),
                            const SizedBox(width: 6),
                            Text(_statusLabel(s),
                                style: TextStyle(
                                    color: sel
                                        ? color
                                        : const Color(0xFF9CA3AF),
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w700)),
                          ]),
                        ),
                      );
                    }).toList(),
                  ),
                ),

              const SizedBox(height: 14),

              // ── Customer ──────────────────────────────────────────────
              _label('CUSTOMER'),
              Autocomplete<Customer>(
                optionsBuilder: (val) {
                  final q = val.text.trim().toLowerCase();
                  if (q.isEmpty) return _customers.take(10);
                  return _customers.where((c) =>
                      c.name.toLowerCase().contains(q) ||
                      c.phone.contains(q)).take(15);
                },
                displayStringForOption: (c) => c.name,
                initialValue: TextEditingValue(text: _namCtrl.text),
                onSelected: (c) {
                  setState(() {
                    _namCtrl.text = c.name;
                    _phCtrl.text  = c.phone;
                    _custId       = c.id;
                  });
                },
                fieldViewBuilder: (ctx, ctrl, fn, _) {
                  return TextFormField(
                    controller: ctrl, focusNode: fn,
                    decoration: _deco('Name or phone', Icons.person_search_rounded),
                    onChanged: (v) { _namCtrl.text = v; _custId = ''; },
                    validator: (v) =>
                        v == null || v.trim().isEmpty ? 'Required' : null,
                  );
                },
                optionsViewBuilder: (ctx, onSel, opts) => Align(
                  alignment: Alignment.topLeft,
                  child: Material(
                    elevation: 8,
                    borderRadius: BorderRadius.circular(14),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                          maxHeight: 180, maxWidth: 400),
                      child: ListView.builder(
                        shrinkWrap: true,
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        itemCount: opts.length,
                        itemBuilder: (_, i) {
                          final c = opts.elementAt(i);
                          return ListTile(
                            dense: true,
                            leading: CircleAvatar(
                              radius: 15,
                              backgroundColor: _eLight,
                              child: Text(
                                c.name.isNotEmpty ? c.name[0].toUpperCase() : '?',
                                style: TextStyle(color: _eBlue,
                                    fontWeight: FontWeight.w800, fontSize: 12),
                              ),
                            ),
                            title: Text(c.name,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700, fontSize: 13)),
                            subtitle: Text(c.phone,
                                style: const TextStyle(fontSize: 11)),
                            onTap: () => onSel(c),
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 10),

              // ── Phone ─────────────────────────────────────────────────
              _label('PHONE'),
              TextFormField(
                controller: _phCtrl,
                keyboardType: TextInputType.phone,
                decoration: _deco('Phone number', Icons.call_outlined),
              ),

              const SizedBox(height: 12),

              // ── Services (multi-select chips) ─────────────────────────
              _label('SERVICES'),
              if (active.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('No active services',
                      style: TextStyle(color: Color(0xFFADB5BD), fontSize: 13)),
                )
              else
                Wrap(
                  spacing: 7,
                  runSpacing: 7,
                  children: active.map((s) {
                    final on = _serviceIds.contains(s.id);
                    return GestureDetector(
                      onTap: () => _toggleService(s.id),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 140),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 11, vertical: 7),
                        decoration: BoxDecoration(
                          color: on ? _eLight : const Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.circular(9),
                          border: Border.all(
                              color: on ? _eMid : _eBorder,
                              width: on ? 1.5 : 1),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          if (on)
                            Padding(
                              padding: const EdgeInsets.only(right: 5),
                              child: Icon(Icons.check_circle_rounded,
                                  size: 13, color: _eMid),
                            ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(s.name,
                                  style: TextStyle(
                                      color: on ? _eBlue : const Color(0xFF374151),
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w700)),
                              Text('LKR ${s.price.toStringAsFixed(0)}',
                                  style: TextStyle(
                                      color: on ? _eMid : const Color(0xFFADB5BD),
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ]),
                      ),
                    );
                  }).toList(),
                ),

              const SizedBox(height: 10),

              // ── Total + Amount row ────────────────────────────────────
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 13),
                    decoration: BoxDecoration(
                      color: _serviceIds.isEmpty ? _eBg : _eLight,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _serviceIds.isEmpty ? _eBorder : _eLightB,
                        width: _serviceIds.isEmpty ? 1 : 1.5,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${_serviceIds.length} service${_serviceIds.length == 1 ? '' : 's'}',
                          style: TextStyle(
                              color: _serviceIds.isEmpty
                                  ? const Color(0xFFADB5BD) : _eMid,
                              fontSize: 10.5,
                              fontWeight: FontWeight.w600),
                        ),
                        Text('LKR ${_calcTotal.toStringAsFixed(0)}',
                            style: TextStyle(
                                color: _serviceIds.isEmpty
                                    ? const Color(0xFF9CA3AF) : _eBlue,
                                fontSize: 15,
                                fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _label('AMOUNT (LKR)'),
                      TextFormField(
                        controller: _amtCtrl,
                        keyboardType: TextInputType.number,
                        decoration: _deco('Override amount', Icons.edit_outlined),
                      ),
                    ],
                  ),
                ),
              ]),

              const SizedBox(height: 12),

              // ── Date + Time ───────────────────────────────────────────
              Row(children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _label('DATE'),
                      _pickPill(value: _date, hint: 'Pick date',
                          icon: Icons.calendar_today_rounded, onTap: _pickDate),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _label('TIME'),
                      _pickPill(value: _time, hint: 'Pick time',
                          icon: Icons.access_time_rounded, onTap: _pickTime),
                    ],
                  ),
                ),
              ]),

              const SizedBox(height: 12),

              // ── Staff ─────────────────────────────────────────────────
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _label('STAFF'),
                      DropdownButtonFormField<String>(
                        initialValue: _staffId.isEmpty ? null : _staffId,
                        isExpanded: true,
                        decoration: _deco('Any', Icons.badge_outlined),
                        items: [
                          const DropdownMenuItem(value: '', child: Text('Any')),
                          ...widget.staffList.map((s) => DropdownMenuItem(
                              value: s.id,
                              child: Text(s.name,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 13)))),
                        ],
                        onChanged: (v) => setState(() => _staffId = v ?? ''),
                      ),
                    ],
                  ),
                ),
                if (widget.isSuperAdmin && widget.branches.isNotEmpty) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _label('BRANCH'),
                        DropdownButtonFormField<String>(
                          initialValue: _branchId.isEmpty ? null : _branchId,
                          isExpanded: true,
                          decoration: _deco('Branch', Icons.store_outlined),
                          items: widget.branches
                              .map((b) => DropdownMenuItem(
                                    value: b['id'],
                                    child: Text(b['name'] ?? '',
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontSize: 13)),
                                  ))
                              .toList(),
                          onChanged: (v) => setState(() => _branchId = v ?? ''),
                          validator: (v) =>
                              v == null || v.isEmpty ? 'Required' : null,
                        ),
                      ],
                    ),
                  ),
                ],
              ]),

              const SizedBox(height: 12),

              // ── Notes ─────────────────────────────────────────────────
              _label('NOTES'),
              TextFormField(
                controller: _noteCtrl,
                maxLines: 2,
                decoration: _deco('Notes (optional)', Icons.sticky_note_2_outlined),
              ),

              const SizedBox(height: 20),

              // ── Save button ───────────────────────────────────────────
              GestureDetector(
                onTap: _saving ? null : _save,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  decoration: BoxDecoration(
                    gradient: _saving
                        ? null
                        : LinearGradient(
                            colors: [_eBlue, _eMid],
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                          ),
                    color: _saving ? const Color(0xFFF3F4F6) : null,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: _saving
                        ? []
                        : [
                            BoxShadow(
                                color: _eBlue.withValues(alpha: 0.28),
                                blurRadius: 14,
                                offset: const Offset(0, 5))
                          ],
                  ),
                  child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (_saving)
                          const SizedBox(
                              width: 18, height: 18,
                              child: CircularProgressIndicator(
                                  color: Color(0xFF9CA3AF), strokeWidth: 2))
                        else
                          const Icon(Icons.save_rounded,
                              color: Colors.white, size: 18),
                        const SizedBox(width: 9),
                        Text(
                          _saving ? 'Saving...' : 'Save Changes',
                          style: TextStyle(
                              color: _saving
                                  ? const Color(0xFF9CA3AF)
                                  : Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.2),
                        ),
                      ]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
