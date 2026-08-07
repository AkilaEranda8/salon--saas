import paramiko, sys, io

host        = '157.180.113.249'
user_ssh    = 'root'
password_ssh = 'qnuwjheuweugdsjsds'

TEST_USERNAME = 'reviewstaff'
TEST_PASSWORD = 'Review@1234'
TEST_NAME     = 'Review Staff'

script = """
const bcrypt = require('bcryptjs');
const {{ sequelize }} = require('./config/database');
const {{ QueryTypes }} = require('sequelize');
require('./models');
const Branch = require('./models/Branch');
const User   = require('./models/User');
const kc = require('./utils/keycloakAdmin');

const TEST_USERNAME = '{username}';
const TEST_PASSWORD = '{password}';
const TEST_NAME     = '{name}';

async function main() {{
  await sequelize.authenticate();

  // Get KC groups to find tenant slug
  let tenantSlug = 'xanesalon';
  try {{
    const axios = require('axios');
    const kcUrl = process.env.KEYCLOAK_URL;
    if (kcUrl) {{
      const tokenRes = await axios.post(
        kcUrl + '/realms/salon-saas/protocol/openid-connect/token',
        new URLSearchParams({{ grant_type: 'client_credentials', client_id: process.env.KC_CLIENT_ID || 'salon-backend', client_secret: process.env.KC_CLIENT_SECRET || '' }}),
        {{ headers: {{ 'Content-Type': 'application/x-www-form-urlencoded' }} }}
      );
      const adminToken = tokenRes.data.access_token;
      const groupsRes = await axios.get(kcUrl + '/admin/realms/salon-saas/groups', {{ headers: {{ Authorization: 'Bearer ' + adminToken }} }});
      const groups = groupsRes.data;
      console.log('KC groups:', groups.map(g => g.name).join(', '));
      if (groups.length > 0) tenantSlug = groups[0].name;
    }}
  }} catch(e) {{ console.log('KC group check warning:', e.message); }}

  // Use branch id=1
  const branchId = 1;

  // Check if test user already exists
  const existing = await sequelize.query(
    "SELECT id, username FROM users WHERE username = ? LIMIT 1",
    {{ type: QueryTypes.SELECT, replacements: [TEST_USERNAME] }}
  );
  if (existing.length > 0) {{
    console.log('\\nUser already exists — use these Play Console credentials:');
    console.log('  Salon Name : ' + tenantSlug);
    console.log('  Username   : ' + TEST_USERNAME);
    console.log('  Password   : ' + TEST_PASSWORD);
    await sequelize.close();
    return;
  }}

  // Create DB user
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const u = await User.create({{
    username: TEST_USERNAME,
    password: hash,
    name: TEST_NAME,
    role: 'staff',
    branch_id: branchId,
    is_active: true,
  }});
  console.log('DB user created, id=' + u.id);

  // Create Keycloak user
  try {{
    await kc.createUser({{
      dbUserId:   u.id,
      username:   TEST_USERNAME,
      name:       TEST_NAME,
      role:       'staff',
      tenantSlug: tenantSlug,
      branchId:   branchId,
      password:   TEST_PASSWORD,
    }});
    console.log('Keycloak user created OK');
  }} catch(e) {{ console.log('KC warning (DB user still created): ' + e.message); }}

  console.log('\\nSUCCESS — use these credentials in Play Console:');
  console.log('  Salon Name : ' + tenantSlug);
  console.log('  Username   : ' + TEST_USERNAME);
  console.log('  Password   : ' + TEST_PASSWORD);
  await sequelize.close();
}}
main().catch(e => {{ console.error('ERROR: ' + e.message); process.exit(1); }});
""".format(username=TEST_USERNAME, password=TEST_PASSWORD, name=TEST_NAME)

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

print("\n--- Upload script via SFTP ---")
sftp = client.open_sftp()
sftp.putfo(io.BytesIO(script.encode('utf-8')), '/tmp/create_test_staff.js')

# Also upload keycloakAdmin.js
with open('backend/utils/keycloakAdmin.js', 'rb') as f:
    sftp.putfo(f, '/tmp/keycloakAdmin.js')

sftp.close()
print("Uploaded scripts")

run("Copy into container", "docker cp /tmp/create_test_staff.js xanesalon-backend-1:/app/create_test_staff.js")
run("Make utils dir", "docker exec xanesalon-backend-1 mkdir -p /app/utils")
run("Copy kcAdmin", "docker cp /tmp/keycloakAdmin.js xanesalon-backend-1:/app/utils/keycloakAdmin.js")
run("Run script",         "docker exec xanesalon-backend-1 node /app/create_test_staff.js")
run("Cleanup",            "docker exec xanesalon-backend-1 rm -f /app/create_test_staff.js; rm -f /tmp/create_test_staff.js")

client.close()
print("\nDone.")
