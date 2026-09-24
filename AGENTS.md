# AGENT-WORKSPACE — AGENT OPERATING INSTRUCTIONS

This file is the repository entry point for coding agents. Keep it short, stable, and operational. Do not duplicate the project plans here.

## 1. Product and MVP

Agent-Workspace is a **single-user personal modular Agent webapp** built with React/Vite, TypeScript, Firebase, Gemini, and Google ADK. It is not currently a public multi-user SaaS or third-party plugin platform.

Canonical MVP scope is exactly:

**CORE WEBAPP + AGENT CHATBOX + TASK MODULE**

Post-MVP modules such as Biên tập, Quản lý tài liệu, Research, and Định dạng văn bản hành chính stay deferred until MVP is locked.

User-facing UI is Vietnamese-first and should avoid implementation jargon.

For the personal-use MVP, do **not** build or expand marketplace/public ecosystem features: public module discovery, remote plugin installation/loading, publish/share flows, ratings/reviews/download counts, developer portal, third-party entitlement/licensing/billing, organization/team administration, or marketplace update/distribution infrastructure.

Do preserve the minimal local modular foundation required by the product: packaged module registry/manifest, enable-disable-re-enable state, UI contributions, capability contributions, isolation, durable data preservation, and a simple module-management surface. **Module management is not a marketplace.**

Do not delete existing non-MVP code merely because it is deferred. First classify it as `KEEP / SIMPLIFY / DEFER / REMOVE`; remove only when source audit proves safe removal reduces real complexity without reopening locked behavior.

## 2. Determine current state before work

Do not hard-code milestone status from this file.

Before implementation, read:

1. `docs/MVP_IMPLEMENTATION_TRACKER.md` — current operational status and NEXT gate.
2. `docs/ARCHITECTURE_GUARDRAILS.md` — mandatory architecture/security constraints.
3. Only the planning/reuse documents relevant to the task.

Use as needed:

- `PROJECT_MASTER_PLAN.md` — locked checkpoints/evidence.
- `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md` — MVP scope and critical path.
- `docs/MVP_EXECUTION_PHASES.md` — detailed remaining sequence.
- `docs/CURRENT_SOURCE_FILE_AUDIT.md` — existing source inventory.
- `docs/CANONICAL_REUSE_MATRIX_SOURCE_LEVEL.md` — source/package/API reuse decisions.
- `docs/REUSE_CATALOG.md` and `docs/EXTERNAL_GITHUB_REUSE_RESEARCH.md` — prior reuse research.
- `docs/TARGET_STRUCTURE_AND_FILE_CHANGE_PLAN.md` — intended source/file changes.

Load context progressively. Do not read every planning document for a narrow task.

## 3. Reuse-first rule

Always decide in this order:

`REUSE_LOCAL → EXTEND_LOCAL → REUSE_DEPENDENCY → ADOPT/ADAPT MATURE EXTERNAL → BUILD MINIMUM NEW CODE`

Before significant new code, prove why the current source, installed dependencies, official SDK/framework APIs, and suitable mature implementations are insufficient.

Do not create duplicate abstractions or subsystems when an equivalent authority already exists.

External GitHub research must be capability-driven and source-level. Prefer mature, maintained, license-compatible implementations/patterns with low integration and dependency cost. Research is for filling proven gaps, not importing a larger platform than this single-user product needs.

## 4. Canonical authorities — do not duplicate

- `ServerCapabilityRegistry` — runtime capability registry.
- `CapabilityExecutionService` — capability execution gateway.
- `ConfirmationService` — confirmation/HITL authority.
- Zod — runtime validation.
- Google ADK Runner/RootAgent path — Agent runtime.
- Gemini — AI provider.
- Existing server session/history — durable chat authority.
- `UserFileService` — canonical file ownership/metadata/read authority.
- `FileIngestionService` + `/api/files` — canonical upload path.
- Firebase Auth — identity.
- Existing Firebase stack — persistence/storage.
- Existing module catalog/state — module enable/disable authority, subject only to approved W4 hardening.

No second Agent runtime, capability registry/gateway, confirmation engine, file authority, storage subsystem, or plugin runtime without an explicit architecture gate.

## 5. Mandatory pre-code gates

For each bounded implementation outcome, perform internally and report clearly:

**A. SOURCE AUDIT → B. REUSE AUDIT → C. NEW-CODE NECESSITY PROOF → D. TEST MINIMIZATION PLAN → E. IMPLEMENTATION PLAN**

Then make an explicit `GO` or `STOP` decision.

If an exact installed package/API cannot be verified and the task depends on it, STOP rather than inventing an unsupported seam.

Prefer the smallest independently verifiable outcome, not micro-steps and not oversized multi-feature batches.

## 6. Change discipline

- Patch existing files before creating new wrappers/helpers/services.
- Do not refactor unrelated locked code.
- Do not add dependencies unless existing source/dependencies cannot meet the requirement and the integration cost is justified.
- Preserve public contracts and locked behavior unless a reproducible blocker requires change.
- Do not introduce cross-module implementation imports; use shared contracts/events/capabilities.
- Do not expose storage paths, owner authority, binary/base64, or provider-specific file identity to the browser or durable chat history.
- Keep model materialization run-scoped and authorization-first.
- Do not expand single-user MVP scope into marketplace, remote plugins, multi-user administration, collaboration, billing, public developer APIs, or post-MVP business modules.

## 7. Verification by blast radius

Do not reflexively run the full suite after every small change.

Use this ladder:

1. nearest existing tests;
2. affected contract/integration tests;
3. typecheck/build when compile or bundle behavior can be affected;
4. only relevant locked regressions when the changed boundary can affect them;
5. full canonical CI at milestone/lock/release gates.

Test Agent-Workspace-owned behavior: adapters, authority/security boundaries, project policy, failure mapping, cancellation/stale isolation, persistence invariants, module lifecycle, cross-component integration, and critical workflows.

Do not duplicate generic tests for ADK, Firebase SDK, assistant-ui, Radix/shadcn, or other mature upstream internals.

Never declare PASS for a check that was not actually run.

## 8. Production integrity

`PRODUCTION_SOURCE_MANIFEST.sha256` is an integrity gate. Update it only for legitimate files covered by the manifest and always with real computed hashes; never guess checksums.

Canonical GitHub source and GitHub Actions are final static/CI evidence. Use AI Studio/live environments only when Firebase, Gemini, browser/runtime, deployment, or environment-specific evidence cannot be proven through source/CI.

Do not compare AI Studio export ZIP SHA with an earlier checkpoint ZIP SHA as a production-equivalence test.

## 9. Git and delivery

Do not commit, push, deploy, or change branches unless the user explicitly directs that action or the active workflow explicitly authorizes it.

The user performs AI Studio pull/push/commit actions manually.

Do not create planning/report files by default. Update existing canonical documents when state changes; create a new document only when it has a distinct durable purpose.

## 10. Definition of done

A bounded task is done only when:

- acceptance criteria are satisfied;
- architecture authorities remain intact;
- reuse decisions are traceable;
- change surface is minimal and justified;
- relevant verification passes with evidence;
- unrelated locked behavior is not reopened without cause;
- current canonical planning/tracker is updated only when the milestone/workstream state actually changes.

For current status and the next action, always return to `docs/MVP_IMPLEMENTATION_TRACKER.md`.