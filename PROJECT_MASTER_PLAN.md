# AGENT-WORKSPACE --- PROJECT MASTER PLAN & PROGRESS TRACKER

> **Authority:** canonical technical checkpoints and locked evidence.  
> **R2 implementation checkpoint:** `83e6c8940f21d43c3d791446f0d8017f65b866cd`.  
> **Canonical R2 implementation CI:** `36089895220` --- run #152 --- SUCCESS.  
> **R2 documentation closeout baseline:** `f583ef1842bfd75cc8dbb56cee6bc9dd1eeb88c1`; canonical CI `36097654993` --- run #156 --- SUCCESS.  
> **R1 exact previously deployed stable checkpoint:** `ee570f44516d639f7a6e00f5da3dc6427d597034`.  
> **H2 implementation/verification checkpoint:** `ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8`; canonical CI `36191114409` --- run #179 --- SUCCESS.  
> **H2 documentation closeout:** `2b979e0305a663c5d17a045d9c699230a4ca0cfb`; closeout CI `36191531441` --- run #180 --- SUCCESS.  
> **H3 implementation/verification checkpoint:** `4761c12888daf07dca0d8e12526bc812ca6dd467`; canonical CI `36195511128` --- run #182 --- SUCCESS.
> **H3 documentation closeout:** `66a7bc195fd4f95bd2ab295dc3830464c76ce2a3`; closeout CI `36204398675` --- run #183 --- SUCCESS.
> **H4 implementation/verification checkpoint:** `dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d`; canonical CI `36214906016` --- run #190 --- SUCCESS.
> **H4 closeout-evidence commit:** `a1d7c2778275ae11ccf47db4751b23920b82d2ff`; canonical CI `36215176584` --- run #191 --- SUCCESS.
> **H5 implementation/verification checkpoint:** `59a49451652a287c91eee7d792410a2faf3d7f98`; targeted H5/H3 **124/124 PASS**; full Vitest **423/423 PASS**; lint, build, canonical QA and security QA **PASS**; W11 **15/15 PASS**; critical security findings **0**.
> **Current milestone:** **MVP FINAL PASS / LOCKED; POST-MVP R1 FINAL PASS / LOCKED; POST-MVP R2 FINAL PASS / LOCKED; H1 FINAL PASS / LOCKED; H2 FINAL PASS / LOCKED; H3 FINAL PASS / LOCKED; H4 FINAL PASS / LOCKED; H5 FINAL PASS / LOCKED**.
> **R3: NOT OPENED.**  
> Documentation-only closeout commits do not replace implementation checkpoints.

## 1. Canonical authority model

- `AGENTS.md` --- operational entry point for coding agents.
- `PROJECT_MASTER_PLAN.md` --- locked technical checkpoints and evidence.
- `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md` --- MVP scope, critical path and reuse governance.
- `docs/MVP_IMPLEMENTATION_TRACKER.md` --- operational current status.
- `docs/MVP_EXECUTION_PHASES.md` --- detailed execution sequence/history.
- `docs/ARCHITECTURE_GUARDRAILS.md` --- mandatory architecture constraints.
- `docs/CANONICAL_REUSE_MATRIX_SOURCE_LEVEL.md` --- source/package/API reuse decisions.
- `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md` --- locked R1 corrective evidence and live-promotion record.
- `docs/POST_MVP_R2_RUNTIME_RELIABILITY_HARDENING.md` --- locked R2 provider/runtime reliability, live-promotion and live-evidence record.
- `docs/POST_MVP_H2_AGENT_WORKSPACE_UX_CLOSEOUT.md` --- locked H2 Agent Workspace UX implementation/verification and documentation-closeout evidence.
- `docs/POST_MVP_H3_PERSONAL_TASK_WORKSPACE_CLOSEOUT.md` --- locked H3 Personal Task Workspace implementation/verification and documentation-closeout evidence.
- `docs/H4_SECURITY_DATA_BOUNDEDNESS_DESIGN.md` --- H4 implementation/verification and closeout evidence.

Coding agents read `AGENTS.md` first. If wording conflicts, the Tracker is current-status authority; this file governs locked checkpoint evidence; Architecture Guardrails govern mandatory architecture constraints.

## 2. Locked architecture authorities

The following remain canonical and must not be duplicated:

