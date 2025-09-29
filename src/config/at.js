const AfricasTalking = require('africastalking');

const { AT_USERNAME, AT_API_KEY } = process.env;

if (!AT_USERNAME || !AT_API_KEY) {
  console.warn('[WARN] AT_USERNAME or AT_API_KEY missing. Fill your .env before running production tests.');
}

// Debug: show resolved credentials context without leaking secrets
const resolvedUsername = AT_USERNAME || 'sandbox';
const environment = resolvedUsername === 'sandbox' ? 'SANDBOX' : 'LIVE';
const maskedApiKey = AT_API_KEY ? `${AT_API_KEY.slice(0, 4)}...${AT_API_KEY.slice(-2)}` : 'not-set';
console.log('[AT Config]', { username: resolvedUsername, environment, apiKey: maskedApiKey });
const at = AfricasTalking({
  username: AT_USERNAME || 'sandbox',
  apiKey: AT_API_KEY || 'key-not-set',
});

module.exports = at;
