# Inhub Workspace — Claude Handoff Pack

This directory contains the product, technical and implementation specifications for Inhub Workspace.

## Files

- `prd.md` — product requirements and release scope.
- `trd.md` — technical architecture and requirements.
- `design-system.md` — visual language adapted from the Startup Weekend V1 website methodology for a productivity application.
- `database-schema.md` — proposed Firestore collections, relationships, indexes and data lifecycle.
- `rbac-matrix.md` — Admin, Lead and Team Member permissions and resource-scope rules.
- `workflow-specification.md` — task, report, invitation and notification workflows.
- `development-roadmap.md` — release sequencing, sprint breakdown and quality gates.
- `.env.example` — required environment variable names with placeholders only.

## Important implementation notes

1. Read `prd.md` and `trd.md` first, then read the supporting specifications before coding.
2. Treat the data model and permission rules as a coordinated design. Do not implement conflicting client, server and Firestore authorization logic.
3. The design direction is expressive and editorial at selected identity moments, but calm and highly usable in task, report, table and settings workflows.
4. The database schema and certain organisational policies are proposed defaults. Open decisions are documented; do not silently invent policy.
5. Never commit `.env.local`, service-account credentials, Resend API keys or other secrets.
6. Implement one vertical slice at a time and test the complete flow before proceeding.
