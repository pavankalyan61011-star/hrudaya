# Hrudaya

Hrudaya is an open-source procedure record for Indian cardiac catheterisation labs. A cath lab
team enters a coronary angiogram or PCI on a phone in six short steps — patient, indication and
access, angiography findings, intervention and devices (with stent lot numbers for traceability),
procedure details and complications, and discharge — and gets a structured record that reads
like a cath report. The data model is designed to export as FHIR R4 and to plug into India's
Ayushman Bharat Digital Mission (ABDM).

**Live demo:** <https://hrudaya.vercel.app> — demo login available on request.

> ⚠️ **Synthetic data only.** This project must never hold real patient information. Every name,
> MRN, operator and device lot number in it is fictional, every patient row is marked
> `is_synthetic` (the database refuses anything else), and no part of it has been assessed for
> clinical use. Do not enter real patient data.

## Scope

- **In scope:** coronary angiography and PCI only. One cath lab. One user role.
- **Not in scope:** other cardiac procedures (EP, structural, peripheral), scheduling, billing,
  imaging, multi-site or multi-role access, and clinical decision support.

## Stack

Next.js 14 (App Router, TypeScript) · Tailwind CSS · Supabase (Postgres, Auth, row-level
security), Mumbai region · Zod · deployed on Vercel. No ORM and no other backend.

## Local setup

Requires **Node 22.18 or later** (the seed script runs TypeScript directly) and a Supabase project.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in the three values from Supabase →
   Project Settings → API. The service-role key stays on your machine; the app never uses it.
3. Apply the migrations in order (`0001` to `0004`). Either paste each file from
   `supabase/migrations/` into the Supabase SQL editor, or with the Supabase CLI:
   ```bash
   supabase db query --linked --project-ref <your-project-ref> -f supabase/migrations/0001_init.sql
   ```
4. Create a user: Supabase → Authentication → Users → **Add user** (email and password).
   There is no public sign-up page.
5. Load the 20 synthetic cases (safe to re-run; existing cases are skipped):
   ```bash
   npm run seed
   ```
6. Start the app and sign in at <http://localhost:3000>:
   ```bash
   npm run dev
   ```

After a schema change, regenerate `lib/database.types.ts` with
`SUPABASE_PROJECT_REF=<your-project-ref> npm run db:types`.

## Project layout

| Path | What it holds |
|---|---|
| `docs/week1-spec.md` | The Week 1 spec — source of truth for the data model and form |
| `docs/cases/` | The synthetic reference case and cases 002–020 |
| `supabase/migrations/` | Schema, constraints, triggers and RLS |
| `supabase/tests/` | SQL behaviour probe (runs in a transaction that always rolls back) |
| `scripts/seed.ts` | Seeds the 20 synthetic cases |
| `lib/queries/` | Every Supabase query |
| `lib/validation/` | Zod schemas for each form step |
| `app/procedures/` | List, detail (cath report) and the 6-step capture form |

## Week 1 definition of done

From [docs/week1-spec.md §7](docs/week1-spec.md):

- [x] Schema migration runs clean on a fresh Supabase project
- [x] Seed loads 20 cases without error
- [ ] New procedure can be entered start to finish on a phone in under 8 minutes — not yet timed
- [ ] Detail page reads like a real cath report — awaiting review
- [x] Deployed on Vercel behind Supabase email login
- [x] README has the scope statement and a "synthetic data only" notice
- [ ] 60-second Friday progress video recorded

## Roadmap

- **Week 1 — built and deployed:** schema with RLS and audit columns, 6-step capture form, list and detail pages, 20 synthetic cases. Remaining checks above.
- **Week 2 — FHIR R4 export** of a completed procedure.
- **Week 3 — ABDM:** ABHA number and address, Health Information Provider (HIP) integration.
- **Week 4 — AI discharge summary**, design polish, and tighter row-level security.

## Licence

See [LICENSE](LICENSE).
