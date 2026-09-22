# AGENT-WORKSPACE — EXTERNAL GITHUB REUSE RESEARCH

> Date: 2026-09-22  
> Objective: maximize reuse of mature/open-source implementation and upstream tests; minimize custom code and duplicate tests.  
> Status: research/design input. No dependency is approved for installation solely by appearing here.

## 1. Executive decision

Agent-Workspace should not become a collection of copied GitHub code. The optimal reuse model is:

1. reuse existing Agent-Workspace verified code first;
2. reuse installed upstream package APIs directly;
3. adapt small, well-tested upstream patterns only at our boundary;
4. reuse upstream test cases as design/evidence references, not blindly copy entire suites;
5. import/copy source only when package/API reuse is impossible and license/version provenance is pinned.

The highest-value discovery is Google ADK's current `LoadArtifactsTool`: upstream now contains a concrete implementation that temporarily enriches `LlmRequest` with artifact content, supports PDF/image inline Parts, converts text-like artifacts to text, and explicitly describes artifact contents as temporary. This is directly relevant to GĐ4 L3B and should be evaluated before inventing a custom ADK hook.

## 2. P0 — Google `google/adk-js`

Repository: `google/adk-js` — Apache-2.0.

### Exact reusable source/pattern

#### `core/src/tools/load_artifacts_tool.ts`

High-value behavior already implemented upstream:

- `LoadArtifactsTool extends BaseTool`;
- `processLlmRequest(...)` enriches `LlmRequest` before model invocation;
- artifact content is loaded through ADK Context/ArtifactService;
- PDF/image/audio/video are preserved as supported inline Parts;
- text-like content is converted to text;
- content is appended to the model request rather than requiring a second model runtime;
- tool response states that contents are temporary and must be loaded again when needed.

### Why this matters to L3B

This is much closer to the required architecture than writing a custom Runner bypass or mutating durable history. L3B design should first determine whether Agent-Workspace can:

A. adapt `UserFileService` to an ADK `ArtifactService`/Context-compatible boundary; or
B. reuse the same `processLlmRequest` seam with our already-authorized run-scoped attachment materialization.

Do **not** copy upstream `LoadArtifactsTool` verbatim into Agent-Workspace if the installed ADK version can expose/reuse it directly. First inspect the exact installed `@google/adk` 2.1.0 package and version compatibility.

### Upstream tests to reuse as test design

- `core/test/tools/load_artifacts_tool_test.ts`;
- `tests/integration/tools/load_artifacts_tool_test.ts`;
- `tests/e2e/tools/load_artifacts_tool_test.ts`.

These already cover declaration/run behavior, PDF/image inline behavior, text-like conversion and model-request enrichment. Agent-Workspace should only add tests for its adapter-specific invariants: owner authorization, bounded reads, aggregate limit, safe history, cancellation and canonical fileId mapping.

### Decision

**P0 — MUST AUDIT FOR DIRECT REUSE IN L3B.**

## 3. P0 — `assistant-ui/assistant-ui`

Repository: `assistant-ui/assistant-ui` — MIT.

Agent-Workspace already uses assistant-ui concepts/integration, so the best strategy is to reuse its runtime and attachment primitives rather than write custom composer/thread mechanics.

### Exact reusable source/API

#### `packages/core/src/adapters/attachment.ts`

Contains:

- `AttachmentAdapter` contract;
- pending -> complete attachment lifecycle;
- `CompositeAttachmentAdapter`;
- MIME/extension `fileMatchesAccept`;
- attachment equality/conversion helpers;
- image/text adapters.

### Recommended Agent-Workspace use

Create only a thin **canonical fileId attachment adapter** around existing `fileUploadClient`:

`File -> existing /api/files -> canonical public metadata/fileId -> CompleteAttachment`

Do not use `SimpleImageAttachmentAdapter` as-is because it converts browser files to data URLs, conflicting with the project's rule that binary/base64 must not become durable chat content. Reuse the adapter lifecycle/UI machinery, not its data-URL storage strategy.

### Additional upstream assets

- Thread/Message/Composer/ThreadList/ActionBar primitives;
- built-in streaming/autoscroll/retry/accessibility;
- attachment UI;
- Google ADK adapter package exists in current assistant-ui surface;
- Tool UI project provides reusable interactive tool/approval/form/table components.

