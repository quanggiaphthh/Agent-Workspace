# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.  
> Agent entry point: `AGENTS.md`.  
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.  
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.

## 1. Current canonical context

- M1 / GĐ4 L3B–L3D: **FINAL PASS / LOCKED**.
- Clean canonical checkpoint validated: `3e512e2279c9f1793d18082f0d7fcabc33247453`.
- Canonical Actions: `35946098473` — run #43 — **SUCCESS**.
- Capability count: **9**.
- Real Firebase + Gemini Document → Agent E2E: **PASS**.
- Current next workstream: **M2 / W4 — Modular Foundation**.
- Current next gate: **W4A — SOURCE/ARCHITECTURE + REUSE AUDIT**.
- Product mode: **single-user personal app, not public**.
- Post-MVP modules and marketplace/public plugin ecosystem remain deferred.

## 2. Mandatory pre-code gates

Every implementation workstream uses:

**A SOURCE AUDIT → B REUSE AUDIT → C NEW-CODE NECESSITY PROOF → D TEST MINIMIZATION PLAN → E IMPLEMENTATION PLAN**

Only after E:

`IMPLEMENT → CHECKER → LIVE RUNTIME (if required) → CANONICAL CI → LOCK`

Do not re-run unrelated locked tests unless the current change can affect their boundary.

## 3. Workstream tracker

| ID | Workstream | Status | Next gate |
|---|---|---|---|
| W1 | GĐ4 L3B native ADK attachment materialization | FINAL PASS / LOCKED | closed |
| W2 | GĐ4 L3C composer attachment UX | FINAL PASS / LOCKED | closed |
| W3 | GĐ4 L3D real Firebase/Gemini full E2E | FINAL PASS / LOCKED | closed |
| W4 | module composition/isolation hardening | **NEXT / W4A AUDIT** | source + mature-GitHub reuse audit, then minimal local hardening plan |
| W5 | Core/App Shell UX | NOT STARTED | after W4 lock |
| W6 | Home UX | NOT STARTED | after W5 |
| W7 | Agent UX | NOT STARTED | after W6 |
| W8 | Task reference module | NOT STARTED | after W7 |
| W9 | Settings/local module management UX | NOT STARTED | after W8 |
| W10 | MVP integrated acceptance | NOT STARTED | after W9 |
| W11 | security/operations hardening | NOT STARTED | after W10 |
| W12 | UAT/deployment/release | NOT STARTED | after W11 |

## 4. Locked M1 evidence

M1 proves the complete path:

`browser select → /api/files → canonical fileId → composer attach → /api/agent/chat → current-run authorized artifact → native ADK LoadArtifactsTool → Gemini content-dependent answer → SSE → reload/history`

Also locked: persistent/temporary chat, cancellation, no durable binary/base64, no storage-authority leak, no Runner bypass, capability count 9.

M1 is not reopened without a reproducible blocker/regression.

## 5. Current next action — W4A

Audit fresh canonical source before production changes:

1. current client/server module composition;
2. module catalog/state/lifecycle implementation;
3. Task UI/data/capability ownership;
4. existing registries and extension seams;
5. current tests covering enable/disable/isolation;
6. installed dependencies;
7. mature public GitHub implementations/patterns researched at source level by capability, license, maintenance and integration cost;
8. exact gap between current source and required Task enable/disable/re-enable semantics;
9. classify non-essential platform/UI features as `KEEP / SIMPLIFY / DEFER / REMOVE` for a single-user personal MVP.

External research must answer: **what proven gap does this component solve that current Agent-Workspace source does not already solve?** Prefer reference/adaptation over importing a larger subsystem.

Output A–E in one bounded audit. Prefer existing code and thin adaptation. Do not create a second registry, plugin runtime, generic DI framework, marketplace or remote plugin loader.

### Personal-use scope guard

W4/W9 require **local module management**, not a marketplace.

Keep: packaged module manifest/registry, enable-disable-re-enable, UI/capability contribution visibility, failure isolation, durable data preservation and a simple Vietnamese settings surface.

Defer/remove from MVP: public marketplace/discovery, remote plugin install/load, publish/share, ratings/reviews/download counts, developer portal, third-party entitlement/licensing/billing, organization/team management, marketplace update/distribution and other public ecosystem infrastructure.

Do not delete existing deferred code without a source-level safety/removal justification.

## 6. W4 completion requirement

W4 is complete only when it is proven that:

- Task can be enabled, disabled and re-enabled;
- Task UI contribution disappears/returns correctly;
- Task Agent capabilities disappear/return through the canonical registry/gateway;
- durable Task data is preserved unless explicit deletion is requested;
- Task failure/disable does not break Core or Agent;
- no duplicate authority/runtime is introduced;
- no marketplace/remote-plugin subsystem is required for MVP.

## 7. Remaining phase map

### M2 — Modular Foundation
- W4A Source/architecture/reuse audit
- W4B Client/server composition boundary hardening
- W4C Task isolation + lifecycle
- W4D Module-isolation verification

### M3 — Product UX
- W5 Core App Shell
- W6 Home
- W7 Agent
- W8A Task audit/contract
- W8B Task core completion
- W8C Task daily-use UX
- W8D Agent parity/HITL
- W8E Task verification
- W9 Settings/local module management

### M4 — Release
- W10 Integrated acceptance
- W11 Security/operations hardening
- W12 UAT/deployment/release

## 8. Checkpoint rule

Each candidate records baseline/fresh HEAD, reuse evidence, A–E, changed files, app-owned targeted tests, only relevant locked regressions, required runtime evidence, CI/build/manifest where applicable, limitations, verdict and next action.

Only W12 may conclude **MVP FINAL PASS / LOCKED**.