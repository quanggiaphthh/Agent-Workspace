# AGENT-WORKSPACE — CURRENT SOURCE FILE AUDIT

> Audit source: GitHub `main` starting from `75e688269eb47228a963317223affcfd6ed1280f`  
> Date: 2026-09-22  
> Purpose: map existing source to MVP target and identify reuse/modify/create decisions.  
> This document is a plan, not evidence that proposed changes are implemented.

## 1. Executive verdict

Current source already contains most difficult platform foundations. MVP must **reuse and consolidate**, not rewrite.

Strong existing foundations:

- dynamic client module registry/lifecycle;
- server module state/catalog;
- owner/auth/settings;
- ADK/Gemini Agent runtime;
- strict chat/SSE/cancellation/session/history/temporary recovery;
- capability registry/execution/HITL/idempotency;
- Task UI/API/capabilities;
- Firebase file metadata/binary authority;
- secure upload pipeline;
- L3A attachment contract, authorized bounded read and safe reference representation.

Primary remaining work is integration, modularity hardening and product UX consolidation.

## 2. Canonical documents already present

### `PROJECT_DEFINITION.md` — KEEP + later reconcile

Already defines modular platform north star and module roadmap. Update later to state explicitly that **MVP = Core + Trợ lý AI + Công việc**, while other modules are post-MVP. Do not discard current modular invariants.

### `PROJECT_MASTER_PLAN.md` — KEEP / canonical progress tracker

Continue as the single status/checkpoint/verification tracker. Preserve all GĐ1–GĐ4 LOCKED history. Add MVP consolidation milestones only through a controlled documentation update; do not overwrite historical evidence.

### `MODULAR_ARCHITECTURE_AUDIT_AND_ROADMAP.md` — KEEP

Already identifies major architecture gaps: hard-coded client/server composition, missing isolation gate, React coupling in shared contract, lifecycle failure semantics, file/document boundary and Task capability ownership. Use as architecture hardening source.

### `ARCHITECTURE_FINAL.md` — KEEP

Treat as architecture-at-checkpoint evidence. Do not silently rewrite historical architecture claims; create/update architecture docs only after implementation changes are verified.

### GĐ1–GĐ4 reports — KEEP AS EVIDENCE

Do not refactor historical reports for cosmetics. They provide traceability.

## 3. Current production source — reuse/modify map

### `src/App.tsx` — REUSE, minimal UX wording only

Current responsibility is correct: bootstrap then dynamic router. Do not add domain behavior. User-facing boot message can later be simplified to natural Vietnamese (`Đang khởi động...`).

### `src/bootstrap.ts` — MODIFY in modularity-hardening milestone

Current file imports `homeManifest`, `settingsManifest`, `tasksManifest` directly and registers them. This is the main client composition coupling.

Target: move the packaged module list into a dedicated composition root. `bootstrapClient()` should initialize a supplied/static composition without knowing each domain implementation. Do not build remote plugin loading/marketplace.

### `src/core/modules/moduleRegistry.ts` — REUSE/HARDEN, do not replace

Existing register/unregister/enable/disable/contribution aggregation is valuable. Audit and harden atomic lifecycle/failure containment and composition API. Preserve server-state synchronization and permission behavior.

### `shared/contracts/module.ts` — AUDIT THEN POSSIBLY SPLIT

Current contract mixes platform metadata and React component types. If import graph confirms cross-runtime coupling, split into:

- platform-safe `ModuleDescriptor`/lifecycle metadata;
- client-only contribution types;
- server registration types where needed.

Do not refactor solely for folder aesthetics.

### `server/core/modules/moduleCatalog.ts` — MODIFY in modularity hardening

Remove domain seed knowledge from registry implementation. A server composition layer may know packaged modules; catalog runtime should consume registrations. Preserve durable state authority and fail-closed semantics.

### capability bootstrap / `systemCapabilities.ts` — AUDIT/MODIFY

Separate platform/system capabilities from Task-owned capabilities. Task capabilities must disappear/fail closed when Task is disabled. Preserve `ServerCapabilityRegistry`, `CapabilityExecutionService`, `ConfirmationService`, validation, idempotency and audit authorities.

### `src/modules/home/HomeModule.tsx` — MODIFY substantially in MVP UX phase

Current Home contains architecture hero, technical explanations, standalone FileUploadCard and module-isolation education cards. These are developer-facing concepts.

Target Home:

- greeting/start state;
- quick Agent request surface or clear Agent affordance;
- compact Task summary/today list through module widget contract;
- recent conversations only if supported without creating a new subsystem;
- remove architecture teaching cards and technical labels.

Home must remain generic: it may render contributions, not import Task implementation.

### `src/modules/home/FileUploadCard.tsx` — REUSE logic, remove from primary Home after L3C

Do not delete secure upload logic prematurely. Once chat composer attachment is complete, standalone Home upload should be removed from normal Home UX or retained only where a valid resource workflow needs it. Canonical `/api/files` remains unchanged.

### `src/modules/home/fileUploadClient.ts` — KEEP/REUSE

This is useful authenticated client transport for canonical upload. Composer attachment should reuse it rather than implement a second upload client.

### `shared/contracts/fileUploadPolicy.ts` — KEEP

Shared user-safe upload policy contract. Server remains authority.

### `server/core/files/FileIngestionService.ts` — KEEP

