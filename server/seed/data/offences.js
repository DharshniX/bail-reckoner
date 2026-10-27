/**
 * Seed data: common offences under the Bharatiya Nyaya Sanhita, 2023 (BNS)
 * with their classification as per the First Schedule of the BNSS, 2023.
 *
 * maxYears     : maximum imprisonment in years (null when life imprisonment/death is possible)
 * minYears     : statutory minimum, if any
 * maxLife      : true if punishable with imprisonment for life
 * death        : true if punishable with death
 * chapter      : BNS chapter number (used for BNSS s.480(3) - Chapters VI, VII, XVII)
 * ipc          : corresponding Indian Penal Code section (for users familiar with old law)
 *
 * NOTE FOR ADMINS: classifications must be verified against the official
 * First Schedule (indiacode.nic.in) and any State amendments before use.
 */
module.exports = [
  // ---------- Chapter VI : Offences affecting the human body ----------
  { section: '103(1)', ipc: '302', title: 'Murder', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Death or imprisonment for life, and fine', maxYears: null, maxLife: true, death: true,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },
  { section: '105', ipc: '304', title: 'Culpable homicide not amounting to murder', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Imprisonment for life, or imprisonment of 5 to 10 years, and fine', minYears: 5, maxYears: null, maxLife: true,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },
  { section: '106(1)', ipc: '304A', title: 'Causing death by negligence', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Imprisonment up to 5 years and fine', maxYears: 5,
    bailable: true, cognizable: true, triableBy: 'Magistrate of the first class' },
  { section: '108', ipc: '306', title: 'Abetment of suicide', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Imprisonment up to 10 years and fine', maxYears: 10,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },
  { section: '109(1)', ipc: '307', title: 'Attempt to murder', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Imprisonment up to 10 years and fine; imprisonment for life if hurt is caused', maxYears: null, maxLife: true,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },
  { section: '115(2)', ipc: '323', title: 'Voluntarily causing hurt', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Imprisonment up to 1 year, or fine up to ₹10,000, or both', maxYears: 1,
    bailable: true, cognizable: false, triableBy: 'Any Magistrate' },
  { section: '117(2)', ipc: '325', title: 'Voluntarily causing grievous hurt', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Imprisonment up to 7 years and fine', maxYears: 7,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '118(1)', ipc: '324', title: 'Voluntarily causing hurt by dangerous weapons or means', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Imprisonment up to 3 years, or fine up to ₹20,000, or both', maxYears: 3,
    bailable: false, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '126(2)', ipc: '341', title: 'Wrongful restraint', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Simple imprisonment up to 1 month, or fine up to ₹5,000, or both', maxYears: 1 / 12,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '127(2)', ipc: '342', title: 'Wrongful confinement', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Imprisonment up to 1 year, or fine up to ₹5,000, or both', maxYears: 1,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '137(2)', ipc: '363', title: 'Kidnapping', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Imprisonment up to 7 years and fine', maxYears: 7,
    bailable: true, cognizable: true, triableBy: 'Magistrate of the first class' },

  // ---------- Chapter V : Offences against woman and child ----------
  { section: '64(1)', ipc: '376', title: 'Rape', chapter: 'V', category: 'Offences against woman and child',
    punishment: 'Rigorous imprisonment of not less than 10 years, which may extend to imprisonment for life, and fine', minYears: 10, maxYears: null, maxLife: true,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },
  { section: '74', ipc: '354', title: 'Assault or criminal force to woman with intent to outrage her modesty', chapter: 'V', category: 'Offences against woman and child',
    punishment: 'Imprisonment of 1 to 5 years and fine', minYears: 1, maxYears: 5,
    bailable: false, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '75(2)', ipc: '354A', title: 'Sexual harassment', chapter: 'V', category: 'Offences against woman and child',
    punishment: 'Rigorous imprisonment up to 3 years, or fine, or both', maxYears: 3,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '78(2)', ipc: '354D', title: 'Stalking (first conviction)', chapter: 'V', category: 'Offences against woman and child',
    punishment: 'Imprisonment up to 3 years and fine', maxYears: 3,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '79', ipc: '509', title: 'Word, gesture or act intended to insult the modesty of a woman', chapter: 'V', category: 'Offences against woman and child',
    punishment: 'Simple imprisonment up to 3 years and fine', maxYears: 3,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '80(2)', ipc: '304B', title: 'Dowry death', chapter: 'V', category: 'Offences against woman and child',
    punishment: 'Imprisonment of not less than 7 years, which may extend to imprisonment for life', minYears: 7, maxYears: null, maxLife: true,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },
  { section: '85', ipc: '498A', title: 'Cruelty by husband or relative of husband', chapter: 'V', category: 'Offences against woman and child',
    punishment: 'Imprisonment up to 3 years and fine', maxYears: 3,
    bailable: false, cognizable: true, triableBy: 'Magistrate of the first class' },

  // ---------- Chapter IV : Abetment, criminal conspiracy and attempt ----------
  { section: '61(2)', ipc: '120B', title: 'Criminal conspiracy (to commit a non-grave offence)', chapter: 'IV', category: 'Abetment, conspiracy and attempt',
    punishment: 'Imprisonment up to 6 months, or fine, or both', maxYears: 0.5,
    bailable: true, cognizable: false, triableBy: 'Magistrate of the first class' },

  // ---------- Chapter VI (organised crime / terrorism are in Ch. VI of BNS) ----------
  { section: '111', ipc: '—', title: 'Organised crime', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Death or imprisonment for life (if death results); otherwise not less than 5 years up to life, and fine', minYears: 5, maxYears: null, maxLife: true, death: true,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },
  { section: '113', ipc: '—', title: 'Terrorist act', chapter: 'VI', category: 'Offences affecting the human body',
    punishment: 'Death or imprisonment for life (if death results); otherwise not less than 5 years up to life, and fine', minYears: 5, maxYears: null, maxLife: true, death: true,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },

  // ---------- Chapter VII : Offences against the State ----------
  { section: '152', ipc: '124A (replaced)', title: 'Act endangering sovereignty, unity and integrity of India', chapter: 'VII', category: 'Offences against the State',
    punishment: 'Imprisonment for life or imprisonment up to 7 years, and fine', maxYears: null, maxLife: true,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },

  // ---------- Chapter XI : Offences against public tranquillity ----------
  { section: '191(2)', ipc: '147', title: 'Rioting', chapter: 'XI', category: 'Offences against public tranquillity',
    punishment: 'Imprisonment up to 2 years, or fine, or both', maxYears: 2,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },

  // ---------- Chapter XV : Public safety ----------
  { section: '281', ipc: '279', title: 'Rash driving or riding on a public way', chapter: 'XV', category: 'Offences affecting public health, safety, etc.',
    punishment: 'Imprisonment up to 6 months, or fine up to ₹1,000, or both', maxYears: 0.5,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },

  // ---------- Chapter XVII : Offences against property ----------
  { section: '303(2)', ipc: '379', title: 'Theft', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 3 years, or fine, or both (community service possible for a first theft below ₹5,000 when property is restored)', maxYears: 3,
    bailable: false, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '304(2)', ipc: '—', title: 'Snatching', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 3 years and fine', maxYears: 3,
    bailable: false, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '305', ipc: '380', title: 'Theft in a dwelling house, means of transportation or place of worship', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 7 years and fine', maxYears: 7,
    bailable: false, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '308(2)', ipc: '384', title: 'Extortion', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 7 years, or fine, or both', maxYears: 7,
    bailable: false, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '309(4)', ipc: '392', title: 'Robbery', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Rigorous imprisonment up to 10 years and fine (up to 14 years if on a highway between sunset and sunrise)', maxYears: 10,
    bailable: false, cognizable: true, triableBy: 'Magistrate of the first class' },
  { section: '310(2)', ipc: '395', title: 'Dacoity', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment for life, or rigorous imprisonment up to 10 years, and fine', maxYears: null, maxLife: true,
    bailable: false, cognizable: true, triableBy: 'Court of Session' },
  { section: '316(2)', ipc: '406', title: 'Criminal breach of trust', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 5 years, or fine, or both', maxYears: 5,
    bailable: false, cognizable: true, triableBy: 'Magistrate of the first class' },
  { section: '318(2)', ipc: '417', title: 'Cheating', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 3 years, or fine, or both', maxYears: 3,
    bailable: true, cognizable: false, triableBy: 'Any Magistrate' },
  { section: '318(4)', ipc: '420', title: 'Cheating and dishonestly inducing delivery of property', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 7 years and fine', maxYears: 7,
    bailable: false, cognizable: true, triableBy: 'Magistrate of the first class' },
  { section: '324(2)', ipc: '426', title: 'Mischief', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 6 months, or fine, or both', maxYears: 0.5,
    bailable: true, cognizable: false, triableBy: 'Any Magistrate' },
  { section: '329(3)', ipc: '447', title: 'Criminal trespass', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 3 months, or fine up to ₹5,000, or both', maxYears: 0.25,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },
  { section: '329(4)', ipc: '448', title: 'House-trespass', chapter: 'XVII', category: 'Offences against property',
    punishment: 'Imprisonment up to 1 year, or fine up to ₹5,000, or both', maxYears: 1,
    bailable: true, cognizable: true, triableBy: 'Any Magistrate' },

  // ---------- Chapter XVIII : Documents ----------
  { section: '336(2)', ipc: '465', title: 'Forgery', chapter: 'XVIII', category: 'Offences relating to documents',
    punishment: 'Imprisonment up to 2 years, or fine, or both', maxYears: 2,
    bailable: true, cognizable: false, triableBy: 'Magistrate of the first class' },

  // ---------- Chapter XIX : Criminal intimidation, insult, annoyance, defamation ----------
  { section: '351(2)', ipc: '506 (Part I)', title: 'Criminal intimidation', chapter: 'XIX', category: 'Criminal intimidation, insult and defamation',
    punishment: 'Imprisonment up to 2 years, or fine, or both', maxYears: 2,
    bailable: true, cognizable: false, triableBy: 'Any Magistrate' },
  { section: '351(3)', ipc: '506 (Part II)', title: 'Criminal intimidation – threat to cause death or grievous hurt', chapter: 'XIX', category: 'Criminal intimidation, insult and defamation',
    punishment: 'Imprisonment up to 7 years, or fine, or both', maxYears: 7,
    bailable: true, cognizable: false, triableBy: 'Magistrate of the first class' },
  { section: '356(2)', ipc: '500', title: 'Defamation', chapter: 'XIX', category: 'Criminal intimidation, insult and defamation',
    punishment: 'Simple imprisonment up to 2 years, or fine, or both, or community service', maxYears: 2,
    bailable: true, cognizable: false, triableBy: 'Magistrate of the first class' },
];
