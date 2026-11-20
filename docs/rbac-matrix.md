# Inhub Workspace — Role-Based Access Control Matrix

**Status:** Draft v1.0  
**Model:** Global role + resource scope + action permission

---

## 1. Purpose

This document defines what Admin, Lead and Team Member users may view and do in Inhub Workspace. It is the implementation reference for UI visibility, API authorization and Firestore Security Rules.

A role alone is not sufficient to authorise access. The application must also evaluate the resource's workspace, workstream, team, project and assignment relationships.

## 2. Core rules

1. **Admin:** unrestricted access across the entire platform, independent of workstream or team assignment.
2. **Lead:** access is limited to workstreams and teams explicitly assigned to that Lead, plus resources associated with those scopes.
3. **Team Member:** access is limited to their assigned teams/workstreams and resources directly assigned to them or explicitly shared with their team.
4. **Default deny:** anything not explicitly permitted is denied.
5. **Backend enforcement:** hiding a button is not authorization. API handlers and database rules must independently enforce access.
6. **No self-escalation:** users cannot change their own role, account status, membership scope or privileged claims.
7. **Historical integrity:** deactivating a user or archiving a team must not erase historical work or audit records.
8. **Cross-scope actions:** when an action affects multiple teams/workstreams, the actor must be authorised for every affected scope, unless the actor is Admin.

## 3. Role definitions

| Role | Description |
|---|---|
| Admin | Organisation-wide administrator with unrestricted platform access. |
| Lead | Single operational leadership role. Scope comes from assigned workstreams and teams. There are no separate Workstream Lead and Team Lead roles. |
| Team Member | Executes assigned work and participates in relevant team/workstream collaboration. |

A user has one primary platform role in v1. A Lead can be assigned to multiple workstreams and teams. Team membership does not create a new role.

## 4. Permission matrix

Legend:

- **Full** — may view and manage all resources in the category.
- **Scoped** — may act only within assigned workstream/team/project scope.
- **Own** — may act only on their own profile, submissions or assigned resources.
- **Read** — view only.
- **No** — denied.
- **Conditional** — permitted only when the detailed rule below is satisfied.

| Resource / action | Admin | Lead | Team Member |
|---|---|---|---|
| View organisation overview | Full | Scoped | Relevant team summary only |
| Manage global settings | Full | No | No |
| View all users | Full | Scoped directory | Relevant team directory |
| Invite/create users | Full | No by default | No |
| Edit user profile | Full | No by default | Own limited fields |
| Change user role | Full | No | No |
| Activate/deactivate accounts | Full | No | No |
| Assign workstream/team membership | Full | No by default | No |
| View workspaces | Full | Assigned workspace(s) | Assigned workspace(s) |
| Create/archive workspaces | Full | No | No |
| Create/manage workstreams | Full | No by default | No |
| View workstreams | Full | Assigned | Assigned/relevant |
| Create/manage teams | Full | No by default | No |
| View teams | Full | Assigned | Assigned |
| Manage team membership | Full | No by default | No |
| Create projects | Full | Scoped | No by default |
| View projects | Full | Scoped | Team-shared/assigned |
| Edit/archive projects | Full | Scoped, subject to project policy | No |
| Create tasks | Full | Scoped | No by default |
| Assign/reassign tasks | Full | Scoped | No |
| View tasks | Full | Scoped | Assigned or team-shared |
| Edit task details | Full | Scoped | Own assigned task, permitted fields only |
| Change task status | Full | Scoped | Own assigned task, allowed transitions only |
| Delete tasks | Full, preferably soft-delete | No by default | No |
| Comment/mention | Full | Scoped | Accessible task only |
| Add document/reference links | Full | Scoped | Accessible task/report only |
| View work reports | Full | Scoped | Own reports |
| Submit work reports | Full | Own report if also acting as a member | Own reports |
| Review/approve reports | Full | Scoped reports | No |
| View analytics | Full | Scoped | Personal/relevant summary only |
| View notifications | Own inbox; may administer system records | Own inbox | Own inbox |
| Manage notification preferences | Own + global policy | Own | Own |
| View audit logs | Full | Scoped activity if enabled | Own/relevant activity only |
| Modify/delete audit logs | No ordinary user; immutable system records | No | No |

**Default policy:** Lead user creation, team creation and membership administration are Admin-only in v1. If the organisation later wants delegated administration, add explicit permission flags; do not infer them from the Lead role.

## 5. Scope evaluation rules

### 5.1 Workspace scope

A Lead or Team Member must have a valid membership/assignment for the resource's workspace. Workspace membership alone does not automatically grant access to every workstream or team if narrower scope is configured.

### 5.2 Workstream scope

A Lead can access a workstream if an active Lead assignment exists for that workstream. A Team Member can access it if they have an active membership or access through an assigned team under that workstream.

### 5.3 Team scope

A Lead can manage team resources only if assigned to that team or to a workstream whose policy explicitly includes that team. A Team Member can access team-shared resources only while an active membership exists.

### 5.4 Project scope

Project access is derived from its workspace/workstream/team association and explicit project membership, if configured. A project with several team associations is visible only to users authorised for at least one associated scope, subject to data-sharing policy.

### 5.5 Task scope

A user may access a task when one or more of these conditions is true:

- They are Admin.
- They are a Lead authorised for the task's workstream/team/project scope.
- They are the accountable owner or assignee.
- They are a collaborator explicitly added to the task.
- The task is shared with a team to which they have active membership.

