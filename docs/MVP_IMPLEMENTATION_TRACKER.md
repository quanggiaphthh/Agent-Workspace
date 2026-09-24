# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.  
> Agent entry point: `AGENTS.md`.  
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.  
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.

## 1. Current canonical context

- **MVP: FINAL PASS / LOCKED.**
- Canonical production/deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Canonical GitHub Actions for the deployed production checkpoint: `36015708311` — run #96 — **SUCCESS**.
- Production URL: `https://ais-pre-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- Development URL: `https://ais-dev-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- GĐ1–GĐ4 / M1 and W4–W12: **FINAL PASS / LOCKED**.
- Current next workstream: **None inside MVP. Any new feature is post-MVP and must open a new bounded workstream.**
- Current business capability count: **10**.
- Product mode: **single-user personal app, not public**.
- Post-MVP modules and marketplace/public plugin ecosystem remain deferred.
- Documentation-only commits may advance repository HEAD after the deployed checkpoint; they do **not** create a new production checkpoint.

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
- Agent Task list/create/update (`system.tasks.update` requires confirmation);
- valid `YYYY-MM-DD` Task due-date validation at server/Agent boundaries;
- production diagnostic Firebase test route unavailable;
- HTTP security headers, payload limits, rate limiting and runtime health controls;
- dependency high/critical CI policy with a narrow, expiring reviewed ADK/adm-zip exception;
- Task create/edit modal respects `isOpen` and does not auto-open when entering the Task module.

## 5. W10 evidence

W10 proved the real end-user path in AI Studio/Firebase/Gemini:

`login → Home/Agent/Task/Settings → Task list/create → Task update HITL deny/approve → reload → Temporary Chat isolation → upload/attach file → Gemini content answer → cancellation → Task disable/re-enable → recoverable-error continuation`

All 12 live acceptance scenarios passed.

## 6. W11 evidence

See `docs/W11_SECURITY_OPERATIONS_REPORT.md`.

Key corrections:

- production owner UID binding is fail-closed;
- Firebase verifier detail is not reflected to the caller;
- canonical `storage.rules` denies direct browser Storage access;
- `firebase.json` wires named Firestore rules/indexes and Storage rules;
- dependency audit fails new high/critical advisories while documenting one narrow, expiring ADK→adm-zip exception;
- W11 security QA is part of canonical CI.

## 7. W12 final release evidence

The final release sequence completed successfully:

1. canonical production checkpoint deployed: `3cb25f3c38917577e6b0106324b136a099883d9a`;
2. Firestore and Storage deny-all direct-client rules deployed successfully;
3. production `/api/health` healthy;
4. production Firebase diagnostic test route unavailable;
5. Task REST/API/Agent boundaries respect Task module enabled/disabled state;
6. invalid due dates are rejected before persistence;
7. owner login, Agent chat, attachment/Gemini, persistent/temporary chat, cancellation and Task HITL flows passed live verification;
8. Task disable/re-enable preserves durable Task data;
9. Task modal regression was corrected and redeployed: entering Task no longer opens the form automatically; create/edit/cancel/backdrop/save behavior all passed live smoke;
10. canonical GitHub Actions run #96 passed dependency policy, manifest checks, TypeScript, targeted tests, full Vitest, QA Stage 1–5, W11 Security QA and production build.

## 8. Rollback / operational anchor

- Stable deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, key ID and other production secrets across redeploy/rollback.
- Source rollback does not automatically revert or delete Firestore/Storage data.
- Rules must be rolled back only with a source version known to be compatible with the target application checkpoint.

## 9. Final completion rule — satisfied

The deployed application has now demonstrated:

`Đăng nhập duy nhất owner → UI tiếng Việt → persistent/temporary Agent chat → upload/attach document → Gemini reads it → Agent create/update Task through canonical gateway/HITL → Task UI reflects state → reload preserves state → disable/re-enable Task without breaking Core/Agent → common-error recovery`,

with Firestore/Storage direct-client access denied and the exact deployed commit recorded.

**MVP FINAL PASS / LOCKED.**