### Caution from upstream issues

Attachment/history/thread adapters have had edge cases around edits and thread switching. Therefore preserve Agent-Workspace's server history authority and existing stale-run/HITL tests; do not replace it with Assistant Cloud or an unstable remote-thread abstraction solely for convenience.

### Decision

**P0 — REUSE EXISTING PACKAGE PRIMITIVES; BUILD ONLY THIN ADAPTERS.**

## 4. P1 — `assistant-ui/tool-ui`

Repository: `assistant-ui/tool-ui` — MIT.

Provides copy/paste React components for tool calls: approvals, forms, tables, charts and media cards.

Potential reuse:

- HITL confirmation presentation;
- Task creation/update result cards;
- future Research source/result cards.

Do not replace `ConfirmationService`; use Tool UI only as presentation over canonical HITL/tool state.

**Decision: P1 — benchmark during Agent UX consolidation.**

## 5. P1 — `shadcn-ui/ui`

Repository: `shadcn-ui/ui` — MIT.

High-value because Agent-Workspace already has shadcn-like local UI primitives. The upstream project explicitly recommends using existing components before custom UI.

Reusable component/pattern classes:

- Sidebar/Sheet/Drawer for responsive shell;
- Command + Dialog for command palette;
- DropdownMenu for Task row actions;
- AlertDialog for confirmations where UI confirmation is appropriate;
- Empty/Skeleton/Spinner/Alert for states;
- Resizable/Collapsible for Agent panel;
- Form controls and accessible primitives.

### Important constraint

Do not wholesale replace current UI library. Compare existing local components first and import/copy only missing primitives. Shadcn is source-distribution, so copied component code becomes our maintenance responsibility; package-based Radix/Base UI primitives should be preferred when already installed.

**Decision: P1 — selective component reuse, no UI rewrite.**

## 6. P1/P2 — TanStack ecosystem

### Existing TanStack Router

Agent-Workspace already uses TanStack Router. Keep it; do not add another router.

### `TanStack/query`

Mature server-state library supporting caching, refetch, mutations, cancellation and pagination.

Potential future value:

- Task list server state;
- Document list/search;
- Research job/source state.

But introducing it into MVP only to replace already-working `authFetch + local state` would create migration/test cost. Adopt only if repeated async-cache/refetch complexity becomes real.

**Decision: P2 / DEFER until demonstrated duplication.**

### TanStack Table/Virtual

Useful post-MVP for large Document/Research lists. Not needed for current Task MVP.

## 7. P2 — React Hook Form + Zod resolver

Repository: `react-hook-form/react-hook-form` — MIT.

Mature form state/validation, supports Zod.

Potential reuse:

- future complex Editor/Research/Admin-format settings/forms;
- Task form only if current form validation becomes materially complex.

Current Task form is small; adding a form framework now may increase dependencies more than code saved.

**Decision: P2 — do not add for simple MVP Task form unless audit proves clear reduction.**

## 8. P1 — `date-fns/date-fns`

Repository: `date-fns/date-fns` — MIT.

Provides modular immutable date utilities, TypeScript and locale support.

Useful for Task semantics:

- Today;
- overdue;
- upcoming;
- display formatting;
- date comparisons.

Before custom date helpers are written, check whether date-fns is already installed. If not, compare dependency cost against the small set of required native operations. Do not build a custom general date library.

**Decision: P1 if Task date semantics expand; otherwise native Date is sufficient.**

## 9. Existing `pmndrs/zustand`

Zustand is mature and already conceptually aligned with current context store patterns. If already installed, continue using it for small client state. Do not add Redux or a second global state framework.

**Decision: KEEP existing; no competing state library.**

## 10. Google `adk-recipes` / `adk-samples`

Use as reference implementations rather than dependencies.

High-value patterns to inspect before future code:

- session/memory;
- guardrails;
- OAuth;
- RAG only if later required;
- research agents;
- tool workflows;
- streaming.

Rule: when an ADK feature is needed, search official ADK source/samples first. Do not invent framework-level orchestration already demonstrated upstream.

## 11. Google ADK Artifacts as shared file/model adapter — architecture option

ADK's Artifact abstraction is specifically intended for named/versioned binary data and exposes artifact operations through Context. Current docs/source also include `LoadArtifactsTool`, which temporarily adds loaded artifact contents to the model request.

