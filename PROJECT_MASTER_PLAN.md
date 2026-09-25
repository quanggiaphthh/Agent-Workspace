# AGENT-WORKSPACE — PROJECT MASTER PLAN & PROGRESS TRACKER

> **Authority:** canonical technical checkpoints and locked evidence.  
> **Canonical production/deployed checkpoint:** `ee570f44516d639f7a6e00f5da3dc6427d597034`.  
> **Canonical GitHub Actions for deployed R1 source:** `36086993597` — run #142 — SUCCESS.  
> **Current validated R2 source checkpoint:** `83e6c8940f21d43c3d791446f0d8017f65b866cd`.  
> **Canonical GitHub Actions for R2 source:** `36089895220` — run #152 — SUCCESS.  
> **Previous known-good deployed checkpoint:** `3cb25f3c38917577e6b0106324b136a099883d9a`.  
> **Current milestone:** **MVP FINAL PASS / LOCKED; POST-MVP R1 FINAL PASS / LOCKED; POST-MVP R2 SOURCE / STATIC PASS — LIVE PROMOTION PENDING**.  
> Documentation-only commits may advance repository HEAD without creating a new production checkpoint.

## 1. Canonical authority model

- `AGENTS.md` — operational entry point for coding agents.
- `PROJECT_MASTER_PLAN.md` — locked technical checkpoints and evidence.
- `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md` — MVP scope, critical path and reuse governance.
- `docs/MVP_IMPLEMENTATION_TRACKER.md` — operational current status.
- `docs/MVP_EXECUTION_PHASES.md` — detailed execution sequence/history.
- `docs/ARCHITECTURE_GUARDRAILS.md` — mandatory architecture constraints.
- `docs/CANONICAL_REUSE_MATRIX_SOURCE_LEVEL.md` — source/package/API reuse decisions.
- `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md` — locked R1 corrective evidence and live-promotion record.
- `docs/POST_MVP_R2_RUNTIME_RELIABILITY_HARDENING.md` — current R2 provider/runtime reliability evidence and promotion gate.

Coding agents read `AGENTS.md` first. If wording conflicts, the Tracker is current-status authority; this file governs locked checkpoint evidence; Architecture Guardrails govern mandatory architecture constraints.

## 2. Locked architecture authorities

The following remain canonical and must not be duplicated:

- `ServerCapabilityRegistry` — runtime capability registry.
- `CapabilityExecutionService` — capability execution gateway.
- `ConfirmationService` — HITL/confirmation authority.
- Zod — runtime validation.
- `UserFileService` — file authority.
- `FileIngestionService` — secure ingestion authority.
- Google ADK — Agent runtime.
- Gemini — AI provider.
- Current Firebase stack — persistence/storage stack.
- `LocalModuleRegistry` — canonical client module-state authority.
- `ServerModuleCatalog` — canonical server module-state authority.
- `clientCapabilityRegistry` + existing `eventBus`/`navigationService` — canonical client projection path for validated UI actions.

No second Agent runtime, file authority, capability registry/gateway, confirmation engine, module-state authority, event bus or storage subsystem may be introduced without architecture escalation.

## 3. Canonical implementation governance

Every future bounded implementation workstream uses:

**A. SOURCE AUDIT → B. REUSE AUDIT → C. NEW-CODE NECESSITY PROOF → D. TEST MINIMIZATION PLAN → E. IMPLEMENTATION PLAN**

Then:

`IMPLEMENT → CHECKER → LIVE RUNTIME (when required) → CANONICAL CI → LOCK`

Reuse priority:

`REUSE_LOCAL → EXTEND_LOCAL → REUSE_DEPENDENCY → ADAPT_EXTERNAL → BUILD MINIMUM NEW CODE`

A gate failure or unsupported seam requires STOP, not an architectural workaround. Do not re-test generic upstream behavior or unrelated locked areas unless the current change can affect them.

## 4. Canonical project status

