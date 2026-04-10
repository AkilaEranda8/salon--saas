import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as sio;
import 'package:socket_io_client/socket_io_client.dart' show OptionBuilder;

/// Subscribes to backend `queue:updated` (same as web WalkInPage / Token Display).
class WalkInQueueSocket {
  sio.Socket? _socket;
  Timer? _debounce;
  String? _branchId;

  static String originFromApiBase(String apiBase) {
    final u = Uri.parse(apiBase.trim().isEmpty ? 'https://api.salon.hexalyte.com' : apiBase);
    final port = u.hasPort ? ':${u.port}' : '';
    return '${u.scheme}://${u.host}$port';
  }

  void connect({
    required String apiBaseUrl,
    required String token,
    required String branchId,
    required void Function() onQueueUpdated,
  }) {
    disconnect();
    _branchId = branchId;
    final origin = originFromApiBase(apiBaseUrl);

    _socket = sio.io(
      origin,
      OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionAttempts(20)
          .setReconnectionDelay(1000)
          .enableForceNew()
          .build(),
    );

    void emitJoin() {
      final b = _branchId;
      final s = _socket;
      if (s != null && b != null && b.isNotEmpty) {
        s.emit('join', {'branchId': b});
      }
    }

    _socket!.onConnect((_) => emitJoin());
    _socket!.onReconnect((_) => emitJoin());
    _socket!.on('queue:updated', (_) {
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 400), onQueueUpdated);
    });
  }

  void disconnect() {
    _debounce?.cancel();
    _debounce = null;
    _branchId = null;
    final s = _socket;
    _socket = null;
    if (s != null) {
      s.dispose();
    }
  }
}
