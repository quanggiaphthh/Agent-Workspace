# AGENT-WORKSPACE — W6 CANDIDATE

Baseline: `6e7384c7f28dd2aeab5f472ccc9263cfbc6f6004`

## Verdict

**W6 — SOURCE READY / VERIFICATION PENDING**

## Candidate contents

- `src/modules/home/HomeModule.tsx`
- `src/modules/home/FileUploadCard.tsx`
- `src/modules/tasks/TasksStatsWidget.tsx`
- `src/app/shell/AppShell.tsx`
- `src/modules/home/__tests__/homeUx.test.ts`
- `PRODUCTION_SOURCE_MANIFEST.sha256` — candidate changed-source hashes
- `W6_CHANGED_FILES.sha256`

## Corrective applied

- Home opens the existing Assistant through canonical `eventBus.emit('workspace:open-agent', {})`.
- AppShell subscribes through canonical `eventBus.on(...)`.
- No DOM-global `window.dispatchEvent('workspace:open-agent')` mechanism remains.
- No new EventBus, global state, framework, route, runtime, API, persistence, analytics, chart, or dependency was added.

## Verification status

The following gates are **not claimed PASS** because they were not executable in the available full-repository environment:

- targeted Home/Task/module Vitest;
- TypeScript;
- production build;
- canonical full-repository manifest verification.

The ZIP is therefore a source candidate for downstream verification, not a verified release candidate.

No commit/push/deploy performed. W7 not started.
