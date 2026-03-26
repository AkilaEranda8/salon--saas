import 'package:flutter/material.dart';

import 'add_appointment_page.dart';
import '../models/appointment.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../models/staff_user.dart';
import '../state/app_state.dart';
import '../utils/appointment_notes.dart';

/// Mirrors web `AppointmentsPage.jsx` — filters, multi-service, customer search, payment, delete.
class AppointmentsPage extends StatefulWidget {
  const AppointmentsPage({super.key});

  @override
  State<AppointmentsPage> createState() => _AppointmentsPageState();
}

const int _kLimit = 20;

const List<String> _kFilterStatuses = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
];

const List<String> _kFormStatuses = ['pending', 'confirmed', 'cancelled'];

const List<String> _kPaymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Online'];

class _StatusMeta {
  const _StatusMeta(this.label, this.color, this.bg);
  final String label;
  final Color color;
  final Color bg;
}

_StatusMeta _metaForStatus(String s) {
  switch (s.toLowerCase()) {
    case 'confirmed':
    case 'in_service':
      return const _StatusMeta('In Service', Color(0xFF2563EB), Color(0xFFDBEAFE));
    case 'completed':
      return const _StatusMeta('Completed', Color(0xFF059669), Color(0xFFD1FAE5));
    case 'cancelled':
      return const _StatusMeta('Cancelled', Color(0xFFDC2626), Color(0xFFFEE2E2));
    default:
      return const _StatusMeta('Pending', Color(0xFFD97706), Color(0xFFFEF3C7));
  }
}

String _statusLabel(String s) => _metaForStatus(s).label;

class _AppointmentsPageState extends State<AppointmentsPage> {
  bool _loading = true;
  String? _loadError;
  int _page = 1;
  String _search = '';
  String _filterStatus = '';
  String _filterDate = '';
  String _filterBranch = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  bool _isSuperAdmin(BuildContext context) {
    final r = AppStateScope.of(context).currentUser?.role ?? '';
    return r == 'superadmin';
  }

  bool _canDelete(BuildContext context) {
    final r = AppStateScope.of(context).currentUser?.role ?? '';
    return r == 'superadmin' || r == 'admin' || r == 'manager';
  }

  String? _effectiveBranchForApi(BuildContext context) {
    if (_isSuperAdmin(context)) {
      return _filterBranch.isEmpty ? null : _filterBranch;
    }
    return AppStateScope.of(context).currentUser?.branchId;
  }

