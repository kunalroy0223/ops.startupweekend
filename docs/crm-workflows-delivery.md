# CRM workflow delivery

## Scope delivered

This vertical slice connects the existing CRM directory to operational relationship workflows:

- Partnership opportunities with a defined stage pipeline (`prospecting`, `qualified`, `discovery`, `proposal`, `negotiation`, `nurture`, `won`, `lost`), owner/supporting users, expected value, expected decision date, next step and outcome reason.
- Campaign creation, lifecycle status, contact enrolment and assignment to an active Inhub user.
- Campaign-member stages, scheduled follow-up timestamps and optional links to existing open tasks.
- An immutable activity log for campaign enrolment, stage changes, replies, outreach, calls, meetings, proposals, notes and outcomes.
- Inbound reply logging and due follow-up data for scheduled CRM reminders.
- CRM follow-up and reply-waiting events resolved through the existing notification outbox and user channel preferences.

## Access and data safeguards

- All writes use authenticated API routes and server-side validation. CRM collections remain inaccessible to direct client SDK reads/writes.
- Workspace membership is checked for each request. Admins can view organisation CRM workflows; other roles see records they own, support, own as a campaign, or are assigned through campaign-member records.
- Leads can create and manage their own opportunities/campaigns. Members can work on campaign members assigned to them but cannot create opportunities or campaigns.
- Only Admins can reassign owners/assignees or add supporting users.
- Campaigns must be active before contacts can be enrolled. A contact with `doNotContact` set cannot be enrolled or receive outreach.
- Moving a campaign member to `do_not_contact` sets the canonical contact-level do-not-contact flag and clears that member's scheduled follow-up. Clearing do-not-contact continues to require the existing Admin-only contact workflow and a reason.
- Activity entries are append-only. A correction entry must reference an activity in the same workspace; non-Admins may correct only their own entries.
- Linked follow-up tasks must be open, in the same workspace, accessible to the actor and assigned to or shared with the campaign-member owner.

## CRM automation

The scheduled automation rules are now executable:

- `crm_follow_up_due`: default 24-hour repeat interval, allowed 12–168 hours.
- `crm_reply_waiting`: default 24-hour wait threshold, allowed 4–168 hours.

Each execution re-reads the campaign member, campaign, contact, assigned user and rule configuration before enqueuing an event. The notification resolver performs a second eligibility check before selecting the recipient. Events are sent through the existing notification outbox, respecting delivery preferences, retries and digests.

The follow-up event opens the linked task when one is set; otherwise it opens the CRM workflow. The reply-waiting event opens the CRM campaign contact.

## Required Firestore composite indexes

The slice requires seven `COLLECTION` indexes. They are provided separately in `docs/crm-workflows-index-additions.json`. Run `node scripts/apply-crm-workflow-indexes.mjs` from the repository root to merge only missing definitions into the existing local `firestore.indexes.json`. The script creates a timestamped backup before writing and never removes or modifies existing definitions. This is a local configuration change only; it does not deploy anything.

| Collection | Fields, in order |
|---|---|
| `crmOpportunities` | `organizationId ASC`, `workspaceId ASC`, `updatedAt DESC` |
| `crmCampaigns` | `organizationId ASC`, `workspaceId ASC`, `updatedAt DESC` |
| `crmCampaignMembers` | `organizationId ASC`, `workspaceId ASC`, `updatedAt DESC` |
| `crmCampaignMembers` | `organizationId ASC`, `campaignId ASC`, `assignedToUserId ASC` |
| `crmCampaignMembers` | `organizationId ASC`, `nextFollowUpAt ASC` |
| `crmCampaignMembers` | `organizationId ASC`, `stage ASC`, `lastInteractionAt ASC` |
| `crmActivities` | `organizationId ASC`, `workspaceId ASC`, `occurredAt DESC` |

Do not replace the repository's existing `firestore.indexes.json` with a template from this patch. The merge script preserves the user's current definitions, including the previously restored CRM and Work Reports indexes.

## Validation and rollout gate

Before merging or deploying:

1. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` using Node 24.12.0 or later in the Node 24 line.
2. Run Firestore Emulator rules tests and an authenticated Admin/Lead/Member API smoke test.
3. Confirm the seven new composite indexes are present and `Enabled` in the intended Firebase project.
4. Create a test campaign with an active contact, schedule a follow-up, log an inbound reply and verify exactly one intended notification per occurrence.
5. Confirm do-not-contact records do not produce outreach or CRM reminders.
6. Merge through the normal pull-request flow. Production deployment remains a separate controlled step.

## Explicit non-goals

- The system does not automatically create a task when a follow-up date is scheduled. Users can link an existing open task.
- It does not send outreach messages on behalf of users; it logs the interaction and records lifecycle state only.
- It does not infer a reply from mailbox or social integrations; an authorised user records the reply in the activity log.