Task comments and document/reference links inherit the parent task's access. Direct access by guessed IDs must be denied.

### 5.6 Report scope

- A member may create, edit drafts and submit their own reports.
- A member may view their own report and review outcome.
- A Lead may review reports for users and teams within their assigned scope.
- Admin may view and administer all reports.
- After submission, the author cannot silently overwrite submitted content; revisions create an auditable version or return-to-draft transition.

## 6. Field-level controls

### Team Member editable task fields

By default, the assignee may update:

- Status, within permitted transitions.
- Progress summary, if enabled.
- Comments and task document/reference links.
- Time/work log references, when the reporting module is released.

The assignee may not change:

- Accountable owner or assignee.
- Team/workstream/project scope.
- Priority or due date.
- Acceptance criteria.
- Workflow configuration.

A Lead may update these fields within authorised scope. Admin may update them across all scopes.

### User profile fields

A user may update a limited set of personal fields such as display name and profile image. Email, role, status, workspace membership and team/workstream assignments require verified or privileged flows.

## 7. Administrative safeguards

- Require confirmation for account deactivation, role changes, membership transfers and archive operations.
- Log all privileged changes with actor, target, timestamp and before/after values.
- Prevent removal of the last active Admin unless another active Admin exists.
- Do not hard-delete users who have created tasks, reports or audit events.
- Prefer deactivation and archival over destructive deletion.
- A role or scope change should take effect on the next server-authorised request; refresh/revoke sessions where required.

## 8. Implementation requirements

Every server endpoint must call shared authorization utilities. Firestore Security Rules must deny by default and protect user role/scope fields, audit records and notification delivery metadata.

For Firebase Admin SDK server operations, authorization must be performed explicitly because Admin SDK access bypasses Firestore Security Rules.

Do not store only a role in a client-controlled custom claim and trust it indefinitely. Claims can be used as a coarse hint, but authoritative role and scope must be validated against trusted server-side data.

## 9. Mandatory security test cases

- [ ] Unauthenticated user cannot read protected resources.
- [ ] Deactivated user cannot access protected APIs.
- [ ] Team Member cannot change their role to Admin.
- [ ] Team Member cannot read another team's private tasks by direct ID.
- [ ] Lead cannot access a workstream outside their assignment.
- [ ] Lead cannot manage users or global settings in v1.
- [ ] Lead cannot approve reports outside their scope.
- [ ] A user removed from a team loses access to team-private resources.
- [ ] Admin can access all workstreams, teams, projects, tasks and reports.
- [ ] Client cannot create or modify audit logs.
- [ ] Client cannot mark email deliveries as sent.
- [ ] Task comments and document/reference links inherit task permissions.
- [ ] Cross-team task operation checks every affected scope.

## 10. Decisions to revisit

- Whether Leads may create projects within their scope.
- Whether Leads may edit team membership.
- Whether tasks can be team-visible or only individually assigned.
- Whether Team Members can create tasks for themselves or their team.
- Whether project-level collaborators are required in v1.

Until explicitly changed, use the default restrictions defined in this document.

---

## Appendix A — Implementation record (Module 1, 2026-11-19)

Original draft: `docs/supplied/rbac-matrix.md`.

### A.1 Where authorization lives

- **One source of truth:** `src/domain/authz.ts` (pure functions, unit-tested). Every API route and server page calls it; nothing in the browser decides access.
- **Scope is loaded per request** from active membership documents (`src/server/scope.ts`). Custom claims are never trusted, so a role or membership change applies on the user's next request.
- **Account status is checked per request** (`src/server/session.ts`): a suspended or deactivated user is signed out on their next request, and their Firebase refresh tokens are revoked.
- **Firestore rules** mirror the read scope and deny all client writes, so the database is safe even if someone bypasses the app.

### A.2 Module 1 policy (defaults from §4 and §10)

| Capability | Admin | Lead | Team Member |
|---|---|---|---|
| Invite people, resend / revoke invitations | ✓ | — (v1) | — |
| Change roles and account status | ✓ (not their own; last active Admin is protected) | — | — |
| Create / edit / archive workspaces, workstreams, teams | ✓ | — | — |
| Add / remove / transfer members and Leads | ✓ | — | — |
| View people | Everyone | People in their teams and workstreams, plus teams linked to workstreams they lead | Teammates |
| View teams / workstreams | All | Led + member scopes, and teams linked to led workstreams | Their own |
| Audit log | Whole organisation | Own actions and changes to them | Own actions and changes to them |
| Notification delivery tools | ✓ | — | — |

Lead is deliberately **not** given delegated administration in v1 (draft §4 default). Demoting a Lead to Team Member downgrades their Lead assignments in the same transaction.

### A.3 Safeguards implemented (§7)

- No self role change or self status change.
- The last active Admin cannot be demoted, suspended or deactivated (the count is read inside the transaction, so two concurrent changes cannot both succeed).
- Profile updates cannot carry `role` or `status` (schema rejects unknown fields).
- Cross-origin mutations are rejected (Origin check).

### A.4 Security tests (§9)

Covered by `tests/unit/authz.test.ts`, `tests/unit/security.test.ts`, `tests/rules/firestore.rules.test.ts` and the emulator end-to-end run (`npm run test:e2e`): Team Member invite → 403, self role change → 403, role smuggling → rejected, Team Member structure create → 403, CSRF → rejected, cross-team URL → not found with no data, deactivated user → signed out and cannot sign in.
