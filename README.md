# Agent-Workspace

Agent-Workspace is a private, single-owner modular Agent workspace. The current product is intentionally bounded to:

- **Core Webapp**
- **Agent Chatbox**
- **Task module**

It is not a public SaaS, team/org product, billing platform, marketplace, or remote plugin ecosystem. Planned modules such as Biên tập, Quản lý tài liệu, Research, Định dạng văn bản hành chính, and RAG/vector search remain deferred until explicitly opened.

## Stack

- React, Vite, TypeScript
- Express / Node.js
- Firebase Auth
- Firestore
- Firebase Storage
- Google ADK
- Gemini API
- assistant-ui
- Zod

## Architecture principles

- Authentication and effective permissions are server-authoritative.
- `ServerCapabilityRegistry` and `CapabilityExecutionService` are the canonical capability path.
- Agent execution uses the existing RootAgent + Google ADK Runner + Gemini path.
- Persistent Agent session/history is server-side; Temporary Chat remains isolated from durable history.
- File ingestion is server-mediated through the canonical `/api/files` path and `UserFileService`.
- Client/server module enablement uses the existing local/server module-state authorities; module management is not a marketplace.
- Do not create parallel identity, capability, confirmation, file, storage, session, event, or module-state authorities.

## Development

Prerequisite: a supported Node.js environment.

Install the canonical npm lockfile exactly:

```bash
npm ci
```

Available package scripts:

```bash
npm run dev
npm run lint
npm run test
npm run test:integration
npm run build
npm run start
npm run preview
npm run clean
```

Environment and deployment configuration are repository-controlled. Use the existing project configuration and operational documentation; never commit credentials or production secrets.

## Security boundary

- Firebase ID tokens are verified server-side.
- Production is owner-only and fails closed when owner configuration is unavailable.
- Direct browser Firestore and Firebase Storage access is denied; persistence/file access goes through server authorities.
- AI credentials and other secrets must not be committed to the repository or exposed in client-visible logs/errors.

## Current status

- MVP — **FINAL PASS / LOCKED**
- Post-MVP R1 — **FINAL PASS / LOCKED**
- Post-MVP R2 — **FINAL PASS / LOCKED**
- Post-R2 fresh audit — **FINAL PASS / CANONICALIZED**
- R3 — **NOT REQUIRED / NOT OPENED**

H1 is repository maintenance and does not reopen R1/R2 behavior.

## Canonical documentation

Start with:

- [`AGENTS.md`](AGENTS.md) — coding-agent operating instructions.
- [`PROJECT_MASTER_PLAN.md`](PROJECT_MASTER_PLAN.md) — locked checkpoints and governance.
- [`docs/MVP_IMPLEMENTATION_TRACKER.md`](docs/MVP_IMPLEMENTATION_TRACKER.md) — operational project status.
- [`docs/ARCHITECTURE_GUARDRAILS.md`](docs/ARCHITECTURE_GUARDRAILS.md) — architecture/security constraints.
- [`docs/POST_R2_FRESH_AUDIT_AND_BACKLOG_TRIAGE.md`](docs/POST_R2_FRESH_AUDIT_AND_BACKLOG_TRIAGE.md) — post-R2 audit and backlog triage.
- [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) — operational guidance.

For narrow work, load only the documentation relevant to that workstream rather than treating historical reports as current authority.
