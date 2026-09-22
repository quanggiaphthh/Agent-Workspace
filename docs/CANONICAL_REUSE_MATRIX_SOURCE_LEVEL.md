# AGENT-WORKSPACE — CANONICAL REUSE MATRIX (SOURCE / PACKAGE / API LEVEL)

> Research checkpoint: 2026-09-22  
> Goal: minimize Agent-Workspace-owned code and tests by adopting mature upstream behavior before building new subsystems.  
> Status: design/research only. This document does not authorize implementation or dependency changes.

## 1. Decision vocabulary

- **ADOPT** — use the upstream package/API directly; Agent-Workspace owns only configuration/integration.
- **ADAPT** — preserve the upstream contract/pattern and write a thin Agent-Workspace adapter.
- **REFERENCE** — learn architecture/test/UX pattern; do not copy implementation into Core.
- **DEFER** — potentially useful later, but not justified for MVP.
- **REJECT** — conflicts with locked architecture or duplicates an existing authority.

## 2. Highest-value immediate reuse — GĐ4 L3B/L3C

### 2.1 Google ADK `LoadArtifactsTool` — P0

Upstream:

- repo: `google/adk-js`
- source: `core/src/tools/load_artifacts_tool.ts`
- tests: `core/test/tools/load_artifacts_tool_test.ts`
- public export: `core/src/common.ts`
- license: Apache-2.0

Verified upstream behavior:

- `LoadArtifactsTool extends BaseTool`;
- overrides `processLlmRequest(...)`;
- obtains artifacts through `toolContext.listArtifacts()` / `toolContext.loadArtifact()`;
- mutates the invocation-local `llmRequest.contents` rather than requiring media-bearing durable chat history;
- preserves image/audio/video and `application/pdf` inline Parts;
- converts text-like inline data to UTF-8 text;
- inserts loaded artifact content only when the `load_artifacts` tool is invoked;
- upstream tests exercise the LLM-request seam and artifact-service behavior.

Decision: **ADAPT, P0**.

Agent-Workspace must NOT copy this implementation into a second materialization subsystem by default. Before L3B code, inspect the exact installed ADK 2.1.0 package and determine whether this API/behavior is present and supported in that version.

Preferred integration shape if compatible:

```text
canonical fileId
  -> verified user
  -> UserFileService authorization
  -> bounded read
  -> very thin ADK ArtifactService/Context adapter
  -> LoadArtifactsTool/processLlmRequest
  -> invocation-local Gemini Part
```

Agent-Workspace-owned behavior that still requires tests:

- opaque fileId mapping;
- owner authorization before bytes are exposed;
- per-file and aggregate byte limits;
- cancellation/cleanup;
- safe name/MIME mapping;
- no binary/base64 in durable history/SSE/logs;
- temporary/persistent chat semantics.

Do NOT duplicate upstream generic tests proving `LoadArtifactsTool` itself can append an artifact to an `LlmRequest`.

Architecture gate: if exact ADK 2.1.0 does not expose a clean supported seam, stop and escalate; do not bypass Runner.

### 2.2 assistant-ui `AttachmentAdapter` — P0

Upstream:

- repo: `assistant-ui/assistant-ui`
- source: `packages/core/src/adapters/attachment.ts`
- docs: `apps/docs/content/docs/guides/attachments.mdx`
- custom adapter guide: `apps/docs/content/docs/integrations/attachments/custom-adapter.mdx`

Verified API:

```ts
AttachmentAdapter {
  accept: string
  add({ file }): Promise<PendingAttachment> | AsyncGenerator<...>
  remove(attachment): Promise<void>
  send(attachment): Promise<CompleteAttachment>
}
```

Upstream also provides:

- `PendingAttachment` / `CompleteAttachment` lifecycle;
- `CompositeAttachmentAdapter`;
- MIME/extension matching (`fileMatchesAccept`);
- composer attachment lifecycle.

Decision: **ADAPT, P0**.

Do NOT use upstream `SimpleImageAttachmentAdapter` or `SimpleTextAttachmentAdapter` as the canonical transport because they turn the browser File into data URL/base64 or inline text. That conflicts with Agent-Workspace's server-authorized canonical fileId design.

