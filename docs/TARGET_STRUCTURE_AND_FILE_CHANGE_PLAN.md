# AGENT-WORKSPACE — TARGET STRUCTURE & FILE CHANGE PLAN

> Status: proposed structure; implementation requires per-milestone discovery/TDD.  
> Date: 2026-09-22

## 1. Structural principle

Do not perform a cosmetic big-bang folder migration. Preserve verified code and move/split only when a boundary change is required by a milestone.

Target semantics are more important than exact folder names.

## 2. Target repository shape

```text
/
├─ docs/
│  ├─ MVP_PRODUCT_UX_SPEC.md
│  ├─ CURRENT_SOURCE_FILE_AUDIT.md
│  ├─ REUSE_CATALOG.md
│  ├─ TARGET_STRUCTURE_AND_FILE_CHANGE_PLAN.md
│  ├─ MVP_IMPLEMENTATION_TRACKER.md
│  └─ ARCHITECTURE_GUARDRAILS.md
│
├─ shared/
│  └─ contracts/
│     ├─ ... existing contracts
│     ├─ module...              # runtime-neutral contract after audit
│     ├─ fileUploadPolicy.ts
│     └─ task...                # only if shared canonical Task type is needed
│
├─ src/
│  ├─ App.tsx
│  ├─ bootstrap.ts
│  ├─ composition/              # create only in modularity-hardening
│  │  └─ clientModules.ts
│  ├─ core/
│  │  ├─ modules/
│  │  ├─ context/
│  │  ├─ events/
│  │  └─ ... platform UI/runtime
│  ├─ components/
│  │  └─ ui/                    # reuse existing primitives
│  ├─ modules/
│  │  ├─ home/
│  │  ├─ settings/
│  │  └─ tasks/                 # MVP domain module
│  └─ ... Agent/chat client integration
│
├─ server/
│  ├─ composition/              # create only in modularity-hardening
│  │  └─ serverModules.ts
│  ├─ core/
│  │  ├─ modules/
│  │  ├─ files/
│  │  ├─ capabilities/
│  │  ├─ ai/
│  │  └─ ... platform authorities
│  ├─ agent/
│  │  └─ chat/                  # L3 attachment/model materialization path
│  └─ ... routes/domain adapters
│
├─ .github/workflows/
├─ PROJECT_DEFINITION.md
├─ PROJECT_MASTER_PLAN.md
├─ MODULAR_ARCHITECTURE_AUDIT_AND_ROADMAP.md
└─ PRODUCTION_SOURCE_MANIFEST.sha256
```

Post-MVP modules should follow self-contained boundaries, but do not create empty folders now.

## 3. Planned changes by file/responsibility

### Governance docs

#### `PROJECT_DEFINITION.md`

Later controlled update:

- preserve modular north star;
- add explicit `MVP = Core + Trợ lý AI + Công việc`;
- mark Documents/Editor/Research/Admin Formatting post-MVP;
- add REUSE-FIRST rule;
- state Vietnamese-first user-facing UX.

#### `PROJECT_MASTER_PLAN.md`

Later controlled update after current GĐ4 status reconciliation:

- preserve every LOCKED checkpoint;
- add MVP consolidation milestone after GĐ4/modularity hardening;
- link docs in `/docs`;
- track canonical evidence, not AI Studio ZIP SHA.

#### `ARCHITECTURE_FINAL.md`

Only update/create successor after verified architecture changes. Do not turn future target into current-state claim.

## 4. Client Core changes

### `src/App.tsx`

Minimal:

- keep bootstrap/router-only responsibility;
- normalize user-facing boot wording;
- no Task imports.

### `src/bootstrap.ts`

After modularity audit/TDD:

- stop importing each domain manifest directly;
- obtain packaged registrations from `src/composition/clientModules.ts` or equivalent;
- preserve auth-ready and server-state sync sequence.

### NEW `src/composition/clientModules.ts`

Responsibility:

- only composition layer knows packaged modules;
- return/register Home, Settings, Task registrations;
- later adding/removing optional module changes composition, not registry internals/App shell.

Must not contain domain behavior.

### `src/core/modules/moduleRegistry.ts`

- preserve existing APIs where possible;
- harden lifecycle atomicity/failure containment if audit proves gap;
- expose clean registration input from composition;
- no domain-specific imports.

### `shared/contracts/module.ts`

Audit imports. If split is required:

