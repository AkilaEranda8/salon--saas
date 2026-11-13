import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ── Model ─────────────────────────────────────────────────────────────────────

class AppNotification {
  AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.timestamp,
    this.isRead = false,
    this.data = const {},
  });

  final String id;
  final String title;
  final String body;
  final String type;
  final DateTime timestamp;
  bool isRead;
  final Map<String, dynamic> data;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id:        j['id'] as String,
        title:     j['title'] as String,
        body:      j['body'] as String,
        type:      j['type'] as String? ?? 'general',
        timestamp: DateTime.parse(j['timestamp'] as String),
        isRead:    j['isRead'] as bool? ?? false,
        data:      Map<String, dynamic>.from(j['data'] as Map? ?? {}),
      );

  Map<String, dynamic> toJson() => {
        'id':        id,
        'title':     title,
        'body':      body,
        'type':      type,
        'timestamp': timestamp.toIso8601String(),
        'isRead':    isRead,
        'data':      data,
      };
}

// ── Store ─────────────────────────────────────────────────────────────────────

class NotificationStore {
  NotificationStore._();
  static final NotificationStore instance = NotificationStore._();

  static const _prefKey = 'app_notifications';
  static const _maxItems = 50;

  final ValueNotifier<List<AppNotification>> notifications =
      ValueNotifier([]);

  int get unreadCount =>
      notifications.value.where((n) => !n.isRead).length;

  Future<void>? _loadFuture;

  /// Loads persisted notifications. Idempotent: safe to call from several
  /// places (startup, [add], notification handlers) — only the first call
  /// reads storage unless [force] is true (e.g. to pick up items written by
  /// the background isolate). In-memory items are merged, never discarded.
  Future<void> load({bool force = false}) {
    if (force) _loadFuture = null;
    return _loadFuture ??= _doLoad();
  }

  Future<void> _doLoad() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      // Background isolate writes are not visible to a cached instance.
      await prefs.reload();
      final raw = prefs.getString(_prefKey);
      final byId = <String, AppNotification>{};
      if (raw != null) {
        for (final e in (jsonDecode(raw) as List)) {
          final n = AppNotification.fromJson(e as Map<String, dynamic>);
          byId[n.id] = n;
        }
      }
      // Anything already in memory wins over the persisted copy.
      for (final n in notifications.value) {
        byId[n.id] = n;
      }
      // newest first
      final list = byId.values.toList()
        ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
      notifications.value = list.take(_maxItems).toList();
    } catch (e) {
      _loadFuture = null; // allow a retry
      debugPrint('[NotificationStore] load error: $e');
    }
  }

  /// Add a new notification and persist.
  Future<void> add(AppNotification n) async {
    // Never save on top of an unloaded (or stale) store — that wiped history.
    await load(force: true);
    final current = List<AppNotification>.from(notifications.value);
    // Avoid duplicates by id
    current.removeWhere((x) => x.id == n.id);
    current.insert(0, n);
    // Keep max 50
    final trimmed = current.take(_maxItems).toList();
    notifications.value = trimmed;
    await _save(trimmed);
  }

  /// Mark all notifications as read and persist.
  Future<void> markAllRead() async {
    await load();
    final updated = notifications.value.map((n) {
      n.isRead = true;
      return n;
    }).toList();
    notifications.value = List.from(updated);
    await _save(updated);
  }

  /// Remove a single notification by id.
  Future<void> remove(String id) async {
    await load();
    final updated = notifications.value.where((n) => n.id != id).toList();
    notifications.value = updated;
    await _save(updated);
  }

  /// Clear all notifications.
  Future<void> clear() async {
    notifications.value = [];
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefKey);
  }

  Future<void> _save(List<AppNotification> list) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefKey, jsonEncode(list.map((n) => n.toJson()).toList()));
    } catch (e) {
      debugPrint('[NotificationStore] save error: $e');
    }
  }
}