Instead implement only a thin adapter:

```text
assistant-ui File
  -> existing fileUploadClient
  -> authFetch POST /api/files
  -> canonical fileId
  -> CompleteAttachment/safe metadata
```

Reuse assistant-ui's lifecycle/UI state; keep binary out of durable assistant-ui message content.

Test only the Agent-Workspace adapter boundary: endpoint, fileId mapping, abort/stale isolation, error mapping, remove/retry, no base64/storage path.

## 3. Module/composition contract — P1 after GĐ4 L3D

### 3.1 xNet plugin/contribution model

Upstream:

- repo: `crs48/xNet`
- `packages/plugins/src/feature-module.ts`
- `packages/plugins/src/contributions.ts`
- `packages/plugins/src/context.ts`
- `packages/plugins/src/commands.ts`
- plugin architecture design: `docs/explorations/0006_[x]_PLUGIN_ARCHITECTURE.md`

Verified useful patterns:

- a uniform `FeatureModule` shape;
- declarative capability surface;
- clean client/server linkage through an id rather than direct dependency;
- contribution types for views, commands, sidebar items, widgets, settings/editor surfaces;
- lifecycle and disposable registration pattern;
- command exposure to AI is opt-in rather than automatic.

Decision: **REFERENCE + ADAPT selected types, P1**.

Do not import xNet as a runtime dependency. Its domain/storage/editor assumptions are different. Use the source as a design reference to harden the existing Agent-Workspace module contract.

Target Agent-Workspace concept:

```ts
ModuleDefinition {
  id
  metadata
  permissions?
  lifecycle?
  contributes?: {
    routes?
    navigation?
    widgets?
    commands?
    settings?
    capabilities?
  }
}
```

Important: do not immediately create six independent registries. The existing module/capability registries remain canonical. Contribution arrays can initially be typed projections from one manifest.

### 3.2 NanoGemClaw plugin API

Upstream:

- repo: `Rlin1027/NanoGemClaw`
- package: `packages/plugin-api`
- source: `packages/plugin-api/src/index.ts`

Verified contract:

- `NanoPlugin` lifecycle `init/start/stop`;
- contributions for Gemini tools, routes, background services, hooks and IPC;
- plugin-scoped API/config/logger;
- tool metadata including read-only / explicit-intent / danger level;
- structural input validation (`inputSchema.parse`) without forcing Zod into the plugin API;
- manifest entries with `enabled` and dependency ordering.

Decision: **REFERENCE, P1**.

Do NOT copy its Gemini tool execution model because Agent-Workspace already has locked authorities:

- `ServerCapabilityRegistry`;
- `CapabilityExecutionService`;
- `ConfirmationService`.

Useful concepts to adapt:

- lifecycle shape;
- packaged module manifest;
- scoped context/logger/config;
- enabled/disabled dependency metadata.

Reject direct plugin `execute()` as an alternate capability gateway.

## 4. Document parsing and connector ecosystem — post-MVP

### 4.1 OpenDocuments parser contract and parser packages

Upstream:

- repo: `joungminsung/OpenDocuments`
- plugin families: `plugins/parser-*`, `plugins/connector-*`, `plugins/model-*`
- DOCX implementation: `plugins/parser-docx/src/index.ts`
- DOCX package: `plugins/parser-docx/package.json`
- license: MIT

Verified DOCX implementation:

- implements a small `ParserPlugin`;
- dynamically imports `mammoth`;
- converts DOCX to HTML to preserve heading structure;
- yields semantic chunks with heading hierarchy;
- package has its own Vitest/typecheck boundary.

Decision:

- parser contract pattern: **ADAPT later**;
- `mammoth` for semantic DOCX extraction: **candidate ADOPT later**;
- copy of OpenDocuments regex/HTML chunker: **REFERENCE only until quality audit**.

Reason: Agent-Workspace's future Documents/Research modules may need semantic extraction, but the Administrative Formatting module needs layout/OOXML fidelity. One parser cannot serve both purposes.

Recommended future split:

```text
Documents semantic extraction
  -> parser adapters (mammoth/PDF/etc.)

Administrative formatting
  -> existing NĐ30 engine / OOXML-aware domain logic
```

Do not place parser registry in Core before Documents module exists.

