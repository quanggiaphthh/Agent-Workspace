# H4 — Security & Data Boundedness Hardening — Design

Status: DESIGN FOR REVIEW — NO PRODUCTION IMPLEMENTATION AUTHORIZED

Baseline at design start: `cfba989eb26575675818ce18fb7febf82e410b10`

## 1. Purpose

H4 is a bounded post-H3 hardening workstream for the existing private single-owner Agent-Workspace. It addresses three confirmed technical debts without reopening or redesigning MVP, R1, R2, H1, H2, or H3.

Success means reducing residual diagnostic attack surface and making selected data operations demonstrably bounded while preserving existing user-visible contracts, canonical authorities, Task/Agent behavior, Firebase ownership, and module architecture.

## 2. Locked scope

H4 contains exactly three production concerns:

### H4-A — Remove legacy Firebase diagnostic probe

Remove the historical `/api/test/firebase-connection` route from `server.ts`.

After the route is absent, remove only the now-dead production special-case in `ServerIdentityProvider` that returns 404 for `/test/firebase-connection`.

Do not replace the route with another public/protected diagnostic endpoint. Existing `/api/health` remains the canonical runtime health surface.

### H4-B — Bound Memory reads without silently changing search semantics

Current `UserDataService.listMemories()` can fetch the full matching Firestore collection and only then perform keyword filtering, sorting, and result slicing in process memory.

H4 must eliminate unbounded collection reads.

The implementation must reuse existing Firestore query/pagination patterns where possible. It must not implement a deceptive `.limit(N)` change that claims global keyword-search semantics while searching only the first N documents.

Required design rule:

- non-keyword memory listing must be server-bounded with deterministic ordering and a bounded limit;
- keyword search must have an explicit bounded search contract. If exact global substring search cannot be preserved without a search index/schema change, H4 must choose and document a bounded candidate-window behavior rather than adding a new search subsystem;
- no new external search dependency, Firestore schema migration, or parallel memory authority is permitted in H4;
- Agent and UI consumers must receive the same result shape they receive today unless a separately approved contract change is required.

### H4-C — Chunk destructive user-data deletion

Current destructive user-data cleanup must not depend on loading an unbounded collection and committing an arbitrarily large single Firestore batch.

Deletion must process owned documents in bounded chunks until exhausted.

Required properties:

- preserve owner/user scoping;
- preserve existing endpoint/caller semantics;
- bounded query size per iteration;
- bounded write batch per iteration;
- continue until no owned documents remain;
- fail closed on Firestore error;
- do not introduce background jobs, queues, new persistence authorities, or new dependencies.

## 3. Explicit non-goals

H4 does NOT include:

- multi-key credential encryption or key migration;
- credential zeroization guarantees;
- Task REST/API pagination redesign;
- Board/List/H3 UX changes;
- CSRF-token architecture;
- Origin allowlist redesign;
- Temporary Chat/session redesign;
- backup/export subsystem;
- multi-user or multi-tenant authorization;
- ADK/Gemini replacement;
- `adm-zip` dependency exception resolution;
- generic security refactoring;
- new module, new database, or new dependency.

The time-bounded ADK/`adm-zip` exception remains a separate security review deadline before 2026-10-31.

## 4. Architecture constraints

The following remain canonical and unchanged:

- Firebase Admin SDK is the server persistence authority;
- Firebase ID-token verification and `OWNER_UID` remain identity authority;
- Firestore/Storage client rules remain deny-by-default/server-authoritative;
- `UserDataService` remains the canonical Task/Memory data service;
- existing Agent capability registry and HITL/idempotency authorities remain unchanged;
- no client-side Firestore fallback is permitted;
- no new registry, context store, identity provider, or persistence layer is permitted.

## 5. Preferred implementation shape

### 5.1 Diagnostic route

Expected production delta is limited to `server.ts`, `server/core/auth/identityProvider.ts`, and directly related tests/documentation if present.

Deletion is preferred over adding another environment flag because the probe was an acceptance diagnostic and H4 no longer needs it as an application route.

### 5.2 Memory boundedness

Prefer a small reusable bounded-query primitive inside or immediately adjacent to `UserDataService` rather than a new service.

For ordinary listing, use deterministic Firestore ordering and a server-enforced maximum.

For keyword search, implementation must first enumerate current consumers and preserve the actual required behavior. A bounded candidate window is acceptable for the current personal application only if its limitation is explicit and tested. A future full-text/indexed search system is outside H4.

### 5.3 Destructive cleanup

Prefer repeated Firestore queries with a fixed page/chunk size and one bounded batch per chunk. Avoid retaining all document snapshots across the whole collection.

The chunk size must remain safely below Firestore batch operational limits and should be represented by a named constant with tests proving multi-chunk behavior.

## 6. Verification requirements

Before implementation is eligible for lock:

1. targeted tests prove the Firebase diagnostic route is absent and no special production route exception remains;
2. targeted Memory tests prove the server never performs an unbounded memory list query and that result limits/keyword behavior match the approved bounded contract;
3. targeted cleanup tests prove datasets larger than one chunk are deleted across multiple bounded batches;
4. existing Task and Memory capability behavior remains compatible;
5. TypeScript passes with zero errors;
6. targeted Vitest passes;
7. full Vitest passes;
8. production build passes;
9. existing canonical QA/security/manifest gates required by the repository pass;
10. no dependency, schema, Firebase Rules, Agent runtime, Task UX, or H1-H3 architecture changes are introduced.

## 7. Rollback and failure semantics

H4 must be independently revertible as a bounded hardening change.

Memory queries and destructive cleanup fail closed on persistence errors. H4 must not silently return success after partial deletion failure. Existing API error handling remains authoritative unless tests prove a bounded correction is necessary.

Removing the diagnostic route has no replacement/rollback requirement; `/api/health` remains available for supported health checks.

## 8. Risk assessment

Primary implementation risk is semantic regression in Memory keyword search. This is why a simple `.limit()` patch is prohibited without an explicit bounded search contract.

Secondary risk is partial destructive cleanup. Chunking reduces Firestore operational risk but means a later chunk can fail after earlier chunks succeeded. Existing delete-all semantics therefore must be audited and tests must document/reconcile retry behavior before implementation is locked.

The diagnostic-route removal is low risk.

## 9. Completion rule

H4 may become `FINAL PASS / LOCKED` only after implementation, canonical verification, and documentation closeout are separately evidenced.

Until then:

- MVP/R1/R2/H1/H2/H3 remain `FINAL PASS / LOCKED`;
- H4 is not authorized for implementation merely by the existence of this design document;
- R3 remains `NOT OPENED`;
- no successor workstream is implied.
