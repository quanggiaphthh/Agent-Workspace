# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.  
> Agent entry point: `AGENTS.md`.  
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.  
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.  
> Current corrective report: `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md`.

## 1. Current canonical context

- **MVP: FINAL PASS / LOCKED.**
- Canonical production/deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Canonical GitHub Actions for deployed production: `36015708311` — run #96 — **SUCCESS**.
- Current validated R1 corrective source checkpoint: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- Canonical GitHub Actions for R1 source: `36086993597` — run #142 — **SUCCESS**.
- R1 status: **SOURCE / STATIC PASS; LIVE PROMOTION PENDING**.
- Production URL: `https://ais-pre-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- Development URL: `https://ais-dev-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- GĐ1–GĐ4 / M1 and W4–W12: **FINAL PASS / LOCKED**.
- Current next gate: **bounded real Firebase/Gemini/browser deployment smoke for R1 only**.
- Deployed W12 capability count: **10**; validated R1 source capability count: **12**.
- Product mode: **single-user personal app, not public**.
- Post-MVP product modules and marketplace/public plugin ecosystem remain deferred.
- Documentation-only commits may advance repository HEAD; they do **not** replace either source or deployed checkpoints.

## 2. Mandatory implementation gates

Every bounded post-MVP implementation workstream continues to use:

**A SOURCE AUDIT → B REUSE AUDIT → C NEW-CODE NECESSITY PROOF → D TEST MINIMIZATION PLAN → E IMPLEMENTATION PLAN**

Then:

`IMPLEMENT → CHECKER → LIVE RUNTIME (if required) → CANONICAL CI → LOCK`

Do not reopen a locked MVP area without a reproducible regression, security issue, or explicitly approved post-MVP scope.

## 3. Workstream tracker

| ID | Workstream | Status | Next gate |
|---|---|---|---|
| W1 | GĐ4 L3B native ADK attachment materialization | FINAL PASS / LOCKED | closed |
| W2 | GĐ4 L3C composer attachment UX | FINAL PASS / LOCKED | closed |
| W3 | GĐ4 L3D real Firebase/Gemini full E2E | FINAL PASS / LOCKED | closed |
| W4 | Modular Foundation | FINAL PASS / LOCKED | closed |
| W5 | Core/App Shell UX | FINAL PASS / LOCKED | closed |
| W6 | Home UX | FINAL PASS / LOCKED | closed |
| W7 | Agent UX | FINAL PASS / LOCKED | closed |
| W8 | Task Completion UX | FINAL PASS / LOCKED | closed |
| W9 | Settings/local module management UX | FINAL PASS / LOCKED | closed |
| W10 | MVP integrated acceptance | FINAL PASS / LOCKED | closed |
| W11 | security/operations hardening | FINAL PASS / LOCKED | closed |
| W12 | UAT/deployment/release | **FINAL PASS / LOCKED** | closed |
| R1 | Post-MVP Agent + Task reliability/security corrective | **SOURCE / STATIC PASS** | deploy candidate + bounded live smoke |

## 4. Locked MVP foundation

Do not reopen without a reproducible regression:

- single-user Firebase Auth + production `OWNER_UID` binding;
- server-authoritative permissions with canonical permission allowlisting;
- server-authoritative module state, capabilities and HITL;
- ADK/Gemini Agent execution, SSE, cancellation, session/history and Temporary Chat;
- secure file ingestion, upload, canonical `fileId`, run-scoped attachment materialization and Gemini document access;
- deny-all direct browser Firestore and Storage access;
- encrypted personal AI credentials and audit/error secret redaction;
- modular Task enable/disable/re-enable isolation with durable data preservation;
- Task REST endpoints fail closed while the Task module is disabled;
- Vietnamese Core Shell, Home, Agent, Task and Settings UX;
- valid `YYYY-MM-DD` Task due-date validation at server/Agent boundaries;
- production diagnostic Firebase test route unavailable;
- HTTP security headers, payload limits, rate limiting and runtime health controls;
- dependency high/critical CI policy with a narrow, expiring reviewed ADK/adm-zip exception;
- Task create/edit modal respects `isOpen` and does not auto-open when entering the Task module.

