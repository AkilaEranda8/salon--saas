<?php
if (!defined('ABSPATH')) {
    exit;
}

class HSB_Shortcode {
    private static $printed = false;

    public static function init() {
        add_shortcode('salon_booking', [__CLASS__, 'render']);
        add_shortcode('hexaone_booking', [__CLASS__, 'render']);
    }

    public static function render($atts = []) {
        $settings = HSB_API::settings();
        $atts = shortcode_atts([
            'title'  => $settings['title'],
            'accent' => $settings['accent'],
        ], $atts, 'salon_booking');

        if (empty($settings['tenant_id'])) {
            if (current_user_can('manage_options')) {
                return '<p><strong>Salon Booking:</strong> configure Tenant ID under Settings → Salon Booking.</p>';
            }
            return '';
        }

        self::enqueue($atts);

        ob_start();
        ?>
        <div
            class="hsb-root"
            id="hsb-root"
            style="--hsb-accent: <?php echo esc_attr($atts['accent']); ?>;"
            data-ajax-url="<?php echo esc_url(admin_url('admin-ajax.php')); ?>"
            data-nonce="<?php echo esc_attr(wp_create_nonce('hsb_nonce')); ?>"
            data-title="<?php echo esc_attr($atts['title']); ?>"
        >
            <div class="hsb-card">
                <header class="hsb-header">
                    <h2 class="hsb-title"><?php echo esc_html($atts['title']); ?></h2>
                    <ol class="hsb-steps" aria-label="Booking steps">
                        <li class="is-active" data-step="0">Branch</li>
                        <li data-step="1">Service</li>
                        <li data-step="2">Staff &amp; time</li>
                        <li data-step="3">Details</li>
                        <li data-step="4">Done</li>
                    </ol>
                </header>
                <div class="hsb-body" id="hsb-body">
                    <p class="hsb-loading">Loading…</p>
                </div>
                <footer class="hsb-footer" id="hsb-footer" hidden></footer>
            </div>
            <p class="hsb-error" id="hsb-error" hidden></p>
        </div>
        <?php
        return ob_get_clean();
    }

    private static function enqueue($atts) {
        if (self::$printed) {
            return;
        }
        self::$printed = true;

        wp_enqueue_style(
            'hsb-booking',
            HSB_PLUGIN_URL . 'assets/css/booking.css',
            [],
            HSB_VERSION
        );
        wp_enqueue_script(
            'hsb-booking',
            HSB_PLUGIN_URL . 'assets/js/booking.js',
            [],
            HSB_VERSION,
            true
        );
    }
}
