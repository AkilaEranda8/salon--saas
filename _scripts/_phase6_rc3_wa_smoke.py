"""
Phase 6 RC3 — Authorized Tenant 28 WhatsApp smoke (test number only).

Authorization: RC3 live WhatsApp test kard
Phone: 94705800063 (Larvendo T28 test number only)
No ordinary customers. No code deploy/restart in this script.
"""
from __future__ import annotations

import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

ROOT = Path(r"e:\salon_v1")
OUT = ROOT / "_scripts" / "_phase6_rc3_wa_smoke_evidence.json"
REPORT = ROOT / "docs" / "PHASE6_RC3_WA_SMOKE_REPORT.md"
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
PHONE_MASK = "947***0063"

JS_HARNESS = r"""
process.chdir('/app');
const fs = require('fs');
const { Op } = require('sequelize');
const {
  Tenant, CrmConversation, CrmMessage, WhatsAppConnection,
} = require('/app/models');
const { enqueue, QUEUE_NAMES } = require('/app/services/queue');

const TENANT_ID = 28;
const PHONE = '94705800063';
const OUT = '/app/_phase6_rc3_wa_smoke_out.json';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function sanitize(text) {
  let t = String(text || '');
  t = t.replace(/AIza[0-9A-Za-z\-_]{10,}/g, '[REDACTED]');
  t = t.replace(/AQ\.[0-9A-Za-z\-_]{10,}/g, '[REDACTED]');
  t = t.replace(/\b94\d{9}\b/g, (m) => m === PHONE ? '947***0063' : '94*********');
  return t.slice(0, 700);
}

function amounts(text) {
  const out = [];
  const re = /(?:rs\.?|lkr|රු\.?)\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})/gi;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    out.push(parseInt(m[1].replace(/,/g, ''), 10));
  }
  return out;
}

async function ensureConv(tenantId) {
  let conv = await CrmConversation.findOne({
    where: {
      tenant_id: tenantId,
      [Op.or]: [
        { phone: PHONE },
        { phone: { [Op.like]: '%705800063%' } },
      ],
    },
    order: [['id', 'DESC']],
  });
  if (!conv) {
    conv = await CrmConversation.create({
      tenant_id: tenantId,
      phone: PHONE,
      channel: 'whatsapp',
      status: 'ai_active',
      ai_turn_state: 'pending',
    });
  } else {
    await conv.update({ status: 'ai_active', handoff_reason: null, ai_turn_state: 'pending' });
  }
  return conv.reload();
}

async function latestOutbound(tenantId, conversationId, afterId) {
  const where = {
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction: 'outbound',
  };
  if (afterId) where.id = { [Op.gt]: afterId };
  return CrmMessage.findOne({ where, order: [['id', 'DESC']] });
}

async function lastMsgId(tenantId, conversationId) {
  const m = await CrmMessage.findOne({
    where: { tenant_id: tenantId, conversation_id: conversationId },
    order: [['id', 'DESC']],
  });
  return m ? m.id : 0;
}

async function sendInbound(tenantId, conv, message) {
  const beforeId = await lastMsgId(tenantId, conv.id);
  const waMessageId = `p6-rc3-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await enqueue(QUEUE_NAMES.WA_INBOUND_AI, {
    tenantId,
    tenant_id: tenantId,
    phone: PHONE,
    message,
    waMessageId,
    conversationId: conv.id,
    channel: 'qr',
  }, {
    name: 'inbound-turn',
    jobId: `wa-in-p6-${tenantId}-${waMessageId}`,
  });
  let reply = null;
  for (let i = 0; i < 45; i++) {
    await sleep(1500);
    reply = await latestOutbound(tenantId, conv.id, beforeId);
    if (reply && String(reply.body || '').trim()) break;
  }
  await conv.reload();
  return {
    waMessageId,
    beforeId,
    replyId: reply ? reply.id : null,
    replyBody: reply ? sanitize(reply.body) : null,
    amounts: amounts(reply ? reply.body : ''),
    convStatus: conv.status,
    handoffReason: conv.handoff_reason || null,
    correlation: { conversationId: conv.id, waMessageId, replyMessageId: reply ? reply.id : null },
  };
}

function judge(expect, result) {
  const body = (result.replyBody || '').toLowerCase();
  const amts = result.amounts || [];
  let pass = !!result.replyBody;
  const notes = [];
  if (expect.requireReply && !result.replyBody) {
    pass = false;
    notes.push('no_outbound_reply');
  }
  if (expect.mustIncludeAny && expect.mustIncludeAny.length) {
    const hit = expect.mustIncludeAny.some((k) => body.includes(String(k).toLowerCase()));
    if (!hit) { pass = false; notes.push('missing_expected_cue'); }
  }
  if (expect.mustIncludeAll) {
    for (const k of expect.mustIncludeAll) {
      if (!body.includes(String(k).toLowerCase())) {
        pass = false;
        notes.push('missing_all:' + k);
      }
    }
  }
  if (expect.forbidAny) {
    for (const k of expect.forbidAny) {
      if (body.includes(String(k).toLowerCase())) {
        pass = false;
        notes.push('forbid:' + k);
      }
    }
  }
  if (expect.amountExact != null) {
    if (!amts.includes(expect.amountExact)) {
      pass = false;
      notes.push('missing_amount_' + expect.amountExact);
    }
  }
  if (expect.forbidAmounts) {
    for (const a of expect.forbidAmounts) {
      if (amts.includes(a)) {
        pass = false;
        notes.push('forbid_amount_' + a);
      }
    }
  }
  if (expect.expectQueued) {
    if (!['queued', 'human_active'].includes(String(result.convStatus || ''))) {
      pass = false;
      notes.push('not_queued_status:' + result.convStatus);
    }
  }
  if (expect.forbidDeliveredClaim) {
    if (/gihilla thiyenawa|already delivered|message was delivered|message is with our team already/i.test(body)
        && /request|queue|queued|danawa|connecting|notify/i.test(body) === false
        && expect.expectQueued) {
      // soft: allow queue-confirmed wording after backend queues
    }
    if (/\balready delivered\b|\bdelivered to (?:the )?team\b/i.test(body)) {
      pass = false;
      notes.push('false_delivered_claim');
    }
  }
  return { pass, notes, status: pass ? 'PASS' : 'FAIL' };
}

(async () => {
  const report = {
    mode: 'phase6_rc3_production_wa_smoke',
    authorization: 'RC3 live WhatsApp test kard',
    rc: 'phase6_t28_rc3',
    tenantId: TENANT_ID,
    phone_masked: '947***0063',
    started_utc: new Date().toISOString(),
    scenarios: [],
    stopped_early: false,
    critical_stop: null,
  };

  const tenant = await Tenant.findByPk(TENANT_ID);
  if (!tenant) {
    report.error = 'tenant_28_missing';
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: false, error: report.error }));
    process.exit(1);
  }
  report.tenant = { id: tenant.id, slug: tenant.slug, name: sanitize(tenant.name) };

  const wa = await WhatsAppConnection.findOne({ where: { tenant_id: TENANT_ID }, order: [['id', 'DESC']] });
  report.whatsapp_session = wa ? {
    id: wa.id,
    status: wa.status || wa.connection_status || wa.state || null,
    tenant_id: wa.tenant_id,
  } : null;

  const conv = await ensureConv(TENANT_ID);
  if (Number(conv.tenant_id) !== TENANT_ID) {
    report.error = 'conversation_tenant_mismatch';
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: false, error: report.error }));
    process.exit(2);
  }
  report.conversation = { id: conv.id, tenant_id: conv.tenant_id, phone_masked: '947***0063' };

  const scenarios = [
    {
      id: 1,
      name: 'haircut_layer_butterfly_multi',
      message: 'Mata hair cut options ona. Layer Cut saha Butterfly Cut thiyenawada? Price saha duration kiyanna.',
      expect: {
        requireReply: true,
        amountExact: 4500,
        forbidAmounts: [3500],
        mustIncludeAny: ['butterfly', '4,500', '4500'],
        // Layer should be clarified as not separately listed / stylist
        mustIncludeAll: [],
      },
      alsoExpectAny: ['layer', 'stylist', 'confirm', 'list', 'separate', 'naha', 'නැ', 'not listed', 'catalogue'],
      criticalPricing: true,
    },
    {
      id: 2,
      name: 'butterfly_not_ladies_3500',
      message: 'Butterfly Cut price kiyada?',
      expect: {
        requireReply: true,
        amountExact: 4500,
        forbidAmounts: [3500],
        mustIncludeAny: ['butterfly', '4500', '4,500'],
      },
      criticalPricing: true,
    },
    {
      id: 3,
      name: 'facial_options_distinct',
      message: 'What facial options do you have?',
      expect: {
        requireReply: true,
        mustIncludeAny: ['facial', 'hydra', 'normal', 'cleanup', 'clean-up', 'umecare', 'jovis', 'oxy'],
        forbidAny: ['ladies hair cut-butterfly'],
      },
    },
    {
      id: 4,
      name: 'location_verified_kandy',
      message: 'Salon eka koheda? Address saha phone number kiyanna.',
      expect: {
        requireReply: true,
        mustIncludeAny: ['kandy', 'gopallawa', '081', '254', 'larvendo', 'william'],
        forbidAny: ['colombo fort', 'galle face invented'],
      },
    },
    {
      id: 5,
      name: 'opening_hours',
      message: 'Opening hours kiyada?',
      expect: {
        requireReply: true,
        mustIncludeAny: ['open', 'hour', 'close', 'wela', 'විවෘත', 'team', 'confirm', 'branch', 'today'],
      },
    },
    {
      id: 6,
      name: 'multi_question_one_message',
      message: 'Koheda? Butterfly Cut price? Facial options thiyenawada?',
      expect: {
        requireReply: true,
        mustIncludeAny: ['kandy', 'gopallawa', '081', 'butterfly', '4500', '4,500', 'facial'],
        forbidAmounts: [3500],
      },
      criticalPricing: true,
    },
    {
      id: 7,
      name: 'sir_madam_no_aniwa',
      message: 'Call me Sir. Thank you.',
      expect: {
        requireReply: true,
        mustIncludeAny: ['sir', 'welcome', 'help', 'hari', 'thank'],
        forbidAny: ['aniwa', 'machan', 'bro'],
      },
    },
    {
      id: 8,
      name: 'topic_switch_haircut_to_location',
      steps: [
        { message: 'Mata hair cut ekak oni' },
        {
          message: 'Koheda salon eka?',
          expect: {
            requireReply: true,
            mustIncludeAny: ['kandy', 'gopallawa', '081', 'address', 'larvendo', '254'],
          },
        },
      ],
    },
    {
      id: 9,
      name: 'keratin_shoulder_regression',
      message: 'Keratin shoulder price?',
      expect: {
        requireReply: true,
        amountExact: 25000,
        forbidAmounts: [15000],
        mustIncludeAny: ['25000', '25,000', 'keratin'],
      },
      criticalPricing: true,
    },
    {
      id: 10,
      name: 'human_handoff_then_faq',
      steps: [
        {
          message: 'I want to speak to a staff member please',
          expect: {
            requireReply: true,
            mustIncludeAny: ['team', 'staff', 'request', 'moment', 'contact', 'queue', 'member'],
            forbidDeliveredClaim: true,
            expectQueued: true,
          },
        },
        {
          message: 'Koheda?',
          expect: {
            requireReply: true,
            mustIncludeAny: ['kandy', 'gopallawa', '081', '254', 'larvendo', 'address'],
          },
        },
      ],
    },
    {
      id: 11,
      name: 'sinhala_butterfly',
      resetAi: true,
      message: 'Butterfly Cut මිල කීයද?',
      expect: {
        requireReply: true,
        amountExact: 4500,
        forbidAmounts: [3500],
        mustIncludeAny: ['4500', '4,500', 'butterfly'],
      },
      criticalPricing: true,
    },
  ];

  let critical = null;

  for (const sc of scenarios) {
    if (critical) break;
    const entry = {
      id: sc.id,
      name: sc.name,
      started_utc: new Date().toISOString(),
      status: 'BLOCKED',
      expected: sc.expect || sc.steps,
      actual: {},
      sanitized: {},
      severity: null,
    };

    try {
      if (sc.resetAi) {
        await conv.update({ status: 'ai_active', handoff_reason: null });
        await sleep(1000);
      }

      if (sc.steps) {
        const stepResults = [];
        for (const step of sc.steps) {
          const res = await sendInbound(TENANT_ID, conv, step.message);
          const j = step.expect ? judge(step.expect, res) : { pass: !!res.replyBody, notes: [], status: res.replyBody ? 'PASS' : 'FAIL' };
          stepResults.push({
            inbound: sanitize(step.message),
            outbound: res.replyBody,
            amounts: res.amounts,
            convStatus: res.convStatus,
            handoffReason: res.handoffReason,
            judge: j,
            correlation: res.correlation,
          });
          await sleep(2500);
        }
        entry.sanitized = { steps: stepResults };
        entry.actual = { steps: stepResults };
        const allPass = stepResults.every((s) => s.judge.pass);
        entry.status = allPass ? 'PASS' : 'FAIL';
        entry.actual.notes = stepResults.flatMap((s) => s.judge.notes || []);
        if (!allPass && sc.name.includes('handoff')) {
          entry.severity = 'HIGH';
        }
      } else {
        const res = await sendInbound(TENANT_ID, conv, sc.message);
        let j = judge(sc.expect, res);
        if (sc.alsoExpectAny && sc.alsoExpectAny.length) {
          const body = (res.replyBody || '').toLowerCase();
          const hit = sc.alsoExpectAny.some((k) => body.includes(String(k).toLowerCase()));
          if (!hit) {
            j = { pass: false, notes: [...(j.notes || []), 'missing_layer_clarify_cue'], status: 'FAIL' };
          }
        }
        entry.sanitized = {
          inbound: sanitize(sc.message),
          outbound: res.replyBody,
          amounts: res.amounts,
          convStatus: res.convStatus,
          handoffReason: res.handoffReason,
          correlation: res.correlation,
        };
        entry.actual = { ...entry.sanitized, notes: j.notes };
        entry.status = j.status;
        if (!j.pass && sc.criticalPricing) {
          entry.severity = 'CRITICAL_PRICING';
          critical = sc.name + ':' + j.notes.join(',');
        }
      }
    } catch (e) {
      entry.status = 'BLOCKED';
      entry.severity = 'HIGH';
      entry.actual = { error: String(e && e.message || e).slice(0, 200) };
    }

    entry.finished_utc = new Date().toISOString();
    report.scenarios.push(entry);
    console.log('SCENARIO', entry.id, entry.name, entry.status, entry.severity || '');
    if (critical) {
      report.stopped_early = true;
      report.critical_stop = critical;
      break;
    }
    await sleep(2500);
  }

  // leave test chat usable
  try {
    await conv.update({ status: 'ai_active', handoff_reason: null });
  } catch (_) {}

  report.finished_utc = new Date().toISOString();
  report.passed = report.scenarios.filter((s) => s.status === 'PASS').length;
  report.failed = report.scenarios.filter((s) => s.status === 'FAIL').length;
  report.blocked = report.scenarios.filter((s) => s.status === 'BLOCKED').length;
  report.total_run = report.scenarios.length;
  report.ok = report.failed === 0 && report.blocked === 0 && !report.stopped_early;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    passed: report.passed,
    failed: report.failed,
    blocked: report.blocked,
    total_run: report.total_run,
    stopped_early: report.stopped_early,
    critical_stop: report.critical_stop,
    out: OUT,
  }));
  process.exit(report.ok ? 0 : 10);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
"""


def connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    for pw in PASSWORDS:
        try:
            client.connect("46.62.135.100", username="root", password=pw, timeout=25)
            return client
        except Exception:
            continue
    raise SystemExit("SSH failed")


def write_report(data: dict) -> None:
    rows = []
    for s in data.get("scenarios") or []:
        out = ""
        if isinstance(s.get("sanitized"), dict):
            if s["sanitized"].get("outbound"):
                out = str(s["sanitized"]["outbound"])[:160].replace("\n", " ")
            elif s["sanitized"].get("steps"):
                last = s["sanitized"]["steps"][-1]
                out = str(last.get("outbound") or "")[:160].replace("\n", " ")
        rows.append(
            f"| {s.get('id')} | {s.get('name')} | **{s.get('status')}** | {out} |"
        )
    REPORT.write_text(
        "# Phase 6 RC3 — Production WhatsApp Smoke Report\n\n"
        f"**RC:** `phase6_t28_rc3`\n"
        f"**Authorization:** `RC3 live WhatsApp test kard`\n"
        f"**Test number:** `{PHONE_MASK}`\n"
        f"**Tenant:** 28\n"
        f"**Started (UTC):** {data.get('started_utc')}\n"
        f"**Finished (UTC):** {data.get('finished_utc')}\n"
        f"**Result:** {'PASS' if data.get('ok') else 'FAIL'}\n"
        f"**Passed / Failed / Blocked:** {data.get('passed')}/{data.get('failed')}/{data.get('blocked')}\n"
        f"**Stopped early:** {data.get('stopped_early')} ({data.get('critical_stop')})\n"
        f"**WA session:** {json.dumps(data.get('whatsapp_session'))}\n"
        f"**Conversation:** #{(data.get('conversation') or {}).get('id')}\n\n"
        "## Scenarios\n\n"
        "| # | Scenario | Status | Reply (sanitized snippet) |\n"
        "|---|----------|--------|---------------------------|\n"
        + "\n".join(rows)
        + "\n\n## Boundaries\n\n"
        "- Test number only (`947***0063`)\n"
        "- No ordinary customers\n"
        "- No code deploy/restart in smoke script\n"
        "- Evidence: `_scripts/_phase6_rc3_wa_smoke_evidence.json`\n",
        encoding="utf-8",
    )


