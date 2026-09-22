# AGENT-WORKSPACE — REUSE CATALOG

> Principle: REUSE-FIRST.  
> Date: 2026-09-22  
> Goal: minimize new implementation and new test burden.

## 1. Mandatory reuse order

Before building a new service/capability/module infrastructure, check in this order:

1. existing verified implementation in Agent-Workspace;
2. existing verified implementation in repositories owned/maintained for this project;
3. native Google/Firebase/Gemini/ADK capability already in the chosen stack;
4. mature maintained OSS library;
5. maintained external API/MCP/provider;
6. build new only when the previous options cannot meet a documented requirement.

For mature dependencies, Agent-Workspace tests adapters, authority/security boundaries, integration and user acceptance; it should not reproduce the dependency's internal test suite.

## 2. Agent-Workspace — reuse now

| Existing asset | Decision | Reuse target |
|---|---|---|
| ModuleRegistry + manifests | KEEP/HARDEN | all modules |
| Server module catalog/state | KEEP/HARDEN | lifecycle authority |
| Google ADK Runner/RootAgent | KEEP | all Agent workflows |
| ServerCapabilityRegistry | KEEP | canonical capability discovery |
| CapabilityExecutionService | KEEP | all module tool execution |
| ConfirmationService/HITL | KEEP | risky actions |
| Idempotency/audit/cancellation | KEEP | all mutations/tools |
| Firebase Auth | KEEP | owner identity |
| Firestore | KEEP | app/session/domain metadata |
| Firebase Storage/BinaryStore | KEEP | canonical binary storage |
| UserFileService | KEEP | file ownership/resolve/bounded read |
| FileIngestionService | KEEP | upload validation |
| `/api/files` | KEEP | browser upload boundary |
| fileUploadClient | KEEP | composer attachment upload |
| L3A attachment foundation | KEEP | L3B/L3C |
| Task API/UI/domain | KEEP/HARDEN | MVP reference module |
| assistant-ui/ADK client integration | KEEP | Agent UI |
| existing QA/GitHub Actions | KEEP/EXTEND | canonical verification |

## 3. Google/Firebase/Gemini native capabilities — prefer over custom infrastructure

### Firebase

- Authentication: keep; do not build custom identity.
- Firestore: keep; no second DB for MVP.
- Cloud Storage: keep; no second object store.
- App Check: candidate for post-GĐ4/GĐ5 security hardening; do not build custom anti-abuse token system first.
- Secret Manager/App Hosting secret integration: prefer for production secrets when deployment stage requires it.
- Emulator Suite: preferred integration-test infrastructure for Auth/Firestore/Storage boundaries where practical.
- Remote Config: optional for tunable non-security values; never replace canonical source-controlled security invariants/module registry.

### Gemini / Google ADK

- Keep server-side ADK Agent runtime; do not migrate Chatbox to a second Firebase AI runtime.
- Reuse Gemini native PDF/image understanding for file-assisted chat instead of building OCR/PDF/table extraction pipeline for MVP.
- Reuse structured output + existing Zod validation for typed AI results when future modules need structured objects.
- Reuse function/tool calling through existing capability bridge; do not create a second orchestration protocol.
- Evaluate Google Search grounding before adding custom search/crawler infrastructure for Research.

## 4. Existing external project: `quanggiaphthh/chuan-hoa-van-ban-nghi-dinh-30`

This repository is a **post-MVP reuse source** for the future `Định dạng văn bản hành chính` module. Do not copy it into Core now.

Current repository evidence includes:

- architecture/technology/source/rule/document/fix-safety specifications;
- Nghị định 30 rule content;
- Hướng dẫn 05 area;
- semantic/document/legal validation infrastructure;
- document identity/authorization/surgical mutation work;
- production-safe autofix work;
- extensive canonical GitHub verification gates and PASS reports.

### Reuse strategy

When the Administrative Formatting module starts:

1. pin an approved canonical commit of the source repository;
2. inventory exact reusable engine packages/files and their licenses/dependencies;
3. prefer adapter/package extraction over rewriting algorithms;
4. preserve deterministic validator/autofix tests;
5. expose module capabilities through Agent-Workspace `CapabilityExecutionService`;
6. use Agent-Workspace file/resource authority instead of importing a second storage/user authority;
7. keep rule packs/versioning outside Core;
8. never let the formatting engine become a second Agent runtime.

### Not for MVP

Do not import the NĐ30 engine merely to demonstrate modularity. Task is the reference MVP module; administrative formatting comes after MVP lock.

## 5. Future document/editor reuse candidates

Before building a DOCX editor/parser, run a dedicated benchmark/reuse gate. Candidate classes include mature browser document editors/renderers and OOXML libraries. Selection criteria:

- DOCX fidelity;
- editable model;
- import/export fidelity;
- tables/images/headers/footers/page layout;
- licensing;
- TypeScript/browser compatibility;
- ability to integrate without replacing Agent-Workspace authorities.

No candidate is approved by this document. Do not pre-commit architecture until benchmark evidence exists.

## 6. Future Research reuse

Preferred composition:

`ADK/Gemini + Google Search grounding (if adequate) + existing web capability + canonical user resources + typed evidence/citation schema`.

Only add crawler/search provider/vector store when a concrete acceptance requirement cannot be met otherwise.

## 7. Testing reuse policy

### Test ourselves

- adapters;
- permission/owner boundaries;
- module lifecycle/isolation;
- capability registration/execution;
- persistence semantics owned by Agent-Workspace;
- cancellation/recovery;
- end-to-end user workflows;
- regression around reused engine integration.

### Do not reproduce

- Firebase SDK internal behavior;
- Gemini SDK internal behavior;
- ADK internals beyond seams relied upon by the app;
- mature editor/engine library internal algorithms;
- external engine's entire upstream test corpus after a pinned version is integrated.

## 8. Explicit reuse prohibitions

Do not reuse code merely because it exists if it introduces:

- a second authority for auth/files/history/HITL/capabilities;
- incompatible licensing;
- abandoned dependencies with high operational risk;
- direct module-to-module implementation coupling;
- remote code execution/plugin marketplace complexity unnecessary for single-user MVP.
