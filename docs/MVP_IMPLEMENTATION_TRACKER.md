# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> MVP target: Core + Trợ lý AI + Công việc  
> Status source of truth for historical GĐ checkpoints remains `PROJECT_MASTER_PLAN.md`.  
> This file tracks product-consolidation work only.

## 1. Status vocabulary

- `NOT STARTED`
- `DISCOVERY`
- `DESIGN APPROVED`
- `IMPLEMENTING`
- `VERIFICATION PENDING`
- `FINAL PASS / LOCKED`
- `BLOCKED`

## 2. Current baseline context

At creation of this tracker:

- GĐ1: LOCKED;
- GĐ2: LOCKED;
- GĐ3: LOCKED;
- GĐ4 L1/L2/L3A: LOCKED;
- GĐ4 L3B: next design gate;
- MVP product/UX and reuse documentation: established in `/docs`;
- post-MVP modules remain deferred.

## 3. Workstream tracker

| ID | Workstream | Status | Gate/Deliverable |
|---|---|---|---|
| W0 | MVP definition + UX specification | FINAL PASS / LOCKED | docs established |
| W1 | GĐ4 L3B ADK invocation-local attachment materialization | NOT STARTED | exact ADK seam + checker approval + implementation verification |
| W2 | GĐ4 L3C composer attachment UX | NOT STARTED | canonical upload/fileId + history/temp/recovery semantics |
| W3 | GĐ4 L3D live Firebase/Gemini E2E | NOT STARTED | real file understanding + SSE + security/reload/cancel |
| W4 | Module composition/isolation hardening | NOT STARTED | Task disable/remove proof; Core unaffected |
| W5 | Core/App Shell UX consolidation | NOT STARTED | Vietnamese, responsive, simplified shell |
| W6 | Home MVP UX | NOT STARTED | user-oriented start page; no architecture demo |
| W7 | Agent panel MVP UX | NOT STARTED | simplified Vietnamese chat + HITL + attachment |
| W8 | Task reference module UX/ownership normalization | NOT STARTED | usable Task + lifecycle proof + Agent parity |
| W9 | Settings/module management UX | NOT STARTED | Task enable/disable/re-enable surface |
| W10 | MVP integrated acceptance | NOT STARTED | Core + Agent + Task E2E |
| W11 | Security/operations hardening | NOT STARTED | App Check/secrets/dependency/runtime as justified |
| W12 | Single-user UAT/release readiness | NOT STARTED | real-device + backup/recovery + deployment |

## 4. Required order

### Milestone M1 — Finish GĐ4 attachment path

1. W1 L3B.
2. W2 L3C.
3. W3 L3D.

Do not redesign Task/Home during L3B.

### Milestone M2 — Prove modular MVP foundation

4. W4 composition/isolation hardening.

Task is the reference optional module. Required proof:

- enable;
- disable;
- re-enable;
- UI contributions disappear/return;
- Task capability disappears/returns;
- Core + Agent remain healthy;
- no second registry/authority.

### Milestone M3 — Product UX consolidation

5. W5 App Shell.
6. W6 Home.
7. W7 Agent panel.
8. W8 Task.
9. W9 Settings/module management.

Implementation should modify existing components rather than create a parallel frontend.

### Milestone M4 — MVP final integration

10. W10 integrated acceptance.
11. W11 justified security/operations hardening.
12. W12 UAT/release readiness.

Then declare `MVP FINAL PASS / LOCKED` only with canonical evidence.

## 5. W1 — L3B acceptance

- installed ADK version/source inspected;
- supported invocation-local enrichment seam identified;
- no media-bearing durable `newMessage`/history;
- PDF/JPEG/PNG/WebP binary Part and TXT/Markdown text materialization as approved;
- cancellation preserved;
- no Runner bypass;
- no Gemini Files API unless architecture gate changes decision;
- targeted + locked regressions + full CI PASS.

## 6. W2 — L3C acceptance

- composer attach button;
- native picker;
- reuse canonical `fileUploadClient` + `/api/files`;
- attachment chips/remove/retry/pending;
- max count/size UX mirrors server policy but server remains authority;
- persistent history stores safe refs only;
- temporary chat semantics correct;
- stale upload/run isolation;
- no standalone alternate Storage path.

## 7. W3 — L3D acceptance

Live probe:

`upload -> attach -> authorize -> bounded read -> Gemini understands content -> SSE -> reload/history`.

Also verify:

- temporary chat;
- cancellation;
- malformed/foreign/oversized rejection;
- no binary/base64/storage path leakage.

## 8. W4 — modularity hardening acceptance

- client composition boundary;
- server composition boundary;
- registry implementation has no Task domain behavior;
- Task capability ownership correctly registered;
- Core boot with Task disabled;
- module lifecycle failure containment;
- canonical CI module-isolation gate.

No marketplace/dynamic remote plugin system.

## 9. W5–W9 — UX acceptance

Common requirements:

- user-facing Vietnamese standardized;
- no implementation jargon;
- keyboard/touch accessibility reasonable;
- loading/error/empty states;
- iPad landscape/portrait usability;
- iPhone basic usability;
- Agent panel collapsible;
- reduced visual density/card nesting;
- no regression of locked runtime behavior.

## 10. W10 — MVP integrated scenarios

1. Login/open/reload.
2. View Home task summary.
3. Create Task via UI.
4. Query tasks via Agent.
5. Create/update Task via Agent.
6. Risky action HITL confirmation.
7. Disable Task; verify UI/tool disappearance and Core/Agent health.
8. Re-enable Task; verify recovery.
9. Persistent chat reload.
10. Temporary chat non-persistence.
11. Attach document and ask content question.
12. Stop/cancel generation.
13. Network/history/file error recovery.

## 11. Post-MVP backlog — do not start before MVP lock

- Quản lý tài liệu;
- Biên tập;
- Research;
- Định dạng văn bản hành chính;
- cross-module orchestration;
- additional connectors/modules.

Each must begin with a reuse audit and pass module isolation contract.

## 12. Checkpoint log template

For every workstream checkpoint append/update evidence in `PROJECT_MASTER_PLAN.md` and, when useful, this tracker:

```text
Workstream:
Baseline:
Canonical HEAD:
Files changed:
Production changes:
Targeted tests:
Locked regressions:
Full tests:
Build:
Manifest:
Runtime/live probe:
Known limitations:
Verdict:
Next action:
```
