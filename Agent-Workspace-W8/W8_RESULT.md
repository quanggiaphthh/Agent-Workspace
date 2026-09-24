# W8 RESULT

**Status:** W8 — SOURCE READY / VERIFICATION PENDING

**Canonical baseline:** `ca640f0096d8472d20343ebcfd36485f95db581c`

## GO / STOP
GO. The canonical Task authority already supports the required personal-task fields and CRUD API path. W8 remains a bounded UI completion: two existing Task UI files only, no schema/API/persistence/dependency redesign.

## KEEP / IMPROVE / SIMPLIFY / REMOVE
**KEEP:** `UserDataService` Task authority, `/api/tasks` CRUD/stats path, Firebase persistence, `tasksManifest`, module disable behavior, Home `TasksStatsWidget`, existing Agent Task create/list capabilities, permissions, current route/navigation.

**IMPROVE:** daily-use list hierarchy; explicit complete/reopen; edit flow; delete confirmation; priority/due visibility; overdue/today indicators; priority/due filters; sorting; actionable error state; loading skeleton; empty states; mobile/tablet wrapping; icon action labels.

**SIMPLIFY:** user copy to Vietnamese; task header/metrics; create/edit form; client-side filtering/sorting over the existing canonical list response.

**REMOVE from primary UX:** `Server-managed Firestore`, API/server jargon, English `(Tasks)/(To do)/(Due Date)`, demo/sample-data seeding, fake cloud-sync copy, raw API errors, category `Dự án` option that invites out-of-scope project semantics.

## Source audit
- Task UI already had create, status mutation, delete, search, category/status filter, priority and due-date display.
- Canonical `UserDataService` already owns `title`, `description`, `status`, `priority`, `category`, `dueDate` and supports create/update/delete/list/stats.
- Existing UI lacked edit, direct complete/reopen semantics, explicit error UI, overdue/today treatment, priority/due filtering and useful sorting.
- Home stats remains on `/api/tasks/stats`; no W8 change required.
- Agent Task registration remains Task-owned and canonical; no W8 change required.

## External source research actually used
- Vikunja source (`pkg/models/tasks.go`): task title/done/due-date/priority model plus search/filter/sort semantics. Pattern adapted only; no source copied because Vikunja is AGPL.
- Twenty Task type: concise status + due-date task metadata pattern; reference only.
- Plane source search: mature issue/task store and quick-create patterns reviewed; no code copied.
- shadcn/ui source search: accessible dialog/alert-dialog pattern reviewed; no dependency/source copied.
- AppFlowy search produced no source-level component useful enough to justify adaptation; no code reused.

## Implementation
1. `TasksModule.tsx`
   - keeps existing `/api/tasks` authority;
   - adds user-safe error + retry;
   - removes sample-data mutation path;
   - adds explicit complete/reopen toggle;
   - adds edit via existing PATCH endpoint;
   - adds bounded delete confirmation UI;
   - adds search, status, priority, today/overdue filters and due/priority/newest sorting;
   - adds overdue/today labels and clearer due-date formatting;
   - responsive toolbar/list; accessible icon labels.
2. `TaskFormModal.tsx`
   - extends existing form for create + edit;
   - removes English/technical copy;
   - due date is optional rather than fabricated as today;
   - removes project-like category option;
   - adds busy state and accessible dialog semantics.

## Files modified
- `src/modules/tasks/TasksModule.tsx`
- `src/modules/tasks/TaskFormModal.tsx`

## Files created
- Production: 0
- Candidate/report artifacts only: `W8_RESULT.md`, `W8_CHANGED_FILES.sha256`.

## Dependencies / API / persistence
- New dependencies: 0
- New APIs: 0
- Schema migrations: 0
- New persistence: 0
- State-management libraries: 0
- Date libraries: 0

## Tests
No new test file was added in the source candidate because the execution container does not contain the full canonical repository/test dependencies. Existing Task/API/module/Home tests remain the verification targets; candidate does not claim they passed.

## Verification
- Fresh baseline/source audit: PASS via GitHub connector.
- External source-level research: PASS.
- Candidate source hashes: PASS (locally computed exact candidate files).
- Targeted Task tests: NOT RUN / BLOCKED — full repository/dependencies not materialized.
- Home/module tests: NOT RUN / BLOCKED — same reason.
- `npm run lint`: NOT RUN / BLOCKED.
- `npm run build`: NOT RUN / BLOCKED.
- Manifest verification: NOT MODIFIED. Canonical manifest does not cover either W8-modified file, so no hash was guessed.
- `git diff --check`: NOT RUN / BLOCKED — no canonical git worktree in container.
- Agent document/Gemini E2E: NOT RUN by design.
- Unrelated tests: 0.

## REUSE MAP
| Requirement | Existing Source | External Reference | Reuse Type | Adaptation | New Code |
|---|---|---|---|---|---|
| List/create | TasksModule + `/api/tasks` | Vikunja | EXTEND_LOCAL | daily-use presentation | minimal |
| Edit | existing PATCH + UserDataService.updateTask | Twenty/Vikunja | REUSE_LOCAL | expose edit form | minimal |
| Complete/reopen | existing PATCH status | Vikunja | EXTEND_LOCAL | direct binary user action | minimal |
| Delete confirmation | existing DELETE | shadcn alert-dialog pattern | ADAPT_EXTERNAL | local bounded confirmation | minimal |
| Status/priority/due | canonical TaskRecord | Vikunja/Twenty | REUSE_LOCAL | clearer metadata | minimal |
| Overdue/today | existing dueDate | Vikunja | EXTEND_LOCAL | native date comparison | minimal |
| Search/filter/sort | existing local task array/search | Vikunja | EXTEND_LOCAL | priority/due/sort | minimal |
| Loading/empty/error | existing loading/empty | mature task patterns | EXTEND_LOCAL | error/retry + skeleton | minimal |
| Home stats | TasksStatsWidget + stats API | — | REUSE_LOCAL | none | 0 |
| Agent capabilities | Task registration + canonical service | — | REUSE_LOCAL | none | 0 |
| Module disable | W4 registry/catalog | — | REUSE_LOCAL | none | 0 |

## CHANGE METRICS
- Existing files modified: 2
- New production files: 0
- New dependencies: 0
- New APIs: 0
- Schema migrations: 0
- New persistence: 0
- Existing components reused: 2 (`Button`, existing Task form surface)
- External patterns adapted: 2 (Vikunja task-list ergonomics; accessible confirmation pattern)
- New tests: 0
- Unrelated tests executed: 0

## Unresolved risks
- Candidate requires application to exact baseline and canonical targeted verification.
- The existing API response envelope for PATCH/POST should be confirmed by targeted tests; candidate falls back to local patch/fetch behavior where practical.
- No Agent mutation capabilities were added: canonical Agent Task create/list behavior is preserved rather than expanding W8 into a new HITL/capability workstream.