  Future<void> _refresh() async {
    final appState = AppStateScope.of(context);
    if (!appState.hasPermission(StaffPermission.canViewAppointments)) return;
    final isSuper = _isSuperAdmin(context);
    final branchForApi = _effectiveBranchForApi(context);
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      if (isSuper) {
        await appState.loadBranches();
      }
      await appState.loadAppointments(
        page: _page,
        limit: _kLimit,
        status: _filterStatus.isEmpty ? null : _filterStatus,
        date: _filterDate.isEmpty ? null : _filterDate,
        branchId: branchForApi,
      );
    } catch (e) {
      if (mounted) setState(() => _loadError = e.toString().replaceFirst('Exception: ', ''));
    }
    if (mounted) setState(() => _loading = false);
  }

  List<Appointment> _displayed(AppState appState) {
    final raw = appState.appointments;
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return raw;
    return raw.where((a) {
      return a.customerName.toLowerCase().contains(q) ||
          a.phone.toLowerCase().contains(q) ||
          a.serviceName.toLowerCase().contains(q) ||
          a.servicesDisplay.toLowerCase().contains(q) ||
          a.createdBy.toLowerCase().contains(q);
    }).toList();
  }

  Map<String, int> _countsOnPage(AppState appState) {
    final list = appState.appointments;
    final m = <String, int>{};
    for (final s in _kFilterStatuses) {
      m[s] = list.where((a) => a.status.toLowerCase() == s).length;
    }
    return m;
  }

  Future<void> _openAddPage() async {
    final appState = AppStateScope.of(context);
    if (!appState.hasPermission(StaffPermission.canAddAppointments)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No permission to add appointments.')),
      );
      return;
    }
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const AddAppointmentPage()),
    );
    if (ok == true && mounted) {
      await _refresh();
    }
  }

  Future<void> _openForm({Appointment? edit}) async {
    final appState = AppStateScope.of(context);
    if (!appState.hasPermission(StaffPermission.canAddAppointments)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No permission to add or edit appointments.')),
      );
      return;
    }
    final isSuperAdmin = _isSuperAdmin(context);
    setState(() => _loading = true);
    final services = await appState.loadServices();
    final branches = await appState.loadBranches();
    await appState.loadCustomers();
    final userBranch = appState.currentUser?.branchId ?? '';
    String? staffBranch = isSuperAdmin
        ? (edit?.branchId ?? '').isNotEmpty
              ? edit!.branchId
              : (_filterBranch.isNotEmpty ? _filterBranch : userBranch)
        : userBranch;
    if (staffBranch.isEmpty) staffBranch = userBranch;
    List<StaffMember> staffList = [];
    try {
      staffList = await appState.loadStaffList(branchId: staffBranch.isEmpty ? null : staffBranch);
    } catch (_) {}
    if (!mounted) return;
    setState(() => _loading = false);

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => _AppointmentEditorDialog(
        isEdit: edit != null,
        initial: edit,
        services: services,
        branches: branches,
        staffList: staffList,
        isSuperAdmin: isSuperAdmin,
        fixedBranchId: userBranch,
        filterBranchId: _filterBranch,
      ),
    );
    if (result == true && mounted) await _refresh();
  }

  Future<void> _showDelete(Appointment appt) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete appointment?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final appState = AppStateScope.of(context);
    final success = await appState.deleteAppointment(appt.id);
    if (!mounted) return;
    if (!success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(appState.lastError ?? 'Delete failed')),
      );
      return;
    }
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final theme = Theme.of(context);
    final canView = appState.hasPermission(StaffPermission.canViewAppointments);
    if (!canView) {
      return Scaffold(
        appBar: AppBar(title: const Text('Appointments')),
        body: const Center(child: Text('No permission to view appointments.')),
      );
    }

    final displayed = _displayed(appState);
    final counts = _countsOnPage(appState);
    final total = appState.appointmentTotal;
    final totalPages = (total / _kLimit).ceil().clamp(1, 999999);

    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FF),
      appBar: AppBar(
        title: const Text('Appointments'),
        backgroundColor: const Color(0xFFF4F7FF),
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
        actions: [
          IconButton(onPressed: _loading ? null : _refresh, icon: const Icon(Icons.refresh)),
        ],
      ),
      floatingActionButton: appState.hasPermission(StaffPermission.canAddAppointments)
          ? FloatingActionButton.extended(
              onPressed: _loading ? null : _openAddPage,
              backgroundColor: const Color(0xFF4F46E5),
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('New'),
            )
          : null,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_loadError!)))
              : RefreshIndicator(
                  onRefresh: _refresh,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _headerCard(theme, total),
                      const SizedBox(height: 12),
                      _statsRow(counts),
                      const SizedBox(height: 12),
                      if (_isSuperAdmin(context)) ...[
                        _branchRow(context),
                        const SizedBox(height: 10),
                      ],
                      _searchBar(theme),
                      const SizedBox(height: 10),
                      _statusChips(theme, counts),
                      const SizedBox(height: 10),
                      _dateAndBranchRow(theme),
                      const SizedBox(height: 14),
                      if (displayed.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(32),
                          child: Center(
                            child: Text(
                              'No appointments match your filters.',
                              style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w600),
                            ),
                          ),
                        )
                      else
                        ...displayed.map((a) => _appointmentCard(context, appState, a)),
                      const SizedBox(height: 12),
                      _paginationRow(theme, totalPages),
                    ],
                  ),
                ),
    );
  }

  Widget _headerCard(ThemeData theme, int total) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: const LinearGradient(colors: [Color(0xFF4F46E5), Color(0xFF06B6D4)]),
        boxShadow: const [
          BoxShadow(color: Color(0x334F46E5), blurRadius: 16, offset: Offset(0, 8)),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Appointments',
                  style: theme.textTheme.titleLarge?.copyWith(

                    color: Colors.white,

                    fontWeight: FontWeight.w800,

                  ),

                ),

                const SizedBox(height: 4),

                Text(

                  '$total total (page $_page)',

                  style: theme.textTheme.bodyMedium?.copyWith(

                    color: Colors.white.withValues(alpha: 0.92),

                  ),

                ),

              ],

            ),

          ),

          const CircleAvatar(

            radius: 22,

            backgroundColor: Color(0x33FFFFFF),

            child: Icon(Icons.event_note, color: Colors.white),

          ),

        ],

      ),

    );

  }



  Widget _statsRow(Map<String, int> counts) {

    Widget chip(String label, int v, Color c) {

      return Expanded(

        child: Container(

          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),

          decoration: BoxDecoration(

            color: Colors.white,

            borderRadius: BorderRadius.circular(12),

            border: Border.all(color: const Color(0xFFE2E8F0)),

          ),

          child: Column(

            children: [

              Text('$v', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: c)),

              const SizedBox(height: 2),

              Text(

                label,

                textAlign: TextAlign.center,

                style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w600),

              ),

            ],

          ),

        ),

      );

    }



    return Row(

      children: [

        chip('Pending', counts['pending'] ?? 0, const Color(0xFFD97706)),

        const SizedBox(width: 8),

        chip('In service', counts['confirmed'] ?? 0, const Color(0xFF2563EB)),

        const SizedBox(width: 8),

        chip('Done', counts['completed'] ?? 0, const Color(0xFF059669)),

        const SizedBox(width: 8),

        chip('Cancelled', counts['cancelled'] ?? 0, const Color(0xFFDC2626)),

      ],

    );

  }



  Widget _searchBar(ThemeData theme) {

    return TextField(

      decoration: InputDecoration(

        hintText: 'Search customer, phone, service, staff…',

        prefixIcon: const Icon(Icons.search, color: Color(0xFF94A3B8)),

        filled: true,

        fillColor: Colors.white,

        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE2E8F0))),

        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),

      ),

      onChanged: (v) => setState(() => _search = v),

    );

  }



  Widget _statusChips(ThemeData theme, Map<String, int> counts) {

    return Wrap(

      spacing: 8,

      runSpacing: 8,

      children: [

        ChoiceChip(

          label: Text('All (${appStateAppointmentCount(context)})'),

          selected: _filterStatus.isEmpty,

          onSelected: (_) {

            setState(() {

              _filterStatus = '';

              _page = 1;

            });

            _refresh();

          },

        ),

        ..._kFilterStatuses.map((s) {

          final m = _metaForStatus(s);

          final active = _filterStatus == s;

          return ChoiceChip(

            label: Text('${m.label} (${counts[s] ?? 0})'),

            selected: active,

            selectedColor: m.bg,

            labelStyle: TextStyle(color: active ? m.color : const Color(0xFF64748B), fontWeight: FontWeight.w600),

            onSelected: (_) {

              setState(() {

                _filterStatus = active ? '' : s;

                _page = 1;

              });

              _refresh();

            },

          );

        }),

      ],

    );

  }



  int appStateAppointmentCount(BuildContext context) {

    return AppStateScope.of(context).appointments.length;

  }



  Widget _dateAndBranchRow(ThemeData theme) {

    return Row(

      children: [

        Expanded(

          child: OutlinedButton.icon(

            onPressed: () async {

              final now = DateTime.now();

              final d = await showDatePicker(

                context: context,

                firstDate: DateTime(2020),

                lastDate: DateTime(2035),

                initialDate: _filterDate.isEmpty ? now : DateTime.tryParse(_filterDate) ?? now,

              );

              if (d == null) return;

              setState(() {

                _filterDate =

                    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

                _page = 1;

              });

              _refresh();

            },

            icon: const Icon(Icons.calendar_today, size: 18),

            label: Text(_filterDate.isEmpty ? 'Filter by date' : _filterDate),

          ),

        ),

        if (_filterDate.isNotEmpty) ...[

          const SizedBox(width: 8),

          IconButton(

            onPressed: () {

              setState(() {

                _filterDate = '';

                _page = 1;

              });

              _refresh();

            },

            icon: const Icon(Icons.clear),

          ),

        ],

      ],

    );

  }



  Widget _branchRow(BuildContext context) {

    final appState = AppStateScope.of(context);

    final branches = appState.branches;

    return Padding(

      padding: const EdgeInsets.only(bottom: 8),

      child: DropdownButtonFormField<String>(

        initialValue: _filterBranch.isEmpty ? null : _filterBranch,

        decoration: InputDecoration(

          labelText: 'Branch',

          filled: true,

          fillColor: Colors.white,

          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),

        ),

        items: [

          const DropdownMenuItem(value: '', child: Text('All branches')),

          ...branches.map((b) => DropdownMenuItem(value: b['id'], child: Text(b['name'] ?? ''))),

        ],

        onChanged: (v) {

          setState(() {

            _filterBranch = v ?? '';

            _page = 1;

          });

          _refresh();

        },

      ),

    );

  }



  Widget _appointmentCard(BuildContext context, AppState appState, Appointment a) {

    final style = _metaForStatus(a.status);

    final amt = a.displayAmount > 0 ? a.displayAmount : 0;

    final canEdit = ['superadmin', 'admin', 'manager', 'staff'].contains(appState.currentUser?.role ?? '');

    return InkWell(

      borderRadius: BorderRadius.circular(14),

      onTap: () => _showDetailSheet(context, a, canEdit),

      child: Container(

        margin: const EdgeInsets.only(bottom: 10),

        padding: const EdgeInsets.all(14),

        decoration: BoxDecoration(

          color: Colors.white,

          borderRadius: BorderRadius.circular(14),

          border: Border.all(color: const Color(0xFFE2E8F0)),

          boxShadow: const [BoxShadow(color: Color(0x10000000), blurRadius: 10, offset: Offset(0, 4))],

        ),

        child: Column(

          crossAxisAlignment: CrossAxisAlignment.start,

          children: [

            Row(

              crossAxisAlignment: CrossAxisAlignment.start,

              children: [

                Expanded(

                  child: Column(

                    crossAxisAlignment: CrossAxisAlignment.start,

                    children: [

                      Text(

                        a.customerName,

                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Color(0xFF0F172A)),

                      ),

                      if (a.phone.isNotEmpty)

                        Text(a.phone, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),

                    ],

                  ),

                ),

                Container(

                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),

                  decoration: BoxDecoration(color: style.bg, borderRadius: BorderRadius.circular(999)),

                  child: Text(

                    _statusLabel(a.status),

                    style: TextStyle(color: style.color, fontWeight: FontWeight.w700, fontSize: 11),

                  ),

                ),

              ],

            ),

            const SizedBox(height: 8),

            Text(

              a.servicesDisplay.isEmpty ? a.serviceName : a.servicesDisplay,

              style: const TextStyle(color: Color(0xFF475569), fontWeight: FontWeight.w600, fontSize: 13),

            ),

            const SizedBox(height: 4),

            Row(

              children: [

                Text('${a.date} · ${a.time}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),

                const Spacer(),

                Text(

                  'Rs. ${amt.toStringAsFixed(0)}',

                  style: const TextStyle(color: Color(0xFF059669), fontWeight: FontWeight.w800, fontSize: 14),

                ),

              ],

            ),

            if (a.createdBy.isNotEmpty)

              Padding(

                padding: const EdgeInsets.only(top: 6),

                child: Text('Staff: ${a.createdBy}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),

              ),

          ],

        ),

      ),

    );

  }



  Widget _paginationRow(ThemeData theme, int totalPages) {

    return Row(

      mainAxisAlignment: MainAxisAlignment.center,

      children: [

        TextButton(

          onPressed: _page <= 1 || _loading

              ? null

              : () {

                  setState(() => _page--);

                  _refresh();

                },

          child: const Text('Previous'),

        ),

        Padding(

          padding: const EdgeInsets.symmetric(horizontal: 16),

          child: Text('$_page / $totalPages', style: const TextStyle(fontWeight: FontWeight.w700)),

        ),

        TextButton(

          onPressed: _page >= totalPages || _loading

              ? null

              : () {

                  setState(() => _page++);

                  _refresh();

                },

          child: const Text('Next'),

        ),

      ],

    );

  }



  Future<void> _showDetailSheet(BuildContext context, Appointment appt, bool canEdit) async {

    final style = _metaForStatus(appt.status);

    final s = appt.status.toLowerCase();

    final canPay = canEdit && (s == 'confirmed' || s == 'in_service');

    final canEditRow = canEdit && s != 'completed' && s != 'cancelled';

    final showDelete = _canDelete(context);



    await showModalBottomSheet<void>(

      context: context,

      isScrollControlled: true,

      backgroundColor: Colors.transparent,

      builder: (ctx) => Padding(

        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),

        child: Container(

          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.88),

          padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),

          decoration: const BoxDecoration(

            color: Colors.white,

            borderRadius: BorderRadius.vertical(top: Radius.circular(22)),

          ),

          child: SingleChildScrollView(

            child: SafeArea(

              top: false,

              child: Column(

                crossAxisAlignment: CrossAxisAlignment.start,

                mainAxisSize: MainAxisSize.min,

                children: [

                  Center(

                    child: Container(

                      width: 48,

                      height: 4,

                      margin: const EdgeInsets.only(bottom: 14),

                      decoration: BoxDecoration(

                        color: const Color(0xFFE2E8F0),

                        borderRadius: BorderRadius.circular(999),

                      ),

                    ),

                  ),

                  Row(

                    children: [

                      Expanded(

                        child: Text(

                          appt.customerName,

                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),

                        ),

                      ),

                      Container(

                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),

                        decoration: BoxDecoration(color: style.bg, borderRadius: BorderRadius.circular(999)),

                        child: Text(

                          _statusLabel(appt.status),

                          style: TextStyle(color: style.color, fontWeight: FontWeight.w700, fontSize: 12),

                        ),

                      ),

                    ],

                  ),

                  if (appt.phone.isNotEmpty) Text(appt.phone, style: const TextStyle(color: Color(0xFF64748B))),

                  const SizedBox(height: 12),

                  _detailRow('Services', appt.servicesDisplay.isEmpty ? appt.serviceName : appt.servicesDisplay),

                  _detailRow('Branch', appt.branchName.isEmpty ? '—' : appt.branchName),

                  _detailRow('Date', appt.date),

                  _detailRow('Time', appt.time),

                  _detailRow('Amount', 'Rs. ${appt.displayAmount.toStringAsFixed(0)}'),

                  if (AppointmentNotes.stripAdditionalServicesLine(appt.notes).isNotEmpty)

                    _detailRow('Notes', AppointmentNotes.stripAdditionalServicesLine(appt.notes)),

                  const SizedBox(height: 12),

                  if (canEditRow) ...[

                    Row(

                      children: [

                        Expanded(

                          child: OutlinedButton(

                            onPressed: () {

                              Navigator.pop(ctx);

                              _showStatusChange(appt);

                            },

                            child: const Text('Status'),

                          ),

                        ),

                        const SizedBox(width: 8),

                        Expanded(

                          child: OutlinedButton(

                            onPressed: () {

                              Navigator.pop(ctx);

                              _openForm(edit: appt);

                            },

                            child: const Text('Edit'),

                          ),

                        ),

                      ],

                    ),

                    const SizedBox(height: 8),

                  ],

                  if (canPay)

                    FilledButton.icon(

                      onPressed: () {

                        Navigator.pop(ctx);

                        _showPaymentDialog(appt);

                      },

                      icon: const Icon(Icons.payments_outlined),

                      label: const Text('Collect payment'),

                      style: FilledButton.styleFrom(

                        minimumSize: const Size(double.infinity, 48),

                        backgroundColor: const Color(0xFF059669),

                      ),

                    ),

                  if (showDelete)

                    Padding(

                      padding: const EdgeInsets.only(top: 8),

                      child: OutlinedButton(

                        onPressed: () {

                          Navigator.pop(ctx);

                          _showDelete(appt);

                        },

                        style: OutlinedButton.styleFrom(

                          minimumSize: const Size(double.infinity, 44),

                          foregroundColor: const Color(0xFFDC2626),

                        ),

                        child: const Text('Delete'),

                      ),

                    ),

                  const SizedBox(height: 8),

                  TextButton(

                    onPressed: () => Navigator.pop(ctx),

                    child: const Text('Close'),

                  ),

                ],

              ),

            ),

          ),

        ),

      ),

    );

  }



  Widget _detailRow(String k, String v) {

    return Padding(

      padding: const EdgeInsets.only(bottom: 8),

      child: Row(

        crossAxisAlignment: CrossAxisAlignment.start,

        children: [

          SizedBox(

            width: 88,

            child: Text(k, style: const TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w600)),

          ),

          Expanded(
            child: Text(v, style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }



  Future<void> _showStatusChange(Appointment appt) async {

    String? next = appt.status;

    final appState = AppStateScope.of(context);

    final picked = await showDialog<String>(

      context: context,

      builder: (ctx) => AlertDialog(

        title: const Text('Change status'),

        content: DropdownButtonFormField<String>(

          initialValue: appt.status,

          items: _kFilterStatuses

              .map((s) => DropdownMenuItem(value: s, child: Text(_statusLabel(s))))

              .toList(),

          onChanged: (v) => next = v,

        ),

        actions: [

          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),

          FilledButton(onPressed: () => Navigator.pop(ctx, next), child: const Text('Save')),

        ],

      ),

    );

    if (picked == null || picked == appt.status) return;

    final ok = await appState.changeAppointmentStatus(appointmentId: appt.id, status: picked);

    if (!mounted) return;

    if (!ok) {

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appState.lastError ?? 'Failed')));

      return;

    }

    await _refresh();

  }



  Future<void> _showPaymentDialog(Appointment appt) async {

    final appState = AppStateScope.of(context);

    await appState.loadServices();

    if (!mounted) return;

    final services = appState.services;



    final ids = <int>[];

    final sid = int.tryParse(appt.serviceId);

    if (sid != null) ids.add(sid);

    for (final name in AppointmentNotes.parseAdditionalServiceNames(appt.notes)) {

      for (final s in services) {

        if (s.name == name) {

          final id = int.tryParse(s.id);

          if (id != null && !ids.contains(id)) ids.add(id);

        }

      }

    }



    final selected = List<int>.from(ids);

    final amountCtrl = TextEditingController(

      text: appt.displayAmount > 0 ? appt.displayAmount.toStringAsFixed(0) : '',

    );

    String method = _kPaymentMethods.first;



    final ok = await showDialog<bool>(

      context: context,

      builder: (ctx) => StatefulBuilder(

        builder: (context, setLocal) {

          return AlertDialog(

            title: const Text('Collect payment'),

            content: SingleChildScrollView(

              child: Column(

                mainAxisSize: MainAxisSize.min,

                crossAxisAlignment: CrossAxisAlignment.start,

                children: [

                  const Text('Services', style: TextStyle(fontWeight: FontWeight.w700)),

                  const SizedBox(height: 8),

                  Wrap(

                    spacing: 6,

                    runSpacing: 6,

                    children: services.map((s) {

                      final id = int.tryParse(s.id);

                      if (id == null) return const SizedBox.shrink();

                      final on = selected.contains(id);

                      return FilterChip(

                        label: Text(s.name),

                        selected: on,

                        onSelected: (_) {

                          setLocal(() {

                            if (on) {

                              selected.remove(id);

                            } else {

                              selected.add(id);

                            }

                            var sum = 0.0;

                            for (final x in selected) {

                              for (final sv in services) {

                                if (int.tryParse(sv.id) == x) sum += sv.price;

                              }

                            }

                            amountCtrl.text = sum > 0 ? sum.toStringAsFixed(0) : '';

                          });

                        },

                      );

                    }).toList(),

                  ),

                  const SizedBox(height: 12),

                  TextField(

                    controller: amountCtrl,

                    keyboardType: TextInputType.number,

                    decoration: const InputDecoration(labelText: 'Amount (Rs.)', border: OutlineInputBorder()),

                  ),

                  const SizedBox(height: 12),

                  DropdownButtonFormField<String>(

                    initialValue: method,

                    decoration: const InputDecoration(labelText: 'Method', border: OutlineInputBorder()),

                    items: _kPaymentMethods.map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(),

                    onChanged: (v) => setLocal(() => method = v ?? method),

                  ),

                ],

              ),

            ),

            actions: [

              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),

              FilledButton(

                onPressed: () => Navigator.pop(ctx, true),

                child: const Text('Confirm'),

              ),

            ],

          );

        },

      ),

    );

    final amountPaid = amountCtrl.text;
    amountCtrl.dispose();

    if (ok != true || !mounted) return;

    final payIds = selected.map((e) => e.toString()).toList();

    final success = await appState.collectAppointmentPayment(

      appointment: appt,

      amount: amountPaid,

      method: method,

      paymentServiceIds: payIds,

    );

    if (!mounted) return;

    if (!success) {

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appState.lastError ?? 'Payment failed')));

      return;

    }

    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment recorded')));

    await _refresh();

  }

}



