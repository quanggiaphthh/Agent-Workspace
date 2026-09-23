# AGENT-WORKSPACE --- PROJECT MASTER PLAN & PROGRESS TRACKER

> **Authority:** historical/canonical technical checkpoint authority.\
> **Planning repository HEAD audited:**
> `be6459f250242e5c1201c65680a4dc07d842993a` ---
> `docs: align MVP tracker with reuse-first completion plan`.\
> **Latest production implementation checkpoint:**
> `1ae1a7431b58d54b7996d3cded5093e26b534352` --- GĐ4 L3A FINAL PASS /
> LOCKED.\
> **Canonical GitHub Actions:** `35658931580` --- SUCCESS.\
> Documentation HEAD is not a production implementation checkpoint.

## 1. Canonical authority model

-   `PROJECT_MASTER_PLAN.md` --- historical/canonical technical
    checkpoints and locked evidence.
-   `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md` --- MVP scope, critical
    path and reuse governance.
-   `docs/MVP_IMPLEMENTATION_TRACKER.md` --- operational current status.
-   `docs/MVP_EXECUTION_PHASES.md` --- detailed decomposition of
    remaining MVP implementation.
-   `docs/ARCHITECTURE_GUARDRAILS.md` --- mandatory architecture
    constraints.
-   `docs/CANONICAL_REUSE_MATRIX_SOURCE_LEVEL.md` --- source/package/API
    reuse decisions.

No two documents are current-status authorities. If wording conflicts,
the operational status is taken from the Tracker, while locked technical
evidence remains governed here.

## 2. Locked architecture authorities

The following remain canonical and must not be duplicated:

-   `ServerCapabilityRegistry` --- runtime capability registry.
-   `CapabilityExecutionService` --- capability execution gateway.
-   `ConfirmationService` --- HITL/confirmation authority.
-   Zod --- runtime validation.
-   `UserFileService` --- file authority.
-   `FileIngestionService` --- secure ingestion authority.
-   Google ADK --- Agent runtime.
-   Gemini --- AI provider.
-   Current Firebase stack --- persistence/storage stack.

No second Agent runtime, file authority, capability registry/gateway,
confirmation engine or storage subsystem may be introduced without an
explicit architecture escalation.

## 3. Canonical pre-code governance

Every remaining implementation workstream must pass the same five gates
before production code:

**A. SOURCE AUDIT** --- fresh HEAD; relevant current source; existing
authority; existing tests/integration; exact current dependency
versions.

**B. REUSE AUDIT** --- existing project code; installed dependencies;
official SDK/framework APIs; mature upstream GitHub
implementations/patterns; license/deployment compatibility where
relevant.

**C. NEW-CODE NECESSITY PROOF** --- requirement; reuse options checked;
why direct reuse/configuration is insufficient; smallest
Agent-Workspace-owned code required.

**D. TEST MINIMIZATION PLAN** --- upstream behavior not re-tested;
app-owned boundaries to test; locked regressions; runtime/E2E evidence
required.

**E. IMPLEMENTATION PLAN** --- files/responsibilities; dependency/order;
fail-closed/rollback behavior; exit criteria; explicit non-goals.

Only after A--E may a workstream proceed:

`IMPLEMENT → CHECKER → LIVE RUNTIME (when required) → CANONICAL CI → LOCK`

A gate failure or unsupported seam requires STOP, not an architectural
workaround.

## 4. Canonical project status

| Area | Status | Canonical evidence |
|---|---|---|
| GĐ1 | FINAL PASS / LOCKED | single-user owner foundation |
| GĐ2 | FINAL PASS / LOCKED | Agent execution/chat runtime, SSE, cancellation, session/history, temporary chat/recovery |
| GĐ3 | FINAL PASS / LOCKED | capability execution, idempotency, native ADK tools, HITL/resume |
| GĐ4 L1/L2 | FINAL PASS / LOCKED | persistent file authority + secure end-user upload |
| GĐ4 L3A | FINAL PASS / LOCKED | production checkpoint `1ae1a7431b58d54b7996d3cded5093e26b534352`; Actions `35658931580` SUCCESS |
| GĐ4 L3B | **DESIGN APPROVED / PRE-IMPLEMENTATION REUSE AUDIT NEXT** | implementation has not started |
| GĐ4 L3C | PLANNED | starts only after L3B lock |
| GĐ4 L3D | PLANNED | full user E2E after L3C |
| MVP W4--W12 | PLANNED | governed by Completion Plan + Execution Phases |

Capability count at the L3A checkpoint remains **9**.

## 5. GĐ1--GĐ3 locked invariants

GĐ1--GĐ3 remain locked. Later work must preserve:

-   single-user owner semantics;
-   `AgentChatThread → AdkRuntimeProvider → /api/agent/chat → RootAgent → Gemini → SSE`;
-   strict chat request/SSE lifecycle;
-   cancellation/timeout/stale-run isolation;
-   server-persisted ADK session/history;
-   temporary chat semantics and recovery;
-   canonical capability registry/execution/HITL authorities;
-   durable mutation idempotency;
-   native ADK FunctionTool bridge.

