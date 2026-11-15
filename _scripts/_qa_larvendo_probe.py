"""Read-only QA probe for Larvendo tenant 28. No writes."""
import io
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
OUT = Path(r"e:\salon_v1\_scripts\_qa_larvendo_probe.json")

JS = r'''
const fs = require('fs');
const { Op } = require('/app/node_modules/sequelize');
const {
  Tenant, Branch, Staff, Service, CrmKnowledgeArticle, CrmAiRule, Appointment,
} = require('/app/models');

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

(async () => {
  const tid = 28;
  const tenant = await Tenant.findByPk(tid);
  const branches = await Branch.findAll({ where: { tenant_id: tid } });
  const branchIds = branches.map((b) => b.id);

  // Staff integrity: multiple query strategies
  const staffByTenant = await Staff.findAll({ where: { tenant_id: tid } });
  const staffByBranch = branchIds.length
    ? await Staff.findAll({ where: { branch_id: { [Op.in]: branchIds } } })
    : [];
  const staffActiveTenant = await Staff.findAll({ where: { tenant_id: tid, is_active: true } });
  const staffActiveBranch = branchIds.length
    ? await Staff.findAll({ where: { branch_id: { [Op.in]: branchIds }, is_active: true } })
    : [];
  const staffNullTenantOnBranch = branchIds.length
    ? await Staff.findAll({
        where: { branch_id: { [Op.in]: branchIds }, tenant_id: { [Op.or]: [null, tid] } },
      })
    : [];

  const staffRows = staffByBranch.length ? staffByBranch : staffByTenant;
  const staffReport = staffRows.map((s) => {
    const j = s.toJSON();
    return {
      id: j.id,
      name: j.name,
      tenant_id: j.tenant_id,
      branch_id: j.branch_id,
      is_active: j.is_active,
      available_online: j.available_online,
      role_title: j.role_title,
      working_hours: j.working_hours,
      has_working_hours: !!(j.working_hours && Object.keys(j.working_hours || {}).length),
    };
  });

  // Services duplicate analysis
  const services = await Service.findAll({
    where: { tenant_id: tid },
    attributes: ['id','name','price','duration_minutes','category','is_active','available_online','description'],
    order: [['name','ASC'],['id','ASC']],
  });
  const byNorm = {};
  for (const s of services) {
    const j = s.toJSON();
    const key = normName(j.name);
    if (!byNorm[key]) byNorm[key] = [];
    byNorm[key].push({
      id: j.id,
      name: j.name,
      price: Number(j.price),
      duration_minutes: j.duration_minutes,
      category: j.category,
      is_active: j.is_active,
      available_online: j.available_online,
    });
  }
  const exactDupGroups = Object.entries(byNorm)
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, count: rows.length, rows }));

  // Near-duplicates: same normalized stem ignoring length/time suffixes lightly
  const near = [];
  const names = Object.keys(byNorm);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      if (!a || !b) continue;
      // one contains the other and length close
      if ((a.includes(b) || b.includes(a)) && Math.abs(a.length - b.length) <= 12) {
        near.push({ a, b, rowsA: byNorm[a], rowsB: byNorm[b] });
      }
    }
  }

  // Appointment references for duplicate service ids (safety)
  const dupIds = exactDupGroups.flatMap((g) => g.rows.map((r) => r.id));
  let apptRefCounts = {};
  if (dupIds.length) {
    const refs = await Appointment.findAll({
      where: { tenant_id: tid, service_id: { [Op.in]: dupIds } },
      attributes: ['service_id'],
    });
    for (const r of refs) {
      const sid = r.service_id;
      apptRefCounts[sid] = (apptRefCounts[sid] || 0) + 1;
    }
  }

  // KB articles focus
  const arts = await CrmKnowledgeArticle.findAll({
    where: { tenant_id: tid },
    order: [['priority','DESC'],['id','ASC']],
  });
  const kb = arts.map((a) => {
    const j = a.toJSON();
    const title = String(j.title || '');
    const body = String(j.body || '');
    const malformed =
      /[\u0d80-\u0dff]\s+[\u0d80-\u0dff]/.test(title.replace(/ /g,'')) === false &&
      (/auto-train \(google\)/i.test(title) && (/[\u0d80-\u0dff]\s[\u0d80-\u0dff]/.test(title) || title.length > 80 && /[\u0d80-\u0dff]/.test(title) && /\s{2,}/.test(title.replace(/[^\u0d80-\u0dff\s]/g,' '))));
    // simpler malformed: title has many single sinhala chars separated by spaces, or mojibake-like spacing
    const sinhalaTokens = title.match(/[\u0d80-\u0dff]+/g) || [];
    const spacedSinglishBroken = /auto-train \(google\)/i.test(title) && sinhalaTokens.length >= 3 && sinhalaTokens.filter((t) => t.length <= 2).length >= 3;
    return {
      id: j.id,
      title,
      category: j.category,
      priority: j.priority,
      is_active: j.is_active,
      tags: j.tags || [],
      body_chars: body.length,
      body_preview: body.slice(0, 400).replace(/\s+/g, ' '),
      suspected_malformed_title: spacedSinglishBroken || (title.includes('Auto-train (Google)') && title.length > 70),
      body,
    };
  });

  // Pricing conflict heuristic: extract Rs amounts from full price list vs category sheets
  const priceList = kb.find((a) => /full official price list/i.test(a.title));
  const categorySheets = kb.filter((a) => /price list/i.test(a.title) && a.id !== (priceList && priceList.id));

  const report = {
    generated_at: new Date().toISOString(),
    tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status } : null,
    staff: {
      root_cause_note:
        'Staff model uses is_active + tenant_id/branch_id — NOT status. Prior report queried attributes including status and swallowed errors → count 0.',
      counts: {
        by_tenant_id: staffByTenant.length,
        by_branch_id: staffByBranch.length,
        active_by_tenant: staffActiveTenant.length,
        active_by_branch: staffActiveBranch.length,
        null_or_tenant_on_branch: staffNullTenantOnBranch.length,
      },
      branches: branches.map((b) => b.toJSON()),
      staff: staffReport,
      missing_working_hours: staffReport.filter((s) => !s.has_working_hours).map((s) => ({ id: s.id, name: s.name })),
      tenant_id_null: staffReport.filter((s) => s.tenant_id == null).map((s) => ({ id: s.id, name: s.name, branch_id: s.branch_id })),
      inactive: staffReport.filter((s) => !s.is_active).map((s) => ({ id: s.id, name: s.name })),
    },
    services: {
      total: services.length,
      active: services.filter((s) => s.is_active).length,
      exact_duplicate_groups: exactDupGroups.map((g) => ({
        ...g,
        rows: g.rows.map((r) => ({ ...r, appointment_refs: apptRefCounts[r.id] || 0 })),
      })),
      near_duplicate_pairs: near.slice(0, 80),
      proposed_cleanup: exactDupGroups.map((g) => {
        const rows = g.rows.map((r) => ({ ...r, appointment_refs: apptRefCounts[r.id] || 0 }));
        // propose keep highest appointment_refs, else lowest id active
        const sorted = [...rows].sort((a, b) => (b.appointment_refs - a.appointment_refs) || (Number(b.is_active) - Number(a.is_active)) || (a.id - b.id));
        const keep = sorted[0];
        const deactivate = sorted.slice(1);
        return {
          key: g.key,
          keep_id: keep.id,
          keep_reason: keep.appointment_refs > 0 ? 'most appointment refs' : 'prefer active + lowest id',
          propose_deactivate_ids: deactivate.map((d) => d.id),
          rows,
          action: 'PROPOSE ONLY — do not delete; soft-deactivate duplicates after approval',
        };
      }),
    },
    knowledge: {
      total: kb.length,
      malformed_titles: kb.filter((a) => a.suspected_malformed_title).map((a) => ({
        id: a.id,
        title: a.title,
        priority: a.priority,
        proposed_title: a.title.startsWith('Auto-train (Google):')
          ? ('Auto-train (Google): ' + (a.body_preview.slice(0, 60).replace(/\s+/g, ' ').trim() || 'customer FAQ'))
          : a.title,
        body_preview: a.body_preview,
      })),
      articles_brief: kb.map(({ body, ...rest }) => rest),
    },
    rules_count: await CrmAiRule.count({ where: { tenant_id: tid, is_active: true } }),
  };

  fs.writeFileSync('/tmp/qa_larvendo_probe.json', JSON.stringify(report));
  console.log('OK staff_branch', report.staff.counts.by_branch_id, 'dup_groups', report.services.exact_duplicate_groups.length, 'malformed', report.knowledge.malformed_titles.length);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
'''

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        print("SSH ok")
        break
    except Exception as e:
        print(e)
