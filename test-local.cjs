// Test the local server
const https = require('http');

const postData = JSON.stringify({
  to: '+255683859574',
  message: 'Test from cloned repo with your credentials'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/sms/send',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Testing local server...\n');

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    
    try {
      const parsed = JSON.parse(data);
      console.log('\nParsed:', JSON.stringify(parsed, null, 2));
    } catch (e) {}
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(postData);
req.end();
