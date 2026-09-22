# AGENT-WORKSPACE — MVP COMPLETION PLAN (REUSE-FIRST)

> Canonical product target: **Core Webapp + Trợ lý AI + Công việc (Task)**  
> Planning date: 2026-09-22  
> Governing principle: **REUSE > CONFIGURE > ADAPT > BUILD**  
> Historical checkpoint authority: `PROJECT_MASTER_PLAN.md`  
> Progress tracker: `docs/MVP_IMPLEMENTATION_TRACKER.md`

## 1. Product definition

Agent-Workspace is a single-user modular Agent web application. The stable Core provides authentication, application shell, navigation, settings, module lifecycle/composition, permissions, persistence, file infrastructure, shared UI and Agent runtime. The Agent Chatbox is the common interaction/orchestration surface. Business functions are supplied by independent modules that can be enabled, disabled, attached or removed without breaking Core or unrelated modules.

MVP scope is intentionally limited to:

1. stable Core Webapp;
2. usable Gemini/Google ADK Agent Chatbox;
3. Task as the first complete reference business module.

Post-MVP modules remain deferred: Biên tập, Quản lý tài liệu, Research, Định dạng văn bản hành chính and later extensions.

## 2. Mandatory reuse policy

Every implementation task must prove the following decision sequence before new production code is written:

1. Can verified Agent-Workspace code already satisfy the requirement?
2. Can an already-installed dependency satisfy it?
3. Does the official Google/Firebase/ADK/assistant-ui API already provide it?
4. Is there a mature, compatible open-source implementation/pattern that can be adopted or adapted?
5. Can the requirement be satisfied with a thin adapter/configuration layer?
6. Only if all previous answers are no: build new application-owned implementation.

A new dependency is not justified merely because it is popular. It must remove more custom implementation/test burden than it adds, remain compatible with Google AI Studio/Firebase deployment, avoid a second authority/runtime, and belong to the owning module rather than Core where possible.

## 3. Test minimization policy

Do not reproduce upstream unit tests for mature dependencies. Agent-Workspace tests must concentrate on application-owned boundaries and invariants:

- adapter input/output mapping;
- authentication/authorization and authority boundaries;
- policy enforcement;
- cancellation/stale-run isolation;
- persistence/history invariants;
- module enable/disable isolation;
- error mapping;
- end-to-end user workflows with pinned versions.

Prefer a small number of high-value contract/integration/E2E tests over large suites that merely re-test ADK, Firebase, assistant-ui, Radix/shadcn or other upstream internals.

## 4. Current verified state

Locked foundation:

- GĐ1: LOCKED — single-user owner/permission baseline;
- GĐ2: LOCKED — Agent execution, SSE, cancellation/timeout, sessions/history, temporary chat and recovery;
- GĐ3: LOCKED — capability contract/registry, execution gateway, validation, idempotency, HITL and native ADK tool bridge;
- GĐ4 L1/L2A/L2B: LOCKED — canonical file authority, secure ingestion and end-user upload;
- GĐ4 L3A: FINAL PASS / LOCKED.

Canonical L3A production checkpoint:

`1ae1a7431b58d54b7996d3cded5093e26b534352`

Canonical L3A GitHub Actions:

`35658931580` — SUCCESS.

L3A evidence includes targeted 52/52 PASS, full Vitest 33/33 files and 347/347 tests PASS, Acceptance 13/13 PASS, QA Stage 1–5 PASS, production build PASS, manifest 141/141 PASS and capability count 9.

Current implementation frontier: **GĐ4 L3B**.

## 5. Reuse map for remaining MVP

| Need | Preferred reuse | Decision |
|---|---|---|
| Agent runtime/tool lifecycle | installed Google ADK | ADOPT |
| L3B document materialization | ADK `Runner`, artifact APIs, `LoadArtifactsTool` | ADAPT with thin run-scoped adapter |
| Canonical file authority | existing `UserFileService` + file policy | REUSE |
| Upload | existing `/api/files`, `FileIngestionService`, `fileUploadClient` | REUSE |
| L3C attachment lifecycle/UI | installed assistant-ui attachment/composer primitives | ADAPT thin canonical-fileId adapter |
| Chat/thread UI | existing assistant-ui integration | REUSE |
| Auth/DB/blob storage | Firebase | REUSE |
| Runtime validation | existing Zod contracts | REUSE |
| Capability execution/HITL | existing registry, `CapabilityExecutionService`, `ConfirmationService` | REUSE |
| Routing | existing TanStack Router | REUSE |
| Client state | existing state solution/Zustand where already used | REUSE |
| Core UI | existing local primitives; selectively reuse shadcn/Radix patterns/components | REUSE/ADAPT |
| Tool/HITL presentation | existing UI first; assistant-ui/tool-ui only if it removes custom presentation code | EVALUATE |
| Task async caching | current fetch/state first; TanStack Query only if repeated cache/refetch complexity is demonstrated | DEFER |
| Task drag/reorder | dnd-kit only if Kanban/reorder is accepted into MVP | CONDITIONAL |
| Complex forms | React Hook Form + Zod only if Task forms become materially complex | DEFER |
| Post-MVP document parsing/editing | module-local mature libraries/repositories | DEFER |

