"""Check recent WhatsApp CRM bookings and whether SMS/notification was sent."""
import io, sys
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
SCRIPT = r'''
process.chdir('/app');
(async () => {
  const { Op } = require('sequelize');
  const {
    Appointment, CrmBookingRequest, CrmMessage, CrmConversation, CrmLead,
    NotificationLog, Customer,
  } = require('./models');

  console.log('=== recent appointments ===');
  const appts = await Appointment.findAll({
    where: { tenant_id: 5 },
    order: [['id', 'DESC']],
    limit: 8,
  });
  for (const a of appts) {
    console.log({
      id: a.id, date: a.date, time: a.time, status: a.status,
      phone: a.phone, customer_id: a.customer_id, staff_id: a.staff_id,
      created: a.createdAt, source: a.source || a.booking_source || null,
      notes: String(a.notes || a.note || '').slice(0, 80),
    });
  }

  console.log('=== crm booking requests ===');
  try {
    const br = await CrmBookingRequest.findAll({ where: { tenant_id: 5 }, order: [['id','DESC']], limit: 8 });
    for (const b of br) console.log(b.toJSON());
  } catch (e) { console.log('booking_req_err', e.message); }

  console.log('=== recent notification logs ===');
  try {
    const logs = await NotificationLog.findAll({
      where: { tenant_id: 5 },
      order: [['id', 'DESC']],
      limit: 15,
    });
    for (const l of logs) {
      console.log({
        id: l.id, channel: l.channel, event: l.event_type, status: l.status,
        to: l.to_address || l.recipient || l.phone,
        error: l.error_message || l.error,
        created: l.createdAt,
        body: String(l.body || l.message || '').slice(0, 60),
      });
    }
  } catch (e) { console.log('notif_err', e.message); }

  console.log('=== recent outbound crm msgs with book ===');
  const msgs = await CrmMessage.findAll({
    where: { tenant_id: 5, direction: 'outbound' },
    order: [['id','DESC']], limit: 10,
  });
  for (const m of msgs) {
    const body = String(m.body || '');
    if (/book|appoint|confirm|slot|reserved/i.test(body) || true) {
      console.log({ id: m.id, conv: m.conversation_id, delivery: m.delivery_status, body: body.slice(0, 120) });
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
'''
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        break
    except Exception:
        continue
sftp = client.open_sftp()
with sftp.file('/tmp/check_sms.js','w') as f: f.write(SCRIPT)
sftp.close()
cmd = (
  "cd /root/xanesalon; "
  "docker cp /tmp/check_sms.js xanesalon-backend-1:/app/check_sms.js && "
  "docker compose exec -T -w /app backend node check_sms.js && "
  "echo '=== reminder/booking code path logs ===' && "
  "docker compose logs --tail=80 backend ai_crm_worker 2>&1 | grep -iE 'booking|confirm|sms|notification|reminder|twilio|notify' | tail -40"
)
_,o,e=client.exec_command(cmd, timeout=60)
print(o.read().decode('utf-8','replace'))
print(e.read().decode('utf-8','replace')[-1500:])
client.close()
