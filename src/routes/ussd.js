const express = require('express');
const at = require('../config/at');
const axios = require('axios');

const router = express.Router();
const voice = at.VOICE;

// USSD Endpoint
// AT sends: sessionId, serviceCode, phoneNumber, text
router.post('/', async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  console.log('[USSD]', { sessionId, serviceCode, phoneNumber, text });

  // Simple menu flow
  if (!text || text === '') {
    const response = 'CON Welcome to AT USSD\n1. Balance\n2. Buy Airtime\n3. Help\n4. Call Assistance';
    return res.send(response);
  }

  if (text === '1') {
    const response = 'END Your balance is KES 123.45 (sandbox)';
    return res.send(response);
  }

  if (text === '2') {
    const response = 'CON Enter amount:';
    return res.send(response);
  }

  // e.g., '2*100'
  if (text.startsWith('2*')) {
    const amount = text.split('*')[1] || '0';
    const response = `END Airtime purchase of KES ${amount} processed (sandbox).`;
    return res.send(response);
  }

  if (text === '3') {
    return res.send('END For assistance, reply via SMS or choose option 4 to get a call.');
  }

  if (text === '4') {
    // Trigger outbound voice call from AT number to the USSD caller
    const callFrom = process.env.AT_VOICE_PHONE_NUMBER;
    const callTo = phoneNumber; // MSISDN of USSD caller
    if (!callFrom) {
      console.warn('[USSD] AT_VOICE_PHONE_NUMBER missing. Cannot initiate call.');
      return res.send('END Calling is not configured.');
    }
    try {
      try {
        await voice.call({ callFrom, callTo });
        console.log('[USSD] Voice call initiated via SDK', { callFrom, callTo });
      } catch (sdkErr) {
        console.warn('[USSD] SDK call failed, using REST fallback:', sdkErr.message);
        const { AT_USERNAME, AT_API_KEY } = process.env;
        if (!AT_USERNAME || !AT_API_KEY) {
          console.warn('[USSD] Missing AT credentials for REST fallback');
          return res.send('END Could not initiate the call.');
        }
        const form = new URLSearchParams();
        form.append('username', AT_USERNAME);
        form.append('from', callFrom);
        form.append('to', callTo);
        await axios.post('https://voice.africastalking.com/call', form.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            apikey: AT_API_KEY,
          },
          timeout: 15000,
        });
        console.log('[USSD] Voice call initiated via REST', { callFrom, callTo });
      }
      return res.send('END We are calling you now. Please pick up.');
    } catch (err) {
      console.error('[USSD] Failed to initiate call', err.message);
      return res.send('END Sorry, failed to initiate the call.');
    }
  }

  return res.send('END Invalid choice');
});

module.exports = router;
