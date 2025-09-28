const AfricasTalking = require('africastalking');

const { AT_USERNAME, AT_API_KEY } = process.env;

if (!AT_USERNAME || !AT_API_KEY) {
  console.warn('[WARN] AT_USERNAME or AT_API_KEY missing. Fill your .env before running production tests.');
}

const at = AfricasTalking({
  username: AT_USERNAME || 'sandbox',
  apiKey: AT_API_KEY || 'key-not-set',
});

module.exports = at;
