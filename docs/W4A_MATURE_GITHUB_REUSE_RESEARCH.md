# AGENT-WORKSPACE — W4A Mature GitHub Design + Source-Level Reuse Research

> **Mode:** research / audit / design only — no production source, dependency, commit, push or deployment change.
>
> **Canonical baseline audited:** `main` `8ae3533e0b0f131a03f8b72c5ba75f77c2c659db` (2026-09-24).
>
> **Scope:** one-user personal app; build-time packaged modules only. No marketplace, public discovery, remote install/loading, publishing, billing/licensing, teams, micro-frontends, second module/capability registry, or second Agent runtime.

## 0. Method and hard-stop decision

Read first: `AGENTS.md`, `docs/MVP_IMPLEMENTATION_TRACKER.md`, `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`, `docs/MVP_EXECUTION_PHASES.md`, `docs/ARCHITECTURE_GUARDRAILS.md`, `docs/CANONICAL_REUSE_MATRIX_SOURCE_LEVEL.md`, `docs/REUSE_CATALOG.md`, `docs/EXTERNAL_GITHUB_REUSE_RESEARCH.md`, and `MODULAR_ARCHITECTURE_AUDIT_AND_ROADMAP.md`.

Local source was audited before external research. External candidates were inspected at pinned commits and at implementation/type/test/license level, not selected from README or star count. No candidate earns adoption as a framework: all would add an oversized runtime or solve no local gap. The W4B/W4C direction is therefore **REUSE_LOCAL → EXTEND_LOCAL**, with selected external patterns used only as provenance-backed design references.

**Hard-stop check:** no second registry/runtime, DI/plugin framework, marketplace, remote loader, micro-frontend, broad refactor or dependency is needed. **GO for checker review of the minimal plan only.**

## A. Local Capability Audit

| Capability | Current local component | Status | Gap |
|---|---|---|---|
| Client module registry + manifest | `shared/contracts/module.ts`, `src/core/modules/moduleRegistry.ts` | LOCAL ALREADY SUFFICIENT as the sole client authority | Manifest mixes React contribution types with cross-layer metadata; no validated dependency metadata/duplicate contribution policy. Do not split without W4B dependency-graph proof. |
| Packaged registration | `src/bootstrap.ts` imports/registers Home, Settings, Task | LOCAL GAP EXISTS | Core bootstrap knows every domain manifest. Move this static list to one composition boundary; do not discover/load code remotely. |
| Server module catalog | `server/core/modules/moduleCatalog.ts` | LOCAL GAP EXISTS | Catalog implementation seeds domain metadata (`tasks`) itself. Registration must move to the matching static server composition boundary. |
| Durable enabled state | `server/infrastructure/storage.ts` Firestore `module_settings`; `GET /api/modules`, toggle route | LOCAL ALREADY SUFFICIENT | Durable toggle is transaction/audit-backed and disableable modules fail closed when durable state cannot be verified. Keep this authority; only align lifecycle result/UI reconciliation. |
| Enable/disable/re-enable lifecycle | Client registry `enable/disable`, Task `manifest.lifecycle` | LOCAL GAP EXISTS | Callbacks return promises but are neither awaited nor contained; enabled bit is changed before callback outcome and no lifecycle state/error/rollback contract exists. |
| Route contribution | `src/router.tsx:createDynamicRouter`, `ModuleGuard` | LOCAL GAP EXISTS | Router is constructed from all registered routes at bootstrap; disabled module is guarded, not removed from router. This protects direct navigation, but does not prove contribution removal/rebuild semantics. Define deliberate blocked-route behavior and test it, or reconstruct only through the existing router factory. |
| Navigation contribution | `moduleRegistry.getNavigation`, `ModuleSidebar` event refresh | LOCAL ALREADY SUFFICIENT | Disable filters navigation and sync/status events refresh it. Add targeted lifecycle acceptance test. |
| Dashboard/widget contribution | `moduleRegistry.getWidgets`, `HomeModule` | LOCAL ALREADY SUFFICIENT | Enabled filtering is present. Add targeted disappearance/return test. |
| Task UI manifest | `src/modules/tasks/manifest.ts` | LOCAL ALREADY SUFFICIENT | Provides navigation, route and widget. Capability ownership is absent from this package. |
| Task durable data/service | `server/core/data/UserDataService` called by task capabilities/UI paths | LOCAL ALREADY SUFFICIENT | Module settings never delete Task records. Make that preservation invariant explicit in W4C tests; do not introduce a second data store. |
| Server capability registry | `ServerCapabilityRegistry` | LOCAL ALREADY SUFFICIENT | Canonical discovery and execution re-check enabled state and permissions. Do not create a module-local registry. |
| Capability execution + HITL | `CapabilityExecutionService`, `CapabilityConfirmationService` | LOCAL ALREADY SUFFICIENT | Already canonical idempotency/audit/confirmation authority. Task needs ownership registration moved out of `systemCapabilities.ts`, not a new gateway. |
| Task capability registration | `server/core/capabilities/systemCapabilities.ts` | LOCAL GAP EXISTS | Task descriptors are registered by a system file, although marked `moduleId: 'tasks'`; this prevents clean Task package ownership/registration. |
| Settings / local module management | `src/modules/settings/ModuleManagerTab.tsx` | LOCAL ALREADY SUFFICIENT for MVP | Simple Vietnamese-first list and toggle exists. It currently assumes `home`/`settings` IDs instead of using server metadata (`canDisable`) and locally applies lifecycle after server success without recovery when that callback fails. |
| Failure isolation | Registry filtering, server fail-closed state checks, module guard | LOCAL GAP EXISTS | Server capability isolation is strong. Client lifecycle failure containment and component render-failure containment have not been proven; no module-lifecycle acceptance suite exists. |
| Lifecycle/isolation tests | `src/__tests__/architecture.test.ts`, `server/core/capabilities/__tests__/userCapabilities.test.ts`, `server/agent/adk/__tests__/toolDiscovery.test.ts` | LOCAL GAP EXISTS | Existing tests prove disabled capability filtering/execution and some registry invariants, but not end-to-end enable → disable → re-enable contributions, durable Task preservation, or client lifecycle failure isolation. |

