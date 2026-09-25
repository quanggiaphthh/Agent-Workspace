# POST-MVP R1 — AGENT + TASK RELIABILITY CORRECTIVE

## 1. Classification

This is a bounded **post-MVP regression/security corrective**. It does not reopen W4–W12 and does not introduce a new product module, Agent runtime, persistence authority, capability registry, confirmation engine, or UI event system.

R1 has completed source/static verification and bounded live promotion against the real Firebase/Gemini/browser environment. The R1 source checkpoint is now the canonical deployed production checkpoint.

## 2. Governance

Implementation followed the existing project gates:

`SOURCE AUDIT → REUSE AUDIT → NEW-CODE NECESSITY PROOF → TEST MINIMIZATION → BOUNDED IMPLEMENTATION → CANONICAL CI → LIVE PROMOTION`

Reuse decisions:

- keep `ServerCapabilityRegistry` and `CapabilityExecutionService` as server execution authorities;
- keep `CapabilityConfirmationService` as HITL authority;
- keep Google ADK as Agent runtime;
- keep Firebase/Firestore as persistence authority;
- reuse `clientCapabilityRegistry`, `eventBus`, `navigationService`, `UserDataService`, and existing Agent session/history code;
- no new dependency and no second client/server registry or event bus.

## 3. Pass A — Agent trust + presentation correctness

Corrected app-owned trust/presentation boundaries:

- client `stateDelta` is narrowed to bounded presentation context and cannot provide identity/permission/capability authority;
- `aiConfig` is validated through the canonical request contract;
- ADK runtime context cannot override request-scoped trusted context;
- tool failures expose safe structured recovery metadata instead of internal handler/provider details;
- live reasoning is not projected into the end-user transcript;
- failed tool responses are rendered as failures rather than successful operations;
- Task confirmation hints are human-readable.

Focused tests lock the trusted ADK context boundary.

## 4. Pass B — Task query + deterministic entity resolution

Corrected the previous first-100/exhaustiveness weakness:

- Task listing has bounded cursor pagination (`listTasksPage`);
- existing REST/UI compatibility listing walks bounded pages instead of silently truncating after 100;
- Agent `system.tasks.list` returns `nextCursor` and cannot treat page one as the entire dataset;
- `system.tasks.search` performs exact-title resolution and returns `none | unique | ambiguous`;
- update/delete instructions require a unique resolved Task ID and forbid guessing when ambiguous;
- Task statistics use Firestore aggregate counts rather than a truncated list.

The existing Firestore indexes already cover the ordered Task page queries. No second datastore or search subsystem was added.

## 5. Pass C — Task mutation completion

Completed Task mutation parity through existing authorities:

- `system.tasks.delete` added as Task-owned high-risk mutation with mandatory HITL and `tasks.delete` permission;
- create/update/delete successful output carries a bounded `uiAction: refresh` targeting `tasks`;
- Task UI uses canonical server-returned records, separates form/page errors, clears deleted selected entities, and handles open-state filters consistently;
- Task list and Home stats both listen to the existing `canvas.refreshRequested` event.

Current canonical business capability inventory is **12**:

- Memory: 2;
- Task: 5 (`create`, `list`, `search`, `update`, `delete`);
- Web Search: 1;
- UI: 4.

## 6. Pass D — Recovery/history correctness

Corrected durable-history and resumed-HITL semantics:

- recovered HITL entries are only candidates; server authority revalidates confirmation identity, scope, expiry, and consumption before execution;
- completed/rejected confirmations are not reconstructed as pending;
- durable history classifies failed FunctionResponses as failures;
- FunctionResponse transport entries are not presented as human-authored messages;
- hydrated historical user turns are marked replay-unsafe where attachment provenance is insufficient;
- SSE buffering and total streamed bytes have explicit safety bounds;
- durable history never reintroduces hidden reasoning.

## 7. Pass E — runtime/deployment reality check

Fresh audit confirmed Firebase configuration/index compatibility for the new Task query paths.

A remaining integration defect was identified in the existing `AdkToolHandler`: it directly invoked navigation/event primitives and could interpret restored tool responses as fresh UI commands. The corrective reuses the canonical client capability registry:

