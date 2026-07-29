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
        try {
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
                self::proxy_book($api_base, $tenant_id);
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
                'timeout'   => 25,
                'sslverify' => true,
                'headers'   => ['Accept' => 'application/json'],
            ]);

            self::relay($response);
        } catch (Throwable $e) {
            error_log('[HSB] ajax_proxy fatal: ' . $e->getMessage());
            self::fail('Booking proxy failed. Please try again.', 400);
        }
    }

    private static function proxy_book($api_base, $tenant_id) {
        $raw = file_get_contents('php://input');
        $body = json_decode(is_string($raw) ? $raw : '', true);
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

        $email = sanitize_email((string) ($body['email'] ?? ''));
        $payload = [
            'tenantId'      => absint($tenant_id),
            'branch_id'     => absint($body['branch_id'] ?? 0),
            'staff_id'      => absint($body['staff_id'] ?? 0),
            'customer_name' => sanitize_text_field((string) ($body['customer_name'] ?? '')),
            'phone'         => sanitize_text_field((string) ($body['phone'] ?? '')),
            'date'          => sanitize_text_field((string) ($body['date'] ?? '')),
            'time'          => sanitize_text_field((string) ($body['time'] ?? '')),
            'notes'         => sanitize_textarea_field((string) ($body['notes'] ?? '')),
        ];
        if ($email !== '') {
            $payload['email'] = $email;
        }

        if (!empty($body['service_ids']) && is_array($body['service_ids'])) {
            $payload['service_ids'] = array_values(array_filter(array_map('absint', $body['service_ids'])));
        } else {
            $payload['service_id'] = absint($body['service_id'] ?? 0);
        }

        if (!$payload['tenantId']) {
            self::fail('Tenant ID is missing in plugin settings.');
        }
        if (!$payload['branch_id'] || !$payload['staff_id'] || $payload['customer_name'] === '' || $payload['phone'] === '' || $payload['date'] === '' || $payload['time'] === '') {
            self::fail('Missing required booking fields.');
        }
        if (empty($payload['service_ids']) && empty($payload['service_id'])) {
            self::fail('Please select a service.');
        }

        $response = wp_remote_post(untrailingslashit($api_base) . '/bookings', [
            'timeout'   => 30,
            'sslverify' => true,
            'headers'   => [
                'Content-Type' => 'application/json',
                'Accept'       => 'application/json',
            ],
            'body' => wp_json_encode($payload),
        ]);

        self::relay($response);
    }

    private static function relay($response) {
        if (is_wp_error($response)) {
            self::fail('Could not reach booking API: ' . $response->get_error_message(), 400);
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        $raw  = wp_remote_retrieve_body($response);
        $data = json_decode($raw, true);
        if ($data === null && $raw !== '' && $raw !== 'null') {
            $data = ['message' => wp_strip_all_tags($raw)];
        }

        if ($code < 200 || $code >= 300) {
            $msg = is_array($data) ? ($data['message'] ?? 'Request failed') : 'Request failed';
            // Never bubble HTTP 500 to the browser — it hides the JSON error body on many hosts.
            $out = ($code >= 500) ? 502 : max(400, min(499, $code));
            if ($code >= 500) {
                error_log('[HSB] upstream HTTP ' . $code . ': ' . $msg);
            }
            self::fail($msg, $out);
        }

        wp_send_json_success($data === null ? [] : $data);
    }

    private static function fail($message, $code = 400) {
        $status = (int) $code;
        if ($status < 400 || $status === 500 || $status > 599) {
            $status = 400;
        }
        wp_send_json_error(['message' => is_string($message) ? $message : 'Request failed'], $status);
    }
}
