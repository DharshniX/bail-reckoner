/**
 * Bail Reckoner – Legal Rule & Assessment Engine
 * ------------------------------------------------
 * A pure function: assess(input, knowledge) -> result
 *   input     : case details entered by the user
 *   knowledge : { offences, provisions, rules, now } loaded from the Central Legal Database
 *
 * The engine never predicts whether a court WILL grant bail. It identifies which
 * provisions are potentially relevant, explains WHY each one was flagged, and
 * lists rights, conditions, documents and next steps.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DISCLAIMER =
  'This is an informational tool and not a substitute for legal advice or a court decision. ' +
  'Bail is decided by the court on the facts of each case. Please consult an advocate or your District Legal Services Authority (NALSA helpline 15100).';

const SPECIAL_LAW_CODES = { NDPS: 'NDPS_37', UAPA: 'UAPA_43D', PMLA: 'PMLA_45', POCSO: 'POCSO' };

// ---------- helpers ----------
function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d, n) { return new Date(d.getTime() + Math.round(n) * DAY_MS); }
function daysBetween(a, b) { return Math.floor((b.getTime() - a.getTime()) / DAY_MS); }
function iso(d) { return d ? d.toISOString().slice(0, 10) : null; }
function fmtYears(y) {
  if (y == null) return 'life imprisonment';
  if (y < 1) return `${Math.round(y * 12)} month${Math.round(y * 12) === 1 ? '' : 's'}`;
  return `${+y.toFixed(2)} year${y === 1 ? '' : 's'}`;
}
function bool(v) { return v === true || v === 'true' || v === 'yes' || v === 'on'; }

/** Normalise raw form input into a predictable shape. */
function normaliseInput(raw = {}) {
  const sections = Array.isArray(raw.offences) ? raw.offences : raw.offences ? [raw.offences] : [];
  return {
    offences: [...new Set(sections.map(String).map((s) => s.trim()).filter(Boolean))],
    custodyStatus: ['not_arrested', 'in_custody', 'released_on_bail'].includes(raw.custodyStatus) ? raw.custodyStatus : 'not_arrested',
    investigationStage: ['investigation', 'chargesheet_filed', 'trial'].includes(raw.investigationStage) ? raw.investigationStage : 'investigation',
    arrestDate: toDate(raw.arrestDate),
    firstRemandDate: toDate(raw.firstRemandDate) || toDate(raw.arrestDate),
    chargesheetDate: toDate(raw.chargesheetDate),
    evidenceStartDate: toDate(raw.evidenceStartDate),
    defaultBailApplied: bool(raw.defaultBailApplied),
    firstTimeOffender: raw.firstTimeOffender === undefined ? true : bool(raw.firstTimeOffender),
    priorConviction: ['none', 'serious', 'multiple'].includes(raw.priorConviction) ? raw.priorConviction : 'none',
    otherPendingCases: bool(raw.otherPendingCases),
    age: raw.age !== undefined && raw.age !== '' && !Number.isNaN(Number(raw.age)) ? Number(raw.age) : null,
    gender: ['male', 'female', 'other'].includes(raw.gender) ? raw.gender : null,
    sickOrInfirm: bool(raw.sickOrInfirm),
    apprehendsArrest: bool(raw.apprehendsArrest),
    noticeReceived: bool(raw.noticeReceived),
    unableToFurnishBail: bool(raw.unableToFurnishBail),
    hasLawyer: bool(raw.hasLawyer),
    producedWithin24h: ['yes', 'no', 'unknown'].includes(raw.producedWithin24h) ? raw.producedWithin24h : 'unknown',
    informedGrounds: ['yes', 'no', 'unknown'].includes(raw.informedGrounds) ? raw.informedGrounds : 'unknown',
    relativeInformed: ['yes', 'no', 'unknown'].includes(raw.relativeInformed) ? raw.relativeInformed : 'unknown',
    specialLaws: (Array.isArray(raw.specialLaws) ? raw.specialLaws : raw.specialLaws ? [raw.specialLaws] : [])
      .filter((s) => SPECIAL_LAW_CODES[s]),
  };
}

