const express = require('express');

const router = express.Router();

// USSD Endpoint
// AT sends: sessionId, serviceCode, phoneNumber, text
router.post('/', (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  console.log('[USSD]', { sessionId, serviceCode, phoneNumber, text });

  // Simple menu flow
  if (!text || text === '') {
    const response = 'CON Welcome to AT Sandbox USSD\n1. Balance\n2. Buy Airtime';
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

  return res.send('END Invalid choice');
});

module.exports = router;
