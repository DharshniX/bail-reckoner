const jwt = require('jsonwebtoken');
const { User } = require('../models');

const DEV_SECRET = 'dev-only-secret-change-me';
// Placeholder values that must never protect a real deployment
const WEAK_SECRETS = [DEV_SECRET, 'change-this-to-a-long-random-string'];

const secret = () => process.env.JWT_SECRET || DEV_SECRET;

/** In production a real JWT_SECRET is required (Render generates one); called once at startup. */
function assertJwtSecret() {
  if (process.env.NODE_ENV !== 'production') return;
  const value = process.env.JWT_SECRET || '';
  if (WEAK_SECRETS.includes(value) || value.length < 32) {
    throw new Error('JWT_SECRET must be set to a long random value (32+ characters) in production.');
  }
}

// Admin sessions are deliberately short-lived; normal users stay logged in for a week.
const TOKEN_TTL = { admin: '8h', user: '7d' };

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, secret(), { expiresIn: TOKEN_TTL[user.role] || TOKEN_TTL.user });
}

/** Returns the user for a valid Bearer token, or null. */
async function readUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret());
    const user = await User.findById(payload.sub);
    if (!user || !user.active) return null;               // deleted or deactivated account
    if (payload.role !== user.role) return null;          // role changed since the token was issued
    if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      return null;                                        // password changed/reset: old sessions end
    }
    return user;
  } catch {
    return null;                                          // bad signature or expired
  }
}

/** Attaches req.user if a valid token is present; never blocks. */
async function optionalAuth(req, _res, next) {
  req.user = await readUser(req);
  next();
}

/** Requires a logged-in user. */
async function requireAuth(req, res, next) {
  req.user = await readUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

/** Requires an admin user. */
async function requireAdmin(req, res, next) {
  req.user = await readUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

module.exports = { assertJwtSecret, signToken, optionalAuth, requireAuth, requireAdmin };
