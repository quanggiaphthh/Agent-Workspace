# AGENT-WORKSPACE — MVP EXECUTION PHASES

> **Authority:** detailed implementation decomposition for the remaining MVP.  
> **M1 Document → Agent:** FINAL PASS / LOCKED.  
> **Current execution point:** M2 / W4A.  
> Scope/order/reuse policy: `MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Operational status: `MVP_IMPLEMENTATION_TRACKER.md`.  
> Historical checkpoints: `../PROJECT_MASTER_PLAN.md`.

## 1. Shared phase contract

Every phase/lượt uses:

**A SOURCE AUDIT → B REUSE AUDIT → C NEW-CODE NECESSITY PROOF → D TEST MINIMIZATION PLAN → E IMPLEMENTATION PLAN**.

Common stop conditions: second canonical authority/runtime; unsupported/private seam; bypass of locked gateway/Runner; scope expansion into post-MVP; production code before A–E; unnecessary dependency; unrelated refactor.

Verification is proportional to the change surface. Do not re-run generic upstream behavior or unrelated locked suites. Use targeted application-owned tests plus only regressions whose boundary can be affected.

Checkpoint: candidate/source diff → checker → required live/runtime verification → canonical CI → lock.

## 2. Completed M1 — Document → Agent

The following are **FINAL PASS / LOCKED** and are historical execution steps, not pending work:

- L3B-0 Exact ADK Reuse Gate
- L3B-1 Run-scoped Artifact Bridge
- L3B-2 Native ADK Integration
- L3B-3 Boundary Verification + Runtime Probe
- L3C-0 assistant-ui Reuse Gate
- L3C-1 Canonical composer attachment integration
- L3C-2 Vietnamese composer UX/recovery within bounded local integration
- L3C-3 Verification
- L3D Real Firebase + Gemini Full Document E2E

M1 locked path:

`browser select/upload → fileId → composer attach → send → authorize → run-scoped artifact → native ADK load → Gemini understands → SSE → reload/history`

Canonical clean checkpoint validation: `3e512e2279c9f1793d18082f0d7fcabc33247453`; Actions `35946098473` (#43) SUCCESS.

## 3. Remaining dependency DAG

`W4A → W4B → W4C → W4D → W5 → W6 → W7 → W8A → W8B → W8C → W8D → W8E → W9 → W10 → W11 → W12`

After W4D, read-only UX discovery may run in parallel, but shared production changes follow checker-controlled boundaries.

## 4. M2 — Modular Foundation

### W4A — MODULE SOURCE/ARCHITECTURE + REUSE AUDIT — NEXT

**Outcome:** exact current module composition and Task ownership are understood before code.

**Audit:**
- current client module catalog/state/lifecycle;
- current server capability registration/composition;
- Task UI, data, service and capability ownership;
- enable/disable persistence semantics;
- existing isolation/lifecycle tests;
- exact installed dependencies that can be reused;
- existing research/reference patterns (xNet, NanoGemClaw) only where applicable.

**Required output:** A–E in one bounded audit: source findings, reuse decision, new-code necessity proof, minimized test plan and smallest implementation plan.

**No production code.**

**STOP:** proposal requires second registry/runtime, generic DI framework, marketplace, remote plugin loader, or broad unrelated refactor.

**Exit:** checker approves smallest hardening plan. **Next:** W4B.

### W4B — CLIENT/SERVER COMPOSITION BOUNDARY HARDENING

**Outcome:** Core composition does not own Task business behavior while existing canonical registries remain authoritative.

**Implementation:** modify only boundaries proven necessary by W4A; prefer extending/composing existing module catalog/state and `ServerCapabilityRegistry`/execution gateway.

**Tests:** only changed composition mapping, module contribution visibility and directly affected regressions.

**Non-goals:** generic plugin framework, new runtime, new registry, post-MVP modules.

**Exit:** Task knowledge is bounded to appropriate module contribution seams; Core/Agent regressions relevant to the boundary pass. **Next:** W4C.

### W4C — TASK ISOLATION + LIFECYCLE

**Outcome:** Task behaves as the reference detachable module.

Prove:
- enable Task → UI/capabilities available;
- disable Task → Task UI/capabilities unavailable;
- Core + Agent remain operational;
- re-enable Task → contributions return;
- durable Task data remains unless explicitly deleted;
- Task failure is contained and does not crash Core/Agent.

Reuse canonical module state, capability registry/gateway, confirmation and persistence. No duplicate service authority.

**Exit:** targeted lifecycle/isolation behavior passes. **Next:** W4D.

### W4D — MODULE-ISOLATION VERIFICATION

Run canonical application-owned module-isolation tests, only affected locked regressions, TypeScript/build/manifest/CI as applicable. Live runtime only if the exit criterion cannot be established without it.

**Exit:** W4 FINAL PASS / LOCKED; no second registry/runtime. **Next:** W5.

## 5. M3 — Product UX

### W5 — CORE APP SHELL UX

Outcome: Vietnamese stable navigation, iPad-first responsive shell, basic iPhone/desktop support and collapsible Agent surface. Reuse existing UI primitives; no frontend rewrite.

### W6 — HOME UX

Outcome: daily-use Home with Task summary and Agent affordance; remove architecture/demo teaching surfaces. Home remains module-agnostic.

### W7 — AGENT UX

Outcome: Vietnamese Agent surface with history, temporary chat, attachment presentation, HITL, loading/error/recovery and responsive panel. Preserve M1/GĐ2/GĐ3 runtime semantics.

### W8A — TASK DOMAIN/SOURCE AUDIT + MVP CONTRACT

Complete A–E against current Task source. Define exact MVP behavior without Jira/Trello expansion.

### W8B — TASK CORE COMPLETION

View/create/edit/complete/archive-delete as canonical domain permits; status/deadline/priority/persistence. Reuse existing Task domain/services before adding code.

### W8C — TASK DAILY-USE UX

Search/filter/today/overdue/upcoming where data semantics justify them. Optional dependencies require net-code/test-reduction proof.

### W8D — AGENT PARITY + HITL

Agent query/create/update through existing capabilities/gateway/HITL; no duplicate Task service.

### W8E — TASK VERIFICATION

Targeted Task behavior + module lifecycle + Agent parity + affected regressions + CI. Exit: Task reference module lock.

### W9 — SETTINGS + MODULE MANAGEMENT UX

Vietnamese settings and visible Task enable/disable/re-enable over canonical module state. No marketplace.

## 6. M4 — Release

### W10 — MVP INTEGRATED ACCEPTANCE

Verify login/open/reload; Home; Task UI; Agent Task query/mutation; HITL; disable/re-enable; persistent/temporary chat; document attachment; cancellation; recovery/error handling. Fix only reproducible blockers.

### W11 — SECURITY + OPERATIONS HARDENING

Audit Firebase rules/server auth/secrets/config/dependency exploitability/logging/diagnostics/backup-recovery. App Check only if threat model justifies it.

### W12 — UAT + DEPLOYMENT + RELEASE

Real iPad UAT, iPhone/desktop smoke, clean build/deploy reproducibility, production deployment, final canonical Actions and final docs reconciliation.

Only after real evidence may checker declare **MVP FINAL PASS / LOCKED**.

## 7. Execution sizing rule

Prefer outcome-sized batches rather than micro-steps. Keep a batch bounded enough for reliable review; split when change surface becomes materially large or crosses independent authorities. Small config/test/CSS fixes may be handled directly in the live environment; contract/schema/business-logic changes remain checker-controlled. Pull/push/commit in AI Studio are performed manually by the user.