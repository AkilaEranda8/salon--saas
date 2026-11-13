'use strict';

/**
 * GL failures must not fail the business operation (sale, expense, ...), but must
 * not vanish either. Logs with a code and returns a payload controllers can attach
 * to the response as `accounting_warning` / res.locals.accountingWarning.
 */
function buildAccountingWarning(action, err) {
  const code = err?.code || (err?.status ? `HTTP_${err.status}` : 'GL_POST_FAILED');
  const message = err?.message || 'Accounting entry failed.';
  console.warn(`[accounting] ${action} failed (${code}):`, message);
  return { code, action, message };
}

/** Record the warning on res.locals (when available) and return it. */
function recordAccountingWarning(res, action, err) {
  const warning = buildAccountingWarning(action, err);
  if (res) {
    res.locals = res.locals || {};
    res.locals.accountingWarning = warning;
  }
  return warning;
}

module.exports = { buildAccountingWarning, recordAccountingWarning };
