# AGENT-WORKSPACE — MVP COMPLETION PLAN (REUSE-FIRST)

> **Authority:** MVP scope + critical path + reuse governance.  
> **MVP:** Core Webapp + Trợ lý AI + Công việc (Task).  
> **M1 Document → Agent:** FINAL PASS / LOCKED.  
> **Validated clean checkpoint:** `3e512e2279c9f1793d18082f0d7fcabc33247453`.  
> **Canonical Actions:** `35946098473` — run #43 — SUCCESS.  
> **Current frontier:** M2 / W4 Modular Foundation.

## 1. Product boundary

Agent-Workspace is a single-user modular Agent webapp. MVP contains only:

1. stable Core Webapp;
2. usable Gemini/Google ADK Agent Chatbox;
3. Task as the first complete reference business module.

Biên tập, Quản lý tài liệu, Research, Định dạng văn bản hành chính, RAG/vector DB, connector ecosystem, marketplace, multi-user administration and custom Agent runtime are post-MVP.

## 2. Reuse governance

`REUSE → CONFIGURE → ADOPT → ADAPT → BUILD NEW`

Every workstream asks first: **Chức năng này đã tồn tại ở đâu và phần nhỏ nhất Agent-Workspace thực sự phải sở hữu là gì?**

Mandatory gates:

- **A. SOURCE AUDIT** — fresh HEAD, current authorities, source, tests, exact dependencies.
- **B. REUSE AUDIT** — local code, installed packages, official APIs, mature upstream patterns and license/compatibility where relevant.
- **C. NEW-CODE NECESSITY PROOF** — why direct reuse/configuration is insufficient and the smallest owned delta.
- **D. TEST MINIMIZATION PLAN** — do not re-test upstream or unrelated locked behavior; verify app-owned affected boundaries.
- **E. IMPLEMENTATION PLAN** — minimal files/dependencies/tests, order, rollback/stop conditions and exit criteria.

Then: `IMPLEMENT → CHECKER → LIVE RUNTIME when required → CANONICAL CI → LOCK`.

## 3. M1 — Document → Agent — FINAL PASS / LOCKED

W1/L3B, W2/L3C and W3/L3D are complete. Proven workflow:

`browser File → /api/files → canonical fileId → composer attachment → server authorization → run-scoped artifact → native ADK LoadArtifactsTool → Gemini understands file → SSE → reload/history`

Locked invariants:

- canonical `UserFileService`/`FileIngestionService` remain file authorities;
- native Google ADK remains Agent runtime;
- current-run attachment whitelist and lazy bounded read;
- cancellation propagation;
- no durable binary/base64/storage-path authority leak;
- persistent and temporary chat preserved;
- composer reuses existing upload path and canonical `fileId`;
- capability count remains 9;
- real Firebase + Gemini content-dependent E2E passed;
- canonical Actions #43 succeeded on the clean validated checkpoint.

Do not reopen L3B/L3C/L3D absent a reproducible regression.

## 4. M2 — Modular Foundation — CURRENT

### W4A — Source/architecture/reuse audit — NEXT

Audit existing client/server composition, module state/catalog, Task ownership, canonical capability registry/gateway and existing lifecycle tests. Complete A–E before production code.

Reuse/reference order:

1. existing Agent-Workspace module infrastructure;
2. existing canonical registries/services;
3. installed dependencies;
4. researched xNet contribution/module patterns and NanoGemClaw lifecycle/manifest patterns as references only when they reduce owned code;
5. new code only for proven gaps.

### W4B — Client/server composition boundary hardening

Move only necessary packaged-module knowledge to existing composition boundaries. Do not introduce a second registry, generic DI/plugin framework or remote plugin loader.

### W4C — Task isolation + lifecycle

Prove Task enable/disable/re-enable, UI contribution and capability disappearance/return, durable-data preservation and failure containment.

### W4D — Module-isolation verification

Run targeted application-owned lifecycle/isolation checks, only affected locked regressions, build/CI as required. Exit: Core + Agent remain healthy with Task disabled and no duplicate authority/runtime.

## 5. M3 — Product UX

- **W5 Core App Shell UX:** Vietnamese, responsive, iPad-first, basic iPhone, stable navigation; reuse existing primitives.
- **W6 Home UX:** daily-use Home, Task summary and Agent affordance; no new business authority.
- **W7 Agent UX:** Vietnamese history/temporary chat/attachments/HITL/loading/error/recovery; preserve locked runtime semantics.
- **W8 Task Reference Module:** complete usable Task domain/UX and Agent parity through canonical capability gateway/HITL.
- **W9 Settings + Module Management UX:** usable Task enable/disable/re-enable over canonical module state; no marketplace.

W8 decomposes into W8A audit/contract, W8B core completion, W8C daily-use UX, W8D Agent parity/HITL, W8E verification.

Optional packages require concrete net-code/test-reduction proof before adoption.

## 6. M4 — Release

### W10 — MVP integrated acceptance
Verify login/open/reload, Home, Task UI, Agent Task query/mutation, HITL, Task disable/re-enable, persistent/temporary chat, document attachment, cancellation and recovery/error handling.

### W11 — Security + operations hardening
Only justified single-user hardening: Firebase rules, server auth, secrets/config, dependency exploitability, logging/diagnostics and backup/recovery.

### W12 — UAT + deployment + release
Real iPad UAT, iPhone/desktop smoke, clean build/deploy reproducibility, production deployment, final canonical Actions and final docs reconciliation.

Only W12 may conclude **MVP FINAL PASS / LOCKED**.

## 7. Remaining dependency DAG

`W4A → W4B → W4C → W4D → W5 → W6 → W7 → W8A → W8B → W8C → W8D → W8E → W9 → W10 → W11 → W12`

After W4D, read-only UX discovery may run in parallel when it does not modify shared boundaries.

## 8. Completion definition

MVP is complete only when the deployed application reliably supports:

`Đăng nhập → giao diện tiếng Việt → persistent/temporary Agent chat → upload/attach document → Gemini reads it → create/update Task through Agent/HITL → Task UI reflects state → reload preserves correct state → disable/re-enable Task without breaking Core/Agent → recover from common errors.`

Passing test counts alone is insufficient.