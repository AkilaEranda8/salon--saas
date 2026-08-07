import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('157.180.113.249', username='root', password='qnuwjheuweugdsjsds', timeout=15)

def run(c):
    _, o, e = client.exec_command(c, timeout=20)
    return o.read().decode('utf-8','replace').strip() + e.read().decode('utf-8','replace').strip()

# Check actual DB password from .env
print("=== .env DB_PASS ===")
print(run('cat /root/xanesalon/.env 2>/dev/null | grep DB_PASS || echo NOT_FOUND'))

# Try with rootpass
print("\n=== SHOW TABLES (rootpass) ===")
PW = 'kjsdksdjiereihshdks'
print(run(f"docker exec xanesalon-db-1 mysql -uroot -p{PW} zanesalon -N -e 'SHOW TABLES' 2>&1"))

print("\n=== notification_settings row count ===")
print(run(f"docker exec xanesalon-db-1 mysql -uroot -p{PW} zanesalon -N -e 'SELECT COUNT(*) FROM notification_settings' 2>&1"))

print("\n=== SMS credentials ===")
creds_out = run(f"docker exec xanesalon-db-1 mysql -uroot -p{PW} zanesalon -N -e 'SELECT sms_user_id,sms_api_key,sms_sender_id FROM notification_settings LIMIT 1' 2>&1")
print(creds_out)

# Parse credentials (skip warning line)
lines = [l for l in creds_out.splitlines() if l and 'Warning' not in l and 'insecure' not in l]
if lines:
    parts = lines[0].split('\t')
    uid, akey, sid = parts[0].strip(), parts[1].strip(), parts[2].strip()
    print(f"\nuser_id={uid}  sender_id={sid}  api_key={akey[:8]}...")

    # Direct curl test from server
    print("\n=== Live Notify.lk API call ===")
    payload = '{' + f'"user_id":"{uid}","api_key":"{akey}","service_id":"{sid}","to":"94774530679","message":"Zane Salon test."' + '}'
    resp = run(f"curl -s -X POST https://app.notify.lk/api/v1/send -H 'Content-Type: application/json' -d '{payload}'")
    print("ZaneSalon response:", resp)

    # Test with NotifyDEMO
    payload2 = '{' + f'"user_id":"{uid}","api_key":"{akey}","service_id":"NotifyDEMO","to":"94774530679","message":"Zane Salon test via NotifyDEMO."' + '}'
    resp2 = run(f"curl -s -X POST https://app.notify.lk/api/v1/send -H 'Content-Type: application/json' -d '{payload2}'")
    print("NotifyDEMO response:", resp2)

    # Test with WRONG credentials to compare error
    payload3 = '{"user_id":"00000","api_key":"WRONGKEY","service_id":"ZaneSalon","to":"94774530679","message":"test"}'
    resp3 = run(f"curl -s -X POST https://app.notify.lk/api/v1/send -H 'Content-Type: application/json' -d '{payload3}'")
    print("WRONG creds response:", resp3)

client.close()