### Findings that constrain W4B/W4C

1. `ServerCapabilityRegistry` and `CapabilityExecutionService` already enforce disabled-module behavior at discovery and execution. W4 must reuse them unchanged.
2. `storage.toggleModuleEnabledWithAudit()` is the durable state authority. Disable is state only; it does not delete Task data, which already gives the required preservation semantics.
3. The real gaps are **static composition ownership**, **atomic/observable client lifecycle behavior**, **Task capability ownership**, and **targeted proof**. They do not justify an external plugin platform.

## B. Mature GitHub Research

| Repository | File / component / API inspected | Capability | Maturity evidence | License | Compatibility |
|---|---|---|---|---|---|
| `strapi/strapi` @ `a82c2d8…` (v5.55.0) | `packages/plugins/documentation/admin/src/index.ts`; `packages/core/upload/admin/src/index.ts`; root `LICENSE` | Packaged admin plugin registration; lazy route/menu/settings contribution | Release commit dated 2026-09-23; TypeScript monorepo; explicit plugin integration source; tests/CI present | MIT Expat for Community Edition source inspected (EE excluded) | React/TS conceptually compatible; Strapi runtime/API not compatible with Vite/Firebase |
| `backstage/backstage` @ `c4784704…` | `packages/frontend-plugin-api/src/wiring/createFrontendPlugin.ts`; `createExtension.test.ts`; `plugins/home-react/package.json`; `LICENSE` | Typed plugin ID, static extensions, route contribution, manifest info, duplicate-ID/ordering test patterns | Active 2026-09-23 commit; source-level API and tests; published packages | Apache-2.0 | React/TS compatible in principle; dependency graph and frontend system are far too large |
| `microsoft/vscode` @ `97452d7…` | `src/vs/workbench/services/extensions/common/abstractExtensionService.ts`; `extensionDescriptionRegistry.test.ts`; `LICENSE.txt` | Enable/disable delta, remove/add order, extension contribution update, same-ID re-registration test | Active 2026-09-24 commit; mature test suite and production lifecycle machinery | MIT | TypeScript pattern only; Electron/workbench runtime incompatible |
| `home-assistant/core` @ `c41dc25…` | `homeassistant/loader.py`; `script/scaffold/templates/config_flow/integration/__init__.py`; `LICENSE.md` | Manifest metadata/dependencies; setup/unload lifecycle with explicit boolean result | Active 2026-09-23 commit; typed loader and scaffolded lifecycle convention | Apache-2.0 | Server lifecycle pattern only; Python runtime incompatible |
| `payloadcms/payload` @ `346bd50…` | `docs/plugins/plugin-api.mdx`; `packages/payload/src/config/types.ts`; `LICENSE.md` | Minimal static plugin factory, slug/order, typed cross-plugin discovery | Active 2026-09-23 commit; TypeScript API/types and test/CI corpus; API explicitly marked experimental | MIT | TypeScript-compatible pattern; Payload/Next config model not suitable for runtime reuse |

