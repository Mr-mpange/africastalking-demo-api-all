const express = require('express');
const at = require('../config/at');
const axios = require('axios');

const router = express.Router();
const voice = at.VOICE;

// POST /voice/call - initiate a call from AT number to a recipient
router.post('/call', async (req, res) => {
  try {
    const { callFrom, callTo } = req.body; // E.164 numbers, e.g., +2547...
    if (!callFrom || !callTo) {
      return res.status(400).json({ error: 'callFrom and callTo are required' });
    }

    // First try SDK
    try {
      const result = await voice.call({ callFrom, callTo });
      return res.json({ ok: true, via: 'sdk', result });
    } catch (sdkErr) {
      console.warn('[Voice] SDK call failed, attempting REST fallback:', sdkErr.message);
      // REST fallback
      const { AT_USERNAME, AT_API_KEY } = process.env;
      if (!AT_USERNAME || !AT_API_KEY) {
        return res.status(500).json({ error: 'AT credentials missing for REST fallback' });
      }
      // Safe auth logging (do NOT print full API key)
      const apiPreview = AT_API_KEY.length > 8
        ? `${AT_API_KEY.slice(0, 4)}...${AT_API_KEY.slice(-4)}`
        : '***';
      console.log('[Voice Auth]', { username: AT_USERNAME, apiKeyPreview: apiPreview, keyLength: AT_API_KEY.length });

      const form = new URLSearchParams();
      form.append('username', AT_USERNAME);
      form.append('from', callFrom);
      form.append('to', callTo);

      const voiceUrl = 'https://voice.africastalking.com/call';
      console.log('[Voice] REST fallback POST', voiceUrl);
      const response = await axios.post(
        voiceUrl,
        form.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            apikey: AT_API_KEY,
          },
          timeout: 15000,
        }
      );

      return res.json({ ok: true, via: 'rest', data: response.data });
    }
  } catch (err) {
    console.error('Voice call error', err);
    return res.status(500).json({ error: 'Failed to initiate call', details: err.message });
  }
});

// Voice events callback
router.post('/events', (req, res) => {
  console.log('[Voice Events]', req.body);
  // Must return 200 OK fast
  res.status(200).send('OK');
});

// Convenience GET for events (browser test)
router.get('/events', (req, res) => {
  console.log('[Voice Events][GET]', req.query);
  res.status(200).send('OK');
});

function buildMenuXml(selfUrl, introText = 'Welcome. Please choose an option.') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${introText}</Say>
  <GetDigits timeout="20" numDigits="1" callbackUrl="${selfUrl}">
    <Say>Press 1 for company information. Press 2 for operating hours. Press 3 to speak to an agent. Press 4 to repeat this menu. Press 5 to end the call.</Say>
  </GetDigits>
  <Say>No input received. Repeating the menu.</Say>
  <Redirect>${selfUrl.replace('/digits', '/actions')}</Redirect>
</Response>`;
}

function handleSelectionXml(digits) {
  if (digits === '1') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thanks for calling. Our live demo is running. Visit our website or reply via SMS for more info. Goodbye.</Say>
  <Hangup/>
</Response>`;
  }
  if (digits === '2') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Our operating hours are Monday to Friday, eight A M to six P M East Africa Time. Goodbye.</Say>
  <Hangup/>
</Response>`;
  }
  if (digits === '3') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>All agents are currently busy. Please try again later, or send us an SMS. Goodbye.</Say>
  <Hangup/>
</Response>`;
  }
  if (digits === '4') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>/voice/actions</Redirect>
</Response>`;
  }
  if (digits === '5') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you. Ending the call now. Goodbye.</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Invalid choice. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// Voice actions (CCXML-like) - respond with simple instructions
router.post('/actions', (req, res) => {
  console.log('[Voice Actions]', req.body);
  res.set('Content-Type', 'application/xml');
  const isActive = req.body && String(req.body.isActive);
  const digits = (req.body && (req.body.dtmfDigits || req.body.digits)) || '';

  // If call is not active, AT is posting a call summary (duration, status, etc.). No IVR needed.
  if (isActive === '0') {
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  if (!digits) {
    // Build menu pointing GetDigits to a dedicated /voice/digits callback
    const host = req.get('host');
    const baseUrl = `https://${host}`; // force https for AT callbacks via ngrok
    const digitsUrl = `${baseUrl}${req.baseUrl}/digits`;
    console.log('[Voice Actions] Using digits callbackUrl:', digitsUrl);
    const xml = buildMenuXml(digitsUrl, 'Welcome to the demo. Please listen carefully, then make a selection.');
    return res.send(xml);
  }

  // Handle selection (rare case AT posts digits here)
  return res.send(handleSelectionXml(digits));
});

// Convenience GET for actions (browser test)
router.get('/actions', (req, res) => {
  console.log('[Voice Actions][GET]', req.query);
  res.set('Content-Type', 'application/xml');
  const digits = req.query && (req.query.dtmfDigits || req.query.digits);
  if (!digits) {
    const host = req.get('host');
    const baseUrl = `https://${host}`;
    const digitsUrl = `${baseUrl}${req.baseUrl}/digits`;
    console.log('[Voice Actions][GET] Using digits callbackUrl:', digitsUrl);
    return res.send(buildMenuXml(digitsUrl));
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You entered ${digits}. Goodbye.</Say>
  <Hangup/>
</Response>`;
  res.send(xml);
});

// Dedicated handler for DTMF callbacks from <GetDigits>
router.post('/digits', (req, res) => {
  console.log('[Voice Digits][POST]', req.body);
  res.set('Content-Type', 'application/xml');
  const digits = (req.body && (req.body.dtmfDigits || req.body.digits)) || '';
  return res.send(handleSelectionXml(digits));
});

router.get('/digits', (req, res) => {
  console.log('[Voice Digits][GET]', req.query);
  res.set('Content-Type', 'application/xml');
  const digits = (req.query && (req.query.dtmfDigits || req.query.digits)) || '';
  return res.send(handleSelectionXml(digits || '5'));
});

module.exports = router;
