/**
 * Small input-validation helpers shared by the API routes.
 * Every check runs on the server — the browser checks are only for convenience.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

function isEmail(v) {
  return typeof v === 'string' && v.trim().length <= 254 && EMAIL_RE.test(v.trim());
}

/** Returns an error message, or null when the password is acceptable. */
function passwordProblem(v) {
  if (typeof v !== 'string' || v.length < 8) return 'Password must be at least 8 characters.';
  // bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated
  if (Buffer.byteLength(v) > 72) return 'Password is too long (maximum 72 characters).';
  if (!/\d/.test(v)) return 'Password must contain at least one number.';
  return null;
}

/** Trimmed display name (1–80 characters), or null if invalid. */
function cleanName(v) {
  if (typeof v !== 'string') return null;
  const name = v.trim();
  return name && name.length <= 80 ? name : null;
}

function isObjectId(v) {
  return typeof v === 'string' && OBJECT_ID_RE.test(v);
}

/** For router.param('id', ...): rejects malformed ids before they reach MongoDB. */
function validateIdParam(req, res, next, id) {
  if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid id.' });
  next();
}

/** Escapes text for safe use inside a RegExp (used by search boxes). */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { isEmail, passwordProblem, cleanName, isObjectId, validateIdParam, escapeRegex };
