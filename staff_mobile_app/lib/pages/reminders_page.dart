import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../state/app_state.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest  = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas  = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border  = Color(0xFFE5E7EB);
const Color _ink     = Color(0xFF111827);
const Color _muted   = Color(0xFF6B7280);

// ── Priority metadata ─────────────────────────────────────────────────────────
enum _Priority { low, medium, high }

extension _PriorityX on _Priority {
  String get label => const ['Low', 'Medium', 'High'][index];
  Color  get color => const [
    Color(0xFF22C55E),
    Color(0xFFF59E0B),
    Color(0xFFEF4444),
  ][index];
  Color  get bg => const [
    Color(0xFFF0FDF4),
    Color(0xFFFFFBEB),
    Color(0xFFFEF2F2),
  ][index];
  IconData get icon => const [
    Icons.flag_outlined,
    Icons.flag_rounded,
    Icons.flag_rounded,
  ][index];
}

// ── Filter tabs ───────────────────────────────────────────────────────────────
enum _Filter { all, pending, done }

// ─────────────────────────────────────────────────────────────────────────────
class RemindersPage extends StatefulWidget {
  const RemindersPage({super.key});
  @override
  State<RemindersPage> createState() => _RemindersPageState();
}

class _RemindersPageState extends State<RemindersPage> {
  final List<_Reminder> _items = [];
  _Filter _filter = _Filter.all;
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load({bool silent = false}) async {
    if (!mounted) return;
    if (!silent) setState(() { _loading = true; _error = ''; });
    try {
      final app = AppStateScope.of(context);
      final rows = await app.loadReminders();
      if (mounted) {
        setState(() {
          _items
            ..clear()
            ..addAll(rows.map(_Reminder.fromJson));
        });
      }
    } catch (e) {
      if (mounted && !silent) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  bool get _canDelete {
    final r = AppStateScope.of(context).currentUser?.role ?? '';
    return ['superadmin', 'admin', 'manager'].contains(r);
  }

  List<_Reminder> get _filtered {
    switch (_filter) {
      case _Filter.pending: return _items.where((r) => !r.done).toList();
      case _Filter.done:    return _items.where((r) => r.done).toList();
      case _Filter.all:     return List.from(_items);
    }
  }

  int get _pendingCount => _items.where((r) => !r.done).length;
  int get _doneCount    => _items.where((r) => r.done).length;

  Future<void> _toggle(int id) async {
    final app = AppStateScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final ok = await app.toggleReminder(id);
    if (!mounted) return;
    if (ok) {
      await _load(silent: true);
    } else {
      messenger.showSnackBar(
        SnackBar(content: Text(app.lastError ?? 'Failed to update reminder')),
      );
    }
  }

  Future<void> _delete(int id) async {
    if (!_canDelete) return;
    final app = AppStateScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final ok = await app.deleteReminder(id);
    if (!mounted) return;
    if (ok) {
      await _load(silent: true);
    } else {
      messenger.showSnackBar(
        SnackBar(content: Text(app.lastError ?? 'Failed to delete reminder')),
      );
    }
  }

  Future<void> _clearDone() async {
    if (!_canDelete || !mounted) return;
    final doneIds = _items.where((r) => r.done).map((r) => r.id).toList();
    final app = AppStateScope.of(context);
    for (final id in doneIds) {
      await app.deleteReminder(id);
      if (!mounted) return;
    }
    await _load(silent: true);
  }

  Future<void> _openAdd() async {
    final result = await showModalBottomSheet<_NewReminderPayload>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _AddReminderSheet(),
    );
    if (result == null || !mounted) return;
    final app = AppStateScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final ok = await app.createReminder(
      title: result.title,
      priority: _Reminder.priorityToApi(result.priority),
      dueDate: result.dueDate,
    );
    if (!mounted) return;
    if (ok) {
      await _load(silent: true);
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('Reminder saved — staff notified')),
      );
    } else {
      messenger.showSnackBar(
        SnackBar(content: Text(app.lastError ?? 'Failed to save reminder')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = _filtered;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: _canvas,
        body: Column(children: [
          _buildHeader(),
          _buildFilterTabs(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _forest))
                : _error.isNotEmpty && _items.isEmpty
                    ? _buildError()
                    : list.isEmpty
                        ? _buildEmpty()
                        : RefreshIndicator(
                            color: _forest,
                            onRefresh: _load,
                            child: _buildList(list),
                          ),
          ),
        ]),
        floatingActionButton: Padding(
          padding: const EdgeInsets.only(bottom: 16, right: 4),
          child: GestureDetector(
            onTap: _openAdd,
            child: Container(
              height: 52,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [BoxShadow(
                  color: _forest.withValues(alpha: 0.35),
                  blurRadius: 16, offset: const Offset(0, 6))],
              ),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.add_rounded, color: Colors.white, size: 20),
                SizedBox(width: 7),
                Text('Add Reminder',
                  style: TextStyle(color: Colors.white, fontSize: 14,
                      fontWeight: FontWeight.w800, letterSpacing: 0.1)),
              ]),
            ),
          ),
        ),
        floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      ),
    );
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  Widget _buildHeader() => Container(
    color: _canvas,
    child: SafeArea(
      bottom: false,
      child: Column(children: [
        // Top bar
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
          child: Row(children: [
            GestureDetector(
              onTap: () => Navigator.of(context).maybePop(),
              child: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle, color: _surface,
                  boxShadow: [BoxShadow(
                    color: Colors.black.withValues(alpha: 0.07),
                    blurRadius: 8, offset: const Offset(0, 2))],
                ),
                child: const Icon(Icons.arrow_back_ios_new_rounded,
                    color: _forest, size: 15),
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Row(children: [
                Icon(Icons.notifications_rounded, color: _forest, size: 18),
                SizedBox(width: 6),
                Text('Reminders',
                  style: TextStyle(
                    color: _forest, fontSize: 16,
                    fontWeight: FontWeight.w800, letterSpacing: -0.3)),
              ]),
            ),
            if (_canDelete && _doneCount > 0)
              GestureDetector(
                onTap: _clearDone,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: _surface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _border),
                    boxShadow: [BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 6, offset: const Offset(0, 2))],
                  ),
                  child: const Text('Clear done',
                    style: TextStyle(
                      color: _muted, fontSize: 12,
                      fontWeight: FontWeight.w600)),
                ),
              ),
          ]),
        ),

        // Stats card
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [_forest, _emerald],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [BoxShadow(
                color: _forest.withValues(alpha: 0.30),
                blurRadius: 16, offset: const Offset(0, 6))],
            ),
            child: Row(children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Pending',
                      style: TextStyle(color: Colors.white70,
                          fontSize: 12, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text('$_pendingCount',
                      style: const TextStyle(
                        color: Colors.white, fontSize: 28,
                        fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                    const SizedBox(height: 2),
                    const Text('reminders to complete',
                      style: TextStyle(color: Colors.white54,
                          fontSize: 11.5, fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
              // Divider
              Container(
                width: 1, height: 40,
                color: Colors.white.withValues(alpha: 0.20),
                margin: const EdgeInsets.symmetric(horizontal: 16)),
              // Done count
              Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
                const Text('Done',
                  style: TextStyle(color: Colors.white70,
                      fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text('$_doneCount',
                  style: const TextStyle(
                    color: Colors.white, fontSize: 22,
                    fontWeight: FontWeight.w800)),
              ]),
              const SizedBox(width: 16),
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14)),
                child: const Icon(Icons.checklist_rounded,
                    color: Colors.white, size: 24),
              ),
            ]),
          ),
        ),
      ]),
    ),
  );

  // ── Filter tabs ────────────────────────────────────────────────────────────
  Widget _buildFilterTabs() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
    child: Row(children: _Filter.values.map((f) {
      final active = _filter == f;
      final label  = f == _Filter.all     ? 'All  ${_items.length}'
                   : f == _Filter.pending ? 'Pending  $_pendingCount'
                   : 'Done  $_doneCount';
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() => _filter = f),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            margin: EdgeInsets.only(right: f != _Filter.done ? 6 : 0),
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: active ? _forest : _surface,
              borderRadius: BorderRadius.circular(11),
              border: Border.all(
                color: active ? _forest : _border),
              boxShadow: active ? [BoxShadow(
                color: _forest.withValues(alpha: 0.20),
                blurRadius: 8, offset: const Offset(0, 3))] : [],
            ),
            child: Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: active ? Colors.white : _muted,
                fontSize: 12.5, fontWeight: FontWeight.w700)),
          ),
        ),
      );
    }).toList()),
  );

  // ── List ───────────────────────────────────────────────────────────────────
  Widget _buildList(List<_Reminder> list) => ListView.builder(
    padding: const EdgeInsets.fromLTRB(16, 0, 16, 88),
    itemCount: list.length,
    itemBuilder: (ctx, i) => _ReminderCard(
      reminder: list[i],
      onToggle: () => _toggle(list[i].id),
      onDelete: _canDelete ? () => _delete(list[i].id) : null,
    ),
  );

  Widget _buildError() => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(_error, textAlign: TextAlign.center,
          style: const TextStyle(color: _muted, fontSize: 14)),
        const SizedBox(height: 12),
        TextButton(onPressed: _load, child: const Text('Retry')),
      ]),
    ),
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  Widget _buildEmpty() => Center(child: Column(
    mainAxisSize: MainAxisSize.min, children: [
    Container(
      width: 72, height: 72,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [_forest.withValues(alpha: 0.12),
                   _emerald.withValues(alpha: 0.06)],
          begin: Alignment.topLeft, end: Alignment.bottomRight),
        shape: BoxShape.circle),
      child: const Icon(Icons.notifications_none_rounded,
          color: _forest, size: 30),
    ),
    const SizedBox(height: 16),
    Text(
      _filter == _Filter.done
          ? 'No completed reminders'
          : _filter == _Filter.pending
              ? 'All caught up!'
              : 'No reminders yet',
      style: const TextStyle(color: _ink, fontSize: 16,
          fontWeight: FontWeight.w700)),
    const SizedBox(height: 6),
    Text(
      _filter == _Filter.done
          ? 'Complete some reminders first'
          : 'Tap + to add your first reminder',
      style: const TextStyle(color: _muted, fontSize: 13)),
  ]));
}

