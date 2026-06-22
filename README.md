# Stratus Financial — Employee Scorecard Dashboard

A responsive web dashboard for tracking employee/department performance scorecards,
built on **Next.js 14 (App Router)** + **Firebase (Auth + Firestore)**, deployed to
**Vercel**, with source on **GitHub**.

> ⚠️ **Data note:** This project ships with clearly-labeled **mock seed data**
> (`src/lib/seed-data.ts`). The original `Stratus Financial Employee Scorecard.xlsx`
> was not available at build time, so every metric name, target, weight, and actual
> value is an **invented placeholder**. Load real data by running the Excel sync
> (Admin → Excel Sync) once Firebase is configured — see step 5 below.

---

## What's inside

| Area | Detail |
|---|---|
| Framework | Next.js 14, React 18, TypeScript |
| Styling | Tailwind CSS (custom Stratus palette + Fraunces/Inter type) |
| Auth | Firebase Auth (email/password) with role custom claims |
| Database | Cloud Firestore |
| Charts | Recharts |
| Excel parsing | SheetJS (`xlsx`) in a server-side API route |
| Roles | `admin` / `manager` / `employee` (three-tier RBAC) |
| Scoring | Weighted attainment vs target; Green ≥ 90, Amber ≥ 70, Red < 70 |

### Pages
- **Overview** — KPI cards + department bar chart, period selector (monthly/quarterly/yearly)
- **Departments** — score cards → drill into full metrics table
- **Department detail** — metrics table (target/actual/weight/score/status), comments, sign-off
- **My Scorecard** — the signed-in employee's own department view
- **Team View** — searchable ranked table with trend deltas
- **Excel Sync** *(admin)* — drag-and-drop `.xlsx` upload → Firestore
- **Settings** *(admin)* — editable thresholds + role reference

---

## Prerequisites
- Node.js 18.18+ (or 20+)
- A Firebase project (Auth + Firestore enabled)
- A GitHub account and a Vercel account

---

## 1. Install

```bash
npm install
```

## 2. Configure Firebase

Copy the env template and fill in your values:

```bash
cp .env.local.example .env.local
```

- **Client config** (`NEXT_PUBLIC_*`): Firebase Console → Project Settings → General → Your apps.
- **Admin config** (`FIREBASE_ADMIN_*`): Firebase Console → Project Settings → Service Accounts → *Generate new private key*. Paste the private key as a single value (keep the `\n` escapes).

In the Firebase Console:
- **Authentication** → enable **Email/Password**.
- **Firestore Database** → create a database (production mode).

## 3. Deploy Firestore rules

Copy the contents of `firestore.rules` into Firebase Console → Firestore → Rules, or
deploy via the Firebase CLI (`firebase deploy --only firestore:rules`).

## 4. Run locally

```bash
npm run dev
```

Visit http://localhost:3000. Until Firestore has data, the UI shows mock data with a
"Demo data" banner — that's expected.

## 5. Provision users and roles

Create users in Firebase Auth (console or your own flow), then assign roles:

```bash
npx tsx scripts/set-role.ts you@stratusfinancial.com admin
npx tsx scripts/set-role.ts manager@stratusfinancial.com manager loan-origination
npx tsx scripts/set-role.ts agent@stratusfinancial.com employee loan-origination
```

Users must sign out/in once for new role claims to apply.

## 6. Load real scorecard data

Sign in as an admin → **Excel Sync** → upload the real
`Stratus Financial Employee Scorecard.xlsx`. Each sheet becomes a department.

> **Column mapping:** the parser in `src/app/api/sync/route.ts` expects (case-insensitive,
> flexible order): `Metric | Target | Unit | Weight | Monthly | Quarterly | Yearly`,
> plus an optional `Direction` column (`higher`/`lower`). **Adjust `parseSheet()` to
> match the real workbook's actual layout** — this is the one place you'll likely need
> to tweak once you see the true column headers.

---

## Deploy: GitHub → Vercel

```bash
# 1. Create the repo and push
git init
git add .
git commit -m "Initial commit: Stratus scorecard dashboard"
git branch -M main
git remote add origin https://github.com/<you>/stratus-scorecard.git
git push -u origin main
```

Then in Vercel:
1. **New Project** → import the GitHub repo.
2. Framework preset auto-detects **Next.js** — no build config changes needed.
3. Add **all** environment variables from `.env.local` to Vercel
   (Project → Settings → Environment Variables). The `FIREBASE_ADMIN_PRIVATE_KEY`
   must include the `\n` escapes exactly as in your local file.
4. **Deploy.**

> **Security reminder:** never commit `.env.local` or any service-account JSON.
> `.gitignore` already excludes them.

---

## Architecture notes & known trade-offs

- **Auth gating happens in three layers:** middleware (coarse cookie check), the
  `(dashboard)` layout (client session check), and Firestore rules (authoritative).
  The sync route additionally verifies an admin ID token server-side. Never rely on
  the client alone.
- **The session cookie** set at login is a simplification for the middleware guard.
  For production hardening, consider Firebase **session cookies** (server-minted,
  httpOnly) instead of storing the ID token in a JS-readable cookie.
- **Seed fallback:** `useDepartments` falls back to mock data when Firestore is empty
  or unreachable, so the app never renders blank during setup.
- **Scoring direction:** metrics support "higher is better" and "lower is better"
  (e.g. error rate, cycle time). Verify each real metric's direction during sync.
- **Thresholds** are currently applied from defaults in code. The Settings page edits
  them in local state; wiring "Save" to a Firestore `config/thresholds` doc (via an
  admin route) is a small, marked TODO.
