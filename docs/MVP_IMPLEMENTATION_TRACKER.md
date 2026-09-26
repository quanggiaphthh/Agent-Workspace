# AGENT-WORKSPACE --- MVP IMPLEMENTATION TRACKER

> **Authority:** operational current status tracker.  
> Agent entry point: `AGENTS.md`.  
> Historical checkpoints: `PROJECT_MASTER_PLAN.md`.  
> Scope/reuse policy: `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`.  
> Detailed execution: `docs/MVP_EXECUTION_PHASES.md`.  
> Locked R1 report: `docs/POST_MVP_R1_AGENT_TASK_RELIABILITY_CORRECTIVE.md`.  
> Locked R2 report: `docs/POST_MVP_R2_RUNTIME_RELIABILITY_HARDENING.md`.  
> Locked H2 closeout: `docs/POST_MVP_H2_AGENT_WORKSPACE_UX_CLOSEOUT.md`.
> Locked H3 closeout: `docs/POST_MVP_H3_PERSONAL_TASK_WORKSPACE_CLOSEOUT.md`.
> H4 closeout evidence: `docs/H4_SECURITY_DATA_BOUNDEDNESS_DESIGN.md`.
> H5 implementation/verification and canonical closeout evidence: this tracker and `PROJECT_MASTER_PLAN.md`.

## 1. Current canonical context

- **MVP: FINAL PASS / LOCKED.**
- **Post-MVP R1: FINAL PASS / LOCKED.**
- **Post-MVP R2: FINAL PASS / LOCKED.**
- **H1: FINAL PASS / LOCKED.**
- **H2: FINAL PASS / LOCKED.**
- **H3: FINAL PASS / LOCKED.**
- **H4: FINAL PASS / LOCKED.**
- **H5: FINAL PASS / LOCKED.**
- R1 exact previously deployed stable checkpoint: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- Canonical GitHub Actions for R1 source: `36086993597` --- run #142 --- **SUCCESS**.
- R2 implementation checkpoint: `83e6c8940f21d43c3d791446f0d8017f65b866cd`.
- Canonical R2 implementation CI: `36089895220` --- run #152 --- **SUCCESS**.
- R2 documentation closeout baseline: `f583ef1842bfd75cc8dbb56cee6bc9dd1eeb88c1`.
- R2 closeout-baseline CI: `36097654993` --- run #156 --- **SUCCESS**, full Vitest **400/400 PASS**.
- H2 implementation/verification checkpoint: `ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8`.
- Canonical H2 implementation CI: `36191114409` --- run #179 --- **SUCCESS**, full Vitest **406/406 PASS**; QA Stage 1--5 PASS; W11 Security QA **15/15 PASS**; production build PASS; final manifest verification PASS.
- H2 documentation closeout commit: `2b979e0305a663c5d17a045d9c699230a4ca0cfb`.
- H2 closeout CI: `36191531441` --- run #180 --- **SUCCESS**.
- H3 implementation/verification checkpoint: `4761c12888daf07dca0d8e12526bc812ca6dd467`.
- H3 implementation CI: `36195511128` --- run #182 --- **SUCCESS**, full Vitest **412/412 PASS** across **43 files**; H3 targeted **6/6 PASS**; QA Stage 1--5 PASS; W11 Security QA **15/15 PASS**; production build PASS; final manifest verification PASS.
- H3 documentation closeout commit: `66a7bc195fd4f95bd2ab295dc3830464c76ce2a3`.
- H3 closeout CI: `36204398675` --- run #183 --- **SUCCESS**.
- H4 implementation checkpoint: `dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d`.
- H4 implementation CI: `36214906016` --- run #190 --- **SUCCESS**.
- H4 closeout-evidence commit: `a1d7c2778275ae11ccf47db4751b23920b82d2ff`.
- H4 closeout-evidence CI: `36215176584` --- run #191 --- **SUCCESS**.
- H5 implementation/verification checkpoint: `59a49451652a287c91eee7d792410a2faf3d7f98`.
- H5 verification evidence: targeted H5/H3 **124/124 PASS**; full Vitest **423/423 PASS**; lint, build, canonical QA and security QA **PASS**; W11 Security QA **15/15 PASS**; critical security findings **0**.
- GĐ1--GĐ4 / M1, W4--W12, R1, R2, H1, H2, H3, H4 and H5: **FINAL PASS / LOCKED**.
- Current next gate: **None. No successor workstream is approved by this tracker.**
- **R3: NOT OPENED.**
- Current deployed business capability count: **12** = Memory 2 + Task 5 + Web Search 1 + UI 4.
- Product mode: **single-user personal app, not public**.
- Post-MVP product modules and marketplace/public plugin ecosystem remain deferred.
- Documentation-only closeout commits do **not** replace implementation checkpoints.
- R2 live deployment was verified to contain the R2 implementation behavior and passed Live Promotion; available evidence does not independently establish an exact current deployed commit SHA.

