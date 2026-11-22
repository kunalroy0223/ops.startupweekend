# Module 9 — Partnerships, Stakeholder & Outreach CRM

**Specification:** v1.0
**Status:** CRM data model, services, APIs and UI are present in the current source archive; full release validation remains pending
**Product module:** 9
**Related module:** 4 — Notifications & Workflow Automation
**Last reviewed:** 2026-11-22

## 1. Purpose

Module 9 provides one organisation-partitioned relationship-management system. In its first release, CRM records and visibility are workspace-scoped within that organisation. It manages Inhub's external contacts, organisations, partners, sponsors, mentors, facilitators, speakers, judges, investors, creators, businesses and outreach prospects.

It must support partnership development and day-to-day outreach work, including Instagram prospect research and follow-up. It is not two separate CRMs. An organisation/contact is recorded once and can participate in multiple campaigns or opportunities without duplicate records.

## 2. Product principles

1. **One relationship database:** accounts and contacts are reusable across campaigns, opportunities and events within the configured workspace/organisation boundary.
2. **Activity history is append-only:** outreach and relationship interactions form a reliable timeline; corrections are recorded, not silently overwritten.
3. **Every active record has ownership:** a contact, campaign member or opportunity has a responsible Inhub user.
4. **Follow-up is operational work:** scheduled follow-ups use the existing Module 2 task system and Module 4 reminders, not a second task engine.
5. **Manual-first external communication:** the CRM records communication and assists members; it does not automate cold DMs, scrape profiles or bypass platform restrictions.
6. **Scoped visibility:** access follows Admin/Lead/Team Member roles plus campaign, record ownership and existing workspace/team/workstream scope.
7. **Measurable campaigns:** reports distinguish identified, contacted, replied, interested and converted prospects.
8. **Data minimisation:** store useful business contact data and interaction summaries, not unnecessary personal/sensitive information.

## 3. Users and use cases

| User | Primary use cases |
|---|---|
| Admin | Manage CRM configuration, see organisation-wide accounts/contacts/campaigns/opportunities, assign owners, review activity and exports. |
| Lead | Manage records and campaigns within explicitly assigned CRM scope; assign campaign members and oversee pipeline progress. |
| Team Member | Work assigned prospects/contacts, log interactions, update permitted statuses and complete follow-up tasks. |

Initial operational scenarios:

- Sponsor and institutional partnership acquisition.
- Mentor, facilitator, judge and speaker sourcing.
- Startup ecosystem and community relationship tracking.
- Instagram creator, brand and business outreach.
- Event-specific collaboration and participant engagement campaigns.
- Follow-up management after replies, meetings and proposal submissions.

## 4. Information architecture

CRM should be a dedicated workspace in the app shell with these views:

1. **Overview:** pipeline counts, tasks due today, replies waiting, recent activity and campaign health.
2. **Accounts:** organisation/company/institution directory.
3. **Contacts & profiles:** people and outreach profiles, with filters and duplicate indicators.
4. **Opportunities:** partnership pipeline in list and Kanban views.
5. **Campaigns:** campaign register, owner, channel, audience, dates and performance.
6. **Outreach queue:** assigned contacts, ready-to-contact, follow-ups due, replies waiting and completed outcomes.
7. **Activity timeline:** chronological communication and meeting history for an account/contact/opportunity.

All views must support responsive mobile layouts, pagination, meaningful empty states and permission-aware search. Do not fetch the entire CRM collection to build dashboard counts.

## 5. Core concepts and data ownership

### 5.1 Account

An external organisation or business relationship: company, startup, institution, investor, government body, nonprofit, community group or other organisation.

Minimum fields:

- Name and normalised name.
- Account type and industry/category.
- Website and optional verified domain.
- Location (free-text city/region/country fields; do not infer precise location).
- Relationship owner.
- Status: active or archived.
- Source and tags.
- Created/updated metadata.

An account can have multiple contacts and opportunities. Do not store large contact/opportunity ID arrays on the account document; use references in the child records.

### 5.2 Contact / outreach profile

A contact is an individual person or a target social profile that Inhub interacts with. This distinction supports Instagram brand/creator accounts where the real-world operator may not be known.

Record types:

- `person` — named individual.
- `creator_profile` — public creator/influencer profile.
- `brand_profile` — business/brand account.
- `community_profile` — public community or organisation profile.
- `other` — another permitted outreach identity.

Fields include:

