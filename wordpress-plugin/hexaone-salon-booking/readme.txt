=== Hexaone Salon Booking ===
Contributors: hexaone
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Embed online salon booking on WordPress. Talks to the Hexaone public booking API via a server-side proxy (no CORS setup needed).

== Installation ==

1. Upload the `hexaone-salon-booking` folder to `/wp-content/plugins/`.
2. Activate **Hexaone Salon Booking** in Plugins.
3. Go to **Settings → Salon Booking** and set:
   - Public API base URL (default: `https://api.salon.hexalyte.com/api/public`)
   - Tenant ID (numeric)
4. Add shortcode `[salon_booking]` to any page.

Optional shortcode attrs: `[salon_booking title="Book now" accent="#2563EB"]`

== Notes ==

- The plugin proxies API calls through `admin-ajax.php`, so the visitor browser never calls the salon API directly.
- Bookings are created as pending appointments on the salon backend.
