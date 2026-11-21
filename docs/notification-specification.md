# Inhub Workspace — Notification Specification

**Status:** v1.1 (existing delivery foundation implemented; Module 4 automation extension proposed) · **Owner:** Platform · **Last updated:** 2026-11-21

This document is new; it was required by the master prompt and had no supplied draft. It describes how in-app notifications and email are produced, delivered and kept free of duplicates.

## 1. Goals

1. Every notification comes from a **domain event** written in the same transaction as the change that caused it. No change without its event, no event without its change.
2. **Never send the same email twice** because an event was retried or processed concurrently.
3. Recipients are resolved **at send time** against current membership and account status, so a person removed from a team in the meantime is not told about it.
4. Email is optional and can be missing (no Resend key): the platform keeps working and records exactly what could not be sent.
5. Secrets (invitation links) are only decrypted at the moment an email is built.

## 2. Pipeline

```
mutation (transaction) ─┬─ business write
                        ├─ auditLogs/{id}
                        └─ domainEvents/{id}  status: pending
                                 │
             after() on the same request  ·  current Vercel cron: daily at 03:00 UTC  ·  Admin "Process now"
                                 │
                       processOutbox()  (src/server/notifications/processor.ts)
                                 │ claim event with a lease (transaction: pending → processing, leaseUntil; retries return to pending)
                                 │ handlerFor(eventType).resolve(event) → Recipient[]   (registry.ts)
                                 │ channels = catalogue ∩ preferences ∩ recipient.only   (events.ts)
                    ┌────────────┴─────────────┐
     notifications/{eventId}_{uid}.create()   emailDeliveries/{eventId}_{key}.create()
     (ALREADY_EXISTS → skip)                  (ALREADY_EXISTS → skip unless retryable)
                                              │
                                   sendWithResend(…, Idempotency-Key = delivery id)
                                              │
                        sent  ·  pending + nextRetryAt (backoff)  ·  failed (lastErrorCode)
                                              │
                         /api/webhooks/resend → delivered / bounced / failed
```

## 3. Idempotency guarantees

| Layer | Mechanism |
|---|---|
| Event claim | Transactional lease (`processing`, `leaseUntil`). A crashed worker's lease expires and another worker resumes. |
| In-app | Deterministic ID `${eventId}_${uid}` written with `create()`. A retry hits ALREADY_EXISTS and does nothing. |
| Email record | Deterministic ID `${eventId}_${recipientKey}` written with `create()`. |
| Email provider | Resend `Idempotency-Key` header = delivery ID. If our process dies after Resend accepted the email but before we recorded it, the retry is de-duplicated by Resend. |
| Manual re-queue | Admin "Retry failed": deliveries that failed **ambiguously** (timeout / 5xx after send) keep their original key so Resend can de-duplicate; deliveries that definitely failed (e.g. provider not configured) get a new key `${id}-r${n}`. |
| Webhooks | Svix-style HMAC signature check, then `webhookReceipts/resend_{svix-id}.create()`; replays are ignored. |

The e2e run verifies that processing the outbox again creates no extra notifications or deliveries.

## 4. Retry policy

`nextRetryDelayMs(attempt)` in `src/domain/events.ts`: exponential backoff of 1, 4, 16, then 64 minutes, with at most `MAX_EMAIL_ATTEMPTS = 5` attempts. Retryable: network errors, 429 and 5xx. Not retryable: other 4xx responses, `provider_not_configured`, `recipient_no_longer_eligible`, `render_failed`. After the last attempt the delivery is `failed`, shown on **Settings → Email delivery** and in the Admin "Needs attention" list.

## 5. Event catalogue (Module 1)