Canonical ingestion/validation gateway. Do not duplicate validation in module code.

### `server/core/files/UserFileService.ts` — KEEP

Canonical file ownership/metadata authority and bounded read foundation. Future Documents/Research/Formatter consume through approved shared contracts, not direct Storage.

### `/api/files` route — KEEP

Remain thin authenticated transport boundary. Do not move domain logic into route.

### L3A attachment service/contracts — KEEP

Opaque fileId, authorization, bounded read, per-file/aggregate bounds, safe durable metadata remain locked. L3B must build on this; no alternate file identity.

### `src/modules/tasks/TasksModule.tsx` — REUSE domain behavior, MODIFY UX and typing

Existing server API access, permission checks, create/update/delete and filtering are valuable. Do not rewrite Task.

Product changes after functional gates:

- `Quản lý Nhiệm vụ (Tasks)` -> `Công việc`;
- remove `Server-managed Firestore`, cloud/internal wording;
- compact metrics;
- add user-oriented quick filters Today/Upcoming/Overdue/Completed where data semantics support them;
- compact rows/cards;
- move destructive action to contextual menu where practical;
- replace Firestore loading wording with `Đang tải công việc...`;
- remove default demo-data action from production UX;
- replace local `any`/duplicate Task shape with canonical Task contract if one exists; otherwise create one only when needed by both client/server.

### `TaskFormModal` — REUSE/MODIFY

Keep existing form mechanics unless usability audit shows blocker. Normalize Vietnamese labels, validation, date/priority semantics. Drawer/sheet is optional UX improvement, not architecture requirement.

### Task server API/domain — KEEP/HARDEN OWNERSHIP

Preserve existing authority. Move registration/ownership only as required to make Task a reference optional module. UI and Agent must converge on same domain behavior.

### Agent chat UI components — REUSE/MODIFY after L3B

Do not replace assistant-ui/ADK integration. UX consolidation should:

- show `Trợ lý AI`;
- hide provider/platform implementation details;
- simplify persistent/temporary conversation controls;
- move memory/log diagnostics out of primary chat if currently exposed;
- add attachment chip/picker through canonical upload flow;
- preserve stop/cancel/recovery/HITL semantics.

### Settings module — REUSE/MODIFY

Keep settings infrastructure. Present user-facing Vietnamese. Module enable/disable UI should become the visible proof of optional Task lifecycle. Advanced diagnostics can be separated from normal settings.

### App shell/sidebar/topbar — REUSE/MODIFY

Keep three-surface architecture: navigation, workspace, Agent panel. Remove technical labels and reduce visual density. Agent panel must be collapsible. Responsive behavior must be verified on iPad landscape/portrait and iPhone.

## 4. Files/tests that must not be casually rewritten

- GĐ1–GĐ3 locked tests and reports;
- L1/L2/L3A file/attachment tests;
- capability bridge/HITL/idempotency tests;
- `PRODUCTION_SOURCE_MANIFEST.sha256` except when production source legitimately changes;
- canonical GitHub workflow except through an explicit verification-gate update;
- auth/credential/session/history authorities.

## 5. Missing artifacts to create during implementation

Exact filenames may be adjusted after source discovery, but responsibilities should exist.

### Documentation now

- `docs/MVP_PRODUCT_UX_SPEC.md`
- `docs/CURRENT_SOURCE_FILE_AUDIT.md`
- `docs/REUSE_CATALOG.md`
- `docs/TARGET_STRUCTURE_AND_FILE_CHANGE_PLAN.md`
- `docs/MVP_IMPLEMENTATION_TRACKER.md`
- `docs/ARCHITECTURE_GUARDRAILS.md`

### Code later, only when approved

Potential composition files:

- `src/composition/clientModules.ts` — packaged client module registrations;
- `server/composition/serverModules.ts` — packaged server descriptors/registrations.

Potential contracts if audit proves necessary:

- `shared/contracts/moduleDescriptor.ts` — runtime-neutral descriptor;
- `src/core/modules/clientModuleTypes.ts` — React-specific contributions.

Potential UX support:

- Vietnamese UI terminology/constants only if centralized strings provide real value; do not create a full i18n framework for single-language MVP without need.

Potential tests:

- module isolation/lifecycle acceptance tests;
- Core boot with Task disabled;
- Task capability absent when disabled;
- re-enable behavior;
- optional-module composition/build proof;
- responsive/component behavior where testable;
- L3B/L3C/L3D tests according to current GĐ4 plan.

## 6. Do not create

For MVP, do not add:

- second Agent runtime;
- second capability registry/execution gateway;
- second confirmation/workflow authority;
- direct browser Firebase Storage authority;
- alternate file store/identity;
- plugin marketplace/remote code loader;
- micro-frontend/module federation;
- RAG/vector DB;
- generic workflow engine;
- second database/cache;
- separate AI Task service;
- new file upload pipeline;
- custom editor/research/document engine before reuse audit.

## 7. Sequencing constraint

Do not mix UX redesign into L3B architecture implementation. Order:

1. L3B design/implementation gate;
2. L3C attachment UX;
3. L3D real runtime verification;
4. module isolation/composition hardening;
5. Core + Agent + Task MVP UX consolidation;
6. MVP E2E/UAT;
7. lock MVP;
8. only then start post-MVP domain modules.
