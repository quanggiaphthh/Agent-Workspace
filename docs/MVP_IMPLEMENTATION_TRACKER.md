# AGENT-WORKSPACE — MVP IMPLEMENTATION TRACKER

> MVP target: **Core + Trợ lý AI + Công việc**  
> Historical/canonical checkpoint authority: `PROJECT_MASTER_PLAN.md`  
> Completion/reuse plan: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`  
> Governing rule: **REUSE > CONFIGURE > ADAPT > BUILD**

## 1. Status vocabulary

- `NOT STARTED`
- `DISCOVERY`
- `DESIGN APPROVED`
- `IMPLEMENTING`
- `VERIFICATION PENDING`
- `FINAL PASS / LOCKED`
- `BLOCKED`

## 2. Current canonical context

- GĐ1: `FINAL PASS / LOCKED`;
- GĐ2: `FINAL PASS / LOCKED`;
- GĐ3: `FINAL PASS / LOCKED`;
- GĐ4 L1/L2A/L2B: `FINAL PASS / LOCKED`;
- GĐ4 L3A: `FINAL PASS / LOCKED`;
- L3A canonical production checkpoint: `1ae1a7431b58d54b7996d3cded5093e26b534352`;
- L3A canonical GitHub Actions: `35658931580` — SUCCESS;
- L3A evidence: targeted 52/52, full Vitest 33/33 files and 347/347 tests, Acceptance 13/13, QA Stage 1–5, build and manifest 141/141 PASS;
- GĐ4 L3B: next implementation workstream; approved direction is native ADK reuse, not a custom document runtime;
- post-MVP modules remain deferred.

## 3. Workstream tracker

| ID | Workstream | Status | Reuse-first gate / Deliverable |
|---|---|---|---|
| W0 | MVP definition + UX + reuse governance | FINAL PASS / LOCKED | product scope, architecture guardrails, reuse catalog/matrix and completion plan established |
| W1 | GĐ4 L3B ADK invocation-local attachment materialization | DESIGN APPROVED | exact installed ADK proof; native Runner/artifact/LoadArtifactsTool first; only thin run-scoped adapter if required |
| W2 | GĐ4 L3C composer attachment UX | NOT STARTED | audit installed assistant-ui attachment API; reuse canonical upload/fileId; no second attachment state machine |
| W3 | GĐ4 L3D live Firebase/Gemini E2E | NOT STARTED | real file understanding + SSE + security/reload/cancel |
| W4 | Module composition/isolation hardening | NOT STARTED | harden existing registries; Task disable/remove proof; no second plugin runtime |
| W5 | Core/App Shell UX consolidation | NOT STARTED | reuse existing UI + selective mature primitives; Vietnamese/responsive shell |
| W6 | Home MVP UX | NOT STARTED | user-oriented start page using existing authorities |
| W7 | Agent panel MVP UX | NOT STARTED | reuse assistant-ui; Vietnamese chat/HITL/attachment presentation |
| W8 | Task reference module | NOT STARTED | reuse current Task/domain/capabilities; usable Task + lifecycle proof + Agent parity |
| W9 | Settings/module management UX | NOT STARTED | simple Task enable/disable/re-enable surface over canonical module state |
| W10 | MVP integrated acceptance | NOT STARTED | Core + Agent + Task user workflows E2E |
| W11 | Security/operations hardening | NOT STARTED | only justified Firebase/secrets/dependency/runtime hardening |
| W12 | Single-user UAT/release readiness | NOT STARTED | real-device + deployment + recovery + final canonical evidence |

## 4. Required order

### Milestone M1 — Finish document-to-Agent path

1. W1 — L3B.
2. W2 — L3C.
3. W3 — L3D.

Do not redesign Task/Home during L3B.

### Milestone M2 — Prove modular MVP foundation

4. W4 — composition/isolation hardening.

Task is the reference optional module. Required proof:

- enable;
- disable;
- re-enable;
- UI contribution disappears/returns;
- Task capability disappears/returns;
- Core + Agent remain healthy;
- module failure is contained;
- no second registry/authority/plugin runtime.

### Milestone M3 — Product UX consolidation

5. W5 — App Shell.
6. W6 — Home.
7. W7 — Agent panel.
8. W8 — Task.
9. W9 — Settings/module management.

Modify/reuse existing components and mature primitives; do not create a parallel frontend.

### Milestone M4 — MVP final integration/release

10. W10 — integrated acceptance.
11. W11 — justified security/operations hardening.
12. W12 — UAT/release readiness.

Declare `MVP FINAL PASS / LOCKED` only with canonical runtime evidence.

## 5. Mandatory pre-code gate for W1–W12

Before new production code, each workstream must record a **New-code necessity proof**:

1. user requirement;
2. existing Agent-Workspace source checked;
3. installed dependency checked;
4. official SDK/API checked;
5. mature GitHub implementation/pattern checked;
6. why direct reuse/configuration is insufficient;
7. smallest adapter/domain code still required;
8. application-owned tests actually needed.

Decision order:

`REUSE EXISTING -> USE INSTALLED API -> ADOPT OFFICIAL/MATURE PACKAGE -> ADAPT THIN BOUNDARY -> BUILD NEW LAST`.

Do not write new framework/infrastructure code without this gate.

## 6. Test minimization rule

Do not re-test generic upstream behavior. Test only Agent-Workspace-owned contracts/invariants and real workflows.

Examples of tests we own:

- canonical fileId/owner authorization before model access;
- run-scoped attachment authority;
- bounded read/cancellation;
- no durable binary/base64;
- module enable/disable capability/UI isolation;
- Task domain behavior and Agent parity;
- error mapping;
- end-to-end workflows.

Do not reproduce generic tests for ADK, Firebase SDK, assistant-ui, Radix/shadcn or optional mature libraries.

## 7. W1 — L3B acceptance

- clean exact-lockfile install;
- inspect exact installed `@google/adk` 2.1.0;
- prove supported `Runner` session/artifact DI and native artifact-loading seam;
- prefer native `LoadArtifactsTool` rather than custom Gemini document loop;
- canonical `UserFileService` remains file authority;
- only current-run authorized attachments can load;
- same-owner unattached, foreign and stale-turn files fail closed;
- lazy bounded read and cancellation preserved;
- no media-bearing durable history/base64/audit leak;
- no Runner bypass or second Agent runtime;
- capability count/business execution authorities remain unchanged;
- targeted application-boundary tests + locked regressions + canonical CI PASS;
- real Gemini/Firebase runtime evidence required before FINAL PASS.

## 8. W2 — L3C acceptance

- inspect exact installed assistant-ui attachment/runtime API first;
- reuse its attachment lifecycle/composer/thread primitives where compatible;
- reuse canonical `fileUploadClient` + `/api/files`;
- implement only canonical fileId adapter + Vietnamese UX + app-specific stale/abort/error mapping;
- attachment chips/remove/retry/pending;
- server remains size/type/authorization authority;
- persistent history stores safe refs only;
- temporary chat semantics correct;
- no data-URL/base64 canonical attachment state;
- no standalone browser Storage path.

## 9. W3 — L3D acceptance

Live probe:

`upload -> attach -> authorize -> bounded read -> Gemini understands content -> SSE -> reload/history`.

Also verify temporary chat, cancellation, malformed/foreign/oversized rejection and no binary/base64/storage-path leakage.

## 10. W4 — modularity acceptance

- client composition boundary;
- server composition boundary;
- existing registry remains canonical;
- registry contains no Task business behavior;
- Task capability ownership correctly registered;
- Core boots and Agent works with Task disabled;
- enable/disable/re-enable works;
- lifecycle failure containment;
- canonical CI module-isolation gate.

No marketplace or dynamic remote plugin system for MVP.

## 11. W5–W9 — common UX acceptance

- all user-facing language standardized in Vietnamese;
- no implementation jargon in normal UI;
- reuse existing/local mature UI primitives before custom components;
- reasonable keyboard/touch accessibility;
- loading/error/empty states;
- iPad landscape/portrait usability;
- basic iPhone usability;
- Agent panel collapsible;
- reduced unnecessary visual density/card nesting;
- no regression of locked runtime behavior.

## 12. W8 — Task reference module acceptance

Task must be a usable business module and the template for later modules:

- view/create/edit/complete/archive-delete according to canonical domain;
- useful status/priority/deadline/filtering only where justified;
- Agent query/create/update parity through existing capability architecture;
- persistence/reload;
- enable/disable/re-enable isolation;
- no duplicate auth, registry, confirmation or execution gateway.

Optional packages such as TanStack Query, dnd-kit, React Hook Form or date-fns require a concrete net-code/test-reduction proof before adoption.

## 13. W10 — MVP integrated scenarios

1. Login/open/reload.
2. View Home task summary.
3. Create Task via UI.
4. Query tasks via Agent.
5. Create/update Task via Agent.
6. Risky mutation uses canonical HITL where applicable.
7. Disable Task; verify UI/tool disappearance and Core/Agent health.
8. Re-enable Task; verify recovery.
9. Persistent chat reload.
10. Temporary chat non-persistence.
11. Attach document and ask a content-dependent question.
12. Stop/cancel generation.
13. Network/history/file error recovery.

## 14. Post-MVP backlog — do not start before MVP lock

- Quản lý tài liệu;
- Biên tập;
- Research;
- Định dạng văn bản hành chính;
- cross-module orchestration;
- connector ecosystem;
- additional modules.

Each begins with a fresh reuse audit and must pass module isolation.

## 15. Checkpoint log template

After every workstream checkpoint update `PROJECT_MASTER_PLAN.md` and this tracker as appropriate:

```text
Workstream:
Baseline:
Canonical HEAD:
Reused upstream components/APIs:
New-code necessity proof:
Files changed:
Production changes:
Application-owned targeted tests:
Locked regressions:
Full tests:
Build:
Manifest:
Runtime/live probe:
Known limitations:
Verdict:
Next action:
```

## 16. Current next action

**W1 — GĐ4 L3B**.

Do not implement a custom document runtime. First prove the exact installed ADK 2.1.0 native seam, then use the smallest possible adapter between canonical `UserFileService` and native ADK artifact loading. After implementation: checker -> AI Studio real runtime -> GitHub CI -> lock W1/L3B -> update this tracker -> open W2.
