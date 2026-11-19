# Architecture Validation

**Date:** 2026-11-19 · **Scope:** first execution task, step 3. Contradictions found in the inputs, the assumptions taken, and the remaining risks.

## 1. Contradictions and how they were resolved

| # | Conflict | Resolution |
|---|---|---|
| 1 | The master prompt lists `prd.md`, `trd.md` and `.env.example` as inputs; they were never supplied. | Reconstructed and marked as derived. Replace them if originals exist. |
| 2 | design-system draft says "do not bring over GSAP, Lenis…" and "restrained motion"; the product owner later asked for Lenis, Framer Motion, GSAP and anime.js. | The owner's instruction wins. Each library has one job, reduced-motion is honoured, motion stays off dense workflows. Recorded in design-system Appendix A.3. |
| 3 | Sender is "Startup Weekend Workspace" but the product is "Inhub Workspace". | Kept the proposed sender as configuration (`EMAIL_FROM`); product copy says Inhub Workspace. Change the env var if needed. |
| 4 | RBAC draft allows optional delegated administration for Leads; schema/workflow drafts assume Admin-only administration. | Default: **Admin-only** in v1 (RBAC §4 default). Lead permissions are a single set in `authz.ts`, so enabling delegation later is a one-place change. |
| 5 | Schema draft suggests custom claims for role; RBAC draft requires changes to apply immediately. | Claims are **not** used for authorization. Role, status and scope are read from Firestore on every request. |
| 6 | Workflow draft wants invitations re-sendable by the outbox; security rules forbid storing raw tokens. | Store SHA-256 hash for lookup plus an AES-GCM sealed copy only while pending; delete on accept/revoke. |

## 2. Assumptions (change if wrong)

- One organisation per deployment (`ORGANIZATION_ID`, default `inhub`).
- Organisation timezone `Asia/Kolkata`.
- A team may serve several workstreams.
- Invitations expire after 7 days (`INVITATION_TTL_HOURS`).
- Sessions last 5 days (`SESSION_MAX_AGE_DAYS`); sensitive changes revoke them.
- Leads cannot invite people in v1.

## 3. Architecture summary

- **Next.js App Router on Vercel.** Server components read data with the Admin SDK; mutations go through route handlers in `src/app/api`.
- **Firebase Auth** for identity only. The browser signs in, exchanges the ID token for an httpOnly session cookie, then signs out of the client SDK. No Firebase data access from the browser.
- **Firestore** as the only database, written only by the server. Rules are default-deny as defence in depth.
- **Transactional outbox** for notifications; **Resend** for email; **Vercel Cron** as the fallback processor.
- **Domain layer** (`src/domain`) is pure and unit-tested: permissions, validation, event catalogue.

## 4. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Not yet run against a real Firebase project | Index or quota surprises | Indexes are declared; run the e2e suite against a staging project before launch. |
| Resend domain not verified | No email | App keeps working; links can be copied; failures are visible to Admins. |
| Vercel Hobby cron limits (daily only) | Slower fallback processing | Primary trigger is `after()` on each mutation; cron is a safety net. Use Pro for 5-minute cron. |
| Per-request Firestore reads for session + scope | Cost and latency at scale | Cached per request; small org size. Revisit if usage grows. |
| Animation libraries add bundle weight | Slower first load on weak devices | Client-only, tree-shaken, no WebGL; reduced-motion users skip them. |