### Source-level conclusions by capability

| Capability | Best external evidence | What it demonstrates | W4A result |
|---|---|---|---|
| Local manifest/registry | Backstage `createFrontendPlugin`; Home Assistant `Manifest` | Stable module identity, version and static registration; validate metadata before composition | REFERENCE ONLY: local manifest already satisfies current MVP need. |
| Enable/disable/re-enable | VS Code extension delta and same-ID remove/add test; HA explicit setup/unload result | Lifecycle must have an observable terminal result and test removal/re-add, not fire-and-forget callbacks | PARTIAL USE: adapt the **test/lifecycle semantics only**. |
| Route/navigation/settings contributions | Strapi admin `register()` / `bootstrap()` | A packaged module can declare all UI contributions at one registration point; route UI can be lazily imported | PARTIAL USE: adapt a single local static registration entry, no Strapi API/package. |
| Dashboard/widget contribution | Backstage extension attachment/order patterns | Contributions need deterministic IDs/order and duplicate protection | REFERENCE ONLY: current widget aggregation is enough; only add duplicate handling if fresh W4B audit proves collision risk. |
| Capability/tool contribution | Backstage typed extension boundaries; current app server registry | Capabilities should be owned/registered by their module package, but still flow through one canonical executor | PARTIAL USE: relocate Task registration to a module-owned registrar invoked by existing server composition. |
| Persistent enabled state | VS Code enablement model; HA config-entry persistence | Enablement is independent from uninstall/data deletion | REFERENCE ONLY: local Firestore state already stronger for this product. |
| Failure containment | VS Code delta processing; HA setup/unload return result | Do not leave a half-applied transition; report failure at authority boundary | PARTIAL USE: define minimal local transactional ordering/error state. |
| Dependency boundary | HA `dependencies`/`after_dependencies`; Backstage duplicate ID checks | Dependencies must be declared/validated only if actual modules require them | REFERENCE ONLY: no Task dependency exists; do not add generic dependency engine. |
| Disable while retaining durable data | HA unload distinguishes runtime teardown from stored config; VS Code disable is not uninstall | Disable must not imply delete | REFERENCE ONLY: local behavior already meets this; test it. |
| Settings UI | Strapi menu/settings registration | Settings is a contribution, not an ecosystem marketplace | REFERENCE ONLY: existing `ModuleManagerTab` is sufficient. |
| Lifecycle/isolation tests | VS Code registry delta test; Backstage extension type tests | Test host-owned contract, not framework internals | PARTIAL USE: adapt only the seven W4 app-owned cases below. |

## C. Candidate Ranking

Ratings are qualitative and based on inspected source, not stars.

| Candidate | Fit | Maturity | Integration cost | Dependency cost | Reuse value | Decision |
|---|---|---:|---:|---:|---:|---|
| Current Agent-Workspace module/capability/storage source | High | Proven in locked application | Low | 0 | Highest | **USE** |
| VS Code lifecycle delta + registry test pattern | High for lifecycle semantics/tests | Very high | Low if copied as ideas only | 0 | High | **PARTIAL USE** |
| Strapi packaged admin registration pattern | Medium-high for UI contribution grouping | High | Low as pattern; high as framework | 0 / high if adopted | Medium | **PARTIAL USE** |
| Home Assistant manifest + setup/unload result pattern | Medium for lifecycle contract | Very high | Low as pattern | 0 | Medium | **PARTIAL USE** |
| Backstage frontend plugin API | Medium semantic fit | Very high | Very high | Very high | Low after local source audit | **REFERENCE ONLY** |
| Payload plugin factory/order | Medium semantic fit | High, but advanced API experimental | Medium | High | Low | **REFERENCE ONLY** |
| Strapi framework/package | Medium | High | Very high | Very high | Low | **REJECT** |
| VS Code extension runtime | Medium | Very high | Prohibitive | Prohibitive | Low | **REJECT** |
| Home Assistant runtime | Low stack fit | Very high | Prohibitive | Prohibitive | Low | **REJECT** |

