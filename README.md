# VEKTOR BILLING PORTAL — MDB Final V7

**Vektor Solutions LLC** — Practice Reporting Dashboard  
Stack: React/Vite · Vercel Serverless · Supabase · Nodemailer/Hostinger SMTP · Anthropic Claude (VEMBOT) · Google Sheets API

---

## Architecture

```
Frontend (React/Vite)           → dist/ → Vercel CDN
API Layer (Vercel Serverless)   → /api/**/*.js → Node 20.x (ESM)
Auth                            → Supabase (users + otp_codes) + JWT httpOnly cookie
Email (OTP + Invites)           → Nodemailer → Hostinger SMTP → noreply@veksol.com
AI (VEMBOT)                     → Anthropic Claude Sonnet via /api/ai/query
Data                            → Google Sheets API v4 (service account)
Cron                            → Vercel Cron → /api/cron/refreshSheets (2am EST daily)
Live Domain                     → portal.veksol.com (Vercel deployment)
```

---

## IMPORTANT: ESM Module System

All API files use ES Modules (`import`/`export default`).  
`package.json` has `"type": "module"` — do not remove this.  
Do not mix `require()` or `module.exports` into any API file.

---

## Environment Variables

Set all of these in Vercel Dashboard → Project → Settings → Environment Variables.

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | supabase.com → Your Project → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | supabase.com → Settings → API → service_role key (click Reveal) |
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `noreply@veksol.com` |
| `SMTP_PASS` | Hostinger email password for noreply@veksol.com |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud Console → Service Account → JSON Key (single line) |
| `CRON_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |

---

## Vercel Deployment

```bash
npm install
vercel          # first deploy / test URL
vercel --prod   # production deploy
```

**No manual Node version config needed.** Vercel auto-detects Node 20 from `engines` in package.json.

---

## Supabase Setup

1. supabase.com → SQL Editor → New Query
2. Paste entire `SUPABASE_SETUP.sql` → Run
3. Tables: `users`, `otp_codes` — RLS enabled, service_role only
4. Admin user seeded: `support@veksol.com`

---

## Google Sheets Setup

Each doctor needs one Google Sheet shared with the service account.

**Required tabs:** `MCR-Jan` through `MCR-Dec`, `DASHBOARD_SUMMARY`, `2025 DATA` (Jan–Mar only)

**MCR tab columns:** A: Claim ID · B: DOS · C: Patient · D: CPT · E: Payer · F: Billed · G: Allowed · H: Collected · I: Status · J: Denial Reason

**Status values (exact):** `PAID` · `PENDING` · `DENIED` · `IN APPEAL`

**To connect a sheet:** Admin portal → doctor row → paste sheet URL → SAVE → TEST → share sheet with service account email shown → RETEST → confirm CONNECTED

---

## API Endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/sendotp` | None | Send OTP email |
| POST | `/api/auth/verifyotp` | None | Verify OTP, issue JWT |
| GET | `/api/auth/me` | JWT | Session check |
| POST | `/api/auth/logout` | None | Clear cookie |
| GET | `/api/dashboard/kpis` | JWT | Live KPIs from Google Sheet |
| POST | `/api/ai/query` | JWT | VEMBOT → Anthropic |
| GET | `/api/admin/users` | Admin | List doctors |
| POST | `/api/admin/addDoctor` | Admin | Add doctor + invite email |
| PUT | `/api/admin/approveDoctor` | Admin | Approve doctor |
| DELETE | `/api/admin/approveDoctor` | Admin | Remove doctor |
| PUT | `/api/admin/updateSheet` | Admin | Save sheet URL |
| POST | `/api/admin/testSheet` | Admin | Test sheet connectivity |
| GET | `/api/cron/refreshSheets` | Cron | Daily sheet ping (2am EST) |

---

## Project Structure

```
MDB-Final-V6/
├── api/
│   ├── _auth.js
│   ├── auth/         sendotp.js · verifyotp.js · me.js · logout.js
│   ├── dashboard/    kpis.js
│   ├── ai/           query.js
│   ├── admin/        users.js · addDoctor.js · approveDoctor.js · updateSheet.js · testSheet.js
│   └── cron/         refreshSheets.js
├── src/
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json       ← "type":"module" required
├── vite.config.js
├── vercel.json        ← no functions block (Vercel auto-detects Node)
├── SUPABASE_SETUP.sql
├── .env.example
├── .gitignore
└── README.md
```

---

## Version History

- **V7.0** — Google Sheets live data, sheet connection testing in admin, Vercel cron refresh, ESM fix, admin portal wired to Supabase.
- **V6.0** — Nodemailer/Hostinger SMTP, full serverless API suite.
