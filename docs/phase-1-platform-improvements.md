# Phase 1 Platform Improvements

This document records the first implementation pass based on the Inhub Workspace source audit.

## Included changes

### Responsive layout
- Updated the People directory search/filter controls to use a full-width search field and a two-column filter layout on narrow screens.
- Added `min-width: 0` constraints to the People page, page header and application shell flex/grid containers.
- Kept the People table in an intentional horizontal-scroll container on larger/tablet layouts and retained member cards on mobile.
- Made the topbar breadcrumb region shrink correctly and kept global search usable at narrow widths.
- Added a document-level horizontal overflow clip as a final guard; this is not intended to replace component-level responsive layouts.

### Delete and restore lifecycle
- Projects: manager-facing Delete action uses the existing archive lifecycle; restore is available from the deleted-projects view.
- Tasks: manager-facing Delete action soft-deletes tasks, records task activity and an audit entry, and exposes a deleted-task view with Restore. Deletion is blocked while active subtasks or dependent tasks reference the task.
- Task comments: author or an authorised manager can soft-delete a comment. Deleted comments disappear from the discussion while deletion remains in activity/audit history.
- Work reports: authors can soft-delete draft or returned reports; submitted and approved reports remain locked. Authors can restore their deleted reports from the deleted-drafts view.
- Workspaces, workstreams and teams: existing archive/restore lifecycle is presented as Delete/Restore in the UI, retaining relationship history.
- People and invitations retain their existing lifecycle controls (suspend/deactivate/reactivate and revoke) rather than destructive account deletion or erasing invitation history.
- Audit records remain append-only.

### Search
- Added a global search dialog accessible from the application topbar.
- Added Ctrl/Cmd+K keyboard shortcut.
- Added authenticated `/api/search` endpoint returning permission-scoped results for people, projects, tasks, work reports, workspaces, teams and workstreams.
- Retained the People directory and Task register's module-specific search/filter controls.

## Current limitations / follow-up

- Search is an initial cross-module search over the currently implemented modules. Firestore does not provide general-purpose full-text search; typo tolerance, relevance ranking and indexing should be evaluated with a dedicated provider as data volume grows.
- Global search uses the app's current list/query services and existing result limits. Large-scale search should move to dedicated indexed queries/provider rather than loading operational lists.
- The responsive work addresses the observed People page overflow and shared shell constraints. Full viewport/device QA across every module is still required.
- Full semantic type-check, lint, unit tests, emulator/rules tests and production build were not run in this environment. The ZIP excludes dependencies, and the available runtime is Node 22.16.0 while this project requires Node 24.x (several installed Firebase packages require Node 24.12.0 or later). TypeScript syntax transpilation was run on the modified source files.
- No production deployment or live Firebase data migration was performed.
