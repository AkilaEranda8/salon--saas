import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/appointment.dart';
import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';

class AppointmentListResult {
  AppointmentListResult({
    required this.total,
    required this.page,
    required this.limit,
    required this.data,
  });

  final int total;
  final int page;
  final int limit;
  final List<Appointment> data;
}

class MobileApi {
  MobileApi({required String baseUrl})
    : baseUrl = baseUrl.endsWith('/')
          ? baseUrl.substring(0, baseUrl.length - 1)
          : baseUrl;

  final String baseUrl;

  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'username': username.trim(),
        'password': password.trim(),
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Login failed');
    }
    final bodyToken = '${body['token'] ?? ''}'.trim();
    if (bodyToken.isEmpty) {
      final cookieHeader = response.headers['set-cookie'] ?? '';
      final cookieToken = _extractTokenFromCookie(cookieHeader);
      if (cookieToken.isNotEmpty) {
        body['token'] = cookieToken;
      }
    }
    return body;
  }

  Future<List<Customer>> fetchCustomers({
    required String token,
    String? branchId,
    int limit = 500,
  }) async {
    final uri = Uri.parse(
      '$baseUrl/api/customers?limit=$limit${branchId != null && branchId.isNotEmpty ? '&branchId=$branchId' : ''}',
    );
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Customers load failed');
    }
    final list = (body['data'] as List? ?? const []);
    return list.whereType<Map>().map((e) => Customer.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<Customer> createCustomer({
    required String token,
    required String name,
    required String phone,
    required String email,
    required String? branchId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/customers'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'name': name.trim(),
        'phone': phone.trim(),
        'email': email.trim().isEmpty ? null : email.trim(),
        'branch_id': branchId,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Customer create failed');
    }
    return Customer.fromJson(body);
  }

  Future<List<SalonService>> fetchServices({required String token}) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/services?limit=200'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Services load failed');
    }
    final list = (body['data'] as List? ?? const []);
    return list.whereType<Map>().map((e) => SalonService.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<List<Map<String, dynamic>>> fetchBranches({required String token}) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/branches?limit=200'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Branches load failed');
    }
    final list = (body['data'] as List? ?? body as List? ?? const []);
    return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  Future<List<StaffMember>> fetchStaff({
    required String token,
    String? branchId,
  }) async {
    final uri = Uri.parse(
      '$baseUrl/api/staff?limit=200${branchId != null && branchId.isNotEmpty ? '&branchId=$branchId' : ''}',
    );
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Staff load failed');
    }
    final list = (body['data'] as List? ?? body as List? ?? const []);
    return list.whereType<Map>().map((e) => StaffMember.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<void> createService({
    required String token,
    required String name,
    required String category,
    required String price,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/services'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'name': name.trim(),
        'category': category.trim().isEmpty ? 'Other' : category.trim(),
        'price': double.tryParse(price.trim()) ?? 0,
        'duration_minutes': 30,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Service create failed');
    }
  }

  Future<AppointmentListResult> fetchAppointments({
    required String token,
    String? branchId,
    int page = 1,
    int limit = 20,
    String? status,
    String? date,
  }) async {
    final qp = <String, String>{
      'page': '$page',
      'limit': '$limit',
      if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      if (status != null && status.isNotEmpty) 'status': status,
      if (date != null && date.isNotEmpty) 'date': date,
    };
    final uri = Uri.parse('$baseUrl/api/appointments').replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Appointments load failed');
    }
    final list = (body['data'] as List? ?? const []);
    final items = list.whereType<Map>().map((e) => Appointment.fromJson(Map<String, dynamic>.from(e))).toList();
    return AppointmentListResult(
      total: int.tryParse('${body['total'] ?? items.length}') ?? items.length,
      page: int.tryParse('${body['page'] ?? page}') ?? page,
      limit: int.tryParse('${body['limit'] ?? limit}') ?? limit,
      data: items,
    );
  }

  Future<void> createAppointment({
    required String token,
    required String branchId,
    required String customerName,
    required String primaryServiceId,
    List<String>? serviceIds,
    required String date,
    required String time,
    String? customerId,
    String? phone,
    String? staffId,
    String? amount,
    String? notes,
  }) async {
    final bodyMap = <String, dynamic>{
      'branch_id': int.tryParse(branchId) ?? branchId,
      'customer_name': customerName.trim(),
      'service_id': int.tryParse(primaryServiceId) ?? primaryServiceId,
      if (serviceIds != null && serviceIds.isNotEmpty)
        'service_ids': serviceIds.map((id) => int.tryParse(id) ?? id).toList(),
      'date': date.trim(),
      'time': time.trim(),
      if (customerId != null && customerId.isNotEmpty) 'customer_id': int.tryParse(customerId) ?? customerId,
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      if (staffId != null && staffId.isNotEmpty) 'staff_id': int.tryParse(staffId) ?? staffId,
      if (amount != null && amount.trim().isNotEmpty) 'amount': double.tryParse(amount.trim()) ?? amount,
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
    };
    final response = await http.post(
      Uri.parse('$baseUrl/api/appointments'),
      headers: _authHeaders(token),
      body: jsonEncode(bodyMap),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Appointment create failed');
    }
  }

  Future<void> updateAppointment({
    required String token,
    required String appointmentId,
    required String customerName,
    required String primaryServiceId,
    List<String>? serviceIds,
    required String date,
    required String time,
    String? customerId,
    String? phone,
    String? staffId,
    String? amount,
    String? notes,
    String? status,
  }) async {
    final bodyMap = <String, dynamic>{
      'customer_name': customerName.trim(),
      'service_id': int.tryParse(primaryServiceId) ?? primaryServiceId,
      if (serviceIds != null && serviceIds.isNotEmpty)
        'service_ids': serviceIds.map((id) => int.tryParse(id) ?? id).toList(),
      'date': date.trim(),
      'time': time.trim(),
      if (customerId != null && customerId.isNotEmpty) 'customer_id': int.tryParse(customerId) ?? customerId,
      if (phone != null) 'phone': phone.trim(),
      if (staffId != null && staffId.isNotEmpty) 'staff_id': int.tryParse(staffId) ?? staffId,
      if (amount != null && amount.trim().isNotEmpty) 'amount': double.tryParse(amount.trim()) ?? amount,
      'notes': notes ?? '',
      if (status != null && status.isNotEmpty) 'status': status,
    };
    final response = await http.put(
      Uri.parse('$baseUrl/api/appointments/$appointmentId'),
      headers: _authHeaders(token),
      body: jsonEncode(bodyMap),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Appointment update failed');
    }
  }

  Future<void> updateAppointmentStatus({
    required String token,
    required String appointmentId,
    required String status,
  }) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/api/appointments/$appointmentId/status'),
      headers: _authHeaders(token),
      body: jsonEncode({'status': status}),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Status update failed');
    }
  }

  Future<void> deleteAppointment({
    required String token,
    required String appointmentId,
  }) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/api/appointments/$appointmentId'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Delete failed');
    }
  }

  Future<void> createPayment({
    required String token,
    required String branchId,
    required String appointmentId,
    required String customerName,
    required String serviceId,
    List<String>? serviceIds,
    required String amount,
    required String method,
    String? staffId,
    String? customerId,
  }) async {
    final parsedAmount = double.tryParse(amount.trim()) ?? 0;
    final bodyMap = <String, dynamic>{
      'branch_id': int.tryParse(branchId) ?? branchId,
      'appointment_id': int.tryParse(appointmentId) ?? appointmentId,
      'customer_name': customerName.trim(),
      'service_id': int.tryParse(serviceId) ?? serviceId,
      if (serviceIds != null && serviceIds.isNotEmpty)
        'service_ids': serviceIds.map((id) => int.tryParse(id) ?? id).toList(),
      'splits': [
        {'method': method, 'amount': parsedAmount}
      ],
      if (staffId != null && staffId.isNotEmpty) 'staff_id': int.tryParse(staffId) ?? staffId,
      if (customerId != null && customerId.isNotEmpty) 'customer_id': int.tryParse(customerId) ?? customerId,
    };
    final response = await http.post(
      Uri.parse('$baseUrl/api/payments'),
      headers: _authHeaders(token),
      body: jsonEncode(bodyMap),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Payment create failed');
    }
  }

  Map<String, String> _authHeaders(String token) => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $token',
  };

  Map<String, dynamic> _decode(String raw) {
    if (raw.trim().isEmpty) return {};
    final parsed = jsonDecode(raw);
    if (parsed is Map<String, dynamic>) return parsed;
    return {};
  }

  String _extractTokenFromCookie(String setCookie) {
    if (setCookie.isEmpty) return '';
    final parts = setCookie.split(';');
    for (final part in parts) {
      final chunk = part.trim();
      if (chunk.startsWith('token=')) {
        return chunk.substring('token='.length).trim();
      }
    }
    return '';
  }
}
