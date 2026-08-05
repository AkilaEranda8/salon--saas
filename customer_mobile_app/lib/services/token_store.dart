import 'package:shared_preferences/shared_preferences.dart';

class TokenStore {
  static const _kToken = 'portal_token';
  static const _kPhone = 'portal_phone';

  Future<String?> readToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_kToken);
  }

  Future<String?> readPhone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_kPhone);
  }

  Future<void> save({required String token, required String phone}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kToken, token);
    await prefs.setString(_kPhone, phone);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kToken);
    await prefs.remove(_kPhone);
  }
}