- `ServerCapabilityRegistry` --- runtime capability registry.
- `CapabilityExecutionService` --- capability execution gateway.
- `ConfirmationService` --- HITL/confirmation authority.
- Zod --- runtime validation.
- `UserFileService` --- file authority.
- `FileIngestionService` --- secure ingestion authority.
- Google ADK --- Agent runtime.
- Gemini --- AI provider.
- Current Firebase stack --- persistence/storage stack.
- `LocalModuleRegistry` --- canonical client module-state authority.
- `ServerModuleCatalog` --- canonical server module-state authority.
- `clientCapabilityRegistry` + existing `eventBus`/`navigationService` --- canonical client projection path for validated UI actions.

No second Agent runtime, file authority, capability registry/gateway, confirmation engine, module-state authority, event bus or storage subsystem may be introduced without architecture escalation.

## 3. Canonical implementation governance

Every future bounded implementation workstream uses:

**A. SOURCE AUDIT → B. REUSE AUDIT → C. NEW-CODE NECESSITY PROOF → D. TEST MINIMIZATION PLAN → E. IMPLEMENTATION PLAN**

Then:

`IMPLEMENT → CHECKER → LIVE RUNTIME (when required) → CANONICAL CI → LOCK`

Reuse priority:

`REUSE_LOCAL → EXTEND_LOCAL → REUSE_DEPENDENCY → ADAPT_EXTERNAL → BUILD MINIMUM NEW CODE`

A gate failure or unsupported seam requires STOP, not an architectural workaround. Do not re-test generic upstream behavior or unrelated locked areas unless the current change can affect them.

## 4. Canonical project status

| Area | Status | Canonical evidence |
|---|---|---|
| GĐ1 | FINAL PASS / LOCKED | single-user owner foundation |
| GĐ2 | FINAL PASS / LOCKED | Agent execution/chat runtime, SSE, cancellation, session/history, temporary chat/recovery |
| GĐ3 | FINAL PASS / LOCKED | capability execution, idempotency, native ADK tools, HITL/resume |
| GĐ4 L1/L2 | FINAL PASS / LOCKED | persistent file authority + secure end-user upload |
| GĐ4 L3A | FINAL PASS / LOCKED | attachment contract, authorization, bounded read, safe durable metadata |
| GĐ4 L3B | FINAL PASS / LOCKED | native ADK artifact materialization + run-scoped bridge + real Gemini runtime proof |
| GĐ4 L3C | FINAL PASS / LOCKED | composer attachment integration over canonical `/api/files` + `fileId` |
| GĐ4 L3D / M1 | FINAL PASS / LOCKED | real Firebase + Gemini full Document → Agent E2E |
| W4 | FINAL PASS / LOCKED | modular composition/isolation, lifecycle ordering, Task ownership |
| W5 | FINAL PASS / LOCKED | Core/App Shell UX |
| W6 | FINAL PASS / LOCKED | Home daily-dashboard UX |
| W7 | FINAL PASS / LOCKED | Agent UX |
| W8 | FINAL PASS / LOCKED | Task completion UX |
| W9 | FINAL PASS / LOCKED | Settings + local module management UX |
| W10 | FINAL PASS / LOCKED | integrated live MVP acceptance |
| W11 | FINAL PASS / LOCKED | security + operations hardening |
| W12 | FINAL PASS / LOCKED | production deployment, release smoke and final Task-modal corrective |
| R1 | FINAL PASS / LOCKED | Agent/Task reliability corrective; exact previously deployed stable source `ee570f4...`, Actions #142 SUCCESS, bounded live smoke PASS |
| R2 | **FINAL PASS / LOCKED** | provider HTTP lifetime hardening; implementation `83e6c89...`, Actions #152 SUCCESS; Live Promotion PASS; Live Evidence Corrective PASS |
| H1 | **FINAL PASS / LOCKED** | repository hygiene, Express request typing, metadata and lockfile cleanup; TypeScript/Vitest/build PASS |
| H2 | **FINAL PASS / LOCKED** | bounded Agent Workspace UX at client/UI projection boundary; implementation `ef123bc2...`; Actions #179 SUCCESS; closeout #180 SUCCESS |
| H3 | **FINAL PASS / LOCKED** | bounded post-MVP Personal Task Workspace UX improvement: Board/List dual view, 3 canonical statuses, smart filters, Quick Add, Task Detail side panel, canonical status workflow and responsive bounded UX; implementation `4761c128...`; Actions #182 SUCCESS; closeout #183 SUCCESS |
| H4 | **FINAL PASS / LOCKED** | bounded security/data hardening: diagnostic identity exception removed; bounded Memory reads; chunked retry-safe owned-data cleanup; implementation `dbf17228...`; Actions #190 SUCCESS; closeout evidence #191 SUCCESS |
| H5 | **FINAL PASS / LOCKED** | bounded Personal Task Daily Workflow enhancement: backward-compatible Task time metadata, attention center, bounded completed Board projection, report aggregation, Task Detail metadata and preserved List history; implementation `59a4945...`; targeted/full verification PASS |