## 5. R1 corrective source scope

R1 is a regression/security corrective, not a new product feature workstream. It reuses existing authorities and adds no dependency or second runtime/registry/storage system.

Validated source behavior now includes:

- bounded Task cursor pagination while preserving complete current UI listing;
- exact-title Task resolution with explicit `none | unique | ambiguous` outcome;
- Firestore aggregate Task stats beyond the previous first-100 boundary;
- Agent Task search plus delete parity; update/delete require deterministic Task identity;
- `system.tasks.delete` is high-risk and requires server-authoritative HITL;
- Task create/update/delete outputs request refresh through existing UI-action semantics;
- trusted request-scoped Agent context cannot be overridden by client/dynamic ADK state;
- live and durable transcripts do not expose model reasoning;
- failed tool results remain failures in live UI and reloaded history;
- recovered HITL is only a candidate and is revalidated by server confirmation authority;
- historical/reloaded user turns with insufficient attachment provenance are replay-unsafe;
- SSE line/stream size is bounded;
- server-validated UI actions are projected through `clientCapabilityRegistry`, not direct alternate UI authority;
- durable history cannot replay old UI actions; new live UI actions are applied at most once per `toolCallId`;
- Task list and Home stats consume the existing `canvas.refreshRequested` event;
- `ErrorBoundary` crash telemetry now emits the strict `/api/log-error` contract rather than a rejected legacy payload;
- authenticated unknown `/api/*` routes now fail as JSON `404 API_ROUTE_NOT_FOUND` before SPA fallback.

Current R1 business capability inventory: **12** = Memory 2 + Task 5 + Web Search 1 + UI 4.

## 6. R1 verification evidence

Corrective source checkpoint:

`ee570f44516d639f7a6e00f5da3dc6427d597034`

GitHub Actions run `36086993597` (#142): **SUCCESS**.

Passed gates:

- dependency/security policy;
- production manifest verification;
- TypeScript;
- targeted GĐ4 tests;
- capability tool bridge;
- full Vitest;
- QA Stage 1–5;
- W11 Security QA;
- production build;
- final manifest verification.

Focused R1.1 regression coverage additionally locks the ErrorBoundary telemetry payload shape and JSON API 404 boundary.

See `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md` for detailed Pass A–F evidence.

## 7. R1 live promotion gate

Do not declare the R1 source as deployed merely because CI is green. Promotion requires a bounded live run against the real Firebase/Gemini/browser environment proving:

1. persistent Agent chat streams normally;
2. Task title search distinguishes unique/ambiguous outcomes;
3. Task update/delete HITL deny and approve paths are correct;
4. Agent create/update/delete refreshes Task list and Home stats exactly once;
5. loading/restoring history does not replay old navigation/refresh/notification effects;
6. Temporary Chat and cancellation remain isolated;
7. Task disable/re-enable still blocks/restores Task surfaces without data loss;
8. `/api/health` remains healthy with persistent components;
9. client ErrorBoundary reports a valid bounded telemetry payload when exercised;
10. authenticated unknown API paths return JSON 404 and never SPA HTML.

Only after those checks pass may `PROJECT_MASTER_PLAN.md` replace the deployed production checkpoint and rollback anchor.

## 8. W10–W12 deployed evidence

The currently deployed W12 checkpoint already proved the original MVP release path:

`login → Home/Agent/Task/Settings → Task list/create/update HITL → reload → Temporary Chat → upload/attach → Gemini document read → cancellation → Task disable/re-enable → recoverable-error continuation`.

It also passed production rules/security smoke and the final Task create/edit modal corrective.

R1 source validation does not invalidate that deployment evidence; it remains the rollback anchor until R1 is promoted.

## 9. Rollback / operational anchor

- Stable deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, key ID and other production secrets across redeploy/rollback.
- Source rollback does not automatically revert or delete Firestore/Storage data.
- Rules must be rolled back only with a source version known to be compatible with the target application checkpoint.

## 10. Current completion rule

The deployed application remains:

**MVP FINAL PASS / LOCKED.**

The separate R1 corrective is:

**SOURCE / STATIC PASS — LIVE PROMOTION PENDING.**
