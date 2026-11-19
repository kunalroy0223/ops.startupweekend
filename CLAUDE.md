# CLAUDE.md — working on Inhub Workspace

Read `prd.md`, `trd.md`, then the relevant file in `docs/` before changing behaviour. The `docs/supplied/` files are the original drafts; the `docs/*.md` copies carry an "Implementation record" appendix that wins where they differ.

## Commands

```bash
npm run emulators        # Firebase Auth + Firestore emulators (needs Java)
npm run bootstrap -- --email you@org --name "Your Name" --password '…'   # first Admin (emulator or real project)
npm run dev              # http://localhost:3000
npm run check            # typecheck + lint + unit tests + build
npm run test:rules       # Firestore rules tests (starts its own emulator)
npm run test:e2e         # end-to-end against running emulators + `npm start`
```

## Rules of the codebase

- **Authorization lives in `src/domain/authz.ts` only.** Server code calls it; components never decide access. If you add a permission, update the RBAC appendix and `firestore.rules`, and add tests.
- **Never trust the client.** All writes go through `src/app/api/**` route handlers wrapped in `route()` → `requireApiActor` → zod `parseBody` → a service in `src/server/services`.
- **One transaction per change** writing the business doc, `writeAudit(...)` and, when someone should hear about it, `enqueueEvent(...)`. Never send email directly from a service.
- **Notifications:** add the event to `src/domain/events.ts` and a handler in `src/server/notifications/registry.ts`. Keep deterministic IDs and `create()`; never introduce a path that can send the same email twice.
- **No deletes of history.** Remove/archive = status change with who/when.
- **No secrets** in Git or in anything imported by a client component. Server-only modules start with `import "server-only"`. ESLint blocks `@/server/*` and `firebase-admin` in components.
- **No fake data** in real Firestore projects. Seed only through the emulator.
- **Do not force-push** or rewrite shared history.

## UI rules

- Product owner wants it **easy to understand**: plain labels, one clear primary action, helper text, guided empty states.
- Product owner wants **smooth motion, many icons, and pop-ups**:
  - Results → `useToast()` (`components/ui/toast.tsx`). Form/action errors → `<FormError message>`. Decisions → `<ConfirmDialog>`.
  - **Never use `window.alert`, `confirm` or `prompt`.**
  - Icons from `lucide-react`; pass them as elements (`icon={<Users />}`) to `PageHeader`, `SectionHeading`, `EmptyState`, `Metric`, `Button`.
  - Motion: Framer Motion for UI transitions (`components/motion/reveal.tsx`), GSAP for headlines/count-ups (`gsap-fx.tsx`), anime.js for micro-interactions (`anime-fx.tsx`), Lenis for scroll (`smooth-scroll.tsx`). Every effect must no-op under `prefers-reduced-motion`. Add `data-lenis-prevent` to any inner scroll container.
- Brand: `#39C463`, `#000`, `#FFF`, `#8298AB` (+ logo navy `#103048`, cyan `#0090D8`). Use tokens, not hex, in components. Logos exactly as supplied.
- Signature motifs (`.hl`, `.sticker`, `.dotgrid`, `.inked`) only on identity surfaces, never in tables or forms.

## Layout

```
src/domain      pure logic + tests in tests/unit
src/server      server-only (env, firebase-admin, session, scope, audit, outbox, email, services, queries)
src/app         (auth) and (app) route groups, api/* handlers, proxy.ts
src/components  ui/, motion/, shell/, auth/, people/, structure/, notifications/, settings/
scripts         bootstrap.mjs, e2e-emulator.mjs
docs            specs, audit, reference analysis, architecture validation
```

## Hidden navigation

`RELEASED_NAV` in `src/domain/authz.ts` hides Modules 2–5 entries (My Work, Tasks, Projects, Work Reports, Analytics) until they ship.