else:
    sys.exit(1)

sftp = client.open_sftp()
sftp.putfo(io.BytesIO(JS.encode("utf-8")), "/tmp/_qa_larvendo_probe.js")
sftp.close()

cmd = (
    "docker cp /tmp/_qa_larvendo_probe.js xanesalon-backend-1:/tmp/_qa_larvendo_probe.js && "
    "docker compose -f /root/xanesalon/docker-compose.yml exec -T backend node /tmp/_qa_larvendo_probe.js && "
    "docker cp xanesalon-backend-1:/tmp/qa_larvendo_probe.json /tmp/qa_larvendo_probe.json"
)
_, o, e = client.exec_command(cmd, timeout=180)
print((o.read() + e.read()).decode("utf-8", "replace")[-4000:])

sftp = client.open_sftp()
sftp.get("/tmp/qa_larvendo_probe.json", str(OUT))
sftp.close()
client.close()

data = json.loads(OUT.read_text(encoding="utf-8"))
print(json.dumps(data["staff"]["counts"], indent=2))
print("staff rows", len(data["staff"]["staff"]))
print("dup groups", len(data["services"]["exact_duplicate_groups"]))
print("malformed", json.dumps(data["knowledge"]["malformed_titles"], ensure_ascii=False, indent=2)[:3000])
print("wrote", OUT)
