const express = require('express');
const at = require('../config/at');
const { getAirtimeRules } = require('../utils/airtime');

const router = express.Router();
const airtime = at.AIRTIME;

// POST /airtime/send
router.post('/send', async (req, res) => {
  try {
    const { phoneNumber, amount, currencyCode } = req.body || {};
    const numericAmount = Number(amount);
    if (!phoneNumber || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'phoneNumber and amount are required' });
    }

    const rules = getAirtimeRules(phoneNumber, currencyCode);
    if (rules.countryCurrencyMismatch) {
      return res.status(400).json({
        error: `currencyCode ${rules.currencyCode} does not match this phone number; expected ${getAirtimeRules(phoneNumber).currencyCode}`,
      });
    }
    if (numericAmount < rules.minimum) {
      return res.status(400).json({
        error: `Minimum airtime amount is ${rules.minimum} ${rules.currencyCode}`,
      });
    }

    const payload = {
      recipients: [
        {
          phoneNumber,
          currencyCode: rules.currencyCode,
          amount: numericAmount,
        },
      ],
    };

    const response = await airtime.send({ ...payload, maxNumRetry: 1 });
    return res.json({ ok: true, response });
  } catch (err) {
    console.error('Airtime error', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: 'Failed to send airtime',
      details: err.response?.data || err.message,
    });
  }
});

module.exports = router;
