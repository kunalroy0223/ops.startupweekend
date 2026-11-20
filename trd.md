# Inhub Workspace — Technical Requirements (reconstructed)

> **Derived document.** The original `trd.md` was never supplied. This version records the architecture as built for Module 1 and the constraints from the master prompt. Replace or reconcile if the original exists.

**Last updated:** 2026-11-19

## 1. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, server components, route handlers, `proxy.ts`, `after()`) |
| Language | TypeScript 5.9, strict, `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS 4 with design tokens in `src/app/globals.css` |
| Motion | Lenis (scroll), Framer Motion (UI transitions), GSAP (identity moments), anime.js (micro-interactions) |
| Icons | lucide-react |
| Auth | Firebase Authentication (email + password) |
| Database | Cloud Firestore (server-only writes via firebase-admin) |
| Documents | Firestore stores approved document URLs and reference metadata; binary files remain in external document storage |
| Email | Resend over HTTPS + React Email templates |
| Hosting | Vercel (+ Vercel Cron) |
| Validation | zod 4, shared by API and forms |
| Tests | vitest (unit), @firebase/rules-unit-testing (rules), Playwright against emulators (e2e) |

## 2. Layering

```
src/domain     pure: types, authz, validation, events          (no I/O, unit-tested)
src/server     server-only: env, firebase-admin, session, scope, audit, outbox, email, services, queries
src/app        routes: (auth) pages, (app) pages, api/* route handlers
src/components client/server UI; may not import src/server (ESLint-enforced)
src/lib        browser-safe helpers (api client, firebase client for auth only, format)
```

## 3. Authentication and sessions

1. Browser signs in with the Firebase client SDK (in-memory persistence).
2. It POSTs the ID token to `/api/auth/session`. The server verifies it (revocation checked, `auth_time` within 5 minutes, profile `active`) and sets an httpOnly, SameSite=Lax `__session` cookie (Secure whenever `APP_URL` is https).
3. The browser signs out of the client SDK; from then on only the cookie exists.
4. Every server request calls `verifySessionCookie(cookie, true)` and reads the profile from Firestore. Inactive → redirect to sign-out with a reason.
5. `proxy.ts` only does an optimistic redirect when no cookie is present; it is not a security boundary.

## 4. Authorization

`src/domain/authz.ts` holds every rule. Scope is loaded per request from active membership documents. Firestore rules mirror read scope and deny all client writes. Custom claims are not used.

## 5. Mutations

Every mutation is a route handler wrapped by `route()` which: checks Origin (CSRF), requires an active actor, parses the body with zod (unknown keys rejected), calls a service. Services run a Firestore transaction that writes the change, an `auditLogs` entry and (if needed) a `domainEvents` entry together. Errors map to `{ error: { code, message, fields } }` with proper HTTP status.

## 6. Notifications

Transactional outbox, lease-based processing, deterministic IDs with `create()`, Resend Idempotency-Key, bounded retries, signed and deduplicated webhooks. Full detail: `docs/notification-specification.md`.

## 7. Security requirements

- No secrets in Git; `.env.local`, service accounts and `.firebaserc` are git-ignored.
- Firebase Admin credentials, Resend key, encryption key and cron secret are server-only (validated in `src/server/env.ts`, never prefixed `NEXT_PUBLIC_`).
- Invitation tokens: 32 random bytes; only SHA-256 hash stored; AES-256-GCM sealed copy while pending.
- Security headers in `next.config.ts`: nosniff, strict referrer policy, `X-Frame-Options: DENY`, Permissions-Policy, HSTS. A Content-Security-Policy is not yet set (to add before launch).
- Password-reset throttling; neutral responses (no account enumeration).
- No fake data in production collections: the bootstrap script only creates the organisation, default workspace and first Admin.
- History is never silently overwritten: removals and archives are status changes with who/when.

## 8. Performance

- Server components render data; client JS is limited to interactive pieces and the motion layer.
- Queries are indexed (`firestore.indexes.json`) and paginated (People directory, Activity).
- Motion libraries load on the client only and do nothing under reduced motion.

## 9. Environments

| Environment | Firebase | Email |
|---|---|---|
| Local | Emulators (`USE_FIREBASE_EMULATORS=true`) | Not configured → recorded as failed |
| Preview / Production | Real project via service-account env vars | Resend with verified domain |

## 10. Testing gates

`npm run check` (typecheck, lint, unit, build) must pass; `npm run test:rules` and `npm run test:e2e` run against emulators before each release.
