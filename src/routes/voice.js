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

function buildMenuXml(selfUrl, lang = 'en') {
  const prompts = {
    en: {
      intro: 'Main menu. Please choose an option.',
      options: 'Press 1 to ask anything. Press 2 for company information. Press 3 to speak to an agent. Press 4 to repeat this menu. Press 5 to end the call.',
      noInput: 'No input received. Repeating the menu.'
    },
    sw: {
      intro: 'Menyu kuu. Tafadhali chagua chaguo.',
      options: 'Bonyeza 1 kuuliza chochote. Bonyeza 2 kupata taarifa za kampuni. Bonyeza 3 kuzungumza na wakala. Bonyeza 4 kurudia menyu hii. Bonyeza 5 kukata simu.',
      noInput: 'Hakuna ingizo. Kurudia menyu.'
    }
  };
  const p = prompts[lang] || prompts.en;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${p.intro}</Say>
  <GetDigits timeout="20" numDigits="1" callbackUrl="${selfUrl}">
    <Say>${p.options}</Say>
  </GetDigits>
  <Say>${p.noInput}</Say>
  <Redirect>${selfUrl.replace('/digits', '/actions')}</Redirect>
</Response>`;
}

function handleSelectionXml(digits, lang = 'en') {
  const msg = (en, sw) => (lang === 'sw' ? sw : en);
  if (digits === '1') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${msg('Thanks for calling. Ask your question via SMS and we will respond. Goodbye.', 'Asante kwa kupiga simu. Uliza swali lako kwa SMS na tutajibu. Kwaheri.')}</Say>
  <Hangup/>
</Response>`;
  }
  if (digits === '2') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${msg('Our company offers digital solutions and support. Operating hours: Monday to Friday, 8 A M to 6 P M E A T. Goodbye.', 'Kampuni yetu hutoa huduma za kidijitali na usaidizi. Saa za kazi: Jumatatu hadi Ijumaa, saa 2 asubuhi hadi saa 12 jioni E A T. Kwaheri.')}</Say>
  <Hangup/>
</Response>`;
  }
  if (digits === '3') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${msg('All agents are busy. Please try again later or send us an SMS. Goodbye.', 'Wakala wote wana hudumia wengine. Jaribu tena baadaye au tuma SMS. Kwaheri.')}</Say>
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
  <Say>${msg('Thank you. Ending the call now. Goodbye.', 'Asante. Tunakata simu sasa. Kwaheri.')}</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${msg('Invalid choice. Goodbye.', 'Chaguo batili. Kwaheri.')}</Say>
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
    // Step 1: Language selection (1 English, 2 Swahili)
    const host = req.get('host');
    const baseUrl = `https://${host}`;
    const langUrl = `${baseUrl}${req.baseUrl}/lang`;
    console.log('[Voice Actions] Using language callbackUrl:', langUrl);
    // FIRST-HIT marker when call is active and no digits yet
    if (isActive === '1') {
      console.log('[Voice Actions][FIRST-HIT] Active call, serving language selection');
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Choose language. Press 1 for English. Press 2 for Swahili.</Say>
  <GetDigits timeout="20" numDigits="1" callbackUrl="${langUrl}">
    <Say>Press 1 for English. Press 2 for Swahili.</Say>
  </GetDigits>
  <Say>No input received. Returning to language selection.</Say>
  <Redirect>${baseUrl}/voice/actions</Redirect>
</Response>`;
    console.log('[Voice Actions] XML preview:', xml.slice(0, 140).replace(/\n/g, ' '), '...');
    return res.send(xml);
  }

  // Handle selection (rare case AT posts digits here)
  // Rare case AT posts digits here; default to English
  return res.send(handleSelectionXml(digits, 'en'));
});

// Convenience GET for actions (browser test)
router.get('/actions', (req, res) => {
  console.log('[Voice Actions][GET]', req.query);
  res.set('Content-Type', 'application/xml');
  const digits = req.query && (req.query.dtmfDigits || req.query.digits);
  if (!digits) {
    const host = req.get('host');
    const baseUrl = `https://${host}`;
    const langUrl = `${baseUrl}${req.baseUrl}/lang`;
    console.log('[Voice Actions][GET] Using language callbackUrl:', langUrl);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Choose language. Press 1 for English. Press 2 for Swahili.</Say>
  <GetDigits timeout="20" numDigits="1" callbackUrl="${langUrl}">
    <Say>Press 1 for English. Press 2 for Swahili.</Say>
  </GetDigits>
  <Say>No input received. Returning to language selection.</Say>
  <Redirect>/voice/actions</Redirect>
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

// Dedicated handler for DTMF callbacks from <GetDigits>
router.post('/digits', (req, res) => {
  console.log('[Voice Digits][POST]', req.body);
  res.set('Content-Type', 'application/xml');
  const digits = (req.body && (req.body.dtmfDigits || req.body.digits)) || '';
  const lang = (req.query && req.query.lang) || 'en';
  return res.send(handleSelectionXml(digits, lang));
});

router.get('/digits', (req, res) => {
  console.log('[Voice Digits][GET]', req.query);
  res.set('Content-Type', 'application/xml');
  const digits = (req.query && (req.query.dtmfDigits || req.query.digits)) || '';
  const lang = (req.query && req.query.lang) || 'en';
  return res.send(handleSelectionXml(digits || '5', lang));
});

// Language selection callback
router.post('/lang', (req, res) => {
  console.log('[Voice Lang][POST]', req.body);
  res.set('Content-Type', 'application/xml');
  const digit = (req.body && (req.body.dtmfDigits || req.body.digits)) || '';
  const host = req.get('host');
  const baseUrl = `https://${host}`;
  const lang = digit === '2' ? 'sw' : 'en';
  const digitsUrl = `${baseUrl}${req.baseUrl}/digits?lang=${lang}`;
  return res.send(buildMenuXml(digitsUrl, lang));
});

router.get('/lang', (req, res) => {
  console.log('[Voice Lang][GET]', req.query);
  res.set('Content-Type', 'application/xml');
  const host = req.get('host');
  const baseUrl = `https://${host}`;
  const lang = (req.query && req.query.lang) === 'sw' ? 'sw' : 'en';
  const digitsUrl = `${baseUrl}${req.baseUrl}/digits?lang=${lang}`;
  return res.send(buildMenuXml(digitsUrl, lang));
});

module.exports = router;
