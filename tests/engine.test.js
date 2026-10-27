// Run with: npm test   (uses Node's built-in test runner; no database needed)
const test = require('node:test');
const assert = require('node:assert/strict');
const { assess } = require('../server/engine/ruleEngine');

const knowledge = {
  offences: require('../server/seed/data/offences'),
  provisions: require('../server/seed/data/provisions'),
  rules: require('../server/seed/data/rules').map((r) => ({ ...r, enabled: true, version: 1 })),
  now: new Date('2026-10-25'),
};
const find = (res, key) => res.findings.find((f) => f.ruleKey === key);

test('bailable offence in custody -> bail as of right', () => {
  const r = assess({ offences: ['115(2)'], custodyStatus: 'in_custody', arrestDate: '2026-10-20' }, knowledge);
  assert.equal(r.summary.outlook, 'right');
  assert.equal(find(r, 'BAILABLE_RIGHT').status, 'eligible');
  assert.equal(find(r, 'NON_BAILABLE_DISCRETION'), undefined);
});

test('indigent: bailable case still in custody after 7 days', () => {
  const r = assess({ offences: ['115(2)'], custodyStatus: 'in_custody', arrestDate: '2026-10-10' }, knowledge);
  assert.equal(find(r, 'INDIGENT_BOND').status, 'eligible');
});

test('theft (3 yrs, non-bailable): 60-day default bail accrued when no chargesheet', () => {
  // remand 2026-08-20 -> day 1; 60 days end 2026-10-18; eligible from 2026-10-19
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody', investigationStage: 'investigation', arrestDate: '2026-08-20', firstRemandDate: '2026-08-20' }, knowledge);
  const d = find(r, 'DEFAULT_BAIL');
  assert.equal(d.status, 'eligible');
  assert.equal(d.dates.periodDays, 60);
  assert.equal(d.dates.periodEnds, '2026-10-18');
  assert.equal(r.summary.outlook, 'statutory');
});

test('murder: 90-day default bail, s.479 not available, sessions forum, restriction', () => {
  const r = assess({ offences: ['103(1)'], custodyStatus: 'in_custody', firstRemandDate: '2026-09-01', arrestDate: '2026-09-01' }, knowledge);
  assert.equal(find(r, 'DEFAULT_BAIL').dates.periodDays, 90);
  assert.equal(find(r, 'DEFAULT_BAIL').status, 'upcoming');
  assert.equal(find(r, 'UNDERTRIAL_RELEASE').status, 'not_eligible');
  assert.equal(find(r, 'NON_BAILABLE_DISCRETION').status, 'alert');
  assert.equal(r.summary.forum, 'Court of Session');
  assert.equal(r.summary.maxPunishment, 'Death');
});

test('woman accused of murder: proviso exception lifts alert to possible', () => {
  const r = assess({ offences: ['103(1)'], custodyStatus: 'in_custody', gender: 'female' }, knowledge);
  assert.equal(find(r, 'NON_BAILABLE_DISCRETION').status, 'possible');
  assert.ok(r.rights.some((x) => x.code === 'BNSS_43_5'));
});

test('robbery (max exactly 10 yrs) flagged as contested 60/90 category', () => {
  const r = assess({ offences: ['309(4)'], custodyStatus: 'in_custody', firstRemandDate: '2026-10-01' }, knowledge);
  const d = find(r, 'DEFAULT_BAIL');
  assert.equal(d.dates.periodDays, 90);
  assert.ok(d.reasons.some((x) => /Courts are divided/.test(x)));
});

test('charge sheet filed without prior application -> default bail lost', () => {
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody', investigationStage: 'chargesheet_filed', firstRemandDate: '2026-01-01' }, knowledge);
  assert.equal(find(r, 'DEFAULT_BAIL').status, 'not_eligible');
});

