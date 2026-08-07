import paramiko, sys, io

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('46.62.135.100', port=22, username='root', password='CCaPfTjhjhjkhgkshds', timeout=15)

# Check tenants
script = """
const {sequelize} = require('./config/database');
const {Tenant, User} = require('./models');
(async()=>{
  await sequelize.authenticate();
  const tenants = await Tenant.findAll({attributes:['id','slug','name','status','plan']});
  console.log('TENANTS:', JSON.stringify(tenants.map(t=>t.toJSON()), null, 2));
  const users = await User.findAll({where:{role:['superadmin','admin','platform_admin']}, attributes:['id','username','role','tenant_id','is_active']});
  console.log('USERS:', JSON.stringify(users.map(u=>u.toJSON()), null, 2));
  await sequelize.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
"""
cmd = f"cd /root/xanesalon && docker compose exec -T backend node -e \"{script.strip().replace(chr(10),' ')}\""
stdin, stdout, stderr = client.exec_command(cmd)
print(stdout.read().decode())
err = stderr.read().decode()
if err.strip():
    print("ERR:", err[:500])

client.close()