- Display name and normalised name.
- Record type.
- Optional linked `accountId`.
- Email/phone only when voluntarily supplied or obtained from an approved source and needed for the relationship.
- Social profile references (platform, handle, profile URL); Instagram is supported in the first UI slice.
- Category/tags, source, owner and status.
- Optional notes subject to CRM access controls.
- `doNotContact` flag, reason category and set-by/time metadata.
- Created/updated and archived metadata.

Do not require an email address. Do not assume that a social-profile handle identifies a legal person. Store public profile URL and handle as identifiers; avoid collecting private profile data.

### 5.3 Opportunity

A specific partnership or stakeholder engagement being pursued. Examples: sponsorship, institutional collaboration, mentor engagement, speaker invitation or programme partnership.

Fields:

- Title and opportunity type.
- Account ID and optional primary contact ID.
- Pipeline key and stage key.
- Owner and optional supporting user IDs.
- Status: open, won, lost, nurture or archived.
- Expected outcome/contribution; optional estimated monetary value and currency only where applicable.
- Expected decision date, next step and loss/nurture reason.
- Source campaign and relevant linked activity/task IDs.
- Created/updated and stage-change metadata.

Do not treat all relationships as monetary sales opportunities. Estimated value is optional and can represent a non-cash contribution only when a typed value/contribution description is provided.

### 5.4 Campaign

A time-bounded initiative with a defined objective, audience, channel and owner. Example: “TSWS 2027 — Instagram Creator Outreach”.

Fields:

- Name, objective and campaign type.
- Channel: Instagram, email, phone, in-person, event, referral or other.
- Owner, optional team/workstream scope and assigned members.
- Start/end dates and status: draft, active, paused, completed, archived.
- Audience/category filters and target outcome.
- Created/updated metadata.

Campaign is an organising layer, not a duplicate account/contact store.

### 5.5 Campaign member

A join record connecting a contact to a campaign. It owns campaign-specific assignment, status and follow-up dates.

Initial Instagram outreach stages:

1. `researched`
2. `qualified`
3. `ready_to_contact`
4. `contacted`
5. `replied`
6. `interested`
7. `converted`
8. `nurture`
9. `not_interested`
10. `do_not_contact`

A campaign member stores assigned owner, current stage, stage timestamps, first-contact/last-interaction/next-follow-up timestamps, conversion outcome, and a reference to the latest follow-up task where applicable.

Transitions must be validated server-side. `do_not_contact` is a campaign-level mirror of the contact-level suppression flag; the contact flag is authoritative and blocks outreach across all campaigns. Only an authorised correction can clear it, and bulk import cannot silently reset it.

### 5.6 Activity

The activity timeline records interactions and important state changes. Activity records are append-only, with a controlled correction/redaction path for accidental or legally necessary removal.

Activity types include:

- Prospect researched/qualified.
- Initial outreach sent.
- Incoming reply received.
- Follow-up sent.
- Call or meeting held.
- Proposal shared.
- Stage changed.
- Outcome recorded.
- Internal note added.

Each activity records organisation/workspace, account/contact/opportunity/campaign references as applicable, actor, channel, direction, event type, timestamp, short summary, optional outcome and request ID. Avoid copying full private DMs or long email bodies by default. Store only an operational summary and a link/reference where appropriate.

## 6. Pipelines

### 6.1 Partnership opportunity pipeline

Default stages:

`identified → qualified → contacted → meeting_scheduled → proposal_sent → negotiation → won | lost | nurture`

- Admin may configure the active default labels/order in a later settings slice; the initial stage keys remain code-validated.
- An opportunity may move forward, backward or to nurture with an activity/audit entry explaining material changes.
- Won/lost must capture a result date and outcome; lost should capture a reason category when known.
- Nurture is not a terminal delete state; it can be re-opened by an authorised user.
- `stageKey` is the canonical pipeline position. Maintain `status` transactionally: pre-outcome stages map to `open`; `won`, `lost` and `nurture` stages map to their matching status; `archived` is an archival overlay that preserves the previous `stageKey` for restoration. Every transition must update the stage metadata and append an activity/audit record.

### 6.2 Instagram outreach pipeline

Use the campaign-member stages in §5.5. The Instagram pipeline is campaign-specific and must not overwrite the partnership opportunity stage. A contact may be a campaign member in more than one outreach campaign, each with its own state and owner.

### 6.3 Data integrity

- A contact may belong to multiple campaigns.
- A contact may relate to one account at a time in v1; changing account is audited.
- An opportunity may link to one account and one primary contact, with optional additional stakeholder contacts through a join collection only if/when required.
- A single contact may have multiple opportunities.
- Campaign and opportunity status are separate concepts.

