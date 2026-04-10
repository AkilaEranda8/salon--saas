const http = require('http');

const data = JSON.stringify({
  username: 'admin@hexalyte.com',
  password: 'akila123'
});

const opts = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-Slug': 'zane',
    'Content-Length': data.length
  }
};

const req = http.request(opts, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
  });
});

req.write(data);
req.end();