/** Summarise the gravity of the selected offences. */
function profileOffences(offences) {
  const p = {
    allBailable: offences.every((o) => o.bailable),
    anyNonBailable: offences.some((o) => !o.bailable),
    anyDeath: offences.some((o) => o.death),
    anyLife: offences.some((o) => o.maxLife || o.death),
    anySessions: offences.some((o) => /session/i.test(o.triableBy || '')),
    anyCognizable: offences.some((o) => o.cognizable),
    maxYears: 0,
    maxMinYears: 0,
    gravest: null,
    chapters: [...new Set(offences.map((o) => o.chapter))],
  };
  let gravestScore = -1;
  for (const o of offences) {
    const y = o.maxLife || o.death ? Infinity : Number(o.maxYears) || 0;
    const score = o.death ? Infinity : o.maxLife ? Number.MAX_VALUE : y; // death > life > years
    if (score > gravestScore) { gravestScore = score; p.gravest = o; }
    p.maxYears = Math.max(p.maxYears, y);
    p.maxMinYears = Math.max(p.maxMinYears, Number(o.minYears) || 0);
  }
  p.maxYearsFinite = Number.isFinite(p.maxYears) ? p.maxYears : null;
  // finite maximum among non-life offences (needed for s.479 calculation)
  p.nonLifeMax = offences.filter((o) => !(o.maxLife || o.death)).reduce((m, o) => Math.max(m, Number(o.maxYears) || 0), 0);
  return p;
}

function nonBailableOffences(offences) { return offences.filter((o) => !o.bailable); }
function label(o) { return `BNS ${o.section} – ${o.title}`; }

// ---------- rule implementations ----------
// Each returns zero or more findings: { status, title, explanation, reasons[], nextSteps[], dates? }
// status ∈ eligible | likely | possible | upcoming | not_eligible | alert | info

