# AGENT-WORKSPACE — ARCHITECTURE GUARDRAILS

> Mandatory pre-read for AI-assisted implementation.

## Product scope

- Single-user personal webapp; not a public multi-tenant SaaS.
- MVP = Core + Trợ lý AI + Công việc.
- Other domain modules are post-MVP.
- User-facing language: Vietnamese-first, natural, non-technical.

## Canonical authorities — DO NOT DUPLICATE

1. `ServerCapabilityRegistry` — runtime capability registry.
2. `CapabilityExecutionService` — capability execution gateway.
3. `ConfirmationService` — confirmation/HITL authority.
4. Existing ADK Runner/RootAgent path — Agent runtime.
5. Existing server session/history — durable chat authority.
6. `UserFileService` — canonical file ownership/metadata/read authority.
7. `FileIngestionService` + `/api/files` — canonical upload ingestion path.
8. Firebase Auth — identity.
9. Existing module state/catalog — module enable/disable authority, subject only to approved composition hardening.

## Forbidden without explicit architecture gate

- second Agent runtime;
- second capability registry/gateway;
- second confirmation/workflow engine;
- direct browser Firebase Storage write/read authority;
- alternate canonical file ID/storage path exposed to modules/browser;
- binary/base64 persisted in durable chat history;
- bypass ADK Runner to make Gemini attachment work;
- hard-coded growing `if module X` logic in RootAgent/Core;
- direct module A -> module B implementation imports;
- marketplace/remote plugin loader/micro-frontend for MVP;
- RAG/vector DB without proven requirement;
- new DB/cache/object store for MVP;
- custom auth;
- broad refactor of LOCKED phases without reproducible blocker.

## Module invariants

- Core boots with optional domain modules disabled.
- Disable module => its UI contributions and capabilities disappear/fail closed.
- Re-enable restores behavior.
- Module failure does not crash Core/Agent/other modules.
- Durable module data is not deleted merely by disable.
- Cross-module interaction uses shared contract/event/capability, not implementation coupling.
- Composition layer may know packaged modules; registry implementation/Core behavior must not own domain logic.

## REUSE-FIRST rule

Before new code:

1. search current Agent-Workspace;
2. search approved project repositories;
3. check native Google/Firebase/Gemini/ADK feature;
4. check mature maintained OSS;
5. check maintained API/MCP/provider;
6. build only the missing adapter/domain behavior.

Do not reproduce mature dependency internals in Agent-Workspace tests.

## File/resource invariants

- Browser sends opaque file identity only.
- Server derives verified owner.
- Authorization precedes binary read/model use.
- Reads are bounded by actual bytes, not metadata alone.
- Model materialization is run-scoped.
- Durable history stores safe reference/metadata only.
- Gemini URI/provider staging, if ever used, is not canonical file identity.

## AI/tool invariants

- Gemini interprets intent/content; deterministic application rules remain code/domain services.
- Structured output should be schema-validated when used.
- Tool/function execution always passes canonical capability gateway.
- HITL policy is not implemented ad hoc in UI/module code.

## UX invariants

Normal user UI must not expose implementation jargon such as:

- Firestore;
- ADK;
- SSE;
- Capability Registry;
- Server-managed;
- Workspace Canvas;
- module architecture explanations.

Use `Trang chủ`, `Công việc`, `Cài đặt`, `Trợ lý AI`, `Tệp đính kèm`, `Trò chuyện tạm thời`.

## Verification invariants

- TDD/behavioral evidence for new behavior.
- Preserve locked regression suites.
- `PRODUCTION_SOURCE_MANIFEST.sha256` updated only for legitimate production-source changes.
- Canonical GitHub source + GitHub Actions are final verification evidence.
- Do not compare AI Studio exported ZIP SHA with prior checkpoint ZIP SHA; AI Studio packaging is expected to differ.
- Never declare PASS for a gate that was not run.
