const http = require('http');

async function test() {
  const loginData = JSON.stringify({ email: 'kumar@gmail.com', password: '123' });
  const options = {
    hostname: '127.0.0.1',
    port: 5001,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
  };

  const req = http.request(options, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      const data = JSON.parse(body);
      console.log('Response:', data);
    });
  });

  req.write(loginData);
  req.end();
}
test();
