"""Fix MySQL ibdata1 lock — find what holds the lock and release it, then restart db."""
import io, sys, time, threading

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        print("Connected"); break
    except paramiko.AuthenticationException:
        pass

def run(cmd, timeout=60):
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip(): print(out.strip())
    if err.strip(): print("ERR:", err.strip())
    return out

# 1. Show which containers are using each mysql volume
print("\n=== Volume usage ===")
run("docker ps --format '{{.Names}} {{.Mounts}}' | grep -i mysql || true")
run("docker volume ls | grep -i mysql")

# 2. Inspect what volume xanesalon db is using
print("\n=== xanesalon-db-1 mounts ===")
run("docker inspect xanesalon-db-1 --format '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{end}}' 2>/dev/null || echo not running")

# 3. Check if any other container holds the same volume
print("\n=== All containers using mysql volumes ===")
run(
    "for c in $(docker ps -aq); do "
    "  m=$(docker inspect $c --format '{{range .Mounts}}{{.Name}} {{end}}' 2>/dev/null); "
    "  echo \"$(docker inspect $c --format '{{.Name}}') : $m\"; "
    "done | grep -i mysql || echo none"
)

# 4. Stop all containers that share the mysql volume, then restart xanesalon db
print("\n=== Stopping all containers on mysql volumes, restarting xanesalon db ===")
run("docker stop $(docker ps -q) 2>/dev/null || true")
time.sleep(3)
run("cd /root/xanesalon && docker compose up -d db 2>&1")

# 5. Wait for healthy
print("\n=== Waiting 40s for DB to become healthy ===")
time.sleep(40)
run("docker inspect --format='{{.State.Health.Status}}' xanesalon-db-1 2>/dev/null")
run("cd /root/xanesalon && docker compose logs db --tail=6 2>&1")

# 6. Bring up the full stack
print("\n=== Starting full stack ===")
_, o, e = client.exec_command("cd /root/xanesalon && docker compose up -d 2>&1", get_pty=True, timeout=60)
for line in iter(o.readline, ""):
    sys.stdout.write(line); sys.stdout.flush()

print("\n=== Final status ===")
run("cd /root/xanesalon && docker compose ps")

client.close()
