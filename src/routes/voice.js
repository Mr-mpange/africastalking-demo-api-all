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
    // Present IVR menu and collect a single digit (no # needed). AT will POST back here with dtmfDigits
    const host = req.get('host');
    const baseUrl = `https://${host}`; // force https for AT callbacks via ngrok
    const selfUrl = `${baseUrl}${req.originalUrl}`;
    console.log('[Voice Actions] Using callbackUrl:', selfUrl);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Welcome to the demo. Please listen carefully, then make a selection.</Say>
  <GetDigits timeout="20" numDigits="1" callbackUrl="${selfUrl}">
    <Say>Press 1 for company information. Press 2 for operating hours. Press 3 to speak to an agent. Press 4 to repeat this menu. Press 5 to end the call.</Say>
  </GetDigits>
  <Say>No input received. Repeating the menu.</Say>
  <GetDigits timeout="20" numDigits="1" callbackUrl="${selfUrl}">
    <Say>Press 1 for company information. Press 2 for operating hours. Press 3 to speak to an agent. Press 4 to repeat this menu. Press 5 to end the call.</Say>
  </GetDigits>
  <Say>Still no input received. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return res.send(xml);
  }

  // Handle selection
  if (digits === '1') {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thanks for calling. Our live demo is running. Visit our website or reply via SMS for more info. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return res.send(xml);
  }
  if (digits === '2') {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Our operating hours are Monday to Friday, eight A M to six P M East Africa Time. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return res.send(xml);
  }
  if (digits === '3') {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>All agents are currently busy. Please try again later, or send us an SMS. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return res.send(xml);
  }
  if (digits === '4') {
    const selfUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}/actions`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>${selfUrl}</Redirect>
</Response>`;
    return res.send(xml);
  }
  if (digits === '5') {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you. Ending the call now. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return res.send(xml);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Invalid choice. Goodbye.</Say>
  <Hangup/>
</Response>`;
  return res.send(xml);
});

// Convenience GET for actions (browser test)
router.get('/actions', (req, res) => {
  console.log('[Voice Actions][GET]', req.query);
  res.set('Content-Type', 'application/xml');
  const digits = req.query && (req.query.dtmfDigits || req.query.digits);
  if (!digits) {
    const host = req.get('host');
    const baseUrl = `https://${host}`; // force https for AT callbacks via ngrok
    const selfUrl = `${baseUrl}${req.originalUrl}`.split('?')[0];
    console.log('[Voice Actions][GET] Using callbackUrl:', selfUrl);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Welcome. Please choose an option.</Say>
  <GetDigits timeout="20" numDigits="1" callbackUrl="${selfUrl}">
    <Say>Press 1 for company information. Press 2 for operating hours. Press 3 to speak to an agent. Press 4 to repeat this menu. Press 5 to end the call.</Say>
  </GetDigits>
  <Say>No input received. Repeating the menu.</Say>
  <GetDigits timeout="20" numDigits="1" callbackUrl="${selfUrl}">
    <Say>Press 1 for company information. Press 2 for operating hours. Press 3 to speak to an agent. Press 4 to repeat this menu. Press 5 to end the call.</Say>
  </GetDigits>
  <Say>Still no input received. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return res.send(xml);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You entered ${digits}. Goodbye.</Say>
  <Hangup/>
</Response>`;
  res.send(xml);
});

module.exports = router;
