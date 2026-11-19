# Inhub Workspace — Development Roadmap

**Status:** Draft v1.0  
**Approach:** Incremental, vertical-slice delivery with CI/CD

---

## 1. Delivery principles

- Build the product in release modules, not as one large code-generation task.
- Inspect the repository before changing it; preserve working dependencies and configuration.
- Deliver vertical slices: data model, validation, authorization, backend, UI, tests and documentation together.
- Do not mark a feature complete when it is only a mockup or frontend-only interaction.
- Keep production secrets out of source control.
- Use preview deployments and test environments before production.
- Make schema and permission changes explicit and reviewable.

## 2. Release map

| Release | Scope | Main outcome |
|---|---|---|
| 0 — Engineering foundation | Repository audit, app shell, CI, environments, Firebase setup | Reliable technical baseline |
| 1 — Platform foundation & administration | Authentication, RBAC, people, workspaces/workstreams/teams, audit, notification foundation | Admin can establish and administer the organisation |
| 2 — Task & project management | Projects, tasks, Kanban/list views, comments, attachments, workflow | Work can be assigned and tracked |
| 3 — Work reports & timesheets | Daily reports, entries, review and approval | Work execution can be documented and reviewed |
| 4 — Dashboards & analytics | Team, workstream and personal reporting | Operational status becomes measurable |
| 5 — Notifications & automation | Digests, reminders, scheduled rules and triggers | Routine follow-up is automated |

Notification infrastructure begins in Release 1. Later releases add event types and automation.

## 3. Release 0 — Engineering foundation

### Work items

1. Inspect existing repository, Next.js version, scripts, dependencies and current deployment configuration.
2. Read `prd.md`, `trd.md`, `design-system.md`, `database-schema.md`, `rbac-matrix.md` and `workflow-specification.md`.
3. Create or validate the application shell and route groups.
4. Establish TypeScript, linting, formatting and test commands.
5. Configure Firebase project and local Emulator Suite.
6. Configure environment variable validation and `.env.example`.
7. Configure GitHub/Vercel preview and production deployment flow.
8. Establish design tokens, theme provider and shared UI primitives.
9. Document local setup and deployment.

### Exit criteria

- [ ] Local development starts cleanly.
- [ ] Type checking, linting and production build pass.
- [ ] Firebase client/server configuration is isolated.
- [ ] No secrets are committed or exposed to browser bundles.
- [ ] Preview deployment works.
- [ ] Design tokens and app shell are in place.

## 4. Release 1 — Platform foundation & administration

### Slice 1: Authentication

- Login, logout and password recovery.
- Authenticated route protection.
- Account status validation.
- User profile provisioning.
- Tests for unauthenticated and deactivated users.

### Slice 2: Authorization

- Admin, Lead and Team Member role model.
- Central authorization service.
- Workspace/workstream/team scope checks.
- Firestore Security Rules.
- Emulator-based security tests.

### Slice 3: User administration

- Admin user directory.
- Invite and accept user flow.
- User profile and account status management.
- Role changes and deactivation/reactivation.
- Admin-only bootstrap process.

### Slice 4: Organisational structure

- Create and manage the default workspace.
- Create/archive workstreams and teams.
- Associate teams with workstreams.
- Assign Leads and Team Members.
- Support users in multiple teams/workstreams where authorised.
- Role-aware directory and overview views.

### Slice 5: Audit and notification foundation

- Central audit service.
- Domain event/outbox pattern.
- In-app notification records and inbox.
- Notification preferences.
- Resend integration and verified sender domain.
- Initial invitation, account, role and assignment email events.
- Retry, idempotency and delivery logs.

### Release 1 screens

- Login.
- Forgot/reset password.
- Admin overview.
- People directory.
- Invite/add user.
- User profile.
- Workspaces.
- Workstreams.
- Teams and team details.
- Role/access overview.
- Activity/audit log.
- Notification inbox.
- Notification preferences.
- Platform settings.

### Release 1 exit criteria

- [ ] Admin has unrestricted access.
- [ ] Lead scope is enforced by assigned workstreams/teams.
- [ ] Member scope is enforced.
- [ ] Admin can invite, edit, deactivate and reactivate users.
- [ ] Admin can create workstreams/teams and assign users.
- [ ] User membership changes are audited.
- [ ] In-app notifications work for initial events.
- [ ] Initial Resend emails work in the configured environment.
- [ ] Duplicate processing does not create duplicate notifications/emails.
- [ ] Security and end-to-end tests pass.
- [ ] Production smoke test passes.

## 5. Release 2 — Task & project management

### Work items