| Event | In-app | Email | Essential | Recipients |
|---|---|---|---|---|
| `USER_INVITED` | — | ✓ | ✓ | Invitee (by email; no account yet) |
| `INVITATION_RESENT` | — | ✓ | ✓ | Invitee; skipped if `tokenVersion` changed again |
| `ACCOUNT_ACTIVATED` | ✓ | ✓ | ✓ | New user (welcome); inviter (in-app only) |
| `USER_ROLE_CHANGED` | ✓ | ✓ | ✓ | The person |
| `ACCOUNT_STATUS_CHANGED` | ✓ | ✓ | ✓ | The person (email allowed while inactive) |
| `USER_TEAM_ASSIGNED` | ✓ | ✓ | — | The person; active Leads of the affected team(s), excluding the actor |
| `USER_WORKSTREAM_ASSIGNED` | ✓ | ✓ | — | The person; active Leads of the workstream, excluding the actor |

**Essential** events ignore optional preferences (account security). Non-essential events follow **Notifications → Preferences** (in-app / email per category).

Invitation events are skipped at send time when the invitation is no longer pending, has expired, or has a newer token version.

## 6. Email

- Sender: `EMAIL_FROM` (proposed `Startup Weekend Workspace <no-reply@startupweekend.sbs>`), optional `EMAIL_REPLY_TO`.
- Template: one branded React Email layout (`src/server/email/templates/notice.tsx`) with eyebrow, heading, paragraphs, one call to action and a footnote; plain-text alternative generated.
- Links use `APP_URL`.
- Delivery states: `pending → sent → delivered`; `pending` with `nextRetryAt` while waiting to retry; `failed` with `lastErrorCode`; Resend webhooks (`email.delivered`, `email.bounced`, `email.failed`) move a sent email to `delivered`, `bounced` or `failed`, never backwards.

## 7. Adding an event in a later module

1. Add the type to `EVENT_TYPES` and its metadata to `EVENT_CATALOGUE` (`src/domain/events.ts`).
2. Add a handler in `src/server/notifications/registry.ts` that resolves current recipients and builds content.
3. Call `enqueueEvent(tx, …)` inside the same transaction as the change.
4. Add a unit test for the channel resolution and an e2e assertion.

## 8. What cannot be tested yet

Real email sending, Resend idempotency behaviour, and webhook delivery need a verified domain and API key. Until then deliveries are recorded as `failed / provider_not_configured`, which the e2e run asserts.


## Module 2 implementation update — 20 November 2026

The event catalogue now includes:
- `TASK_ASSIGNED`: immediate in-app and email notification to the accountable owner when a task is created or reassigned.
- `TASK_STATUS_CHANGED`: in-app notification to the accountable owner when the task status changes; email is disabled by default to avoid noisy delivery.

Both events are emitted through the transactional domain-event outbox and resolved against the current active user profile at processing time.

## 9. Module 2 and Module 3 events

| Event | In-app | Email | Recipients |
|---|---|---|---|
| `TASK_ASSIGNED` | ✓ | ✓ | New accountable owner receives assignment email/in-app; prior owner and active scoped Leads receive in-app updates on reassignment/assignment. |
| `TASK_STATUS_CHANGED` | ✓ | — | Active accountable owner, collaborators, active team members and scoped Leads who retain task access; email is intentionally disabled. |
| `TASK_COMMENTED` | ✓ | ✓ | Active task participants and scoped Leads receive in-app updates; explicitly mentioned active users who still have task access can also receive email. |
| `WORK_REPORT_SUBMITTED` | ✓ | ✓ | Active Leads of the report's assigned team/workstream; active Admins are the fallback when no scoped Lead is available. |
| `WORK_REPORT_APPROVED` | ✓ | ✓ | Active report author. |
| `WORK_REPORT_NEEDS_REVISION` | ✓ | ✓ | Active report author. |

All six events are written in the business transaction through the outbox. Recipient resolution uses current account/membership state at processing time. Scheduled due-date reminders, digests and other recurring automation remain in Release 5 rather than being represented as immediate events in Modules 2 or 3.

## Module 4 extension — scheduled automation and digests (proposed 2026-11-21)

