'use strict';

const { postJournal } = require('./journal');

async function postFromSource({
  tenantId,
  sourceType,
  sourceId,
  date,
  memo,
  lines,
  userId = null,
  transaction = null,
}) {
  return postJournal({
    tenantId,
    date,
    memo,
    lines,
    userId,
    sourceType,
    sourceId,
    transaction,
  });
}

module.exports = { postFromSource };
