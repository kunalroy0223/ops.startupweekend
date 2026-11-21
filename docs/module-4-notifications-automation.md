# Module 4 — Notifications & Workflow Automation

**Specification:** v1.0
**Status:** Proposed extension to existing notification infrastructure
**Product modules:** 4
**Related module:** 9 — Partnerships, Stakeholder & Outreach CRM
**Last reviewed:** 2026-11-21

## 1. Purpose

Module 4 makes Inhub Workspace reliably surface important work and trigger routine follow-up without requiring members or Leads to repeatedly inspect every module. It extends the existing notification system with scheduled reminders, controlled rule configuration, daily digests and execution visibility.

This is not a replacement notification service. The current repository already contains a transactional domain-event outbox, in-app notifications, user notification preferences, Resend delivery, email retry/idempotency handling, a protected outbox-processing endpoint and an email webhook. Module 4 must reuse those components.

## 2. Current implementation baseline

Repository inspection on 2026-11-21 found the following existing components:

| Existing component | Current implementation | Module 4 treatment |
|---|---|---|
| Domain event catalogue | `src/domain/events.ts` | Extend with approved Module 4 and Module 9 event types. |
| Transactional outbox | `src/server/audit.ts` (`enqueueEvent`) | Retain; business mutation and event remain atomic. |
| Event processor | `src/server/notifications/processor.ts` | Retain; extend handlers and test new event types. |
| Recipient registry | `src/server/notifications/registry.ts` | Extend with current-membership and resource-scope recipient resolution. |
| In-app inbox | `notifications` collection and `/notifications` | Retain and extend categories/filters where required. |
| User preferences | `notificationPreferences` | Retain, but complete digest delivery and document the multi-organisation migration requirement. |
| Email provider | `src/server/email/resend.ts` | Retain Resend as the current provider abstraction. |
| Email delivery tracking | `emailDeliveries` | Retain delivery records, leases, retries and provider idempotency. |
| Outbox cron | `/api/cron/process-outbox` | Retain for event/email processing; do not overload it with unbounded scheduled-rule scans. |
| Admin delivery visibility | Settings / operational queries | Extend to automation run health and safe retry where appropriate. |

### 2.1 Known gap: daily digest

The current preference model includes `daily_digest`, and the notification fan-out path can mark an in-app notification as `digestPending`. The repository does not yet contain a complete digest aggregation and sending job. A preference option must not be presented as fully supported until the digest queue, aggregation, idempotency, delivery and failure states are implemented and tested. Module 4 closes this gap.

### 2.2 Existing scheduled-processing limitation

The current `vercel.json` schedules the outbox endpoint daily at 03:00 UTC. Mutations also kick the outbox processor through `after()`, but the daily cron is not an adequate cadence for due-date and follow-up reminders. Module 4 adds a separately protected scheduled-automation endpoint and an explicitly configured cadence. The final cadence must be checked against the deployed Vercel plan and operational limits before release.

## 3. Goals and non-goals

### Goals

1. Notify the right active users when important business events occur.
2. Generate reminders for due tasks, overdue work and CRM follow-ups.
3. Support immediate and daily-digest email delivery without losing notifications when a user disables in-app delivery.
4. Let Admins enable, disable and tune approved automation templates.
5. Make every automation run inspectable, idempotent, retryable where safe and auditable.
6. Respect organisation timezone, role scope, current account status and notification preferences.
7. Keep business mutations independent of notification provider availability.

### Non-goals for the first release

- A general-purpose visual/no-code workflow builder.
- Arbitrary user-authored scripts, expressions, webhooks or executable actions.
- Bulk marketing email or cold outreach sending.
- SMS, WhatsApp, push notifications or third-party chat delivery.
- AI-generated decisions or autonomous external communications.
- Changing task/report business rules solely to make reminders easier.

## 4. Functional areas

### 4.1 In-app notification centre

Retain the existing inbox and add the following capabilities only where missing:

- Unread count and unread/read filtering.
- Category filtering: account, access, organisation, work, CRM and automation.
- Clear resource context and a safe deep link to the authorised record.
- Mark one, selected or all notifications read.
- Stable pagination; do not load the entire notification history at once.
- Empty, loading, error and offline states.
- Notification actions must re-check access when the destination is opened. A notification is not an access grant.

Notification text must be concise and must not contain private message contents, credentials, invitation secrets or unnecessary personal data.