## 6. Critical path to MVP

### M1 — Complete Agent document input

#### W1 — GĐ4 L3B: native ADK attachment materialization

Goal: Gemini can read current-turn canonical attachments without durable binary/base64 persistence.

Reuse-first implementation:

- inspect exact installed `@google/adk` 2.1.0;
- reuse native `Runner` constructor injection;
- reuse native artifact APIs and `LoadArtifactsTool` if exact installed source supports the approved seam;
- reuse `UserFileService` authorization/bounded read;
- write only a thin current-run read-only artifact adapter if necessary;
- do not build a custom Gemini document loop, second file authority or second Agent runtime.

Required application tests only: current-run whitelist, foreign/same-owner-unattached rejection, bounded lazy read, cancellation, no durable binary/base64, persistent/temporary semantics and locked regressions.

Exit gate: checker + real runtime evidence + canonical CI. Do not call FINAL PASS before those gates.

#### W2 — GĐ4 L3C: composer attachment UX

Goal: Vietnamese user flow `Đính kèm -> chọn tệp -> gửi -> hỏi tài liệu`.

Reuse-first implementation:

- inspect exact installed assistant-ui attachment/runtime API before coding;
- reuse its pending/complete attachment lifecycle, composer/thread primitives and accessibility behavior;
- reuse existing `fileUploadClient` and `/api/files`;
- implement only canonical `fileId` mapping, Vietnamese presentation and Agent-Workspace-specific error/stale/abort wiring;
- never adopt data-URL/base64 attachment storage as canonical chat state.

Do not hand-build a second attachment state machine if assistant-ui can provide it.

#### W3 — GĐ4 L3D: live Firebase/Gemini E2E

Goal: prove the real workflow:

`upload -> attach -> authorize -> bounded read -> Gemini understands content -> SSE -> reload/history`.

Also verify temporary chat, cancellation, malformed/foreign/oversized rejection and no binary/base64/storage-path leakage.

Prefer runtime/E2E evidence; do not create another abstraction merely to make this phase testable.

### M2 — Prove modular product foundation

#### W4 — module composition/isolation hardening

Task is the reference optional module. Required behavior:

- enable;
- disable;
- re-enable;
- UI contribution disappears/returns;
- Task capability disappears/returns;
- Core and Agent remain healthy;
- failure in Task does not create a second registry/authority or break unrelated Core paths.

Reuse strategy:

- harden existing module catalog/registry/composition first;
- use researched xNet/NanoGemClaw concepts only as source-level references for lifecycle/contributions;
- do not import a second plugin runtime;
- do not build marketplace, remote plugins or generic dependency-injection framework for MVP.

Only add module contract fields that are required by Task and immediately exercised.

### M3 — Product UX consolidation

#### W5 — Core/App Shell

Goal: stable, responsive, Vietnamese shell suitable for daily personal use.

Reuse existing local UI. Add missing shadcn/Radix-style primitives selectively rather than building custom button/dialog/sidebar systems. No wholesale frontend rewrite.

Acceptance: iPad landscape/portrait, basic iPhone usability, keyboard/touch usability, consistent loading/error/empty states and collapsible Agent panel.

#### W6 — Home

Replace architecture/demo-oriented surfaces with user-oriented daily summary/actions. Reuse existing Task/file/Agent services; Home must not become a new business authority.

#### W7 — Agent panel

Consolidate existing assistant-ui integration. User-facing language must be Vietnamese and implementation jargon removed. Reuse upstream thread/composer/message/tool primitives where compatible.

#### W8 — Task reference module

Goal: first complete business module and proof of the modular architecture.

Minimum user capability:

- view tasks;
- create/edit/complete/archive or delete according to existing domain contract;
- priority/status/deadline where already supported or clearly required;
- useful filtering such as today/overdue/upcoming if supported without unnecessary framework expansion;
- Agent query/create/update parity through canonical capabilities;
- persistence/reload;
- enable/disable lifecycle proof.

Reuse existing Task source and capability contracts first. Do not rewrite Task merely to fit a new framework. Add TanStack Query, dnd-kit, React Hook Form or date-fns only after a concrete audit proves they reduce net owned code/test burden.

