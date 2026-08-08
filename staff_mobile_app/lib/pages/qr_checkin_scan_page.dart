import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../state/app_state.dart';

/// Staff camera scanner for customer portal check-in QR codes.
class QrCheckInScanPage extends StatefulWidget {
  const QrCheckInScanPage({super.key});

  @override
  State<QrCheckInScanPage> createState() => _QrCheckInScanPageState();
}

class _QrCheckInScanPageState extends State<QrCheckInScanPage> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
  );

  bool _busy = false;
  String? _lastCode;
  Map<String, dynamic>? _result;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_busy) return;
    final raw = capture.barcodes
        .map((b) => b.rawValue?.trim() ?? '')
        .firstWhere((v) => v.isNotEmpty, orElse: () => '');
    if (raw.isEmpty) return;
    if (raw == _lastCode && _result != null) return;

    final app = AppStateScope.of(context);
    final token = app.currentUser?.authToken?.trim() ?? '';
    if (token.isEmpty) {
      setState(() => _error = 'Not signed in.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _lastCode = raw;
    });

    try {
      await _controller.stop();
      final resolved = await app.api.resolveCustomerQr(token: token, code: raw);
      if (!mounted) return;
      setState(() {
        _result = resolved;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceFirst('Exception: ', '');
        _result = null;
      });
      await Future<void>.delayed(const Duration(milliseconds: 900));
      if (mounted) {
        _lastCode = null;
        await _controller.start();
      }
    }
  }

  Future<void> _checkIn({int? appointmentId}) async {
    final code = _lastCode;
    if (code == null || code.isEmpty) return;
    final app = AppStateScope.of(context);
    final token = app.currentUser?.authToken?.trim() ?? '';
    if (token.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final body = await app.api.checkInCustomerQr(
        token: token,
        code: code,
        appointmentId: appointmentId,
      );
      if (!mounted) return;
      setState(() {
        _result = {
          ...?_result,
          ...body,
        };
        _busy = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Customer checked in')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _scanAgain() async {
    setState(() {
      _result = null;
      _error = null;
      _lastCode = null;
      _busy = false;
    });
    await _controller.start();
  }

  @override
  Widget build(BuildContext context) {
    final customer = _result?['customer'];
    final appointments = (_result?['appointments'] is List)
        ? List<Map<String, dynamic>>.from(
            (_result!['appointments'] as List).whereType<Map>().map(
                  (e) => Map<String, dynamic>.from(e),
                ),
          )
        : <Map<String, dynamic>>[];
    final name = customer is Map ? '${customer['name'] ?? 'Customer'}' : '';
    final phone = customer is Map ? '${customer['phone'] ?? ''}' : '';
    final points = customer is Map
        ? int.tryParse('${customer['loyalty_points'] ?? 0}') ?? 0
        : 0;
    final checkedIn = _result?['checked_in'] == true;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan check-in QR'),
        actions: [
          if (_result != null)
            TextButton(
              onPressed: _busy ? null : _scanAgain,
              child: const Text('Scan again'),
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            flex: _result == null ? 3 : 1,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (_result == null)
                  MobileScanner(
                    controller: _controller,
                    onDetect: _onDetect,
                  )
                else
                  Container(
                    color: Colors.black87,
                    alignment: Alignment.center,
                    child: const Icon(Icons.qr_code_2, color: Colors.white54, size: 64),
                  ),
                if (_busy && _result == null)
                  const ColoredBox(
                    color: Color(0x66000000),
                    child: Center(child: CircularProgressIndicator()),
                  ),
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null) ...[
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  const SizedBox(height: 12),
                ],
                if (_result == null && _error == null)
                  const Text(
                    'Point the camera at the customer app check-in QR.',
                    style: TextStyle(fontSize: 15),
                  ),
                if (_result != null) ...[
                  Text(
                    name.isEmpty ? 'Customer found' : name,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  if (phone.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(phone),
                  ],
                  const SizedBox(height: 8),
                  Text('$points loyalty points'),
                  if (checkedIn) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'Checked in',
                      style: TextStyle(
                        color: Colors.green,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Text(
                    appointments.isEmpty
                        ? 'No appointments today'
                        : 'Today’s appointments',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  if (appointments.isEmpty)
                    const Text(
                      'You can still add a walk-in from the Walk-in screen using this customer.',
                    )
                  else
                    ...appointments.map((a) {
                      final id = int.tryParse('${a['id'] ?? ''}');
                      final service = a['service'];
                      final serviceName = service is Map
                          ? '${service['name'] ?? 'Service'}'
                          : 'Service';
                      final time = '${a['time'] ?? ''}'.substring(
                        0,
                        ('${a['time'] ?? ''}'.length >= 5)
                            ? 5
                            : '${a['time'] ?? ''}'.length,
                      );
                      final status = '${a['status'] ?? ''}';
                      final branch = a['branch'];
                      final branchName =
                          branch is Map ? '${branch['name'] ?? ''}' : '';
                      return Card(
                        child: ListTile(
                          title: Text(serviceName),
                          subtitle: Text(
                            [
                              if (time.isNotEmpty) time,
                              if (branchName.isNotEmpty) branchName,
                              status,
                            ].join(' · '),
                          ),
                          trailing: status == 'pending'
                              ? TextButton(
                                  onPressed: (_busy || id == null)
                                      ? null
                                      : () => _checkIn(appointmentId: id),
                                  child: const Text('Check in'),
                                )
                              : Text(
                                  status == 'confirmed' ? 'Arrived' : status,
                                  style: const TextStyle(fontSize: 12),
                                ),
                        ),
                      );
                    }),
                  if (appointments.any((a) => a['status'] == 'pending')) ...[
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: _busy ? null : () => _checkIn(),
                      child: const Text('Check in first appointment'),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
