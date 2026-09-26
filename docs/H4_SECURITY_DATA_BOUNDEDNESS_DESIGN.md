# H4 — Security & Data Boundedness Hardening — Closeout Evidence

Status: IMPLEMENTATION VERIFIED — DOCUMENTATION CLOSEOUT IN PROGRESS

Design baseline: `cfba989eb26575675818ce18fb7febf82e410b10`

Implementation checkpoint: `dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d`

Canonical implementation CI: GitHub Actions `36214906016` — run #190 — **SUCCESS**.

## 1. Purpose

H4 is a bounded post-H3 hardening workstream for the existing private single-owner Agent-Workspace. It addresses three confirmed technical debts without reopening or redesigning MVP, R1, R2, H1, H2, or H3.

The implementation reduces residual diagnostic attack surface and makes selected data operations demonstrably bounded while preserving existing user-visible contracts, canonical authorities, Task/Agent behavior, Firebase ownership, and module architecture.

## 2. Implemented scope

### H4-A — Legacy Firebase diagnostic identity exception removed

The historical production-only `/test/firebase-connection` exception in `ServerIdentityProvider` was removed. The stale test invariant that required that identity-provider special case was removed after canonical CI demonstrated it was the only failing historical assertion.

Implementation evidence:

- corrective production commit: `68175d05b45a108831f949db6b0de16ccee09cfc`;
- stale-test corrective commit: `c125e4780c04c7ccee11a1f9b2422de83397e4c1`;
- canonical GitHub Actions run #188, ID `36214551404`: **SUCCESS**.

No replacement diagnostic identity bypass/exception was introduced. `/api/health` remains the supported runtime health surface.

### H4-B — Memory reads bounded with explicit candidate-window semantics

`UserDataService.listMemories()` no longer performs an unbounded collection read followed by process-only slicing.

Locked behavior:

- default result limit: 50;
- hard maximum returned results: 100;
- keyword candidate window: newest 500 matching owner/status/category documents;
- deterministic Firestore ordering: `createdAt desc`, then document ID descending;
- Firestore `.limit(...)` is applied before `.get()`;
- status/category filters remain server-side;
- Vietnamese case-insensitive substring matching over `content + category + source` remains in process over the bounded candidate window;
- public result shape remains `Promise<MemoryRecord[]>`;
- keyword search is explicitly a bounded candidate-window search, not an exhaustive global full-collection search.

Implementation checkpoint for H4-B: `805c5f119d23585027de6553af45d425536cad98`.

Canonical GitHub Actions run #189, ID `36214757411`: **SUCCESS**.

No search subsystem, schema migration, external dependency, or parallel Memory authority was introduced.

### H4-C — Destructive user-data cleanup bounded in chunks

`UserDataService.deleteAllUserData(userId)` now deletes owned Task/Memory documents in repeated bounded Firestore chunks rather than loading each full owned collection and committing one arbitrarily large batch.

Locked behavior:

- named chunk size: 400 documents;
- owner/user scoping remains mandatory;
- deterministic document-ID ordering;
- each query is bounded by the chunk size;
- each chunk uses one bounded Firestore write batch;
- processing continues until no owned documents remain;
- Firestore failures propagate to the caller rather than reporting false success;
- already committed earlier chunks remain deleted if a later chunk fails;
- retry safely continues from remaining owned documents;
- public method signature remains `deleteAllUserData(userId): Promise<void>`.

H4 integrated implementation checkpoint: `dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d`.

Canonical GitHub Actions run #190, ID `36214906016`: **SUCCESS**.

## 3. Explicit non-goals preserved

H4 did NOT introduce:

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
- new module, database, persistence authority, search service, queue, background job, or dependency.

The time-bounded ADK/`adm-zip` exception remains a separate security review deadline before 2026-10-31.

## 4. Architecture authorities preserved

The following remain canonical and unchanged:

- Firebase Admin SDK — server persistence authority;
- Firebase ID-token verification + `OWNER_UID` — identity authority;
- Firestore/Storage client rules — deny-by-default/server-authoritative;
- `UserDataService` — canonical Task/Memory data service;
- existing Agent capability registry, HITL and idempotency authorities;
- no client-side Firestore fallback;
- no parallel registry, context store, identity provider or persistence layer.

MVP/R1/R2/H1/H2/H3 remain locked and R3 remains unopened.

## 5. Canonical verification evidence

The integrated H4 implementation checkpoint `dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d` passed canonical GitHub Actions run #190 (`36214906016`). The verification job completed successfully across all repository gates, including:

1. production dependency audit;
2. production manifest verification;
3. TypeScript;
4. targeted GĐ4 tests;
5. capability tool bridge;
6. targeted GĐ4 2A gateway;
7. targeted GĐ4 2B client;
8. full Vitest;
9. QA Stage 1;
10. QA Stage 2;
11. QA Stage 3A;
12. QA Stage 3B;
13. QA Stage 3C;
14. QA Stage 4A;
15. QA Stage 4B;
16. QA Stage 4C;
17. QA Stage 4D;
18. QA Stage 5;
19. W11 Security QA;
20. production build;
21. final production-manifest verification.

No failing verification step remained at the integrated checkpoint.

## 6. Rollback and failure semantics

H4 remains independently revertible as a bounded hardening change.

Memory queries and destructive cleanup fail closed on persistence errors. Chunked destructive cleanup is intentionally retry-safe rather than cross-collection atomic: a later failure is surfaced, and a retry continues from documents still owned by the user.

The H4 Memory keyword contract is intentionally bounded to the newest candidate window. A future exhaustive full-text/indexed search system, if ever required, must be a separately approved workstream.

## 7. Residual items outside H4

H4 does not claim to close the broader audit roadmap. In particular:

- live IAM/ADC and Rules evidence remains governed by the existing deployment/security evidence, not by H4;
- credential multi-key rotation remains outside H4;
- backup/export automation remains outside H4;
- frontend XSS/token-storage deep audit remains outside H4;
- the ADK/`adm-zip` temporary security exception must still be reviewed before 2026-10-31;
- multi-user/public SaaS remains explicitly out of scope.

## 8. Completion rule

Production implementation and canonical implementation verification are complete.

H4 becomes `FINAL PASS / LOCKED` only when canonical status documents are reconciled and the resulting documentation-only closeout commit passes canonical GitHub Actions.

Until that final documentation CI succeeds:

- MVP/R1/R2/H1/H2/H3 remain `FINAL PASS / LOCKED`;
- H4 remains **IMPLEMENTATION VERIFIED — DOCUMENTATION CLOSEOUT IN PROGRESS**;
- R3 remains `NOT OPENED`;
- no successor workstream is implied or opened.