Current deployed business capability inventory remains **12** --- Memory 2, Task 5, Web Search 1, UI 4.

## 5. Locked product scope

Canonical MVP remains exactly:

**CORE WEBAPP + AGENT CHATBOX + TASK MODULE**

The deployed product is a **single-user personal app, not public**.

Deferred post-MVP modules remain: Biên tập; Quản lý tài liệu; Research; Định dạng văn bản hành chính; RAG/vector DB; connector ecosystem; marketplace/public plugin ecosystem; multi-user/team/org/billing; custom Agent runtime.

R1 and R2 do not add new product modules. H1 is maintenance. H2 is a bounded Agent Workspace UX improvement, H3 is a bounded Personal Task Workspace UX improvement, H4 is bounded security/data hardening, and H5 is a bounded Personal Task Daily Workflow enhancement; none adds a product module or replaces runtime authorities.

A standalone File Library is not an MVP workstream.

## 6. Locked deployed behavior

The locked live evidence across R1 and R2 proves:

`Firebase owner login → Vietnamese Core Shell/Home/Agent/Task/Settings → persistent/temporary Agent chat → browser upload → canonical fileId attachment → authorized run-scoped ADK artifact → Gemini reads document → deterministic Task list/search/create/update/delete → HITL deny/approve → exactly-once Task/Home refresh → reload persistence without replaying UI side effects → cancellation without stale completion → Task disable/re-enable with durable data preservation → recoverable-error continuation`.

R2 additionally verified the provider-management path in the live environment, including AI model listing and a valid credential/model provider request, while preserving Agent SSE and bounded Task/Home behavior. The invalid-credential negative scenario was intentionally **SAFE-NOT-RUN** to preserve production credentials/secrets.

Locked deployed properties include:

- production `OWNER_UID` fail-closed owner binding;
- canonical permission allowlisting; no arbitrary custom permission expansion;
- deny-all direct browser Firestore and Storage access;
- server-authoritative module state across Agent capabilities and Task REST APIs;
- secure file ownership and bounded reads; no durable binary/base64 history persistence;
- encrypted personal AI credentials with secret redaction;
- production diagnostic Firebase test route unavailable;
- strict Task due-date validation (`YYYY-MM-DD` or empty);
- bounded Task cursor pagination with deterministic exact-title resolution;
- Task aggregate statistics not truncated at the first 100 records;
- `system.tasks.delete` with mandatory server-authoritative HITL;
- trusted Agent context cannot be overridden by client/dynamic ADK state;
- live/durable transcripts do not expose model reasoning;
- recovered HITL remains server-revalidated;
- SSE buffering is bounded;
- server-validated UI actions go through `clientCapabilityRegistry` and are replay-safe/exactly-once per `toolCallId`;
- Task list and Home stats refresh automatically after successful Agent Task mutations;
- Task module disable hides navigation/widgets/capabilities and blocks Task REST operations while preserving data;
- Task create/edit modal respects `isOpen` and does not auto-open on route entry;
- `ErrorBoundary` telemetry conforms to the strict `/api/log-error` schema;
- unknown authenticated `/api/*` routes return JSON `404 API_ROUTE_NOT_FOUND` rather than SPA HTML;
- dependency security policy and W11 Security QA are included in canonical CI;
- Memory listing is server-bounded and deterministic; keyword matching uses an explicit bounded newest-candidate window rather than an unbounded collection read;
- destructive owned Task/Memory cleanup is processed in bounded Firestore chunks and is retry-safe after partial progress.

H2 preserves these authorities and behaviors while improving the Agent workspace UI projection. H2 does not migrate the Agent runtime to assistant-ui, change ADK/Gemini execution, alter session/history persistence, change attachment/fileId semantics, replace HITL authority, or create a parallel capability/module registry.