### 4.2 User notification preferences

Continue to support in-app and email preferences, delivery mode and per-event mute controls. Essential account/security events remain non-mutable.

Proposed preference behaviour:

| Setting | Behaviour |
|---|---|
| In-app enabled | Create visible inbox notifications for non-essential events. |
| Email enabled + immediate | Create normal email delivery records through the existing outbox. |
| Email enabled + daily digest | Queue a digest item; send it in the configured digest window. |
| Email disabled | Do not queue optional email. In-app follows its independent preference. |
| Event muted | Suppress optional channels for that event type; essential events ignore the mute. |

A user with in-app delivery disabled but daily digest enabled must still receive a digest item. Digest queuing must not depend on creation of an in-app inbox document.

**Multi-organisation note:** current preference documents are keyed by `userId` (`notificationPreferences/{uid}`), which is sufficient for the present single-organisation deployment but cannot represent different preferences for the same user in multiple organisations. Before multi-organisation access is enabled, migrate to an organisation-scoped key such as `${organizationId}_${userId}` with a reviewed backfill. Do not silently change existing production IDs in this module without a migration plan.

### 4.3 Scheduled reminders

Initial reminder templates:

| Rule key | Trigger | Default action | Recipient |
|---|---|---|---|
| `task_due_soon` | Active task reaches configured lead-time window before `dueAt` | One reminder per configured occurrence | Accountable owner; optionally collaborators only when explicitly configured |
| `task_overdue` | Active, non-terminal task is past `dueAt` | One initial overdue reminder; repeat only if Admin enables a bounded cadence | Accountable owner; scoped Lead escalation only when explicitly enabled |
| `crm_follow_up_due` | CRM campaign membership's next follow-up becomes due, or linked follow-up task becomes due | Reminder with contact/campaign context | Assigned outreach owner |
| `crm_reply_waiting` | An inbound reply is logged and no response task/action is completed within the configured window | Reminder to assigned owner | Assigned outreach owner |
| `crm_opportunity_stale` | Open opportunity has no meaningful activity for configured period | Reminder to opportunity owner | Opportunity owner; scoped Lead only if configured |
| `work_report_submission_reminder` | Configured reporting cutoff passes without a submitted report | Reminder to member | Report author |

The work-report rule cannot be enabled until the organisation confirms reporting days, cutoff time, timezone, grace period and exemption policy. Do not invent a daily-hours or attendance requirement. Meeting reminders belong to Module 8 and should register their own event/rule later.

### 4.4 Event-driven workflows

Initial event reactions should be explicit, code-owned handlers:

- Task assigned/reassigned → notify the new accountable owner.
- Task status changed/commented/mentioned → use existing Module 2 notification policy.
- Work report submitted/approved/revision requested → use existing Module 3 notification policy.
- CRM contact or campaign assignment changed → notify the new owner.
- CRM interaction/reply logged → update the activity timeline and, where the rule is enabled, schedule a response reminder.
- CRM opportunity stage changed → notify the permitted owner/stakeholders where configured.

A workflow action must not silently change a task, CRM stage, membership or account status. The first release is notification/reminder automation, not autonomous business decision-making.

### 4.5 Daily digest

The digest service must:

1. Select queued digest items for each active recipient and organisation-local digest window.
2. Group items by recipient and date/window, preserving item timestamps and safe resource links.
3. Create one deterministic digest record per recipient/window.
4. Create one corresponding email delivery through the existing Resend and delivery-tracking path.
5. Mark items as included/sent only after the digest record is durably created; delivery state remains visible through `emailDeliveries`.
6. Avoid duplicate digests if the scheduled worker runs more than once or retries after a crash.
7. Keep bounced/failed digest delivery visible and retry only according to the existing provider retry policy.
8. Exclude items whose recipient has become inactive, left the organisation or lost access to the referenced resource when applicable.

The exact default digest time should be approved by the organisation. Use the organisation timezone unless a future user-level timezone preference is introduced.

## 5. Workflow execution architecture

### 5.1 Immediate domain events

Continue the existing flow:

```text
Authorised service mutation
  ├─ business record write
  ├─ append-only audit record
  └─ domainEvents/{id} write (same transaction/batch)
             |
             v
      existing outbox processor
             |
       recipient resolution
             |
       preference evaluation
        /             \
       v               v
  in-app inbox      email delivery
                         |
                       Resend
```

