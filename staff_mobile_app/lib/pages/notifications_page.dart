import 'package:flutter/material.dart';

import '../services/notification_store.dart';

// ── Design tokens (matches dashboard palette) ─────────────────────────────────
const _bg      = Color(0xFFF2F5F2);
const _card    = Colors.white;
const _g900    = Color(0xFF1B3A2D);
const _g700    = Color(0xFF2D6A4F);
const _g100    = Color(0xFFD1FAE5);
const _text    = Color(0xFF111827);
const _sub     = Color(0xFF6B7280);
const _muted   = Color(0xFF9CA3AF);
const _divider = Color(0xFFE5E7EB);

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  @override
  void initState() {
    super.initState();
    // Mark all read when the page is opened
    WidgetsBinding.instance.addPostFrameCallback((_) {
      NotificationStore.instance.markAllRead();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _g900,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Notifications',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 17,
            color: Colors.white,
          ),
        ),
        actions: [
          ValueListenableBuilder<List<AppNotification>>(
            valueListenable: NotificationStore.instance.notifications,
            builder: (_, list, __) {
              if (list.isEmpty) return const SizedBox.shrink();
              return TextButton(
                onPressed: () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: const Text('Clear all notifications?'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Cancel'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text(
                            'Clear',
                            style: TextStyle(color: Colors.red),
                          ),
                        ),
                      ],
                    ),
                  );
                  if (ok == true) {
                    await NotificationStore.instance.clear();
                  }
                },
                child: const Text(
                  'Clear all',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
              );
            },
          ),
        ],
      ),
      body: ValueListenableBuilder<List<AppNotification>>(
        valueListenable: NotificationStore.instance.notifications,
        builder: (_, list, __) {
          if (list.isEmpty) return _emptyState();
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) => _NotifCard(
              notification: list[i],
              onDismiss: () => NotificationStore.instance.remove(list[i].id),
            ),
          );
        },
      ),
    );
  }

  Widget _emptyState() => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: _g100,
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.notifications_none_rounded,
              color: _g700, size: 36),
        ),
        const SizedBox(height: 16),
        const Text(
          'No notifications yet',
          style: TextStyle(
            color: _text,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Appointment alerts will appear here',
          style: TextStyle(color: _sub, fontSize: 13),
        ),
      ],
    ),
  );
}

// ── Notification card ─────────────────────────────────────────────────────────

class _NotifCard extends StatelessWidget {
  const _NotifCard({required this.notification, required this.onDismiss});
  final AppNotification notification;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: Key(notification.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        decoration: BoxDecoration(
          color: const Color(0xFFDC2626),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(Icons.delete_outline_rounded,
            color: Colors.white, size: 22),
      ),
      onDismissed: (_) => onDismiss(),
      child: Container(
        decoration: BoxDecoration(
          color: _card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _divider),
          boxShadow: const [
            BoxShadow(
              color: Color(0x08000000),
              blurRadius: 8,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon badge
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: _iconBg(),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(_icon(), color: _iconColor(), size: 20),
              ),
              const SizedBox(width: 12),
              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            notification.title,
                            style: const TextStyle(
                              color: _text,
                              fontSize: 13.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _timeAgo(notification.timestamp),
                          style: const TextStyle(
                              color: _muted, fontSize: 11),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      notification.body,
                      style: const TextStyle(
                          color: _sub, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _icon() {
    switch (notification.type) {
      case 'appointment_assigned':
      case 'new_appointment':
        return Icons.calendar_month_rounded;
      case 'appointment_cancelled':
        return Icons.event_busy_rounded;
      case 'appointment_reminder':
        return Icons.alarm_rounded;
      case 'new_walkin':
        return Icons.directions_walk_rounded;
      default:
        return Icons.notifications_rounded;
    }
  }

  Color _iconBg() {
    switch (notification.type) {
      case 'appointment_assigned':
      case 'new_appointment':
        return const Color(0xFFD1FAE5);
      case 'appointment_cancelled':
        return const Color(0xFFFEE2E2);
      case 'appointment_reminder':
        return const Color(0xFFFEF3C7);
      case 'new_walkin':
        return const Color(0xFFDBEAFE);
      default:
        return const Color(0xFFF3F4F6);
    }
  }

  Color _iconColor() {
    switch (notification.type) {
      case 'appointment_assigned':
      case 'new_appointment':
        return const Color(0xFF059669);
      case 'appointment_cancelled':
        return const Color(0xFFDC2626);
      case 'appointment_reminder':
        return const Color(0xFFD97706);
      case 'new_walkin':
        return const Color(0xFF2563EB);
      default:
        return const Color(0xFF6B7280);
    }
  }

  static String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24)   return '${diff.inHours}h ago';
    if (diff.inDays < 7)     return '${diff.inDays}d ago';
    final d = dt;
    return '${d.day}/${d.month}/${d.year}';
  }
}
