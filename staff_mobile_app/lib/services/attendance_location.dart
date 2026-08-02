import 'package:geolocator/geolocator.dart';

class AttendanceGeoResult {
  const AttendanceGeoResult({
    required this.latitude,
    required this.longitude,
    this.accuracyM,
  });
  final double latitude;
  final double longitude;
  final double? accuracyM;
}

class AttendanceGeoError implements Exception {
  AttendanceGeoError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Request permission + current GPS fix for attendance geofence.
Future<AttendanceGeoResult> getAttendancePosition() async {
  final serviceEnabled = await Geolocator.isLocationServiceEnabled();
  if (!serviceEnabled) {
    throw AttendanceGeoError(
      'Location is turned off. Enable GPS and try again.',
    );
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied) {
    throw AttendanceGeoError(
      'Location permission denied. Allow location to mark attendance.',
    );
  }
  if (permission == LocationPermission.deniedForever) {
    throw AttendanceGeoError(
      'Location permission permanently denied. Enable it in phone Settings.',
    );
  }

  final pos = await Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      timeLimit: Duration(seconds: 20),
    ),
  );

  return AttendanceGeoResult(
    latitude: pos.latitude,
    longitude: pos.longitude,
    accuracyM: pos.accuracy,
  );
}

double distanceMeters({
  required double fromLat,
  required double fromLng,
  required double toLat,
  required double toLng,
}) {
  return Geolocator.distanceBetween(fromLat, fromLng, toLat, toLng);
}