- server UI outputs are projected through a strict whitelist (`openModule`, `openEntity`, `refresh`, `showNotification`);
- malformed/failed/unknown outputs fail closed;
- Task mutation refresh output uses the same projection path;
- all tool responses already present when a live run starts are marked as seen;
- only new responses from the live run are actionable;
- each UI action is claimed before execution and applied at most once per `toolCallId`;
- restored durable history is display-only and cannot replay navigation, refresh, or notification side effects.

Focused projection tests cover Task refresh, canonical UI actions, failure, unknown actions, and malformed payloads.

## 8. Pass F — pre-promotion operability corrective

A fresh post-audit pass identified two small confirmed defects outside the Agent/Task business logic. Both were corrected without changing API architecture, Firebase persistence, Agent runtime, capability policy, module policy, or dependencies:

- `ErrorBoundary` previously posted legacy fields (`error`, `info`) to the strict `/api/log-error` endpoint and was rejected with HTTP 400. It now maps to the canonical bounded shape: `message`, `source`, optional `stack`, and `context.componentStack`;
- unknown authenticated `/api/*` GET paths previously could fall through to the production SPA catch-all and return `index.html`. A terminal JSON API 404 handler now returns `404` with `API_ROUTE_NOT_FOUND` before static SPA routing.

Minimal regression evidence was added only for these app-owned boundaries:

- ErrorBoundary telemetry payload shape;
- authenticated unknown API route returns JSON 404 rather than SPA HTML.

No Task pagination behavior, module composition, credential architecture, server router refactor, dependency graph, or other unrelated area was reopened.

## 9. Canonical source verification

Validated corrective source checkpoint:

`ee570f44516d639f7a6e00f5da3dc6427d597034`

Canonical GitHub Actions:

- workflow: `GD4 Canonical Verification`;
- run number: **#142**;
- run id: **36086993597**;
- result: **SUCCESS**.

The run passed:

- dependency/security policy;
- production manifest verification;
- TypeScript;
- targeted GĐ4 gates;
- capability tool bridge;
- full Vitest;
- QA Stage 1–5;
- W11 Security QA;
- production build;
- final manifest verification.

## 10. Live promotion evidence

Exact deployed source commit:

`ee570f44516d639f7a6e00f5da3dc6427d597034`

Production URL:

`https://ais-pre-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`

Development URL:

`https://ais-dev-3hkmqjcbdyqj2c6m3q4vm3-34773317344.asia-southeast1.run.app`

### Port / ingress verification

- runtime container environment exposed `PORT=8080`;
- application source still binds its local server to port `3000`;
- the current AI Studio deployment wrapper forwards the hosted preview/production ingress to the local port 3000 application server;
- live production smoke proved this mapping is functional for the current deployment environment.

Therefore port handling is **not a blocker for the current AI Studio deployment**. The hard-coded port remains a deployment-portability debt and must not be generalized as a portable Cloud Run contract for other deployment methods.

### Live smoke results

All bounded R1 promotion scenarios passed:

1. persistent Agent chat streams and completes normally;
2. Task exact-title search distinguishes `unique` and `ambiguous` without guessing an ID;
3. Task update HITL: deny causes no mutation; approve performs the mutation;
4. Task delete HITL: deny preserves the Task; approve deletes it and clears matching selected UI state;
5. Agent Task create/update/delete refreshes Task UI and Home statistics exactly once through the canonical refresh projection;
6. restored/reloaded history does not replay old navigation, refresh, notification, or mutation effects;
7. Temporary Chat remains non-persistent and response cancellation terminates the current stream without stale completion;
8. disabling the Task module removes Task surfaces/capabilities, Task REST fails closed, data remains preserved, and re-enable restores the module;
9. `/api/health` reports healthy persistent components;
10. ErrorBoundary telemetry is accepted by `/api/log-error` using the corrected strict payload contract;
11. authenticated unknown `/api/*` requests return JSON `404 API_ROUTE_NOT_FOUND` rather than SPA HTML.

## 11. Rollback anchor

- Canonical deployed production checkpoint: `ee570f44516d639f7a6e00f5da3dc6427d597034`.
- Previous known-good deployed checkpoint: `3cb25f3c38917577e6b0106324b136a099883d9a`.
- Preserve `OWNER_UID`, `CREDENTIAL_ENCRYPTION_KEY`, encryption key ID and all production secrets across rollback.
- Source rollback does not automatically revert or delete Firestore/Storage data.

## 12. Verdict

**R1 LIVE PROMOTION — PASS.**

**POST-MVP R1 — FINAL PASS / LOCKED.**
