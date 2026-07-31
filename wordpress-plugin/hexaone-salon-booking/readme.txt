=== Hexaone Salon Booking ===
Contributors: hexaone
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.13
License: GPLv2 or later

Embed online salon booking on WordPress. Talks to the Hexaone public booking API via a server-side proxy (no CORS setup needed).

== Installation ==

IMPORTANT: Install only through WordPress Admin. Do not extract the ZIP on your computer and upload folders by FTP/File Manager.

1. In Plugins, if an older Hexaone Salon Booking entry exists, click Delete.
2. Download `hexaone-salon-booking.zip` from the salon documentation page.
3. Go to Plugins → Add New → Upload Plugin.
4. Choose the ZIP file and click Install Now, then Activate.
5. Open Settings → Salon Booking and set API URL + Tenant ID.
6. Add shortcode `[salon_booking]` to any page.

This package installs into `wp-content/plugins/hexaone-booking/` (main file: `salon-booking.php`).

Optional shortcode attrs: `[salon_booking title="Book now" accent="#8B2942"]`

== Changelog ==

= 1.0.13 =
* Fix duplicate OTP races, success-screen booking summary, OTP button labels, and safer booking submit.

= 1.0.12 =
* Stop duplicate booking OTP SMS while typing; send once per number (Resend still available).

= 1.0.11 =
* Fix install ZIP so WordPress activates from `hexaone-booking/salon-booking.php` (no nested folder error).

= 1.0.10 =
* Optional "Book multiple services" checkbox. Unticked = single service (default); ticked = multi-service booking.

= 1.0.9 =
* Phone-first details step: returning clients autofill name (no OTP); new numbers verify via SMS OTP.

= 1.0.8 =
* Each selected service can use its own staff member and appointment time.
* Booking submit sends an items[] payload so multiple appointments are created in one request.

= 1.0.7 =
* Show staff profile photos in the staff selection step, with initials as a fallback.

= 1.0.6 =
* Harden booking AJAX proxy so API errors show a clear message instead of a blank HTTP 500.
* Validate booking fields before calling the API and omit empty email values.

= 1.0.5 =
* Stop exposing or displaying service prices in public booking.

= 1.0.4 =
* Send tenantId with bookings so appointments appear in the correct salon.
* Modern salon booking UI with refined typography, step markers, and empty states.

= 1.0.3 =
* Fresh install folder path for easier activation without File Manager.

== Notes ==

- No File Manager access is required when you use Upload Plugin.
- If Activate still fails, Delete the listed plugin once, then install this ZIP again through Upload Plugin.
- Bookings are created as pending appointments on the salon backend.
