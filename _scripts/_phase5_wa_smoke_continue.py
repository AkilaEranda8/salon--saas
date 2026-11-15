"""
Phase 5 continuation: cancel (correct multi-appt steps) + handoff + duplicate.
Prior run stopped after over-flagged cancel; pricing/booking scenarios already PASS.
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

ROOT = Path(r"e:\salon_v1")
OUT = ROOT / "_scripts" / "_phase5_wa_smoke_evidence.json"
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
PHONE_MASK = "947***0063"

JS = r"""
process.chdir('/app');
const fs = require('fs');
const { Op } = require('sequelize');
const { Tenant, CrmConversation, CrmMessage, Appointment } = require('/app/models');
const { enqueue, QUEUE_NAMES } = require('/app/services/queue');

const TENANT_ID = 28;
const PHONE = '94705800063';
const OUT = '/app/_phase5_wa_smoke_continue_out.json';
const PREV = '/app/_phase5_wa_smoke_out.json';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function sanitize(text) {
  return String(text || '')
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, '[REDACTED]')
    .replace(/AQ\.[0-9A-Za-z\-_]{10,}/g, '[REDACTED]')
    .replace(/\b94705800063\b/g, '947***0063')
    .slice(0, 600);
}

async function lastMsgId(tenantId, conversationId) {
  const m = await CrmMessage.findOne({
    where: { tenant_id: tenantId, conversation_id: conversationId },
    order: [['id', 'DESC']],
  });
  return m ? m.id : 0;
}

