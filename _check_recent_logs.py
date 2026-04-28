import io, sys, paramiko
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        break
    except paramiko.AuthenticationException:
        pass

# Full backend logs since last restart - look for email/notification lines
cmd = "docker logs xanesalon-backend-1 2>&1 | grep -E 'Email|Notification|smtp|SMTP|forgot|reset|failed|error|Error' | tail -30"
_, out, _ = client.exec_command(cmd, timeout=20)
print(out.read().decode("utf-8", "replace"))
client.close()
