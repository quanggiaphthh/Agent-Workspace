# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.  
> Agent entry point: `AGENTS.md`.  
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.  
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.

## 1. Current canonical context

- W10 integrated Firebase/Gemini/browser acceptance: **FINAL PASS / LOCKED**.
- W11 Security / Operations Hardening: **FINAL PASS / LOCKED**.
- W11 static/security checkpoint before documentation lock: `bfd417d3d9d90f2bb7a9ca41998801c52a27aefe`.
- W11 canonical Actions: `36010878105` — run #91 — **SUCCESS**.
- GĐ1–GĐ4 / M1 and W4–W11: **FINAL PASS / LOCKED**.
- Current next workstream: **None. MVP is fully complete and locked.**
- Current capability count: **10**.
- Product mode: **single-user personal app, not public**.
- Post-MVP modules and marketplace/public plugin ecosystem remain deferred.

## 2. Mandatory implementation gates

Every bounded implementation workstream uses:

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
| W10 | MVP integrated acceptance | FINAL PASS / LOCKED | closed |
| W11 | security/operations hardening | **FINAL PASS / LOCKED** | closed |
| W12 | UAT/deployment/release | **FINAL PASS / LOCKED** | closed |

## 4. Locked MVP foundation through W11

Do not reopen without a reproducible regression:

- single-user Firebase Auth + production `OWNER_UID` binding;
- server-authoritative permissions, module state, capabilities and HITL;
- ADK/Gemini Agent execution, SSE, cancellation, session/history and Temporary Chat;
- secure file ingestion, upload, canonical `fileId`, run-scoped attachment materialization and Gemini document access;
- deny-all direct browser Firestore and Storage access;
- encrypted personal AI credentials and audit/error secret redaction;
- modular Task enable/disable/re-enable isolation with durable data preservation;
- Vietnamese Core Shell, Home, Agent, Task and Settings UX;
- Agent Task list/create/update (`system.tasks.update` requires confirmation);
- HTTP security headers, payload limits, rate limiting and runtime health controls;
- dependency high/critical CI policy with a narrow, expiring reviewed ADK/adm-zip exception.

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
- dependency audit now fails new high/critical advisories while documenting one narrow, expiring ADK→adm-zip exception;
- W11 security QA is part of canonical CI.

Canonical run #91 passed dependency policy, TypeScript, full Vitest, QA Stage 1–5, W11 Security QA, build and manifest.

## 7. W12 — current next action

W12 is release work, not feature development.

Required sequence:

1. fresh deployment preflight against canonical HEAD;
2. resolve/configure production `OWNER_UID` for the sole owner;
3. verify stable credential-encryption secret/key ID and Gemini credential availability;
4. verify Firebase Admin ADC/IAM against the intended project/database/bucket;
5. deploy Firestore + Storage rules from canonical source;
6. build/deploy the application from the exact canonical commit;
7. run final smoke/UAT on the deployed URL;
8. verify direct client Firestore/Storage access remains denied while server-mediated flows work;
9. verify health, Agent, Task, attachment, HITL, reload, Temporary Chat, cancellation and module lifecycle;
10. record deployed commit, prior known-good commit, rollback procedure and known dependency exception;
11. update final canonical release documentation/checkpoint;
12. only then declare **MVP FINAL PASS / LOCKED**.

No post-MVP module, marketplace, provider expansion or architecture redesign may enter W12.

## 8. Final completion rule

MVP is complete only when the production deployment reliably supports:

`Đăng nhập duy nhất owner → UI tiếng Việt → persistent/temporary Agent chat → upload/attach document → Gemini reads it → Agent create/update Task through canonical gateway/HITL → Task UI reflects state → reload preserves state → disable/re-enable Task without breaking Core/Agent → common-error recovery`,

with Firestore/Storage direct-client access denied and the exact deployed commit recorded.
