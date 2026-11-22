# Modules 6–8 Delivery Notes

This delivery preserves the original module numbering in the 12-module Inhub Ops roadmap. It adds functionality around member/team visibility, operational analytics and meetings/calendar without renaming or replacing earlier modules.

## Module 6 — Member & Team Management

The People directory now includes an Admin-only organisation roster summary: total and active accounts, active Leads and Team Members, active teams and workstreams, active team/workstream assignment counts, and active non-Admin accounts without a team assignment. The existing People, person-detail, team and workstream pages remain the operational surfaces for invitations, role/status administration, membership assignment and roster inspection. These are descriptive coverage metrics, not performance scores.

The snapshot is read from organisation-scoped user and membership records. Inactive memberships do not count as active assignments. The page remains role-aware: the organisation-wide counts are not exposed to Lead or Team Member accounts.

## Module 7 — Analytics & Performance Dashboard

Analytics adds a member workload distribution built from real task accountability and collaboration fields. It distinguishes owned open tasks, collaborating open tasks, completed tasks and overdue tasks. Members are displayed alphabetically; the chart is explicitly a workload view, not a productivity score or staff ranking.

The service pages through the authorised People directory, up to 1,000 visible accounts, rather than assuming the first directory page represents the whole organisation. Team Members receive only their own member row. The pre-existing trends, task status, project progress, reporting, heatmap and team/workstream analyses remain in place.

## Module 8 — Meetings & Calendar

A dedicated `/calendar` page provides a month grid, selected-day agenda and upcoming-meeting list. Meetings support: creating, editing and cancelling; organisation-timezone scheduling; venue or HTTP(S) meeting link; descriptions; attendee selection; accepted/tentative/declined responses; and notification delivery for invitations, changes, cancellation and attendee responses.

### Data and access safeguards

- Meetings are stored in `meetings` with organisation ID, organiser, attendee IDs, start/end instants, organisation timezone, status and RSVP responses.
- Admins can invite any active account in the organisation. Leads and Team Members can invite only active people visible in their existing team/workstream scope. The organiser is always included.
- Only the organiser or an Admin can edit or cancel a meeting. Only listed attendees can RSVP.
- Meeting reads for non-Admins are restricted to meetings they organise or attend.
- Mutations are performed server-side with the Admin SDK, accompanied by audit records and transactional outbox events. Client Firestore access remains default-deny under the existing rules architecture.
- New composite indexes are additive. Do not deploy index changes without reviewing the diff against the existing Firebase index set.
- The calendar query range is padded around the visible grid to account for timezone offsets near UTC date boundaries; the UI still displays meetings on their organisation-local date.

### API

- `GET /api/meetings?from=...&to=...` — bounded date-range listing.
- `POST /api/meetings` — schedule a meeting.
- `PATCH /api/meetings/:id` — update an organiser/Admin meeting.
- `POST /api/meetings/:id/cancel` — cancel and notify attendees.
- `POST /api/meetings/:id/rsvp` — record an attendee response and notify the organiser.

## Validation and release

Unit coverage is added for member/team aggregation, member workload calculation, Module 8 event catalogue entries and meeting input/RSVP validation. Run typecheck, lint, all unit tests and production build in the Node 24 project environment before merging. Deploying Firestore indexes or production code is a separate explicit release action.
