# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.  
> Agent entry point: `AGENTS.md`.  
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.  
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.

## 1. Current canonical context

- Canonical HEAD before this documentation update: `efc98156f3fe947faf66081ed8a1b87c76cee1d7`.
- Canonical Actions: `35996497865` — run #86 — **SUCCESS**.
- GĐ1–GĐ4 / M1: **FINAL PASS / LOCKED**.
- W4–W9: **FINAL PASS / LOCKED**.
- Current workstream: **W10 — MVP Integrated Acceptance — IN PROGRESS**.
- W10 static/code gate: **PASS**; live Firebase/Gemini/browser acceptance remains.
- Historical M1 capability count: **9**.
- Current capability count: **10**, adding only `system.tasks.update` during W10 to close the canonical Agent Task update parity gap.
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
| W10 | MVP integrated acceptance | **IN PROGRESS** | live Firebase/Gemini/browser acceptance |
| W11 | security/operations hardening | NOT STARTED | after W10 lock |
| W12 | UAT/deployment/release | NOT STARTED | after W11 |

## 4. Locked foundation through W9

The following are already locked and are not reopened without a reproducible regression:

- single-user owner/auth foundation;
- ADK/Gemini Agent execution, SSE, cancellation, session/history and temporary chat;
- canonical capability registry/gateway, validation, idempotency and HITL/resume;
- secure file ingestion, upload, canonical `fileId`, run-scoped attachment materialization and real Gemini document access;
- modular client/server composition and Task enable/disable/re-enable isolation;
- Vietnamese Core Shell, Home, Agent, Task and Settings UX;
- Task daily-use CRUD/filter/sort/status UX;
- Settings primary UX limited to Trợ lý AI + Module, with Google Gemini as the primary AI surface.

Historical M1 document path remains locked:

`browser select → /api/files → canonical fileId → composer attach → /api/agent/chat → authorized current-run artifact → native ADK LoadArtifactsTool → Gemini → SSE → reload/history`

## 5. W10 A–E status

### A. SOURCE AUDIT — PASS

Fresh canonical source and existing tests were audited for login/open/reload, Home, Task UI, Agent Task capabilities, HITL, module lifecycle, persistent/temporary chat, document attachment, cancellation and recovery.

Existing coverage already proves most component boundaries. No browser-test framework is installed; W10 will not add Playwright/Cypress solely for acceptance.

### B. REUSE AUDIT — PASS

W10 reuses existing:

- `UserDataService.updateTask()`;
- REST Task patch semantics;
- `ServerCapabilityRegistry`;
- `CapabilityExecutionService`;
- server-authoritative confirmation/HITL;
- existing module lifecycle authority;
- existing attachment/session/cancellation tests;
- AI Studio live environment for real Firebase/Gemini/browser proof.

### C. NEW-CODE NECESSITY PROOF — PASS

A real product gap was found: the canonical completion rule requires Agent **create/update Task**, but the Task module exposed only `system.tasks.create` and `system.tasks.list` to the Agent.

The minimum corrective added exactly one capability:

`system.tasks.update`

It reuses `UserDataService.updateTask()`, uses `tasks.write`, declares `sideEffect: mutation`, and requires server-authoritative confirmation. No new API, service, persistence layer, registry, runtime, dependency or state authority was introduced.

### D. TEST MINIMIZATION PLAN — PASS

Only Task capability contract/inventory tests were extended. Existing generic HITL/idempotency/module tests remain authoritative; no duplicate framework or broad new E2E suite was added.

### E. IMPLEMENTATION / STATIC VERIFICATION — PASS

W10 corrective chain:

- `0b7c2db5b3cb28e477ce79c1d52382996c04c95a` — `feat(tasks): add confirmed Agent task updates`;
- `716759ef4bc11b5c731a85965823e55305eb3f1f` — targeted capability contract coverage;
- `efc98156f3fe947faf66081ed8a1b87c76cee1d7` — align existing capability inventory/lifecycle assertions with Task update parity.

Canonical Actions run #86 (`35996497865`) is **SUCCESS**: TypeScript, full Vitest, QA Stage 1–5, production build and manifest verification all passed.

## 6. W10 current next action — live integrated acceptance

Run one real end-user flow in the AI Studio/Firebase/Gemini environment and prove:

1. authenticated app opens and reloads correctly with Vietnamese UI;
2. Home, Agent, Task and Settings remain usable;
3. Agent can list/query Tasks;
4. Agent can create a Task and the Task UI reflects it;
5. Agent Task update raises HITL confirmation; deny/cancel causes no mutation, approve causes the expected update;
6. persistent chat/history survives reload;
7. Temporary Chat does not enter durable conversation history;
8. upload/attach document → Gemini reads real document content;
9. cancellation does not leak a stale completion;
10. disabling Task removes Task navigation/widgets/capabilities while Core + Agent + Settings remain operational;
11. re-enabling Task restores contributions and previously saved Task data;
12. common recoverable errors leave the app usable.

Fix only reproducible blockers. Do not open W11 before W10 is locked.

## 7. Remaining release path

### W11 — Security / Operations Hardening

Re-audit auth fail-closed behavior, Firebase/Storage rules, secrets, error sanitization, dependency risk, runtime health, rate/quota behavior, recovery and operational readiness. No feature expansion.

### W12 — UAT / Deployment / Release

Run production deployment, smoke/UAT, rollback readiness and final release gate. Only W12 may conclude **MVP FINAL PASS / LOCKED**.

## 8. Final completion rule

MVP is complete only when the deployed application reliably supports:

`Đăng nhập → UI tiếng Việt → persistent/temporary Agent chat → upload/attach document → Gemini reads it → Agent create/update Task through canonical gateway/HITL → Task UI reflects state → reload preserves state → disable/re-enable Task without breaking Core/Agent → common-error recovery.`