// ═════════════════════════════════════════════════════════════════════════════
// REMINDER CARD
// ═════════════════════════════════════════════════════════════════════════════
class _ReminderCard extends StatelessWidget {
  const _ReminderCard({
    required this.reminder,
    required this.onToggle,
    this.onDelete,
  });
  final _Reminder reminder;
  final VoidCallback onToggle;
  final VoidCallback? onDelete;

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1)  return 'Just now';
    if (diff.inHours < 1)    return '${diff.inMinutes}m ago';
    if (diff.inDays < 1)     return '${diff.inHours}h ago';
    if (diff.inDays == 1)    return 'Yesterday';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final r = reminder;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: r.done
            ? const Color(0xFFF9FAFB)
            : _surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: r.done ? _border : _border),
        boxShadow: r.done ? [] : [BoxShadow(
          color: Colors.black.withValues(alpha: 0.05),
          blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [

          // Checkbox
          GestureDetector(
            onTap: onToggle,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 24, height: 24,
              margin: const EdgeInsets.only(top: 1),
              decoration: BoxDecoration(
                color: r.done ? _forest : Colors.transparent,
                shape: BoxShape.circle,
                border: Border.all(
                  color: r.done ? _forest : _border,
                  width: 2)),
              child: r.done
                  ? const Icon(Icons.check_rounded,
                      color: Colors.white, size: 13)
                  : null,
            ),
          ),

          const SizedBox(width: 12),

          // Text + meta
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(r.text,
                  style: TextStyle(
                    color: r.done ? _muted : _ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    decoration: r.done
                        ? TextDecoration.lineThrough : null,
                    decorationColor: _muted,
                    height: 1.4)),
                const SizedBox(height: 6),
                Row(children: [
                  // Priority badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: r.priority.bg,
                      borderRadius: BorderRadius.circular(6)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(r.priority.icon,
                          size: 10, color: r.priority.color),
                      const SizedBox(width: 3),
                      Text(r.priority.label,
                        style: TextStyle(
                          color: r.priority.color, fontSize: 10.5,
                          fontWeight: FontWeight.w700)),
                    ]),
                  ),
                  const SizedBox(width: 8),
                  // Time
                  Icon(Icons.access_time_rounded,
                      size: 11, color: _muted),
                  const SizedBox(width: 3),
                  Text(_timeAgo(r.addedAt),
                    style: const TextStyle(
                      color: _muted, fontSize: 11,
                      fontWeight: FontWeight.w500)),
                  if (r.dueDate != null && r.dueDate!.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Icon(Icons.event_rounded, size: 11, color: _muted),
                    const SizedBox(width: 3),
                    Text(r.dueDate!,
                      style: const TextStyle(
                        color: _muted, fontSize: 11,
                        fontWeight: FontWeight.w500)),
                  ],
                ]),
              ],
            ),
          ),

          if (onDelete != null)
            GestureDetector(
              onTap: onDelete,
              child: Container(
                width: 32, height: 32,
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(8)),
                child: const Icon(Icons.delete_outline_rounded,
                    size: 15, color: Color(0xFFEF4444)),
              ),
            ),

        ]),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ADD REMINDER SHEET
