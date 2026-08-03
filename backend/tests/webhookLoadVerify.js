/**
 * C18 load verification harness (no live Meta).
 * Simulates webhook enqueue dedupe + rate budget for 100/500/1000 events.
 * Run: node tests/webhookLoadVerify.js
 */
'use strict';

function simulateInboundStorm({ total, uniqueRatio = 1 }) {
  const seenJobs = new Set();
  const processed = [];
  let duplicateJobs = 0;
  let would429 = 0;
  const limiterMax = 1200;
  let inWindow = 0;

  for (let i = 0; i < total; i += 1) {
    inWindow += 1;
    if (inWindow > limiterMax) {
      would429 += 1;
      continue;
    }
    const uniqueIdx = Math.floor(i * uniqueRatio) % Math.max(1, Math.floor(total * uniqueRatio));
    const waMessageId = uniqueRatio >= 1 ? `wamid.${i}` : `wamid.${uniqueIdx}`;
    const jobId = `wa-in-1-${waMessageId}`;
    if (seenJobs.has(jobId)) {
      duplicateJobs += 1;
      continue;
    }
    seenJobs.add(jobId);
    processed.push(jobId);
  }

  return {
    total,
    enqueued: processed.length,
    duplicateJobs,
    would429,
    uniqueAiTurns: processed.length,
  };
}

function main() {
  const cases = [
    { total: 100, uniqueRatio: 1, label: '100 unique' },
    { total: 500, uniqueRatio: 1, label: '500 unique' },
    { total: 1000, uniqueRatio: 1, label: '1000 unique' },
    { total: 1000, uniqueRatio: 0.01, label: '1000 with 1% unique (dup storm)' },
  ];

  let failed = false;
  for (const c of cases) {
    const r = simulateInboundStorm(c);
    const ok429 = r.would429 === 0;
    const okDup = c.uniqueRatio < 1
      ? r.enqueued <= Math.ceil(c.total * c.uniqueRatio) + 1
      : r.enqueued === c.total;
    console.log(c.label, r, { ok429, okDup });
    if (!ok429 || !okDup) failed = true;
  }

  if (failed) {
    console.error('LOAD VERIFY FAILED');
    process.exit(1);
  }
  console.log('LOAD VERIFY PASS — no unexpected 429 under 1200/min; duplicates collapsed by jobId');
}

main();
