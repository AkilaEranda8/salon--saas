import 'package:flutter/material.dart';

import '../models/app_item.dart';
import '../models/appointment.dart';
import '../models/customer.dart';
import '../models/salon_service.dart';
import '../models/staff_member.dart';
import '../models/staff_user.dart';
import '../services/mobile_api.dart';
import '../utils/appointment_notes.dart';

class AppState extends ChangeNotifier {
  AppState()
    : _api = MobileApi(
        baseUrl: const String.fromEnvironment(
          'API_BASE_URL',
          defaultValue: 'https://api.zanesalon.com',
        ),
      );

  final MobileApi _api;
  final List<StaffUser> _staffUsers = [];
  final List<AppItem> _items = [];
  final List<Customer> _customers = [];
  final List<Appointment> _appointments = [];
  final List<SalonService> _services = [];
  final List<Map<String, String>> _branches = [];
  int _idCounter = 1;
  StaffUser? _currentUser;
  String? _lastError;
  int _appointmentTotal = 0;
  int _lastApptPage = 1;
  int _lastApptLimit = 200;
  String? _lastApptStatus;
  String? _lastApptDate;
  String? _lastApptBranchId;

  List<StaffUser> get staffUsers => List.unmodifiable(_staffUsers);
  List<AppItem> get items => List.unmodifiable(_items);
  List<Customer> get customers => List.unmodifiable(_customers);
  List<Appointment> get appointments => List.unmodifiable(_appointments);
  List<SalonService> get services => List.unmodifiable(_services);
  List<Map<String, String>> get branches => List.unmodifiable(_branches);
  StaffUser? get currentUser => _currentUser;
  String? get lastError => _lastError;
  int get appointmentTotal => _appointmentTotal;

  bool get isLoggedIn => _currentUser != null;

  Future<bool> loginStaff(String username, String password) async {
    try {
      _lastError = null;
      final body = await _api.login(username: username, password: password);
      final token = '${body['token'] ?? ''}';
      if (token.trim().isEmpty) {
        _lastError = 'Login token missing from server response.';
        return false;
      }
      final user = Map<String, dynamic>.from(body['user'] as Map? ?? {});
      final role = '${user['role'] ?? 'staff'}';
      final branchId = '${user['branchId'] ?? ''}';
      _currentUser = StaffUser(
        id: '${user['id'] ?? ''}',
        username: '${user['username'] ?? username}',
        password: '',
        displayName: '${user['name'] ?? user['username'] ?? 'Staff'}',
        isActive: true,
        role: role,
        branchId: branchId.isEmpty ? null : branchId,
        authToken: token,
        permissions: _permissionsFromRole(role),
      );
      notifyListeners();
      return true;
    } catch (e) {
      _lastError = e.toString().replaceFirst('Exception: ', '');
      return false;
    }
  }

  void logout() {
    _currentUser = null;
    _customers.clear();
    _appointments.clear();
    _services.clear();
    notifyListeners();
  }

  bool hasPermission(StaffPermission permission) {
    return _currentUser?.permissions.contains(permission) ?? false;
  }

  void addItem(String title, String description) {
    if (!hasPermission(StaffPermission.canAdd) || _currentUser == null) return;
    _items.add(
      AppItem(
        id: 'item_${_idCounter++}',
        title: title.trim(),
        description: description.trim(),
        createdBy: _currentUser!.displayName,
      ),
    );
    notifyListeners();
  }

  void editItem(String id, String title, String description) {
    if (!hasPermission(StaffPermission.canEdit)) return;
    final index = _items.indexWhere((item) => item.id == id);
    if (index == -1) return;
    _items[index] = _items[index].copyWith(
      title: title.trim(),
      description: description.trim(),
    );
    notifyListeners();
  }

  bool updateStaffPermission({
    required String staffId,
    required StaffPermission permission,
    required bool enable,
  }) {
    if (!hasPermission(StaffPermission.canManagePermissions)) return false;
    final index = _staffUsers.indexWhere((u) => u.id == staffId);
    if (index == -1) return false;
    final user = _staffUsers[index];
    if (enable) {
      user.permissions.add(permission);
    } else {
      user.permissions.remove(permission);
    }
    notifyListeners();
    return true;
  }

