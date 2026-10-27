# Bail Reckoner — Bail Assessment & Legal Rights Calculator

Full Stack Development project (2311CSC503R) · Department of Information Technology, SRM Easwari Engineering College
Presented by **Dharshni R T** (310624205049) · Guide: **Ms. Sai Lakshmi**

A web app that takes basic case details (offence sections, custody status, investigation stage, personal circumstances) and maps them against bail provisions of the **Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS)**. It explains which provisions may apply, **why**, and what to do next — in plain language.

> ⚠️ Informational tool only — not a substitute for legal advice or a court's decision.

---

## Tech stack
| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript (no framework) |
| Backend | Node.js, Express.js |
| Database | MongoDB (Mongoose) |
| Auth | JWT + bcrypt password hashing |
| Tests | Node.js built-in test runner |

## Setup (Windows)

1. **Install Node.js 18 or newer** — https://nodejs.org (LTS). Check with `node -v`.
2. **Install MongoDB** — either:
   - **MongoDB Community Server** (local): https://www.mongodb.com/try/download/community — install "as a Service" so it runs automatically. MongoDB Compass (optional) lets you view the data.
   - **or MongoDB Atlas** (free cloud database): create a free cluster and copy the connection string into `MONGODB_URI` in `.env`.
3. Open this folder in VS Code and run in the terminal:
   ```bash
   npm install
   npm start
   ```
4. Open **http://localhost:5000**

On first start the server automatically loads the legal database (40 offences, 24 provisions, 13 rules) and creates the admin account.

| Account | Email | Password |
|---|---|---|
| Admin | `admin@bailreckoner.local` | `Admin@12345` |