def main() -> int:
    client = connect()
    print("SSH ok — Phase 6 RC3 WA smoke (test number only)")
    sftp = client.open_sftp()
    with sftp.file("/tmp/_phase6_rc3_wa_smoke.js", "w") as f:
        f.write(JS_HARNESS)
    sftp.close()

    cmd = (
        "docker cp /tmp/_phase6_rc3_wa_smoke.js xanesalon-backend-1:/app/_phase6_rc3_wa_smoke.js && "
        "cd /root/xanesalon && docker compose exec -T -w /app backend node /app/_phase6_rc3_wa_smoke.js"
    )
    print(">>> running harness")
    _, o, e = client.exec_command(cmd, timeout=1200)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    print(out[-9000:] if len(out) > 9000 else out)
    if err.strip():
        print(err[-2000:])

    _, o2, _ = client.exec_command(
        "docker exec xanesalon-backend-1 cat /app/_phase6_rc3_wa_smoke_out.json",
        timeout=60,
    )
    raw = o2.read().decode("utf-8", "replace")
    client.close()
    if not raw.strip():
        print("NO_EVIDENCE_FILE")
        return 1
    data = json.loads(raw)
    text = json.dumps(data, indent=2, ensure_ascii=False)
    text = re.sub(r"94705800063", PHONE_MASK, text)
    text = re.sub(r"AIza[0-9A-Za-z\-_]{10,}", "[REDACTED]", text)
    text = re.sub(r"AQ\.[0-9A-Za-z\-_]{10,}", "[REDACTED]", text)
    OUT.write_text(text, encoding="utf-8")
    write_report(data)
    print(json.dumps({
        "saved": str(OUT),
        "report": str(REPORT),
        "ok": data.get("ok"),
        "passed": data.get("passed"),
        "failed": data.get("failed"),
        "blocked": data.get("blocked"),
        "total_run": data.get("total_run"),
        "stopped_early": data.get("stopped_early"),
        "critical_stop": data.get("critical_stop"),
    }, indent=2))
    return 0 if data.get("ok") else 10


if __name__ == "__main__":
    raise SystemExit(main())
