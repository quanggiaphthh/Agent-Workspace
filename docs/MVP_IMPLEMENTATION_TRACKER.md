# AGENT-WORKSPACE --- MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.\
> Agent entry point: `AGENTS.md`.\
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.\
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.\
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.\
> Locked R1 report:
> `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md`.\
> Locked R2 report: `docs/POST_MVP_R2_RUNTIME_RELIABILITY_HARDENING.md`.

## 1. Current canonical context

-   **MVP: FINAL PASS / LOCKED.**
-   **Post-MVP R1: FINAL PASS / LOCKED.**
-   **Post-MVP R2: FINAL PASS / LOCKED.**
-   R1 exact previously deployed stable checkpoint:
    `ee570f44516d639f7a6e00f5da3dc6427d597034`.
-   Canonical GitHub Actions for R1 source: `36086993597` --- run #142
    --- **SUCCESS**.
-   R2 implementation checkpoint:
    `83e6c8940f21d43c3d791446f0d8017f65b866cd`.
-   Canonical R2 implementation CI: `36089895220` --- run #152 ---
    **SUCCESS**.
-   Documentation closeout baseline:
    `f583ef1842bfd75cc8dbb56cee6bc9dd1eeb88c1`.
-   Closeout-baseline CI: `36097654993` --- run #156 --- **SUCCESS**,
    full Vitest **400/400 PASS**.
-   GĐ1--GĐ4 / M1, W4--W12, R1 and R2: **FINAL PASS / LOCKED**.
-   Current next gate: **None. All currently approved workstreams are
    closed.**
-   Current deployed business capability count: **12** = Memory 2 + Task
    5 + Web Search 1 + UI 4.
-   Product mode: **single-user personal app, not public**.
-   Post-MVP product modules and marketplace/public plugin ecosystem
    remain deferred.
-   Documentation-only closeout commits do **not** replace the R2
    implementation checkpoint.
-   R2 live deployment was verified to contain the R2 implementation
    behavior and passed Live Promotion; available evidence does not
    independently establish an exact current deployed commit SHA.

## 2. Mandatory implementation gates

Every future explicitly approved bounded post-MVP implementation
workstream continues to use:

**A SOURCE AUDIT → B REUSE AUDIT → C NEW-CODE NECESSITY PROOF → D TEST
MINIMIZATION PLAN → E IMPLEMENTATION PLAN**

Then:

`IMPLEMENT → CHECKER → LIVE RUNTIME (if required) → CANONICAL CI → LOCK`

Do not reopen a locked MVP/R1/R2 area without a reproducible regression,
security issue, or explicitly approved post-MVP scope.

## 3. Workstream tracker

  ------------------------------------------------------------------------------
  ID                Workstream               Status            Next gate
  ----------------- ------------------------ ----------------- -----------------
  W1                GĐ4 L3B native ADK       FINAL PASS /      closed
                    attachment               LOCKED            
                    materialization                            

  W2                GĐ4 L3C composer         FINAL PASS /      closed
                    attachment UX            LOCKED            

  W3                GĐ4 L3D real             FINAL PASS /      closed
                    Firebase/Gemini full E2E LOCKED            

  W4                Modular Foundation       FINAL PASS /      closed
                                             LOCKED            

  W5                Core/App Shell UX        FINAL PASS /      closed
                                             LOCKED            

  W6                Home UX                  FINAL PASS /      closed
                                             LOCKED            

  W7                Agent UX                 FINAL PASS /      closed
                                             LOCKED            

  W8                Task Completion UX       FINAL PASS /      closed
                                             LOCKED            

  W9                Settings/local module    FINAL PASS /      closed
                    management UX            LOCKED            

  W10               MVP integrated           FINAL PASS /      closed
                    acceptance               LOCKED            

  W11               security/operations      FINAL PASS /      closed
                    hardening                LOCKED            

  W12               UAT/deployment/release   FINAL PASS /      closed
                                             LOCKED            

  R1                Post-MVP Agent + Task    FINAL PASS /      closed
                    reliability/security     LOCKED            
                    corrective                                 

  R2                Provider/runtime         FINAL PASS /      closed
                    reliability hardening    LOCKED            
  ------------------------------------------------------------------------------

No R3 or successor workstream is opened by this tracker.

## 4. Locked MVP/R1 foundation

Do not reopen without a reproducible regression:

-   single-user Firebase Auth + production `OWNER_UID` binding;
-   server-authoritative permissions with canonical permission
    allowlisting;
-   server-authoritative module state, capabilities and HITL;
-   ADK/Gemini Agent execution, SSE, cancellation, session/history and
    Temporary Chat;
-   secure file ingestion, upload, canonical `fileId`, run-scoped
    attachment materialization and Gemini document access;
-   deny-all direct browser Firestore and Storage access;
-   encrypted personal AI credentials and audit/error secret redaction;
-   modular Task enable/disable/re-enable isolation with durable data
    preservation;
-   Task REST endpoints fail closed while the Task module is disabled;
-   Vietnamese Core Shell, Home, Agent, Task and Settings UX;
-   valid `YYYY-MM-DD` Task due-date validation at server/Agent
    boundaries;
-   production diagnostic Firebase test route unavailable;
-   HTTP security headers, payload limits, rate limiting and runtime
    health controls;
