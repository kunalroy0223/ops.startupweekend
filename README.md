# Inhub Workspace

Internal work-management platform for the Inhub Entrepreneurship Cell. People, teams, workstreams, projects, tasks and daily reports, with role-based access for **Admin**, **Lead** and **Team Member**.

**Delivery status (2026-11-22):** the source workspace contains the 12 numbered Inhub Ops modules. The coordinated Modules 9–12 implementation is included in this source bundle. Full release validation for this latest snapshot is still pending under Node 24.x with dependencies installed; no production Firebase deployment, index/rules deployment, Git push or Vercel deployment is included.

**Canonical roadmap:** [12-module roadmap](docs/inhub-ops-12-module-roadmap.md) · [Modules 9–12 delivery notes](docs/modules-9-12-delivery.md). Preserve the module names and numbering in that roadmap.

| | |
|---|---|
| Stack | Next.js 16 · React 19 · TypeScript · Tailwind 4 · Firebase Auth + Firestore · Resend + React Email · Vercel |
| Motion | Lenis · Framer Motion · GSAP · anime.js (all respect reduced motion) |
| Docs | [`prd.md`](prd.md) · [`trd.md`](trd.md) · [`CLAUDE.md`](CLAUDE.md) · [`docs/`](docs) |

## What's in Module 1

- Invitation-only sign-up (single-use, expiring links; resend / revoke / copy link), sign-in, password reset.
- People directory and profiles; role changes and suspend / deactivate / reactivate, with last-Admin protection.
- Workspaces, workstreams and teams: create, edit, archive, link, add/remove/transfer members and Leads.
- Role-aware overview dashboards with a guided setup checklist for the first Admin.
- Audit log that cannot be edited.
- In-app notifications, email notifications with per-category preferences, Admin email-delivery health and retry tools.
- Animated pop-ups for every success and error, confirmation dialogs for destructive actions, icons throughout, light and dark themes, phone layout.

## Quick start (local, no accounts needed)

Requirements: Node 24.x and Java 11+ (for the Firebase emulators).

```bash
npm ci
touch .env.local
```

The source bundle intentionally contains no local secrets or `.env.local`. Add the emulator values below to `.env.local`:

```env
USE_FIREBASE_EMULATORS=true
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-inhub
FIREBASE_PROJECT_ID=demo-inhub
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-inhub.firebaseapp.com
NEXT_PUBLIC_FIREBASE_APP_ID=demo-app
DATA_ENCRYPTION_KEY=<node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
CRON_SECRET=<any 24+ character string>
```

Then, in three terminals:

```bash
npm run emulators                                   # 1. Auth :9099, Firestore :8085, UI :4000
npm run bootstrap -- --email admin@example.org --name "First Admin" --password 'Admin-pass-123'   # 2. once
npm run dev                                         # 3. http://localhost:3000
```

Sign in as the Admin and follow the setup checklist on the overview: create a workstream, a team, then invite people. Without Resend, the invite dialog shows the link to copy and send yourself.

## Checks

```bash
nvm use 24
npm ci
npm run check        # typecheck + lint + unit tests + production build
npm run test:rules   # Firestore rules tests on an isolated emulator (port 8185)
npm run build && npm start   # then, with emulators running and the Admin bootstrapped:
npm run test:e2e     # 29 end-to-end checks in a real browser (screenshots in e2e-screenshots/)
```

Latest source inspection (2026-11-22): 248 TypeScript/TSX files parse without syntax diagnostics; domain authorization/lifecycle helper typechecks pass; the workspace JSON files parse. The full project typecheck, lint, unit suite, rules emulator suite, production build and preview smoke test remain outstanding for this latest snapshot. Do not treat an earlier run as sign-off for the current source bundle.

## Going live

1. **Firebase**: create a project, enable *Authentication → Email/Password*, create Firestore (production mode). Deploy rules and indexes:
   `cp .firebaserc.example .firebaserc` (set your project ID), then `npx firebase deploy --only firestore:rules,firestore:indexes`.
2. **Service account**: *Project settings → Service accounts → Generate new private key*. Put `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` in Vercel env vars. Never commit the JSON file.
3. **Web app config**: *Project settings → Your apps → Web*. Copy the `NEXT_PUBLIC_FIREBASE_*` values.
4. **Resend**: add and verify `startupweekend.sbs` (SPF + DKIM), create an API key → `RESEND_API_KEY`. Add a webhook to `https://<your-domain>/api/webhooks/resend` for `email.delivered`, `email.bounced`, `email.failed` → `RESEND_WEBHOOK_SECRET`.
5. **Vercel**: import the GitHub repo, set every variable in `.env.example` for Production (and Preview with a separate Firebase project), set `APP_URL` to the real URL. `vercel.json` schedules the outbox cron every 5 minutes (Hobby plans only allow daily; the app still processes events right after each change).
6. **First Admin**: run `npm run bootstrap -- --email … --name …` locally with production env vars. It prints a password-setup link.
7. Smoke-test: sign in, create a team, invite yourself at a second address, accept, check the email arrived.

## What still needs real credentials

| Area | Status |
|---|---|
| Firebase Auth + Firestore | Fully tested on emulators. Not yet run against a real project (indexes deploy, quotas). |
| Resend email | Integration written (idempotency keys, retries, webhooks). **Not sent for real**: deliveries are recorded as `failed / provider_not_configured`, which the tests assert. |
| Resend webhooks | Signature verification is unit-tested; no live webhook received yet. |
| Vercel cron | Configured in `vercel.json`; not deployed. |
| Password-reset email | Uses Firebase's built-in email until Resend is configured. |

## Project layout

```
src/domain        permissions, validation, event catalogue (pure, unit-tested)
src/server        sessions, scope, audit, outbox, email, services, queries (server-only)
src/app           pages for (auth) and (app), API route handlers, proxy.ts
src/components    ui/, motion/, shell/, and feature components
scripts           bootstrap.mjs, e2e-emulator.mjs
tests             unit/, rules/
docs              specs (with implementation appendices), supplied originals, references
public            brand and partner logos (as supplied)
preview           screenshots from the latest end-to-end run
```

## Missing inputs

`prd.md` and `trd.md` are included in this source bundle. The `.env.example` template is not included; create `.env.local` locally from the environment requirements and never commit secrets.
