const express = require('express');
const at = require('../config/at');

const router = express.Router();
const voice = at.VOICE;

function xml(...body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${body.join('\n  ')}\n</Response>`;
}

function say(text) {
  const safeText = String(text).replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[char]);
  return `<Say>${safeText}</Say>`;
}

// Shared handler for the configured voice callback and explicit inbound alias.
function voiceActions(req, res) {
  res.set('Content-Type', 'application/xml');
  console.log('[Voice Actions]', req.body);

  const { isActive, dtmfDigits } = req.body || {};

  // Africa's Talking calls this callback for the lifetime of an active call.
  // An inactive call should return an empty response and must not start a new menu.
  if (String(isActive) === '0') {
    return res.send(xml());
  }

  if (!dtmfDigits) {
    return res.send(
      xml(
        say("Welcome to Africa's Talking voice sandbox."),
        '<GetDigits timeout="15" numDigits="1">',
        say('Press 1 to hear a greeting. Press 2 to hang up.'),
        '</GetDigits>'
      )
    );
  }

  if (dtmfDigits === '1') {
    return res.send(xml(say('Hello from the sandbox.')));
  }

  return res.send(xml(say('Goodbye.')));
}

// Configure this public callback URL in the Africa's Talking Voice dashboard
// for the number that should receive inbound calls.
router.post(['/actions', '/inbound'], voiceActions);

// POST /voice/events — call status events
router.post('/events', (req, res) => {
  console.log('[Voice Events]', req.body);
  res.status(200).send('OK');
});

router.get('/events', (req, res) => {
  console.log('[Voice Events][GET]', req.query);
  res.status(200).send('OK');
});

// POST /voice/call or /voice/outbound — outbound call.
router.post(['/call', '/outbound'], async (req, res) => {
  try {
    if (!process.env.AT_API_KEY) {
      return res.status(503).json({ error: 'AT_API_KEY is not configured' });
    }

    const { callFrom: requestedFrom, callTo, clientRequestId } = req.body || {};
    const callFrom = requestedFrom || process.env.AT_VOICE_PHONE_NUMBER;
    if (!callFrom || !callTo) {
      return res.status(400).json({ error: 'callFrom and callTo are required' });
    }

    const result = await voice.call({ callFrom, callTo, clientRequestId });
    return res.json({ ok: true, result });
  } catch (err) {
    const status = err.response?.status || 502;
    const details = err.response?.data || err.message || 'Africa\'s Talking Voice request failed';
    console.error('[Voice Call] error', details);
    return res.status(status).json({ error: 'Failed to initiate call', details });
  }
});

module.exports = router;
