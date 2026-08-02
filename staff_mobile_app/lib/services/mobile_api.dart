import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/appointment.dart';
import '../models/commission_record.dart';
import '../models/staff_commission_summary.dart';
import '../models/customer.dart';
import '../models/payment_record.dart';
import '../models/recurring_template_option.dart';
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
    this.staffId,
    this.staffName,
  });

  final double total;
  final double totalAdvances;
  final double netCommission;
  final double totalPaid;
  final double balanceDue;
  final List<CommissionRecord> records;
  final String? staffId;
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
    // Step 1: Keycloak credential login
    final kcRes = await http.post(
      Uri.parse('$baseUrl/api/auth/kc-login'),
      headers: _baseHeaders(),
      body: jsonEncode({
        'username': username.trim(),
        'password': password.trim(),
      }),
    );
    final kcBody = _decode(kcRes.body);
    if (kcRes.statusCode >= 400) {
      throw Exception(kcBody['message'] ?? 'Login failed');
    }
    final accessToken = '${kcBody['access_token'] ?? ''}'.trim();
    if (accessToken.isEmpty) throw Exception('No access token returned');

    // Step 2: Fetch user profile
    final meRes = await http.get(
      Uri.parse('$baseUrl/api/auth/me'),
      headers: _authHeaders(accessToken),
    );
    final meBody = _decode(meRes.body);
    if (meRes.statusCode >= 400) {
      throw Exception(meBody['message'] ?? 'Failed to load user');
    }
    return {
      'token': accessToken,
      'refresh_token': kcBody['refresh_token'] ?? '',
      'expires_in': kcBody['expires_in'] ?? 300,
      'user': meBody['user'] ?? {},
    };
  }

  Future<String?> kcRefresh({required String refreshToken}) async {
    final res = await http.post(
      Uri.parse('$baseUrl/api/auth/kc-refresh'),
      headers: _baseHeaders(),
      body: jsonEncode({'refresh_token': refreshToken}),
    );
    if (res.statusCode >= 400) return null;
    final body = _decode(res.body);
    return '${body['access_token'] ?? ''}'.trim().isEmpty
        ? null
        : '${body['access_token']}';
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
          if (deviceInfo != null && deviceInfo.isNotEmpty)
            'device_info': deviceInfo,
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
    final uri = Uri.parse(
      '$baseUrl/api/discounts/payment',
    ).replace(queryParameters: {'branchId': branchId});
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
    final all = <Customer>[];
    var page = 1;
    var total = 1 << 30;

    while (all.length < total) {
      final branchQ = branchId != null && branchId.isNotEmpty
          ? '&branchId=$branchId'
          : '';
      final uri = Uri.parse(
        '$baseUrl/api/customers?limit=$limit&page=$page$branchQ',
      );
      final response = await http.get(uri, headers: _authHeaders(token));
      final body = _decode(response.body);
      if (response.statusCode >= 400) {
        throw Exception(body['message'] ?? 'Customers load failed');
      }
      final list = (body['data'] as List? ?? const []);
      final rows = list
          .whereType<Map>()
          .map((e) => Customer.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      final rawTotal = body['total'];
      if (rawTotal is num) {
        total = rawTotal.toInt();
      } else {
        total = all.length + rows.length;
      }
      all.addAll(rows);
      if (rows.isEmpty || rows.length < limit) break;
      page += 1;
    }
    return all;
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
    return list
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
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
    return list
        .whereType<Map>()
        .map((e) => SalonService.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<Map<String, dynamic>>> fetchBranches({
    required String token,
  }) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/branches?limit=200'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Branches load failed');
    }
    final list = (body['data'] as List? ?? body as List? ?? const []);
    return list
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
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
    return list
        .whereType<Map>()
        .map((e) => StaffMember.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<StaffMember> createSalonStaff({
    required String token,
    required Map<String, dynamic> payload,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/staff'),
      headers: _authHeaders(token),
      body: jsonEncode(payload),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Staff create failed');
    }
    return StaffMember.fromJson(Map<String, dynamic>.from(body));
  }

  Future<StaffMember> updateSalonStaff({
    required String token,
    required String staffId,
    required Map<String, dynamic> payload,
  }) async {
    final response = await http.put(
      Uri.parse('$baseUrl/api/staff/$staffId'),
      headers: _authHeaders(token),
      body: jsonEncode(payload),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Staff update failed');
    }
    return StaffMember.fromJson(Map<String, dynamic>.from(body));
  }

  Future<void> createService({
    required String token,
    required String name,
    required String category,
    required String durationMinutes,
    required String price,
    required String description,
    String? commissionType,
    String? commissionValue,
  }) async {
    final payload = <String, dynamic>{
      'name': name.trim(),
      'category': category.trim().isEmpty ? 'Other' : category.trim(),
      'duration_minutes': int.tryParse(durationMinutes.trim()) ?? 30,
      'price': double.tryParse(price.trim()) ?? 0,
      'description': description.trim().isEmpty ? null : description.trim(),
    };
    if (commissionType != null) {
      payload['commission_type'] = commissionType;
      final raw = commissionValue?.trim() ?? '';
      payload['commission_value'] = raw.isEmpty ? null : raw;
    }
    final response = await http.post(
      Uri.parse('$baseUrl/api/services'),
      headers: _authHeaders(token),
      body: jsonEncode(payload),
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
    final uri = Uri.parse(
      '$baseUrl/api/appointments',
    ).replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Appointments load failed');
    }
    final list = (body['data'] as List? ?? const []);
    final items = list
        .whereType<Map>()
        .map((e) => Appointment.fromJson(Map<String, dynamic>.from(e)))
        .toList();
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
    String primaryServiceId = '',
    List<String>? serviceIds,
    String date = '',
    String time = '',
    String? customerId,
    String? phone,
    String? staffId,
    String? amount,
    String? notes,
    bool isRecurring = false,
    String? recurringNextDate,
    List<String>? recurringMessageTemplateIds,
    /// Multi-booking: one appointment per item (own staff/date/time).
    /// Each map: `service_id`, optional `staff_id`, `date`, `time`.
    List<Map<String, dynamic>>? items,
    double? advanceAmount,
    String? advanceMethod,
  }) async {
    final useItems = items != null && items.isNotEmpty;
    final bodyMap = <String, dynamic>{
      'branch_id': int.tryParse(branchId) ?? branchId,
      'customer_name': customerName.trim(),
      if (customerId != null && customerId.isNotEmpty)
        'customer_id': int.tryParse(customerId) ?? customerId,
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      'is_recurring': isRecurring,
      if (isRecurring) 'recurrence_frequency': 'weekly',
      if (isRecurring &&
          recurringNextDate != null &&
          recurringNextDate.trim().isNotEmpty)
        'recurring_next_date': recurringNextDate.trim(),
      'recurring_message_template_ids': isRecurring
          ? (recurringMessageTemplateIds ?? const <String>[])
                .map((id) => int.tryParse(id) ?? id)
                .toList()
          : null,
      if (advanceAmount != null && advanceAmount > 0) ...{
        'advance_amount': advanceAmount,
        'advance_method': (advanceMethod != null && advanceMethod.trim().isNotEmpty)
            ? advanceMethod.trim()
            : 'Cash',
      },
    };

    if (useItems) {
      bodyMap['items'] = items.map((raw) {
        final sid = raw['service_id'];
        final staff = raw['staff_id'];
        return <String, dynamic>{
          'service_id': sid is int ? sid : (int.tryParse('$sid') ?? sid),
          'date': '${raw['date'] ?? ''}'.trim(),
          'time': '${raw['time'] ?? ''}'.trim(),
          if (staff != null && '$staff'.trim().isNotEmpty)
            'staff_id': staff is int ? staff : (int.tryParse('$staff') ?? staff),
        };
      }).toList();
      if (amount != null && amount.trim().isNotEmpty) {
        bodyMap['amount'] = double.tryParse(amount.trim()) ?? amount;
      }
    } else {
      bodyMap['service_id'] =
          int.tryParse(primaryServiceId) ?? primaryServiceId;
      if (serviceIds != null && serviceIds.isNotEmpty) {
        bodyMap['service_ids'] =
            serviceIds.map((id) => int.tryParse(id) ?? id).toList();
      }
      bodyMap['date'] = date.trim();
      bodyMap['time'] = time.trim();
      if (staffId != null && staffId.isNotEmpty) {
        bodyMap['staff_id'] = int.tryParse(staffId) ?? staffId;
      }
      if (amount != null && amount.trim().isNotEmpty) {
        bodyMap['amount'] = double.tryParse(amount.trim()) ?? amount;
      }
    }

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
    bool? isRecurring,
    String? recurringNextDate,
    List<String>? recurringMessageTemplateIds,
  }) async {
    final bodyMap = <String, dynamic>{
      'customer_name': customerName.trim(),
      'service_id': int.tryParse(primaryServiceId) ?? primaryServiceId,
      if (serviceIds != null && serviceIds.isNotEmpty)
        'service_ids': serviceIds.map((id) => int.tryParse(id) ?? id).toList(),
      'date': date.trim(),
      'time': time.trim(),
      if (customerId != null && customerId.isNotEmpty)
        'customer_id': int.tryParse(customerId) ?? customerId,
      if (phone != null) 'phone': phone.trim(),
      if (staffId != null && staffId.isNotEmpty)
        'staff_id': int.tryParse(staffId) ?? staffId,
      if (amount != null && amount.trim().isNotEmpty)
        'amount': double.tryParse(amount.trim()) ?? amount,
      'notes': notes ?? '',
      if (status != null && status.isNotEmpty) 'status': status,
      if (isRecurring != null) 'is_recurring': isRecurring,
      if (isRecurring == true) 'recurrence_frequency': 'weekly',
      if (isRecurring == true &&
          recurringNextDate != null &&
          recurringNextDate.trim().isNotEmpty)
        'recurring_next_date': recurringNextDate.trim(),
      if (isRecurring != null)
        'recurring_message_template_ids': isRecurring
            ? (recurringMessageTemplateIds ?? const <String>[])
                  .map((id) => int.tryParse(id) ?? id)
                  .toList()
            : null,
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
    List<Map<String, dynamic>>? helpers,
    String? customerId,
    String subtotal = '',
    String loyaltyDiscount = '0',
    String promoDiscount = '0',
    String? discountId,
    String? phone,
    bool? isRecurring,
    String? recurringNextDate,
    List<String>? recurringMessageTemplateIds,
    /// When settling an advance, pass combined splits (advance + remaining).
    List<Map<String, dynamic>>? splits,
    bool replaceAppointmentPayments = false,
  }) async {
    final parsedAmount = double.tryParse(amount.trim()) ?? 0;
    final sub = double.tryParse(subtotal.trim()) ?? 0;
    final resolvedSplits = (splits != null && splits.isNotEmpty)
        ? splits
            .map((s) => <String, dynamic>{
                  'method': '${s['method'] ?? method}',
                  'amount': s['amount'] is num
                      ? s['amount']
                      : (double.tryParse('${s['amount']}') ?? 0),
                  if (s['customer_package_id'] != null)
                    'customer_package_id': s['customer_package_id'],
                })
            .where((s) => (s['amount'] as num) > 0 || '${s['method']}' == 'Package')
            .toList()
        : [
            {'method': method, 'amount': parsedAmount},
          ];
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
      'splits': resolvedSplits,
      if (replaceAppointmentPayments) 'replace_appointment_payments': true,
      if (staffId != null && staffId.isNotEmpty)
        'staff_id': int.tryParse(staffId) ?? staffId,
      if (helpers != null && helpers.isNotEmpty) 'helpers': helpers,
      if (customerId != null && customerId.isNotEmpty)
        'customer_id': int.tryParse(customerId) ?? customerId,
      if (isRecurring != null) 'is_recurring': isRecurring,
      if (isRecurring == true &&
          recurringNextDate != null &&
          recurringNextDate.trim().isNotEmpty)
        'recurring_next_date': recurringNextDate.trim(),
      if (isRecurring == true)
        'recurring_message_template_ids':
            (recurringMessageTemplateIds ?? const <String>[])
                .map((id) => int.tryParse(id) ?? id)
                .toList(),
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
    String? customerId,
    int limit = 200,
  }) async {
    final qp = <String, String>{
      'limit': '$limit',
      if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      if (month != null && month.isNotEmpty) 'month': month,
      if (customerId != null && customerId.isNotEmpty) 'customerId': customerId,
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
    List<Map<String, dynamic>>? helpers,
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
    bool isRecurring = false,
    String? recurringNextDate,
    String? appointmentTime,
    List<String>? recurringMessageTemplateIds,
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
          'service_ids': serviceIds
              .map((id) => int.tryParse(id) ?? id)
              .toList(),
        if (staffId != null && staffId.isNotEmpty)
          'staff_id': int.tryParse(staffId) ?? staffId,
        if (helpers != null && helpers.isNotEmpty) 'helpers': helpers,
        if (customerId != null && customerId.isNotEmpty)
          'customer_id': int.tryParse(customerId) ?? customerId,
        if (customerName != null && customerName.trim().isNotEmpty)
          'customer_name': customerName.trim(),
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        if (walkinToken != null && walkinToken.trim().isNotEmpty)
          'walkin_token': walkinToken.trim(),
        'subtotal': subtotal,
        if (discountId != null && discountId.trim().isNotEmpty)
          'discount_id': int.tryParse(discountId.trim()) ?? discountId.trim(),
        'loyalty_discount': double.tryParse(loyaltyDiscount.trim()) ?? 0,
        'promo_discount': double.tryParse(promoDiscount.trim()) ?? 0,
        'splits': [
          {'method': method, 'amount': paid},
        ],
        if (isRecurring) 'is_recurring': true,
        if (isRecurring &&
            recurringNextDate != null &&
            recurringNextDate.trim().isNotEmpty)
          'recurring_next_date': recurringNextDate.trim(),
        if (isRecurring &&
            appointmentTime != null &&
            appointmentTime.trim().isNotEmpty)
          'appointment_time': appointmentTime.trim(),
        if (isRecurring)
          'recurring_message_template_ids':
              (recurringMessageTemplateIds ?? const <String>[])
                  .map((id) => int.tryParse(id) ?? id)
                  .toList(),
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
          'service_ids': serviceIds
              .map((id) => int.tryParse(id) ?? id)
              .toList(),
        if (staffId != null && staffId.isNotEmpty)
          'staff_id': int.tryParse(staffId) ?? staffId,
        if (customerId != null && customerId.isNotEmpty)
          'customer_id': int.tryParse(customerId) ?? customerId,
        'subtotal': subtotal,
        if (discountId != null && discountId.trim().isNotEmpty)
          'discount_id': int.tryParse(discountId.trim()) ?? discountId.trim(),
        'loyalty_discount': double.tryParse(loyaltyDiscount.trim()) ?? 0,
        'splits': [
          {'method': method, 'amount': paid},
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
    final uri = Uri.parse(
      '$baseUrl/api/staff/me/commission',
    ).replace(queryParameters: qp.isEmpty ? null : qp);
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
        records.add(CommissionRecord.fromJson(Map<String, dynamic>.from(item)));
      } catch (_) {
        // Skip malformed rows instead of failing the whole response.
      }
    }
    final advRaw = body['totalAdvances'];
    final netRaw = body['netCommission'];
    final paidRaw = body['totalPaid'];
    final balRaw = body['balanceDue'];
    final totalComm = totalRaw is num
        ? totalRaw.toDouble()
        : double.tryParse('$totalRaw') ?? 0;
    final totalAdv = advRaw is num
        ? advRaw.toDouble()
        : double.tryParse('$advRaw') ?? 0;
    final netComm = netRaw is num
        ? netRaw.toDouble()
        : double.tryParse('$netRaw') ??
              (totalComm - totalAdv).clamp(0, double.infinity);
    final tPaid = paidRaw is num
        ? paidRaw.toDouble()
        : double.tryParse('$paidRaw') ?? 0;
    final staffIdRaw = '${staffMap['id'] ?? ''}'.trim();
    final staffNameRaw = '${staffMap['name'] ?? ''}'.trim();
    return MyCommissionResult(
      total: totalComm,
      totalAdvances: totalAdv,
      netCommission: netComm,
      totalPaid: tPaid,
      balanceDue: balRaw is num
          ? balRaw.toDouble()
          : double.tryParse('$balRaw') ??
                (netComm - tPaid).clamp(0, double.infinity),
      records: records,
      staffId: staffIdRaw.isEmpty ? null : staffIdRaw,
      staffName: staffNameRaw.isEmpty ? null : staffNameRaw,
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
    final uri = Uri.parse(
      '$baseUrl/api/staff/commission',
    ).replace(queryParameters: qp);
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
        .map(
          (e) => StaffCommissionSummary.fromJson(Map<String, dynamic>.from(e)),
        )
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
    final uri = Uri.parse(
      '$baseUrl/api/staff/$staffId/commission',
    ).replace(queryParameters: qp.isEmpty ? null : qp);
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
        records.add(CommissionRecord.fromJson(Map<String, dynamic>.from(item)));
      } catch (_) {}
    }
    final advRaw2 = body['totalAdvances'];
    final netRaw2 = body['netCommission'];
    final paidRaw2 = body['totalPaid'];
    final balRaw2 = body['balanceDue'];
    final totalComm2 = totalRaw is num
        ? totalRaw.toDouble()
        : double.tryParse('$totalRaw') ?? 0;
    final totalAdv2 = advRaw2 is num
        ? advRaw2.toDouble()
        : double.tryParse('$advRaw2') ?? 0;
    final netComm2 = netRaw2 is num
        ? netRaw2.toDouble()
        : double.tryParse('$netRaw2') ??
              (totalComm2 - totalAdv2).clamp(0, double.infinity);
    final tPaid2 = paidRaw2 is num
        ? paidRaw2.toDouble()
        : double.tryParse('$paidRaw2') ?? 0;
    final staffIdRaw2 = '${staffMap['id'] ?? staffId}'.trim();
    final staffNameRaw2 = '${staffMap['name'] ?? ''}'.trim();
    return MyCommissionResult(
      total: totalComm2,
      totalAdvances: totalAdv2,
      netCommission: netComm2,
      totalPaid: tPaid2,
      balanceDue: balRaw2 is num
          ? balRaw2.toDouble()
          : double.tryParse('$balRaw2') ??
                (netComm2 - tPaid2).clamp(0, double.infinity),
      records: records,
      staffId: staffIdRaw2.isEmpty ? null : staffIdRaw2,
      staffName: staffNameRaw2.isEmpty ? null : staffNameRaw2,
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
      'serviceId': primaryNum > 0
          ? primaryNum
          : int.tryParse(serviceId) ?? serviceId,
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
      body: jsonEncode({'staffId': int.tryParse(staffId) ?? staffId}),
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
      'serviceId': primaryNum > 0
          ? primaryNum
          : int.tryParse(serviceId) ?? serviceId,
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
    if (staffId != null && staffId.isNotEmpty) qp['staffId'] = staffId;
    if (month != null && month.isNotEmpty) qp['month'] = month;
    if (branchId != null && branchId.isNotEmpty) qp['branchId'] = branchId;
    final uri = Uri.parse(
      '$baseUrl/api/commission-payouts',
    ).replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400)
      throw Exception(body['message'] ?? 'Payouts load failed');
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
        'staff_id': staffId,
        'branch_id': branchId,
        'amount': amount,
        'date': date,
        'month': month,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400)
      throw Exception(body['message'] ?? 'Create payout failed');
    return body;
  }

  /// DELETE /api/commission-payouts/:id
  Future<void> deleteCommissionPayout({
    required String token,
    required String payoutId,
  }) async {
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
    if (staffId != null && staffId.isNotEmpty) qp['staffId'] = staffId;
    if (month != null && month.isNotEmpty) qp['month'] = month;
    if (branchId != null && branchId.isNotEmpty) qp['branchId'] = branchId;
    if (status != null && status.isNotEmpty) qp['status'] = status;
    final uri = Uri.parse('$baseUrl/api/advances').replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400)
      throw Exception(body['message'] ?? 'Advances load failed');
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
        'staff_id': staffId,
        'branch_id': branchId,
        'amount': amount,
        'date': date,
        'month': month,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400)
      throw Exception(body['message'] ?? 'Create advance failed');
    return body;
  }

  /// PATCH /api/advances/:id/deduct — mark advance as deducted.
  Future<void> markAdvanceDeducted({
    required String token,
    required String advanceId,
  }) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/api/advances/$advanceId/deduct'),
      headers: _authHeaders(token),
    );
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Mark deducted failed');
    }
  }

  /// PATCH /api/advances/:id/revert — revert advance back to pending.
  Future<void> revertAdvanceToPending({
    required String token,
    required String advanceId,
  }) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/api/advances/$advanceId/revert'),
      headers: _authHeaders(token),
    );
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Revert failed');
    }
  }

  /// DELETE /api/advances/:id
  Future<void> deleteAdvance({
    required String token,
    required String advanceId,
  }) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/api/advances/$advanceId'),
      headers: _authHeaders(token),
    );
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Delete advance failed');
    }
  }

  /// GET /api/notifications/templates/options?event_type=recurring_reminder
  Future<List<RecurringTemplateOption>> fetchRecurringTemplateOptions({
    required String token,
  }) async {
    final uri = Uri.parse(
      '$baseUrl/api/notifications/templates/options',
    ).replace(queryParameters: {'event_type': 'recurring_reminder'});
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Template options load failed');
    }
    final list = body['options'] as List? ?? const [];
    return list
        .whereType<Map>()
        .map(
          (row) =>
              RecurringTemplateOption.fromJson(Map<String, dynamic>.from(row)),
        )
        .toList();
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
    final uri = Uri.parse(
      '$baseUrl/api/users',
    ).replace(queryParameters: {'limit': '100'});
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Users load failed');
    }
    final list =
        body['data'] as List? ?? (body is List ? body as List : const []);
    return list
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
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

  /// GET /api/users/:id/mobile-features — effective feature map for a user (superadmin).
  Future<Map<String, dynamic>> fetchUserMobileFeatures({
    required String token,
    required String userId,
  }) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/users/$userId/mobile-features'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Failed to load mobile features');
    }
    return body;
  }

  /// GET /api/users/mobile-features/role-defaults — tenant role default access (superadmin).
  Future<Map<String, dynamic>> fetchMobileRoleDefaults({
    required String token,
  }) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/users/mobile-features/role-defaults'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Failed to load role defaults');
    }
    return body;
  }

  /// PUT /api/users/mobile-features/role-defaults — save tenant role defaults (superadmin).
  Future<Map<String, dynamic>> updateMobileRoleDefaults({
    required String token,
    required Map<String, Map<String, bool>> defaults,
  }) async {
    final response = await http.put(
      Uri.parse('$baseUrl/api/users/mobile-features/role-defaults'),
      headers: _authHeaders(token),
      body: jsonEncode({'defaults': defaults}),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Failed to update role defaults');
    }
    return body;
  }

  /// PUT /api/users/:id/mobile-features — save per-user feature toggles (superadmin).
  Future<Map<String, dynamic>> updateUserMobileFeatures({
    required String token,
    required String userId,
    required Map<String, bool> features,
  }) async {
    final response = await http.put(
      Uri.parse('$baseUrl/api/users/$userId/mobile-features'),
      headers: _authHeaders(token),
      body: jsonEncode({'features': features}),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Failed to update mobile features');
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
        'branch_id': branchId,
        'category': category,
        'title': title,
        'amount': amount,
        'date': date,
        if (paidTo != null && paidTo.isNotEmpty) 'paid_to': paidTo,
        if (paymentMethod != null && paymentMethod.isNotEmpty)
          'payment_method': paymentMethod,
        if (receiptNumber != null && receiptNumber.isNotEmpty)
          'receipt_number': receiptNumber,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Expense create failed');
    }
    return body;
  }

  /// GET /api/reminders — branch reminders from the web Reminders page.
  Future<List<Map<String, dynamic>>> fetchReminders({
    required String token,
    String? branchId,
    bool? done,
  }) async {
    final qp = <String, String>{};
    if (branchId != null && branchId.isNotEmpty) qp['branchId'] = branchId;
    if (done != null) qp['done'] = done.toString();
    final uri = Uri.parse(
      '$baseUrl/api/reminders',
    ).replace(queryParameters: qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Reminders load failed');
    }
    return _decodeList(
      response.body,
    ).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// POST /api/reminders — creates reminder and pushes to branch staff devices.
  Future<Map<String, dynamic>> createReminder({
    required String token,
    required String title,
    String? branchId,
    String priority = 'medium',
    String type = 'general',
    String? dueDate,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/reminders'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'title': title,
        if (branchId != null && branchId.isNotEmpty) 'branch_id': branchId,
        'priority': priority,
        'type': type,
        if (dueDate != null && dueDate.isNotEmpty) 'due_date': dueDate,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Reminder create failed');
    }
    return body;
  }

  /// PATCH /api/reminders/:id/toggle
  Future<Map<String, dynamic>> toggleReminder({
    required String token,
    required int reminderId,
  }) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/api/reminders/$reminderId/toggle'),
      headers: _authHeaders(token),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Reminder update failed');
    }
    return body;
  }

  /// DELETE /api/reminders/:id
  Future<void> deleteReminder({
    required String token,
    required int reminderId,
  }) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/api/reminders/$reminderId'),
      headers: _authHeaders(token),
    );
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Reminder delete failed');
    }
  }

  /// GET /api/attendance
  Future<List<Map<String, dynamic>>> fetchAttendance({
    required String token,
    String? date,
    String? month,
    String? staffId,
    String? branchId,
  }) async {
    final qp = <String, String>{};
    if (date != null && date.isNotEmpty) qp['date'] = date;
    if (month != null && month.isNotEmpty) qp['month'] = month;
    if (staffId != null && staffId.isNotEmpty) qp['staffId'] = staffId;
    if (branchId != null && branchId.isNotEmpty) qp['branchId'] = branchId;
    final uri = Uri.parse(
      '$baseUrl/api/attendance',
    ).replace(queryParameters: qp.isEmpty ? null : qp);
    final response = await http.get(uri, headers: _authHeaders(token));
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Attendance load failed');
    }
    return _decodeList(
      response.body,
    ).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// POST /api/attendance — upsert by staff_id + date
  Future<Map<String, dynamic>> upsertAttendance({
    required String token,
    required String staffId,
    required String date,
    String? status,
    String? checkIn,
    String? checkOut,
    String? note,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/attendance'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'staff_id': int.tryParse(staffId) ?? staffId,
        'date': date,
        if (status != null && status.isNotEmpty) 'status': status,
        if (checkIn != null && checkIn.isNotEmpty) 'check_in': checkIn,
        if (checkOut != null && checkOut.isNotEmpty) 'check_out': checkOut,
        if (note != null) 'note': note,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Attendance save failed');
    }
    return body;
  }

  /// PUT /api/attendance/:id
  Future<Map<String, dynamic>> updateAttendance({
    required String token,
    required String id,
    String? status,
    String? checkIn,
    String? checkOut,
    String? note,
  }) async {
    final response = await http.put(
      Uri.parse('$baseUrl/api/attendance/$id'),
      headers: _authHeaders(token),
      body: jsonEncode({
        if (status != null && status.isNotEmpty) 'status': status,
        if (checkIn != null && checkIn.isNotEmpty) 'check_in': checkIn,
        if (checkOut != null && checkOut.isNotEmpty) 'check_out': checkOut,
        if (note != null) 'note': note,
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Attendance update failed');
    }
    return body;
  }

  Future<List<Map<String, dynamic>>> fetchInventoryProducts({
    required String token,
    String? branchId,
    bool consumableOnly = true,
    String? q,
    String? productType,
    bool lowStockOnly = false,
  }) async {
    final uri = Uri.parse('$baseUrl/api/salon-inventory/products').replace(
      queryParameters: {
        'limit': '200',
        'status': 'active',
        if (consumableOnly && (productType == null || productType.isEmpty))
          'product_type': 'consumable',
        if (!consumableOnly && productType != null && productType.isNotEmpty)
          'product_type': productType,
        if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
        if (lowStockOnly) 'lowStock': 'true',
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      },
    );
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Inventory products load failed');
    }
    final list = body['data'] as List? ?? const [];
    return list
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
  }

  Future<Map<String, dynamic>> createInventoryProduct({
    required String token,
    required String branchId,
    required String name,
    required String productType,
    required String unit,
    required double openingStock,
    double minStock = 0,
    double maxStock = 0,
    double costPrice = 0,
    String? sku,
    String? brand,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/salon-inventory/products'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'branch_id': int.tryParse(branchId) ?? branchId,
        'name': name.trim(),
        'product_type': productType,
        'unit': unit,
        'opening_stock': openingStock,
        'min_stock': minStock,
        'max_stock': maxStock,
        'cost_price': costPrice,
        if (sku != null && sku.trim().isNotEmpty) 'sku': sku.trim(),
        if (brand != null && brand.trim().isNotEmpty) 'brand': brand.trim(),
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Product create failed');
    }
    return body;
  }

  Future<Map<String, dynamic>> updateInventoryProduct({
    required String token,
    required String productId,
    required String name,
    required String productType,
    required String unit,
    double minStock = 0,
    double maxStock = 0,
    double costPrice = 0,
    String? sku,
    String? brand,
    String status = 'active',
  }) async {
    final response = await http.put(
      Uri.parse('$baseUrl/api/salon-inventory/products/$productId'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'name': name.trim(),
        'product_type': productType,
        'unit': unit,
        'min_stock': minStock,
        'max_stock': maxStock,
        'cost_price': costPrice,
        'status': status,
        'sku': (sku == null || sku.trim().isEmpty) ? null : sku.trim(),
        'brand': (brand == null || brand.trim().isEmpty) ? null : brand.trim(),
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Product update failed');
    }
    return Map<String, dynamic>.from(body as Map);
  }

  Future<void> deactivateInventoryProduct({
    required String token,
    required String productId,
  }) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/api/salon-inventory/products/$productId'),
      headers: _authHeaders(token),
    );
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Product deactivate failed');
    }
  }

  Future<List<Map<String, dynamic>>> fetchInventoryGoodsReceipts({
    required String token,
    String? branchId,
  }) async {
    final uri = Uri.parse('$baseUrl/api/salon-inventory/goods-receipts')
        .replace(
          queryParameters: {
            if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
          },
        );
    final response = await http.get(uri, headers: _authHeaders(token));
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Goods receipts load failed');
    }
    return _decodeList(
      response.body,
    ).whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
  }

  Future<Map<String, dynamic>> createInventoryGoodsReceipt({
    required String token,
    required String branchId,
    required String receivedDate,
    required List<Map<String, dynamic>> items,
    String? notes,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/salon-inventory/goods-receipts'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'branch_id': int.tryParse(branchId) ?? branchId,
        'received_date': receivedDate,
        'confirm': true,
        'items': items,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Goods receipt failed');
    }
    return body;
  }

  Future<List<Map<String, dynamic>>> fetchInventoryAdjustments({
    required String token,
    String? branchId,
  }) async {
    final uri = Uri.parse('$baseUrl/api/salon-inventory/adjustments').replace(
      queryParameters: {
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      },
    );
    final response = await http.get(uri, headers: _authHeaders(token));
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Adjustments load failed');
    }
    return _decodeList(
      response.body,
    ).whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
  }

  Future<Map<String, dynamic>> createInventoryAdjustment({
    required String token,
    required String branchId,
    required String productId,
    required String direction,
    required double quantity,
    required String reason,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/salon-inventory/adjustments'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'branch_id': int.tryParse(branchId) ?? branchId,
        'product_id': int.tryParse(productId) ?? productId,
        'direction': direction,
        'quantity': quantity,
        'reason': reason.trim(),
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Stock adjustment failed');
    }
    return body;
  }

  Future<List<Map<String, dynamic>>> fetchInventoryConsumptions({
    required String token,
    String? branchId,
    String? status,
    String? date,
  }) async {
    final uri = Uri.parse('$baseUrl/api/salon-inventory/consumptions').replace(
      queryParameters: {
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        if (status != null && status.isNotEmpty) 'status': status,
        if (date != null && date.isNotEmpty) 'date': date,
      },
    );
    final response = await http.get(uri, headers: _authHeaders(token));
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Consumption records load failed');
    }
    return _decodeList(
      response.body,
    ).whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
  }

  Future<Map<String, dynamic>> createInventoryConsumption({
    required String token,
    required String branchId,
    required String productId,
    required double quantity,
    required String date,
    required String unit,
    String? staffId,
    String? customerId,
    String? serviceId,
    String? reason,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/salon-inventory/consumptions'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'branch_id': int.tryParse(branchId) ?? branchId,
        'product_id': int.tryParse(productId) ?? productId,
        'quantity_used': quantity,
        'consumption_date': date,
        'unit': unit,
        if (staffId != null && staffId.isNotEmpty)
          'staff_id': int.tryParse(staffId) ?? staffId,
        if (customerId != null && customerId.isNotEmpty)
          'customer_id': int.tryParse(customerId) ?? customerId,
        if (serviceId != null && serviceId.isNotEmpty)
          'service_id': int.tryParse(serviceId) ?? serviceId,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Consumption record failed');
    }
    return body;
  }

  Future<void> cancelInventoryConsumption({
    required String token,
    required String consumptionId,
  }) async {
    final response = await http.post(
      Uri.parse(
        '$baseUrl/api/salon-inventory/consumptions/$consumptionId/cancel',
      ),
      headers: _authHeaders(token),
      body: jsonEncode(const {}),
    );
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Cancel usage failed');
    }
  }

  Future<Map<String, dynamic>> fetchInventoryDayEndPreview({
    required String token,
    required String branchId,
    required String date,
  }) async {
    final uri = Uri.parse(
      '$baseUrl/api/salon-inventory/day-end/preview',
    ).replace(queryParameters: {'branchId': branchId, 'date': date});
    final response = await http.get(uri, headers: _authHeaders(token));
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Day End preview failed');
    }
    return body;
  }

  Future<Map<String, dynamic>> confirmInventoryDayEnd({
    required String token,
    required String branchId,
    required String date,
    required List<Map<String, dynamic>> items,
    String? notes,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/salon-inventory/day-end/confirm'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'branch_id': int.tryParse(branchId) ?? branchId,
        'date': date,
        'items': items,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      }),
    );
    final body = _decode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(body['message'] ?? 'Day End Closing failed');
    }
    return body;
  }

  Future<List<Map<String, dynamic>>> fetchInventoryHistory({
    required String token,
    String? branchId,
    String? movementType,
    String? from,
    String? to,
  }) async {
    final uri = Uri.parse('$baseUrl/api/salon-inventory/history').replace(
      queryParameters: {
        'limit': '200',
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
        if (movementType != null && movementType.isNotEmpty)
          'movement_type': movementType,
        if (from != null && from.isNotEmpty) 'from': from,
        if (to != null && to.isNotEmpty) 'to': to,
      },
    );
    final response = await http.get(uri, headers: _authHeaders(token));
    if (response.statusCode >= 400) {
      final body = _decode(response.body);
      throw Exception(body['message'] ?? 'Stock history load failed');
    }
    return _decodeList(
      response.body,
    ).whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
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
    try {
      final parsed = jsonDecode(raw);
      if (parsed is Map<String, dynamic>) return parsed;
      return {};
    } on FormatException {
      return {'message': raw.trim()};
    }
  }

  List<dynamic> _decodeList(String raw) {
    if (raw.trim().isEmpty) return const [];
    try {
      final parsed = jsonDecode(raw);
      if (parsed is List) return parsed;
      if (parsed is Map<String, dynamic> && parsed['data'] is List) {
        return parsed['data'] as List;
      }
      return const [];
    } on FormatException {
      return const [];
    }
  }
}