The historical W12 wording “Task create/edit modal” is preserved as historical behavior. H3 evolves only the current edit UX: Task creation remains modal, while Task edit/detail is now presented in the Task Detail side panel.

## 7. Release evidence

### 7.1 Checkpoint and deployment semantics

- R1 exact previously deployed stable source checkpoint: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- R2 implementation checkpoint: `83e6c8940f21d43c3d791446f0d8017f65b866cd`.
- R2 implementation CI: `36089895220` (#152) --- **SUCCESS**.
- R2 documentation closeout baseline: `f583ef1842bfd75cc8dbb56cee6bc9dd1eeb88c1`.
- R2 closeout-baseline CI: `36097654993` (#156) --- **SUCCESS**, including full Vitest **400/400 PASS**.
- H2 implementation/verification checkpoint: `ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8`.
- H2 implementation CI: `36191114409` (#179) --- **SUCCESS**, full Vitest **406/406 PASS**, QA Stage 1--5 PASS, W11 **15/15 PASS**, production build PASS and final manifest verification PASS.
- H2 documentation closeout: `2b979e0305a663c5d17a045d9c699230a4ca0cfb`.
- H2 closeout CI: `36191531441` (#180) --- **SUCCESS**.
- H3 implementation/verification checkpoint: `4761c12888daf07dca0d8e12526bc812ca6dd467`.
- H3 implementation CI: `36195511128` (#182) --- **SUCCESS**, H3 targeted **6/6 PASS**, full Vitest **412/412 PASS** across **43 files**, QA Stage 1--5 PASS, W11 Security QA **15/15 PASS**, production build PASS and final manifest verification PASS.
- H3 documentation closeout: `66a7bc195fd4f95bd2ab295dc3830464c76ce2a3`.
- H3 closeout CI: `36204398675` (#183) --- **SUCCESS**.
- H4 implementation checkpoint: `dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d`.
- H4 implementation CI: `36214906016` (#190) --- **SUCCESS**.
- H4 closeout-evidence commit: `a1d7c2778275ae11ccf47db4751b23920b82d2ff`.
- H4 closeout-evidence CI: `36215176584` (#191) --- **SUCCESS**.
- Production URL: `https://ais-pre-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.
- Development URL: `https://ais-dev-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`.

R2 live deployment was verified to contain the R2 implementation behavior and passed Live Promotion. The available evidence does **not** independently establish an exact current deployed commit SHA; therefore this plan does not label later implementation or documentation checkpoints as the exact current deployed source.

### 7.2 Canonical R1 source CI

GitHub Actions run `36086993597` (#142) succeeded on the exact R1 previously deployed stable source checkpoint, including dependency policy, manifest verification, TypeScript, targeted regressions, capability tool bridge, full Vitest, QA Stage 1--5, W11 Security QA, production build and final manifest verification.

### 7.3 R1 live promotion verification

The exact source checkpoint `ee570f44516d639f7a6e00f5da3dc6427d597034` was deployed and passed the bounded real Firebase/Gemini/browser smoke:

1. persistent Agent chat stream/complete;
2. Task search distinguishes unique/ambiguous results;
3. Task update HITL deny/approve;
4. Task delete HITL deny/approve;
5. create/update/delete refreshes Task UI and Home stats exactly once;
6. restored history does not replay old UI actions;
7. Temporary Chat and cancellation remain isolated;
8. Task disable/re-enable blocks/restores Task surfaces without data loss;
9. `/api/health` healthy;
10. ErrorBoundary telemetry accepted;
11. unknown authenticated `/api/*` returns JSON 404 rather than SPA HTML.

### 7.4 R2 live promotion and evidence corrective

**R2 LIVE PROMOTION --- PASS / LOCKED.**

**R2 LIVE EVIDENCE CORRECTIVE --- PASS.**

The bounded live evidence verified AI model list, valid credential/model provider request, Agent SSE, bounded Task/Home regression, and application health/continuity. The invalid-credential negative scenario is **SAFE-NOT-RUN** to avoid modifying or replacing production credentials/secrets. It is not recorded as PASS.

The synthetic provider-timeout path remains behavior-tested by the R2 implementation CI and was not forced against a real provider.

### 7.5 H2 Agent Workspace UX verification

**H2 --- FINAL PASS / LOCKED.**

H2 implementation/verification checkpoint `ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8` passed canonical Actions #179 (`36191114409`) with full Vitest **406/406 PASS**, QA Stage 1--5 PASS, W11 Security QA **15/15 PASS**, production build PASS and final manifest verification PASS.

The H2 documentation closeout commit `2b979e0305a663c5d17a045d9c699230a4ca0cfb` then passed canonical Actions #180 (`36191531441`) with all verification steps successful.

H2 remains bounded to Agent workspace UI/client projection: Closed/Panel/Focus workspace states, responsive presentation, canonical context/suggestion projection, composer/attachment affordance, conversation/memory secondary surfaces, activity/HITL presentation and accessibility improvements. Canonical runtime and security authorities remain unchanged.

### 7.6 H3 Personal Task Workspace verification

**H3 --- FINAL PASS / LOCKED.**

H3 is a bounded post-MVP Personal Task Workspace UX improvement at the existing Task/client projection boundary. It adds Board/List dual view, exactly three canonical statuses (**Cần làm / Đang thực hiện / Hoàn thành**), compact smart filters, Quick Add, Task Detail side-panel editing, canonical status workflow and bounded responsive desktop/iPad/narrow presentation while preserving existing search/filter/sort and Task CRUD. It does not add a new product module, backend/schema redesign, runtime authority or dependency.

The H3 implementation/verification checkpoint `4761c12888daf07dca0d8e12526bc812ca6dd467` passed canonical Actions #182 (`36195511128`) with H3 targeted **6/6 PASS**, full Vitest **412/412 PASS** across **43 files**, QA Stage 1--5 PASS, W11 Security QA **15/15 PASS**, production build PASS and final production-manifest verification PASS.

The H3 documentation closeout commit `66a7bc195fd4f95bd2ab295dc3830464c76ce2a3` then passed canonical Actions #183 (`36204398675`) with **SUCCESS**.

Bounded AI Studio Preview runtime/visual evidence confirmed Board/List dual view, the three canonical columns, real Task data rendering, create UX, Task Detail side panel, canonical status mutation, persistence after refresh, iPad landscape layout and App Shell coexistence. This is bounded Preview evidence only and does **not** claim a new production deployment/UAT for H3.

The transient initial Task-list load failure that recovered after refresh remains a deferred observation because it was not reproduced as a stable canonical-source defect. The AI Studio Preview `/tasks` → `/` refresh behavior remains an environment-specific observation, not a canonical production-source defect. Neither observation opens corrective work or a successor workstream.

### 7.7 H4 Security & Data Boundedness verification

**H4 --- FINAL PASS / LOCKED.**

H4 preserves the private single-owner architecture while removing the legacy Firebase diagnostic identity exception and bounding selected data operations. The integrated implementation checkpoint is `dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d`, canonical Actions #190 (`36214906016`) **SUCCESS**. The closeout-evidence commit `a1d7c2778275ae11ccf47db4751b23920b82d2ff` passed Actions #191 (`36215176584`) **SUCCESS**.

H4-B locks Memory results to default 50 / maximum 100 with a newest 500-document keyword candidate window and deterministic `createdAt desc` + document-ID ordering. H4-C deletes owned Task/Memory documents in repeated chunks of 400, propagates later failures and permits safe retry from remaining documents. No schema, dependency, search subsystem, product module or multi-user authority was added.

### 7.8 H5 Personal Task Daily Workflow verification

**H5 --- FINAL PASS / LOCKED.**

H5 is a bounded post-MVP enhancement within the existing private single-user Task/client projection boundary. It extends the canonical Task contract backward-compatibly with optional due time and server-authoritative completion metadata, while preserving legacy Task reads and ownership semantics. The workspace adds the compact **Cần chú ý** center, deterministic today/week/overdue/high-priority projections, a bounded recent-completed Board projection with List/history access, client-side work reporting, Task Detail metadata and due-time editing, and keeps the canonical three statuses, List search/filter/sort, canonical REST/Agent Task capabilities, and responsive Board/List UX.

H5 does not add a Task collection, status, Board entity, archive system, reporting backend, dependency, migration, persistence authority or runtime authority. Existing `UserDataService`, canonical REST routes, `ServerCapabilityRegistry`, permissions, HITL/idempotency and module authority remain canonical.

Final production checkpoint:

`59a49451652a287c91eee7d792410a2faf3d7f98`

Independent verification evidence: targeted H5/H3 **124/124 PASS**; full Vitest **423/423 PASS**; lint, build, canonical QA and security QA **PASS**; W11 Security QA **15/15 PASS**; critical security findings **0**. The timezone fixture corrective passed in the default checker timezone, UTC and `Asia/Ho_Chi_Minh`.

Documentation-only reconciliation does not replace the H5 production checkpoint.

### 7.9 Port / ingress deployment note

The live environment exposes `PORT=8080`, while the current source binds its local server to port 3000. The current AI Studio deployment wrapper forwards hosted ingress to the local port 3000 server, and live smoke evidence proves that mapping works for this deployment environment.

This does **not** establish hard-coded port 3000 as a portable Cloud Run contract. Port binding remains deployment-portability debt if deployment moves outside the current wrapper.

## 8. Post-R2 / H2 / H3 / H4 / H5 verification summary

R2 live promotion and the live-evidence corrective verified provider-management HTTP lifetime hardening on the real Firebase/Gemini environment without reopening locked Agent/Task behavior. H1 subsequently closed repository-hygiene/type-safety maintenance. H2 improved the Agent workspace UI/client projection, H3 improved the Personal Task Workspace UI/client projection, H4 closed the bounded security/data-hardening scope, and H5 closed the bounded Personal Task Daily Workflow enhancement. H5 verification passed targeted H5/H3, full Vitest, lint, build, canonical QA and security QA gates. No successor workstream is opened by this closeout.

## 9. Rollback / operations anchor

- R2 implementation checkpoint: `83e6c8940f21d43c3d791446f0d8017f65b866cd`.
- R1 exact previously deployed stable rollback checkpoint: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- R2 documentation closeout baseline `f583ef1842bfd75cc8dbb56cee6bc9dd1eeb88c1` is not an implementation checkpoint.
- H2 implementation/verification checkpoint: `ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8`.
- H2 documentation closeout `2b979e0305a663c5d17a045d9c699230a4ca0cfb` is documentation evidence, not an exact deployed-source assertion.
- H3 implementation/verification checkpoint: `4761c12888daf07dca0d8e12526bc812ca6dd467`.
- H3 documentation closeout `66a7bc195fd4f95bd2ab295dc3830464c76ce2a3` and closeout CI #183 are documentation evidence and do not redefine exact deployed-source SHA semantics. H3 Preview runtime/visual evidence is bounded evidence only, not production deployment/UAT.
- H4 implementation checkpoint `dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d` and closeout evidence `a1d7c2778275ae11ccf47db4751b23920b82d2ff` do not assert an exact current deployed-source SHA.
- H5 implementation/verification checkpoint: `59a49451652a287c91eee7d792410a2faf3d7f98`. Any later documentation-only reconciliation commit does not replace this production checkpoint.
- Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, key ID and all production secrets across redeploy/rollback.
- Source rollback does not automatically delete or revert Firestore/Storage data.
- Security rules must be rolled back only with a source version known to be compatible with the target application checkpoint.
- Keep the narrow ADK→adm-zip dependency exception under its documented expiry/review policy; do not use `npm audit fix --force` as a release shortcut.

## 10. Post-MVP boundary

MVP, R1, R2, H1, H2, H3, H4 and H5 are closed. Do not reopen locked areas for enhancement work without a reproducible regression/security issue or an explicitly approved bounded workstream.

There is no currently approved successor workstream in this record. **R3 is NOT OPENED.** Any future work must be explicitly classified as a reproducible regression/security corrective or an independently approved post-MVP bounded workstream/module.

Static packaged module composition remains intentional. Do not introduce marketplace/remote plugin loading merely to replace static imports.

## 11. Current completion rule

**AGENT-WORKSPACE MVP --- FINAL PASS / LOCKED.**

**POST-MVP R1 --- FINAL PASS / LOCKED.**

**POST-MVP R2 --- FINAL PASS / LOCKED.**

**H1 --- FINAL PASS / LOCKED.**

**H2 --- FINAL PASS / LOCKED.**

**H3 --- FINAL PASS / LOCKED.**

**H4 --- FINAL PASS / LOCKED.**

**H5 --- FINAL PASS / LOCKED.**

**R3 --- NOT OPENED.**