/// Form: customer search, multi-service, staff, date/time, amount, notes, status (edit).

class _AppointmentEditorDialog extends StatefulWidget {

  const _AppointmentEditorDialog({
    required this.isEdit,
    required this.initial,
    required this.services,
    required this.branches,
    required this.staffList,
    required this.isSuperAdmin,
    required this.fixedBranchId,
    required this.filterBranchId,
  });



  final bool isEdit;

  final Appointment? initial;

  final List<SalonService> services;

  final List<Map<String, String>> branches;

  final List<StaffMember> staffList;

  final bool isSuperAdmin;

  final String fixedBranchId;

  final String filterBranchId;



  @override

  State<_AppointmentEditorDialog> createState() => _AppointmentEditorDialogState();

}



class _AppointmentEditorDialogState extends State<_AppointmentEditorDialog> {

  final _formKey = GlobalKey<FormState>();

  final _customerSearch = TextEditingController();

  final _phone = TextEditingController();

  final _date = TextEditingController();

  final _time = TextEditingController();

  final _amount = TextEditingController();

  final _notes = TextEditingController();



  String _customerId = '';

  String _branchId = '';

  String _staffId = '';

  String _status = 'pending';

  final List<String> _orderedServiceIds = [];



  @override

  void initState() {

    super.initState();

    final a = widget.initial;

    if (a != null) {

      _customerSearch.text = a.customerName;

      _customerId = a.customerId;

      _phone.text = a.phone;

      _date.text = a.date.length >= 10 ? a.date.substring(0, 10) : a.date;

      _time.text = a.time;

      _amount.text = a.displayAmount > 0 ? a.displayAmount.toStringAsFixed(0) : '';

      _notes.text = AppointmentNotes.stripAdditionalServicesLine(a.notes);

      _branchId = a.branchId;

      _staffId = a.staffId;

      _status = _kFormStatuses.contains(a.status) ? a.status : 'pending';

      _initServiceIds(a);

    } else {

      final d = DateTime.now();

      _date.text =

          '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

      _branchId = widget.isSuperAdmin

          ? (widget.filterBranchId.isNotEmpty ? widget.filterBranchId : widget.fixedBranchId)

          : widget.fixedBranchId;

    }

  }



