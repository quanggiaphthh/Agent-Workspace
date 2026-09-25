# POST-MVP R1 — AGENT + TASK RELIABILITY CORRECTIVE

## 1. Classification

This is a bounded **post-MVP regression/security corrective**. It does not reopen W4–W12 and does not introduce a new product module, Agent runtime, persistence authority, capability registry, confirmation engine, or UI event system.

Canonical deployed production remains the W12 checkpoint until a new live deployment/smoke is explicitly completed.

## 2. Governance

Implementation followed the existing project gates:

`SOURCE AUDIT → REUSE AUDIT → NEW-CODE NECESSITY PROOF → TEST MINIMIZATION → BOUNDED IMPLEMENTATION → CANONICAL CI`

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

## 8. Canonical verification

Validated corrective source checkpoint:

`05a85501f8d98013ffcaa9d24d95e406493f1f34`

Canonical GitHub Actions:

- workflow: `GD4 Canonical Verification`;
- run number: **#135**;
- run id: **36082014418**;
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

## 9. Deployment status and remaining gate

This corrective source checkpoint is **verified source, not yet declared deployed production**.

The previous W12 production checkpoint remains the rollback/deployment authority until live rollout is completed.

Before promoting R1 to production, perform a bounded live smoke against the real Firebase/Gemini environment proving at minimum:

1. normal persistent Agent chat still streams and completes;
2. Task search resolves unique/ambiguous titles correctly;
3. Agent Task update/delete HITL deny and approve paths remain correct;
4. successful Agent Task create/update/delete automatically refreshes Task UI and Home stats exactly once;
5. reopening/restoring an old conversation does not replay navigation, refresh, notification, or mutation effects;
6. Temporary Chat and cancellation remain isolated;
7. Task disable/re-enable still blocks/restores Task capabilities without data loss;
8. `/api/health` remains healthy with persistent components.

Only after this live gate should the new deployed production checkpoint replace the W12 deployment anchor.

## 10. Verdict

**R1 SOURCE / STATIC VERIFICATION — PASS.**

**Production promotion — PENDING LIVE DEPLOYMENT + SMOKE.**
