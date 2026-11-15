"""
Phase 5 — Authorized Tenant 28 WhatsApp smoke (test number only).

Authorization: APPROVED FOR WHATSAPP SMOKE ONLY
Phone: Larvendo test number used historically for T28 session clears (94705800063).
Does not message other customers. Does not restart/deploy/change code.
"""
from __future__ import annotations

import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

ROOT = Path(r"e:\salon_v1")
OUT = ROOT / "_scripts" / "_phase5_wa_smoke_evidence.json"
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
TEST_PHONE = "94705800063"
TENANT_ID = 28
PHONE_MASK = "947***0063"

# 1x1 jpeg
TINY_JPEG = (
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy"
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA"
    "AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEB"
    "AQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="
)

JS_HARNESS = r"""
process.chdir('/app');
const fs = require('fs');
const { Op } = require('sequelize');
const {
  Tenant, CrmConversation, CrmMessage, Appointment, WhatsAppConnection,
} = require('/app/models');
const { enqueue, QUEUE_NAMES } = require('/app/services/queue');

const TENANT_ID = 28;
const PHONE = '94705800063';
const OUT = '/app/_phase5_wa_smoke_out.json';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function sanitize(text) {
  let t = String(text || '');
  t = t.replace(/AIza[0-9A-Za-z\-_]{10,}/g, '[REDACTED]');
  t = t.replace(/AQ\.[0-9A-Za-z\-_]{10,}/g, '[REDACTED]');
  t = t.replace(/\b94\d{9}\b/g, (m) => m === PHONE ? '947***0063' : '94*********');
  return t.slice(0, 600);
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
  return conv;
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

async function sendInbound(tenantId, conv, message, opts = {}) {
  const beforeId = await lastMsgId(tenantId, conv.id);
  const waMessageId = opts.waMessageId || `p5-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    tenantId,
    tenant_id: tenantId,
    phone: PHONE,
    message,
    waMessageId,
    conversationId: conv.id,
    channel: 'qr',
  };
  if (opts.images) payload.images = opts.images;
  await enqueue(QUEUE_NAMES.WA_INBOUND_AI, payload, {
    name: 'inbound-turn',
    jobId: `wa-in-p5-${tenantId}-${waMessageId}`,
  });
  // poll for outbound
  let reply = null;
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    reply = await latestOutbound(tenantId, conv.id, beforeId);
    if (reply && String(reply.body || '').trim()) break;
  }
  return {
    waMessageId,
    beforeId,
    replyId: reply ? reply.id : null,
    replyBody: reply ? sanitize(reply.body) : null,
    replyMeta: reply && reply.meta ? {
      turn_state: reply.meta.turn_state || null,
      tools: Array.isArray(reply.meta.actions)
        ? reply.meta.actions.map((a) => a && a.tool).filter(Boolean).slice(0, 12)
        : undefined,
    } : null,
    amounts: amounts(reply ? reply.body : ''),
    correlation: { conversationId: conv.id, waMessageId, replyMessageId: reply ? reply.id : null },
  };
}

function judge(scenario, result) {
  const body = (result.replyBody || '').toLowerCase();
  const amts = result.amounts || [];
  const exp = scenario.expect;
  let pass = !!result.replyBody;
  let notes = [];
  if (exp.requireReply && !result.replyBody) {
    pass = false;
    notes.push('no_outbound_reply');
  }
  if (exp.mustIncludeAny && exp.mustIncludeAny.length) {
    const hit = exp.mustIncludeAny.some((k) => body.includes(String(k).toLowerCase()));
    if (!hit) { pass = false; notes.push('missing_expected_cue'); }
  }
  if (exp.forbidAny) {
    for (const k of exp.forbidAny) {
      if (body.includes(String(k).toLowerCase())) { pass = false; notes.push('forbid:' + k); }
    }
  }
  if (exp.amountExact != null) {
    if (!amts.includes(exp.amountExact)) { pass = false; notes.push('missing_amount_' + exp.amountExact); }
  }
  if (exp.forbidAmounts) {
    for (const a of exp.forbidAmounts) {
      if (amts.includes(a)) { pass = false; notes.push('forbid_amount_' + a); }
    }
  }
  if (exp.noAmounts && amts.length) { pass = false; notes.push('unexpected_amounts'); }
  if (exp.maxReplies != null) {
    // checked externally for duplicate scenario
  }
  return { pass, notes, status: pass ? 'PASS' : 'FAIL' };
}

(async () => {
  const report = {
    mode: 'phase5_production_wa_smoke',
    authorization: 'APPROVED FOR WHATSAPP SMOKE ONLY',
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

  // Verify phone ownership / association
  const conv = await ensureConv(TENANT_ID);
  if (Number(conv.tenant_id) !== TENANT_ID) {
    report.error = 'conversation_tenant_mismatch';
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: false, error: report.error }));
    process.exit(2);
  }
  report.conversation = { id: conv.id, tenant_id: conv.tenant_id, phone_masked: '947***0063' };
  report.phone_verified = {
    matches_test_number: true,
    tenant_id: TENANT_ID,
    conversation_id: conv.id,
  };

  const scenarios = [
    { id: 1, name: 'sinhala_conversation', message: 'ආයුබෝවන්, කෙරටින් ගැන කෙටියෙන් කියන්න', expect: { requireReply: true, mustIncludeAny: ['keratin', 'කෙරටින්', 'length', 'shoulder', 'treatment', 'මිල', 'දිග'] } },
    { id: 2, name: 'singlish_conversation', message: 'Keratin kiyada?', expect: { requireReply: true, mustIncludeAny: ['shoulder', 'bra', 'hip', 'length', 'kiyada', 'mila', 'keratin'], forbidAmounts: [15000] } },
    { id: 3, name: 'english_conversation', message: 'What facials do you offer?', expect: { requireReply: true, mustIncludeAny: ['facial', 'hydra', 'cleanup', 'service'] } },
    { id: 4, name: 'keratin_shoulder_25000', message: 'Keratin shoulder price?', expect: { requireReply: true, amountExact: 25000, forbidAmounts: [15000], mustIncludeAny: ['25000', '25,000', 'keratin'] } },
    { id: 5, name: 'galaxy_clarify', message: 'Galaxy Plasma Treatment price kiyada?', expect: { requireReply: true, noAmounts: false, forbidAmounts: [25000, 15000, 30000], mustIncludeAny: ['staff', 'confirm', 'verify', 'catalogue', 'exact', 'which', 'clarify', 'not sure', 'cannot', 'can\'t', 'team', 'list', 'galaxy'] } },
    { id: 6, name: 'butterfly_4500', message: 'Ladies Hair Cut-Butterfly price', expect: { requireReply: true, amountExact: 4500, forbidAmounts: [3500], mustIncludeAny: ['4500', '4,500', 'butterfly'] } },
    { id: 7, name: 'image_inquiry', message: '[Customer sent a photo of a hairstyle]', images: [{ mimeType: 'image/jpeg', dataBase64: 'TINY_JPEG_PLACEHOLDER' }], expect: { requireReply: true, mustIncludeAny: ['hair', 'style', 'photo', 'look', 'cut', 'colour', 'color', 'help', 'book', 'staff'] } },
    { id: 8, name: 'topic_switch_during_booking', steps: [
      { message: 'I want to book an appointment' },
      { message: '1' },
      { message: 'Facial mila?', expect: { requireReply: true, mustIncludeAny: ['facial', 'mila', 'price', 'rs', 'hydra', 'cleanup'] } },
    ]},
    { id: 9, name: 'booking_flow', steps: [
      { message: 'book appointment' },
      { message: '1' },
      { message: 'tomorrow' },
      { message: '10:00' },
      { message: 'Phase5 Smoke Test' },
      { message: 'yes', expectBooking: true },
    ]},
    { id: 10, name: 'cancellation', steps: [
      { message: 'cancel my appointment' },
      { message: 'yes', expectCancel: true },
    ]},
    { id: 11, name: 'human_handoff', message: 'I want to speak to a staff member please', expect: { requireReply: true, mustIncludeAny: ['staff', 'human', 'team', 'connect', 'handoff', 'agent'] } },
    { id: 12, name: 'duplicate_send_protection', duplicate: true, message: 'Hi' },
  ];

  // inject jpeg
  for (const s of scenarios) {
    if (s.images) {
      s.images[0].dataBase64 = process.env.TINY_JPEG || '';
    }
  }

  let critical = null;

  for (const sc of scenarios) {
    if (critical) break;
    const started = new Date().toISOString();
    const entry = {
      id: sc.id,
      name: sc.name,
      started_utc: started,
      status: 'BLOCKED',
      expected: sc.expect || sc.steps || { duplicate: true },
      actual: {},
      sanitized: {},
      severity: null,
    };

    try {
      if (sc.duplicate) {
        const beforeId = await lastMsgId(TENANT_ID, conv.id);
        const waId = `p5-dup-${Date.now()}`;
        const p1 = {
          tenantId: TENANT_ID, tenant_id: TENANT_ID, phone: PHONE,
          message: sc.message, waMessageId: waId, conversationId: conv.id, channel: 'qr',
        };
        await enqueue(QUEUE_NAMES.WA_INBOUND_AI, p1, { name: 'inbound-turn', jobId: `wa-in-p5-dup-a-${waId}` });
        await enqueue(QUEUE_NAMES.WA_INBOUND_AI, { ...p1 }, { name: 'inbound-turn', jobId: `wa-in-p5-dup-b-${waId}-2` });
        await sleep(12000);
        const outs = await CrmMessage.findAll({
          where: {
            tenant_id: TENANT_ID,
            conversation_id: conv.id,
            direction: 'outbound',
            id: { [Op.gt]: beforeId },
          },
          order: [['id', 'ASC']],
        });
        const bodies = outs.map((m) => sanitize(m.body));
        entry.actual = { outbound_count: outs.length, bodies };
        entry.sanitized = { outbound_count: outs.length, bodies };
        // Pass if at most 1 customer-facing distinct reply burst (allow 1)
        const pass = outs.length <= 1;
        entry.status = pass ? 'PASS' : 'FAIL';
        entry.severity = pass ? null : 'CRITICAL_DUPLICATE';
        if (!pass) critical = 'duplicate_customer_facing_replies';
      } else if (sc.steps) {
        const stepResults = [];
        let last = null;
        for (const step of sc.steps) {
          last = await sendInbound(TENANT_ID, conv, step.message, { images: step.images });
          stepResults.push({
            inbound: sanitize(step.message),
            outbound: last.replyBody,
            amounts: last.amounts,
            correlation: last.correlation,
          });
          await sleep(2000);
        }
        entry.sanitized = { steps: stepResults };
        entry.actual = { steps: stepResults };

        if (sc.name === 'booking_flow') {
          const appt = await Appointment.findOne({
            where: { tenant_id: TENANT_ID, phone: PHONE },
            order: [['id', 'DESC']],
          });
          const recent = await Appointment.findAll({
            where: { tenant_id: TENANT_ID },
            order: [['id', 'DESC']],
            limit: 12,
          });
          const match = recent.find((a) => {
            const blob = JSON.stringify(a.toJSON()).toLowerCase();
            return blob.includes('phase5') || blob.includes('705800063') || blob.includes(PHONE)
              || String(a.phone || '').includes('705800063');
          }) || appt;
          entry.actual.appointment = match ? {
            id: match.id,
            status: match.status,
            tenant_id: match.tenant_id,
          } : null;
          const okBook = !!(match && match.tenant_id === TENANT_ID && String(match.status || '').toLowerCase() !== 'cancelled');
          // booking success message only valid with DB proof
          const lastBody = (stepResults[stepResults.length - 1] || {}).outbound || '';
          const claimsSuccess = /confirm|booked|appointment|reserved|success/i.test(lastBody);
          let pass = true;
          let notes = [];
          if (claimsSuccess && !okBook) {
            pass = false;
            notes.push('false_booking_confirmation');
            entry.severity = 'CRITICAL_BOOKING';
            critical = 'false_booking_confirmation';
          } else if (!okBook) {
            // may still be awaiting slot — mark FAIL not critical if no false success
            pass = false;
            notes.push('no_appointment_row');
            entry.severity = 'HIGH';
          }
          entry.status = pass ? 'PASS' : 'FAIL';
          entry.actual.notes = notes;
        } else if (sc.name === 'cancellation') {
          const recent = await Appointment.findAll({
            where: { tenant_id: TENANT_ID },
            order: [['id', 'DESC']],
            limit: 10,
          });
          const match = recent.find((a) => {
            const blob = JSON.stringify(a.toJSON()).toLowerCase();
            return blob.includes('phase5') || blob.includes('705800063') || blob.includes(PHONE);
          });
          entry.actual.appointment = match ? { id: match.id, status: match.status, tenant_id: match.tenant_id } : null;
          const cancelled = match && /cancel/i.test(String(match.status || ''));
          const lastBody = (stepResults[stepResults.length - 1] || {}).outbound || '';
          const claimsCancel = /cancel/i.test(lastBody);
          let pass = true;
          if (claimsCancel && !cancelled) {
            pass = false;
            entry.severity = 'CRITICAL_CANCEL';
            critical = 'false_cancel_confirmation';
          } else if (!cancelled) {
            pass = false;
            entry.severity = 'HIGH';
            entry.actual.notes = ['no_cancelled_row'];
          }
          entry.status = pass ? 'PASS' : 'FAIL';
        } else {
          // topic switch — judge last step expect
          const lastStep = sc.steps[sc.steps.length - 1];
          const fake = {
            replyBody: (stepResults[stepResults.length - 1] || {}).outbound,
            amounts: (stepResults[stepResults.length - 1] || {}).amounts || [],
          };
          const j = judge({ expect: lastStep.expect || { requireReply: true } }, fake);
          entry.status = j.status;
          entry.actual.notes = j.notes;
          if (!j.pass && /price|keratin|galaxy|butterfly/i.test(sc.name)) {
            entry.severity = 'CRITICAL_PRICING';
            critical = sc.name;
          }
        }
      } else {
        const res = await sendInbound(TENANT_ID, conv, sc.message, { images: sc.images });
        entry.sanitized = {
          inbound: sanitize(sc.message),
          outbound: res.replyBody,
          amounts: res.amounts,
          correlation: res.correlation,
        };
        entry.actual = entry.sanitized;
        const j = judge(sc, res);
        entry.status = j.status;
        entry.actual.notes = j.notes;
        // critical pricing stops
        if (!j.pass && [4, 5, 6].includes(sc.id)) {
          entry.severity = 'CRITICAL_PRICING';
          critical = sc.name + ':' + j.notes.join(',');
        }
        // Keratin must never show 15000
        if (sc.id === 4 && (res.amounts || []).includes(15000)) {
          entry.status = 'FAIL';
          entry.severity = 'CRITICAL_PRICING';
          critical = 'keratin_15000_leak';
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


def main() -> int:
    # Localize JPEG into JS
    js = JS_HARNESS.replace("TINY_JPEG_PLACEHOLDER", TINY_JPEG)
    # Fix images env approach - already replaced in string for scenario 7 via placeholder in sendInbound opts
    # The scenarios loop sets dataBase64 from process.env - instead embed directly:
    js = js.replace(
        "s.images[0].dataBase64 = process.env.TINY_JPEG || '';",
        f"s.images[0].dataBase64 = '{TINY_JPEG}';",
    )

    client = connect()
    print("SSH ok — Phase 5 WA smoke starting (test number only)")
    sftp = client.open_sftp()
    with sftp.file("/tmp/_phase5_wa_smoke.js", "w") as f:
        f.write(js)
    sftp.close()

    cmd = (
        "docker cp /tmp/_phase5_wa_smoke.js xanesalon-backend-1:/app/_phase5_wa_smoke.js && "
        "cd /root/xanesalon && docker compose exec -T -w /app backend node /app/_phase5_wa_smoke.js"
    )
    print(">>> running harness (may take several minutes)")
    _, o, e = client.exec_command(cmd, timeout=900)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    print(out[-8000:])
    if err.strip():
        print(err[-2000:])

    # fetch evidence
    _, o2, _ = client.exec_command(
        "docker exec xanesalon-backend-1 cat /app/_phase5_wa_smoke_out.json",
        timeout=60,
    )
    raw = o2.read().decode("utf-8", "replace")
    client.close()
    if not raw.strip():
        print("NO_EVIDENCE_FILE")
        return 1
    data = json.loads(raw)
    # ensure phone masked in saved copy
    text = json.dumps(data, indent=2, ensure_ascii=False)
    text = re.sub(r"94705800063", PHONE_MASK, text)
    text = re.sub(r"AIza[0-9A-Za-z\-_]{10,}", "[REDACTED]", text)
    text = re.sub(r"AQ\.[0-9A-Za-z\-_]{10,}", "[REDACTED]", text)
    OUT.write_text(text, encoding="utf-8")
    print(json.dumps({
        "saved": str(OUT),
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
