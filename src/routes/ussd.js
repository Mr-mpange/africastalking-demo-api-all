const express = require('express');

const router = express.Router();

function steps(text) {
  if (!text || String(text).trim() === '') return [];
  return String(text).split('*');
}

// POST /ussd — Africa's Talking USSD callback
router.post('/', (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  console.log('[USSD]', { sessionId, serviceCode, phoneNumber, text });

  const s = steps(text);

  if (s.length === 0) {
    return res.send(
      "CON Africa's Talking Sandbox\n1. SMS demo info\n2. Airtime demo info\n0. Exit"
    );
  }

  if (s[0] === '0') {
    return res.send('END Thank you. Goodbye!');
  }

  if (s.length === 1) {
    if (s[0] === '1') {
      return res.send('END SMS: POST /sms/send with to and message.');
    }
    if (s[0] === '2') {
      return res.send('END Airtime: POST /airtime/send with phoneNumber and amount.');
    }
    return res.send('END Invalid option.');
  }

  return res.send('END Invalid option.');
});

module.exports = router;
