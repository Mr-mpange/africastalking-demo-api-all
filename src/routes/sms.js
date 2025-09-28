const express = require('express');
const at = require('../config/at');
const { generateReply } = require('../services/ai');

const router = express.Router();
const sms = at.SMS;

// POST /sms/send - 1-way SMS
router.post('/send', async (req, res) => {
  try {
    const { to, message, from } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'to and message are required' });
    }

    const options = {
      to: Array.isArray(to) ? to : String(to).split(',').map(s => s.trim()).filter(Boolean),
      message,
    };

    if (from) {
      options.from = from; // senderId or shortcode if approved
    } else if (process.env.AT_FROM_SHORTCODE) {
      options.from = String(process.env.AT_FROM_SHORTCODE);
    } else {
      console.warn('[SMS Send] No 2-way sender configured. Replies may NOT be delivered to your webhook. Set AT_FROM_SHORTCODE in .env or pass "from".');
    }

    const response = await sms.send(options);
    return res.json({ ok: true, response });
  } catch (err) {
    console.error('SMS send error', err);
    return res.status(500).json({ error: 'Failed to send SMS', details: err.message });
  }
});

// POST /sms/bulk - Bulk SMS
router.post('/bulk', async (req, res) => {
  try {
    const { recipients, message, from } = req.body;
    if (!recipients || !message) {
      return res.status(400).json({ error: 'recipients and message are required' });
    }

    const toList = Array.isArray(recipients)
      ? recipients
      : String(recipients).split(',').map(s => s.trim()).filter(Boolean);

    const options = { to: toList, message };
    if (from) options.from = from;

    const response = await sms.send(options);
    return res.json({ ok: true, count: toList.length, response });
  } catch (err) {
    console.error('Bulk SMS error', err);
    return res.status(500).json({ error: 'Failed to send bulk SMS', details: err.message });
  }
});

// POST /sms/inbound - 2-way SMS webhook
// Africa's Talking will POST fields like: text, date, id, linkId, to, from
router.post('/inbound', async (req, res) => {
  try {
    const { text, from, to, date, id, linkId } = req.body;
    const debug = req.query.debug === '1' || req.header('x-debug') === '1';
    console.log('[Inbound SMS]', { text, from, to, date, id, linkId, debug });

    // AI-powered reply using Gemini
    let aiText;
    if (from && typeof text === 'string') {
      try {
        aiText = await generateReply(text, from);
        const replyFrom = process.env.AT_FROM_SHORTCODE || to; // ensure reply via shortcode for 2-way
        const sendOptions = { to: [from], message: aiText };
        if (replyFrom) sendOptions.from = String(replyFrom);
        if (linkId) sendOptions.linkId = linkId; // required for premium 2-way continuity
        console.log('[AI Reply]', { to: from, from: replyFrom, linkId, aiText });
        await sms.send(sendOptions);
      } catch (e) {
        console.warn('AI reply failed; falling back to simple ack:', e.message);
        try {
          const replyFrom = process.env.AT_FROM_SHORTCODE || to;
          const sendOptions = { to: [from], message: `Ack: ${text}` };
          if (replyFrom) sendOptions.from = String(replyFrom);
          if (linkId) sendOptions.linkId = linkId;
          await sms.send(sendOptions);
        } catch (e2) {
          console.warn('Fallback reply failed', e2.message);
        }
      }
    }

    // Must respond 200 quickly
    if (debug && aiText) {
      return res.status(200).json({ ok: true, aiText });
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Inbound SMS error', err);
    res.status(200).send('OK');
  }
});

module.exports = router;
