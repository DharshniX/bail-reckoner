const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { Offence, Provision, Rule, ChangeLog, User, Assessment } = require('../models');
const { requireAdmin } = require('../middleware/auth');
const { isEmail, passwordProblem, cleanName, validateIdParam, escapeRegex } = require('../utils/validate');

router.use(requireAdmin);
router.param('id', validateIdParam);

const log = (entity, ref, action, summary, user) =>
  ChangeLog.create({ entity, ref, action, summary, by: user.email });

const OFFENCE_FIELDS = ['section', 'ipc', 'title', 'chapter', 'category', 'punishment', 'minYears', 'maxYears', 'maxLife', 'death', 'bailable', 'cognizable', 'triableBy', 'active'];
const PROVISION_FIELDS = ['code', 'act', 'section', 'oldSection', 'type', 'title', 'summary', 'plain', 'reference'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k] === '' ? null : obj[k]]));

/** Midnight today in India (IST, UTC+5:30), as a UTC Date — the server itself runs on UTC. */
function startOfTodayIST() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const d = new Date(Date.now() + IST_OFFSET_MS);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST_OFFSET_MS);
}

// ---------- Dashboard ----------
router.get('/stats', async (req, res) => {
  const [offences, provisions, rules, pending, users, admins, assessments, assessmentsToday, topOffences] = await Promise.all([
    Offence.countDocuments(), Provision.countDocuments(), Rule.countDocuments(),
    Rule.countDocuments({ pending: { $ne: null } }),
    User.countDocuments({ role: 'user' }), User.countDocuments({ role: 'admin' }),
    Assessment.countDocuments(), Assessment.countDocuments({ createdAt: { $gte: startOfTodayIST() } }),
    // Most-assessed offences: one count per saved assessment that included the section
    Assessment.aggregate([
      { $unwind: '$result.offences' },
      { $group: { _id: '$result.offences.section', title: { $first: '$result.offences.title' }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 5 },
      { $project: { _id: 0, section: '$_id', title: 1, count: 1 } },
    ]),
  ]);
  res.json({ offences, provisions, rules, pending, users, admins, assessments, assessmentsToday, topOffences });
});

// ---------- Users ----------
const toUserRow = (u, counts) => ({
  id: u._id, name: u.name, email: u.email, role: u.role, active: u.active !== false,
  locked: !!u.lockUntil && u.lockUntil > Date.now(),
  lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, assessments: counts.get(String(u._id)) || 0,
});

// List / search users (by name or email). passwordHash is excluded at the query level.
router.get('/users', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const rx = new RegExp(escapeRegex(q), 'i');
  const filter = q ? { $or: [{ name: rx }, { email: rx }] } : {};
  const users = await User.find(filter).select('-passwordHash').sort({ role: 1, createdAt: -1 }).limit(200).lean();
  const counts = await Assessment.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) } } },
    { $group: { _id: '$user', n: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(users.map((u) => toUserRow(u, countMap)));
});

// Create another admin account (the only way, besides the seed, to get an admin)
router.post('/users', async (req, res) => {
  const { email, password } = req.body || {};
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Enter a name (up to 80 characters).' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  if (await User.exists({ email: email.trim().toLowerCase() })) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const user = await User.create({ name, email, role: 'admin', passwordHash: await bcrypt.hash(password, 10) });
  await log('user', user.email, 'create', `Created admin account ${user.email}`, req.user);
  res.status(201).json(toUserRow(user, new Map()));
});

// Deactivate / reactivate
router.patch('/users/:id/status', async (req, res) => {
  const { active } = req.body || {};
  if (typeof active !== 'boolean') return res.status(400).json({ error: '"active" must be true or false.' });
  if (String(req.user._id) === req.params.id) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  const user = await User.findByIdAndUpdate(req.params.id, { active }, { returnDocument: 'after' });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  await log('user', user.email, active ? 'reactivate' : 'deactivate', `${active ? 'Reactivated' : 'Deactivated'} ${user.email}`, req.user);
  res.json(toUserRow(user, new Map()));
});

// Reset a password (also unlocks the account and ends the user's existing sessions)
router.post('/users/:id/reset-password', async (req, res) => {
  const { password } = req.body || {};
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordChangedAt = new Date();
  user.failedLogins = 0;
  user.lockUntil = null;
  await user.save();
  await log('user', user.email, 'reset-password', `Reset password for ${user.email}`, req.user);
  res.json({ ok: true });
});

// ---------- Offences ----------
router.get('/offences', async (req, res) => res.json(await Offence.find().sort({ section: 1 }).lean()));