## 2. Mandatory implementation gates

Every future explicitly approved bounded post-MVP implementation workstream continues to use:

**A SOURCE AUDIT → B REUSE AUDIT → C NEW-CODE NECESSITY PROOF → D TEST MINIMIZATION PLAN → E IMPLEMENTATION PLAN**

Then:

`IMPLEMENT → CHECKER → LIVE RUNTIME (if required) → CANONICAL CI → LOCK`

Do not reopen a locked MVP/R1/R2/H1/H2/H3/H4/H5 area without a reproducible regression, security issue, or explicitly approved post-MVP scope.

## 3. Workstream tracker

| ID | Workstream | Status | Next gate |
|---|---|---|---|
| W1 | GĐ4 L3B native ADK attachment materialization | FINAL PASS / LOCKED | closed |
| W2 | GĐ4 L3C composer attachment UX | FINAL PASS / LOCKED | closed |
| W3 | GĐ4 L3D real Firebase/Gemini full E2E | FINAL PASS / LOCKED | closed |
| W4 | Modular Foundation | FINAL PASS / LOCKED | closed |
| W5 | Core/App Shell UX | FINAL PASS / LOCKED | closed |
| W6 | Home UX | FINAL PASS / LOCKED | closed |
| W7 | Agent UX | FINAL PASS / LOCKED | closed |
| W8 | Task Completion UX | FINAL PASS / LOCKED | closed |
| W9 | Settings/local module management UX | FINAL PASS / LOCKED | closed |
| W10 | MVP integrated acceptance | FINAL PASS / LOCKED | closed |
| W11 | security/operations hardening | FINAL PASS / LOCKED | closed |
| W12 | UAT/deployment/release | FINAL PASS / LOCKED | closed |
| R1 | Post-MVP Agent + Task reliability/security corrective | FINAL PASS / LOCKED | closed |
| R2 | Provider/runtime reliability hardening | FINAL PASS / LOCKED | closed |
| H1 | Repository hygiene and type safety | FINAL PASS / LOCKED | closed |
| H2 | Agent Workspace UX — bounded client/UI projection improvement | **FINAL PASS / LOCKED** | closed |
| H3 | Personal Task Workspace UX — bounded client/UI improvement | **FINAL PASS / LOCKED** | closed |
| H4 | Security & Data Boundedness Hardening | **FINAL PASS / LOCKED** | closed |
| H5 | Personal Task Daily Workflow — bounded Task UX/data enhancement | **FINAL PASS / LOCKED** | closed |

No R3 or successor workstream is opened by this tracker.

## 4. Locked MVP/R1 foundation

Do not reopen without a reproducible regression:

