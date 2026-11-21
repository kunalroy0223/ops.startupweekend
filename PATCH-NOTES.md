# Inhub task visibility and scope-detail patch

This overlay contains a focused fix for the production issue where a Lead who leads a task's team but is only a member of its linked workstream could not see or manage the task.

## Files included
- `src/domain/authz.ts` — shared pure Lead-scope authorization helper.
- `src/server/services/tasks.ts` — use OR-based authorised-scope checks for task visibility and Lead management; resolve project-derived task scope before validating it.
- `src/components/tasks/task-detail-workspace.tsx` — distinguish a hidden association from an absent association in member-facing task details.
- `src/components/structure/scope-detail.tsx` — remove the obsolete “Coming next” panel.
- `tests/unit/assigned-scope.test.ts` — regression tests for team scope, workstream scope, workspace isolation, unscoped resources, inactive Leads and Team Member denial.

## Apply
From the repository root:

```bash
unzip -o ~/Downloads/inhub-task-visibility-fix.zip
npm run typecheck
npm run lint
npm test
npm run build
```

Do not deploy unless all four validation commands pass and the diff has been reviewed.

The patch does not change Firestore data or production permissions. It changes the application-side policy so a Lead may act on a resource through either an assigned Lead team scope or an assigned Lead workstream scope, while retaining workspace checks and denying unscoped resources to Leads.
