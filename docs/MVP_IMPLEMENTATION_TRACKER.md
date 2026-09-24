# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.  
> Agent entry point: `AGENTS.md`.  
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.  
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.

## 1. Current canonical context

- Canonical code/live checkpoint before this documentation update: `fe74182aea99049859d29717248bf78f64deec1c`.
- Canonical Actions: `35996785606` — run #87 — **SUCCESS**.
- GĐ1–GĐ4 / M1: **FINAL PASS / LOCKED**.
- W4–W10: **FINAL PASS / LOCKED**.
- W10 live Firebase + Gemini + browser integrated acceptance: **PASS**.
- Current next workstream: **W11 — Security / Operations Hardening**.
- Historical M1 capability count: **9**.
- Current capability count: **10**, adding only `system.tasks.update` during W10 to close Agent Task update parity.
- Product mode: **single-user personal app, not public**.
- Post-MVP modules and marketplace/public plugin ecosystem remain deferred.

## 2. Mandatory implementation gates

Every implementation workstream uses:

**A SOURCE AUDIT → B REUSE AUDIT → C NEW-CODE NECESSITY PROOF → D TEST MINIMIZATION PLAN → E IMPLEMENTATION PLAN**

Then:

`IMPLEMENT → CHECKER → LIVE RUNTIME (if required) → CANONICAL CI → LOCK`

Do not re-run unrelated locked tests unless the current change can affect their boundary.

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
| W10 | MVP integrated acceptance | **FINAL PASS / LOCKED** | closed |
| W11 | security/operations hardening | **NEXT / AUDIT** | A–E hardening audit |
| W12 | UAT/deployment/release | NOT STARTED | after W11 lock |

## 4. Locked foundation through W10

The following are locked and are not reopened without a reproducible regression:

- single-user owner/auth foundation;
- ADK/Gemini Agent execution, SSE, cancellation, session/history and temporary chat;
- canonical capability registry/gateway, validation, idempotency and HITL/resume;
- secure file ingestion, upload, canonical `fileId`, run-scoped attachment materialization and real Gemini document access;
- modular client/server composition and Task enable/disable/re-enable isolation;
- Vietnamese Core Shell, Home, Agent, Task and Settings UX;
- Task daily-use CRUD/filter/sort/status UX;
- Settings primary UX limited to Trợ lý AI + Module, with Google Gemini as the primary AI surface;
- Agent Task list/create/update through the canonical gateway, with `system.tasks.update` protected by server-authoritative confirmation;
- integrated real-environment acceptance across login/reload, Home, Agent, Task, Settings, persistent/temporary chat, file-to-Gemini, cancellation, module disable/re-enable and recoverable errors.

Historical M1 document path remains locked:

`browser select → /api/files → canonical fileId → composer attach → /api/agent/chat → authorized current-run artifact → native ADK LoadArtifactsTool → Gemini → SSE → reload/history`

## 5. W10 completion evidence

### A. SOURCE AUDIT — PASS

Fresh canonical source and existing tests were audited for login/open/reload, Home, Task UI, Agent Task capabilities, HITL, module lifecycle, persistent/temporary chat, document attachment, cancellation and recovery.

### B. REUSE AUDIT — PASS

W10 reused existing `UserDataService.updateTask()`, REST Task patch semantics, `ServerCapabilityRegistry`, `CapabilityExecutionService`, server-authoritative confirmation/HITL, existing module lifecycle authority, attachment/session/cancellation tests and the AI Studio live environment.

### C. NEW-CODE NECESSITY PROOF — PASS

The only real product gap was Agent Task update parity. The minimum corrective added exactly one capability: `system.tasks.update`.

No new API, service, persistence layer, registry, runtime, dependency or state authority was introduced.

### D. TEST MINIMIZATION — PASS

Only Task capability contract/inventory/lifecycle assertions were extended. No browser-test framework or duplicate E2E suite was added.

### E. STATIC + LIVE VERIFICATION — PASS

W10 corrective chain:

- `0b7c2db5b3cb28e477ce79c1d52382996c04c95a` — `feat(tasks): add confirmed Agent task updates`;
- `716759ef4bc11b5c731a85965823e55305eb3f1f` — targeted capability contract coverage;
- `efc98156f3fe947faf66081ed8a1b87c76cee1d7` — align existing capability inventory/lifecycle assertions with Task update parity.

Canonical Actions run #86 (`35996497865`) passed TypeScript, full Vitest, QA Stage 1–5, production build and manifest verification. Documentation run #87 (`35996785606`) also passed.

Live AI Studio/Firebase/Gemini acceptance passed all 12 scenarios:

1. login + reload session restoration;
2. Home / Agent / Task / Settings usability;
3. Agent Task listing;
4. Agent Task creation reflected in UI;
5. Task update HITL deny = no mutation, approve = mutation;
6. persistent task/chat state survives reload;
7. Temporary Chat leaves no durable history;
8. real file upload/attach → Gemini content-dependent answer;
9. cancellation produces no stale completion;
10. disabling Task removes Task UI/capabilities while Core + Agent + Settings remain usable;
11. re-enabling Task restores contributions and durable Task data;
12. recoverable errors leave the application usable.

## 6. Current next action — W11 Security / Operations Hardening

W11 is **hardening only**, not feature development.

Audit fresh canonical source and deployment assumptions for:

1. authentication and authorization fail-closed behavior;
2. Firebase Auth / Firestore / Storage rules and server-only authority boundaries;
3. credential/API key storage, redaction and client exposure risk;
4. HTTP security headers, request limits and rate limiting;
5. error sanitization and audit-log secret redaction;
6. dependency vulnerabilities and whether remediation can be done without destabilizing the locked runtime;
7. runtime health/readiness, persistence degradation behavior and fail-closed module/capability behavior;
8. Gemini quota/rate-limit/provider failure behavior for the free-tier personal deployment;
9. timeout, cancellation, process-fatal handling and recovery;
10. backup/data recovery and operational rollback assumptions for single-user use;
11. production environment/config validation and accidental secret/config leakage;
12. logging/observability sufficient to diagnose failures without exposing sensitive content.

Prefer configuration, existing controls and narrowly scoped fixes. Do not add a new security framework, monitoring platform, auth system, provider or feature unless a verified blocker requires it.

## 7. Remaining release path

### W11 — Security / Operations Hardening

Complete A–E audit, implement only verified hardening gaps, run targeted security/operations regression plus canonical CI, and lock W11.

### W12 — UAT / Deployment / Release

Run production deployment, final smoke/UAT, rollback readiness and release gate. Only W12 may conclude **MVP FINAL PASS / LOCKED**.

## 8. Final completion rule

MVP is complete only when the deployed application reliably supports:

`Đăng nhập → UI tiếng Việt → persistent/temporary Agent chat → upload/attach document → Gemini reads it → Agent create/update Task through canonical gateway/HITL → Task UI reflects state → reload preserves state → disable/re-enable Task without breaking Core/Agent → common-error recovery.`
