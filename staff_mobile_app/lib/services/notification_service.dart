import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'notification_store.dart';

/// Handles FCM token registration, foreground notifications and background
/// message routing for the staff mobile app.
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  /// Lazy — must not touch Firebase until [Firebase.initializeApp] has run.
  FirebaseMessaging? _fcm;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  void Function(String)? _tokenRefreshCallback;
  StreamSubscription<String>? _tokenRefreshSub;
  bool _initialised = false;

  FirebaseMessaging get _messaging {
    _fcm ??= FirebaseMessaging.instance;
    return _fcm!;
  }

  bool get _firebaseReady => Firebase.apps.isNotEmpty;

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'appointment_reminders',
    'Appointment Reminders',
    description: 'Notifications for upcoming appointments',
    importance: Importance.max,
    playSound: true,
  );

  /// Must be called once after Firebase is initialised (in main).
  Future<void> init() async {
    if (_initialised) {
      _attachTokenRefreshListener();
      return;
    }
    if (!_firebaseReady) {
      debugPrint('[NotificationService] Skip init — Firebase not ready.');
      return;
    }

    // Request permission (iOS / Android 13+)
    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    // Create Android notification channel
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    // Initialise flutter_local_notifications
    const androidInit = AndroidInitializationSettings('@drawable/ic_notification');
    const darwinInit = DarwinInitializationSettings();
    const initSettings =
        InitializationSettings(android: androidInit, iOS: darwinInit);
    await _localNotifications.initialize(initSettings);

    // Show notification when app is in foreground
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // When user taps a notification while app is in background
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);

    // Check if app was opened via a notification from terminated state
    final initial = await _messaging.getInitialMessage();
    if (initial != null) {
      _handleMessageOpenedApp(initial);
    }

    _initialised = true;
    _attachTokenRefreshListener();
    debugPrint('[NotificationService] Initialised.');
  }

  /// Returns the current FCM token (nullable if not available).
  Future<String?> getToken() async {
    if (!_firebaseReady || !_initialised) return null;
    try {
      return await _messaging.getToken();
    } catch (e) {
      debugPrint('[NotificationService] getToken error: $e');
      return null;
    }
  }

  /// Listen for token refreshes and call [onTokenRefresh] with the new token.
  /// Safe to call before Firebase is ready — attaches when [init] completes.
  void onTokenRefresh(void Function(String token) callback) {
    _tokenRefreshCallback = callback;
    _attachTokenRefreshListener();
  }

  void _attachTokenRefreshListener() {
    final callback = _tokenRefreshCallback;
    if (callback == null || !_firebaseReady || !_initialised) return;
    _tokenRefreshSub?.cancel();
    _tokenRefreshSub = _messaging.onTokenRefresh.listen(callback);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  void _handleForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    _saveToStore(message);

    _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          icon: '@drawable/ic_notification',
          importance: Importance.max,
          priority: Priority.high,
          playSound: true,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: jsonEncode(message.data),
    );
  }

  void _handleMessageOpenedApp(RemoteMessage message) {
    _saveToStore(message);
    debugPrint(
        '[NotificationService] Opened from notification: ${message.data}');
  }

  static void _saveToStore(RemoteMessage message) {
    final n = message.notification;
    final title = n?.title ?? message.data['title'] as String? ?? '';
    final body  = n?.body  ?? message.data['body']  as String? ?? '';
    if (title.isEmpty && body.isEmpty) return;

    NotificationStore.instance.add(AppNotification(
      id:        message.messageId ?? DateTime.now().millisecondsSinceEpoch.toString(),
      title:     title,
      body:      body,
      type:      message.data['type'] as String? ?? 'general',
      timestamp: message.sentTime ?? DateTime.now(),
      data:      Map<String, dynamic>.from(message.data),
    ));
  }
}

/// Top-level handler for background/terminated FCM messages (required by Firebase).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background isolate may not have default Firebase app yet.
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp();
  }
  debugPrint('[FCM Background] ${message.messageId}');
}
