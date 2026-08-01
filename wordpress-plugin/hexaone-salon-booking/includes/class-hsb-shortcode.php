<?php
if (!defined('ABSPATH')) {
    exit;
}

class HSB_Shortcode {
    private static $instances = 0;
    private static $assets_registered = false;
    private static $assets_enqueued = false;

    public static function init() {
        add_shortcode('salon_booking', [__CLASS__, 'render']);
        add_shortcode('hexaone_booking', [__CLASS__, 'render']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'register_assets'], 5);
        // Elementor / page builders often render shortcodes after the normal enqueue pass.
        add_action('wp_footer', [__CLASS__, 'maybe_enqueue_assets'], 1);
    }

    public static function register_assets() {
        if (self::$assets_registered) {
            return;
        }
        self::$assets_registered = true;

        wp_register_style(
            'hsb-fonts',
            'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Outfit:wght@400;500;600;700&display=swap',
            [],
            null
        );
        wp_register_style(
            'hsb-booking',
            HSB_PLUGIN_URL . 'assets/css/booking.css',
            ['hsb-fonts'],
            HSB_VERSION
        );
        wp_register_script(
            'hsb-booking',
            HSB_PLUGIN_URL . 'assets/js/booking.js',
            [],
            HSB_VERSION,
            true
        );
    }

    public static function maybe_enqueue_assets() {
        if (self::$assets_enqueued) {
            self::enqueue_assets();
        }
    }

    private static function enqueue_assets() {
        self::register_assets();
        self::$assets_enqueued = true;
        wp_enqueue_style('hsb-fonts');
        wp_enqueue_style('hsb-booking');
        wp_enqueue_script('hsb-booking');
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

        $accent = sanitize_hex_color($atts['accent']);
        if (!$accent) {
            $accent = sanitize_hex_color($settings['accent']) ?: '#8B2942';
        }

        self::enqueue_assets();
        self::$instances += 1;
        $uid = 'hsb-' . self::$instances . '-' . wp_generate_password(6, false, false);

        ob_start();
        ?>
        <div
            class="hsb-root"
            id="<?php echo esc_attr($uid); ?>"
            style="--hsb-accent: <?php echo esc_attr($accent); ?>;"
            data-ajax-url="<?php echo esc_url(admin_url('admin-ajax.php')); ?>"
            data-nonce="<?php echo esc_attr(wp_create_nonce('hsb_nonce')); ?>"
            data-title="<?php echo esc_attr($atts['title']); ?>"
            data-hsb-version="<?php echo esc_attr(HSB_VERSION); ?>"
        >
            <div class="hsb-card">
                <header class="hsb-header">
                    <p class="hsb-eyebrow">Online booking</p>
                    <h2 class="hsb-title"><?php echo esc_html($atts['title']); ?></h2>
                    <ol class="hsb-steps" aria-label="Booking steps">
                        <li class="is-active" data-step="0" data-step-num="1"><span class="hsb-step-label">Branch</span></li>
                        <li data-step="1" data-step-num="2"><span class="hsb-step-label">Service</span></li>
                        <li data-step="2" data-step-num="3"><span class="hsb-step-label">Staff &amp; time</span></li>
                        <li data-step="3" data-step-num="4"><span class="hsb-step-label">Details</span></li>
                        <li data-step="4" data-step-num="5"><span class="hsb-step-label">Done</span></li>
                    </ol>
                </header>
                <div class="hsb-body">
                    <p class="hsb-loading">Preparing your booking…</p>
                </div>
                <footer class="hsb-footer" hidden></footer>
            </div>
            <p class="hsb-error" hidden></p>
        </div>
        <script>
        (function () {
          var root = document.getElementById(<?php echo wp_json_encode($uid); ?>);
          if (!root) return;
          setTimeout(function () {
            if (root.getAttribute('data-hsb-booted') === '1') return;
            var body = root.querySelector('.hsb-body');
            if (!body) return;
            var loading = body.querySelector('.hsb-loading');
            if (!loading) return;
            body.innerHTML = '';
            var err = root.querySelector('.hsb-error');
            if (err) {
              err.hidden = false;
              err.textContent = 'Booking script failed to load. Hard-refresh (Ctrl+F5) or reinstall Hexaone Salon Booking v<?php echo esc_js(HSB_VERSION); ?>.';
            }
          }, 10000);
        })();
        </script>
        <?php
        return ob_get_clean();
    }
}
