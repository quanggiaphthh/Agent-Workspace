# AGENT-WORKSPACE --- MVP COMPLETION PLAN (REUSE-FIRST)

> **Authority:** MVP scope + critical path + reuse governance.\
> **MVP:** Core Webapp + Trợ lý AI + Công việc (Task).\
> **Current production checkpoint:**
> `1ae1a7431b58d54b7996d3cded5093e26b534352` --- GĐ4 L3A FINAL PASS /
> LOCKED.\
> **Planning HEAD audited:**
> `be6459f250242e5c1201c65680a4dc07d842993a`.\
> Detailed execution decomposition: `docs/MVP_EXECUTION_PHASES.md`.\
> Operational status: `docs/MVP_IMPLEMENTATION_TRACKER.md`.

## 1. Product boundary

Agent-Workspace is a single-user modular Agent webapp. MVP contains
only:

1. stable Core Webapp;
2. usable Gemini/Google ADK Agent Chatbox;
3. Task as the first complete reference business module.

Biên tập, Quản lý tài liệu, Research, Định dạng văn bản hành chính,
RAG/vector DB, connector ecosystem, marketplace, multi-user
administration and custom Agent runtime are post-MVP.

## 2. Canonical reuse priority

`REUSE → CONFIGURE → ADOPT → ADAPT → BUILD NEW`

Every workstream asks first:

> Chức năng này đã tồn tại ở đâu và phần nhỏ nhất Agent-Workspace thực
> sự phải sở hữu là gì?

No significant production code is written without a NEW-CODE NECESSITY
PROOF.

## 3. Canonical five-gate pre-code model

All remaining implementation workstreams use the same gates:

- **A. SOURCE AUDIT:** fresh HEAD, relevant source, authorities, tests/integration, exact dependency versions.
- **B. REUSE AUDIT:** current project code, installed packages, official APIs, mature upstream patterns, compatibility/license where relevant.
- **C. NEW-CODE NECESSITY PROOF:** requirement, options checked, insufficiency of direct reuse/configuration, smallest owned code.
- **D. TEST MINIMIZATION PLAN:** upstream behavior not re-tested, app-owned boundaries, locked regressions, runtime/E2E evidence.
- **E. IMPLEMENTATION PLAN:** files/responsibilities, order, fail-closed/rollback, exit criteria, non-goals.

Only after A--E:

`IMPLEMENT → CHECKER → LIVE RUNTIME → CANONICAL CI → LOCK`

"LIVE RUNTIME" is required when the phase exit gate depends on real
Firebase/Gemini/device/deployment behavior.

## 4. Current verified state

GĐ1--GĐ3 and GĐ4 L1/L2/L3A are locked. L3A canonical production
checkpoint is `1ae1a7431b58d54b7996d3cded5093e26b534352`, Actions
`35658931580` SUCCESS, and capability count remains 9.

Current frontier:

**GĐ4 L3B --- DESIGN APPROVED / PRE-IMPLEMENTATION REUSE AUDIT NEXT.**

Implementation has not started.

## 5. M1 --- Document → Agent

### W1 / GĐ4 L3B --- Native ADK attachment materialization

Goal: prove current-turn canonical attachments can reach Gemini through
a supported native ADK seam without durable binary/base64.

L3B is split into:

- **L3B-0 --- EXACT ADK REUSE GATE:** A--E gates; exact installed package wins over upstream HEAD/docs.
- **L3B-1 --- RUN-SCOPED ARTIFACT BRIDGE:** smallest thin adapter, current-run whitelist, lazy bounded read, abort, safe mapping.
- **L3B-2 --- NATIVE ADK INTEGRATION:** supported Runner/artifactService/LoadArtifactsTool or equivalent native seam; preserve sessions/SSE/HITL.
- **L3B-3 --- BOUNDARY VERIFICATION + RUNTIME PROBE:** app-owned tests, locked regressions, real Gemini content-dependent probe, checker and canonical CI.

#### Mandatory decision table

| Finding | Action |
|---|---|
| Supported Runner DI + artifactService + native loading seam | Native ADK + smallest thin adapter |
| Usable native API needs minor glue | NEW-CODE NECESSITY PROOF + thin adapter only |
| Seam private/internal/unsupported/incompatible | STOP --- BLOCKED / ARCHITECTURE ESCALATION |
| Requires Runner bypass/custom Gemini loop/durable media history/second artifact or file authority/runtime | STOP |
| Upstream differs from installed version | Exact installed package wins |

#### L3B exit boundary

Known canonical uploaded file → authorized current-run mapping → native
ADK loading → real Gemini content-dependent understanding.

