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
  bool _offline = false;

  /// True when the session is kept but the profile could not be loaded
  /// (network / server error). Cleared by a successful [refreshProfile].
  bool get offline => _offline;

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
          _offline = false;
        } on ApiException catch (e) {
          if (e.isAuthError) {
            // Token rejected → real logout.
            await logout(notify: false);
          } else {
            // 5xx / other server trouble: keep the session, retry later.
            _offline = true;
          }
        } catch (_) {
          // Network / timeout: keep the session and show an offline state;
          // [refreshProfile] loads the profile once we are back online.
          _offline = true;
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
    try {
      _profile = await _api.getMe(token);
      _offline = false;
    } on ApiException catch (e) {
      if (e.isAuthError) {
        // Fresh token rejected: roll back so we are not half-logged-in.
        await logout(notify: false);
        rethrow;
      }
      _offline = true; // server trouble: keep the valid token, retry later
    } catch (_) {
      _offline = true; // network: keep the token; profile loads on refresh
    }
    notifyListeners();
  }

  Future<void> refreshProfile() async {
    if (_token == null) return;
    try {
      _profile = await _api.getMe(_token!);
      _offline = false;
    } on ApiException catch (e) {
      if (e.isAuthError) {
        await logout();
      }
      rethrow;
    }
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
