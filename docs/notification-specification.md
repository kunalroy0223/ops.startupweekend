# Inhub Workspace — Notification Specification

**Status:** v1.0 (Module 1 implemented) · **Owner:** Platform · **Last updated:** 2026-11-19

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
             after() on the same request  ·  Vercel cron every 5 min  ·  Admin "Process now"
                                 │
                       processOutbox()  (src/server/notifications/processor.ts)
                                 │ claim event with a lease (transaction: pending|retry → processing, leaseUntil)
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
