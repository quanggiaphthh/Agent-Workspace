# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.  
> Agent entry point: `AGENTS.md`.  
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.  
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.  
> Locked R1 report: `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md`.  
> Current R2 report: `docs/POST_MVP_R2_RUNTIME_RELIABILITY_HARDENING.md`.

## 1. Current canonical context

- **MVP: FINAL PASS / LOCKED.**
- **Post-MVP R1: FINAL PASS / LOCKED.**
- Canonical production/deployed checkpoint: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- Canonical GitHub Actions for deployed R1 source: `36086993597` — run #142 — **SUCCESS**.
- Current validated R2 source checkpoint: `83e6c8940f21d43c3d791446f0d8017f65b866cd`.
- Canonical GitHub Actions for R2 source: `36089895220` — run #152 — **SUCCESS**.
- **R2 status: SOURCE / STATIC PASS; LIVE PROMOTION PENDING.**
- Previous known-good deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Production URL: `https://ais-pre-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- Development URL: `https://ais-dev-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- GĐ1–GĐ4 / M1, W4–W12 and R1: **FINAL PASS / LOCKED**.
- Current next gate: **bounded live deployment/smoke for R2 only**.
- Current deployed business capability count: **12** = Memory 2 + Task 5 + Web Search 1 + UI 4.
- Product mode: **single-user personal app, not public**.
- Post-MVP product modules and marketplace/public plugin ecosystem remain deferred.
- Documentation-only commits may advance repository HEAD; they do **not** replace source or deployed checkpoints.

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
| R1 | Post-MVP Agent + Task reliability/security corrective | FINAL PASS / LOCKED | closed |
| R2 | Provider/runtime reliability hardening | **SOURCE / STATIC PASS** | deploy candidate + bounded live smoke |

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

## 5. R1 deployed evidence

R1 deployed source checkpoint:

`ee570f44516d639f7a6e00f5da3dc6427d597034`

GitHub Actions run `36086993597` (#142): **SUCCESS**.

R1 also passed bounded live Firebase/Gemini/browser promotion covering Agent streaming, Task unique/ambiguous search, update/delete HITL, exactly-once Task/Home refresh, replay safety, Temporary Chat/cancellation, Task disable/re-enable, health, ErrorBoundary telemetry and JSON API 404 behavior.

### Port/ingress note

The live environment exposes `PORT=8080`, while the current application source listens locally on port 3000. The AI Studio deployment wrapper forwards hosted ingress to the local application port, and R1 live smoke passed on this mapping. This is accepted for the current AI Studio deployment only; hard-coded port 3000 remains a portability debt for other deployment methods.

## 6. R2 source verification

Validated R2 source checkpoint:

`83e6c8940f21d43c3d791446f0d8017f65b866cd`

GitHub Actions run `36089895220` (#152): **SUCCESS**.

R2 adds no dependency and changes no Agent/Task business behavior. It bounds external provider-management HTTP lifetime through a shared provider request policy:

- default 20-second timeout;
- optional `AI_PROVIDER_TIMEOUT_MS` override bounded to 1–120 seconds;
- invalid values fall back to the default;
- Google, OpenAI, Anthropic, NVIDIA NIM and OpenCodeZen adapters use the same helper;
- timeout becomes a safe `PROVIDER_TIMEOUT` / 504-style failure;
- focused behavior test proves a hung request is aborted deterministically.

See `docs/POST_MVP_R2_RUNTIME_RELIABILITY_HARDENING.md`.

## 7. R2 live promotion gate

Do not replace the production anchor merely because CI is green. Promotion requires bounded live verification on the real environment:

1. deploy exact R2 source checkpoint;
2. owner login succeeds;
3. Settings → Trợ lý AI loads the Gemini model list with the existing credential;
4. valid credential/model connection test succeeds;
5. an invalid credential remains a bounded recoverable error;
6. Agent chat quick smoke remains unaffected;
7. `/api/health` remains healthy.

The synthetic timeout path is already behavior-tested in CI and does not need to be forced against a real provider.

## 8. Deployment / rollback anchor

- Canonical deployed checkpoint remains: `ee570f44516d639f7a6e00f5da3dc6427d597034` until R2 live promotion passes.
- Previous known-good deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, key ID and other production secrets across redeploy/rollback.
- Source rollback does not automatically revert or delete Firestore/Storage data.
- Rules must be rolled back only with a source version known to be compatible with the target application checkpoint.

## 9. Current completion rule

The deployed application remains:

**AGENT-WORKSPACE MVP — FINAL PASS / LOCKED.**

**POST-MVP R1 — FINAL PASS / LOCKED.**

The current bounded reliability workstream is:

**POST-MVP R2 — SOURCE / STATIC PASS; LIVE PROMOTION PENDING.**
