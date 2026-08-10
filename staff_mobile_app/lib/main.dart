import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import 'pages/session_gate.dart';
import 'services/notification_service.dart';
import 'services/notification_store.dart';
import 'state/app_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Required before any widget can touch FirebaseMessaging.
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  } catch (_) {
    // App still runs without push.
  }

  runApp(const StaffOnlyApp());

  // Permissions / channels / store after UI is up.
  unawaited(_initNotifications());
}

Future<void> _initNotifications() async {
  try {
    await NotificationService.instance.init();
    await NotificationStore.instance.load();
  } catch (_) {}
}

class StaffOnlyApp extends StatefulWidget {
  const StaffOnlyApp({super.key});

  @override
  State<StaffOnlyApp> createState() => _StaffOnlyAppState();
}

class _StaffOnlyAppState extends State<StaffOnlyApp> {
  late final AppState _appState = AppState();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_bindPushWhenReady());
    });
  }

  Future<void> _bindPushWhenReady() async {
    try {
      await NotificationService.instance.init();
    } catch (_) {}
    _appState.bindPushTokenRefresh();
  }

  @override
  Widget build(BuildContext context) {
    return AppStateScope(
      notifier: _appState,
      child: MaterialApp(
        title: 'Hexaone',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        ),
        home: const SessionGate(),
      ),
    );
  }
}
