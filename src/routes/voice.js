const express = require('express');
const axios = require('axios');
const at = require('../config/at');

const router = express.Router();
const voice = at.VOICE;

function xml(...body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${body.join('\n  ')}\n</Response>`;
}

function say(text) {
  return `<Say>${text}</Say>`;
}

// POST /voice/actions — Voice callback (IVR instructions)
router.post('/actions', (req, res) => {
  res.set('Content-Type', 'application/xml');
  console.log('[Voice Actions]', req.body);

  const { isActive, dtmfDigits } = req.body;

  if (String(isActive) === '0') {
    return res.send(xml());
  }

  if (!dtmfDigits) {
    return res.send(
      xml(
        say("Welcome to Africa's Talking voice sandbox."),
        '<GetDigits timeout="15" numDigits="1">',
        say('Press 1 to hear a greeting. Press 2 to hang up.'),
        '</GetDigits>',
        say('No input received. Goodbye.'),
        '<Hangup/>'
      )
    );
  }

  if (dtmfDigits === '1') {
    return res.send(xml(say('Hello from the sandbox.'), '<Hangup/>'));
  }

  return res.send(xml(say('Goodbye.'), '<Hangup/>'));
});

// POST /voice/events — call status events
router.post('/events', (req, res) => {
  console.log('[Voice Events]', req.body);
  res.status(200).send('OK');
});

router.get('/events', (req, res) => {
  console.log('[Voice Events][GET]', req.query);
  res.status(200).send('OK');
});

// POST /voice/call — outbound call
router.post('/call', async (req, res) => {
  try {
    const callFrom = req.body.callFrom || process.env.AT_VOICE_PHONE_NUMBER;
    const callTo = req.body.callTo;
    if (!callFrom || !callTo) {
      return res.status(400).json({ error: 'callFrom and callTo are required' });
    }

    try {
      const result = await voice.call({ callFrom, callTo });
      return res.json({ ok: true, via: 'sdk', result });
    } catch (sdkErr) {
      const form = new URLSearchParams();
      form.append('username', process.env.AT_USERNAME);
      form.append('from', callFrom);
      form.append('to', callTo);
      const r = await axios.post('https://voice.africastalking.com/call', form.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          apikey: process.env.AT_API_KEY,
        },
        timeout: 15000,
      });
      return res.json({ ok: true, via: 'rest', data: r.data });
    }
  } catch (err) {
    console.error('[Voice Call] error', err);
    return res.status(500).json({ error: 'Failed to initiate call', details: err.message });
  }
});

module.exports = router;