Also prove same-owner unattached, foreign and stale-turn blocked;
bounded lazy read; AbortSignal; no durable binary/base64; no
storage-path/authority leakage; no Runner bypass; capability count 9;
persistent/temporary/HITL regressions preserved.

**L3B does not own browser composer E2E.**

### W2 / GĐ4 L3C --- Composer attachment UX

Split into:

- **L3C-0:** exact installed assistant-ui reuse audit + A--E.
- **L3C-1:** canonical `AttachmentAdapter` integration over existing `fileUploadClient` + `/api/files`.
- **L3C-2:** Vietnamese composer UX, pending/complete/remove/retry, stale/abort/error/recovery.
- **L3C-3:** targeted verification + locked regressions.

Boundary:

`browser File → /api/files → canonical fileId → assistant-ui lifecycle → chat attachment reference`

No browser base64/data URL as canonical transport; no second attachment
state machine where installed assistant-ui can supply it.

### W3 / GĐ4 L3D --- Real Firebase + Gemini full E2E

Primarily integration/verification:

`browser select → upload → fileId → attach → send → authorize → run-scoped materialize → Gemini understands → SSE → reload/history`

Also verify temporary chat, cancellation, malformed/foreign/oversized
rejection, no binary/base64/storage-path leak and recovery/error
behavior.

Do not create a new abstraction merely to make L3D testable.

## 6. M2 --- Modular Foundation

### W4 --- Module composition + isolation hardening

Execution decomposition:

- **W4A:** current module architecture/source audit + reuse/reference decision + A--E.
- **W4B:** client/server composition boundary hardening.
- **W4C:** Task enable/disable/re-enable, capability/UI isolation, failure containment.
- **W4D:** canonical module-isolation verification.

Do not build marketplace, remote plugin loader, generic DI framework or
second registry.

## 7. M3 --- Product UX

- **W5 --- Core App Shell UX:** Vietnamese, responsive, iPad-first, basic iPhone, stable navigation, reuse existing UI primitives.
- **W6 --- Home UX:** daily-use Home, Task summary and Agent affordance; remove architecture/demo surface; no new business authority.
- **W7 --- Agent UX:** Vietnamese surface, history, temporary chat, attachments, HITL, loading/error/recovery, responsive/collapsible panel.
- **W8 --- Task Reference Module:** complete usable Task domain/UX and Agent parity.
- **W9 --- Settings + Module Management UX:** Task enable/disable/re-enable and relevant settings; no marketplace.

W8 may decompose into W8A audit/contract, W8B
CRUD/status/deadline/priority/persistence, W8C
today/overdue/upcoming/search/filter UX, W8D Agent parity/HITL, W8E
verification.

Optional packages such as TanStack Query, dnd-kit, React Hook Form or
date-fns require concrete net-code/test-reduction proof.

## 8. M4 --- Release

### W10 --- MVP integrated acceptance

Canonical workflows: login/open/reload; Home; Task UI; Agent
query/mutate Task; HITL; Task disable/re-enable; persistent and
temporary chat; document attachment; cancellation; recovery/error
handling.

### W11 --- Security + operations hardening

Only justified single-user hardening: Firebase rules, server auth,
secrets/config, dependency exploitability, logging/diagnostics,
backup/recovery. App Check only if threat model proves need.

### W12 --- UAT + deployment + release

Real iPad; iPhone smoke; desktop smoke; clean build/deploy
reproducibility; production deployment; final canonical Actions; final
docs reconciliation.

Only W12 may conclude **MVP FINAL PASS / LOCKED**, and only with real
evidence.

## 9. Dependency DAG

Canonical checker-controlled order:

`L3B → L3C → L3D → W4 → W5 → W6 → W7 → W8 → W9 → W10 → W11 → W12`

After W4, some UX discovery may run in parallel when it does not modify
shared boundaries, but production checkpoint order remains explicit.

## 10. Superseded pre-MVP file-library planning

A standalone File Library/generic file-operations phase is not part of
the current MVP. Canonical file authority and secure upload remain
platform foundations; document attachment is completed through L3B--L3D.
Broader document management belongs post-MVP unless a concrete MVP
acceptance blocker requires a narrowly scoped correction.

## 11. Completion definition

MVP is complete only when the deployed application reliably supports:

`Đăng nhập → giao diện tiếng Việt → persistent/temporary Agent chat → upload/attach document → Gemini reads it → create/update Task through Agent/HITL → Task UI reflects state → reload preserves correct state → disable/re-enable Task without breaking Core/Agent → recover from common errors.`

Passing test counts alone is insufficient.
