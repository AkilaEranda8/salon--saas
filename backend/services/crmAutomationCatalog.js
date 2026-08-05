'use strict';

/**
 * Default CRM automation catalogue (seeded per tenant).
 * Existing reminder/abandoned runners are wrapped — not duplicated.
 */
const AUTOMATION_CATALOG = [
  {
    type: 'appointment_reminder',
    name: 'Appointment Reminder',
    description: 'Remind customers before their appointment (reuses CRM day-before / near-time jobs).',
    trigger: 'appointment_upcoming',
    channel: 'whatsapp',
    delay: '1_day',
    schedule: null,
    enabled: true,
    settings_json: {
      reminder_options: ['1_day', '2_hours'],
      channels: ['whatsapp', 'sms', 'email'],
      template:
        'Reminder: Hi {{name}}, you have {{service}} on {{date}} at {{time}} with {{staff}}. Reply if you need to reschedule.',
    },
  },
  {
    type: 'welcome_message',
    name: 'Welcome Message',
    description: 'Greet new customers after registration.',
    trigger: 'customer_registration',
    channel: 'whatsapp',
    delay: null,
    schedule: null,
    enabled: false,
    settings_json: {
      template:
        'Welcome to {{salon}}, {{name}}! 👋 We are glad you joined us. Reply *book* to schedule your first visit.',
    },
  },
  {
    type: 'birthday_wishes',
    name: 'Birthday Wishes',
    description: 'Send birthday wishes (and optional coupon) at 09:00.',
    trigger: 'customer_birthday',
    channel: 'whatsapp',
    delay: null,
    schedule: '09:00',
    enabled: false,
    settings_json: {
      coupon_code: null,
      template:
        'Happy Birthday {{name}}! 🎂 From all of us at {{salon}}. {{coupon}} Have a wonderful day!',
    },
  },
  {
    type: 'review_request',
    name: 'Review Request',
    description: 'Ask for a review after an appointment is completed.',
    trigger: 'appointment_completed',
    channel: 'whatsapp',
    delay: '2_hours',
    schedule: null,
    enabled: false,
    settings_json: {
      delay_options: ['2_hours', '6_hours', '24_hours'],
      template:
        'Hi {{name}}, thanks for visiting {{salon}}! How was your {{service}}? We would love a quick review: {{review_link}}',
    },
  },
  {
    type: 'rebooking_reminder',
    name: 'Rebooking Reminder',
    description: 'Nudge customers who have not visited in a while.',
    trigger: 'customer_inactive',
    channel: 'whatsapp',
    delay: '60_days',
    schedule: null,
    enabled: false,
    settings_json: {
      inactive_options: ['30_days', '60_days', '90_days'],
      template:
        'Hi {{name}}, we miss you at {{salon}}! It has been a while — reply *book* to reserve your next visit.',
    },
  },
  {
    type: 'abandoned_booking',
    name: 'Abandoned Booking',
    description: 'Follow up when a WhatsApp booking was started but not completed (reuses CRM abandoned nudges).',
    trigger: 'booking_started_incomplete',
    channel: 'whatsapp',
    delay: '2_hours',
    schedule: null,
    enabled: true,
    settings_json: {
      delay_options: ['30_minutes', '2_hours', '24_hours'],
      template:
        'Hi{{name}}! Still want to book with us? Reply *book* and I will help you finish in a minute.',
    },
  },
  {
    type: 'promotional_campaign',
    name: 'Promotional Campaign',
    description: 'Manual / scheduled promo to a customer segment.',
    trigger: 'manual',
    channel: 'whatsapp',
    delay: null,
    schedule: null,
    enabled: false,
    settings_json: {
      segment: 'all',
      segment_options: ['all', 'vip', 'inactive', 'loyalty', 'by_service'],
      service_id: null,
      scheduled_at: null,
      template:
        'Hi {{name}}! Special offer from {{salon}}: {{offer}}. Reply *book* to claim it.',
    },
  },
];

function interpolate(template, vars = {}) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

module.exports = {
  AUTOMATION_CATALOG,
  interpolate,
};
