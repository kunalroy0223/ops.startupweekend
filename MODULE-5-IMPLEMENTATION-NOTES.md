# Module 5 — Notifications & Automation

## Delivered in this slice

- Existing transactional outbox retained for immediate notifications and email.
- `TASK_DUE_SOON` and `TASK_OVERDUE` event handlers resolve the current task owner and revalidate task state/deadline before fan-out.
- Scheduled evaluator creates deterministic automation run records with leases, retry states and an execution history.
- Overdue-task scanning advances a persistent cursor so repeated daily runs do not permanently rescan only the first page.
- Daily digest worker queues digest items for users who choose `daily_digest`, groups by organisation-local date, atomically attaches items, sends through Resend with a stable idempotency key and records outcomes.
- Admin Automation page supports rule configuration, enable/pause for supported rules, manual evaluation, automation run history, failed-run retry, daily-digest delivery history/retry, recent email-delivery history/retry and failed outbox-event inspection/retry.
- CRM follow-up/reply rules remain visible but non-executable because the current CRM UI/services do not yet implement the required campaign follow-up and inbound-reply lifecycle.
- The evaluator only emits notifications; it does not mutate task/project/CRM data or create tasks.

## Deployment configuration

After extracting the patch, run:

```bash
node scripts/apply-module-5-config.mjs
```

The script merges thirteen required composite index definitions into the existing `firestore.indexes.json` without replacing existing indexes; it adds only definitions that are missing. This includes the two owner-scoped CRM account/contact indexes used by Lead and Team Member queries, plus eleven Module 5 indexes. It sets the existing `/api/cron/process-outbox` schedule to `35 3 * * *` (03:35 UTC / 09:05 Asia/Kolkata). Other cron jobs are preserved. The five-minute buffer ensures the daily digest boundary at 09:00 local has passed before the scheduled worker starts. On Vercel Hobby, the invocation can occur any time within the configured hour (03:35–04:34 UTC, or 09:05–10:04 IST); Pro/Enterprise cron precision is per minute. If the organisation timezone changes from Asia/Kolkata, update the UTC cron schedule accordingly.

Deploy Firestore indexes before relying on the new scheduled queries. Firebase builds indexes asynchronously; wait until each new index reports `Enabled`.

## Important operating limits

- The Vercel job is daily in this baseline. Vercel Hobby permits one cron run per day with per-hour precision; Pro and Enterprise permit per-minute schedules. For sub-daily due-soon cadence or tighter retry timing, use Pro/Enterprise or an external scheduler to call `/api/cron/process-outbox`, retaining `CRON_SECRET` authentication. Retry timestamps are enforced when the worker next runs; on this daily baseline, automatic retries can therefore be delayed until the next scheduled run unless an Admin manually runs the evaluator.
- The due-soon rule defaults to a 1,440-minute lead time. Smaller configured windows can be missed by a once-daily scheduler.
- Scheduled task candidate scans process up to 250 records per rule invocation. The overdue rule rotates pages using its persisted cursor. Due-soon evaluation prioritises the nearest due tasks.
- Daily digest queueing attaches up to 400 pending items per transaction and reads up to 400 pending items per scheduled invocation; any remainder is picked up by a later invocation.
- Automation, failed outbox events, email deliveries and digest delivery histories are exposed only to Admins and are audited on retry.
- Resend must be configured and the sender domain verified for real email delivery. In-app notifications continue to follow the existing pipeline.
- No automation rule is automatically enabled by this patch. Admin must explicitly enable supported task rules after verifying the schedule and preferences.

## Required validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Then run the Firestore emulator rules tests if available:

```bash
npm run test:rules
```

Do not deploy until all checks pass and every Module 5 composite index required by the config script is enabled in the target Firebase project; existing matching indexes do not need to be recreated.