No direct Resend call belongs inside a business mutation. The outbox remains at-least-once, and each side effect needs a deterministic idempotency key.

### 5.2 Scheduled automation

```text
Protected scheduled endpoint
        |
        v
Load enabled code-owned rule definitions and organisation settings
        |
        v
Query bounded due candidates (cursor + limit)
        |
        v
Revalidate record state, recipient status and resource access
        |
        v
Create/claim automationRuns/{deterministicRunId}
        |
        v
Emit a domain event or create a digest batch
        |
        v
Existing outbox processor delivers the notification/email
```

The scheduled worker must not directly write to a recipient's inbox or call Resend outside the existing processor. Candidate scans must be paginated and bounded; a single cron invocation must have a time budget and continuation strategy.

### 5.3 Rule registry and configuration

- Rule keys and actions are registered in server code.
- Firestore stores whether a supported rule is enabled and a validated configuration object.
- Configuration may contain bounded values such as lead time, repeat interval, digest time and escalation toggle.
- The server validates every configuration against a Zod schema and permitted ranges.
- No arbitrary Firestore expression, JavaScript, URL fetch or user-defined action is executed.
- Only Admin may change organisation-wide rules in v1. A future scoped Lead permission may be added explicitly.

### 5.4 Run lifecycle

`automationRuns` status values:

- `pending` — identified and awaiting processing.
- `processing` — claimed with a lease.
- `completed` — action/event durably created.
- `skipped` — candidate no longer qualifies or recipient is ineligible.
- `retry` — transient failure, with bounded `nextRetryAt`.
- `failed` — terminal failure requiring inspection.

The run ID is derived from `ruleId + targetType + targetId + recipientUserId + occurrenceKey`. `occurrenceKey` is an exact due-time bucket or schedule date, not the worker invocation timestamp. A retry reuses the same run ID. A new reminder occurrence gets a new ID.

### 5.5 Recipient and permission resolution

- Resolve recipients at processing time, not when the rule was first scheduled.
- Verify the user is active and belongs to the same organisation.
- Verify current resource access using the existing authorization service and module-specific scope checks.
- Remove the actor only where the event policy explicitly requires it; do not globally suppress self-notifications.
- Do not email external CRM contacts in Module 4. Notifications are for Inhub members; external outreach is manually composed and logged in Module 9.

## 6. Proposed event additions

The following are proposed additions, not yet implemented event types:

| Event type | Source | Recipient | Default channel |
|---|---|---|---|
| `TASK_DUE_SOON` | Scheduled task rule | Accountable owner | In-app + configurable email |
| `TASK_OVERDUE` | Scheduled task rule | Accountable owner | In-app; email configurable |
| `WORK_REPORT_SUBMISSION_REMINDER` | Scheduled reporting rule | Report author | In-app + configurable email |
| `CRM_CONTACT_ASSIGNED` | CRM assignment mutation | New owner | In-app + configurable email |
| `CRM_CAMPAIGN_ASSIGNED` | Campaign assignment mutation | New owner | In-app + configurable email |
| `CRM_FOLLOW_UP_DUE` | Scheduled CRM rule | Assigned owner | In-app + configurable email |
| `CRM_REPLY_WAITING` | CRM reply activity + scheduled check | Assigned owner | In-app + configurable email |
| `CRM_OPPORTUNITY_STAGE_CHANGED` | Opportunity mutation | Owner and explicitly selected stakeholders | In-app; email configurable |
| `CRM_OPPORTUNITY_STALE` | Scheduled CRM rule | Opportunity owner | In-app + configurable email |
| `DAILY_NOTIFICATION_DIGEST` | Digest scheduler | One active user | Email only |
| `AUTOMATION_RUN_FAILED` | Automation processor | Admins | In-app; email configurable |

Event catalogue metadata must define category, module, channels, essential status, label and description. All events except account/security messages are optional and preference-aware.

**Module identifier compatibility:** the current `src/domain/events.ts` types `EventMeta.module` using the legacy `1 | 2 | 3 | 4 | 5` delivery-release numbering. Before adding Module 9 CRM events, replace this with a shared product-module identifier type that represents the product catalogue (Modules 1–12). Extend `EventCategory` with `crm` and `automation`. Do not label Module 9 events with a legacy release number.

## 7. Operational interface

### Admin settings