const RULES = {
  BAILABLE_RIGHT(ctx) {
    const { input, offences, profile } = ctx;
    if (profile.allBailable) {
      const inCustody = input.custodyStatus === 'in_custody';
      return [{
        status: input.custodyStatus === 'released_on_bail' ? 'info' : 'eligible',
        title: 'Bail is a matter of right',
        explanation: 'Every offence you selected is classified as bailable. The police officer or court is bound to release the person on bail if they are ready to furnish bail.',
        reasons: offences.map((o) => `${label(o)} is bailable as per the First Schedule.`),
        nextSteps: inCustody
          ? ['Ask the police officer in charge (or the court) for release on bail — it cannot be refused for a bailable offence.', 'Arrange a surety and the identity/address proof required for the bail bond.']
          : ['If arrested, insist on being released on bail at the police station itself.'],
      }];
    }
    const bailable = offences.filter((o) => o.bailable);
    if (bailable.length) {
      return [{
        status: 'info',
        title: 'Mixed offences – bail is not automatic',
        explanation: 'Some offences are bailable, but at least one is non-bailable. When offences are combined, bail is governed by the rules for non-bailable offences.',
        reasons: [
          ...bailable.map((o) => `${label(o)} is bailable.`),
          ...nonBailableOffences(offences).map((o) => `${label(o)} is non-bailable.`),
        ],
        nextSteps: [],
      }];
    }
    return [];
  },

  INDIGENT_BOND(ctx, params) {
    const { input, profile, now } = ctx;
    if (!profile.allBailable || input.custodyStatus !== 'in_custody') return [];
    const days = Number(params.days) || 7;
    const since = input.arrestDate ? daysBetween(input.arrestDate, now) : null;
    if (!input.unableToFurnishBail && (since == null || since < days)) return [];
    const reached = since != null && since >= days;
    return [{
      status: reached ? 'eligible' : 'possible',
      title: 'Release on personal bond (indigent person)',
      explanation: `If a person cannot furnish bail within ${days} days of arrest, the officer or court may presume they are indigent and release them on a personal bond without sureties.`,
      reasons: [
        input.unableToFurnishBail ? 'You indicated the person is unable to furnish bail/surety.' : null,
        since != null ? `The person has been in custody for ${since} day(s) since arrest.` : null,
      ].filter(Boolean),
      nextSteps: ['Request the court to release the person on a personal bond without sureties, citing inability to furnish bail.'],
    }];
  },

  NON_BAILABLE_DISCRETION(ctx) {
    const { input, offences, profile } = ctx;
    if (!profile.anyNonBailable || input.custodyStatus === 'released_on_bail') return [];
    const nb = nonBailableOffences(offences);
    const reasons = nb.map((o) => `${label(o)} is non-bailable (${o.punishment}).`);
    const bars = [];
    const exceptions = [];

    if (profile.anyLife) bars.push('At least one offence is punishable with death or imprisonment for life. A Magistrate ordinarily cannot grant bail if there are reasonable grounds to believe the person is guilty of such an offence.');
    if (profile.anyCognizable && input.priorConviction === 'serious') bars.push('The person has a previous conviction for an offence punishable with death, life imprisonment or 7 years or more.');
    if (profile.anyCognizable && input.priorConviction === 'multiple') bars.push('The person has two or more previous convictions for cognizable offences punishable with 3 to 7 years.');

    const isChild = input.age != null && input.age < 18;
    if (isChild) exceptions.push('The person is a child — the court may grant bail despite the bars.');
    if (input.gender === 'female') exceptions.push('The person is a woman — the court may grant bail despite the bars.');
    if (input.sickOrInfirm) exceptions.push('The person is sick or infirm — the court may grant bail despite the bars.');

    const forum = profile.anySessions || profile.anyLife
      ? 'Court of Session (and then the High Court) under BNSS s.483'
      : 'the jurisdictional Magistrate under BNSS s.480 (and then the Court of Session/High Court under s.483 if refused)';

    let status = 'possible';
    if (bars.length && !exceptions.length) status = 'alert';

    const nextSteps = [
      `File a regular bail application before ${forum}.`,
      'Highlight factors in favour of bail: roots in the community, cooperation with investigation, no risk of absconding or tampering with evidence, period already spent in custody, health and family responsibilities.',
    ];
    if (isChild) nextSteps.push('If the person is below 18, the matter should go before the Juvenile Justice Board, where bail rules under the Juvenile Justice Act, 2015 apply.');

    return [{
      status,
      title: bars.length ? 'Bail is discretionary – with restrictions' : 'Bail is discretionary',
      explanation: 'For non-bailable offences, bail is not a right; the court decides after considering the nature of the accusation, evidence, criminal antecedents, and the risk of absconding or influencing witnesses. "Bail is the rule and jail the exception" remains the guiding principle.',
      reasons: [...reasons, ...bars, ...exceptions],
      nextSteps,
      forum,
    }];
  },

  ANTICIPATORY_BAIL(ctx) {
    const { input, offences, profile } = ctx;
    if (input.custodyStatus !== 'not_arrested') return [];
    if (!profile.anyNonBailable) {
      return [{
        status: 'not_eligible',
        title: 'Anticipatory bail is generally not needed',
        explanation: 'Anticipatory bail is meant for non-bailable offences. Since all offences selected are bailable, the person can obtain bail as of right if arrested.',
        reasons: ['All selected offences are bailable.'],
        nextSteps: [],
      }];
    }
    return [{
      status: input.apprehendsArrest ? 'likely' : 'possible',
      title: 'Anticipatory bail may be sought',
      explanation: 'A person who has reason to believe they may be arrested for a non-bailable offence can apply to the Court of Session or High Court for anticipatory bail. If granted, they are released on bail in the event of arrest.',
      reasons: [
        'The person has not been arrested yet.',
        ...nonBailableOffences(offences).map((o) => `${label(o)} is non-bailable.`),
        input.apprehendsArrest ? 'You indicated the person apprehends arrest.' : null,
      ].filter(Boolean),
      nextSteps: [
        'Apply for anticipatory bail before the Court of Session (or the High Court) with a copy of the FIR/complaint.',
        'Be ready to show the reasons for apprehending arrest and willingness to cooperate with the investigation.',
      ],
    }];
  },

  NOTICE_OF_APPEARANCE(ctx, params) {
    const { input, profile } = ctx;
    const limit = Number(params.maxYears) || 7;
    if (profile.anyLife || profile.maxYears > limit) return [];
    if (input.custodyStatus === 'not_arrested') {
      return [{
        status: 'likely',
        title: 'Police should ordinarily issue a notice of appearance',
        explanation: `For offences punishable with imprisonment up to ${limit} years, arrest is the exception. Where arrest is not necessary, police must issue a notice to appear. A person who complies with the notice should not be arrested unless the officer records reasons.`,
        reasons: [`The most serious offence selected is punishable with up to ${fmtYears(profile.maxYears)}.`, input.noticeReceived ? 'You indicated a notice has been received.' : null].filter(Boolean),
        nextSteps: [input.noticeReceived
          ? 'Comply with the notice: appear on the date and place mentioned, and keep a copy of the notice and acknowledgement.'
          : 'If contacted by the police, ask whether a notice of appearance under BNSS s.35(3) will be issued.'],
      }];
    }
    if (input.custodyStatus === 'in_custody') {
      return [{
        status: 'info',
        title: 'Arrest needed recorded reasons',
        explanation: `Since the offence is punishable with up to ${limit} years, the police must have recorded reasons for arrest (e.g., to prevent further offence, proper investigation, prevent tampering). Absence of such reasons can be raised before the Magistrate at the remand stage.`,
        reasons: [`The most serious offence selected is punishable with up to ${fmtYears(profile.maxYears)}.`],
        nextSteps: ['Ask your advocate to check the arrest memo and the recorded reasons for arrest.'],
      }];
    }
    return [];
  },

  ELDERLY_INFIRM_ARREST(ctx, params) {
    const { input, profile } = ctx;
    const age = Number(params.age) || 60;
    const limit = Number(params.maxYears) || 3;
    const qualifies = (input.age != null && input.age > age) || input.sickOrInfirm;
    if (!qualifies || profile.anyLife || profile.maxYears >= limit) return [];
    return [{
      status: input.custodyStatus === 'not_arrested' ? 'likely' : 'info',
      title: 'Arrest needs prior permission of a senior officer',
      explanation: `For an offence punishable with less than ${limit} years, a person who is infirm or above ${age} years cannot be arrested without prior permission of an officer not below the rank of Deputy Superintendent of Police.`,
      reasons: [
        input.age != null && input.age > age ? `The person is ${input.age} years old.` : null,
        input.sickOrInfirm ? 'The person is sick or infirm.' : null,
        `The most serious offence is punishable with up to ${fmtYears(profile.maxYears)}.`,
      ].filter(Boolean),
      nextSteps: ['If an arrest is made, ask whether prior permission of a DSP-rank officer was obtained.'],
    }];
  },

  DEFAULT_BAIL(ctx, params) {
    const { input, profile, now } = ctx;
    if (input.custodyStatus !== 'in_custody') return [];
    const longDays = Number(params.longDays) || 90;
    const shortDays = Number(params.shortDays) || 60;
    const threshold = Number(params.thresholdYears) || 10;

    const longTrack = profile.anyLife || profile.maxYears >= threshold;
    // Courts differ on whether "10 years or more" covers offences whose MAXIMUM is exactly 10 years
    const contested = !profile.anyLife && profile.maxYears === threshold && profile.maxMinYears < threshold;
    let days = longTrack ? longDays : shortDays;

    const special = input.specialLaws.filter((s) => s === 'NDPS' || s === 'UAPA');
    const reasons = [
      longTrack
        ? `The most serious offence is punishable with ${profile.anyLife ? 'death or life imprisonment' : `${fmtYears(profile.maxYears)}`}, so the ${longDays}-day period applies.`
        : `The most serious offence is punishable with up to ${fmtYears(profile.maxYears)}, so the ${shortDays}-day period applies.`,
    ];
    if (contested) reasons.push(`Courts are divided on whether an offence with a maximum of exactly ${threshold} years falls in the ${longDays}-day or ${shortDays}-day category. An advocate may argue for the ${shortDays}-day period (see Rakesh Kumar Paul v. State of Assam, 2017).`);
    if (special.length) reasons.push(`Special law (${special.join(', ')}) involved — the investigation period can be extended up to 180 days, so the BNSS period may not apply.`);

    if (input.investigationStage !== 'investigation') {
      return [{
        status: input.defaultBailApplied ? 'possible' : 'not_eligible',
        title: 'Default bail – charge sheet already filed',
        explanation: 'The right to default bail is lost once the charge sheet is filed, unless the accused had already applied for default bail before it was filed, or the charge sheet was incomplete and filed only to defeat the right.',
        reasons: [
          ...reasons,
          input.defaultBailApplied ? 'You indicated an application for default bail was made before the charge sheet was filed — the right may survive.' : 'The charge sheet has been filed.',
        ],
        nextSteps: input.defaultBailApplied ? ['Ask your advocate to press the pending default bail application.'] : ['Consider regular bail under s.480/s.483 instead.'],
      }];
    }

    if (!input.firstRemandDate) {
      return [{
        status: 'possible',
        title: `Default bail after ${days} days without charge sheet`,
        explanation: `If the charge sheet is not filed within ${days} days of the first remand, the person gets a right to be released on bail.`,
        reasons: [...reasons, 'Enter the date of first remand/arrest to calculate the exact date.'],
        nextSteps: ['Note the date of first remand by the Magistrate and track the deadline.'],
      }];
    }

    // The day of remand is counted (ED v. Kapil Wadhawan, 2023).
    const periodEnds = addDays(input.firstRemandDate, days - 1);
    const eligibleFrom = addDays(input.firstRemandDate, days);
    const elapsed = daysBetween(input.firstRemandDate, now) + 1;
    const accrued = now.getTime() >= eligibleFrom.getTime();

    return [{
      status: special.length ? 'possible' : accrued ? 'eligible' : 'upcoming',
      title: accrued ? 'Default bail – right may have accrued' : `Default bail after ${days} days`,
      explanation: `If the investigation is not completed and the charge sheet is not filed within ${days} days, the accused shall be released on bail if prepared to furnish bail. This is an "indefeasible" right, but only if the accused applies before the charge sheet is filed.`,
      reasons: [
        ...reasons,
        `Custody since first remand: ${elapsed} day(s) (the day of remand is counted).`,
        accrued ? `The ${days}-day period ended on ${iso(periodEnds)} and the charge sheet has not been filed.` : `The ${days}-day period ends on ${iso(periodEnds)} (${days - elapsed} day(s) remaining).`,
      ],
      nextSteps: accrued
        ? ['Apply for default bail IMMEDIATELY before the charge sheet is filed, stating readiness to furnish bail.', 'Even an oral application at the time of production can be sufficient — make sure it is recorded.']
        : [`Prepare a default bail application to file on ${iso(eligibleFrom)} if no charge sheet has been filed by then.`],
      dates: { firstRemand: iso(input.firstRemandDate), periodDays: days, periodEnds: iso(periodEnds), eligibleFrom: iso(eligibleFrom), elapsed, remaining: Math.max(0, days - elapsed) },
    }];
  },

  UNDERTRIAL_RELEASE(ctx, params) {
    const { input, profile, now } = ctx;
    if (input.custodyStatus !== 'in_custody') return [];
    if (profile.anyLife) {
      return [{
        status: 'not_eligible',
        title: 'Undertrial release (s.479) not available',
        explanation: 'The maximum-detention rule does not apply where any offence is punishable with death or imprisonment for life.',
        reasons: [`${label(profile.gravest)} is punishable with ${profile.anyDeath ? 'death or ' : ''}life imprisonment.`],
        nextSteps: [],
      }];
    }
    if (input.otherPendingCases) {
      return [{
        status: 'not_eligible',
        title: 'Undertrial release (s.479) not available',
        explanation: 'The rule does not apply where investigation, inquiry or trial is pending against the person in more than one offence or case.',
        reasons: ['You indicated other cases are pending against the person.'],
        nextSteps: ['Seek regular bail instead.'],
      }];
    }
    const maxYears = profile.nonLifeMax;
    if (!maxYears) return [];
    const fraction = input.firstTimeOffender ? Number(params.firstTimeFraction) || 1 / 3 : Number(params.generalFraction) || 0.5;
    const thresholdDays = Math.ceil(maxYears * 365.25 * fraction);
    const fractionLabel = input.firstTimeOffender ? 'one-third' : 'one-half';
    const reasons = [
      `Maximum punishment for the most serious offence: ${fmtYears(maxYears)}.`,
      input.firstTimeOffender ? 'The person is a first-time offender (never previously convicted), so one-third applies.' : 'The person is not a first-time offender, so one-half applies.',
      `Threshold: ${fractionLabel} of ${fmtYears(maxYears)} ≈ ${thresholdDays} days.`,
    ];
    if (!input.arrestDate) {
      return [{ status: 'possible', title: 'Undertrial release after part of the maximum sentence', explanation: 'An undertrial who has spent the threshold period in custody shall be released on bond.', reasons: [...reasons, 'Enter the date of arrest to calculate the eligibility date.'], nextSteps: [] }];
    }
    const served = daysBetween(input.arrestDate, now);
    const eligibleFrom = addDays(input.arrestDate, thresholdDays);
    const reached = served >= thresholdDays;
    return [{
      status: reached ? 'eligible' : 'upcoming',
      title: reached ? 'Undertrial release – threshold reached' : 'Undertrial release – future eligibility',
      explanation: 'An undertrial prisoner who has been detained for one-half of the maximum sentence (one-third for a first-time offender) shall be released on bond. The jail superintendent must apply to the court once the period is completed. Delay caused by the accused is excluded.',
      reasons: [...reasons, `Time in custody so far: ${served} day(s).`],
      nextSteps: reached
        ? ['Ask the jail superintendent to file the application under BNSS s.479, or apply through your advocate.']
        : [`Eligibility is expected from about ${iso(eligibleFrom)} (approximate; any delay caused by the accused is excluded).`],
      dates: { from: iso(input.arrestDate), thresholdDays, served, eligibleFrom: iso(eligibleFrom) },
    }];
  },

  MAGISTRATE_TRIAL_DELAY(ctx, params) {
    const { input, offences, profile, now } = ctx;
    if (input.custodyStatus !== 'in_custody' || input.investigationStage !== 'trial') return [];
    if (!profile.anyNonBailable || profile.anySessions) return [];
    const limit = Number(params.days) || 60;
    if (!input.evidenceStartDate) {
      return [{ status: 'possible', title: `Bail if trial not concluded in ${limit} days`, explanation: `If a Magistrate trial is not concluded within ${limit} days from the first date fixed for taking evidence, a person in custody throughout shall be released on bail (unless reasons are recorded).`, reasons: ['All non-bailable offences are triable by a Magistrate.', 'Enter the first date fixed for evidence to calculate.'], nextSteps: [] }];
    }
    const elapsed = daysBetween(input.evidenceStartDate, now);
    const reached = elapsed >= limit;
    return [{
      status: reached ? 'eligible' : 'upcoming',
      title: `Bail if trial not concluded in ${limit} days`,
      explanation: `If a Magistrate trial of a non-bailable offence is not concluded within ${limit} days from the first date fixed for taking evidence, a person who has been in custody throughout shall be released on bail, unless the Magistrate records reasons otherwise.`,
      reasons: [
        ...nonBailableOffences(offences).map((o) => `${label(o)} is triable by ${o.triableBy}.`),
        `${elapsed} day(s) have passed since the first date fixed for evidence (${iso(input.evidenceStartDate)}).`,
      ],
      nextSteps: reached ? ['Apply for bail under BNSS s.480(6).'] : [`The ${limit}-day period completes on ${iso(addDays(input.evidenceStartDate, limit))}.`],
    }];
  },

  MANDATORY_CONDITIONS(ctx, params) {
    const { profile, offences } = ctx;
    const years = Number(params.years) || 7;
    const chapters = Array.isArray(params.chapters) ? params.chapters : ['VI', 'VII', 'XVII'];
    const nb = nonBailableOffences(offences);
    if (!nb.length) return [];
    const triggers = nb.filter((o) => o.maxLife || o.death || Number(o.maxYears) >= years || chapters.includes(o.chapter));
    if (!triggers.length) return [];
    return [{
      status: 'info',
      title: 'Mandatory conditions if bail is granted',
      explanation: 'If bail is granted, the court must impose conditions: (a) attend court as per the bond, (b) not commit a similar offence, and (c) not induce, threaten or promise any person acquainted with the case, or tamper with evidence.',
      reasons: triggers.map((o) => `${label(o)} — ${o.maxLife || o.death || Number(o.maxYears) >= years ? `punishable with ${o.maxLife || o.death ? 'life imprisonment or more' : `${fmtYears(o.maxYears)}`}` : `falls in BNS Chapter ${o.chapter}`}.`),
      nextSteps: [],
    }];
  },

  ARREST_SAFEGUARDS(ctx, params) {
    const { input } = ctx;
    if (input.custodyStatus === 'not_arrested') return [];
    const out = [];
    const hours = Number(params.productionHours) || 24;
    if (input.producedWithin24h === 'no') {
      out.push({
        status: 'alert', title: `Not produced before a Magistrate within ${hours} hours`,
        explanation: `Detention beyond ${hours} hours (excluding journey time) without production before a Magistrate is illegal under BNSS s.58 and Article 22(2) of the Constitution.`,
        reasons: [`You indicated the person was not produced within ${hours} hours.`],
        nextSteps: ['Raise this immediately before the Magistrate; an advocate may also consider a habeas corpus petition before the High Court.'],
      });
    }
    if (input.informedGrounds === 'no') {
      out.push({
        status: 'alert', title: 'Grounds of arrest not communicated',
        explanation: 'Every arrested person must be informed of the full particulars of the offence and grounds of arrest (BNSS s.47; Article 22(1)). The Supreme Court has held that failure to communicate the grounds of arrest can vitiate the arrest (Prabir Purkayastha v. State, 2024; Vihaan Kumar v. State of Haryana, 2025).',
        reasons: ['You indicated the grounds of arrest were not communicated.'],
        nextSteps: ['Inform your advocate — this can be a ground for release.'],
      });
    }
    if (input.relativeInformed === 'no') {
      out.push({
        status: 'alert', title: 'Relative/friend not informed of arrest',
        explanation: 'Police must inform a relative, friend or nominated person about the arrest and place of detention, and record it (BNSS s.48).',
        reasons: ['You indicated no relative or friend was informed.'],
        nextSteps: ['Bring this to the notice of the Magistrate at the time of production.'],
      });
    }
    return out;
  },

  LEGAL_AID(ctx) {
    const { input } = ctx;
    if (input.hasLawyer) return [];
    return [{
      status: 'info', title: 'Free legal aid is available',
      explanation: 'If the person cannot afford a lawyer, the court must assign one at State expense. Free legal services are also available through the District Legal Services Authority.',
      reasons: ['You indicated the person does not have a lawyer.'],
      nextSteps: ['Ask the court for a legal-aid lawyer, or call the NALSA helpline 15100 / contact the District Legal Services Authority.'],
    }];
  },

  SPECIAL_LAWS(ctx) {
    return ctx.input.specialLaws.map((law) => {
      const prov = ctx.provisionMap[SPECIAL_LAW_CODES[law]];
      return {
        status: 'alert',
        title: `${law} involved – stricter bail regime`,
        explanation: prov ? prov.summary : 'This special law has its own stricter bail provisions.',
        reasons: [`You indicated the case involves the ${law}. Special laws override the general BNSS bail provisions where they conflict.`],
        nextSteps: ['Consult an advocate experienced in this special law; this tool\'s BNSS-based assessment may not fully apply.'],
        provisionsOverride: [SPECIAL_LAW_CODES[law]],
      };
    });
  },
};

