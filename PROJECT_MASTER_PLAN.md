# AGENT-WORKSPACE — PROJECT MASTER PLAN & PROGRESS TRACKER

> **Authority:** canonical technical checkpoints and locked evidence.  
> **Canonical production/deployed checkpoint:** `3cb25f3c38917577e6b0106324b136a099883d9a`.  
> **Canonical GitHub Actions for production checkpoint:** `36015708311` — run #96 — SUCCESS.  
> **Current validated corrective source checkpoint:** `ee570f44516d639f7a6e00f5da3dc6427d597034`.  
> **Canonical GitHub Actions for corrective source checkpoint:** `36086993597` — run #142 — SUCCESS.  
> **Current milestone:** **MVP FINAL PASS / LOCKED; POST-MVP R1 SOURCE/STATIC PASS**.  
> **Next:** bounded live deployment/smoke for R1 only; do not replace the deployed checkpoint until that gate passes.  
> Documentation-only commits may advance repository HEAD after either source checkpoint without creating a new production checkpoint.

## 1. Canonical authority model

- `AGENTS.md` — operational entry point for coding agents; routes agents to current-status, architecture and task-relevant canonical documents without duplicating them.
- `PROJECT_MASTER_PLAN.md` — locked technical checkpoints and evidence.
- `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md` — MVP scope, critical path and reuse governance.
- `docs/MVP_IMPLEMENTATION_TRACKER.md` — operational current status.
- `docs/MVP_EXECUTION_PHASES.md` — detailed execution sequence/history.
- `docs/ARCHITECTURE_GUARDRAILS.md` — mandatory architecture constraints.
- `docs/CANONICAL_REUSE_MATRIX_SOURCE_LEVEL.md` — source/package/API reuse decisions.
- `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md` — current bounded post-MVP regression/security corrective evidence and promotion gate.

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
| W12 | **FINAL PASS / LOCKED** | production deployment, release smoke and final Task-modal corrective |
| R1 | **SOURCE / STATIC PASS; LIVE PROMOTION PENDING** | Agent/Task trust, query, mutation, recovery, UI-action reliability and pre-promotion operability corrective; source `ee570f4...`, Actions #142 SUCCESS |

Capability inventory:

- deployed W12 checkpoint: **10 business capabilities**;
- validated R1 corrective source: **12 business capabilities** — Memory 2, Task 5, Web Search 1, UI 4.

## 5. Locked MVP scope

Canonical MVP remains exactly:

**CORE WEBAPP + AGENT CHATBOX + TASK MODULE**

The deployed product is a **single-user personal app, not public**.

Deferred post-MVP modules remain: Biên tập; Quản lý tài liệu; Research; Định dạng văn bản hành chính; RAG/vector DB; connector ecosystem; marketplace/public plugin ecosystem; multi-user/team/org/billing; custom Agent runtime.

R1 does not add a new product module. It is a regression/security corrective inside the already-deployed Agent/Task boundary.

A standalone File Library is not an MVP workstream.

## 6. Locked deployed end-user path and R1 delta

The currently deployed W12 application proved:

`Firebase owner login → Vietnamese Core Shell/Home/Agent/Task/Settings → persistent/temporary Agent chat → browser upload → canonical fileId attachment → authorized run-scoped ADK artifact → Gemini reads document → Agent list/create/update Task → HITL deny/approve → Task UI update → reload persistence → cancellation without stale completion → Task disable/re-enable with durable data preservation → recoverable-error continuation`

Locked deployed properties include:

- production `OWNER_UID` fail-closed owner binding;
- canonical permission allowlisting; no arbitrary custom permission expansion;
- deny-all direct browser Firestore and Storage access;
- server-authoritative module state across Agent capabilities and Task REST APIs;
- secure file ownership and bounded reads; no durable binary/base64 history persistence;
- encrypted personal AI credentials with secret redaction;
- production diagnostic Firebase test route unavailable;
- strict Task due-date validation (`YYYY-MM-DD` or empty);
- Task update through `system.tasks.update` requires server-authoritative confirmation;
- Task module disable hides navigation/widgets/capabilities and blocks Task REST operations while preserving data;
- Task create/edit modal respects `isOpen`, does not auto-open on route entry, and closes correctly via cancel/backdrop/save;
- dependency security policy and W11 Security QA included in canonical CI.

