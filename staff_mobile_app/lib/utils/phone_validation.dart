// Shared phone helpers for customer registration on staff mobile.

String phoneDigitsOnly(String? raw) =>
    (raw ?? '').replaceAll(RegExp(r'\D'), '');

/// True when [raw] looks like a usable mobile/landline number.
/// Accepts common LK forms: `07XXXXXXXX`, `947XXXXXXXX`, `+94…`, spaces/dashes.
bool isValidCustomerPhone(String? raw) {
  final digits = phoneDigitsOnly(raw);
  if (digits.length < 9 || digits.length > 15) return false;

  // Local mobile: 07XXXXXXXX (10 digits)
  if (RegExp(r'^07\d{8}$').hasMatch(digits)) return true;
  // Local landline-ish: 0XXXXXXXXX (10 digits)
  if (RegExp(r'^0\d{9}$').hasMatch(digits)) return true;
  // International SL: 947XXXXXXXX
  if (RegExp(r'^947\d{9}$').hasMatch(digits)) return true;
  // Without leading 0: 7XXXXXXXX (9 digits mobile)
  if (RegExp(r'^7\d{8}$').hasMatch(digits)) return true;
  // Generic international fallback (E.164-ish digit length)
  if (digits.length >= 10 && digits.length <= 15) return true;
  return false;
}

/// Form validator / snack message. Returns `null` when valid.
String? validateCustomerPhone(String? raw, {bool required = true}) {
  final trimmed = (raw ?? '').trim();
  if (trimmed.isEmpty) {
    return required ? 'Phone number is required' : null;
  }
  if (!isValidCustomerPhone(trimmed)) {
    return 'Enter a valid phone (e.g. 0771234567)';
  }
  return null;
}

/// Prefer storing local `0…` form when input is `94…`.
String normalizeCustomerPhone(String? raw) {
  final digits = phoneDigitsOnly(raw);
  if (digits.startsWith('94') && digits.length >= 11) {
    return '0${digits.substring(2)}';
  }
  if (digits.length == 9 && digits.startsWith('7')) {
    return '0$digits';
  }
  return digits.isNotEmpty ? digits : (raw ?? '').trim();
}
