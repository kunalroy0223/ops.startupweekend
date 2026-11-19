# Inhub Workspace — Product Requirements (reconstructed)

> **Derived document.** The original `prd.md` named in the handoff pack was never supplied. This version is reconstructed from the master development prompt and the supplied design-system, database-schema, rbac-matrix, workflow-specification and development-roadmap drafts. Replace it if the original exists, and reconcile any differences.

**Last updated:** 2026-11-19

## 1. Product

Inhub Workspace is the internal work-management platform for the Inhub Entrepreneurship Cell (and the Techstars Startup Weekend Siliguri organising crew). It is inspired by Jira but deliberately simpler: people, teams, workstreams, tasks, daily work reports and dashboards, in one trusted place.

## 2. Users and roles

| Role | Who | Core need |
|---|---|---|
| **Admin** | Organisers who run the platform | Set up the organisation, invite people, assign them, control access, see everything, audit changes. |
| **Lead** (one unified role) | Team and workstream leads | See and run their own teams and workstreams; review their people's work. Scope comes from assignments, not from the role alone. |
| **Team Member** | Everyone else | See their teams and teammates, do assigned work, file daily reports. |

## 3. Principles

1. **Easy to understand** (product owner, 2026-11-19): plain labels, one obvious primary action per screen, helper text on every form, guided first-run setup.
2. **Creative but usable**: expressive brand moments (sign-in, overview hero, empty states) and calm, dense working screens.
3. **Smooth and lively** (product owner, 2026-11-19): smooth scrolling and animations, plenty of icons, pop-ups for every success and error, no browser alert boxes.
4. **Trustworthy**: every access rule enforced on the server and in the database; every administrative change audited; no duplicate emails.

## 4. Release scope

| Module | Scope | Status |
|---|---|---|
| **1. Platform foundation** | Invitation-only sign-up, sign-in, password reset; user directory and profiles; roles and account status; workspaces, workstreams, teams and memberships; role-aware overview dashboards; audit log; in-app notifications, email notifications and preferences; Admin settings and email-delivery health. | **Built** |
| 2. Tasks & projects | Projects, tasks, assignees, statuses, dependencies, comments, My Work. | Planned |
| 3. Work reports | Daily reports / timesheets, Lead review. | Planned |
| 4. Dashboards & analytics | Team and organisation metrics with measurement safeguards. | Planned |
| 5. Notifications & automation | Digests, reminders, rules. | Planned |

## 5. Module 1 requirements (acceptance criteria)

### Accounts
- Access is by invitation only. An invitation link works once, only for the invited email, and expires (7 days by default).
- Admins can resend (old links stop working) and revoke invitations, and copy a link when email isn't configured.
- Invitees choose their name and password, are added to pre-selected teams/workstreams, and land signed in.
- Password reset never reveals whether an account exists.
- Suspended or deactivated people are signed out on their next action and cannot sign in.

### Administration
- Admins change roles and account status with a reason. Nobody changes their own role or status. The last active Admin is protected.
- Admins create, edit and archive workspaces, workstreams and teams; link teams to workstreams; add, remove and transfer members and Leads.
- Archiving never deletes history.

### Visibility
- Admins see everything. Leads see their scopes. Team Members see their own teams and teammates. Anything else returns "not found" with no data.

### Dashboards
- Admin overview: setup checklist, key counts, what needs attention (failed emails, expiring invitations, people without a team), recent activity, role mix, quick actions.
- Lead / Team Member overview: their teams, workstreams, people, unread notifications, recent activity.

### Notifications
- In-app inbox with unread count; mark one or all read.
- Email copies for important changes, following per-category preferences; essential account emails always sent.
- No duplicate emails, ever, even when processing is retried.

### Audit
- Every administrative change is recorded with actor, subject, before/after and time. Records cannot be edited or deleted.

## 6. Non-functional

- Works on phones (drawer navigation, card lists) and desktops.
- WCAG 2.2 AA: keyboard, focus, contrast, reduced motion; status never by colour alone.
- Light and dark themes.
- No secrets in Git or in client code.

## 7. Open product decisions

See `docs/architecture-validation.md` §2 and `docs/database-schema.md` Appendix A.3. Notably: whether Leads get delegated administration, project ownership rules, one report per person per day, retention periods.