Module 4 extends the already implemented notification pipeline. The transactional outbox, in-app inbox, preferences, Resend integration, delivery idempotency/retry and webhook receipt handling remain the shared delivery foundation. See `docs/module-4-notifications-automation.md` for the full functional and technical specification.

### A. Scheduled automation boundary

Scheduled rules must not call Resend directly or write user notifications outside the existing processor. A protected scheduled endpoint evaluates bounded, paginated candidates, revalidates the resource and recipient, claims a deterministic `automationRuns` record and then emits a domain event (or constructs a digest batch). The current outbox processor handles recipient fan-out and delivery.

The first rules are task due-soon, task overdue, CRM follow-up due, CRM reply waiting and CRM opportunity stale. Work-report reminders remain disabled until the organisation's working days, reporting cutoff, timezone, grace period and exception policy have been confirmed. Meeting reminders are owned by Module 8.

### B. Proposed Module 4/9 events (not yet implemented)

| Event | Source | Recipients | Default channels |
|---|---|---|---|
| `TASK_DUE_SOON` | Scheduled task rule | Current accountable owner | In-app + preference-aware email |
| `TASK_OVERDUE` | Scheduled task rule | Current accountable owner | In-app + preference-aware email |
| `WORK_REPORT_SUBMISSION_REMINDER` | Scheduled report rule after policy approval | Report author | In-app + preference-aware email |
| `CRM_CONTACT_ASSIGNED` | CRM contact/campaign assignment | New owner | In-app + preference-aware email |
| `CRM_CAMPAIGN_ASSIGNED` | Campaign assignment | New owner | In-app + preference-aware email |
| `CRM_FOLLOW_UP_DUE` | Scheduled CRM rule | Assigned outreach owner | In-app + preference-aware email |
| `CRM_REPLY_WAITING` | CRM activity plus scheduled check | Assigned outreach owner | In-app + preference-aware email |
| `CRM_OPPORTUNITY_STAGE_CHANGED` | Opportunity mutation | Owner and explicitly configured internal stakeholders | In-app; email optional |
| `CRM_OPPORTUNITY_STALE` | Scheduled CRM rule | Opportunity owner | In-app + preference-aware email |
| `DAILY_NOTIFICATION_DIGEST` | Digest scheduler | One active member | Email only |
| `AUTOMATION_RUN_FAILED` | Automation processor | Admins | In-app; email optional |

Every new event must be added to `EVENT_TYPES`, `EVENT_CATALOGUE`, the server recipient registry and tests. The event metadata module/category fields must be updated consistently. Essential account/security events remain the only events that bypass optional preferences.

### C. Digest implementation requirement

The current preference supports `daily_digest`, but a complete digest sender is not yet implemented. The `digestPending` flag on an in-app notification is not sufficient because a user may disable in-app notifications while retaining email digest preference.

The proposed digest path uses `notificationDigestItems` independent of the inbox, `notificationDigests` as recipient/window batches, a synthetic `DAILY_NOTIFICATION_DIGEST` outbox event and the existing `emailDeliveries`/Resend path. A digest is unique per recipient, organisation and digest window. Digest item inclusion and delivery status must be crash-safe and idempotent.

### D. Preference and multi-organisation note

Preferences currently use `notificationPreferences/{userId}`. This supports the current single-organisation deployment. Before one user can have independent notification preferences in multiple organisations, migrate to an organisation-scoped document key with a backfill; do not silently reinterpret the existing document IDs.

### E. Scheduler operations

The current Vercel cron configuration calls `/api/cron/process-outbox` daily at 03:00 UTC. That remains the delivery backstop and is not frequent enough to evaluate operational reminders. Module 4 proposes a separate protected automation endpoint on a bounded cadence approved for the deployed hosting plan. Cron invocations must be authenticated, paginated, lease-protected, observable and idempotent.

### F. Status

Everything in this extension is **proposed** until implemented and tested. Do not describe scheduled reminders, CRM notification events or daily digest as available functionality before the related screens, server services, rules/indexes and integration tests are deployed.
