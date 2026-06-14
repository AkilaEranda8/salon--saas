/**
 * NVIDIA NIM LLM Service (Node.js)
 * Model: meta/llama-3.3-70b-instruct
 * Uses built-in https — no extra dependencies.
 */
const https = require('https');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const MODEL          = 'meta/llama-3.3-70b-instruct';

function isAvailable() {
  return Boolean(NVIDIA_API_KEY);
}

/**
 * Low-level call to NVIDIA NIM chat completions.
 * @param {Array}  messages   OpenAI-format messages array
 * @param {number} maxTokens
 * @returns {Promise<string|null>}
 */
function nimCall(messages, maxTokens = 400) {
  if (!NVIDIA_API_KEY) return Promise.resolve(null);

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.35,
      max_tokens: maxTokens,
      stream: false,
    });

    const options = {
      hostname: 'integrate.api.nvidia.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed.choices?.[0]?.message?.content?.trim() || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(30000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

/**
 * Generate a suggested reply for a support ticket thread.
 * @param {{ subject: string, description: string }} ticket
 * @param {Array<{ message: string, is_internal: boolean, author?: { name: string } }>} replies
 * @returns {Promise<string|null>}
 */
async function suggestReply(ticket, replies) {
  const history = (replies || [])
    .filter((r) => !r.is_internal)
    .map((r) => {
      const who = r.author?.name || r.author?.username || 'User';
      return `${who}: ${r.message}`;
    })
    .join('\n');

  const context = [
    `Subject: ${ticket.subject}`,
    `Initial message: ${ticket.description || '(none)'}`,
    history ? `\nConversation:\n${history}` : '',
  ].join('\n').trim();

  const messages = [
    {
      role: 'system',
      content: `You are a professional support agent for Hexaone, a cloud-based salon management SaaS.
Write a helpful, concise reply to the support ticket below.
- Be polite and solution-focused
- Keep it under 120 words
- Start the reply directly (no "Dear" salutations)
- If the issue is unclear, ask for clarification`,
    },
    {
      role: 'user',
      content: `${context}\n\nWrite a support reply:`,
    },
  ];

  return nimCall(messages, 300);
}

/**
 * Auto-classify a ticket into priority + category.
 * @param {string} subject
 * @param {string} description
 * @returns {Promise<{ priority: string, category: string, reason: string }|null>}
 */
async function classifyTicket(subject, description) {
  const messages = [
    {
      role: 'system',
      content: `You are a support ticket classifier for Hexaone SaaS.
Given a ticket subject and description, return ONLY valid JSON (no markdown, no extra text):
{
  "priority": "<low|medium|high|urgent>",
  "category": "<technical|billing|account|feature|other>",
  "reason": "<one sentence explanation>"
}`,
    },
    {
      role: 'user',
      content: `Subject: ${subject}\nDescription: ${description || '(none)'}`,
    },
  ];

  const raw = await nimCall(messages, 150);
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const obj = JSON.parse(cleaned);
    const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
    const CATEGORIES = ['technical', 'billing', 'account', 'feature', 'other'];
    return {
      priority: PRIORITIES.includes(obj.priority) ? obj.priority : 'medium',
      category: CATEGORIES.includes(obj.category) ? obj.category : 'other',
      reason:   String(obj.reason || '').trim(),
    };
  } catch {
    return null;
  }
}

module.exports = { isAvailable, suggestReply, classifyTicket };