#### W9 — Settings/module management

Provide a simple Vietnamese surface for Task enable/disable/re-enable and relevant Agent/application settings. Reuse canonical module state and settings authorities. No plugin marketplace.

### M4 — MVP integration and release

#### W10 — integrated acceptance

Required user workflows:

1. Login/open/reload.
2. View Home task summary.
3. Create Task via UI.
4. Query tasks via Agent.
5. Create/update Task via Agent.
6. Complete risky mutation through canonical HITL where applicable.
7. Disable Task and verify UI/tool disappearance while Core/Agent remain healthy.
8. Re-enable Task and verify recovery.
9. Persistent chat reload.
10. Temporary chat non-persistence.
11. Attach document and ask a content-dependent question.
12. Stop/cancel generation.
13. Recover from network/history/file errors.

Prefer these E2E workflows over duplicative low-level tests.

#### W11 — security/operations hardening

Only justified hardening required for the single-user MVP:

- Firebase/security rules and server authorization review;
- secret/config separation;
- dependency/security review with exploitability assessment rather than blind upgrades;
- App Check only if deployment threat model and environment justify it;
- logging/diagnostics sufficient to recover a personal deployment;
- no unnecessary observability platform or second backend.

#### W12 — single-user UAT/release readiness

- real iPad/iPhone/desktop smoke tests;
- backup/export/recovery path for important user data as justified;
- production deployment configuration;
- clean install/build/deploy reproducibility;
- final canonical GitHub Actions evidence;
- update Master Plan and tracker;
- declare `MVP FINAL PASS / LOCKED` only after real user workflows pass.

## 7. Explicitly out of MVP

Do not start before MVP lock:

- Quản lý tài liệu;
- Biên tập;
- Research;
- Định dạng văn bản hành chính;
- RAG/vector database;
- generic connector ecosystem;
- remote plugin marketplace;
- multi-user/organization administration;
- custom agent/orchestration framework;
- custom document parser/office editor unless required by an accepted MVP workflow.

Each post-MVP module begins with a new reuse audit and must pass the same module-isolation contract.

## 8. Development governance for every remaining workstream

Every workstream must follow:

`USER NEED -> CURRENT SOURCE AUDIT -> INSTALLED DEPENDENCY AUDIT -> OFFICIAL SDK/API AUDIT -> MATURE GITHUB REUSE AUDIT -> REUSE/CONFIGURE/ADAPT/BUILD DECISION -> MINIMAL CHANGE -> APP-OWNED CONTRACT/INTEGRATION TESTS -> USER E2E -> CHECKER -> AI STUDIO REAL RUNTIME -> GITHUB CI -> LOCK`

Before writing new production code, the implementation report must contain a short **New-code necessity proof**:

- requirement;
- existing code checked;
- installed package/API checked;
- upstream implementation checked;
- why direct reuse is insufficient;
- smallest new adapter/domain code required;
- tests that are genuinely Agent-Workspace-owned.

If that proof is absent, implementation should stop at design review.

## 9. GitHub progress management

`PROJECT_MASTER_PLAN.md` remains the authority for historical/canonical technical checkpoints.

`docs/MVP_IMPLEMENTATION_TRACKER.md` is the operational MVP tracker and must be updated after each locked workstream.

This plan defines scope/order/reuse policy and should change only when product scope or architecture governance changes.

For each checkpoint record:

- Workstream;
- Baseline;
- Canonical HEAD;
- Reused upstream components/APIs;
- New-code necessity proof;
- Files changed;
- Production changes;
- Targeted application-owned tests;
- Locked regressions;
- Full tests/build/manifest;
- Runtime/live probe;
- Known limitations;
- Verdict;
- Next action.

## 10. MVP completion definition

MVP is complete when a user can reliably perform this real workflow in the deployed application:

`Đăng nhập -> giao diện tiếng Việt -> chat với Agent -> persistent/temporary conversation -> upload/attach a document -> Gemini reads it -> ask Agent to create/update work -> Task UI reflects the change -> reload preserves the correct state -> disable Task without breaking Core/Agent -> re-enable Task -> recover from common errors.`

Passing test counts alone do not constitute MVP completion.

## 11. Immediate next action

**W1 / GĐ4 L3B** is the next implementation workstream.

Before any L3B production code, prove the exact installed ADK 2.1.0 seam and prefer native `Runner` + artifact APIs + `LoadArtifactsTool`. The intended Agent-Workspace-owned implementation is only the smallest run-scoped adapter needed to connect canonical `UserFileService` authority to that upstream mechanism.
