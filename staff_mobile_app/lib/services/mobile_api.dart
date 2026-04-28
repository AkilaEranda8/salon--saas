import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/appointment.dart';
import '../models/commission_record.dart';
import '../models/staff_commission_summary.dart';
import '../models/customer.dart';
import '../models/payment_record.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../models/walkin_entry.dart';

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

class MyCommissionResult {
  MyCommissionResult({
    required this.total,
    required this.records,
    required this.totalAdvances,
    required this.netCommission,
    required this.totalPaid,
    required this.balanceDue,
    this.staffName,
  });

  final double total;
  final double totalAdvances;
  final double netCommission;
  final double totalPaid;
  final double balanceDue;
  final List<CommissionRecord> records;
  final String? staffName;
}

class MobileApi {
  MobileApi({required String baseUrl, this.slug})
    : baseUrl = baseUrl.endsWith('/')
          ? baseUrl.substring(0, baseUrl.length - 1)
          : baseUrl;

  final String baseUrl;
  final String? slug;

  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: _baseHeaders(),
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

  /// GET /api/auth/me — resolves [branchId] from linked Staff when portal row has no branch.
  Future<Map<String, dynamic>> fetchMe({required String token}) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/auth/me'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Session refresh failed');
    }
    return body;
  }

  /// POST /api/fcm-token — registers the device FCM token for push notifications.
  Future<void> registerFcmToken({
    required String token,
    required String fcmToken,
    String? deviceInfo,
  }) async {
    try {
      await http.post(
        Uri.parse('$baseUrl/api/fcm-token'),
        headers: _authHeaders(token),
        body: jsonEncode({
          'fcm_token': fcmToken,
          if (deviceInfo != null) 'device_info': deviceInfo,
        }),
      );
    } catch (_) {}
  }

  /// DELETE /api/fcm-token — removes the device FCM token on logout.
  Future<void> removeFcmToken({required String token}) async {
    try {
      await http.delete(
        Uri.parse('$baseUrl/api/fcm-token'),
        headers: _authHeaders(token),
      );
    } catch (_) {}
  }

  /// Active promo discounts for Record Payment (GET /api/discounts/payment).
  Future<List<Map<String, dynamic>>> fetchDiscountsForPayment({
    required String token,
    required String branchId,
  }) async {
    final uri = Uri.parse('$baseUrl/api/discounts/payment').replace(
      queryParameters: {'branchId': branchId},
    );
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Discounts load failed');
    }
    final list = (body['data'] as List? ?? const []);
    return list
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
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

  /// GET /api/packages/customer/:id/active — active packages for a customer.
  Future<List<Map<String, dynamic>>> fetchActivePackages({
    required String token,
    required String customerId,
  }) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/packages/customer/$customerId/active'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) return const [];
    final List<dynamic> list = body is List
        ? List<dynamic>.from(body as List)
        : List<dynamic>.from((body as Map?)?['data'] as List? ?? const []);
    return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
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
    required String durationMinutes,
    required String price,
    required String description,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/services'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'name': name.trim(),
        'category': category.trim().isEmpty ? 'Other' : category.trim(),
        'duration_minutes': int.tryParse(durationMinutes.trim()) ?? 30,
        'price': double.tryParse(price.trim()) ?? 0,
        'description': description.trim().isEmpty ? null : description.trim(),
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
    String subtotal = '',
    String loyaltyDiscount = '0',
    String promoDiscount = '0',
    String? discountId,
    String? phone,
  }) async {
    final parsedAmount = double.tryParse(amount.trim()) ?? 0;
    final sub = double.tryParse(subtotal.trim()) ?? 0;
    final bodyMap = <String, dynamic>{
      'branch_id': int.tryParse(branchId) ?? branchId,
      'appointment_id': int.tryParse(appointmentId) ?? appointmentId,
      'customer_name': customerName.trim(),
      'service_id': int.tryParse(serviceId) ?? serviceId,
      if (serviceIds != null && serviceIds.isNotEmpty)
        'service_ids': serviceIds.map((id) => int.tryParse(id) ?? id).toList(),
      if (sub > 0) 'subtotal': sub,
      'loyalty_discount': double.tryParse(loyaltyDiscount.trim()) ?? 0,
      'promo_discount': double.tryParse(promoDiscount.trim()) ?? 0,
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      if (discountId != null && discountId.trim().isNotEmpty)
        'discount_id': int.tryParse(discountId.trim()) ?? discountId.trim(),
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

  Future<List<PaymentRecord>> fetchPayments({
    required String token,
    String? branchId,
    String? month,
    int limit = 200,
  }) async {
    final qp = <String, String>{
      'limit': '$limit',
      if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      if (month != null && month.isNotEmpty) 'month': month,
    };
    final uri = Uri.parse('$baseUrl/api/payments').replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Payments load failed');
    }
    final list = (body['data'] as List? ?? const []);
    return list
        .whereType<Map>()
        .map((row) => PaymentRecord.fromJson(Map<String, dynamic>.from(row)))
        .toList();
  }

  Future<void> createManualPayment({
    required String token,
    required String branchId,
    required String serviceId,
    List<String>? serviceIds,
    String? staffId,
    String? customerId,
    String? customerName,
    String? phone,
    required String totalAmount,
    required String loyaltyDiscount,
    String promoDiscount = '0',
    required String method,
    required String paidAmount,
    String? discountId,
    String? walkinToken,
  }) async {
    final subtotal = double.tryParse(totalAmount.trim()) ?? 0;
    final paid = double.tryParse(paidAmount.trim()) ?? 0;
    final response = await http.post(
      Uri.parse('$baseUrl/api/payments'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'branch_id': int.tryParse(branchId) ?? branchId,
        'service_id': int.tryParse(serviceId) ?? serviceId,
        if (serviceIds != null && serviceIds.isNotEmpty)
          'service_ids': serviceIds.map((id) => int.tryParse(id) ?? id).toList(),
        if (staffId != null && staffId.isNotEmpty) 'staff_id': int.tryParse(staffId) ?? staffId,
        if (customerId != null && customerId.isNotEmpty) 'customer_id': int.tryParse(customerId) ?? customerId,
        if (customerName != null && customerName.trim().isNotEmpty) 'customer_name': customerName.trim(),
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        if (walkinToken != null && walkinToken.trim().isNotEmpty) 'walkin_token': walkinToken.trim(),
        'subtotal': subtotal,
        if (discountId != null && discountId.trim().isNotEmpty)
          'discount_id': int.tryParse(discountId.trim()) ?? discountId.trim(),
        'loyalty_discount': double.tryParse(loyaltyDiscount.trim()) ?? 0,
        'promo_discount': double.tryParse(promoDiscount.trim()) ?? 0,
        'splits': [
          {
            'method': method,
            'amount': paid,
          },
        ],
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Payment create failed');
    }
  }

  /// GET /api/payments/:id — full row for edit (branch-scoped for staff).
  Future<Map<String, dynamic>> fetchPayment({
    required String token,
    required String paymentId,
  }) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/payments/$paymentId'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Payment load failed');
    }
    return Map<String, dynamic>.from(body as Map);
  }

  /// PUT /api/payments/:id — same shape as create (no branch change; no package splits).
  Future<void> updateManualPayment({
    required String token,
    required String paymentId,
    required String serviceId,
    List<String>? serviceIds,
    String? staffId,
    String? customerId,
    required String totalAmount,
    required String loyaltyDiscount,
    required String method,
    required String paidAmount,
    String? discountId,
  }) async {
    final subtotal = double.tryParse(totalAmount.trim()) ?? 0;
    final paid = double.tryParse(paidAmount.trim()) ?? 0;
    final response = await http.put(
      Uri.parse('$baseUrl/api/payments/$paymentId'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'service_id': int.tryParse(serviceId) ?? serviceId,
        if (serviceIds != null && serviceIds.isNotEmpty)
          'service_ids': serviceIds.map((id) => int.tryParse(id) ?? id).toList(),
        if (staffId != null && staffId.isNotEmpty) 'staff_id': int.tryParse(staffId) ?? staffId,
        if (customerId != null && customerId.isNotEmpty) 'customer_id': int.tryParse(customerId) ?? customerId,
        'subtotal': subtotal,
        if (discountId != null && discountId.trim().isNotEmpty)
          'discount_id': int.tryParse(discountId.trim()) ?? discountId.trim(),
        'loyalty_discount': double.tryParse(loyaltyDiscount.trim()) ?? 0,
        'splits': [
          {
            'method': method,
            'amount': paid,
          },
        ],
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Payment update failed');
    }
  }

  Future<List<WalkInEntry>> fetchWalkIns({
    required String token,
    required String branchId,
    String? date,
  }) async {
    final qp = <String, String>{
      'branchId': branchId,
      if (date != null && date.isNotEmpty) 'date': date,
    };
    final uri = Uri.parse('$baseUrl/api/walkin').replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decodeList(response.body);
    if (response.statusCode >= 400) {
      final mapBody = _decode(response.body);
      throw Exception(mapBody['message'] ?? 'Walk-in queue load failed');
    }
    return body
        .whereType<Map>()
        .map((row) => WalkInEntry.fromJson(Map<String, dynamic>.from(row)))
        .toList();
  }

  Future<MyCommissionResult> fetchMyCommission({
    required String token,
    String? month,
  }) async {
    final qp = <String, String>{
      if (month != null && month.isNotEmpty) 'month': month,
    };
    final uri = Uri.parse('$baseUrl/api/staff/me/commission').replace(
      queryParameters: qp.isEmpty ? null : qp,
    );
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Commission load failed');
    }
    final list = _commissionRowsFromBody(body);
    final staffMap = body['staff'] is Map
        ? Map<String, dynamic>.from(body['staff'])
        : const <String, dynamic>{};
    final totalRaw = body['total'];
    final records = <CommissionRecord>[];
    for (final item in list) {
      if (item is! Map) continue;
      try {
        records.add(CommissionRecord.fromJson(
            Map<String, dynamic>.from(item)));
      } catch (_) {
        // Skip malformed rows instead of failing the whole response.
      }
    }
    final advRaw  = body['totalAdvances'];
    final netRaw  = body['netCommission'];
    final paidRaw = body['totalPaid'];
    final balRaw  = body['balanceDue'];
    final totalComm = totalRaw is num ? totalRaw.toDouble() : double.tryParse('$totalRaw') ?? 0;
    final totalAdv  = advRaw  is num ? advRaw.toDouble()  : double.tryParse('$advRaw')  ?? 0;
    final netComm   = netRaw  is num ? netRaw.toDouble()  : double.tryParse('$netRaw')  ?? (totalComm - totalAdv).clamp(0, double.infinity);
    final tPaid     = paidRaw is num ? paidRaw.toDouble() : double.tryParse('$paidRaw') ?? 0;
    return MyCommissionResult(
      total:         totalComm,
      totalAdvances: totalAdv,
      netCommission: netComm,
      totalPaid:     tPaid,
      balanceDue:    balRaw is num ? balRaw.toDouble() : double.tryParse('$balRaw') ?? (netComm - tPaid).clamp(0, double.infinity),
      records:       records,
      staffName: '${staffMap['name'] ?? ''}'.trim().isEmpty ? null : '${staffMap['name']}',
    );
  }

  /// All staff commission totals for the month (admin / manager / superadmin).
  Future<List<StaffCommissionSummary>> fetchStaffCommissionSummary({
    required String token,
    required String month,
    String? branchId,
  }) async {
    final parts = month.split('-');
    if (parts.length < 2) {
      throw Exception('Invalid month format');
    }
    final year = parts[0];
    final m = parts[1].padLeft(2, '0');
    final qp = <String, String>{
      'month': m,
      'year': year,
      if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
    };
    final uri = Uri.parse('$baseUrl/api/staff/commission')
        .replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Commission summary failed');
    }
    final parsed = jsonDecode(response.body);
    List<dynamic> list;
    if (parsed is List) {
      list = parsed;
    } else if (parsed is Map<String, dynamic> && parsed['data'] is List) {
      list = parsed['data'] as List<dynamic>;
    } else {
      return const [];
    }
    return list
        .whereType<Map>()
        .map((e) => StaffCommissionSummary.fromJson(
            Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Payment-level commission rows for a specific staff id.
  Future<MyCommissionResult> fetchStaffCommissionReport({
    required String token,
    required String staffId,
    String? month,
  }) async {
    final qp = <String, String>{
      if (month != null && month.isNotEmpty) 'month': month,
    };
    final uri = Uri.parse('$baseUrl/api/staff/$staffId/commission').replace(
      queryParameters: qp.isEmpty ? null : qp,
    );
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Commission report failed');
    }
    final list = _commissionRowsFromBody(body);
    final staffMap = body['staff'] is Map
        ? Map<String, dynamic>.from(body['staff'])
        : const <String, dynamic>{};
    final totalRaw = body['total'];
    final records = <CommissionRecord>[];
    for (final item in list) {
      if (item is! Map) continue;
      try {
        records.add(CommissionRecord.fromJson(
            Map<String, dynamic>.from(item)));
      } catch (_) {}
    }
    final advRaw2  = body['totalAdvances'];
    final netRaw2  = body['netCommission'];
    final paidRaw2 = body['totalPaid'];
    final balRaw2  = body['balanceDue'];
    final totalComm2 = totalRaw is num ? totalRaw.toDouble() : double.tryParse('$totalRaw') ?? 0;
    final totalAdv2  = advRaw2  is num ? advRaw2.toDouble()  : double.tryParse('$advRaw2')  ?? 0;
    final netComm2   = netRaw2  is num ? netRaw2.toDouble()  : double.tryParse('$netRaw2')  ?? (totalComm2 - totalAdv2).clamp(0, double.infinity);
    final tPaid2     = paidRaw2 is num ? paidRaw2.toDouble() : double.tryParse('$paidRaw2') ?? 0;
    return MyCommissionResult(
      total:         totalComm2,
      totalAdvances: totalAdv2,
      netCommission: netComm2,
      totalPaid:     tPaid2,
      balanceDue:    balRaw2 is num ? balRaw2.toDouble() : double.tryParse('$balRaw2') ?? (netComm2 - tPaid2).clamp(0, double.infinity),
      records:       records,
      staffName: '${staffMap['name'] ?? ''}'.trim().isEmpty ? null : '${staffMap['name']}',
    );
  }

  /// Accepts `data`, `records`, or a top-level JSON array from the API.
  List<dynamic> _commissionRowsFromBody(Map<String, dynamic> body) {
    final data = body['data'];
    if (data is List) return data;
    final records = body['records'];
    if (records is List) return records;
    if (body['payments'] is List) return body['payments'] as List;
    return const [];
  }

  Future<WalkInEntry> createWalkInCheckIn({
    required String token,
    required String branchId,
    required String customerName,
    required String serviceId,
    List<String>? serviceIds,
    String? phone,
    String? note,
    String? staffId,
  }) async {
    final primaryNum = int.tryParse(serviceId.trim()) ?? 0;
    var ids = serviceIds == null || serviceIds.isEmpty
        ? <int>[]
        : serviceIds
            .map((id) => int.tryParse(id.trim()) ?? 0)
            .where((n) => n > 0)
            .toList();
    // Ensure junction + totals always get at least primary when serviceId is set
    if (ids.isEmpty && primaryNum > 0) {
      ids = [primaryNum];
    }
    final reqBody = <String, dynamic>{
      'customerName': customerName.trim(),
      'branchId': int.tryParse(branchId) ?? branchId,
      'serviceId': primaryNum > 0 ? primaryNum : int.tryParse(serviceId) ?? serviceId,
      if (ids.isNotEmpty) 'serviceIds': ids,
      if (ids.isNotEmpty) 'service_ids': ids,
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      if (staffId != null && staffId.trim().isNotEmpty)
        'staffId': int.tryParse(staffId) ?? staffId,
    };
    final response = await http.post(
      Uri.parse('$baseUrl/api/walkin/checkin'),
      headers: _authHeaders(token),
      body: jsonEncode(reqBody),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Walk-in check-in failed');
    }
    if (body.isEmpty) {
      throw Exception('Walk-in check-in returned empty response');
    }
    return WalkInEntry.fromJson(Map<String, dynamic>.from(body));
  }

  Future<void> assignWalkInStaff({
    required String token,
    required String walkInId,
    required String staffId,
  }) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/api/walkin/$walkInId/assign'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'staffId': int.tryParse(staffId) ?? staffId,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Staff assignment failed');
    }
  }

  Future<void> updateWalkInStatus({
    required String token,
    required String walkInId,
    required String status,
  }) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/api/walkin/$walkInId/status'),
      headers: _authHeaders(token),
      body: jsonEncode({'status': status}),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Walk-in status update failed');
    }
  }

  Future<WalkInEntry> updateWalkIn({
    required String token,
    required String walkInId,
    required String customerName,
    required String serviceId,
    required List<String> serviceIds,
    String? phone,
    String? note,
  }) async {
    final primaryNum = int.tryParse(serviceId.trim()) ?? 0;
    var ids = serviceIds
        .map((id) => int.tryParse(id.trim()) ?? 0)
        .where((n) => n > 0)
        .toList();
    if (ids.isEmpty && primaryNum > 0) {
      ids = [primaryNum];
    }
    final reqBody = <String, dynamic>{
      'customerName': customerName.trim(),
      'phone': phone?.trim() ?? '',
      'serviceId': primaryNum > 0 ? primaryNum : int.tryParse(serviceId) ?? serviceId,
      if (ids.isNotEmpty) 'serviceIds': ids,
      if (ids.isNotEmpty) 'service_ids': ids,
      'note': note?.trim() ?? '',
    };
    final response = await http.patch(
      Uri.parse('$baseUrl/api/walkin/$walkInId'),
      headers: _authHeaders(token),
      body: jsonEncode(reqBody),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Walk-in update failed');
    }
    if (body.isEmpty) {
      throw Exception('Walk-in update returned empty response');
    }
    return WalkInEntry.fromJson(Map<String, dynamic>.from(body));
  }

  // ── HelaPay ────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> generateQR({
    required String token,
    required String reference,
    required double amount,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/helapay/qr'),
      headers: _authHeaders(token),
      body: jsonEncode({'reference': reference, 'amount': amount}),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'QR generation failed');
    }
    return body;
  }

  Future<Map<String, dynamic>> checkQRStatus({
    required String token,
    required String reference,
    required String qrReference,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/helapay/status'),
      headers: _authHeaders(token),
      body: jsonEncode({'reference': reference, 'qr_reference': qrReference}),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Status check failed');
    }
    return body;
  }

  /// GET /api/commission-payouts
  Future<Map<String, dynamic>> fetchCommissionPayouts({
    required String token,
    String? staffId,
    String? month,
    String? branchId,
  }) async {
    final qp = <String, String>{};
    if (staffId  != null && staffId.isNotEmpty)  qp['staffId']  = staffId;
    if (month    != null && month.isNotEmpty)    qp['month']    = month;
    if (branchId != null && branchId.isNotEmpty) qp['branchId'] = branchId;
    final uri = Uri.parse('$baseUrl/api/commission-payouts').replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) throw Exception(body['message'] ?? 'Payouts load failed');
    return body;
  }

  /// POST /api/commission-payouts
  Future<Map<String, dynamic>> createCommissionPayout({
    required String token,
    required String staffId,
    required String branchId,
    required double amount,
    required String date,
    required String month,
    String? notes,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/commission-payouts'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'staff_id':  staffId,
        'branch_id': branchId,
        'amount':    amount,
        'date':      date,
        'month':     month,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) throw Exception(body['message'] ?? 'Create payout failed');
    return body;
  }

  /// DELETE /api/commission-payouts/:id
  Future<void> deleteCommissionPayout({required String token, required String payoutId}) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/api/commission-payouts/$payoutId'),
      headers: _authHeaders(token),
    );
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Delete payout failed');
    }
  }

  /// GET /api/advances — list staff advances, filter by staffId / month / branchId.
  Future<Map<String, dynamic>> fetchAdvances({
    required String token,
    String? staffId,
    String? month,
    String? branchId,
    String? status,
  }) async {
    final qp = <String, String>{};
    if (staffId  != null && staffId.isNotEmpty)  qp['staffId']  = staffId;
    if (month    != null && month.isNotEmpty)    qp['month']    = month;
    if (branchId != null && branchId.isNotEmpty) qp['branchId'] = branchId;
    if (status   != null && status.isNotEmpty)   qp['status']   = status;
    final uri = Uri.parse('$baseUrl/api/advances').replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) throw Exception(body['message'] ?? 'Advances load failed');
    return body;
  }

  /// POST /api/advances — record a new advance (admin/manager/superadmin).
  Future<Map<String, dynamic>> createAdvance({
    required String token,
    required String staffId,
    required String branchId,
    required double amount,
    required String date,
    required String month,
    String? reason,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/advances'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'staff_id':  staffId,
        'branch_id': branchId,
        'amount':    amount,
        'date':      date,
        'month':     month,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) throw Exception(body['message'] ?? 'Create advance failed');
    return body;
  }

  /// PATCH /api/advances/:id/deduct — mark advance as deducted.
  Future<void> markAdvanceDeducted({required String token, required String advanceId}) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/api/advances/$advanceId/deduct'),
      headers: _authHeaders(token),
    );
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Mark deducted failed');
    }
  }

  /// DELETE /api/advances/:id
  Future<void> deleteAdvance({required String token, required String advanceId}) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/api/advances/$advanceId'),
      headers: _authHeaders(token),
    );
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Delete advance failed');
    }
  }

  /// GET /api/customers/:id — full customer profile with loyalty_points + last 10 appointments.
  Future<Map<String, dynamic>> fetchCustomerDetail({
    required String token,
    required String customerId,
  }) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/customers/$customerId'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Customer load failed');
    }
    return body;
  }

  /// GET /api/users — list all users (superadmin/admin only).
  Future<List<Map<String, dynamic>>> fetchUsers({required String token}) async {
    final uri = Uri.parse('$baseUrl/api/users').replace(queryParameters: {'limit': '100'});
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Users load failed');
    }
    final list = body['data'] as List? ?? (body is List ? body as List : const []);
    return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// PUT /api/users/:id — update role or is_active (superadmin only for role changes).
  Future<Map<String, dynamic>> updateUser({
    required String token,
    required String userId,
    String? role,
    bool? isActive,
  }) async {
    final payload = <String, dynamic>{};
    if (role != null) payload['role'] = role;
    if (isActive != null) payload['is_active'] = isActive;
    final response = await http.put(
      Uri.parse('$baseUrl/api/users/$userId'),
      headers: _authHeaders(token),
      body: jsonEncode(payload),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'User update failed');
    }
    return body;
  }

  /// GET /api/expenses — list expenses, optionally filtered by branchId and month (YYYY-MM).
  Future<Map<String, dynamic>> fetchExpenses({
    required String token,
    String? branchId,
    String? month,
  }) async {
    final qp = <String, String>{'limit': '200'};
    if (branchId != null && branchId.isNotEmpty) qp['branchId'] = branchId;
    if (month != null && month.isNotEmpty) qp['month'] = month;
    final uri = Uri.parse('$baseUrl/api/expenses').replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Expenses load failed');
    }
    return body;
  }

  /// POST /api/expenses — create a new expense (superadmin only).
  Future<Map<String, dynamic>> createExpense({
    required String token,
    required String branchId,
    required String category,
    required String title,
    required double amount,
    required String date,
    String? paidTo,
    String? paymentMethod,
    String? receiptNumber,
    String? notes,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/expenses'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'branch_id':      branchId,
        'category':       category,
        'title':          title,
        'amount':         amount,
        'date':           date,
        if (paidTo != null && paidTo.isNotEmpty) 'paid_to': paidTo,
        if (paymentMethod != null) 'payment_method': paymentMethod,
        if (receiptNumber != null && receiptNumber.isNotEmpty) 'receipt_number': receiptNumber,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Expense create failed');
    }
    return body;
  }

  Map<String, String> _baseHeaders() => {
    'Content-Type': 'application/json',
    if (slug != null && slug!.isNotEmpty) 'X-Tenant-Slug': slug!,
  };

  Map<String, String> _authHeaders(String token) => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $token',
    if (slug != null && slug!.isNotEmpty) 'X-Tenant-Slug': slug!,
  };

  Map<String, dynamic> _decode(String raw) {
    if (raw.trim().isEmpty) return {};
    final parsed = jsonDecode(raw);
    if (parsed is Map<String, dynamic>) return parsed;
    return {};
  }

  List<dynamic> _decodeList(String raw) {
    if (raw.trim().isEmpty) return const [];
    final parsed = jsonDecode(raw);
    if (parsed is List) return parsed;
    if (parsed is Map<String, dynamic> && parsed['data'] is List) {
      return parsed['data'] as List;
    }
    return const [];
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
