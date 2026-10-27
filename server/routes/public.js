const router = require('express').Router();
const { Offence, Provision, Rule, Assessment } = require('../models');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { assess } = require('../engine/ruleEngine');
const { validateIdParam } = require('../utils/validate');

router.param('id', validateIdParam);

/** Load everything the engine needs from the Central Legal Database. */
async function loadKnowledge() {
  const [offences, provisions, rules] = await Promise.all([
    Offence.find({ active: true }).lean(),
    Provision.find().lean(),
    Rule.find().lean(),
  ]);
  return { offences, provisions, rules };
}

// List offences (for the case form)
router.get('/offences', async (req, res) => {
  const offences = await Offence.find({ active: true }).sort({ category: 1, title: 1 }).lean();
  res.json(offences.map(({ _id, section, ipc, title, category, chapter, punishment, bailable, cognizable, triableBy }) =>
    ({ id: _id, section, ipc, title, category, chapter, punishment, bailable, cognizable, triableBy })));
});

// Legal reference library
router.get('/provisions', async (req, res) => {
  const provisions = await Provision.find().sort({ type: 1, code: 1 }).lean();
  res.json(provisions);
});

// Run an assessment (saved to history when logged in)
router.post('/assess', optionalAuth, async (req, res) => {
  const knowledge = await loadKnowledge();
  const result = assess(req.body || {}, knowledge);
  let savedId = null;
  if (req.user && req.body.save !== false) {
    const title = result.offences.map((o) => `BNS ${o.section}`).join(', ');
    const doc = await Assessment.create({ user: req.user._id, title, input: req.body, result });
    savedId = doc._id;
  }
  res.json({ ...result, savedId });
});

// History of the logged-in user
router.get('/assessments', requireAuth, async (req, res) => {
  const items = await Assessment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json(items.map((a) => ({ id: a._id, title: a.title, createdAt: a.createdAt, outlook: a.result?.summary?.outlook, headline: a.result?.summary?.headline })));
});

router.get('/assessments/:id', requireAuth, async (req, res) => {
  const a = await Assessment.findOne({ _id: req.params.id, user: req.user._id }).lean();
  if (!a) return res.status(404).json({ error: 'Assessment not found.' });
  res.json({ id: a._id, title: a.title, createdAt: a.createdAt, input: a.input, result: a.result });
});

router.delete('/assessments/:id', requireAuth, async (req, res) => {
  await Assessment.deleteOne({ _id: req.params.id, user: req.user._id });
  res.json({ ok: true });
});

module.exports = router;
module.exports.loadKnowledge = loadKnowledge;