  Future<List<Customer>> loadCustomers() async {
    if (!hasPermission(StaffPermission.canViewCustomers)) return const [];
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) {
      throw Exception('Missing auth token (cannot load customers).');
    }
    final loaded = await _api.fetchCustomers(
      token: token,
      branchId: _currentUser?.branchId,
    );
    _customers
      ..clear()
      ..addAll(loaded);
    notifyListeners();
    return customers;
  }

  Future<bool> addCustomer({
    required String name,
    required String phone,
    required String email,
  }) async {
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) {
      _lastError = 'Missing auth token (cannot add customer).';
      return false;
    }
    try {
      final customer = await _api.createCustomer(
        token: token,
        name: name,
        phone: phone,
        email: email,
        branchId: _currentUser?.branchId,
      );
      _customers.insert(0, customer);
      notifyListeners();
      return true;
    } catch (e) {
      _lastError = e.toString().replaceFirst('Exception: ', '');
      return false;
    }
  }

  Future<List<SalonService>> loadServices() async {
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) {
      throw Exception('Missing auth token (cannot load services).');
    }
    final loaded = await _api.fetchServices(token: token);
    _services
      ..clear()
      ..addAll(loaded);
    notifyListeners();
    return services;
  }

  Future<List<StaffMember>> loadStaffList({String? branchId}) async {
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) {
      throw Exception('Missing auth token (cannot load staff).');
    }
    return _api.fetchStaff(
      token: token,
      branchId: branchId ?? _currentUser?.branchId,
    );
  }

  Future<List<Map<String, String>>> loadBranches() async {
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) return branches;
    final loaded = await _api.fetchBranches(token: token);
    _branches
      ..clear()
      ..addAll(
        loaded.map(
          (b) => {
            'id': '${b['id'] ?? ''}',
            'name': '${b['name'] ?? ''}',
          },
        ),
      );
    notifyListeners();
    return branches;
  }

  Future<bool> addService({
    required String name,
    required String category,
    required String price,
  }) async {
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) {
      _lastError = 'Missing auth token (cannot add service).';
      return false;
    }
    try {
      await _api.createService(
        token: token,
        name: name,
        category: category,
        price: price,
      );
      await loadServices();
      return true;
    } catch (e) {
      _lastError = e.toString().replaceFirst('Exception: ', '');
      return false;
    }
  }

  Future<List<Appointment>> loadAppointments({
    int page = 1,
    int limit = 200,
    String? status,
    String? date,
    String? branchId,
  }) async {
    if (!hasPermission(StaffPermission.canViewAppointments)) return const [];
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) {
      throw Exception('Missing auth token (cannot load appointments).');
    }
    final effectiveBranch = (branchId ?? _currentUser?.branchId ?? '').trim();
    _lastApptPage = page;
    _lastApptLimit = limit;
    _lastApptStatus = status;
    _lastApptDate = date;
    _lastApptBranchId = effectiveBranch.isEmpty ? null : effectiveBranch;

    final result = await _api.fetchAppointments(
      token: token,
      branchId: effectiveBranch.isEmpty ? null : effectiveBranch,
      page: page,
      limit: limit,
      status: status,
      date: date,
    );
    _appointmentTotal = result.total;
    _appointments
      ..clear()
      ..addAll(result.data);
    notifyListeners();
    return appointments;
  }

  Future<void> reloadAppointments() async {
    await loadAppointments(
      page: _lastApptPage,
      limit: _lastApptLimit,
      status: _lastApptStatus,
      date: _lastApptDate,
      branchId: _lastApptBranchId,
    );
  }

  double _sumServicePrices(List<String> orderedServiceIds) {
    var sum = 0.0;
    for (final id in orderedServiceIds) {
      SalonService? found;
      for (final s in _services) {
        if (s.id == id) {
          found = s;
          break;
        }
      }
      if (found != null) sum += found.price;
    }
    return sum;
  }

  Future<bool> saveAppointment({
    String? appointmentId,
    required String branchId,
    required String customerName,
    required String phone,
    required String customerId,
    required List<String> orderedServiceIds,
    required String date,
    required String time,
    required String staffId,
    required String baseNotes,
    required String status,
    String? amountOverride,
  }) async {
    if (!hasPermission(StaffPermission.canAddAppointments) || _currentUser == null) {
      return false;
    }
    final token = _currentUser?.authToken;
    final effectiveBranchId = branchId.trim();
    if (token == null || token.isEmpty) {
      _lastError = 'Missing auth token (cannot save appointment).';
      return false;
    }
    if (effectiveBranchId.isEmpty) {
      _lastError = 'Branch is missing.';
      return false;
    }
    if (orderedServiceIds.isEmpty) {
      _lastError = 'Select at least one service.';
      return false;
    }
    try {
      await loadServices();
      final primary = orderedServiceIds.first;
      final extraNames = orderedServiceIds
          .skip(1)
          .map((id) {
            for (final s in _services) {
              if (s.id == id) return s.name;
            }
            return '';
          })
          .where((n) => n.isNotEmpty)
          .toList();
      final notes = AppointmentNotes.combineNotes(baseNotes, extraNames);
      final autoTotal = _sumServicePrices(orderedServiceIds);
      final amountStr = (amountOverride != null && amountOverride.trim().isNotEmpty)
          ? amountOverride.trim()
          : (autoTotal > 0 ? autoTotal.toString() : null);

      if (appointmentId != null && appointmentId.isNotEmpty) {
        await _api.updateAppointment(
          token: token,
          appointmentId: appointmentId,
          customerName: customerName,
          primaryServiceId: primary,
          serviceIds: orderedServiceIds,
          date: date,
          time: time,
          customerId: customerId.isNotEmpty ? customerId : null,
          phone: phone,
          staffId: staffId.isNotEmpty ? staffId : null,
          amount: amountStr,
          notes: notes,
          status: status.isNotEmpty ? status : null,
        );
      } else {
        await _api.createAppointment(
          token: token,
          branchId: effectiveBranchId,
          customerName: customerName,
          primaryServiceId: primary,
          serviceIds: orderedServiceIds,
          date: date,
          time: time,
          customerId: customerId.isNotEmpty ? customerId : null,
          phone: phone,
          staffId: staffId.isNotEmpty ? staffId : null,
          amount: amountStr,
          notes: notes,
        );
      }
      await reloadAppointments();
      return true;
    } catch (e) {
      _lastError = e.toString().replaceFirst('Exception: ', '');
      return false;
    }
  }

  Future<bool> deleteAppointment(String appointmentId) async {
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) {
      _lastError = 'Missing auth token (cannot delete appointment).';
      return false;
    }
    try {
      await _api.deleteAppointment(token: token, appointmentId: appointmentId);
      await reloadAppointments();
      return true;
    } catch (e) {
      _lastError = e.toString().replaceFirst('Exception: ', '');
      return false;
    }
  }

  Future<bool> changeAppointmentStatus({
    required String appointmentId,
    required String status,
  }) async {
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) {
      _lastError = 'Missing auth token (cannot change status).';
      return false;
    }
    try {
      await _api.updateAppointmentStatus(
        token: token,
        appointmentId: appointmentId,
        status: status,
      );
      await reloadAppointments();
      return true;
    } catch (e) {
      _lastError = e.toString().replaceFirst('Exception: ', '');
      return false;
    }
  }

  Future<bool> collectAppointmentPayment({
    required Appointment appointment,
    required String amount,
    required String method,
    required List<String> paymentServiceIds,
  }) async {
    final token = _currentUser?.authToken;
    if (token == null || token.isEmpty) {
      _lastError = 'Missing auth token (cannot collect payment).';
      return false;
    }
    final s = appointment.status.toLowerCase();
    if (s != 'confirmed' && s != 'in_service') {
      _lastError = 'Payment can be collected only when status is In Service.';
      return false;
    }
    if (paymentServiceIds.isEmpty) {
      _lastError = 'Select at least one service.';
      return false;
    }
    final effectiveBranchId =
        (appointment.branchId.isNotEmpty ? appointment.branchId : (_currentUser?.branchId ?? '')).trim();
    if (effectiveBranchId.isEmpty) {
      _lastError = 'Branch not found for this appointment.';
      return false;
    }
    try {
      await _api.createPayment(
        token: token,
        branchId: effectiveBranchId,
        appointmentId: appointment.id,
        customerName: appointment.customerName,
        serviceId: paymentServiceIds.first,
        serviceIds: paymentServiceIds,
        staffId: appointment.staffId.isNotEmpty ? appointment.staffId : null,
        customerId: appointment.customerId.isNotEmpty ? appointment.customerId : null,
        amount: amount,
        method: method,
      );
      await _api.updateAppointmentStatus(
        token: token,
        appointmentId: appointment.id,
        status: 'completed',
      );
      await reloadAppointments();
      return true;
    } catch (e) {
      _lastError = e.toString().replaceFirst('Exception: ', '');
      return false;
    }
  }

  Set<StaffPermission> _permissionsFromRole(String role) {
    switch (role) {
      case 'superadmin':
      case 'admin':
        return {
          StaffPermission.canAdd,
          StaffPermission.canEdit,
          StaffPermission.canViewCustomers,
          StaffPermission.canViewAppointments,
          StaffPermission.canAddAppointments,
          StaffPermission.canManagePermissions,
        };
      case 'manager':
        return {
          StaffPermission.canAdd,
          StaffPermission.canEdit,
          StaffPermission.canViewCustomers,
          StaffPermission.canViewAppointments,
          StaffPermission.canAddAppointments,
        };
      default:
        return {
          StaffPermission.canViewCustomers,
          StaffPermission.canViewAppointments,
          StaffPermission.canAddAppointments,
        };
    }
  }
}

class AppStateScope extends InheritedNotifier<AppState> {
  const AppStateScope({
    required AppState notifier,
    required super.child,
    super.key,
  }) : super(notifier: notifier);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppStateScope>();
    assert(scope != null, 'AppStateScope is missing in widget tree');
    return scope!.notifier!;
  }
}