async function sendInbound(tenantId, conv, message, waMessageId) {
  const beforeId = await lastMsgId(tenantId, conv.id);
  const waId = waMessageId || `p5c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await enqueue(QUEUE_NAMES.WA_INBOUND_AI, {
    tenantId, tenant_id: tenantId, phone: PHONE, message,
    waMessageId: waId, conversationId: conv.id, channel: 'qr',
  }, { name: 'inbound-turn', jobId: `wa-in-p5c-${waId}` });
  let reply = null;
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    reply = await CrmMessage.findOne({
      where: { tenant_id: tenantId, conversation_id: conv.id, direction: 'outbound', id: { [Op.gt]: beforeId } },
      order: [['id', 'DESC']],
    });
    if (reply && String(reply.body || '').trim()) break;
  }
  return {
    replyBody: reply ? sanitize(reply.body) : null,
    correlation: { conversationId: conv.id, waMessageId: waId, replyMessageId: reply ? reply.id : null },
  };
}

(async () => {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(PREV, 'utf8')); } catch (_) {}
  const scenarios = (prev.scenarios || []).filter((s) => s.id < 10);

  const conv = await CrmConversation.findOne({
    where: { tenant_id: TENANT_ID, phone: { [Op.like]: '%705800063%' } },
    order: [['id', 'DESC']],
  });
  if (!conv) throw new Error('conv_missing');

  // --- 10 cancellation (pick #146 then confirm) ---
  const c10 = { id: 10, name: 'cancellation', started_utc: new Date().toISOString(), status: 'FAIL', expected: 'cancel selected appointment with DB cancelled', actual: {}, sanitized: {}, severity: null };
  const steps = [];
  for (const msg of ['cancel my appointment', '1', 'yes']) {
    const r = await sendInbound(TENANT_ID, conv, msg);
    steps.push({ inbound: sanitize(msg), outbound: r.replyBody, correlation: r.correlation });
    await sleep(2000);
  }
  const appt146 = await Appointment.findByPk(146);
  const appt145 = await Appointment.findByPk(145);
  c10.sanitized = { steps };
  c10.actual = {
    steps,
    appointment_146: appt146 ? { id: appt146.id, status: appt146.status, tenant_id: appt146.tenant_id } : null,
    appointment_145: appt145 ? { id: appt145.id, status: appt145.status, tenant_id: appt145.tenant_id } : null,
  };
  const cancelled146 = appt146 && /cancel/i.test(String(appt146.status || ''));
  const last = (steps[steps.length - 1] || {}).outbound || '';
  const falseSuccess = /cancelled|canceled|successfully cancel/i.test(last) && !cancelled146;
  if (falseSuccess) {
    c10.status = 'FAIL';
    c10.severity = 'CRITICAL_CANCEL';
  } else if (cancelled146) {
    c10.status = 'PASS';
  } else {
    c10.status = 'FAIL';
    c10.severity = 'HIGH';
    c10.actual.notes = ['appointment_not_cancelled_after_flow'];
  }
  c10.finished_utc = new Date().toISOString();
  scenarios.push(c10);
  console.log('SCENARIO', 10, c10.status, c10.severity || '');

  let stop = c10.severity === 'CRITICAL_CANCEL';

  // --- 11 handoff ---
  if (!stop) {
    const c11 = { id: 11, name: 'human_handoff', started_utc: new Date().toISOString(), expected: { mustIncludeAny: ['staff', 'human', 'team', 'connect'] }, actual: {}, sanitized: {}, severity: null };
    await conv.update({ status: 'ai_active', handoff_reason: null, ai_turn_state: 'pending' });
    const r = await sendInbound(TENANT_ID, conv, 'I want to speak to a staff member please');
    const body = (r.replyBody || '').toLowerCase();
    const hit = ['staff', 'human', 'team', 'connect', 'handoff', 'agent'].some((k) => body.includes(k));
    await conv.reload();
    c11.sanitized = { inbound: 'I want to speak to a staff member please', outbound: r.replyBody, correlation: r.correlation, conv_status: conv.status, handoff_reason: conv.handoff_reason };
    c11.actual = c11.sanitized;
    c11.status = (r.replyBody && hit) ? 'PASS' : 'FAIL';
    if (c11.status === 'FAIL') c11.severity = 'HIGH';
    c11.finished_utc = new Date().toISOString();
    scenarios.push(c11);
    console.log('SCENARIO', 11, c11.status);
    await sleep(2500);
  }

  // --- 12 duplicate ---
  if (!stop) {
    const c12 = { id: 12, name: 'duplicate_send_protection', started_utc: new Date().toISOString(), expected: 'at most one outbound for same waMessageId', actual: {}, sanitized: {}, severity: null };
    const beforeId = await lastMsgId(TENANT_ID, conv.id);
    const waId = `p5-dup-${Date.now()}`;
    const payload = { tenantId: TENANT_ID, tenant_id: TENANT_ID, phone: PHONE, message: 'Hi', waMessageId: waId, conversationId: conv.id, channel: 'qr' };
    await enqueue(QUEUE_NAMES.WA_INBOUND_AI, payload, { name: 'inbound-turn', jobId: `wa-in-p5-dup-a-${waId}` });
    await enqueue(QUEUE_NAMES.WA_INBOUND_AI, { ...payload }, { name: 'inbound-turn', jobId: `wa-in-p5-dup-b-${waId}` });
    await sleep(14000);
    const outs = await CrmMessage.findAll({
      where: { tenant_id: TENANT_ID, conversation_id: conv.id, direction: 'outbound', id: { [Op.gt]: beforeId } },
      order: [['id', 'ASC']],
    });
    const bodies = outs.map((m) => sanitize(m.body));
    c12.actual = { outbound_count: outs.length, bodies, waMessageId: waId };
    c12.sanitized = c12.actual;
    c12.status = outs.length <= 1 ? 'PASS' : 'FAIL';
    if (c12.status === 'FAIL') {
      c12.severity = 'CRITICAL_DUPLICATE';
      stop = true;
    }
    c12.finished_utc = new Date().toISOString();
    scenarios.push(c12);
    console.log('SCENARIO', 12, c12.status, c12.severity || '');
  }

  const report = {
    ...prev,
    mode: 'phase5_production_wa_smoke',
    authorization: 'APPROVED FOR WHATSAPP SMOKE ONLY',
    continued_utc: new Date().toISOString(),
    scenarios,
    stopped_early: stop,
    critical_stop: stop ? 'see last FAIL severity' : null,
    note_prior_cancel_overflag: 'First cancel attempt asked which appointment; not a false success. Retested with selection.',
  };
  report.passed = scenarios.filter((s) => s.status === 'PASS').length;
  report.failed = scenarios.filter((s) => s.status === 'FAIL').length;
  report.blocked = scenarios.filter((s) => s.status === 'BLOCKED').length;
  report.total_run = scenarios.length;
  report.ok = report.failed === 0 && report.blocked === 0;
  report.finished_utc = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  // also update primary evidence path used by first harness
  fs.writeFileSync('/app/_phase5_wa_smoke_out.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, passed: report.passed, failed: report.failed, total_run: report.total_run }));
  process.exit(report.ok ? 0 : 10);
})().catch((e) => { console.error(e); process.exit(1); });
"""


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    for pw in PASSWORDS:
        try:
            client.connect("46.62.135.100", username="root", password=pw, timeout=25)
            break
        except Exception:
            continue
    else:
        return 1
    sftp = client.open_sftp()
    with sftp.file("/tmp/_phase5_wa_smoke_continue.js", "w") as f:
        f.write(JS)
    sftp.close()
    _, o, e = client.exec_command(
        "docker cp /tmp/_phase5_wa_smoke_continue.js xanesalon-backend-1:/app/_phase5_wa_smoke_continue.js && "
        "cd /root/xanesalon && docker compose exec -T -w /app backend node /app/_phase5_wa_smoke_continue.js",
        timeout=600,
    )
    print(o.read().decode("utf-8", "replace")[-6000:])
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print(err[-1500:])
    _, o2, _ = client.exec_command(
        "docker exec xanesalon-backend-1 cat /app/_phase5_wa_smoke_out.json", timeout=60
    )
    raw = o2.read().decode("utf-8", "replace")
    client.close()
    if not raw.strip():
        return 1
    text = re.sub(r"94705800063", PHONE_MASK, raw)
    text = re.sub(r"AIza[0-9A-Za-z\-_]{10,}|AQ\.[0-9A-Za-z\-_]{10,}", "[REDACTED]", text)
    OUT.write_text(text, encoding="utf-8")
    data = json.loads(text)
    print(json.dumps({
        "saved": str(OUT),
        "ok": data.get("ok"),
        "passed": data.get("passed"),
        "failed": data.get("failed"),
        "total_run": data.get("total_run"),
    }, indent=2))
    return 0 if data.get("ok") else 10


if __name__ == "__main__":
    raise SystemExit(main())