## D. Source-Level Reuse Map

| Requirement | Local source | External source | Reuse type | Adaptation | New code |
|---|---|---|---|---|---|
| One packaged local module registry | `src/core/modules/moduleRegistry.ts` | Backstage plugin identity pattern | REUSE_LOCAL | Add static composition input, not another registry | One small composition list/module descriptor only if current manifests cannot be registered from a dedicated composition root. |
| Enable/disable/re-enable | `storage.toggleModuleEnabledWithAudit`, registry enable/disable | VS Code delta + HA setup/unload semantics | EXTEND_LOCAL + ADAPT_EXTERNAL | Await/contain lifecycle; specify committed state and recovery behavior | Minimal lifecycle transition result/error handling. |
| Route + nav + widget contribution | Existing manifest/registry/router/sidebar/home | Strapi registration, Backstage ordered extension IDs | REUSE_LOCAL | Move registration ownership; retain existing aggregators | No new UI framework. Optional explicit test harness only. |
| Agent capability contribution | `ServerCapabilityRegistry`, `CapabilityExecutionService`, `systemCapabilities.ts` | Backstage typed ownership boundary | EXTEND_LOCAL + ADAPT_EXTERNAL | Task registrar exports descriptors/register function, invoked once by server composition | One module-local registrar if no existing Task server entry exists. |
| Persistent enabled state | `storage.ts` / Firestore | VS Code / HA lifecycle distinction | REUSE_LOCAL | Document and test that disable preserves Task documents | 0 production dependencies. |
| Module failure isolation | Existing server checks, client registry | VS Code/HA terminal lifecycle patterns | EXTEND_LOCAL + ADAPT_EXTERNAL | A failed client lifecycle cannot silently leave UI state half-transitioned | Minimal error-state/event/rollback code only if test reproduces gap. |
| Dependency boundary | Current static imports | HA manifest dependency concept | REFERENCE ONLY | Do not implement a dependency engine without a real Task dependency | 0. |
| Settings management | `ModuleManagerTab.tsx` | Strapi settings contribution | REUSE_LOCAL | Drive lock/toggle affordance from canonical `canDisable`; preserve Vietnamese UI | Small local prop/state correction only if needed. |
| Lifecycle tests | Existing Vitest tests | VS Code/Backstage test patterns | EXTEND_LOCAL + ADAPT_EXTERNAL | Extend closest tests; no upstream test imports | One focused W4 lifecycle/isolation test file only if existing suites cannot house it coherently. |

## E. Non-MVP Surface Audit

| Current surface | Purpose | KEEP / SIMPLIFY / DEFER / REMOVE | Reason |
|---|---|---|---|
| `ModuleManagerTab` | Local enable/disable settings | **KEEP** | Required MVP local module management; no public discovery/install flow exists. |
| Static manifest registry/catalog | Packaged first-party composition | **SIMPLIFY** | Required, but domain module knowledge must leave core bootstrap/catalog implementation. |
| Module guard screen | Direct-route safety when disabled | **KEEP** | Prevents disabled module use; define it as the deliberate direct-route behavior. |
| Module status persistence/audit | Durable enablement | **KEEP** | Required for re-enable and server-authoritative capability filtering. |
| `systemCapabilities.ts` Task descriptors | Current capability bootstrapping | **SIMPLIFY** | Keep canonical registry/gateway; move Task-owned descriptors out of system-owned file. |
| `src/__tests__/acceptance.test.ts` “multi-user secret isolation” tests | Security regression protection | **KEEP** | Test label does not create multi-user product/organization functionality; no removal case. |
| Marketplace / public discovery / remote install / publish / ratings / billing / developer portal / team administration | None found in executable source/UI | **DEFER** | No present implementation to remove. Explicitly keep absent from W4B/W4C. |
| `TasksModule.tsx` demo text mentioning “Module Federation” or “team” | Seed/sample task text | **SIMPLIFY** (W5/W8 UX only) | Not product architecture; do not alter W4 unless user-facing copy change is independently requested. |

