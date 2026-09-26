# H4 Security & Data Boundedness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the obsolete Firebase diagnostic route and make Memory reads and destructive user-data cleanup demonstrably bounded without changing existing user-visible APIs, Task/H3 behavior, Firebase schema, dependencies, or Agent authorities.

**Architecture:** Keep `UserDataService` as the single Task/Memory persistence authority and reuse its existing bounded Firestore query pattern. H4-A deletes obsolete diagnostic surface; H4-B adds a bounded Memory candidate-window contract with deterministic ordering; H4-C deletes owned Task/Memory documents in repeated bounded chunks with retry-safe semantics.

**Tech Stack:** TypeScript, Express 4, Firebase Admin SDK/Firestore, Vitest.

**Spec:** `docs/H4_SECURITY_DATA_BOUNDEDNESS_DESIGN.md`

## Global Constraints

- MVP/R1/R2/H1/H2/H3 remain `FINAL PASS / LOCKED`.
- R3 remains `NOT OPENED`.
- No new dependency, Firestore schema/index migration, Firebase Rules change, Agent runtime change, Task/H3 UX change, new persistence authority, queue, background job, or search subsystem.
- Preserve existing endpoint/result shapes unless the design explicitly permits documenting bounded keyword-search behavior.
- H4 does not resolve the ADK/`adm-zip` exception; its separate review deadline remains before 2026-10-31.
- Work from fresh `main`; stop if canonical source materially differs from the design assumptions.

## File Structure

Expected production modifications:
- `server.ts` — remove `/api/test/firebase-connection` only.
- `server/core/auth/identityProvider.ts` — remove only the dead route-specific production exception after H4-A.
- `server/core/data/UserDataService.ts` — implement bounded Memory query and bounded chunk deletion using existing Firestore authority.

Expected tests:
- Reuse and extend the repository's existing server/auth/data tests that currently cover these paths. Do not create a parallel test harness if an existing suite owns the behavior.
- Create a focused H4 test file only if fresh source audit proves no existing test file can own all three regressions cleanly.

Expected documentation after implementation verification:
- Update H4 design/status or add bounded closeout evidence only after production verification passes; do not update Master Plan/Tracker to `FINAL PASS / LOCKED` before canonical CI succeeds.

## Review Focus

1. Memory keyword outside the bounded candidate window must not be represented as a global exhaustive search result; limitation must be explicit and deterministic.
2. Memory listing with no keyword must never issue an unbounded collection `get()` and must honor the public limit clamp.
3. A cleanup dataset larger than one deletion chunk must require multiple bounded queries/batches and leave no owned Task/Memory documents when all commits succeed.
4. If a later cleanup chunk fails after earlier commits, the operation must fail rather than report success; retry must safely continue deleting remaining owned documents.
5. Removing the diagnostic route must not weaken normal authentication or alter `/api/health`.

---

### Task 1: H4-A — Remove legacy Firebase diagnostic route

**Files:**
- Modify: `server.ts`
- Modify: `server/core/auth/identityProvider.ts`
- Test: extend the existing route/identity security tests found by fresh source audit.

**Interfaces:**
- Consumes: existing Express route registration and `ServerIdentityProvider` authentication boundary.
- Produces: no `/api/test/firebase-connection` application route and no route-specific identity exception; `/api/health` remains unchanged.

- [ ] **Step 1: Locate current route and owning tests**

Confirm fresh source still contains `/api/test/firebase-connection`, its Firestore probe behavior, and the production-only special case in `ServerIdentityProvider`. Identify the existing test file(s) asserting probe/identity behavior.

- [ ] **Step 2: Write/adjust the failing regression test**

Assert that the application has no supported Firebase diagnostic probe route and that identity middleware contains no route-specific `/test/firebase-connection` production bypass/404 branch. Preserve existing `/api/health` assertions.

- [ ] **Step 3: Run the targeted test and verify RED**

Run the smallest existing Vitest target owning server route/identity behavior. Expected: FAIL because the legacy route/special case still exists.

- [ ] **Step 4: Remove the minimal production code**

