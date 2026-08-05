import 'package:flutter/material.dart';

import '../config.dart';
import '../models/models.dart';
import '../services/public_api.dart';
import '../services/token_store.dart';

class AppState extends ChangeNotifier {
  AppState({PublicApi? api, TokenStore? tokenStore})
      : _api = api ?? PublicApi(),
        _tokenStore = tokenStore ?? TokenStore();

  final PublicApi _api;
  final TokenStore _tokenStore;

  PublicApi get api => _api;

  String? _token;
  CustomerProfile? _profile;
  bool _booting = true;
  String? _bootError;

  String? get token => _token;
  CustomerProfile? get profile => _profile;
  bool get isLoggedIn => _token != null && _token!.isNotEmpty;
  bool get booting => _booting;
  String? get bootError => _bootError;
  bool get hasTenant => AppConfig.hasTenant;

  Future<void> bootstrap() async {
    _booting = true;
    _bootError = null;
    notifyListeners();

    if (!AppConfig.hasTenant) {
      _bootError = 'TENANT_ID is missing. Launch with --dart-define=TENANT_ID=<id>.';
      _booting = false;
      notifyListeners();
      return;
    }

    try {
      final saved = await _tokenStore.readToken();
      if (saved != null && saved.isNotEmpty) {
        _token = saved;
        try {
          _profile = await _api.getMe(saved);
        } catch (_) {
          await logout(notify: false);
        }
      }
    } catch (e) {
      _bootError = e.toString().replaceFirst('Exception: ', '');
    }

    _booting = false;
    notifyListeners();
  }

  Future<void> setSession({required String token, required String phone}) async {
    _token = token;
    await _tokenStore.save(token: token, phone: phone);
    _profile = await _api.getMe(token);
    notifyListeners();
  }

  Future<void> refreshProfile() async {
    if (_token == null) return;
    _profile = await _api.getMe(_token!);
    notifyListeners();
  }

  Future<void> logout({bool notify = true}) async {
    _token = null;
    _profile = null;
    await _tokenStore.clear();
    if (notify) notifyListeners();
  }
}

class AppStateScope extends InheritedNotifier<AppState> {
  const AppStateScope({
    super.key,
    required AppState notifier,
    required super.child,
  }) : super(notifier: notifier);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppStateScope>();
    assert(scope != null, 'AppStateScope not found');
    return scope!.notifier!;
  }
}
