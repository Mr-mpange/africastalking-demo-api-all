const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
const errorHandler = require('./middleware/errorHandler');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: "Africa's Talking Sandbox Suite",
    time: new Date().toISOString(),
  });
});

app.use('/sms', require('./routes/sms'));
app.use('/ussd', require('./routes/ussd'));
app.use('/voice', require('./routes/voice'));
app.use('/airtime', require('./routes/airtime'));
app.use('/whatsapp', require('./routes/whatsapp'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});

module.exports = app;