R1 source adds, but has not yet been promoted to production:

- bounded Task cursor pagination and exact-title deterministic search/disambiguation;
- aggregate Task stats beyond the first 100 records;
- `system.tasks.delete` with server-authoritative HITL;
- trusted Agent context boundary hardening;
- safe tool failure/recovery presentation and hidden reasoning suppression;
- recovered HITL candidate semantics and replay-safe durable history;
- bounded SSE buffering;
- canonical, replay-safe, exactly-once client projection of server-validated UI actions;
- automatic Task list/Home-stats refresh after successful Agent Task mutations;
- valid ErrorBoundary telemetry mapped to the strict `/api/log-error` schema;
- explicit authenticated JSON 404 handling for unknown `/api/*` routes before the SPA fallback.

## 7. Release evidence

### 7.1 Deployed production checkpoint

- Exact deployed source commit: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Production URL: `https://ais-pre-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- Development URL: `https://ais-dev-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- Firestore and Storage rules deployment: SUCCESS.

### 7.2 Deployed production CI

GitHub Actions run `36015708311` (#96) succeeded on the exact deployed production checkpoint, including:

- dependency policy;
- production manifest verification;
- TypeScript;
- targeted GĐ4 regressions;
- full Vitest;
- QA Stage 1–5;
- W11 Security QA;
- production build;
- final manifest verification.

### 7.3 Deployed live release verification

W10 live acceptance passed the full end-user flow. W12 production smoke then proved release/security boundaries. A final reproducible Task-modal regression was corrected in commit `3cb25f3c...`, deployed, and passed six focused browser scenarios: no auto-open on Task entry; create opens; cancel closes; backdrop closes; edit opens correct data and cancels safely; successful create saves and closes.

### 7.4 R1 corrective source verification

Validated R1 corrective source checkpoint:

`ee570f44516d639f7a6e00f5da3dc6427d597034`

GitHub Actions `36086993597` (#142) succeeded on that exact source checkpoint, including dependency/security policy, manifest verification, TypeScript, targeted GĐ4 gates, capability tool bridge, full Vitest, QA Stage 1–5, W11 Security QA, production build and final manifest verification.

The same run includes focused regression coverage for the ErrorBoundary telemetry contract and the JSON API-404 boundary introduced in the bounded R1.1 pre-promotion corrective.

Detailed R1 evidence: `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md`.

R1 is **not** a deployed production checkpoint yet.

## 8. Rollback / operations anchor

- Stable deployed production checkpoint remains: `3cb25f3c38917577e6b0106324b136a099883d9a` until R1 live promotion succeeds.
- Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, key ID and all production secrets across redeploy/rollback.
- Source rollback does not automatically delete or revert Firestore/Storage data.
- Security rules must be rolled back only with a source version known to be compatible with the target application checkpoint.
- Keep the narrow ADK→adm-zip dependency exception under its documented expiry/review policy; do not use `npm audit fix --force` as a release shortcut.

## 9. Post-MVP boundary

MVP is closed. Do not reopen W4–W12 for enhancement work.

Future work must be explicitly classified as one of:

1. reproducible MVP regression/security corrective; or
2. a new post-MVP bounded workstream/module.

R1 is classified under item 1 and is currently at **source/static PASS, live promotion pending**.

Static packaged module composition remains intentional. Do not introduce marketplace/remote plugin loading merely to replace static imports.

## 10. Current completion rule

The original MVP completion rule remains satisfied on the deployed W12 checkpoint:

**AGENT-WORKSPACE MVP — FINAL PASS / LOCKED.**

R1 can replace the deployed production anchor only after bounded real Firebase/Gemini/browser smoke proves the corrective end-to-end behavior documented in the R1 report.