- keep runtime-neutral metadata/lifecycle contract shared;
- move React `ComponentType` contribution types to client-only file;
- migrate incrementally with tests.

## 5. Server Core changes

### `server/core/modules/moduleCatalog.ts`

- registry/catalog implementation must not seed Task internally;
- consume descriptors/registrations from server composition;
- preserve durable module-state authority/fail-closed behavior.

### NEW `server/composition/serverModules.ts`

- package-level list of Home/Settings/Task server descriptors and capability registrations;
- only composition layer knows optional domain packages;
- no alternate registry.

### capability registration files

- platform capabilities remain platform-owned;
- Task capabilities move to/are registered by Task module registration layer;
- `ServerCapabilityRegistry` and `CapabilityExecutionService` remain unchanged authorities.

## 6. Home UX changes

### `src/modules/home/HomeModule.tsx`

Replace architecture-demo content with user workspace:

- natural greeting/start state;
- compact work summary via widget contributions;
- optional recent conversation surface only by reusing existing history APIs;
- clear Agent affordance;
- no Firestore/module/capability explanations.

Keep dynamic widget registry behavior so Home remains module-agnostic.

### `FileUploadCard.tsx`

- keep during GĐ4 until L3C complete;
- after composer attachment is verified, remove from primary Home render;
- do not delete canonical upload client/service.

## 7. Agent UX changes

Exact files must be identified in the L3C/MVP UX source audit; do not guess paths before implementation.

Required behavior changes:

- Vietnamese user-facing labels;
- `Trợ lý AI` header;
- hide provider/platform implementation details;
- simple persistent vs temporary conversation semantics;
- attachment picker/chips reuse `fileUploadClient`;
- action/HITL card uses existing confirmation authority;
- history error is non-catastrophic when chat remains usable;
- Agent panel collapsible;
- responsive drawer on narrower screens.

No second chat runtime/component stack unless existing UI library cannot meet a proven requirement.

## 8. Task changes

### `src/modules/tasks/TasksModule.tsx`

Preserve API calls/permission checks/domain behavior. Change presentation:

- title `Công việc`;
- remove Firestore/cloud technical labels;
- compact summary;
- natural Vietnamese search/filter labels;
- Today/Upcoming/Overdue quick filters if dates support them;
- compact task rows;
- contextual destructive menu;
- natural loading/error/empty states;
- remove demo seed action from normal production UX.

Also audit duplicate local `TaskItem` type and `any`; centralize only when a canonical shared type benefits both sides.

### `TaskFormModal`

- Vietnamese labels;
- clear required fields;
- validation/error feedback;
- keep modal unless drawer demonstrably improves UX without unnecessary churn.

### Task manifest

- user-facing name `Công việc`;
- contributions remain dynamically provided;
- lifecycle tests become canonical module-isolation proof.

## 9. File/attachment path

### Keep unchanged unless L3B requires approved extension

- `FileIngestionService`;
- `UserFileService`;
- BinaryStore bounded read;
- `/api/files`;
- upload policy;
- L3A attachment contract/resolver/safe reference.

### L3B

Create/modify only after exact ADK 2.1.0 seam is proven. Responsibility is run-scoped Gemini materialization without media-bearing durable history. No Runner bypass.

### L3C

Wire composer UX to canonical upload/fileId flow. No File Library.

### L3D

Real Firebase/Gemini E2E verification.

## 10. Settings changes

- normalize Vietnamese;
- module management becomes user-facing enable/disable surface;
- memory/diagnostics separated from primary Agent chat;
- no developer jargon in normal settings.

## 11. Test/CI additions

After modularity hardening:

- module enabled contributions visible;
- module disabled contributions absent;
- Task capability undiscoverable/unexecutable when disabled;
- Core boot with Task disabled;
- re-enable restores behavior;
- lifecycle failure containment;
- build/composition proof without optional Task registration where feasible.

After UX consolidation:

- component behavior tests only for meaningful state transitions;
- do not snapshot-test styling exhaustively;
- responsive acceptance mainly via real browser/device UAT.

Canonical workflow should add gates only when tests are stable and required; do not duplicate all tests in multiple workflow steps without reason.

## 12. Post-MVP module structure

When each module is actually opened, prefer a self-contained package/boundary such as:

```text
modules/<domain>/
  client/
  server/
  shared/
  registration/
  tests/
```

or the equivalent under existing `src/modules` + server tree. The invariant is dependency direction, not folder cosmetics.

No empty scaffolding for future modules should be added now.