-   dependency high/critical CI policy with a narrow, expiring reviewed
    ADK/adm-zip exception;
-   Task create/edit modal respects `isOpen` and does not auto-open when
    entering the Task module;
-   bounded Task cursor pagination while preserving complete current UI
    listing;
-   exact-title Task resolution with explicit
    `none | unique | ambiguous` outcome;
-   Firestore aggregate Task stats beyond the previous first-100
    boundary;
-   Agent Task search plus delete parity; update/delete require
    deterministic Task identity;
-   `system.tasks.delete` is high-risk and requires server-authoritative
    HITL;
-   Task create/update/delete requests refresh through existing
    UI-action semantics;
-   trusted request-scoped Agent context cannot be overridden by
    client/dynamic ADK state;
-   live and durable transcripts do not expose model reasoning;
-   failed tool results remain failures in live UI and reloaded history;
-   recovered HITL is only a candidate and is revalidated by server
    confirmation authority;
-   historical/reloaded user turns with insufficient attachment
    provenance are replay-unsafe;
-   SSE line/stream size is bounded;
-   server-validated UI actions are projected through
    `clientCapabilityRegistry`;
-   durable history cannot replay old UI actions; new live UI actions
    are applied at most once per `toolCallId`;
-   Task list and Home stats consume the existing
    `canvas.refreshRequested` event;
-   `ErrorBoundary` crash telemetry emits the strict `/api/log-error`
    contract;
-   authenticated unknown `/api/*` routes fail as JSON
    `404 API_ROUTE_NOT_FOUND` before SPA fallback.

## 5. R1 deployed evidence

R1 exact previously deployed stable source checkpoint:

`ee570f44516d639f7a6e00f5da3dc6427d597034`

GitHub Actions run `36086993597` (#142): **SUCCESS**.

R1 also passed bounded live Firebase/Gemini/browser promotion covering
Agent streaming, Task unique/ambiguous search, update/delete HITL,
exactly-once Task/Home refresh, replay safety, Temporary
Chat/cancellation, Task disable/re-enable, health, ErrorBoundary
telemetry and JSON API 404 behavior.

### Port/ingress note

The live environment exposes `PORT=8080`, while the current application
source listens locally on port 3000. The AI Studio deployment wrapper
forwards hosted ingress to the local application port, and live smoke
evidence proves that mapping works. This is accepted for the current AI
Studio deployment only; hard-coded port 3000 remains a portability debt
for other deployment methods.

## 6. R2 implementation verification

R2 implementation checkpoint:

`83e6c8940f21d43c3d791446f0d8017f65b866cd`

GitHub Actions run `36089895220` (#152): **SUCCESS**.

R2 adds no dependency and changes no Agent/Task business behavior. It
bounds external provider-management HTTP lifetime through a shared
provider request policy:

-   default 20-second timeout;
-   optional `AI_PROVIDER_TIMEOUT_MS` override bounded to 1--120
    seconds;
-   invalid values fall back to the default;
-   Google, OpenAI, Anthropic, NVIDIA NIM and OpenCodeZen adapters use
    the same helper;
-   timeout becomes a safe `PROVIDER_TIMEOUT` / 504-style failure;
-   focused behavior test proves a hung request is aborted
    deterministically.

See `docs/POST_MVP_R2_RUNTIME_RELIABILITY_HARDENING.md`.

## 7. R2 live promotion and evidence

**R2 LIVE PROMOTION --- PASS / LOCKED.**

**R2 LIVE EVIDENCE CORRECTIVE --- PASS.**

Bounded real-environment evidence verified:

1.  owner access and application continuity;
2.  Settings → Trợ lý AI model list;
3.  valid credential/model provider request;
4.  Agent SSE;
5.  bounded Task/Home regression;
6.  `/api/health` healthy.

The invalid-credential negative scenario is **SAFE-NOT-RUN** to preserve
production credentials/secrets and is not recorded as PASS.

The synthetic timeout path is behavior-tested by the R2 implementation
CI and was not forced against a real provider.

## 8. Deployment / rollback anchor

-   R2 implementation checkpoint:
    `83e6c8940f21d43c3d791446f0d8017f65b866cd`.
-   R1 exact previously deployed stable/rollback checkpoint:
    `ee570f44516d639f7a6e00f5da3dc6427d597034`.
-   Documentation closeout baseline
    `f583ef1842bfd75cc8dbb56cee6bc9dd1eeb88c1` is not an implementation
    checkpoint.
-   R2 live deployment was verified to contain R2 implementation
    behavior and passed Live Promotion; the available evidence does not
    independently establish an exact current deployed commit SHA.
-   Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, key ID and other
    production secrets across redeploy/rollback.
-   Source rollback does not automatically revert or delete
    Firestore/Storage data.
-   Rules must be rolled back only with a source version known to be
    compatible with the target application checkpoint.

## 9. Current completion rule

**AGENT-WORKSPACE MVP --- FINAL PASS / LOCKED.**

**POST-MVP R1 --- FINAL PASS / LOCKED.**

**POST-MVP R2 --- FINAL PASS / LOCKED.**

All currently approved workstreams are closed. No R3 is opened by this
record.