router.post('/offences', async (req, res) => {
  const data = pick(req.body, OFFENCE_FIELDS);
  if (!data.section || !data.title || data.bailable === undefined || data.cognizable === undefined) {
    return res.status(400).json({ error: 'Section, title, bailable and cognizable are required.' });
  }
  const doc = await Offence.create(data);
  await log('offence', doc.section, 'create', `Added BNS ${doc.section} – ${doc.title}`, req.user);
  res.status(201).json(doc);
});

router.put('/offences/:id', async (req, res) => {
  const before = await Offence.findById(req.params.id).lean();
  if (!before) return res.status(404).json({ error: 'Offence not found.' });
  const data = pick(req.body, OFFENCE_FIELDS);
  const doc = await Offence.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  const changed = Object.keys(data).filter((k) => String(before[k]) !== String(data[k]));
  await log('offence', doc.section, 'update', `Updated BNS ${doc.section}: ${changed.join(', ') || 'no field changes'}`, req.user);
  res.json(doc);
});

router.delete('/offences/:id', async (req, res) => {
  const doc = await Offence.findByIdAndDelete(req.params.id);
  if (doc) await log('offence', doc.section, 'delete', `Deleted BNS ${doc.section} – ${doc.title}`, req.user);
  res.json({ ok: true });
});

// ---------- Provisions ----------
router.get('/provisions', async (req, res) => res.json(await Provision.find().sort({ type: 1, code: 1 }).lean()));

router.post('/provisions', async (req, res) => {
  const data = pick(req.body, PROVISION_FIELDS);
  if (!data.code || !data.title) return res.status(400).json({ error: 'Code and title are required.' });
  const doc = await Provision.create(data);
  await log('provision', doc.code, 'create', `Added ${doc.act} s.${doc.section}`, req.user);
  res.status(201).json(doc);
});

router.put('/provisions/:id', async (req, res) => {
  const data = pick(req.body, PROVISION_FIELDS);
  delete data.code; // the engine relies on stable codes
  const doc = await Provision.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!doc) return res.status(404).json({ error: 'Provision not found.' });
  await log('provision', doc.code, 'update', `Updated ${doc.act} s.${doc.section}`, req.user);
  res.json(doc);
});

// ---------- Rules: propose -> verify & publish ----------
router.get('/rules', async (req, res) => res.json(await Rule.find().sort({ key: 1 }).lean()));

// Propose a change (does NOT affect assessments until verified)
router.put('/rules/:key', async (req, res) => {
  const rule = await Rule.findOne({ key: req.params.key });
  if (!rule) return res.status(404).json({ error: 'Rule not found.' });
  const { params, enabled, description, note } = req.body || {};
  if (params !== undefined && (typeof params !== 'object' || Array.isArray(params))) {
    return res.status(400).json({ error: 'Params must be a JSON object.' });
  }
  rule.pending = {
    params: params ?? rule.params,
    enabled: enabled ?? rule.enabled,
    description: description ?? rule.description,
    note: note || '',
    proposedBy: req.user.email,
    proposedAt: new Date(),
  };
  await rule.save();
  await log('rule', rule.key, 'propose', `Proposed change to ${rule.name}${note ? ` — ${note}` : ''}`, req.user);
  res.json(rule);
});

// Verify & publish the pending change
router.post('/rules/:key/verify', async (req, res) => {
  const rule = await Rule.findOne({ key: req.params.key });
  if (!rule || !rule.pending) return res.status(400).json({ error: 'No pending change to verify.' });
  const p = rule.pending;
  rule.params = p.params;
  rule.enabled = p.enabled;
  rule.description = p.description;
  rule.version += 1;
  rule.verifiedBy = req.user.email;
  rule.verifiedAt = new Date();
  rule.pending = null;
  rule.markModified('params');
  await rule.save();
  await log('rule', rule.key, 'verify', `Verified & published ${rule.name} (v${rule.version})`, req.user);
  res.json(rule);
});

router.post('/rules/:key/discard', async (req, res) => {
  const rule = await Rule.findOne({ key: req.params.key });
  if (!rule) return res.status(404).json({ error: 'Rule not found.' });
  rule.pending = null;
  await rule.save();
  await log('rule', rule.key, 'discard', `Discarded pending change to ${rule.name}`, req.user);
  res.json(rule);
});

// ---------- Change log ----------
router.get('/changelog', async (req, res) => res.json(await ChangeLog.find().sort({ createdAt: -1 }).limit(200).lean()));

module.exports = router;