// ---------- rights, conditions, documents ----------
function buildRights(input, profile, provisionMap) {
  const codes = [];
  if (input.custodyStatus !== 'not_arrested') codes.push('BNSS_47', 'BNSS_48', 'BNSS_38', 'BNSS_58', 'BNSS_53');
  else codes.push('BNSS_47', 'BNSS_38');
  if (!profile.anyLife && profile.maxYears <= 7) codes.push('BNSS_35_3');
  if (input.gender === 'female') codes.push('BNSS_43_5');
  codes.push('BNSS_341', 'CONST_21_22');
  return [...new Set(codes)].map((c) => provisionMap[c]).filter(Boolean)
    .map((p) => ({ code: p.code, title: p.title, section: `${p.act} s.${p.section}`.replace('s.Articles', 'Articles'), plain: p.plain }));
}

function buildConditions(profile, findings) {
  const list = [
    'Execute a bail bond for the amount fixed by the court (BNSS s.485); the amount must not be excessive.',
    'Furnish one or more sureties if required by the court.',
  ];
  if (findings.some((f) => f.ruleKey === 'MANDATORY_CONDITIONS')) {
    list.push('Attend court on every date as per the bond.', 'Do not commit a similar offence while on bail.', 'Do not threaten, induce or contact witnesses or tamper with evidence.');
  }
  if (profile.anyNonBailable) {
    list.push('The court may also impose other conditions, such as reporting to the police station, surrendering the passport, or not leaving the city/country without permission.');
  }
  return list;
}

