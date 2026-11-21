# CRM Workflows — implementation patch

This patch adds the next CRM workflow slice to the existing Inhub Workspace repository.

## Included

- Partnership opportunity pipeline with stage/outcome handling.
- Campaign creation, activation, enrolment and contact assignment.
- Campaign-member lifecycle, scheduled follow-ups and optional links to existing open tasks.
- Append-only CRM activity history for outreach, replies, calls, meetings, proposals, notes and stage changes.
- Scheduled CRM follow-up and reply-waiting notifications through the Module 5 automation/outbox pipeline.
- Workspace-scoped CRM navigation and workflow UI.
- Server-side permission, assignment, workspace and do-not-contact checks.
- Unit coverage for core CRM workflow helpers and CRM event registration.

## Apply in the existing repository

Run from the repository root (the folder containing `package.json`):

```bash
unzip -o ~/Downloads/inhub-crm-workflows-patch.zip -d .
node scripts/apply-crm-workflow-indexes.mjs
```

The index script merges only the seven CRM workflow index definitions into the existing `firestore.indexes.json`, creates a timestamped backup before writing, and does not deploy to Firebase. It does not replace the file or delete existing entries.

## Validation required on your Node 24 environment

The project declares Node `24.x`; use Node 24.12.0 or later. Then run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Also run Firestore Emulator rules tests and an authenticated Admin/Lead/Member smoke test before merge.

## Important release boundaries

- No production deployment was performed.
- No Firebase indexes were deployed by this patch. The seven new index definitions must be compared with the current remote index list and created in the intended Firebase project before exercising the new compound queries.
- Follow-ups can link an existing open task; this slice does not auto-create tasks or send outbound CRM messages.
- Full typecheck, ESLint, Vitest and Next.js build could not be completed in the patch-generation environment because dependencies were not installed and only Node 22 was available. TypeScript syntax parsing and patch/index-script checks are reported separately in the delivery message.