## 7. Instagram outreach workspace

### 7.1 Prospect capture

Members can create a prospect manually from research. Capture fields:

- Instagram handle (normalised for matching).
- Profile URL.
- Display name.
- Profile type/category (creator, brand, business, community, other).
- Optional account link.
- Campaign and owner.
- Source and research notes.
- Current stage and next follow-up.

CSV import can be a later slice. If introduced, import must provide preview, validation, duplicate matching, rejected-row report and explicit confirmation before writes. It must never auto-send messages.

### 7.2 Manual outreach logging

When a member sends a DM in Instagram, they return to Inhub and log:

- Interaction type (`initial_outreach`, `follow_up`, `reply_received`, `other`).
- Direction (`outbound` or `inbound`).
- Date/time.
- Short summary/outcome.
- Optional next step and due date.

The CRM may open the profile URL in a new tab for manual contact. It must not simulate clicks, scrape private profile data, store Instagram passwords/session cookies or automate cold-DM delivery.

### 7.3 Outreach work queue

Per assigned member, provide:

- Ready to contact.
- Follow-ups due today/overdue.
- Replies awaiting response.
- Interested prospects.
- Nurture queue.
- Completed conversions.

Filters: campaign, status, owner, category, last interaction and next follow-up. Bulk reassignment/status actions must validate every selected record and produce individual audit/activity evidence.

## 8. Follow-up tasks and Module 4 integration

CRM does not create a separate follow-up task engine. A follow-up action creates or links to an existing Module 2 `tasks` record.

A CRM-linked task includes one primary context reference (`crmContactId`, `crmAccountId` or `crmOpportunityId`) and optional `crmCampaignId` and `crmCampaignMemberId`. It retains the existing accountable owner, collaborators, status, priority and due-date semantics.

- Completing/cancelling the task closes the operational follow-up.
- Reassigning a task and reassigning the campaign member must be reconciled; the CRM service should update the owner/context in one authorised workflow or explicitly flag a mismatch.
- Module 4 emits `CRM_FOLLOW_UP_DUE` reminders for open follow-up tasks or due campaign-member follow-up dates, with one clear source of truth to avoid duplicate reminders.
- A campaign member's `nextFollowUpAt` should be derived from or synchronised with the linked task. Do not independently schedule the same follow-up from both fields.
- On new inbound reply, log an activity, update last interaction/stage as permitted, and optionally create a response task. Never send an automatic reply in v1.

## 9. Duplicate detection and identity

Duplicate prevention is server-side and scoped to the active CRM workspace:

- Email: normalised lowercase email, where present.
- Instagram: normalised handle without leading `@`, platform fixed to Instagram.
- LinkedIn/phone/website domain: optional later identity types.
- Account: normalised verified website domain where one exists; otherwise name + location is only a review suggestion, not a hard unique key.

Use a deterministic identity key document ID derived from organisation + workspace + identifier type + normalised identifier (hash the value to avoid putting raw contact data in document IDs). The index document points to the canonical account/contact. A duplicate attempt should return a conflict with a link to the existing record; it must not silently merge.

Admin-only merge is a later, separately reviewed operation. Merging must preserve activity history, campaign memberships, opportunity links, task references and audit trail. Archiving a record does not automatically release its identity key.

## 10. Permissions and privacy

See `rbac-matrix.md` §4B. Baseline:

- Admin: organisation-wide CRM administration and visibility.
- Lead: records/campaigns within explicitly assigned CRM ownership and allowed workspace/team/workstream scope.
- Team Member: assigned contacts, campaign memberships and activities; can log activity and perform permitted stage transitions on assigned work.
- Unassigned users do not gain CRM access merely because they are members of the organisation.
- External contacts never authenticate into the internal CRM in this module.
- Exports, bulk reassignment, merge, archive and do-not-contact overrides require elevated permissions and audit logs.

All access is checked in server services/API handlers. Firestore client rules remain default-deny for CRM records; do not rely on hidden navigation or guessed document IDs.

## 11. Reporting and campaign metrics

Initial metrics:

- Prospects added.
- Qualified prospects.
- Initial outreach sent.
- Replies received.
- Positive/interesting replies.
- Meetings scheduled/held.
- Proposals sent.
- Opportunities won/lost/nurture.
- Follow-ups due and overdue.
- Conversion rate by campaign and stage.
- Response rate by channel where the denominator is clearly defined.

Metric definitions must state date range, timezone, denominator and whether archived/do-not-contact records are excluded. Do not use raw DM volume as a proxy for relationship quality or member productivity. Do not rank individual members using unadjusted response/conversion counts.