| Area | Status | Canonical evidence |
|---|---|---|
| GĐ1 | FINAL PASS / LOCKED | single-user owner foundation |
| GĐ2 | FINAL PASS / LOCKED | Agent execution/chat runtime, SSE, cancellation, session/history, temporary chat/recovery |
| GĐ3 | FINAL PASS / LOCKED | capability execution, idempotency, native ADK tools, HITL/resume |
| GĐ4 L1/L2 | FINAL PASS / LOCKED | persistent file authority + secure end-user upload |
| GĐ4 L3A | FINAL PASS / LOCKED | attachment contract, authorization, bounded read, safe durable metadata |
| GĐ4 L3B | FINAL PASS / LOCKED | native ADK artifact materialization + run-scoped bridge + real Gemini runtime proof |
| GĐ4 L3C | FINAL PASS / LOCKED | composer attachment integration over canonical `/api/files` + `fileId` |
| GĐ4 L3D / M1 | FINAL PASS / LOCKED | real Firebase + Gemini full Document → Agent E2E |
| W4 | FINAL PASS / LOCKED | modular composition/isolation, lifecycle ordering, Task ownership |
| W5 | FINAL PASS / LOCKED | Core/App Shell UX |
| W6 | FINAL PASS / LOCKED | Home daily-dashboard UX |
| W7 | FINAL PASS / LOCKED | Agent UX |
| W8 | FINAL PASS / LOCKED | Task completion UX |
| W9 | FINAL PASS / LOCKED | Settings + local module management UX |
| W10 | FINAL PASS / LOCKED | integrated live MVP acceptance |
| W11 | FINAL PASS / LOCKED | security + operations hardening |
| W12 | FINAL PASS / LOCKED | production deployment, release smoke and final Task-modal corrective |
| R1 | FINAL PASS / LOCKED | Agent/Task trust, query, mutation, recovery, UI-action reliability and pre-promotion operability corrective; deployed source `ee570f4...`, Actions #142 SUCCESS, bounded live smoke PASS |
| R2 | **SOURCE / STATIC PASS; LIVE PROMOTION PENDING** | external provider HTTP lifetime bounded; source `83e6c89...`, Actions #152 SUCCESS |

Current deployed business capability inventory remains **12** — Memory 2, Task 5, Web Search 1, UI 4.

## 5. Locked product scope

Canonical MVP remains exactly:

**CORE WEBAPP + AGENT CHATBOX + TASK MODULE**

The deployed product is a **single-user personal app, not public**.

Deferred post-MVP modules remain: Biên tập; Quản lý tài liệu; Research; Định dạng văn bản hành chính; RAG/vector DB; connector ecosystem; marketplace/public plugin ecosystem; multi-user/team/org/billing; custom Agent runtime.

R1 and R2 do not add new product modules. R1 is a locked Agent/Task reliability corrective; R2 is a bounded provider/runtime reliability hardening pass.

A standalone File Library is not an MVP workstream.

## 6. Locked deployed behavior

The currently deployed R1 application proves:

`Firebase owner login → Vietnamese Core Shell/Home/Agent/Task/Settings → persistent/temporary Agent chat → browser upload → canonical fileId attachment → authorized run-scoped ADK artifact → Gemini reads document → deterministic Task list/search/create/update/delete → HITL deny/approve → exactly-once Task/Home refresh → reload persistence without replaying UI side effects → cancellation without stale completion → Task disable/re-enable with durable data preservation → recoverable-error continuation`.

Locked deployed properties include:

- production `OWNER_UID` fail-closed owner binding;
- canonical permission allowlisting; no arbitrary custom permission expansion;
- deny-all direct browser Firestore and Storage access;
- server-authoritative module state across Agent capabilities and Task REST APIs;
- secure file ownership and bounded reads; no durable binary/base64 history persistence;
- encrypted personal AI credentials with secret redaction;
- production diagnostic Firebase test route unavailable;
- strict Task due-date validation (`YYYY-MM-DD` or empty);
- bounded Task cursor pagination with deterministic exact-title resolution;
- Task aggregate statistics not truncated at the first 100 records;
- `system.tasks.delete` with mandatory server-authoritative HITL;
- trusted Agent context cannot be overridden by client/dynamic ADK state;
- live/durable transcripts do not expose model reasoning;
- recovered HITL remains server-revalidated;
- SSE buffering is bounded;
- server-validated UI actions go through `clientCapabilityRegistry` and are replay-safe/exactly-once per `toolCallId`;
- Task list and Home stats refresh automatically after successful Agent Task mutations;
- Task module disable hides navigation/widgets/capabilities and blocks Task REST operations while preserving data;
- Task create/edit modal respects `isOpen` and does not auto-open on route entry;
- `ErrorBoundary` telemetry conforms to the strict `/api/log-error` schema;
- unknown authenticated `/api/*` routes return JSON `404 API_ROUTE_NOT_FOUND` rather than SPA HTML;
- dependency security policy and W11 Security QA are included in canonical CI.