Delete only the `/api/test/firebase-connection` route from `server.ts` and its now-dead special case from `server/core/auth/identityProvider.ts`. Do not introduce a replacement diagnostic endpoint or feature flag.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Expected: route/identity tests PASS and `/api/health` behavior remains unchanged.

- [ ] **Step 6: Commit Task 1**

Commit message: `security: remove legacy firebase diagnostic probe`

---

### Task 2: H4-B — Bound Memory reads with explicit candidate-window semantics

**Files:**
- Modify: `server/core/data/UserDataService.ts`
- Test: extend existing `UserDataService`/Memory tests discovered on fresh main.
- Documentation: update the closest existing Memory/API contract documentation only if it currently promises exhaustive global substring search.

**Interfaces:**
- Consumes: `UserDataService.listMemories(userId, options)` current result shape `Promise<MemoryRecord[]>`.
- Produces: same method signature and result shape; deterministic bounded Firestore reads; explicit bounded candidate-window keyword behavior.

- [ ] **Step 1: Audit every `listMemories` consumer before choosing constants**

Enumerate REST, Agent capability, UI, tests, and docs consumers. Record which callers pass `query`, `status`, `category`, and `limit`. Stop if any caller contract requires exhaustive global substring search; that would require a separately approved contract/schema decision.

- [ ] **Step 2: Lock named bounds in `UserDataService.ts`**

Define named constants adjacent to existing Task page-size constants. Use a public result maximum of 100 (preserving current clamp) and a finite Memory candidate-window maximum selected from current single-owner usage/tests. The candidate-window constant must be larger than or equal to the result maximum and must be documented as a bounded search window, not global search.

- [ ] **Step 3: Write failing non-keyword bounded-list tests**

Tests must assert deterministic newest-first ordering, status/category filtering, requested result limit clamp `1..100`, and that the Firestore query applies a finite `.limit(...)` before `.get()`.

- [ ] **Step 4: Run the targeted Memory tests and verify RED**

Expected: FAIL because current implementation performs unbounded `.get()` then slices in process.

- [ ] **Step 5: Implement bounded non-keyword listing**

Keep `listMemories(...)` signature unchanged. Apply current owner/status/category filters, deterministic `createdAt desc` plus document-id tie-break ordering, and a finite server-side query limit before `.get()`.

- [ ] **Step 6: Run non-keyword tests and verify GREEN**

Expected: PASS.

- [ ] **Step 7: Write failing keyword candidate-window tests**

Tests must prove: Firestore read is bounded; keyword matching remains case-insensitive Vietnamese substring matching over `content + category + source`; results are newest-first; returned count honors `1..100`; a match outside the candidate window is not falsely represented as evidence of exhaustive global search.

- [ ] **Step 8: Implement bounded keyword search**

Reuse the same filtered/ordered Firestore query but fetch at most the named candidate-window maximum, then apply the existing in-process substring predicate and result clamp. Do not add external search/index/schema/dependency code.

- [ ] **Step 9: Run all Memory/data-service tests**

Expected: PASS, with unchanged `MemoryRecord[]` result shape and no Task regression.

- [ ] **Step 10: Commit Task 2**

Commit message: `perf: bound memory collection reads`

---

### Task 3: H4-C — Chunk destructive user-data cleanup

**Files:**
- Modify: `server/core/data/UserDataService.ts`
- Test: extend existing destructive-cleanup/data-service tests discovered on fresh main.

**Interfaces:**
- Consumes: `UserDataService.deleteAllUserData(userId): Promise<void>`.
- Produces: same signature and caller semantics; bounded query and write batch per iteration; retry-safe deletion of remaining owned documents.

- [ ] **Step 1: Audit all `deleteAllUserData` callers**

Confirm whether callers expect atomic all-or-nothing deletion or only completion/failure. Stop if any canonical contract promises cross-collection atomicity; Firestore chunking cannot preserve that promise without a different architecture.

- [ ] **Step 2: Define a named safe deletion chunk size**

Place a constant in `UserDataService.ts` safely below Firestore batch limits. Do not make it configurable unless an existing project pattern requires configuration.

- [ ] **Step 3: Write failing multi-chunk deletion tests**

Create more owned documents than one chunk across `agent_tasks` and `agent_memories`. Assert each query is finite, each batch contains at most the chunk size, repeated chunks are committed until empty, and foreign-user documents are untouched.

