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

  /// Call once at startup to load persisted notifications.
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_prefKey);
      if (raw != null) {
        final list = (jsonDecode(raw) as List)
            .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
            .toList();
        // newest first
        list.sort((a, b) => b.timestamp.compareTo(a.timestamp));
        notifications.value = list;
      }
    } catch (e) {
      debugPrint('[NotificationStore] load error: $e');
    }
  }

  /// Add a new notification and persist.
  Future<void> add(AppNotification n) async {
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
    final updated = notifications.value.map((n) {
      n.isRead = true;
      return n;
    }).toList();
    notifications.value = List.from(updated);
    await _save(updated);
  }

  /// Remove a single notification by id.
  Future<void> remove(String id) async {
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
