const express = require('express');
const at = require('../config/at');

const router = express.Router();
const airtime = at.AIRTIME;

// POST /airtime/send
router.post('/send', async (req, res) => {
  try {
    const { phoneNumber, amount, currencyCode } = req.body;
    if (!phoneNumber || !amount) {
      return res.status(400).json({ error: 'phoneNumber and amount are required' });
    }

    const payload = {
      recipients: [
        {
          phoneNumber,
          currencyCode: currencyCode || 'KES',
          amount: String(amount), // e.g. '10' means 10 KES in sandbox
        },
      ],
    };

    const response = await airtime.send(payload);
    return res.json({ ok: true, response });
  } catch (err) {
    console.error('Airtime error', err);
    return res.status(500).json({ error: 'Failed to send airtime', details: err.message });
  }
});

module.exports = router;