Locked phases are not refactored unless a reproducible blocker requires
it.

## 6. GĐ4 --- current document-to-Agent frontier

### 6.1 L1/L2 --- FINAL PASS / LOCKED

The canonical file/storage and secure upload path is locked:

`browser → /api/files → FileIngestionService → UserFileService → Firebase`

Browser code does not become a direct Firebase Storage authority.

### 6.2 L3A --- FINAL PASS / LOCKED

Canonical production checkpoint:

`1ae1a7431b58d54b7996d3cded5093e26b534352`

Canonical Actions:

`35658931580` --- SUCCESS.

Locked L3A semantics include strict opaque `fileId` attachment
references, owner authorization, bounded reads, safe durable metadata
separated from run-scoped bytes, per-file/aggregate bounds, no durable
binary/base64 and unchanged capability count 9.

L3A did **not** implement model invocation materialization or composer
attachment UX.

### 6.3 L3B --- Native ADK attachment materialization

**Status: DESIGN APPROVED / PRE-IMPLEMENTATION REUSE AUDIT NEXT.**

Design direction is approved. Production implementation has not started.
Exact installed ADK audit is mandatory before code.

#### L3B decision table

| Exact installed ADK finding | Decision |
|---|---|
| Supported Runner DI + artifactService seam + native `LoadArtifactsTool`/`processLlmRequest` seam | Use native ADK; implement the smallest thin adapter. |
| Native API is usable but needs small glue | Record NEW-CODE NECESSITY PROOF; implement thin adapter only. |
| Required seam is private/internal/unsupported/incompatible with exact installed version | **STOP --- BLOCKED / ARCHITECTURE ESCALATION.** |
| Solution requires Runner bypass, custom Gemini call loop, durable media-bearing history mutation, second artifact framework, second file authority or second Agent runtime | **STOP.** |
| Upstream HEAD/docs differ from installed package | **Exact installed package wins.** |

#### L3B runtime probe boundary

L3B proves only the artifact/model runtime boundary:

`known canonical uploaded file → current-run authorized artifact mapping → native ADK artifact loading → Gemini receives/reads attachment → content-dependent response`

It must also prove same-owner unattached/foreign/stale-turn rejection,
bounded lazy read, cancellation, no durable binary/base64, no
storage-authority leakage, no Runner bypass, capability count 9, and no
regression of persistent/temporary/HITL semantics.

L3B is **not** the full browser-composer E2E.

### 6.4 L3C --- Composer attachment UX

L3C owns:

`browser File → existing /api/files → canonical fileId → assistant-ui attachment lifecycle → chat request attachment reference`

Required UX: Vietnamese; pending/complete/remove/retry;
stale/abort/error handling; no browser base64 as canonical transport.

### 6.5 L3D --- Full Firebase + Gemini E2E

L3D is the full user workflow:

`browser select → upload → fileId → composer attach → send → server authorization → run-scoped artifact materialization → Gemini understands file → SSE → reload/history`

It additionally verifies temporary chat, cancellation,
malformed/foreign/oversized cases, no binary/base64 or storage-path
leak, and recovery/error behavior.

L3D is primarily integration/verification, not a feature-building phase.

## 7. MVP scope reconciliation

Canonical MVP is exactly:

**CORE WEBAPP + AGENT CHATBOX + TASK MODULE**

The former GĐ4 planning for a standalone File Library, generic
authorized file operations and a broad file-lifecycle product is
**superseded for MVP execution** unless a concrete MVP acceptance
blocker proves one is required. File security/lifecycle defects may be
fixed inside the owning phase, but a File Library is not an MVP
workstream.

Post-MVP and not opened by this plan:

-   Biên tập;
-   Quản lý tài liệu;
-   Research;
-   Định dạng văn bản hành chính;
-   RAG/vector DB;
-   connector ecosystem;
-   marketplace;
-   multi-user administration;
-   custom Agent runtime.

## 8. Remaining MVP milestones

Detailed phase/lượt decomposition is canonical in
`docs/MVP_EXECUTION_PHASES.md`.

-   **M1 --- Document → Agent:** L3B → L3C → L3D.
-   **M2 --- Modular Foundation:** W4 composition/isolation hardening.
-   **M3 --- Product UX:** W5 App Shell → W6 Home → W7 Agent → W8 Task →
    W9 Settings/module management.
-   **M4 --- Release:** W10 integrated acceptance → W11
    security/operations hardening → W12 UAT/deployment/release.

Canonical dependency spine:

`L3B → L3C → L3D → W4 → W5 → W6 → W7 → W8 → W9 → W10 → W11 → W12`

After W4, selected UX discovery may be parallelized, but the above
remains the checker-controlled canonical execution order.

## 9. Verification rule

Documentation-only planning updates do not change production checkpoint,
manifest, tests, dependencies, workflows or runtime.

A production phase may be locked only after its defined
application-owned tests, locked regressions, required live/runtime
evidence and canonical CI have passed. `MVP FINAL PASS / LOCKED` is
reserved for W12 after real UAT/deployment evidence.