### 4.2 OpenDocuments connectors

Available upstream families include Google Drive, GitHub, Notion, S3/GCS, Confluence, Swagger, Web Crawler and Web Search.

Decision: **REFERENCE/ADAPT only when connector is requested**.

Do not make connectors top-level modules. Preferred relationship:

```text
Documents or Research module
  -> Connector contract
  -> Google Drive / Web / ... adapter
```

For Google Drive, prefer Google's official APIs/SDK or ChatGPT/Google connector-equivalent architecture when available; OpenDocuments is a useful implementation/test reference, not an automatic dependency.

## 5. Office/editor stack — post-MVP

### 5.1 WorkDSH Office plugin

Upstream:

- repo: `techflag/workdsh`
- package: `packages/plugins/office`
- key source: `src/editor.ts`, `src/ooxml.ts`, `src/OfficeDocument.tsx`, `src/client.tsx`

Verified dependency composition in its package:

- Tiptap/ProseMirror;
- `docx-preview`;
- `pdfjs-dist`;
- `pdf-lib` + fontkit;
- Univer spreadsheet packages;
- ExcelJS;
- JSZip;
- PPTX viewer packages.

Decision: **REFERENCE architecture; ADOPT mature underlying libraries individually when module opens**.

Do not depend on `workdsh-plugin-office` directly: it is coupled to DeepSeek Harness/Cordis APIs.

Useful concrete patterns:

- preserve original Office package and export a copy rather than overwriting source;
- explicit file-size limits;
- safe OOXML text mutation that reloads the original ZIP and changes only selected text nodes;
- reject malformed XML/DOCTYPE/control characters;
- disable export when unsupported workbook objects make round-trip unsafe.

This is especially relevant to the future Administrative Formatting module because it reinforces the existing NĐ30 project's surgical-mutation approach.

### 5.2 Tiptap / ProseMirror

Decision: **ADOPT later for rich-text editing**, not for canonical Word layout representation.

Tiptap is a headless extension/command layer over ProseMirror. Persist an Agent-Workspace-owned portable document model/working copy; do not make Tiptap JSON the universal document contract if Word fidelity is required.

### 5.3 DOCX/PDF/XLSX preview/edit libraries

Future preferred candidates:

- DOCX preview: `docx-preview`;
- PDF render: `pdfjs-dist`;
- PDF mutation/generation: `pdf-lib`;
- spreadsheet UI: Univer;
- workbook import/export: ExcelJS where appropriate;
- OOXML container manipulation: JSZip;
- semantic DOCX extraction: Mammoth.

Each should be introduced only in the owning module, never Core.

## 6. Research module — post-MVP

Decision: **ADOPT Google ADK primitives first; ADAPT workflow patterns only**.

Preferred primitives:

- Google Search tool;
- URL context;
- sequential/parallel/loop agents only when the research workflow needs them;
- structured output + Zod for query plans/citation records;
- existing Agent-Workspace capability gateway for application actions.

External research repos are useful for acceptance scenarios:

```text
query planning
 -> search
 -> source reading
 -> gap/reflection
 -> bounded follow-up
 -> cited synthesis
```

Do not add LangGraph or another orchestration runtime beside ADK merely to copy a research example.

## 7. What Agent-Workspace should continue to own

Even under aggressive reuse, the project must own these boundaries:

1. module composition contract appropriate to this app;
2. canonical permissions/module-state integration;
3. `ServerCapabilityRegistry` registration ownership;
4. `CapabilityExecutionService` gateway;
5. HITL policy/confirmation integration;
6. `UserFileService` authority and fileId mapping;
7. bounded read and attachment policy;
8. Firebase-specific persistence adapters;
9. Task business behavior;
10. Vietnamese product UX;
11. future NĐ30 domain engine integration;
12. cross-module contracts/events that are specific to Agent-Workspace.

Everything else should pass the ADOPT -> ADAPT -> BUILD test.

## 8. Test minimization policy

### Do not reproduce upstream unit tests for

- ADK generic artifact loading behavior;
- assistant-ui generic attachment state machine;
- Tiptap editor primitives;
- PDF.js rendering engine;
- Mammoth DOCX conversion internals;
- Firebase SDK behavior;
- Radix/shadcn primitive behavior.

