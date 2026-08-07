import paramiko, sys, io

host = '157.180.113.249'
user_ssh = 'root'
password_ssh = 'qnuwjheuweugdsjsds'

ADMIN_USERNAME = 'admin'
ADMIN_PASSWORD = 'Admin@1234'
ADMIN_NAME = 'Super Admin'

script = f"""const bcrypt = require('bcryptjs');
const {{ sequelize }} = require('./config/database');
require('./models');
const User = require('./models/User');
async function main() {{
  await sequelize.authenticate();
  const existing = await User.findOne({{ where: {{ username: '{ADMIN_USERNAME}' }} }});
  if (existing) {{
    console.log('User already exists: ' + existing.username + ' | role: ' + existing.role);
    await sequelize.close();
    return;
  }}
  const hash = await bcrypt.hash('{ADMIN_PASSWORD}', 10);
  const u = await User.create({{
    username: '{ADMIN_USERNAME}',
    password: hash,
    name: '{ADMIN_NAME}',
    role: 'superadmin',
    is_active: true,
  }});
  console.log('SUCCESS: superadmin created | username: ' + u.username + ' | id: ' + u.id);
  await sequelize.close();
}}
main().catch(e => {{ console.error('ERROR: ' + e.message); process.exit(1); }});
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user_ssh, password=password_ssh)

def run(label, cmd):
    print(f"\n--- {label} ---")
    sys.stdout.flush()
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    result = (out + err).strip()
    sys.stdout.buffer.write((result + '\n').encode('utf-8'))
    sys.stdout.buffer.flush()

# Upload script via SFTP
print("\n--- Upload script via SFTP ---")
sftp = client.open_sftp()
sftp.putfo(io.BytesIO(script.encode('utf-8')), '/tmp/create_admin.js')
sftp.close()
print("Uploaded /tmp/create_admin.js")

run("Copy into container", "docker cp /tmp/create_admin.js xanesalon-backend-1:/app/create_admin.js")
run("Run script", "docker exec xanesalon-backend-1 node /app/create_admin.js")
run("Cleanup", "docker exec xanesalon-backend-1 rm -f /app/create_admin.js; rm -f /tmp/create_admin.js")

client.close()
print("\nDone.")
