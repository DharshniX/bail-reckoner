const mongoose = require('mongoose');
const { Schema } = mongoose;

// ---------------- User ----------------
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  active: { type: Boolean, default: true },          // false = deactivated by an admin, cannot log in
  failedLogins: { type: Number, default: 0 },        // consecutive wrong passwords
  lockUntil: { type: Date, default: null },          // set after too many failed logins
  lastLoginAt: { type: Date, default: null },
  passwordChangedAt: { type: Date, default: null },  // tokens issued before this are rejected
}, {
  timestamps: true,
  // Safety net: the password hash is never included when a user document is sent as JSON
  toJSON: { transform: (_doc, ret) => { delete ret.passwordHash; delete ret.__v; return ret; } },
});
userSchema.methods.toSafeJSON = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role, createdAt: this.createdAt };
};
userSchema.methods.isLocked = function () {
  return !!this.lockUntil && this.lockUntil > Date.now();
};

// ---------------- Offence (BNS) ----------------
const offenceSchema = new Schema({
  section: { type: String, required: true, unique: true, trim: true },
  ipc: { type: String, default: '—' },
  title: { type: String, required: true },
  chapter: { type: String, default: '' },
  category: { type: String, default: '' },
  punishment: { type: String, default: '' },
  minYears: { type: Number, default: null },
  maxYears: { type: Number, default: null },
  maxLife: { type: Boolean, default: false },
  death: { type: Boolean, default: false },
  bailable: { type: Boolean, required: true },
  cognizable: { type: Boolean, required: true },
  triableBy: { type: String, default: 'Any Magistrate' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

// ---------------- Legal provision ----------------
const provisionSchema = new Schema({
  code: { type: String, required: true, unique: true },
  act: String,
  section: String,
  oldSection: String,
  type: { type: String, enum: ['bail', 'right', 'condition', 'special'], default: 'bail' },
  title: String,
  summary: String,
  plain: String,
  reference: String,
}, { timestamps: true });

// ---------------- Rule (configurable, with verify-before-publish) ----------------
const ruleSchema = new Schema({
  key: { type: String, required: true, unique: true },
  name: String,
  description: String,
  provisionCodes: [String],
  params: { type: Schema.Types.Mixed, default: {} },
  enabled: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  pending: {
    type: new Schema({
      params: Schema.Types.Mixed,
      enabled: Boolean,
      description: String,
      note: String,
      proposedBy: String,
      proposedAt: Date,
    }, { _id: false }),
    default: null,
  },
  verifiedBy: String,
  verifiedAt: Date,
}, { timestamps: true, minimize: false });

// ---------------- Saved assessment ----------------
const assessmentSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  title: String,
  input: Schema.Types.Mixed,
  result: Schema.Types.Mixed,
}, { timestamps: true, minimize: false });
// "My assessments" lists one user's assessments newest first; this index serves exactly that query
// (and, being prefixed by user, also lookups/deletes by user alone)
assessmentSchema.index({ user: 1, createdAt: -1 });

// ---------------- Change log (audit trail for admin module) ----------------
const changeLogSchema = new Schema({
  entity: { type: String, enum: ['offence', 'provision', 'rule', 'user'] },
  ref: String,
  action: String,
  summary: String,
  by: String,
}, { timestamps: true });
changeLogSchema.index({ createdAt: -1 }); // the change log is always read newest first

module.exports = {
  User: mongoose.model('User', userSchema),
  Offence: mongoose.model('Offence', offenceSchema),
  Provision: mongoose.model('Provision', provisionSchema),
  Rule: mongoose.model('Rule', ruleSchema),
  Assessment: mongoose.model('Assessment', assessmentSchema),
  ChangeLog: mongoose.model('ChangeLog', changeLogSchema),
};
