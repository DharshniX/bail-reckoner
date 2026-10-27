const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const { Rule } = require('./models');

function createApp() {
  const app = express();
  // Render (like most hosts) sits behind one proxy. Trusting it makes req.ip the real visitor's
  // address, so the login rate limit and lockouts count per visitor, not per proxy.
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }));
  app.use(cors());
  app.use(express.json({ limit: '200kb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  // Basic protection against brute-force login attempts
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

  app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
  app.get('/api/meta', async (req, res) => {
    const rules = await Rule.find({}, { key: 1, version: 1, updatedAt: 1 }).lean();
    const lastUpdated = rules.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), new Date(0));
    res.json({ rulesVersion: rules.reduce((s, r) => s + (r.version || 1), 0), rulesCount: rules.length, lastUpdated });
  });

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', require('./routes/public'));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Frontend pages. The admin portal has its own login page, and every admin section
  // (/admin/rules, /admin/users, ...) is served by admin.html, which shows the matching panel.
  const publicDir = path.join(__dirname, '..', 'public');
  const ADMIN_SECTIONS = ['rules', 'offences', 'provisions', 'users', 'changelog'];
  app.get('/admin/login', (req, res) => res.sendFile(path.join(publicDir, 'admin-login.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
  app.get('/admin/:section', (req, res, next) =>
    (ADMIN_SECTIONS.includes(req.params.section) ? res.sendFile(path.join(publicDir, 'admin.html')) : next()));

  // Static HTML/CSS/JS (/login -> login.html, /profile -> profile.html, ...)
  app.use(express.static(publicDir, { extensions: ['html'] }));

  // Central error handler (Express 5 forwards async errors here)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id.' });
    if (err.code === 11000) return res.status(409).json({ error: 'A record with this key already exists.' });
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
  });

  return app;
}

module.exports = createApp;
