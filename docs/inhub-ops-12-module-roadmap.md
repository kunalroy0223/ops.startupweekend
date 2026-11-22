# Inhub Ops — Canonical 12-Module Roadmap

**Status:** Canonical product module catalogue
**Updated:** 22 November 2026

The names, numbering and scope below are the authoritative Inhub Ops roadmap. Earlier implementation notes may use a different release grouping; they do not change this module numbering.

| Module | Scope |
|---:|---|
| 1 | **Platform Foundation & Administration** — Authentication, users, permissions, workspaces and teams |
| 2 | **Task & Project Management** — Projects, tasks, workflows, collaboration and attachments |
| 3 | **Work Reports & Timesheets** — Daily reports, time logging, reviews and approvals |
| 4 | **Notifications & Workflow Automation** — Reminders, automation rules, digests and notifications |
| 5 | **Knowledge Base & Documentation** — Centralised documentation and organisational knowledge |
| 6 | **Member & Team Management** — Member lifecycle, team structure and assignments |
| 7 | **Analytics & Performance Dashboard** — Organisational analytics, performance metrics and reporting |
| 8 | **Meetings & Calendar** — Meetings, agendas, minutes, calendar and follow-up actions |
| 9 | **Partnerships, Stakeholder & Outreach CRM** — Contacts, partnerships, campaigns, outreach and relationship management |
| 10 | **Event & Programme Management** — Event planning, programme coordination and operations |
| 11 | **Resource & Asset Management** — Resource allocation, asset records and utilisation |
| 12 | **Administration, Audit & Governance** — Governance controls, records management, retention and administrative oversight |

## Delivery rules

1. Preserve the module numbers and titles above. Do not compress, reorder, merge or renumber modules.
2. Modules 9–12 are one coordinated delivery tranche, but each remains a separate module with its own navigation, data contract, server services, authorization, UI and tests.
3. Module 10 is the internal event/programme operations capability inside Inhub Ops. It is not the separate TSWS participant/team application at `app.startupweekend.sbs`.
4. Complete and validate all 12 Inhub Ops modules before beginning that separate Event Application.
5. The current implementation remains Firestore-only on the Firebase Spark plan. Use server-side Admin SDK access with application authorization and default-deny client rules. Do not add Firebase Storage or Blaze dependencies.
6. No production deployment, Firebase rules/index deployment, Git commit or push is implied by source implementation. Each requires a separate release decision.

## Release acceptance

A module is implementation-ready only when its data model, validation, server authorization, API, role-aware UI, audit behaviour, tests and documentation are included. A module is release-ready only after the full project typecheck, lint, unit tests, Firestore emulator rules tests, production build and preview smoke test pass.
