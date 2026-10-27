/**
 * Seeds the Central Legal Database (offences, provisions, rules) and the first admin account.
 *
 *   server start              -> fills a collection only if it is empty, so records an admin
 *                                deleted are not brought back on the next restart
 *   npm run seed              -> adds any default records that are missing (safe to re-run)
 *   npm run seed -- --reset   -> wipes offences, provisions and rules and reloads the defaults
 *
 * Works the same against local MongoDB and Atlas (whatever MONGODB_URI points to).
 * Users and saved assessments are never touched.
 */
require('../config/env');
const bcrypt = require('bcryptjs');
const { Offence, Provision, Rule, User } = require('../models');
const { isEmail, passwordProblem } = require('../utils/validate');

const DEFAULT_ADMIN_EMAIL = 'admin@bailreckoner.local';
const DEFAULT_ADMIN_PASSWORD = 'Admin@12345';

const DATASETS = [
  { label: 'offences', Model: Offence, items: require('./data/offences'), key: 'section' },
  { label: 'provisions', Model: Provision, items: require('./data/provisions'), key: 'code' },
  { label: 'rules', Model: Rule, items: require('./data/rules'), key: 'key' },
];

/** Inserts the default records whose key is not in the collection yet (one query + one bulk insert). */
async function insertMissing({ Model, items, key }) {
  const existing = new Set(await Model.distinct(key));
  const missing = items.filter((item) => !existing.has(item[key]));
  if (missing.length) await Model.insertMany(missing);
  return missing.length;
}

/** Creates the admin from ADMIN_EMAIL / ADMIN_PASSWORD if that account does not exist yet. */
async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  const existing = await User.findOne({ email }).select('role').lean();
  if (existing) {
    if (existing.role !== 'admin') {
      console.warn(`⚠ ${email} is registered as a normal user, so no admin was created. Set ADMIN_EMAIL to another address.`);
    }
    return false;
  }

  if (!isEmail(email)) throw new Error(`ADMIN_EMAIL "${email}" is not a valid email address.`);
  const problem = passwordProblem(password);
  if (problem) throw new Error(`ADMIN_PASSWORD is not allowed: ${problem}`);

  await User.create({ name: 'Administrator', email, role: 'admin', passwordHash: await bcrypt.hash(password, 10) });
  console.log(`✔ Admin account created: ${email}`);
  if (password === DEFAULT_ADMIN_PASSWORD) {
    console.warn('⚠ The admin uses the default password from the README — sign in and change it on the Profile page.');
  }
  return true;
}

/**
 * @param {{ mode?: 'if-empty' | 'missing' | 'reset' }} options
 */
async function ensureSeeded({ mode = 'if-empty' } = {}) {
  const added = [];
  for (const set of DATASETS) {
    if (mode === 'reset') await set.Model.deleteMany({});
    else if (mode === 'if-empty' && await set.Model.exists({})) continue;
    const count = await insertMissing(set);
    if (count) added.push(`${count} ${set.label}`);
  }
  if (mode === 'reset') console.log('• Cleared offences, provisions and rules');
  if (added.length) console.log(`✔ Seeded ${added.join(', ')}`);
  await ensureAdmin();
}

module.exports = { ensureSeeded };

// Run directly: npm run seed [-- --reset]
if (require.main === module) {
  const { connectDB, disconnectDB } = require('../config/db');
  const mode = process.argv.includes('--reset') ? 'reset' : 'missing';
  (async () => {
    await connectDB();
    await ensureSeeded({ mode });
    console.log(mode === 'reset' ? 'Done — legal database reset to the defaults.' : 'Done.');
  })()
    .catch((err) => {
      console.error('✖ Seeding failed:', err.message);
      if (err.hint) console.error(`  ${err.hint}`);
      process.exitCode = 1;
    })
    .finally(() => disconnectDB());
}
