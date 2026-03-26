/// Mirrors web `AppointmentsPage.jsx` — extra services stored in notes.
class AppointmentNotes {
  AppointmentNotes._();

  static const String extraServicesPrefix = 'Additional services:';

  static String stripAdditionalServicesLine(String notes) {
    return notes
        .split('\n')
        .where((line) => !line.trim().startsWith(extraServicesPrefix))
        .join('\n')
        .trim();
  }

  static List<String> parseAdditionalServiceNames(String notes) {
    for (final line in notes.split('\n')) {
      if (line.trim().startsWith(extraServicesPrefix)) {
        return line
            .replaceFirst(extraServicesPrefix, '')
            .split(',')
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .toList();
      }
    }
    return [];
  }

  static String combineNotes(String baseNotes, List<String> extraServiceNames) {
    final stripped = stripAdditionalServicesLine(baseNotes);
    final extraLine = extraServiceNames.isEmpty
        ? ''
        : '$extraServicesPrefix ${extraServiceNames.join(', ')}';
    return [stripped, extraLine].where((s) => s.isNotEmpty).join('\n');
  }
}
