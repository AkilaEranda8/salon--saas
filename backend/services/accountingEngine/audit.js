'use strict';

async function writeAudit({ tenantId, actorId, action, entityType, entityId, meta, transaction }) {
  const { AcctAuditLog } = require('../../models');
  await AcctAuditLog.create({
    tenant_id: tenantId,
    actor_id: actorId || null,
    action,
    entity_type: entityType || null,
    entity_id: entityId != null ? String(entityId) : null,
    meta: meta || null,
  }, { transaction });
}

module.exports = { writeAudit };
