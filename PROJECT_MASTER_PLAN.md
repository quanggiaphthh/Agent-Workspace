# AGENT-WORKSPACE — PROJECT MASTER PLAN & PROGRESS TRACKER

> **Authority:** canonical technical checkpoints and locked evidence.  
> **Canonical production/clean HEAD:** `3e512e2279c9f1793d18082f0d7fcabc33247453`.  
> **Canonical GitHub Actions:** `35946098473` — run #43 — SUCCESS.  
> **Current milestone:** M1 Document → Agent — FINAL PASS / LOCKED.  
> **Next:** M2 / W4 — Modular Foundation.

## 1. Canonical authority model

- `AGENTS.md` — operational entry point for coding agents; routes agents to current-status, architecture and task-relevant canonical documents without duplicating them.
- `PROJECT_MASTER_PLAN.md` — locked technical checkpoints and evidence.
- `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md` — MVP scope, critical path and reuse governance.
- `docs/MVP_IMPLEMENTATION_TRACKER.md` — operational current status.
- `docs/MVP_EXECUTION_PHASES.md` — detailed remaining execution sequence.
- `docs/ARCHITECTURE_GUARDRAILS.md` — mandatory architecture constraints.
- `docs/CANONICAL_REUSE_MATRIX_SOURCE_LEVEL.md` — source/package/API reuse decisions.

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

No second Agent runtime, file authority, capability registry/gateway, confirmation engine or storage subsystem may be introduced without architecture escalation.

## 3. Canonical pre-code governance

Every remaining implementation workstream must pass:

**A. SOURCE AUDIT → B. REUSE AUDIT → C. NEW-CODE NECESSITY PROOF → D. TEST MINIMIZATION PLAN → E. IMPLEMENTATION PLAN**

Then:

`IMPLEMENT → CHECKER → LIVE RUNTIME (when required) → CANONICAL CI → LOCK`

Reuse priority:

`REUSE → CONFIGURE → ADOPT → ADAPT → BUILD NEW`

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
| GĐ4 L3D / M1 | **FINAL PASS / LOCKED** | real Firebase + Gemini full Document → Agent E2E; canonical Actions #43 SUCCESS |
| M2 / W4 | **NEXT** | module composition/isolation hardening |
| W5–W12 | PLANNED | governed by Completion Plan + Execution Phases |

Capability count remains **9** business capabilities through M1.

## 5. M1 — Document → Agent — FINAL PASS / LOCKED

Canonical user path is proven:

`browser File → /api/files → canonical fileId → composer attachment → /api/agent/chat → authorized current-run artifact → native ADK LoadArtifactsTool → Gemini → SSE → reload/history`

Locked properties include:

- opaque canonical `fileId` attachment references;
- current-run whitelist and same-owner-unattached/foreign/stale rejection;
- lazy bounded binary reads with cancellation propagation;
- native public ADK Runner/artifact integration; no Runner bypass or second Gemini loop;
- composer upload reuses existing `fileUploadClient` and `/api/files`;
- no browser base64/data URL canonical transport;
- no durable binary/base64/storage authority leakage;
- persistent and temporary chat semantics preserved;
- real Gemini content-dependent document read proven;
- canonical GitHub Actions run `35946098473` (#43) SUCCESS on clean HEAD `3e512e2279c9f1793d18082f0d7fcabc33247453`.

M1 is closed. L3A–L3D are not reopened without a reproducible regression/blocker.

## 6. MVP scope

Canonical MVP remains exactly:

**CORE WEBAPP + AGENT CHATBOX + TASK MODULE**

Deferred post-MVP: Biên tập; Quản lý tài liệu; Research; Định dạng văn bản hành chính; RAG/vector DB; connector ecosystem; marketplace; multi-user administration; custom Agent runtime.

A standalone File Library is not an MVP workstream.

## 7. Remaining milestones

- **M2 — Modular Foundation:** W4 composition/isolation hardening.
- **M3 — Product UX:** W5 App Shell → W6 Home → W7 Agent → W8 Task → W9 Settings/module management.
- **M4 — Release:** W10 integrated acceptance → W11 security/operations hardening → W12 UAT/deployment/release.

Canonical remaining dependency spine:

`W4 → W5 → W6 → W7 → W8 → W9 → W10 → W11 → W12`

## 8. Current next action — W4A

Perform source/architecture/reuse audit of the existing module composition and Task ownership boundaries. Reuse current registries and module infrastructure. Do not introduce a marketplace, remote plugin loader, generic DI framework, second registry or second runtime.

W4 must prove Task can be enabled, disabled and re-enabled without breaking Core or Agent, while preserving Task durable data and capability/UI isolation.

## 9. Final completion rule

MVP is complete only when the deployed application reliably supports:

`Đăng nhập → UI tiếng Việt → persistent/temporary Agent chat → upload/attach document → Gemini reads it → Agent create/update Task through canonical gateway/HITL → Task UI reflects state → reload preserves state → disable/re-enable Task without breaking Core/Agent → common-error recovery.`

Only W12 with real UAT/deployment evidence may conclude **MVP FINAL PASS / LOCKED**.