function buildDocuments(input) {
  const docs = ['Copy of the FIR or complaint', 'Identity and address proof of the accused (Aadhaar, voter ID, etc.)'];
  if (input.custodyStatus === 'in_custody') docs.push('Arrest memo and remand order(s)', 'Identity, address and solvency/property documents of the surety');
  if (input.custodyStatus === 'not_arrested') docs.push('Notice of appearance (if received)');
  if (input.investigationStage !== 'investigation') docs.push('Copy of the charge sheet (if available)');
  if (input.sickOrInfirm) docs.push('Medical records / certificates');
  if (input.age != null && input.age < 18) docs.push('Proof of age (birth certificate / school certificate)');
  docs.push('Signed vakalatnama for the advocate', 'Copies of any earlier bail orders or applications');
  return docs;
}

const STATUS_RANK = { alert: 0, eligible: 1, likely: 2, upcoming: 3, possible: 4, info: 5, not_eligible: 6 };

function buildSummary(profile, input, findings) {
  const has = (k, s) => findings.some((f) => f.ruleKey === k && (!s || s.includes(f.status)));
  let outlook; let headline;
  if (input.specialLaws.length) {
    outlook = 'restricted'; headline = `Special law (${input.specialLaws.join(', ')}) involved — stricter bail conditions apply.`;
  } else if (profile.allBailable) {
    outlook = 'right'; headline = 'All offences are bailable — bail is a matter of right.';
  } else if (has('DEFAULT_BAIL', ['eligible']) || has('UNDERTRIAL_RELEASE', ['eligible']) || has('MAGISTRATE_TRIAL_DELAY', ['eligible']) || has('INDIGENT_BOND', ['eligible'])) {
    outlook = 'statutory'; headline = 'A statutory right to bail may have accrued — act on it promptly.';
  } else if (has('NON_BAILABLE_DISCRETION', ['alert'])) {
    outlook = 'restricted'; headline = 'Non-bailable offence with legal restrictions — bail is discretionary and harder to obtain.';
  } else if (input.custodyStatus === 'not_arrested' && profile.anyNonBailable) {
    outlook = 'discretionary'; headline = 'Non-bailable offence — anticipatory bail may be explored before arrest.';
  } else {
    outlook = 'discretionary'; headline = 'Non-bailable offence — bail is at the discretion of the court.';
  }
  return {
    outlook,
    headline,
    nature: profile.allBailable ? 'Bailable' : profile.anyNonBailable && profile.offences.some((o) => o.bailable) ? 'Mixed (treated as non-bailable)' : 'Non-bailable',
    cognizable: profile.anyCognizable ? 'Cognizable' : 'Non-cognizable',
    maxPunishment: profile.anyDeath ? 'Death' : profile.anyLife ? 'Imprisonment for life' : fmtYears(profile.maxYears),
    forum: profile.anySessions || profile.anyLife ? 'Court of Session' : 'Magistrate',
  };
}