- single-user Firebase Auth + production `OWNER_UID` binding;
- server-authoritative permissions with canonical permission allowlisting;
- server-authoritative module state, capabilities and HITL;
- ADK/Gemini Agent execution, SSE, cancellation, session/history and Temporary Chat;
- secure file ingestion, upload, canonical `fileId`, run-scoped attachment materialization and Gemini document access;
- deny-all direct browser Firestore and Storage access;
- encrypted personal AI credentials and audit/error secret redaction;
- modular Task enable/disable/re-enable isolation with durable data preservation;
- Task REST endpoints fail closed while the Task module is disabled;
- Vietnamese Core Shell, Home, Agent, Task and Settings UX;
- valid `YYYY-MM-DD` Task due-date validation at server/Agent boundaries;
- production diagnostic Firebase test route unavailable;
- HTTP security headers, payload limits, rate limiting and runtime health controls;
- dependency high/critical CI policy with a narrow, expiring reviewed ADK/adm-zip exception;
- Task create/edit modal respects `isOpen` and does not auto-open when entering the Task module;
- bounded Task cursor pagination while preserving complete current UI listing;
- exact-title Task resolution with explicit `none | unique | ambiguous` outcome;
- Firestore aggregate Task stats beyond the previous first-100 boundary;
- Agent Task search plus delete parity; update/delete require deterministic Task identity;
- `system.tasks.delete` is high-risk and requires server-authoritative HITL;
- Task create/update/delete requests refresh through existing UI-action semantics;
- trusted request-scoped Agent context cannot be overridden by client/dynamic ADK state;
- live and durable transcripts do not expose model reasoning;
- failed tool results remain failures in live UI and reloaded history;
- recovered HITL is only a candidate and is revalidated by server confirmation authority;
- historical/reloaded user turns with insufficient attachment provenance are replay-unsafe;
- SSE line/stream size is bounded;
- server-validated UI actions are projected through `clientCapabilityRegistry`;
- durable history cannot replay old UI actions; new live UI actions are applied at most once per `toolCallId`;
- Task list and Home stats consume the existing `canvas.refreshRequested` event;
- `ErrorBoundary` crash telemetry emits the strict `/api/log-error` contract;
- authenticated unknown `/api/*` routes fail as JSON `404 API_ROUTE_NOT_FOUND` before SPA fallback.

H4 additionally locks bounded newest-first Memory reads with explicit candidate-window keyword semantics and chunked retry-safe deletion of owned Task/Memory data, while preserving the canonical `UserDataService` authority.

## 5. R1 deployed evidence

R1 exact previously deployed stable source checkpoint:

`ee570f44516d639f7a6e00f5da3dc6427d597034`