- List of supported automation templates.
- Enabled/disabled state.
- Validated settings and timezone display.
- Last run, next scheduled evaluation and recent failures.
- Manual “run now” for an approved rule, protected by authorization and idempotency.
- Pause automation globally or per rule.
- No arbitrary rule creation in v1.

### Admin health view

- Pending, processing, completed, skipped and failed run counts.
- Oldest pending age.
- Failed runs grouped by safe error code.
- Outbox backlog and email delivery health remain visible in existing operational views.
- Retry action only for retryable failures; manual retry must preserve or rotate idempotency keys according to whether the provider outcome was ambiguous.

### Member experience

- Notification inbox with category filters.
- Preferences for optional channels.
- Clear CRM follow-up reminder links.
- No intrusive repeated reminders. Apply per-rule cooldown and stop reminders after completion, cancellation, archive or reassignment.

## 8. Data, security and retention

See `database-schema.md` sections 4.22–4.25. All automation collections are organisation-scoped. Clients must not write rules, runs, digest items, domain events or delivery state directly. Admin SDK services must authorize the actor explicitly because Admin SDK bypasses Firestore Rules.

Audit actions include `automation.rule_created`, `automation.rule_updated`, `automation.rule_enabled`, `automation.rule_disabled`, `automation.run_retried` and `notification.digest_created`. Run records are operational evidence, not replacements for the append-only audit log.

Retention must be configured for completed/skipped automation runs and digest item details. Failed runs and delivery metadata must remain available long enough for diagnosis. Retention windows require explicit organisation approval; do not hard-code an unreviewed deletion period.

## 9. Acceptance criteria

### Correctness

- [ ] Existing immediate notifications continue to use the transactional outbox.
- [ ] Scheduled reminders produce at most one notification per rule/target/recipient/occurrence.
- [ ] Re-running a cron request or retrying a worker does not duplicate notifications or emails.
- [ ] Completion, cancellation, reassignment or archival prevents an obsolete reminder from being sent.
- [ ] Recipients are revalidated against current membership and resource access.
- [ ] Digest works when in-app notifications are disabled but email digest remains enabled.
- [ ] Digest items are not lost if the worker crashes between selection and delivery creation.
- [ ] Essential account/security events cannot be muted.
- [ ] All schedule calculations use the configured timezone and handle daylight-saving transitions where the timezone observes them.

### Security

- [ ] Only Admin can configure organisation-wide rules in v1.
- [ ] No client can alter automation run state, send status or provider identifiers.
- [ ] Cron endpoint rejects missing/invalid secrets using constant-time comparison.
- [ ] Notification links do not bypass resource authorization.
- [ ] CRM contacts and activities are never sent to external recipients by an internal notification rule.

### Operations and UX

- [ ] Admin can inspect failed runs without raw secrets or personal message bodies in logs.
- [ ] Retry is restricted to eligible failures and is idempotent.
- [ ] Mobile inbox/preferences/automation settings are responsive.
- [ ] Empty, loading and error states are implemented.
- [ ] Unit, service, emulator/rules and end-to-end tests cover the lifecycle.

## 10. Implementation slices

1. **Baseline alignment:** tests for current event/outbox pipeline; add Module 4 event metadata and handler contracts.
2. **Automation foundation:** rule registry, validated config, `automationRules`, `automationRuns`, leases, run history and protected cron endpoint.
3. **Task reminders:** due-soon/overdue with bounded cadence and cancellation/reassignment revalidation.
4. **CRM reminders:** consume Module 9 follow-up due and reply-waiting states.
5. **Digest pipeline:** digest queue/batches, stable email delivery, retry and provider webhook integration.
6. **Admin experience:** rule settings and run health view.
7. **Hardening:** indexes, permissions, timezone tests, load bounds, mobile checks and production smoke tests.

## 11. Decisions required before implementation

- [ ] Organisation-local daily digest send time.
- [ ] Task due-soon lead time(s) and overdue repeat policy.
- [ ] Whether overdue reminders escalate to a scoped Lead, and after how long.
- [ ] Work-report working days, cutoff, grace period and exceptions.
- [ ] Scheduled endpoint cadence supported by the deployed hosting plan.
- [ ] Automation run and digest item retention periods.
- [ ] Whether any non-Admin role should configure a future scoped rule.

Until these are approved, implement configurable defaults only for task/CRM reminder rules whose policy is unambiguous; keep work-report reminders disabled.
