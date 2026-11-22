# Inhub Ops — Modules 9–12 Delivery Notes

**Source baseline:** `inhub-ops-modules-9-11-source(1).zip` plus this coordinated Module 10–12 implementation
**Date:** 22 November 2026
**Release status:** Source implementation prepared; full project validation pending

This delivery retains Module 9 CRM and adds Modules 10, 11 and 12. It does not include the separate TSWS Event Application. The canonical names/scopes are in `inhub-ops-12-module-roadmap.md`.

## Module 9 — Partnerships, Stakeholder & Outreach CRM

Retained from the source archive. Existing surfaces include accounts, contacts/profiles, identity and duplicate checks, opportunities, campaigns, campaign members and outreach stages, activity history and corrections, do-not-contact suppression, task-linked follow-ups and workflow management. Existing API/service authorization and CRM navigation are preserved. See `module-9-crm-specification.md` and `crm-workflows-delivery.md`.

**Validation status:** implementation is present; release sign-off awaits Node 24 project checks and applicable emulator/preview verification.

## Module 10 — Event & Programme Management

### Data

- `programmes`: workspace-scoped programme record, type, owner, workstream/team scope, dates and lifecycle.
- `operationalEvents`: event type, start/end, organisation timezone, venue/meeting link, linked programme, owner, workstream/team scope, operations notes and lifecycle.
- `programmeSessions`: ordered agenda/run-of-show entries linked to a programme and optionally an event, with facilitator, location, timing and execution status.

### User experience and workflow

- `/events` provides workspace-aware programme and event planning, event register and programme run sheet.
- Admins and assigned Leads can create and manage scoped records. Members have read access within their visible workspace/team/workstream scope.
- Programme lifecycle: draft → active → completed → archived; archive is also allowed from draft/active.
- Event lifecycle: planning → confirmed → live → completed → archived, with cancellation from planning/confirmed/live and archive from completed/cancelled.
- Session lifecycle: planned → live → completed, with cancellation from planned/live.
- Start/end ordering is validated; sessions cannot be linked to an event in another workspace or to a different programme when the event already has a programme link.

### API

- `GET /api/operations?workspaceId=...`
- `POST /api/operations/programmes`, `PATCH /api/operations/programmes/:id`
- `POST /api/operations/events`, `PATCH /api/operations/events/:id`
- `POST /api/operations/sessions`, `PATCH /api/operations/sessions/:id`

## Module 11 — Resource & Asset Management

### Data

- `managedResources`: tracked asset or shared resource, category, inventory code, serial number, quantity, location, custodian, condition, workspace/team/workstream scope and lifecycle.
- `resourceAllocations`: resource, requested quantity, requester, assignee, purpose, time window, optional event link, decision and checkout/return metadata.

### User experience and workflow

- `/resources` provides a resource register, request form and allocation ledger.
- Admins and assigned Leads register resources and process requests; Members can request resources visible in their assigned scope and cancel their own unprocessed/approved request before checkout.
- Allocation lifecycle: requested → approved/rejected/cancelled; approved → checked_out/cancelled; checked_out → returned.
- Resource lifecycle: available ↔ maintenance, available/maintenance → retired → archived; retired and archived resources cannot return to circulation. A resource needing repair is not allowed to be marked available.
- Approval validates organisation/workspace, target-user active status, active resource status and overlapping quantity. Checked-out allocations remain capacity-consuming until explicitly returned.
- Capacity approval and resource quantity/status edits transact against the same resource record using `allocationRevision` to serialize concurrent capacity changes and reduce over-allocation risk. Peak overlapping reservations, rather than the sum of all non-overlapping reservations, constrain quantity reductions and approvals. Checked-out inventory consumes capacity from the earlier of scheduled start or actual checkout until return.

### API

- `GET/POST /api/resources`
- `PATCH /api/resources/:id`
- `POST /api/resources/allocations`, `PATCH /api/resources/allocations/:id`

## Module 12 — Administration, Audit & Governance

### Data

- `governancePolicies`: record area, policy text, retention duration (optional), disposition, legal hold, review cadence, next review, owner and active/review-due/archived status.
- `governanceReviews`: append-only review decision, rationale, optional record reference, actor and timestamp.
- Existing `auditLogs` are surfaced in the governance page; every policy/review mutation writes a corresponding audit entry.

### User experience and safeguards

- `/governance` is Admin-only, enforced by page access and every service method/API. Lead and Member navigation does not expose governance.
- The page shows the latest audit entries, records policy register, legal-hold state, upcoming/overdue review status and immutable review history.
- Overdue policy reviews are projected as `review_due` on read; no background process mutates policy status just to render the UI.
- No retention purge, hard delete or bulk archive job is implemented. A policy or review decision is a governance record, not authorization to delete source records. Destructive dispositions require a separate, explicitly approved and tested process.

### API

- `GET /api/governance`
- `POST /api/governance/policies`, `PATCH /api/governance/policies/:id`
- `POST /api/governance/reviews`

## Security and platform constraints

- New collections are server-authoritative; Firestore rules explicitly deny direct client reads/writes. Server handlers use the Admin SDK only after application-layer organization, workspace, role and resource-scope checks.
- Audit records are emitted alongside mutations. Governance review records are append-only; no update/delete API exists.
- All records include organisation/workspace identifiers where applicable. Cross-workspace references are rejected.
- No Firebase Storage, binary upload, new paid Firebase dependency or Blaze plan requirement is introduced.
- Composite indexes are additive and are not deployed by this source bundle. Review/deploy them only through a separate release decision.

## Index additions

The source adds composite indexes for workspace-scoped programme/event/session/resource/allocation queries, resource allocation lookup by organisation/resource/status, and organisation governance policy/review ordering. `firestore.indexes.json` is the source of truth; inspect the full JSON diff before index deployment.

## Validation checklist

| Check | Current status |
|---|---|
| Module 9 source implementation retained | Present |
| Modules 10–12 source implementation | Added |
| API role/scope checks | Implemented; requires full integration verification |
| Direct Firestore client access denied | Rules added; emulator test added, execution pending |
| Lifecycle/capacity unit coverage | Added; execution pending in Node 24 dependency environment |
| TypeScript project check | Pending |
| ESLint | Pending |
| Full unit suite | Pending |
| Firestore Rules emulator tests on isolated port 8185 (separate firebase.rules-test.json; protects the People demo on 8085) | Pending |
| Next.js production build | Pending |
| Vercel Preview smoke test | Pending |

The archive environment used for preparation has Node 22.16.0 while the project requires Node 24.x, and npm registry access returned `EAI_AGAIN`. Do not mark the delivery fully validated until checks are executed under Node 24 with dependencies installed.
