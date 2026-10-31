const express = require('express');
const at = require('../config/at');
const { getAirtimeRules } = require('../utils/airtime');

const router = express.Router();
const sms = at.SMS;
const airtime = at.AIRTIME;

function steps(text) {
  if (!text || String(text).trim() === '') return [];
  return String(text).split('*');
}

// POST /ussd — Africa's Talking USSD callback. The menu also exercises SMS
// and Airtime, so all of the sandbox solutions can be tried from one session.
router.post(['/', '/callback'], async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text = '' } = req.body || {};
  console.log('[USSD]', { sessionId, serviceCode, phoneNumber, text });

  const s = steps(text);
  const reply = (body) => res.type('text/plain').send(body);

  if (s.length === 0) {
    return reply("CON Africa's Talking Sandbox\n1. Send demo SMS\n2. Buy airtime\n0. Exit");
  }

  if (s[0] === '0') {
    return res.send('END Thank you. Goodbye!');
  }

  if (s[0] === '1' && s.length === 1) {
    return reply('CON Enter the SMS message to send:');
  }

  if (s[0] === '1' && s.length === 2) {
    try {
      const result = await sms.send({ to: [phoneNumber], message: s[1] });
      return reply('END SMS sent. Thank you.');
    } catch (err) {
      console.error('[USSD][SMS] error', err.message);
      return reply('END Could not send SMS. Please try again later.');
    }
  }

  if (s[0] === '2' && s.length === 1) {
    const { currencyCode, minimum } = getAirtimeRules(phoneNumber);
    return reply(`CON Enter airtime amount (${currencyCode}; minimum ${minimum}):`);
  }

  if (s[0] === '2' && s.length === 2) {
    const amount = Number(s[1]);
    if (!Number.isFinite(amount) || amount <= 0) return reply('END Enter a valid amount.');
    const { currencyCode, minimum, countryCurrencyMismatch } = getAirtimeRules(phoneNumber);
    if (countryCurrencyMismatch) {
      return reply(`END Airtime currency does not match this phone number. Set AT_AIRTIME_CURRENCY to ${getAirtimeRules(phoneNumber).currencyCode}.`);
    }
    if (amount < minimum) return reply(`END Minimum airtime is ${minimum} ${currencyCode}.`);
    try {
      await airtime.send({
        recipients: [{ phoneNumber, currencyCode, amount }],
        maxNumRetry: 1,
      });
      return reply('END Airtime request submitted. Thank you.');
    } catch (err) {
      console.error('[USSD][Airtime] error', err.response?.data || err.message);
      return reply('END Airtime request failed. Check the number, amount, currency, and sandbox airtime settings.');
    }
  }

  return reply('END Invalid option.');
});

module.exports = router;