Agent-Workspace should **not** replace `UserFileService` with ADK ArtifactService. Instead investigate a narrow adapter:

```text
UserFileService (canonical ownership/file authority)
        |
        v
Authorized bounded adapter
        |
        v
ADK Artifact/Context or processLlmRequest seam
        |
        v
Gemini invocation-local Parts
```

This preserves file authority while reusing ADK's model-request materialization semantics.

## 12. Post-MVP administrative formatting engine

Repository: `quanggiaphthh/chuan-hoa-van-ban-nghi-dinh-30`.

Reuse priority remains very high. When opened, prefer extracting/adapting its verified engine and test corpus rather than rewriting:

- document/rule/source models;
- semantic detector;
- legal validator;
- document engine;
- identity/authorization;
- surgical mutation;
- safe autofix;
- NĐ30/Hướng dẫn 05 rule assets;
- canonical test fixtures/gates.

Agent-Workspace supplies UI, file authority, module lifecycle and Agent capability adapter around that engine.

## 13. Libraries/projects explicitly NOT recommended now

### LangChain/LangGraph/Mastra

Do not add a second agent/orchestration framework. ADK is canonical.

### Vercel AI SDK

Do not add only for chat streaming; existing ADK/SSE path is locked and assistant-ui can use custom/Google ADK backends.

### Langfuse

Strong observability product, but overkill for single-user MVP and adds operational infrastructure. Reconsider only at GĐ5 if current logs/evals are insufficient.

### Genkit

Do not add beside ADK. It would create a second AI application framework.

### Redux/MobX/Jotai

No need while current state model/Zustand is adequate.

### Firebase AI Logic client runtime

Do not move model invocation to browser. Current server-side ADK/Gemini authority is intentional.

## 14. Reuse matrix

| Need | Best reuse source | Action |
|---|---|---|
| L3B model-local file materialization | google/adk-js `LoadArtifactsTool` | AUDIT FIRST / adapt or directly reuse |
| L3B test design | ADK unit/integration/E2E artifact tests | reuse cases, add only app-boundary tests |
| Composer attachments | assistant-ui `AttachmentAdapter` | thin canonical fileId adapter |
| Chat primitives | assistant-ui | reuse existing primitives/runtime |
| Tool/HITL presentation | assistant-ui/tool-ui | benchmark, UI only |
| Responsive shell/menu/dialog | existing UI + shadcn primitives | selective reuse |
| Routing | TanStack Router | keep existing |
| Global UI state | existing Zustand | keep existing |
| Server async cache | TanStack Query | defer until real need |
| Complex forms | React Hook Form + Zod | defer until real need |
| Task dates | native Date / date-fns | reuse library only if complexity warrants |
| Auth/DB/Storage | Firebase | keep existing |
| Agent runtime/tools | Google ADK | keep canonical |
| File understanding | Gemini native multimodal | reuse; no custom OCR/parser for MVP |
| Admin formatting | existing NĐ30 repo | post-MVP adapter/extraction |

## 15. Test minimization policy derived from research

For reused upstream packages, Agent-Workspace should NOT test that:

- assistant-ui can render its own primitive;
- ADK's generic LoadArtifactsTool declaration works;
- date-fns correctly compares dates;
- Firebase SDK internally uploads objects;
- shadcn/Radix Dialog opens according to upstream behavior.

Agent-Workspace SHOULD test:

- our adapter sends only canonical fileId/public metadata;
- UserFileService authorization occurs before ADK materialization;
- bounded actual bytes are enforced;
- no binary/base64 enters durable history;
- Task module lifecycle gates its capabilities;
- UI wiring maps our state/errors correctly;
- end-to-end user workflows work with pinned dependency versions.

This is the main mechanism for reducing both code and test volume without reducing confidence.

## 16. Immediate recommendation

Before implementing GĐ4 L3B, amend the design task to include a mandatory comparison against upstream ADK `LoadArtifactsTool` and its tests. If the installed ADK 2.1.0 contains a compatible seam, prefer a small `UserFileService -> ADK artifact/request` adapter over a custom materializer.

Before L3C, inspect current installed assistant-ui version and implement attachment UX through its `AttachmentAdapter` contract, backed by the existing `/api/files` upload client. Do not hand-build attachment state machinery.