- Project creation and project overview.
- Project team association.
- Task create/edit/assign.
- One accountable owner plus collaborators.
- Priority, due date, description and acceptance criteria.
- Status transitions from `workflow-specification.md`.
- Board/Kanban view and list/table view.
- Filters and search.
- Subtasks and dependencies.
- Comments, mentions and attachments.
- Task activity timeline.
- Task-specific email and in-app events.

### Exit criteria

- Users see only tasks within their permitted scope.
- Task ownership and status transitions are enforced server-side.
- Comments and attachments inherit task permissions.
- Task activity is auditable.
- Board and list views stay in sync.
- Due-date and assignment notifications are tested.

## 6. Release 3 — Work reports & timesheets

### Work items

- Daily report creation and draft save.
- Report entries linked to tasks or standalone activities.
- Work completed, progress, time spent, blockers and next steps.
- Submit, approve and request-revision flow.
- Review comments and history.
- Lead review queue.
- Author report history.
- Report submission and review notifications.

### Exit criteria

- One report per user/date/workspace rule is enforced if confirmed.
- Submitted reports cannot be silently overwritten.
- Revisions preserve historical versions/reviews.
- Leads only review reports within scope.
- Report reminders follow approved organisational policy.

## 7. Release 4 — Dashboards & analytics

### Work items

- Admin organisation overview.
- Lead workstream/team overview.
- Member personal overview.
- Task completion and overdue metrics.
- Workload distribution.
- Blocked work and review queues.
- Reporting consistency and review turnaround.
- Time-series and exportable summaries.

### Measurement safeguards

- Define each metric, numerator, denominator, time window and timezone.
- Distinguish task volume from task complexity and quality.
- Do not infer productivity from login duration or online presence.
- Avoid opaque individual performance scores.
- Surface missing data and metric limitations.

## 8. Release 5 — Notifications & automation

### Work items

- Immediate/daily digest rules.
- Scheduled task reminders.
- Overdue reminders with deduplication.
- Recurring tasks if approved.
- Configurable workflow triggers.
- Notification routing rules.
- Scheduled operational summaries.
- Admin-managed automation controls and execution history.

### Exit criteria

- Automation runs are idempotent and auditable.
- Schedules respect organisation timezone.
- Failed jobs can be retried safely.
- Users can manage non-essential notification preferences.
- Admin can inspect failed jobs and delivery health.

## 9. Cross-release quality gates

Every release must pass:

### Engineering
- TypeScript type check.
- Lint and formatting checks.
- Production build.
- Unit and integration tests.
- No unexplained console errors or unhandled promise rejections.

### Security
- Authentication checks.
- Role and resource-scope checks.
- Firestore Rules tests.
- Input validation and output sanitisation.
- Secrets and environment verification.
- Direct URL/API access tests.

### UX
- Responsive layout checks.
- Keyboard and focus checks.
- Loading, empty, success and error states.
- Form validation and duplicate-submit prevention.
- Reduced-motion and contrast checks.

### Operations
- Preview deployment.
- Smoke test.
- Database index/rules deployment review.
- Logging and error monitoring.
- Rollback/recovery approach.

## 10. CI/CD workflow

1. Work on a feature branch.
2. Keep changes scoped to one vertical slice.
3. Run local checks and relevant emulator tests.
4. Push branch and open a pull request.
5. Review code and security-sensitive changes.
6. Verify Vercel preview deployment.
7. Merge to the production branch.
8. Deploy and run smoke tests.
9. Record schema/rules changes and release notes.

Do not force-push over shared history. Do not run destructive database migrations directly against production without a backup and reviewed migration plan.

## 11. Suggested first sprint breakdown

| Sprint | Focus | Deliverable |
|---|---|---|
| Sprint 0 | Repository, environments, design foundation | Stable development baseline |
| Sprint 1 | Firebase Auth and user provisioning | Secure sign-in and user profile |
| Sprint 2 | RBAC and security rules | Verified Admin/Lead/Member access |
| Sprint 3 | Admin user management | Invitations, directory and account controls |
| Sprint 4 | Workstreams and teams | Organisational structure and assignments |
| Sprint 5 | Audit, notifications and email | Traceable admin events and initial emails |
| Sprint 6 | Hardening and release | Tested Module 1 production release |

Sprint duration should be set by the team; this document does not assume delivery dates.

## 12. Release management

Each release should include:

- Scope and change summary.
- Database/index/security-rule changes.
- Environment variables or secrets required.
- Test evidence.
- Known issues and limitations.
- Deployment and rollback notes.
- User-facing release notes.

## 13. Backlog policy

A feature is not “done” until it is implemented end-to-end, permission-tested, responsive, documented and deployed to the target environment. Mock data is acceptable for isolated UI prototyping only and must be clearly labelled and removed or replaced before release.