## 12. Search and navigation

CRM search should support account names, contact display names, normalised email, Instagram handle, campaign names and opportunity titles. The global Ctrl+K search may be expanded after CRM query paths and permissions are tested. CRM search results must be filtered by server-side access before returning result summaries.

## 13. Proposed Firestore model

See `database-schema.md` sections 4.26–4.32. Proposed collections:

- `crmAccounts`
- `crmContacts`
- `crmOpportunities`
- `crmCampaigns`
- `crmCampaignMembers`
- `crmActivities`
- `crmIdentityKeys`

No `crmFollowUps` collection is proposed; follow-up tasks use `tasks` with CRM references.

## 14. Acceptance criteria

### CRM foundation

- [ ] Create, read, update and archive account and contact records with server validation.
- [ ] Contacts can exist without email and can represent social profiles.
- [ ] Duplicate email/Instagram identifiers are detected deterministically.
- [ ] Contact/account links and activity references remain consistent.
- [ ] Activity timeline is append-only for ordinary users.

### Opportunities and campaigns

- [ ] Partnership opportunities use validated stage transitions and capture material outcomes.
- [ ] Campaigns have owner, channel, objective, dates, status and assigned members.
- [ ] Contacts can participate in multiple campaigns without duplicate contact records.
- [ ] Instagram campaign stages and partnership opportunity stages remain independent.
- [ ] Campaign metrics use documented definitions and timezone.

### Outreach workflow

- [ ] Assigned members can view their outreach queue.
- [ ] Members can log initial outreach, reply, follow-up, call and meeting activity.
- [ ] Members can create/link follow-up tasks using the existing task system.
- [ ] `doNotContact` blocks further outreach actions unless an authorised override is recorded.
- [ ] No automated cold-DM sending, scraping or credential/session handling is implemented.

### Security and quality

- [ ] Admin, Lead and Member access is tested for assigned and unassigned records.
- [ ] Direct API requests and guessed IDs cannot bypass scope checks.
- [ ] Bulk operations validate each record and are audited.
- [ ] CRM records and identity keys are organisation-scoped.
- [ ] UI works at mobile and desktop widths with loading/empty/error states.
- [ ] Unit, service, emulator/rules, integration and end-to-end tests pass.

## 15. Implementation slices

1. **CRM foundation:** schemas, validation, permissions, account/contact CRUD, archive and duplicate identity keys.
2. **Activity timeline:** append-only activity service, interaction forms and account/contact detail views.
3. **Partnership pipeline:** opportunities, stage history, ownership and list/Kanban views.
4. **Campaign engine:** campaign CRUD, campaign members, assignments and campaign metrics.
5. **Instagram outreach workspace:** prospect capture, manual interaction logging, assigned queues and `doNotContact` policy.
6. **Task + reminder integration:** CRM-linked task references, due reminders and reply-waiting workflow with Module 4.
7. **Hardening:** indexes, permission tests, exports policy, mobile audit and production smoke test.

## 16. Decisions required before implementation

- [ ] Which account and contact categories Inhub needs at launch.
- [ ] Whether CRM data is visible organisation-wide to Admin only or may be shared to all authorised Leads by default. This specification recommends explicit assignment/scope, not automatic organisation-wide Lead access.
- [ ] Whether campaign owners may reassign campaign members or only Admins/Leads may do so.
- [ ] Approved sources and permitted fields for prospect research/import.
- [ ] Retention period for inactive contacts and activity metadata.
- [ ] Whether monetary opportunity values are needed or contribution/value descriptors are sufficient for Inhub's partnership process.
- [ ] Which campaigns (if any) need event/programme links in Module 10.

Until these decisions are approved, use the conservative permission model and manual prospect capture described above.


## 13. Source implementation status (22 November 2026)

The current Modules 9–11 source archive contains the following Module 9 surfaces and services: account and contact records, contact identity/duplicate handling, do-not-contact suppression, partnership opportunities, campaign records and campaign members, campaign-specific outreach stages, append-only outreach activities, activity corrections, task-linked follow-up actions, and campaign workflow configuration. The UI includes CRM overview, accounts, contacts, opportunities, campaigns, activities/outreach and workflow management. APIs and server services enforce organisation/workspace ownership, role/scope and do-not-contact rules.

This source status is not a release sign-off. Run the Node 24 typecheck, lint, unit suite, production build and relevant API/emulator verification before marking Module 9 complete. Do not replace the existing CRM implementation while adding Modules 10–12.
