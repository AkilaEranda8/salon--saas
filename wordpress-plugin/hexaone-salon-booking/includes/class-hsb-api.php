<?php
if (!defined('ABSPATH')) {
    exit;
}

class HSB_API {
    public static function settings() {
        $defaults = [
            'api_base'  => 'https://api.salon.hexalyte.com/api/public',
            'tenant_id' => '',
            'title'     => 'Book an Appointment',
            'accent'    => '#8B2942',
        ];
        return wp_parse_args(get_option('hsb_settings', []), $defaults);
    }

    public static function ajax_proxy() {
        check_ajax_referer('hsb_nonce', 'nonce');

        $settings = self::settings();
        $api_base = untrailingslashit(trim($settings['api_base']));
        $tenant_id = trim((string) $settings['tenant_id']);

        if ($api_base === '' || $tenant_id === '') {
            self::fail('Plugin is not configured. Set API URL and Tenant ID in Settings.');
        }

        $action = sanitize_key(wp_unslash($_REQUEST['hsb_action'] ?? ''));
        $allowed = ['branches', 'services', 'staff', 'availability', 'book'];
        if (!in_array($action, $allowed, true)) {
            self::fail('Invalid action.');
        }

        if ($action === 'book') {
            self::proxy_book($api_base);
            return;
        }

        $query = ['tenantId' => $tenant_id];

        if ($action === 'staff') {
            $branch_id = absint($_REQUEST['branch_id'] ?? 0);
            if (!$branch_id) {
                self::fail('branch_id is required.');
            }
            $query['branchId'] = $branch_id;
        }

        if ($action === 'availability') {
            $staff_id = absint($_REQUEST['staff_id'] ?? 0);
            $date = sanitize_text_field(wp_unslash($_REQUEST['date'] ?? ''));
            $duration = absint($_REQUEST['duration'] ?? 30);
            $branch_id = absint($_REQUEST['branch_id'] ?? 0);
            if (!$staff_id || !$date) {
                self::fail('staff_id and date are required.');
            }
            $query['staffId'] = $staff_id;
            $query['date'] = $date;
            $query['duration'] = max(30, $duration);
            if ($branch_id) {
                $query['branchId'] = $branch_id;
            }
        }

        $url = $api_base . '/' . $action . '?' . http_build_query($query);
        $response = wp_remote_get($url, [
            'timeout' => 25,
            'headers' => ['Accept' => 'application/json'],
        ]);

        self::relay($response);
    }

    private static function proxy_book($api_base) {
        $raw = file_get_contents('php://input');
        $body = json_decode($raw, true);
        if (!is_array($body)) {
            $body = [
                'branch_id'     => absint($_POST['branch_id'] ?? 0),
                'service_id'    => absint($_POST['service_id'] ?? 0),
                'service_ids'   => isset($_POST['service_ids']) ? (array) $_POST['service_ids'] : [],
                'staff_id'      => absint($_POST['staff_id'] ?? 0),
                'customer_name' => sanitize_text_field(wp_unslash($_POST['customer_name'] ?? '')),
                'phone'         => sanitize_text_field(wp_unslash($_POST['phone'] ?? '')),
                'email'         => sanitize_email(wp_unslash($_POST['email'] ?? '')),
                'date'          => sanitize_text_field(wp_unslash($_POST['date'] ?? '')),
                'time'          => sanitize_text_field(wp_unslash($_POST['time'] ?? '')),
                'notes'         => sanitize_textarea_field(wp_unslash($_POST['notes'] ?? '')),
            ];
        }

        $payload = [
            'branch_id'     => absint($body['branch_id'] ?? 0),
            'staff_id'      => absint($body['staff_id'] ?? 0),
            'customer_name' => sanitize_text_field($body['customer_name'] ?? ''),
            'phone'         => sanitize_text_field($body['phone'] ?? ''),
            'email'         => sanitize_email($body['email'] ?? ''),
            'date'          => sanitize_text_field($body['date'] ?? ''),
            'time'          => sanitize_text_field($body['time'] ?? ''),
            'notes'         => sanitize_textarea_field($body['notes'] ?? ''),
        ];

        if (!empty($body['service_ids']) && is_array($body['service_ids'])) {
            $payload['service_ids'] = array_values(array_map('absint', $body['service_ids']));
        } else {
            $payload['service_id'] = absint($body['service_id'] ?? 0);
        }

        $response = wp_remote_post(untrailingslashit($api_base) . '/bookings', [
            'timeout' => 30,
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept'       => 'application/json',
            ],
            'body' => wp_json_encode($payload),
        ]);

        self::relay($response);
    }

    private static function relay($response) {
        if (is_wp_error($response)) {
            self::fail($response->get_error_message());
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        $raw  = wp_remote_retrieve_body($response);
        $data = json_decode($raw, true);
        if ($data === null && $raw !== '' && $raw !== 'null') {
            $data = ['message' => $raw];
        }

        if ($code < 200 || $code >= 300) {
            $msg = is_array($data) ? ($data['message'] ?? 'Request failed') : 'Request failed';
            self::fail($msg, $code);
        }

        wp_send_json_success($data === null ? [] : $data);
    }

    private static function fail($message, $code = 400) {
        wp_send_json_error(['message' => $message], max(400, (int) $code));
    }
}
