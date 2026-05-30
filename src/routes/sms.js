const express = require('express');
const at = require('../config/at');

const router = express.Router();
const sms = at.SMS;

router.use((req, res, next) => {
  console.log('[SMS]', req.method, req.path, req.body);
  next();
});

// POST /sms/send
router.post('/send', async (req, res) => {
  try {
    const { to, message, from } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'to and message are required' });
    }

    const isSandbox = (process.env.AT_USERNAME || 'sandbox') === 'sandbox';
    const options = {
      to: Array.isArray(to) ? to : String(to).split(',').map((s) => s.trim()).filter(Boolean),
      message,
    };

    if (from) {
      options.from = from;
    } else if (!isSandbox && process.env.AT_FROM_SHORTCODE) {
      options.from = String(process.env.AT_FROM_SHORTCODE);
    }

    const response = await sms.send(options);
    return res.json({ ok: true, response });
  } catch (err) {
    console.error('SMS send error', err);
    return res.status(500).json({ error: 'Failed to send SMS', details: err.message });
  }
});

// POST /sms/bulk
router.post('/bulk', async (req, res) => {
  try {
    const { recipients, message, from } = req.body;
    if (!recipients || !message) {
      return res.status(400).json({ error: 'recipients and message are required' });
    }

    const isSandbox = (process.env.AT_USERNAME || 'sandbox') === 'sandbox';
    const toList = Array.isArray(recipients)
      ? recipients
      : String(recipients).split(',').map((s) => s.trim()).filter(Boolean);

    const options = { to: toList, message };
    if (from) {
      options.from = from;
    } else if (!isSandbox && process.env.AT_FROM_SHORTCODE) {
      options.from = String(process.env.AT_FROM_SHORTCODE);
    }

    const response = await sms.send(options);
    return res.json({ ok: true, count: toList.length, response });
  } catch (err) {
    console.error('Bulk SMS error', err);
    return res.status(500).json({ error: 'Failed to send bulk SMS', details: err.message });
  }
});

// POST /sms/inbound — 2-way SMS webhook
router.post('/inbound', async (req, res) => {
  try {
    const { text, from, to, linkId } = req.body;
    console.log('[Inbound SMS]', { text, from, to, linkId });

    if (from && typeof text === 'string') {
      const isSandbox = (process.env.AT_USERNAME || 'sandbox') === 'sandbox';
      const replyFrom =
        !isSandbox && process.env.AT_FROM_SHORTCODE
          ? String(process.env.AT_FROM_SHORTCODE)
          : to || undefined;
      const sendOptions = { to: [from], message: `Ack: ${text}` };
      if (replyFrom) sendOptions.from = replyFrom;
      if (linkId) sendOptions.linkId = linkId;

      try {
        await sms.send(sendOptions);
      } catch (e) {
        console.warn('[Inbound SMS] auto-reply failed:', e.message);
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Inbound SMS error', err);
    res.status(200).send('OK');
  }
});

module.exports = router;
