const express = require('express');
const axios = require('axios');
const at = require('../config/at');

const router = express.Router();

// NOTE:
// Africa's Talking WhatsApp requires a WhatsApp-enabled sender and product setup.
// The official Node SDK may not yet expose a dedicated WhatsApp helper.
// We use REST via axios with AT credentials. Configure the following env vars:
// - AT_USERNAME (already used elsewhere)
// - AT_API_KEY (already used elsewhere)
// - AT_WHATSAPP_API_URL (e.g., https://content.africastalking.com/whatsapp/<send-endpoint>)
// - AT_WHATSAPP_SENDER (your WhatsApp-enabled number or sender identifier)
// - AT_WHATSAPP_WEBHOOK_SECRET (optional: to verify webhook signatures if configured)

const { AT_USERNAME, AT_API_KEY, AT_WHATSAPP_API_URL, AT_WHATSAPP_SENDER } = process.env;

// Simple request logger for troubleshooting
router.use((req, res, next) => {
  try {
    console.log('[WhatsApp Route][Request]', {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: {
        host: req.get('host'),
        'content-type': req.get('content-type'),
        'user-agent': req.get('user-agent'),
      },
      bodyKeys: Object.keys(req.body || {}),
    });
  } catch (e) {}
  next();
});

// POST /whatsapp/send
// Body: { to: "+2547..." | ["+2547..."], message: "text", mediaUrl?: "https://...", template?: {...} }
router.post('/send', async (req, res) => {
  try {
    if (!AT_USERNAME || !AT_API_KEY) {
      return res.status(500).json({ error: 'Missing AT credentials. Set AT_USERNAME and AT_API_KEY in your .env' });
    }
    if (!AT_WHATSAPP_API_URL) {
      return res.status(500).json({ error: 'Missing AT_WHATSAPP_API_URL. Ask support for the correct WhatsApp send endpoint or add it when available.' });
    }

    const { to, message, mediaUrl, template } = req.body || {};
    if (!to || (!message && !template)) {
      return res.status(400).json({ error: 'to and (message or template) are required' });
    }

    const toList = Array.isArray(to) ? to : String(to).split(',').map(s => s.trim()).filter(Boolean);

    const payload = {
      username: AT_USERNAME,
      from: AT_WHATSAPP_SENDER, // may be required depending on setup
      to: toList,
      message,
      mediaUrl,
      template, // if using template messages, pass the object provided by AT guidelines
    };

    // Remove undefined keys
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    // Many AT REST endpoints accept x-www-form-urlencoded; others accept JSON.
    // We try JSON first; adjust if your product requires form encoding.
    const response = await axios.post(AT_WHATSAPP_API_URL, payload, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: AT_API_KEY,
      },
      timeout: 20000,
    });

    return res.json({ ok: true, response: response.data });
  } catch (err) {
    console.error('[WhatsApp][Send] error', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to send WhatsApp message', details: err.response?.data || err.message });
  }
});

// POST /whatsapp/webhook
// Configure this URL in the AT WhatsApp dashboard for inbound events/messages.
// AT will POST events such as inbound messages, delivery reports, etc.
router.post('/webhook', async (req, res) => {
  try {
    // Optional: verify signature if AT provides one (e.g., via X-Signature header and shared secret)
    const signature = req.get('x-signature');
    if (process.env.AT_WHATSAPP_WEBHOOK_SECRET && signature) {
      // TODO: implement signature verification based on AT's WhatsApp docs
      // Keep as a placeholder to not block development
    }

    const event = req.body || {};
    console.log('[WhatsApp][Webhook] event', JSON.stringify(event));

    // Example: auto-ack by replying via SMS or WhatsApp
    // For now, just 200 OK quickly to acknowledge receipt
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[WhatsApp][Webhook] error', err.message);
    // Still 200 OK to avoid retries storms during development
    return res.status(200).send('OK');
  }
});

module.exports = router;
