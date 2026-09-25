# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.  
> Agent entry point: `AGENTS.md`.  
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.  
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.  
> Locked R1 report: `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md`.

## 1. Current canonical context

- **MVP: FINAL PASS / LOCKED.**
- **Post-MVP R1: FINAL PASS / LOCKED.**
- Canonical production/deployed checkpoint: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- Canonical GitHub Actions for deployed R1 source: `36086993597` — run #142 — **SUCCESS**.
- Previous known-good deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Production URL: `https://ais-pre-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- Development URL: `https://ais-dev-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- GĐ1–GĐ4 / M1, W4–W12 and R1: **FINAL PASS / LOCKED**.
- Current deployed business capability count: **12** = Memory 2 + Task 5 + Web Search 1 + UI 4.
- Product mode: **single-user personal app, not public**.
- Post-MVP product modules and marketplace/public plugin ecosystem remain deferred.
- Documentation-only commits may advance repository HEAD; they do **not** replace the deployed source checkpoint.

## 2. Mandatory implementation gates

Every future bounded post-MVP implementation workstream continues to use:

**A SOURCE AUDIT → B REUSE AUDIT → C NEW-CODE NECESSITY PROOF → D TEST MINIMIZATION PLAN → E IMPLEMENTATION PLAN**

Then:

`IMPLEMENT → CHECKER → LIVE RUNTIME (if required) → CANONICAL CI → LOCK`

Do not reopen a locked MVP/R1 area without a reproducible regression, security issue, or explicitly approved post-MVP scope.

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
| W12 | UAT/deployment/release | FINAL PASS / LOCKED | closed |
| R1 | Post-MVP Agent + Task reliability/security corrective | **FINAL PASS / LOCKED** | closed |

## 4. Locked MVP/R1 foundation

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
- Task create/edit modal respects `isOpen` and does not auto-open when entering the Task module;
- bounded Task cursor pagination while preserving complete current UI listing;
- exact-title Task resolution with explicit `none | unique | ambiguous` outcome;
- Firestore aggregate Task stats beyond the previous first-100 boundary;
- Agent Task search plus delete parity; update/delete require deterministic Task identity;
- `system.tasks.delete` is high-risk and requires server-authoritative HITL;
- Task create/update/delete requests refresh through existing UI-action semantics;
- trusted request-scoped Agent context cannot be overridden by client/dynamic ADK state;
- live and durable transcripts do not expose model reasoning;
- failed tool results remain failures in live UI and reloaded history;
- recovered HITL is only a candidate and is revalidated by server confirmation authority;
- historical/reloaded user turns with insufficient attachment provenance are replay-unsafe;
- SSE line/stream size is bounded;
- server-validated UI actions are projected through `clientCapabilityRegistry`;
- durable history cannot replay old UI actions; new live UI actions are applied at most once per `toolCallId`;
- Task list and Home stats consume the existing `canvas.refreshRequested` event;
- `ErrorBoundary` crash telemetry emits the strict `/api/log-error` contract;
- authenticated unknown `/api/*` routes fail as JSON `404 API_ROUTE_NOT_FOUND` before SPA fallback.

## 5. R1 canonical source verification

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

## 6. R1 live promotion evidence

R1 was deployed from the exact validated source checkpoint `ee570f44516d639f7a6e00f5da3dc6427d597034` and passed the bounded real Firebase/Gemini/browser promotion gate.

Passed live scenarios:

1. persistent Agent chat stream/complete;
2. Task exact-title search distinguishes unique and ambiguous outcomes;
3. Task update HITL deny/approve semantics;
4. Task delete HITL deny/approve semantics;
5. Agent Task create/update/delete refreshes Task list and Home stats exactly once;
6. restored history does not replay prior UI side effects;
7. Temporary Chat and cancellation remain isolated;
8. Task disable/re-enable hides/blocks/restores Task surfaces while preserving data;
9. `/api/health` reports healthy persistent components;
10. ErrorBoundary telemetry is accepted by `/api/log-error`;
11. authenticated unknown `/api/*` paths return JSON `404 API_ROUTE_NOT_FOUND` rather than SPA HTML.

### Port/ingress note

The live environment exposes `PORT=8080`, while the current application source listens locally on port 3000. The AI Studio deployment wrapper forwards hosted ingress to the local application port, and the live production smoke passed on this mapping. This is accepted for the current AI Studio deployment only; hard-coded port 3000 remains a portability debt for other deployment methods.

## 7. Deployment / rollback anchor

- Canonical deployed checkpoint: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- Previous known-good deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, key ID and other production secrets across redeploy/rollback.
- Source rollback does not automatically revert or delete Firestore/Storage data.
- Rules must be rolled back only with a source version known to be compatible with the target application checkpoint.

## 8. Current completion rule

The deployed application is:

**AGENT-WORKSPACE MVP — FINAL PASS / LOCKED.**

The completed corrective is:

**POST-MVP R1 — FINAL PASS / LOCKED.**

Any future work must be explicitly classified as a reproducible regression/security corrective or a new post-MVP bounded workstream/module.