test('s.479 first-time offender: one-third of 3 years reached', () => {
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody', investigationStage: 'trial', arrestDate: '2025-06-01', firstTimeOffender: 'yes' }, knowledge);
  const u = find(r, 'UNDERTRIAL_RELEASE');
  assert.equal(u.status, 'eligible');
  assert.equal(u.dates.thresholdDays, Math.ceil(3 * 365.25 * 0.3333));
});

test('s.479 blocked when other cases pending', () => {
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody', arrestDate: '2024-01-01', otherPendingCases: 'yes' }, knowledge);
  assert.equal(find(r, 'UNDERTRIAL_RELEASE').status, 'not_eligible');
});

test('not arrested, cheating (7 yrs non-bailable): anticipatory bail + notice of appearance', () => {
  const r = assess({ offences: ['318(4)'], custodyStatus: 'not_arrested', apprehendsArrest: 'yes' }, knowledge);
  assert.equal(find(r, 'ANTICIPATORY_BAIL').status, 'likely');
  assert.equal(find(r, 'NOTICE_OF_APPEARANCE').status, 'likely');
  assert.equal(find(r, 'DEFAULT_BAIL'), undefined);
});

test('elderly person, minor offence: prior permission rule', () => {
  const r = assess({ offences: ['126(2)'], custodyStatus: 'not_arrested', age: 67 }, knowledge);
  assert.ok(find(r, 'ELDERLY_INFIRM_ARREST'));
});

test('arrest safeguard violations raise alerts', () => {
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody', producedWithin24h: 'no', informedGrounds: 'no' }, knowledge);
  const alerts = r.findings.filter((f) => f.ruleKey === 'ARREST_SAFEGUARDS');
  assert.equal(alerts.length, 2);
  assert.equal(r.findings[0].status, 'alert'); // alerts sorted first
});

test('special law NDPS -> restricted outlook, default bail only possible', () => {
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody', firstRemandDate: '2026-01-01', specialLaws: ['NDPS'] }, knowledge);
  assert.equal(r.summary.outlook, 'restricted');
  assert.equal(find(r, 'DEFAULT_BAIL').status, 'possible');
});

test('Magistrate trial delayed beyond 60 days -> s.480(6)', () => {
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody', investigationStage: 'trial', evidenceStartDate: '2026-07-01', otherPendingCases: 'yes' }, knowledge);
  assert.equal(find(r, 'MAGISTRATE_TRIAL_DELAY').status, 'eligible');
});

test('mandatory conditions for Chapter XVII non-bailable offence', () => {
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody' }, knowledge);
  assert.ok(find(r, 'MANDATORY_CONDITIONS'));
  assert.ok(r.conditions.some((c) => /witnesses/.test(c)));
});

test('disabled rule is skipped', () => {
  const k = { ...knowledge, rules: knowledge.rules.map((r) => (r.key === 'DEFAULT_BAIL' ? { ...r, enabled: false } : r)) };
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody', firstRemandDate: '2026-01-01' }, k);
  assert.equal(find(r, 'DEFAULT_BAIL'), undefined);
});

test('admin-changed params are honoured (default bail 60 -> 45 days)', () => {
  const k = { ...knowledge, rules: knowledge.rules.map((r) => (r.key === 'DEFAULT_BAIL' ? { ...r, params: { ...r.params, shortDays: 45 } } : r)) };
  const r = assess({ offences: ['303(2)'], custodyStatus: 'in_custody', firstRemandDate: '2026-10-01' }, k);
  assert.equal(find(r, 'DEFAULT_BAIL').dates.periodDays, 45);
});

test('invalid offence throws 400', () => {
  assert.throws(() => assess({ offences: ['999'] }, knowledge), (e) => e.status === 400);
});

test('every finding cites at least one provision', () => {
  const r = assess({ offences: ['103(1)', '115(2)'], custodyStatus: 'in_custody', firstRemandDate: '2026-09-01' }, knowledge);
  for (const f of r.findings) assert.ok(f.provisions.length > 0, f.ruleKey);
  assert.equal(r.summary.nature, 'Mixed (treated as non-bailable)');
});
