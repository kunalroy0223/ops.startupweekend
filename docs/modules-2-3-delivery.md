# Inhub Workspace — Modules 2 and 3 delivery

**Working-tree delivery:** 20 November 2026
**Production status:** Not deployed or production-verified.

## Module 2 — Task and project management

Implemented in this source tree:

- Create, edit, list and archive projects; project cards show task completion progress and link to project-filtered tasks.
- Create and edit tasks with one accountable owner, optional collaborators, team/workstream scope, project association, priority, due date and time, description and acceptance criteria.
- Task due date/time values are interpreted and displayed in the organisation's configured timezone, not the browser timezone.
- List and Kanban task views with search and status, project and priority filters.
- Role- and scope-checked status transitions, including mandatory reasons for cancellation and reopening.
- Parent/subtask and dependency relationships, with server-side same-workspace and cycle validation.
- Task detail, reference links, comments, validated mentions and an activity timeline.
- Task document references and external links stored as URL values on the task document in Firestore; file bytes remain in the team’s approved external document store.
- Transactional outbox events for task assignment, status changes, comments and mentions.

## Module 3 — Work reports and timesheets

Implemented in this source tree:

- One deterministic daily report per user, workspace and reporting date.
- Draft reports with task-linked or standalone work entries.
- Work completed, progress summary, optional time spent, blockers, next steps and document/reference URLs stored with each work entry in Firestore.
- Submit locks the report and writes an immutable version snapshot.
- Lead review queue is limited to the Lead's assigned scope; Admin review is organisation-wide; self-review is denied.
- Approve and request-revision actions, mandatory revision comments, author edit/resubmission and append-only review history.
- Reviewer names, review decisions and timestamps in the report detail.
- Submission, approval and revision notifications through the transactional outbox.
- Reports are not treated as attendance records and no daily-hours minimum is enforced.

## Local verification and setup

The repository's lockfile resolves Firebase JavaScript SDK packages requiring Node.js `>=24.12.0`. Use Node.js 24.12.0 or newer locally and set the Vercel project runtime to Node.js `24.x`.

```bash
nvm install 24
nvm use 24
npm ci
npm run check
```

The complete `check` script runs TypeScript typechecking, ESLint, unit tests and the Next.js production build. After that succeeds, run the Firebase Emulator rule and end-to-end suites according to the repository README before deploying.

## Firebase deployment steps

1. Confirm the active Firebase project is `inhub-workspace` before deploying anything.
2. Deploy the updated Firestore composite indexes:

   ```bash
   firebase deploy --only firestore:indexes
   ```

3. Set the Vercel Node.js runtime to `24.x`, confirm the existing Auth, Firestore and server environment variables are present, then deploy through the normal Git/Vercel workflow. No Firebase Storage bucket, Storage permissions, CORS policy or `FIREBASE_STORAGE_BUCKET` setting is required.
4. Run smoke tests for Admin, Lead and Member accounts across project/task access, task status permissions, comments/mentions, document/reference links, report submission, report review and revision/resubmission.

Task and report documents store validated external URLs in Firestore. Binary files remain in an approved external document store such as the organisation's shared drive; Inhub Workspace does not upload, proxy or store file contents.

## Verification status and limitations

- The user verified `npm run check` locally on Node.js 24.22.3: TypeScript, ESLint, all 50 unit tests and the Next.js production build passed.
- The user verified `npm run test:rules`: all 12 Firestore Emulator security-rules tests passed on the local emulator (Firestore port 8085).
- End-to-end tests (`npm run test:e2e`) and production smoke testing remain outstanding.
- No production Firestore indexes/rules, Vercel environment variables or production deployment were changed during local verification.