## 7. Release evidence

### 7.1 Canonical deployed production checkpoint

- Exact deployed source commit: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- Production URL: `https://ais-pre-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- Development URL: `https://ais-dev-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- Previous known-good deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.

### 7.2 Canonical R1 source CI

GitHub Actions run `36086993597` (#142) succeeded on the exact R1 deployed source checkpoint, including dependency policy, manifest verification, TypeScript, targeted regressions, capability tool bridge, full Vitest, QA Stage 1–5, W11 Security QA, production build and final manifest verification.

### 7.3 R1 live promotion verification

The exact source checkpoint `ee570f44516d639f7a6e00f5da3dc6427d597034` was deployed and passed the bounded real Firebase/Gemini/browser smoke:

1. persistent Agent chat stream/complete;
2. Task search distinguishes unique/ambiguous results;
3. Task update HITL deny/approve;
4. Task delete HITL deny/approve;
5. create/update/delete refreshes Task UI and Home stats exactly once;
6. restored history does not replay old UI actions;
7. Temporary Chat and cancellation remain isolated;
8. Task disable/re-enable blocks/restores Task surfaces without data loss;
9. `/api/health` healthy;
10. ErrorBoundary telemetry accepted;
11. unknown authenticated `/api/*` returns JSON 404 rather than SPA HTML.

### 7.4 R2 source verification

Validated R2 source checkpoint:

`83e6c8940f21d43c3d791446f0d8017f65b866cd`

GitHub Actions run `36089895220` (#152): **SUCCESS**.

R2 changes no Agent/Task business policy and adds no dependency. All provider-management HTTP calls are routed through one bounded request helper with a 20-second default timeout, an optional `AI_PROVIDER_TIMEOUT_MS` override constrained to 1–120 seconds, parent abort propagation, and safe `PROVIDER_TIMEOUT` / 504-style failure semantics. The focused regression test proves a non-responsive provider request is aborted deterministically.

R2 remains **source/static verified only** until bounded live promotion passes.

### 7.5 Port / ingress deployment note

The live environment exposes `PORT=8080`, while the current source binds its local server to port 3000. The current AI Studio deployment wrapper forwards hosted ingress to the local port 3000 server, and the R1 production smoke proves that mapping works for this deployment environment.

This does **not** establish hard-coded port 3000 as a portable Cloud Run contract. R2 intentionally does not change port binding without an explicit replacement AI Studio ingress contract; port binding remains deployment-portability debt if deployment moves outside the current wrapper.

## 8. R2 live promotion gate

Before R2 replaces the production anchor, deploy the exact validated R2 source checkpoint and prove on the real environment:

1. owner login succeeds;
2. Settings → Trợ lý AI loads the Gemini model list using the existing credential;
3. a valid credential/model connection test succeeds;
4. an invalid credential remains a bounded recoverable error;
5. Agent chat quick smoke remains unaffected;
6. `/api/health` remains healthy.

The provider-timeout failure itself is already behavior-tested deterministically in CI and does not need to be forced against a live provider.

## 9. Rollback / operations anchor

- Current stable deployed production checkpoint remains `ee570f44516d639f7a6e00f5da3dc6427d597034` until R2 live promotion succeeds.
- Previous known-good rollback checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, key ID and all production secrets across redeploy/rollback.
- Source rollback does not automatically delete or revert Firestore/Storage data.
- Security rules must be rolled back only with a source version known to be compatible with the target application checkpoint.
- Keep the narrow ADK→adm-zip dependency exception under its documented expiry/review policy; do not use `npm audit fix --force` as a release shortcut.

## 10. Post-MVP boundary

MVP and R1 are closed. Do not reopen locked areas for enhancement work.

R2 is the only active reliability workstream and is limited to the verified provider HTTP lifetime corrective. Future work must be explicitly classified as a reproducible regression/security corrective or a new post-MVP bounded workstream/module.

Static packaged module composition remains intentional. Do not introduce marketplace/remote plugin loading merely to replace static imports.

## 11. Current completion rule

**AGENT-WORKSPACE MVP — FINAL PASS / LOCKED.**

**POST-MVP R1 — FINAL PASS / LOCKED.**

**POST-MVP R2 — SOURCE / STATIC PASS; LIVE PROMOTION PENDING.**