GitHub Actions run `36086993597` (#142): **SUCCESS**.

R1 also passed bounded live Firebase/Gemini/browser promotion covering Agent streaming, Task unique/ambiguous search, update/delete HITL, exactly-once Task/Home refresh, replay safety, Temporary Chat/cancellation, Task disable/re-enable, health, ErrorBoundary telemetry and JSON API 404 behavior.

### Port/ingress note

The live environment exposes `PORT=8080`, while the current application source listens locally on port 3000. The AI Studio deployment wrapper forwards hosted ingress to the local application port, and live smoke evidence proves that mapping works. This is accepted for the current AI Studio deployment only; hard-coded port 3000 remains a portability debt for other deployment methods.

## 6. R2 implementation verification

R2 implementation checkpoint:

`83e6c8940f21d43c3d791446f0d8017f65b866cd`

GitHub Actions run `36089895220` (#152): **SUCCESS**.

R2 adds no dependency and changes no Agent/Task business behavior. It bounds external provider-management HTTP lifetime through a shared provider request policy:

- default 20-second timeout;
- optional `AI_PROVIDER_TIMEOUT_MS` override bounded to 1--120 seconds;
- invalid values fall back to the default;
- Google, OpenAI, Anthropic, NVIDIA NIM and OpenCodeZen adapters use the same helper;
- timeout becomes a safe `PROVIDER_TIMEOUT` / 504-style failure;
- focused behavior test proves a hung request is aborted deterministically.

See `docs/POST_MVP_R2_RUNTIME_RELIABILITY_HARDENING.md`.

## 7. R2 live promotion and evidence

**R2 LIVE PROMOTION --- PASS / LOCKED.**

**R2 LIVE EVIDENCE CORRECTIVE --- PASS.**

Bounded real-environment evidence verified:

1. owner access and application continuity;
2. Settings → Trợ lý AI model list;
3. valid credential/model provider request;
4. Agent SSE;
5. bounded Task/Home regression;
6. `/api/health` healthy.

The invalid-credential negative scenario is **SAFE-NOT-RUN** to preserve production credentials/secrets and is not recorded as PASS.

The synthetic timeout path is behavior-tested by the R2 implementation CI and was not forced against a real provider.

## 8. H2 implementation and closeout evidence

**H2 --- FINAL PASS / LOCKED.**

H2 is a bounded Agent Workspace UX workstream at the client/UI projection boundary. It does not replace or duplicate the canonical Agent runtime, ADK/Gemini provider path, session/history authority, HITL authority, attachment/file authority, capability gateway or module-state authorities.

Implementation/verification checkpoint:

`ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8`

Canonical GitHub Actions run `36191114409` (#179): **SUCCESS**.

Verification evidence includes full Vitest **406/406 PASS**, QA Stage 1--5 PASS, W11 Security QA **15/15 PASS**, production build PASS and final production-manifest verification PASS.

Documentation closeout commit:

`2b979e0305a663c5d17a045d9c699230a4ca0cfb`

Closeout GitHub Actions run `36191531441` (#180): **SUCCESS**.

See `docs/POST_MVP_H2_AGENT_WORKSPACE_UX_CLOSEOUT.md`.

## 9. H3 implementation and closeout evidence

**H3 --- FINAL PASS / LOCKED.**

H3 is a bounded Personal Task Workspace UX improvement within the existing Task/client projection boundary. It adds Board/List dual view, exactly three canonical statuses, compact smart filters, Quick Add, Task Detail side-panel editing, canonical status movement and responsive bounded UX. It does not add a new product module, backend/schema redesign, runtime authority, dependency or parallel Task authority.

Implementation/verification checkpoint:

`4761c12888daf07dca0d8e12526bc812ca6dd467`

Canonical GitHub Actions run `36195511128` (#182): **SUCCESS**, H3 targeted **6/6 PASS**, full Vitest **412/412 PASS** across **43 files**, QA Stage 1--5 PASS, W11 Security QA **15/15 PASS**, production build PASS and final production-manifest verification PASS.

Locked H3 closeout:

`docs/POST_MVP_H3_PERSONAL_TASK_WORKSPACE_CLOSEOUT.md`

Documentation closeout commit:

`66a7bc195fd4f95bd2ab295dc3830464c76ce2a3`

Closeout GitHub Actions run `36204398675` (#183): **SUCCESS**.

Bounded AI Studio Preview runtime/visual evidence confirmed Board/List dual view, exactly three canonical columns, real Task data, create UX, Task Detail side panel, canonical status mutation, refresh persistence, iPad landscape layout and App Shell coexistence. This evidence is bounded Preview evidence only and does not claim new production deployment/UAT. The transient initial Task-list load failure and Preview `/tasks` → `/` refresh behavior remain non-blocking environment-specific/deferred observations; neither opens corrective work.

The historical W12 wording “Task create/edit modal” is preserved as historical behavior. H3 supersedes only the current edit UX: create remains modal, while edit/detail uses the Task Detail side panel.

## 10. H4 implementation and closeout evidence

**H4 --- FINAL PASS / LOCKED.**

H4 is a bounded security/data-boundedness hardening workstream. It removes the legacy Firebase diagnostic identity exception, bounds Memory collection reads with explicit newest-first candidate-window keyword semantics, and chunks destructive owned Task/Memory cleanup into bounded retry-safe Firestore batches. It adds no product module, dependency, schema, search subsystem, runtime authority or multi-user behavior.

Integrated implementation checkpoint:

`dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d`

Canonical GitHub Actions run `36214906016` (#190): **SUCCESS**.

Closeout-evidence commit:

`a1d7c2778275ae11ccf47db4751b23920b82d2ff`

Closeout-evidence GitHub Actions run `36215176584` (#191): **SUCCESS**.

See `docs/H4_SECURITY_DATA_BOUNDEDNESS_DESIGN.md`.

## 11. H5 implementation and closeout evidence

**H5 --- FINAL PASS / LOCKED.**

H5 is a bounded Personal Task Daily Workflow enhancement within the existing canonical Task module. It adds backward-compatible due-date/time and server-authoritative completion metadata, the compact **Cần chú ý** center, deterministic daily attention filters, bounded recent completed-task Board projection with accessible List history, client-side reporting, Task Detail metadata/due-time editing, and preserves the three canonical statuses, REST/Agent Task capabilities, List search/filter/sort, permissions and responsive Board/List UX.

The implementation reuses the existing `UserDataService`, canonical Task REST API, `ServerCapabilityRegistry`, `authFetch`, event bus, module authority, permissions, HITL and idempotency. It adds no dependency, migration, Firestore collection, status, reporting backend, parallel Task authority or runtime authority.

Production implementation/verification checkpoint:

`59a49451652a287c91eee7d792410a2faf3d7f98`

Verification:

- Targeted H5/H3: **124/124 PASS**.
- Full Vitest: **423/423 PASS**.
- Lint: **PASS**.
- Build: **PASS**.
- Canonical QA: **PASS**.
- Security QA: **PASS**; W11 **15/15 PASS**; critical findings **0**.
- Timezone corrective: **PASS** in default checker timezone, UTC and `Asia/Ho_Chi_Minh`.

Documentation-only reconciliation does not replace the production checkpoint. R3 remains unopened and no H6 workstream is opened.

## 12. Deployment / rollback anchor

- R2 implementation checkpoint: `83e6c8940f21d43c3d791446f0d8017f65b866cd`.
- R1 exact previously deployed stable/rollback checkpoint: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- R2 documentation closeout baseline `f583ef1842bfd75cc8dbb56cee6bc9dd1eeb88c1` is not an implementation checkpoint.
- H2 implementation/verification checkpoint is `ef123bc2fa7b20f5ffac11f4506a09c798d1dfa8`; H2 documentation closeout commit `2b979e0305a663c5d17a045d9c699230a4ca0cfb` is documentation evidence and does not redefine deployment SHA semantics.
- H3 implementation/verification checkpoint is `4761c12888daf07dca0d8e12526bc812ca6dd467`; H3 documentation closeout commit `66a7bc195fd4f95bd2ab295dc3830464c76ce2a3` and closeout CI #183 are documentation evidence and do not redefine exact deployed-source SHA semantics.
- H4 implementation checkpoint is `dbf17228ba7fe6182a20f962ba0ed3ed2f2b4d3d`; H4 documentation evidence does not assert that checkpoint is the exact currently deployed source.
- H5 implementation/verification checkpoint is `59a49451652a287c91eee7d792410a2faf3d7f98`; later documentation-only reconciliation does not replace this production checkpoint.
- R2 live deployment was verified to contain R2 implementation behavior and passed Live Promotion; the available evidence does not independently establish an exact current deployed commit SHA.
- Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, key ID and other production secrets across redeploy/rollback.
- Source rollback does not automatically revert or delete Firestore/Storage data.
- Rules must be rolled back only with a source version known to be compatible with the target application checkpoint.

## 13. Current completion rule

**AGENT-WORKSPACE MVP --- FINAL PASS / LOCKED.**

**POST-MVP R1 --- FINAL PASS / LOCKED.**

**POST-MVP R2 --- FINAL PASS / LOCKED.**

**H1 --- FINAL PASS / LOCKED.**

**H2 --- FINAL PASS / LOCKED.**

**H3 --- FINAL PASS / LOCKED.**

**H4 --- FINAL PASS / LOCKED.**

**H5 --- FINAL PASS / LOCKED.**

**R3 --- NOT OPENED.**

All currently approved workstreams are closed. No successor workstream is opened by this record.