- [ ] **Step 4: Run targeted cleanup tests and verify RED**

Expected: FAIL because current code loads each entire owned collection and commits one arbitrarily sized batch.

- [ ] **Step 5: Implement bounded chunk deletion**

For each canonical collection, repeatedly query owned document references with a finite limit and deterministic ordering, delete only that page in one batch, commit, then query again until empty. Do not retain snapshots from previous chunks.

- [ ] **Step 6: Write failure/retry test**

Force a later batch commit to fail after an earlier chunk succeeds. Assert `deleteAllUserData` rejects. On retry, assert remaining owned documents are deleted and already-deleted documents do not cause failure.

- [ ] **Step 7: Run cleanup tests and verify GREEN**

Expected: PASS for empty, single-chunk, multi-chunk, foreign-owner isolation, partial-failure, and retry cases.

- [ ] **Step 8: Commit Task 3**

Commit message: `perf: chunk user data cleanup`

---

### Task 4: Integrated H4 verification and canonical closeout candidate

**Files:**
- Modify documentation only after all code/tests pass.
- Do not modify dependencies, Firebase Rules/schema, Agent runtime, Task/H3 UX, or workflows unless an existing canonical verification command itself is broken and separately approved.

**Interfaces:**
- Consumes: Tasks 1–3 completed commits.
- Produces: one H4 implementation checkpoint eligible for canonical CI and later documentation reconciliation.

- [ ] **Step 1: Inspect final production diff**

Expected production scope: `server.ts`, `server/core/auth/identityProvider.ts`, `server/core/data/UserDataService.ts` only, unless fresh audit identified an existing directly-owned test/doc file requiring bounded updates. No unrelated refactor.

- [ ] **Step 2: Run targeted H4 tests**

Run all route/identity/data-service tests changed in Tasks 1–3. Expected: PASS.

- [ ] **Step 3: Run TypeScript verification**

Run the repository's canonical TypeScript command. Expected: 0 errors.

- [ ] **Step 4: Run full Vitest**

Run the repository's canonical full test suite. Expected: all tests PASS; record exact file/test counts rather than reusing historical counts.

- [ ] **Step 5: Run production build**

Run the canonical production build. Expected: SUCCESS.

- [ ] **Step 6: Run repository QA/security/manifest gates**

Use the commands already defined by the repository. Expected: all applicable gates PASS. Do not invent replacement gates.

- [ ] **Step 7: Verify forbidden deltas**

Confirm dependencies, lockfiles, Firebase Rules/schema, Agent/ADK/Gemini runtime, Task/H3 UX, module authority, workflows, and R3 state are unchanged.

- [ ] **Step 8: Commit implementation checkpoint if verification is clean**

Use a bounded H4 implementation commit message reflecting security/data boundedness. Push `main` only under the project's current direct-main workflow.

- [ ] **Step 9: Wait for canonical GitHub Actions**

Do not claim `FINAL PASS / LOCKED` until the workflow for the exact implementation commit is `SUCCESS`. Record exact SHA, run number, run ID, test counts, build and gate evidence.

- [ ] **Step 10: Documentation closeout**

Only after canonical implementation CI succeeds, update H4 status evidence and then reconcile `PROJECT_MASTER_PLAN.md` and `docs/MVP_IMPLEMENTATION_TRACKER.md` in a documentation-only commit. Wait for its canonical CI before declaring H4 `FINAL PASS / LOCKED`.

## Self-Review Result

- Spec coverage: H4-A/B/C and all explicit non-goals are represented.
- Type consistency: existing public method signatures remain unchanged; no new public API is introduced.
- Primary semantic risk addressed: keyword Memory search is explicitly bounded rather than silently advertised as exhaustive.
- Partial deletion risk addressed: failure is surfaced; retry deletes remaining owned documents safely.
- Scope discipline: no Task pagination redesign, key-ring, CSRF architecture, session redesign, backup subsystem, multi-user work, ADK replacement, or dependency change.
- Execution should stop on any discovered contract requiring global Memory search or atomic cross-collection delete-all semantics, because either would exceed the approved H4 design.