**Removal conclusion:** no executable non-MVP subsystem was found. Therefore **REMOVE = none**; deletion would not reduce current complexity and could reopen locked behavior.

## F. License & Provenance

| Repository | Version / commit audited | Source file | License | Intended usage |
|---|---|---|---|---|
| `strapi/strapi` | `a82c2d8bab32d61eb8399f6f3b244cbcc03cca13` / v5.55.0 | `packages/plugins/documentation/admin/src/index.ts`; `packages/core/upload/admin/src/index.ts` | MIT Expat for inspected Community source | Design reference for grouped static UI registration and lazy route components; no source copy/package. |
| `backstage/backstage` | `c4784704a55ff78db741babe8277c87fc85e4714` | `packages/frontend-plugin-api/src/wiring/createFrontendPlugin.ts`; `createExtension.test.ts` | Apache-2.0 | Design reference for stable IDs, duplicate checks and ordered static contributions; no package. |
| `microsoft/vscode` | `97452d795c704de960ead42638244f1e104319c7` | `abstractExtensionService.ts`; `extensionDescriptionRegistry.test.ts` | MIT | Test/lifecycle semantic reference: remove/add same ID and enablement delta; no source/runtime import. |
| `home-assistant/core` | `c41dc254696d44d71a304fc3165f4793e13684df` | `homeassistant/loader.py`; scaffold `__init__.py` | Apache-2.0 | Reference for explicit setup/unload result and only-real dependency declaration; no source copy. |
| `payloadcms/payload` | `346bd5087d12be9af8a9503455ca56c696230437` | `docs/plugins/plugin-api.mdx`; `packages/payload/src/config/types.ts` | MIT | Reference only for static plugin ordering/optional cross-package relation; advanced API is experimental. |

No external code is approved for direct copy in W4B/W4C. If a future checker authorizes copying a non-trivial snippet, retain the required attribution/license notice and pin the exact commit again at that time.

## G. New-Code Necessity Proof

Only these owned deltas remain after local reuse and external pattern audit:

1. **Static composition boundary:** one existing/importable composition list (or equivalent minimal local module) is needed because `src/bootstrap.ts` and `server/core/modules/moduleCatalog.ts` currently hard-code the Task domain module. No installed dependency supplies a safer smaller solution.
2. **Task-owned capability registration seam:** Task descriptors must leave `systemCapabilities.ts` because a disabled/removable domain module cannot be cleanly owned by system bootstrap. The existing `ServerCapabilityRegistry` remains the sole registration/execution authority.
3. **Lifecycle transition semantics:** `ModuleManifest.lifecycle` promises are currently unawaited, uncontained and non-atomic. A minimal transition result/error policy is needed to prevent an observable half-transition.
4. **App-owned acceptance evidence:** existing tests do not prove complete local Task lifecycle/isolation. Tests are necessary; no generic upstream framework test can prove Agent-Workspace’s Firebase state, manifest contributions and canonical capability boundary.

Not required: plugin framework, DI container, module dependency resolver, external registry, router replacement, state library, Firestore schema change, remote loader, marketplace, external package, second Agent runtime, second capability registry, or broad folder refactor.

## H. Test Minimization Plan

Extend closest existing Vitest suites; test only Agent-Workspace-owned behavior.

| Test | Likely closest home | Assertion |
|---|---|---|
| Enable Task | New focused module lifecycle suite or `src/__tests__/architecture.test.ts` | persisted enabled state is reflected locally; Task nav/widget are present; Task capability is discoverable/executable. |
| Disable Task | Same suite + existing `userCapabilities.test.ts` | Task nav/widget disappear; direct route follows declared guarded-unavailable behavior; Task capability is absent from discovery and fails execution with `MODULE_DISABLED`. |
| Re-enable Task | Same suite | Same manifest contributions and capabilities return; no duplicate registry/capability entry is created. |
| Durable Task data | Existing task service test location or focused W4 suite | Toggle changes only module setting; a pre-existing Task record/service lookup remains intact. No deletion call occurs. |
| Core + Agent stay operational | Existing architecture/tool discovery tests | Home/Settings remain enabled; an allowed system capability remains discoverable/executable while Task is disabled. |
| Lifecycle failure containment | Client registry-focused unit test | Failed `onEnable`/`onDisable` produces an explicit failure outcome and defined retained/recovered state; registry does not silently claim a successful transition. |
| Composition integrity | Architecture test | Exactly one client registry and one server catalog/capability authority are used; Task registration comes through the composition boundary. |