// ═════════════════════════════════════════════════════════════════════════════
class _AddReminderSheet extends StatefulWidget {
  const _AddReminderSheet();
  @override
  State<_AddReminderSheet> createState() => _AddReminderSheetState();
}

class _AddReminderSheetState extends State<_AddReminderSheet> {
  final _ctrl = TextEditingController();
  _Priority _priority = _Priority.medium;
  String? _dueDate;

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  void _submit() {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    Navigator.of(context).pop(_NewReminderPayload(
      title: text,
      priority: _priority,
      dueDate: _dueDate,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(20, 0, 20, bottom + 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 18),
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFFE5E7EB),
                borderRadius: BorderRadius.circular(99)),
            ),
          ),

          // Title row
          Row(children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFFECFDF5),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFA7F3D0))),
              child: const Icon(Icons.notifications_rounded,
                  color: _forest, size: 19),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('New Reminder',
                    style: TextStyle(
                      color: _ink, fontSize: 17,
                      fontWeight: FontWeight.w800, letterSpacing: -0.2)),
                  Text('Add a task or note to remember',
                    style: TextStyle(
                      color: Color(0xFFADB5BD), fontSize: 12,
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
                    size: 16, color: _muted),
              ),
            ),
          ]),

          const SizedBox(height: 20),

          // Reminder text
          const _FieldLabel('REMINDER'),
          TextField(
            controller: _ctrl,
            autofocus: true,
            maxLines: 3,
            minLines: 2,
            textCapitalization: TextCapitalization.sentences,
            style: const TextStyle(color: _ink, fontSize: 14, height: 1.4),
            decoration: InputDecoration(
              hintText: 'e.g. Call customer before appointment…',
              hintStyle: const TextStyle(
                  color: Color(0xFFB0B8B0), fontSize: 14),
              prefixIcon: const Padding(
                padding: EdgeInsets.only(bottom: 42),
                child: Icon(Icons.notes_rounded, color: _forest, size: 19),
              ),
              filled: true,
              fillColor: const Color(0xFFF9FAFB),
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 13),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: _border)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: _border)),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: _forest, width: 1.8)),
            ),
          ),

          const SizedBox(height: 16),

          const _FieldLabel('DUE DATE (OPTIONAL)'),
          GestureDetector(
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: DateTime.now(),
                firstDate: DateTime.now().subtract(const Duration(days: 1)),
                lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
              );
              if (picked != null) {
                setState(() {
                  _dueDate =
                      '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
                });
              }
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              decoration: BoxDecoration(
                color: const Color(0xFFF9FAFB),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _border),
              ),
              child: Row(children: [
                const Icon(Icons.calendar_today_rounded, color: _forest, size: 16),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _dueDate ?? 'Tap to pick a due date',
                    style: TextStyle(
                      color: _dueDate == null ? const Color(0xFFB0B8B0) : _ink,
                      fontSize: 14,
                    ),
                  ),
                ),
                if (_dueDate != null)
                  GestureDetector(
                    onTap: () => setState(() => _dueDate = null),
                    child: const Icon(Icons.close_rounded, size: 16, color: _muted),
                  ),
              ]),
            ),
          ),

          const SizedBox(height: 16),

          // Priority selector
          const _FieldLabel('PRIORITY'),
          Row(children: _Priority.values.map((p) {
            final sel = _priority == p;
            return Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _priority = p),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  margin: EdgeInsets.only(right: p != _Priority.high ? 8 : 0),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: sel ? p.bg : const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: sel ? p.color : _border,
                      width: sel ? 1.5 : 1)),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                    Icon(p.icon, size: 13,
                        color: sel ? p.color : _muted),
                    const SizedBox(width: 5),
                    Text(p.label,
                      style: TextStyle(
                        color: sel ? p.color : _muted,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700)),
                  ]),
                ),
              ),
            );
          }).toList()),

          const SizedBox(height: 24),

          Container(height: 1, color: _border,
              margin: const EdgeInsets.only(bottom: 20)),

          // Save button
          GestureDetector(
            onTap: _submit,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 15),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight),
                borderRadius: BorderRadius.circular(14),
                boxShadow: [BoxShadow(
                  color: _forest.withValues(alpha: 0.28),
                  blurRadius: 14, offset: const Offset(0, 5))],
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle_rounded,
                      color: Colors.white, size: 18),
                  SizedBox(width: 9),
                  Text('Save Reminder',
                    style: TextStyle(
                      color: Colors.white, fontSize: 15,
                      fontWeight: FontWeight.w800, letterSpacing: 0.2)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text,
      style: const TextStyle(
        color: _muted, fontSize: 11.5,
        fontWeight: FontWeight.w700, letterSpacing: 0.5)),
  );
}

// ── Model ─────────────────────────────────────────────────────────────────────
class _NewReminderPayload {
  const _NewReminderPayload({
    required this.title,
    required this.priority,
    this.dueDate,
  });

  final String title;
  final _Priority priority;
  final String? dueDate;
}

class _Reminder {
  _Reminder.fromJson(Map<String, dynamic> json)
      : id = json['id'] is int ? json['id'] as int : int.tryParse('${json['id']}') ?? 0,
        text = json['title']?.toString() ?? '',
        priority = priorityFromApi(json['priority']?.toString()),
        dueDate = json['due_date']?.toString(),
        done = json['is_done'] == true,
        addedAt = DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now();

  final int id;
  final String text;
  final _Priority priority;
  final String? dueDate;
  bool done;
  final DateTime addedAt;

  static _Priority priorityFromApi(String? value) {
    switch (value?.toLowerCase()) {
      case 'high':
        return _Priority.high;
      case 'low':
        return _Priority.low;
      default:
        return _Priority.medium;
    }
  }

  static String priorityToApi(_Priority priority) =>
      const ['low', 'medium', 'high'][priority.index];
}