Change these in `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) **before** the first run. Also set a long random `JWT_SECRET`.

### Useful commands
```bash
npm run dev            # auto-restart on code changes (nodemon)
npm test               # run the rule-engine tests (no database needed)
npm run seed           # add any missing seed records
npm run seed -- --reset  # reload offences, provisions and rules from seed files
```

## Project structure (matches the architecture slide)
```
bail-reckoner/
├── public/                    ← WEB INTERFACE (CLIENT)
│   ├── index.html             Case information form (4 steps) + results dashboard
│   ├── login.html             Login / register
│   ├── history.html           Saved assessments
│   ├── library.html           Legal rights & provisions library
│   ├── admin.html             Legal source / admin module
│   ├── css/style.css
│   └── js/                    api.js, assess.js, results.js, admin.js, ...
├── server/                    ← BACKEND SERVER
│   ├── server.js              Entry point
│   ├── app.js                 Express app, security, routes
│   ├── config/db.js           MongoDB connection
│   ├── middleware/auth.js     JWT authentication & admin guard
│   ├── routes/                auth.js, public.js (assess, history), admin.js
│   ├── engine/ruleEngine.js   ← LEGAL RULE & ASSESSMENT ENGINE
│   ├── models/index.js        ← CENTRAL LEGAL DATABASE schemas
│   └── seed/                  Seed data: offences, provisions, rules
└── tests/engine.test.js       19 test scenarios for the rule engine
```

## How the assessment works
1. The user selects BNS offence sections and answers questions about custody, stage, the person and the arrest.
2. `POST /api/assess` loads offences, provisions and **enabled rules** from MongoDB.
3. The rule engine runs each rule. Every finding carries a **status**, an **explanation**, **reasons ("why this was flagged")**, **next steps** and the **provisions** it relies on (with the old CrPC section).
4. The results page shows a summary, findings, rights, bail conditions, a document checklist and next steps. It can be printed or saved as PDF.

### Rules implemented
| Rule | Provision | What it checks |
|---|---|---|
| Bail as of right | BNSS 478 | All offences bailable |
| Indigent person | BNSS 478(1) Expl. | Can't furnish bail within 7 days → personal bond |
| Discretionary bail | BNSS 480, 483 | Bars (death/life, prior convictions) and exceptions (child, woman, sick/infirm); forum |
| Anticipatory bail | BNSS 482 | Not arrested + non-bailable offence |
| Notice of appearance | BNSS 35(3) | Offences up to 7 years |
| Elderly / infirm | BNSS 35(7) | Age above 60 or infirm, offence below 3 years |
| Default bail | BNSS 187(3) | 60/90 days from first remand without charge sheet (day of remand counted); flags the contested "exactly 10 years" category |
| Undertrial release | BNSS 479 | ½ of max sentence (⅓ for first-time offenders); excluded for death/life and multiple pending cases |
| Magistrate trial delay | BNSS 480(6) | Trial not concluded within 60 days of evidence |
| Mandatory conditions | BNSS 480(3), 485 | 7+ years or BNS Chapters VI/VII/XVII |
| Arrest safeguards | BNSS 47, 48, 58; Art. 21–22 | 24-hour production, grounds of arrest, relative informed |
| Legal aid | BNSS 341 | No lawyer → free legal aid (NALSA 15100) |
| Special laws | NDPS 37, UAPA 43D, PMLA 45, POCSO | Stricter regimes override BNSS |

### Admin module — verify before publish
Admins can edit offences and provisions directly. **Rule changes** (parameters, enable/disable, description) are saved as **pending** and only affect assessments after **Verify & publish**, which increments the rule version. Every change is recorded in the **change log**. Each assessment lists the rule versions it used.

## API reference
| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Public |
| GET | `/api/auth/me` | User |
| GET | `/api/offences`, `/api/provisions`, `/api/meta`, `/api/health` | Public |
| POST | `/api/assess` | Public (saved to history if logged in) |
| GET/DELETE | `/api/assessments`, `/api/assessments/:id` | User |
| GET | `/api/admin/stats`, `/api/admin/changelog` | Admin |
| GET/POST/PUT/DELETE | `/api/admin/offences[/:id]` | Admin |
| GET/POST/PUT | `/api/admin/provisions[/:id]` | Admin |
| GET/PUT | `/api/admin/rules[/:key]` | Admin (propose) |
| POST | `/api/admin/rules/:key/verify`, `/discard` | Admin |

## Demo scenarios for review
1. **Bailable case:** BNS 115(2) Hurt, in custody → *Bail as of right*.
2. **Default bail:** BNS 303(2) Theft, in custody, remand date 70 days ago, investigation ongoing → *Statutory right may have accrued* with a 60-day timeline.
3. **Serious offence:** BNS 103(1) Murder, in custody → *Restricted*; 90-day default bail; s.479 not available; Court of Session. Change gender to *Female* → exception noted.
4. **Before arrest:** BNS 318(4) Cheating, not arrested, fears arrest → *Anticipatory bail* + *Notice of appearance*.
5. **Rights violation:** any case, answer "No" to "grounds of arrest explained" → red *Attention* card.
6. **Admin:** change Default bail `shortDays` → Save as pending → run scenario 2 (unchanged) → Verify & publish → run again (changed).

## Data accuracy note
Offence classifications follow the First Schedule of the BNSS as understood at the time of building. Before any real use, an admin should verify them against the official text on [India Code](https://www.indiacode.nic.in/) and any State amendments. Courts are divided on some points (e.g. whether offences with a maximum of exactly 10 years fall in the 60- or 90-day default bail category); the app flags these instead of choosing one.

## References
- Bharatiya Nagarik Suraksha Sanhita, 2023 — India Code
- Bharatiya Nyaya Sanhita, 2023 — India Code
- eCourts Services; National Legal Services Authority (NALSA); Supreme Court of India
- Cases cited in the engine: *Rakesh Kumar Paul v. State of Assam* (2017), *Enforcement Directorate v. Kapil Wadhawan* (2023), *Prabir Purkayastha v. State* (2024), *Vihaan Kumar v. State of Haryana* (2025)
