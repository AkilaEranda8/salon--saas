<?php
/**
 * Plugin Name: Hexaone Salon Booking
 * Plugin URI: https://salon.hexalyte.com/documentation
 * Description: Embed an online salon booking form on any WordPress page. Connects to the Hexaone / salon SaaS public booking API.
 * Version: 1.0.12
 * Author: Hexaone
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Text Domain: hexaone-salon-booking
 */

if (!defined('ABSPATH')) {
    exit;
}

define('HSB_VERSION', '1.0.12');
define('HSB_PLUGIN_FILE', __FILE__);
define('HSB_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('HSB_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once HSB_PLUGIN_DIR . 'includes/class-hsb-api.php';
require_once HSB_PLUGIN_DIR . 'includes/class-hsb-admin.php';
require_once HSB_PLUGIN_DIR . 'includes/class-hsb-shortcode.php';

final class Hexaone_Salon_Booking {
    public static function init() {
        HSB_Admin::init();
        HSB_Shortcode::init();
        add_action('wp_ajax_hsb_proxy', [HSB_API::class, 'ajax_proxy']);
        add_action('wp_ajax_nopriv_hsb_proxy', [HSB_API::class, 'ajax_proxy']);
    }
}

add_action('plugins_loaded', ['Hexaone_Salon_Booking', 'init']);

register_activation_hook(__FILE__, function () {
    if (!get_option('hsb_settings')) {
        add_option('hsb_settings', [
            'api_base'  => 'https://api.salon.hexalyte.com/api/public',
            'tenant_id' => '',
            'title'     => 'Book an Appointment',
            'accent'    => '#8B2942',
        ]);
    }
});