Do **not** re-test TanStack Router, React, Firebase SDK, ADK, Zod, assistant-ui, or generic upstream registry behavior. Run affected typecheck/build only after an implementation candidate exists; do not rerun locked document→Agent runtime tests unless W4 changes that boundary.

## I. Minimal W4B / W4C Plan

### W4B — client/server composition boundary hardening

1. Audit imports to select the smallest existing location for a **static packaged module composition** list. Prefer modifying `src/bootstrap.ts` and `server/bootstrap.ts`; create one small composition file only if it is the only way to keep domain imports out of core registry/catalog implementations.
2. Remove Task hard-coded registration from `src/bootstrap.ts`; invoke the local registry once with the static composition list. Keep `LocalModuleRegistry` as sole client registry.
3. Remove Task metadata seed from `server/core/modules/moduleCatalog.ts`; register its metadata through server composition before `storage.initialize(...)`. Keep `serverModuleCatalog` as sole server catalog.
4. Move Task capability declarations from `server/core/capabilities/systemCapabilities.ts` into a Task-owned registrar called by existing `server/bootstrap.ts`. Keep `ServerCapabilityRegistry`, `CapabilityExecutionService`, confirmation/HITL and ADK tool bridge unchanged.
5. Reuse local manifest types/aggregators, registry, catalog, storage, route guard and settings UI. Reuse only external lifecycle/test ideas; **dependency additions: 0**.

### W4C — Task lifecycle/isolation

1. Make the existing manifest lifecycle contract deterministically awaitable and failure-contained, with one explicit policy selected before coding: either (a) lifecycle succeeds before local state/event commit, or (b) durable state commits first and client reconciliation restores from server on lifecycle failure. Do not invent both paths.
2. Replace `home`/`settings` string checks in the settings toggle flow only if the canonical server metadata can be exposed without a new API/schema; otherwise leave as bounded technical debt for a separately approved cleanup. `canDisable` remains the authority.
3. Add only the seven targeted tests in Section H, extending existing suites where coherent. No new dependency; at most one focused W4 lifecycle test file.
4. Explicitly preserve `UserDataService` Task data across disable/re-enable. Disable must remove availability/contributions, not data.
5. Treat an unhandled route as guarded unavailable (if retained) as a documented W4 acceptance behavior. Do not replace TanStack Router or dynamically import code.

### Files expected to change (subject to fresh pre-code audit)

| File | W4B/W4C action |
|---|---|
| `src/bootstrap.ts` | Modify to consume static composition registration rather than individual Task knowledge. |
| `server/bootstrap.ts` | Modify to register packaged server modules/capabilities through existing startup composition. |
| `server/core/modules/moduleCatalog.ts` | Modify to become catalog only, with no domain Task seed. |
| `server/core/capabilities/systemCapabilities.ts` | Modify to retain system tools only. |
| `src/core/modules/moduleRegistry.ts` | Modify only for approved lifecycle transition contract/failure containment. |
| `src/modules/tasks/manifest.ts` | Reuse; possibly add module-local registration import/metadata only. |
| `server/modules/tasks/*` or closest existing Task server location | Create only if no local Task server registration seam exists; contains metadata/capability registration, not a registry/service duplicate. |
| `src/__tests__/architecture.test.ts`, `server/core/capabilities/__tests__/userCapabilities.test.ts`, `server/agent/adk/__tests__/toolDiscovery.test.ts` | Extend targeted assertions. |
| One focused module lifecycle test | Create only if forcing React/client lifecycle cases into architecture tests harms clarity. |

**Do not change:** `ServerCapabilityRegistry`, `CapabilityExecutionService`, `CapabilityConfirmationService`, ADK Runner/RootAgent, Firebase file/session authority, package manifests/dependencies, locked M1 behavior, or marketplace/non-MVP systems.

## Verdict

**W4A GITHUB REUSE RESEARCH — READY FOR CHECKER**

W4B must not begin until the checker accepts the local-first plan, lifecycle policy, source-file boundaries and test minimization plan above.