### Agent-Workspace tests should cover

- adapter input/output mapping;
- authority boundaries;
- policy enforcement;
- failure mapping;
- cancellation/stale isolation;
- enable/disable lifecycle;
- persistence invariants;
- end-to-end user workflows.

This converts many low-value unit tests into a smaller set of contract/integration tests.

## 9. Dependency policy for Google AI Studio + Firebase deployment

Before adding any package:

1. prove existing dependency cannot satisfy the requirement;
2. inspect license;
3. inspect Node/browser compatibility;
4. inspect bundle impact for client-side packages;
5. ensure it does not require a second database/runtime/server;
6. ensure Firebase deployment can execute it;
7. prefer dynamic import/lazy module loading for heavy post-MVP viewers/editors;
8. add only in the owning module;
9. record why native Google/Firebase/ADK capability was insufficient.

## 10. Immediate implementation implications

### GĐ4 L3B

Mandatory pre-code audit:

- clean install exact lockfile;
- inspect installed `@google/adk` 2.1.0 `LoadArtifactsTool`, `BaseTool.processLlmRequest`, `ArtifactService`, `Context`, `LlmRequest` APIs;
- compare installed source to current upstream behavior;
- design the smallest adapter from L3A authorized/bounded file resolution to ADK artifact loading;
- no production code until the supported seam is proven.

### GĐ4 L3C

Mandatory pre-code audit:

- inspect installed `@assistant-ui/react` 0.15.20 attachment adapter/runtime API;
- verify compatibility with the upstream `AttachmentAdapter` lifecycle;
- reuse composer primitives and existing `fileUploadClient`;
- implement only the canonical-file adapter and Vietnamese UX.

### Modularity hardening after L3D

Use xNet/NanoGemClaw as source-level references, but modify the existing Agent-Workspace registry/composition rather than importing another plugin runtime.

## 11. Current priority matrix

| Need | Upstream source/package | Decision | Priority |
|---|---|---:|---:|
| L3B model file materialization | Google ADK `LoadArtifactsTool` / artifact APIs | ADAPT | P0 |
| L3C attachment lifecycle | assistant-ui `AttachmentAdapter` | ADAPT | P0 |
| Chat UI primitives | installed assistant-ui | ADOPT | P0 |
| Module contribution contract | xNet `feature-module.ts` + `contributions.ts` | REFERENCE/ADAPT | P1 |
| Plugin lifecycle/context | NanoGemClaw `plugin-api` | REFERENCE | P1 |
| Task domain | current Agent-Workspace | KEEP | P0 |
| Semantic DOCX parsing | Mammoth / OpenDocuments parser pattern | ADOPT/ADAPT later | P2 |
| Office preview/edit | WorkDSH dependency composition | REFERENCE; adopt libs individually | P2 |
| Rich-text editor | Tiptap/ProseMirror | ADOPT later | P2 |
| PDF rendering | PDF.js | ADOPT later | P2 |
| Spreadsheet editor | Univer | ADOPT later | P2 |
| Research orchestration | Google ADK primitives | ADOPT/ADAPT | P2 |
| MCP | ADK/native adapter behind capability gateway | DEFER | P3 |
| Remote plugin marketplace | none | REJECT for MVP | — |
| Second agent runtime / LangGraph | none | REJECT | — |
| Second file/storage authority | none | REJECT | — |

## 12. Final research conclusion

The project should not become a collection of copied OSS source trees. The optimum is to keep Agent-Workspace-owned code concentrated in **authority, policy, domain behavior and thin adapters** while delegating generic mechanics to mature upstream packages.

The largest immediate savings are now concrete:

1. L3B may reuse ADK's own invocation-local artifact-loading seam instead of inventing a media injection subsystem.
2. L3C may reuse assistant-ui's attachment lifecycle/composer machinery instead of implementing upload-state UI from scratch.
3. Module hardening can adapt proven contribution/lifecycle shapes without importing another plugin runtime.
4. Future Documents/Editor/Research modules can compose mature parsers/viewers/editors rather than implementing file formats or editing engines.

All reuse remains subject to exact-version, license, deployment and architecture verification at the milestone where it is introduced.
