const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
const errorHandler = require('./middleware/errorHandler');
const runMigrations = require('./database/migrate');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('dev'));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/health', (req, res) => {
  res.json({ 
    ok: true, 
    service: "Africa's Talking Sandbox Suite", 
    time: new Date().toISOString() 
  });
});

// Run migrations lazily on first request (avoids Cloud SQL cold-start timeout)
let migrationsDone = false;
app.use((req, res, next) => {
  if (!migrationsDone) {
    migrationsDone = true;
    runMigrations()
      .then(() => console.log('Migrations complete'))
      .catch(err => { console.error('Migration error:', err.message); migrationsDone = false; });
  }
  next();
});

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/sms', require('./routes/sms'));
app.use('/ussd', require('./routes/ussd'));
app.use('/voice', require('./routes/voice'));
app.use('/airtime', require('./routes/airtime'));
app.use('/whatsapp', require('./routes/whatsapp'));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use(errorHandler);

// Start
app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});

module.exports = app;
