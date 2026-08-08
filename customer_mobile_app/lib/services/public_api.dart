import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../models/models.dart';

class PublicApi {
  PublicApi({String? baseUrl, int? tenantId})
      : baseUrl = (baseUrl ?? AppConfig.apiBaseUrl).replaceAll(RegExp(r'/+$'), ''),
        tenantId = tenantId ?? AppConfig.tenantIdInt;

  final String baseUrl;
  final int? tenantId;

  Uri _u(String path, [Map<String, String>? query]) {
    final q = <String, String>{...?query};
    if (tenantId != null) q.putIfAbsent('tenantId', () => '$tenantId');
    return Uri.parse('$baseUrl/api/public$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Map<String, String> _headers({String? token}) => {
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': 'application/json',
        if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      };

  dynamic _decode(http.Response res) {
    if (res.body.isEmpty) return null;
    try {
      return jsonDecode(res.body);
    } catch (_) {
      return res.body;
    }
  }

  Never _throw(http.Response res) {
    final body = _decode(res);
    final msg = body is Map ? (body['message']?.toString() ?? 'Request failed') : 'Request failed (${res.statusCode})';
    throw Exception(msg);
  }

  Future<List<SalonService>> getServices() async {
    final res = await http.get(_u('/services'), headers: _headers());
    if (res.statusCode >= 400) _throw(res);
    final body = _decode(res);
    final list = body is List ? body : <dynamic>[];
    return list.whereType<Map>().map((e) => SalonService.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<List<SalonStaff>> getStaff({int? serviceId, String? date}) async {
    final q = <String, String>{};
    if (serviceId != null) q['serviceId'] = '$serviceId';
    if (date != null && date.isNotEmpty) q['date'] = date;
    final res = await http.get(_u('/staff', q), headers: _headers());
    if (res.statusCode >= 400) _throw(res);
    final body = _decode(res);
    final list = body is List ? body : <dynamic>[];
    return list.whereType<Map>().map((e) => SalonStaff.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<List<String>> getAvailability({
    required int staffId,
    required String date,
    required int duration,
  }) async {
    final res = await http.get(
      _u('/availability', {
        'staffId': '$staffId',
        'date': date,
        'duration': '$duration',
      }),
      headers: _headers(),
    );
    if (res.statusCode >= 400) _throw(res);
    final body = _decode(res);
    final slots = body is Map ? body['slots'] : null;
    if (slots is! List) return [];
    return slots.map((e) => '$e').toList();
  }

  Future<Map<String, dynamic>> checkPhone(String phone) async {
    final res = await http.post(
      _u('/booking/check-phone'),
      headers: _headers(),
      body: jsonEncode({'phone': phone, 'tenantId': tenantId}),
    );
    if (res.statusCode >= 400) _throw(res);
    return Map<String, dynamic>.from(_decode(res) as Map);
  }

  Future<Map<String, dynamic>> requestBookingOtp(String phone) async {
    final res = await http.post(
      _u('/booking/request-otp'),
      headers: _headers(),
      body: jsonEncode({'phone': phone, 'tenantId': tenantId}),
    );
    if (res.statusCode >= 400) _throw(res);
    return Map<String, dynamic>.from(_decode(res) as Map);
  }

  Future<void> verifyBookingOtp({required String phone, required String otp}) async {
    final res = await http.post(
      _u('/booking/verify-otp'),
      headers: _headers(),
      body: jsonEncode({'phone': phone, 'otp': otp, 'tenantId': tenantId}),
    );
    if (res.statusCode >= 400) _throw(res);
  }

  Future<Map<String, dynamic>> createBooking({
    required String customerName,
    required String phone,
    String? email,
    String? notes,
    required int serviceId,
    required int staffId,
    required String date,
    required String time,
  }) async {
    final res = await http.post(
      _u('/bookings'),
      headers: _headers(),
      body: jsonEncode({
        'tenantId': tenantId,
        'customer_name': customerName,
        'phone': phone,
        if (email != null && email.isNotEmpty) 'email': email,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        'items': [
          {
            'service_id': serviceId,
            'staff_id': staffId,
            'date': date,
            'time': time,
          }
        ],
      }),
    );
    if (res.statusCode >= 400) _throw(res);
    return Map<String, dynamic>.from(_decode(res) as Map? ?? {});
  }

  Future<Map<String, dynamic>> requestPortalOtp(String phone) async {
    final res = await http.post(
      _u('/customer-portal/request-otp'),
      headers: _headers(),
      body: jsonEncode({
        'phone': phone.trim(),
        if (tenantId != null) 'tenantId': tenantId,
      }),
    );
    if (res.statusCode >= 400) _throw(res);
    final body = _decode(res);
    if (body is Map) return Map<String, dynamic>.from(body);
    return {'message': 'OTP sent successfully.'};
  }

  Future<Map<String, dynamic>> registerPortal({
    required String name,
    required String phone,
    String? email,
  }) async {
    final res = await http.post(
      _u('/customer-portal/register'),
      headers: _headers(),
      body: jsonEncode({
        'name': name.trim(),
        'phone': phone.trim(),
        if (email != null && email.isNotEmpty) 'email': email.trim(),
        if (tenantId != null) 'tenantId': tenantId,
      }),
    );
    if (res.statusCode >= 400) _throw(res);
    final body = _decode(res);
    if (body is Map) return Map<String, dynamic>.from(body);
    return {'message': 'OTP sent.'};
  }

  Future<String> verifyPortalOtp({required String phone, required String otp}) async {
    final res = await http.post(
      _u('/customer-portal/verify-otp'),
      headers: _headers(),
      body: jsonEncode({
        'phone': phone.trim(),
        'otp': otp.trim(),
        if (tenantId != null) 'tenantId': tenantId,
      }),
    );
    if (res.statusCode >= 400) _throw(res);
    final body = Map<String, dynamic>.from(_decode(res) as Map);
    final token = '${body['token'] ?? ''}'.trim();
    if (token.isEmpty) throw Exception('No token returned');
    return token;
  }

  Future<CustomerProfile> getMe(String token) async {
    final res = await http.get(_u('/customer-portal/me'), headers: _headers(token: token));
    if (res.statusCode >= 400) _throw(res);
    return CustomerProfile.fromJson(Map<String, dynamic>.from(_decode(res) as Map));
  }

  Future<List<BookingItem>> getBookings(String token) async {
    final res = await http.get(_u('/customer-portal/bookings'), headers: _headers(token: token));
    if (res.statusCode >= 400) _throw(res);
    final body = _decode(res);
    final list = body is List ? body : <dynamic>[];
    return list.whereType<Map>().map((e) => BookingItem.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<void> rebook({
    required String token,
    required int appointmentId,
    required String date,
    required String time,
  }) async {
    final res = await http.post(
      _u('/customer-portal/rebook'),
      headers: _headers(token: token),
      body: jsonEncode({
        'appointmentId': appointmentId,
        'date': date,
        'time': time,
      }),
    );
    if (res.statusCode >= 400) _throw(res);
  }

  Future<List<MobileOfferItem>> getOffers() async {
    final res = await http.get(_u('/offers'), headers: _headers());
    if (res.statusCode >= 400) _throw(res);
    final body = _decode(res);
    final list = body is List ? body : <dynamic>[];
    return list.whereType<Map>().map((e) => MobileOfferItem.fromJson(Map<String, dynamic>.from(e))).toList();
  }
}