  void _initServiceIds(Appointment a) {
    final sid = a.serviceId;
    if (sid.isNotEmpty) _orderedServiceIds.add(sid);
    for (final name in AppointmentNotes.parseAdditionalServiceNames(a.notes)) {
      for (final s in widget.services) {
        if (s.name == name && !_orderedServiceIds.contains(s.id)) {
          _orderedServiceIds.add(s.id);
        }
      }
    }
  }



  @override

  void dispose() {

    _customerSearch.dispose();

    _phone.dispose();

    _date.dispose();

    _time.dispose();

    _amount.dispose();

    _notes.dispose();

    super.dispose();

  }



  double _calcTotal() {

    var t = 0.0;

    for (final id in _orderedServiceIds) {
      for (final s in widget.services) {
        if (s.id == id) t += s.price;
      }
    }

    return t;

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

    final picked = await showTimePicker(context: context, initialTime: TimeOfDay.now());

    if (picked == null) return;

    setState(() {

      _time.text =

          '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';

    });

  }



  @override

  Widget build(BuildContext context) {

    final active = widget.services.where((s) => s.isActive).toList();

    return AlertDialog(

      title: Text(widget.isEdit ? 'Edit appointment' : 'New appointment'),

      content: Form(

        key: _formKey,

        child: SingleChildScrollView(

          child: Column(

            mainAxisSize: MainAxisSize.min,

            children: [

              TextFormField(
                controller: _customerSearch,
                decoration: const InputDecoration(
                  labelText: 'Customer name',
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => _customerId = '',
                validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
              ),

              const SizedBox(height: 8),

              TextFormField(

                controller: _phone,

                decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder()),

              ),

              if (widget.isSuperAdmin) ...[

                const SizedBox(height: 8),

                DropdownButtonFormField<String>(

                  initialValue: _branchId.isEmpty ? null : _branchId,

                  decoration: const InputDecoration(labelText: 'Branch', border: OutlineInputBorder()),

                  items: widget.branches

                      .map((b) => DropdownMenuItem(value: b['id'], child: Text(b['name'] ?? '')))

                      .toList(),

                  onChanged: (v) => setState(() => _branchId = v ?? ''),

                  validator: (v) => v == null || v.isEmpty ? 'Branch required' : null,

                ),

              ],

              const SizedBox(height: 8),

              Align(

                alignment: Alignment.centerLeft,

                child: Text('Services', style: Theme.of(context).textTheme.titleSmall),

              ),

              const SizedBox(height: 4),

              ...active.map((s) {
                final on = _orderedServiceIds.contains(s.id);
                return CheckboxListTile(
                  dense: true,
                  value: on,
                  title: Text('${s.name} (Rs. ${s.price.toStringAsFixed(0)})'),
                  onChanged: (v) {
                    setState(() {
                      if (v == true) {
                        if (!_orderedServiceIds.contains(s.id)) {
                          _orderedServiceIds.add(s.id);
                        }
                      } else {
                        _orderedServiceIds.remove(s.id);
                      }
                      final t = _calcTotal();
                      _amount.text = t > 0 ? t.toStringAsFixed(0) : '';
                    });
                  },
                );
              }),

              DropdownButtonFormField<String>(

                initialValue: _staffId.isEmpty ? null : _staffId,

                decoration: const InputDecoration(labelText: 'Staff (optional)', border: OutlineInputBorder()),

                items: [

                  const DropdownMenuItem(value: '', child: Text('Any')),

                  ...widget.staffList.map((s) => DropdownMenuItem(value: s.id, child: Text(s.name))),

                ],

                onChanged: (v) => setState(() => _staffId = v ?? ''),

              ),

              const SizedBox(height: 8),

              TextFormField(

                controller: _date,

                readOnly: true,

                onTap: _pickDate,

                decoration: const InputDecoration(labelText: 'Date', border: OutlineInputBorder()),

                validator: (v) => v == null || v.isEmpty ? 'Required' : null,

              ),

              const SizedBox(height: 8),

              TextFormField(

                controller: _time,

                readOnly: true,

                onTap: _pickTime,

                decoration: const InputDecoration(labelText: 'Time', border: OutlineInputBorder()),

                validator: (v) => v == null || v.isEmpty ? 'Required' : null,

              ),

              const SizedBox(height: 8),

              TextFormField(

                controller: _amount,

                keyboardType: TextInputType.number,

                decoration: const InputDecoration(labelText: 'Amount (Rs.)', border: OutlineInputBorder()),

              ),

              if (widget.isEdit) ...[

                const SizedBox(height: 8),

                DropdownButtonFormField<String>(

                  initialValue: _status,

                  decoration: const InputDecoration(labelText: 'Status', border: OutlineInputBorder()),

                  items: _kFormStatuses.map((s) => DropdownMenuItem(value: s, child: Text(_statusLabel(s)))).toList(),

                  onChanged: (v) => setState(() => _status = v ?? _status),

                ),

              ],

              const SizedBox(height: 8),

              TextFormField(

                controller: _notes,

                maxLines: 2,

                decoration: const InputDecoration(labelText: 'Notes', border: OutlineInputBorder()),

              ),

            ],

          ),

        ),

      ),

      actions: [

        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),

        FilledButton(

          onPressed: () async {

            if (!_formKey.currentState!.validate()) return;

            if (_orderedServiceIds.isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Select at least one service')),
              );
              return;
            }

            final ordered = List<String>.from(_orderedServiceIds);

            final appState = AppStateScope.of(context);

            final branch = widget.isSuperAdmin

                ? _branchId

                : (widget.initial?.branchId.isNotEmpty == true ? widget.initial!.branchId : widget.fixedBranchId);

            final ok = await appState.saveAppointment(

              appointmentId: widget.isEdit ? widget.initial!.id : null,

              branchId: branch,

              customerName: _customerSearch.text.trim(),

              phone: _phone.text.trim(),

              customerId: _customerId,

              orderedServiceIds: ordered,

              date: _date.text.trim(),

              time: _time.text.trim(),

              staffId: _staffId,

              baseNotes: _notes.text,

              status: widget.isEdit ? _status : '',

              amountOverride: _amount.text.trim(),

            );

            if (!context.mounted) return;

            if (!ok) {

              ScaffoldMessenger.of(context).showSnackBar(

                SnackBar(content: Text(appState.lastError ?? 'Save failed')),

              );

              return;

            }

            Navigator.pop(context, true);

          },

          child: Text(widget.isEdit ? 'Save' : 'Create'),

        ),

      ],

    );

  }

}
