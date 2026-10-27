const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { User, Assessment } = require('../models');
const { signToken, requireAuth } = require('../middleware/auth');
const { isEmail, passwordProblem, cleanName } = require('../utils/validate');

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password
// (otherwise response timing would reveal which emails are registered).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 10);

// Per-IP limit on the login routes, on top of the per-account lockout below.
// Only failed attempts count, so normal users are never slowed down.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network. Please try again in 15 minutes.' },
});

/**
 * Shared login logic for both portals.
 *   portal = 'user'  -> POST /api/auth/login        (admins are sent to the admin portal)
 *   portal = 'admin' -> POST /api/auth/admin/login  (non-admins get 403)
 * Order matters: lock check -> password check -> role/active checks. The role is only revealed
 * after a correct password, so the portal message can't be used to discover admin emails.
 */
function loginHandler(portal) {
  return async (req, res) => {
    const { email, password } = req.body || {};
    if (!isEmail(email) || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Enter your email and password.' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    if (user.isLocked()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ error: `Too many failed attempts. This account is locked for ${mins} more minute${mins === 1 ? '' : 's'}.` });
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      // $inc is atomic, so parallel attempts can't slip past the limit
      const updated = await User.findByIdAndUpdate(user._id, { $inc: { failedLogins: 1 } }, { returnDocument: 'after' });
      if (updated.failedLogins >= MAX_FAILED_LOGINS) {
        await User.updateOne({ _id: user._id }, { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MINUTES * 60000) });
        return res.status(423).json({ error: `Too many failed attempts. This account is locked for ${LOCK_MINUTES} minutes.` });
      }
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    // Correct password: clear the failure counter whatever happens next
    user.failedLogins = 0;
    user.lockUntil = null;

    if (portal === 'user' && user.role === 'admin') {
      await user.save();
      return res.status(403).json({ error: 'Please use the admin portal to sign in.' });
    }
    if (portal === 'admin' && user.role !== 'admin') {
      await user.save();
      return res.status(403).json({ error: 'This portal is for administrators only.' });
    }
    if (!user.active) {
      await user.save();
      return res.status(403).json({ error: 'This account has been deactivated. Please contact the administrator.' });
    }

    user.lastLoginAt = new Date();
    await user.save();
    res.json({ token: signToken(user), user: user.toSafeJSON() });
  };
}

router.post('/login', loginLimiter, loginHandler('user'));
router.post('/admin/login', loginLimiter, loginHandler('admin'));

// Public registration — always creates a normal user. Admins are created only by the seed
// script (ADMIN_EMAIL / ADMIN_PASSWORD) or by another admin from the admin panel.
router.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Enter your name (up to 80 characters).' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });

  const exists = await User.exists({ email: email.trim().toLowerCase() });
  if (exists) return res.status(409).json({ error: 'An account with this email already exists.' });

  const user = await User.create({ name, email, role: 'user', lastLoginAt: new Date(), passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
});

// ---------- Profile (logged-in user) ----------
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toSafeJSON() }));

router.put('/me', requireAuth, async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Enter your name (up to 80 characters).' });
  req.user.name = name;
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
});

// Wrong current password returns 400 (not 401) so the browser doesn't treat it as "logged out".
router.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  const problem = passwordProblem(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  if (newPassword === currentPassword) return res.status(400).json({ error: 'Choose a password different from the current one.' });

  req.user.passwordHash = await bcrypt.hash(newPassword, 10);
  req.user.passwordChangedAt = new Date(); // logs out other devices
  await req.user.save();
  // Issue a fresh token so this browser stays logged in
  res.json({ token: signToken(req.user), user: req.user.toSafeJSON() });
});

// Delete own account (and its saved assessments). Admin accounts are managed from the admin panel.
router.delete('/me', requireAuth, async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Admin accounts cannot be deleted from here.' });
  const { password } = req.body || {};
  if (typeof password !== 'string' || !(await bcrypt.compare(password, req.user.passwordHash))) {
    return res.status(400).json({ error: 'Password is incorrect.' });
  }
  await Assessment.deleteMany({ user: req.user._id });
  await User.deleteOne({ _id: req.user._id });
  res.json({ ok: true });
});

module.exports = router;
