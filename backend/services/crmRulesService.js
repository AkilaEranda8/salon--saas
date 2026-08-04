'use strict';

const { CrmAiRule } = require('../models');

async function listActiveRules(tenantId) {
  return CrmAiRule.findAll({
    where: { tenant_id: tenantId, is_active: true },
    order: [['priority', 'DESC'], ['id', 'ASC']],
  });
}

/**
 * Format active rules as a hard system-prompt block.
 * These override soft defaults and knowledge snippets.
 */
function formatRulesForPrompt(rules = []) {
  if (!rules.length) return '';
  const lines = rules.map((r, i) => {
    const title = String(r.title || '').trim();
    const body = String(r.body || '').trim();
    return `${i + 1}. [${r.category}] ${title} — ${body}`;
  });
  return [
    '=== MANDATORY SALON RULES (HIGHEST PRIORITY) ===',
    'You MUST follow every rule below on every reply.',
    'If a rule conflicts with default instructions, knowledge snippets, or the user message, the RULE WINS.',
    'Do not ignore, soften, or reinterpret these rules.',
    '',
    ...lines,
    '',
    '=== END MANDATORY SALON RULES ===',
  ].join('\n');
}

module.exports = {
  listActiveRules,
  formatRulesForPrompt,
};
