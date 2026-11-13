'use strict';

/**
 * Owner-ticked AI access grants for WhatsApp AI CRM.
 * Required grants must all be true before AI replies are generated.
 */

const ACCESS_CATALOG = [
  {
    key: 'whatsapp_messaging',
    group: 'Required',
    required: true,
    title: 'WhatsApp messaging',
    description: 'Allow the system to receive inbound WhatsApp chats and send AI/staff replies from the linked salon number.',
  },
  {
    key: 'ai_replies',
    group: 'Required',
    required: true,
    title: 'AI-generated replies',
    description: 'Allow Gemini/OpenAI to draft customer replies for this salon using your saved API key.',
  },
  {
    key: 'salon_catalogue',
    group: 'Required',
    required: true,
    title: 'Services, prices & packages',
    description: 'Allow AI to read this salon’s services, prices, packages, and offers when answering customers.',
  },
  {
    key: 'staff_availability',
    group: 'Operations',
    required: false,
    title: 'Staff & availability',
    description: 'Allow AI to check staff schedules and open slots for booking guidance.',
  },
  {
    key: 'appointments',
    group: 'Operations',
    required: false,
    title: 'Appointments (book / change)',
    description: 'Allow AI to create, reschedule, or cancel appointments when the customer asks.',
  },
  {
    key: 'customer_profiles',
    group: 'Operations',
    required: false,
    title: 'Customer profiles',
    description: 'Allow AI to recognize returning customers by WhatsApp phone and use basic profile context.',
  },
  {
    key: 'knowledge_base',
    group: 'Content',
    required: false,
    title: 'Knowledge base & FAQs',
    description: 'Allow AI to answer from articles and policies you published for this salon.',
  },
  {
    key: 'automations',
    group: 'Content',
    required: false,
    title: 'Automations & reminders',
    description: 'Allow CRM automations and reminders to send WhatsApp messages on behalf of this salon.',
  },
  {
    key: 'human_handoff',
    group: 'Control',
    required: false,
    title: 'Human handoff',
    description: 'Allow AI to escalate angry or complex chats to your Inbox for a staff member.',
  },
];

const ALL_KEYS = ACCESS_CATALOG.map((r) => r.key);
const REQUIRED_KEYS = ACCESS_CATALOG.filter((r) => r.required).map((r) => r.key);

function normalizeGrants(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const key of ALL_KEYS) {
    out[key] = src[key] === true;
  }
  return out;
}

function mergeGrants(existing, patch) {
  const base = normalizeGrants(existing);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  for (const key of ALL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      base[key] = patch[key] === true;
    }
  }
  return base;
}

function requiredGranted(grants) {
  const g = normalizeGrants(grants);
  return REQUIRED_KEYS.every((k) => g[k] === true);
}

function missingRequired(grants) {
  const g = normalizeGrants(grants);
  return REQUIRED_KEYS.filter((k) => !g[k]);
}

module.exports = {
  ACCESS_CATALOG,
  ALL_KEYS,
  REQUIRED_KEYS,
  normalizeGrants,
  mergeGrants,
  requiredGranted,
  missingRequired,
};
