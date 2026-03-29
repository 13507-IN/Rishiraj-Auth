const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const apiKeyRoutes = require('./routes/apiKeyRoutes');
const { configurePassport, passport } = require('./config/passport');

const app = express();

configurePassport();

app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id']
}));
app.use(express.json({ limit: '10kb' }));
app.use(morgan('combined'));
app.use(passport.initialize());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/admin', adminRoutes);
app.use('/api-keys', apiKeyRoutes);

const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.get('/oauth-success', (req, res) => {
  res.sendFile(path.join(frontendPath, 'oauth-success.html'));
});

app.get('/oauth-failed', (req, res) => {
  res.status(401).send('OAuth failed. Please try again.');
});

app.use(errorHandler);

module.exports = app;