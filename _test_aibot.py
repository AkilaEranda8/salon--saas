import paramiko, sys

host = '157.180.113.249'
passwords = ['qnuwjheuweugdsjsds', 'kjsdksdjiereihshdks']
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for p in passwords:
    try:
        client.connect(host, port=22, username='root', password=p, timeout=10)
        break
    except:
        pass

BASE = "https://admin.hexalyte.com/aibot"

tests = [
    ("HEALTH",   f"curl -sk {BASE}/health"),
    ("HELLO",    f"""curl -sk -X POST {BASE}/chat -H 'Content-Type: application/json' -d '{{"message":"hello"}}'"""),
    ("SERVICES", f"""curl -sk -X POST {BASE}/chat -H 'Content-Type: application/json' -d '{{"message":"show services"}}'"""),
    ("BOOK",     f"""curl -sk -X POST {BASE}/chat -H 'Content-Type: application/json' -d '{{"message":"book appointment"}}'"""),
]

for label, cmd in tests:
    _, stdout, _ = client.exec_command(cmd, timeout=15)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    sys.stdout.buffer.write(f"\n=== {label} ===\n{out}\n".encode('utf-8'))

client.close()
