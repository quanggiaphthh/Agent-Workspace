# AGENT-WORKSPACE --- MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.\
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.\
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.\
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.

## 1. Status vocabulary

- `NOT STARTED`
- `DISCOVERY`
- `DESIGN APPROVED / PRE-IMPLEMENTATION REUSE AUDIT NEXT`
- `IMPLEMENTING`
- `VERIFICATION PENDING`
- `FINAL PASS / LOCKED`
- `BLOCKED`

## 2. Current canonical context

- Repository planning HEAD audited: `be6459f250242e5c1201c65680a4dc07d842993a`.
- Latest production implementation checkpoint: `1ae1a7431b58d54b7996d3cded5093e26b534352`.
- Canonical Actions: `35658931580` --- SUCCESS.
- GĐ4 L3A: FINAL PASS / LOCKED.
- Capability count at L3A: 9.
- GĐ4 L3B: **DESIGN APPROVED / PRE-IMPLEMENTATION REUSE AUDIT NEXT**.
- L3B implementation has not started.
- L3C/L3D: NOT STARTED.
- Post-MVP modules remain deferred.

## 3. Mandatory pre-code gates

Every implementation phase/lượt references the canonical five gates:

**A SOURCE AUDIT → B REUSE AUDIT → C NEW-CODE NECESSITY PROOF → D TEST MINIMIZATION PLAN → E IMPLEMENTATION PLAN**

Only after E may work proceed:

`IMPLEMENT → CHECKER → LIVE RUNTIME (if required) → CANONICAL CI → LOCK`

## 4. Workstream tracker

| ID | Workstream | Status | Next gate |
|---|---|---|---|
| W1 | GĐ4 L3B native ADK attachment materialization | DESIGN APPROVED / PRE-IMPLEMENTATION REUSE AUDIT NEXT | L3B-0 exact ADK reuse gate |
| W2 | GĐ4 L3C composer attachment UX | NOT STARTED | after W1 lock |
| W3 | GĐ4 L3D real Firebase/Gemini full E2E | NOT STARTED | after W2 lock |
| W4 | module composition/isolation hardening | NOT STARTED | after W3 |
| W5 | Core/App Shell UX | NOT STARTED | after W4 |
| W6 | Home UX | NOT STARTED | after W5 |
| W7 | Agent UX | NOT STARTED | after W6 |
| W8 | Task reference module | NOT STARTED | after W7 |
| W9 | Settings/module management UX | NOT STARTED | after W8 |
| W10 | MVP integrated acceptance | NOT STARTED | after W9 |
| W11 | security/operations hardening | NOT STARTED | after W10 |
| W12 | UAT/deployment/release | NOT STARTED | after W11 |

## 5. Current next action --- L3B-0

No production code.

Perform A--E against the exact installed `@google/adk` version. Exact
installed package wins over upstream HEAD/docs.

Decision:

- supported Runner DI + artifactService + native loading seam → native ADK + smallest thin adapter;
- usable native API requiring minor glue → NEW-CODE NECESSITY PROOF + thin adapter;
- private/internal/unsupported/incompatible seam → **BLOCKED / ARCHITECTURE ESCALATION**;
- Runner bypass/custom Gemini loop/durable media-bearing history/second artifact framework/second file authority/second Agent runtime → **STOP**.

## 6. L3B versus L3D

**L3B runtime probe** proves the server/runtime artifact boundary using
a known canonical uploaded file. It does not require browser composer
E2E.

**L3D full E2E** proves the complete user workflow from browser file
selection/upload through composer, authorization, run-scoped
materialization, Gemini understanding, SSE and reload/history.

This separation is mandatory; L3B must not absorb L3D.

## 7. Phase map

### M1 --- Document → Agent

- L3B-0 Exact ADK Reuse Gate
- L3B-1 Run-scoped Artifact Bridge
- L3B-2 Native ADK Integration
- L3B-3 Boundary Verification + Runtime Probe
- L3C-0 assistant-ui Reuse Gate
- L3C-1 Canonical AttachmentAdapter Integration
- L3C-2 Vietnamese Composer UX + Recovery
- L3C-3 Verification
- L3D Full Firebase + Gemini E2E

### M2 --- Modular Foundation

- W4A Source/architecture/reuse audit
- W4B Client/server composition boundary hardening
- W4C Task isolation + lifecycle
- W4D Module-isolation verification

### M3 --- Product UX

- W5 Core App Shell
- W6 Home
- W7 Agent
- W8A Task audit/contract
- W8B Task core completion
- W8C Task daily-use UX
- W8D Agent parity/HITL
- W8E Task verification
- W9 Settings/module management

### M4 --- Release

- W10 Integrated acceptance
- W11 Security/operations hardening
- W12 UAT/deployment/release

## 8. Checkpoint rule

Each candidate must record: baseline; fresh HEAD; reused APIs/source;
A--E evidence; changed files; production changes; app-owned targeted
tests; locked regressions; runtime/live evidence; CI/build/manifest
where applicable; known limitations; verdict; next action.

No phase self-declares FINAL PASS before checker and required canonical
evidence.