/**
 * Main entry point.
 * @param {object} rawInput
 * @param {{offences: object[], provisions: object[], rules: object[], now?: Date}} knowledge
 */
function assess(rawInput, knowledge) {
  const input = normaliseInput(rawInput);
  const now = toDate(knowledge.now || new Date());
  const offenceMap = Object.fromEntries((knowledge.offences || []).map((o) => [o.section, o]));
  const provisionMap = Object.fromEntries((knowledge.provisions || []).map((p) => [p.code, p]));

  const offences = input.offences.map((s) => offenceMap[s]).filter(Boolean);
  const unknown = input.offences.filter((s) => !offenceMap[s]);
  if (!offences.length) {
    const err = new Error('Select at least one valid offence.');
    err.status = 400;
    throw err;
  }
  const profile = profileOffences(offences);
  profile.offences = offences;
  const ctx = { input, offences, profile, now, provisionMap };

  const findings = [];
  const rulesUsed = [];
  for (const rule of knowledge.rules || []) {
    if (!rule.enabled) continue;
    const impl = RULES[rule.key];
    if (!impl) continue;
    rulesUsed.push({ key: rule.key, version: rule.version || 1 });
    const out = impl(ctx, rule.params || {}) || [];
    for (const f of out) {
      const codes = f.provisionsOverride || rule.provisionCodes || [];
      delete f.provisionsOverride;
      findings.push({
        ruleKey: rule.key,
        ruleName: rule.name,
        ...f,
        provisions: codes.map((c) => provisionMap[c]).filter(Boolean)
          .map((p) => ({ code: p.code, label: `${p.act} s.${p.section}`.replace('s.Articles', 'Articles').replace('s.Various', '(various sections)'), title: p.title, oldSection: p.oldSection, reference: p.reference })),
      });
    }
  }
  findings.sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9));

  const nextSteps = [...new Set(findings.filter((f) => f.status !== 'not_eligible').flatMap((f) => f.nextSteps || []))];
  nextSteps.push('Consult an advocate before filing any application. Free legal aid: NALSA helpline 15100.');

  return {
    generatedAt: new Date().toISOString(),
    assessedOn: iso(now),
    summary: buildSummary(profile, input, findings),
    offences: offences.map((o) => ({ section: o.section, ipc: o.ipc, title: o.title, punishment: o.punishment, bailable: o.bailable, cognizable: o.cognizable, triableBy: o.triableBy })),
    unknownOffences: unknown,
    findings,
    rights: buildRights(input, profile, provisionMap),
    conditions: buildConditions(profile, findings),
    documents: buildDocuments(input),
    nextSteps: [...new Set(nextSteps)],
    rulesUsed,
    disclaimer: DISCLAIMER,
  };
}

module.exports = { assess, normaliseInput, profileOffences, RULES, DISCLAIMER };
