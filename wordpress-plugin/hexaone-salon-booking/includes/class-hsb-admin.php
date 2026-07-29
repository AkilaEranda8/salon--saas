<?php
if (!defined('ABSPATH')) {
    exit;
}

class HSB_Admin {
    public static function init() {
        add_action('admin_menu', [__CLASS__, 'menu']);
        add_action('admin_init', [__CLASS__, 'register']);
    }

    public static function menu() {
        add_options_page(
            'Salon Booking',
            'Salon Booking',
            'manage_options',
            'hexaone-salon-booking',
            [__CLASS__, 'render']
        );
    }

    public static function register() {
        register_setting('hsb_settings_group', 'hsb_settings', [
            'type'              => 'array',
            'sanitize_callback' => [__CLASS__, 'sanitize'],
            'default'           => [],
        ]);
    }

    public static function sanitize($input) {
        $out = HSB_API::settings();
        if (!is_array($input)) {
            return $out;
        }
        $out['api_base']  = esc_url_raw(trim($input['api_base'] ?? $out['api_base']));
        $out['tenant_id'] = sanitize_text_field($input['tenant_id'] ?? '');
        $out['title']     = sanitize_text_field($input['title'] ?? 'Book an Appointment');
        $accent = sanitize_hex_color($input['accent'] ?? '#8B2942');
        $out['accent'] = $accent ?: '#8B2942';
        return $out;
    }

    public static function render() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $s = HSB_API::settings();
        ?>
        <div class="wrap">
            <h1>Hexaone Salon Booking</h1>
            <p>Add the shortcode <code>[salon_booking]</code> to any page or post.</p>
            <form method="post" action="options.php">
                <?php settings_fields('hsb_settings_group'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="hsb_api_base">Public API base URL</label></th>
                        <td>
                            <input type="url" class="regular-text" id="hsb_api_base" name="hsb_settings[api_base]" value="<?php echo esc_attr($s['api_base']); ?>" />
                            <p class="description">Example: <code>https://api.salon.hexalyte.com/api/public</code></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hsb_tenant_id">Tenant ID</label></th>
                        <td>
                            <input type="text" class="regular-text" id="hsb_tenant_id" name="hsb_settings[tenant_id]" value="<?php echo esc_attr($s['tenant_id']); ?>" required />
                            <p class="description">Numeric tenant ID for this salon (from Hexaone / platform admin).</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hsb_title">Widget title</label></th>
                        <td>
                            <input type="text" class="regular-text" id="hsb_title" name="hsb_settings[title]" value="<?php echo esc_attr($s['title']); ?>" />
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hsb_accent">Accent color</label></th>
                        <td>
                            <input type="color" id="hsb_accent" name="hsb_settings[accent]" value="<?php echo esc_attr($s['accent']); ?>" />
                        </td>
                    </tr>
                </table>
                <?php submit_button('Save settings'); ?>
            </form>
        </div>
        <?php
    }
}
