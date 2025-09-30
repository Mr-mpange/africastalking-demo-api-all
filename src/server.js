const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Needed for USSD and AT webhooks

// Health
app.get('/health', (req, res) => {
  res.json({ ok: true, service: "Africa's Talking Sandbox Suite", time: new Date().toISOString() });
});

// Routes
app.use('/sms', require('./routes/sms'));
app.use('/ussd', require('./routes/ussd'));
app.use('/voice', require('./routes/voice'));
app.use('/airtime', require('./routes/airtime'));
app.use('/whatsapp', require('./routes/whatsapp'));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
