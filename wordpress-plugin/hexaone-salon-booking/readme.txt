=== Hexaone Salon Booking ===
Contributors: hexaone
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.1
License: GPLv2 or later

Embed online salon booking on WordPress. Talks to the Hexaone public booking API via a server-side proxy (no CORS setup needed).

== Installation ==

1. If an older copy is already listed, click Delete and confirm.
2. In File Manager, make sure `wp-content/plugins/hexaone-salon-booking` is fully removed.
3. Upload the `hexaone-salon-booking.zip` package via Plugins → Add New → Upload Plugin.
4. Activate **Hexaone Salon Booking**.
5. Go to Settings → Salon Booking and set:
   - Public API base URL (default: `https://api.salon.hexalyte.com/api/public`)
   - Tenant ID (numeric)
6. Add shortcode `[salon_booking]` to any page.

Optional shortcode attrs: `[salon_booking title="Book now" accent="#2563EB"]`

If WordPress says "Plugin file does not exist", the previous folder was incomplete. Delete the plugin entry, remove the leftover folder in File Manager, then reinstall this ZIP.

== Notes ==

- Main plugin file: `salon-booking.php`
- The plugin proxies API calls through `admin-ajax.php`, so the visitor browser never calls the salon API directly.
- Bookings are created as pending appointments on the salon backend.
