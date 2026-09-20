# GĐ3 LƯỢT 4 — HITL TOOL RESUME + RELOAD RECOVERY + TOOL LIFECYCLE HARDENING

## 1. Baseline
Source of truth: `agent-workspace-gd3-luot3-adk-tool-bridge.zip`.
Canonical SHA-256 verified before edits: `a81d84ce1dca02d42014a1ef375e191a4a797561beb92019c2ca9d561f27d810`.
ZIP integrity PASS; 222 entries; Lượt 1/2/3 reports present. Lượt 3 bridge uses native ADK `FunctionTool`, server-owned `sessionId`, ADK `functionCallId`, `CapabilityExecutionService`, and native ADK continuation.

## 2. Pre-implementation HITL/ADK map
A. Pending confirmation is persisted by `CapabilityConfirmationService` in Firestore collection `capability_confirmations`.
B. Baseline record bound `confirmationId`, authenticated `userId`, `capabilityId`, normalized `inputHash`, created/expiry timestamps and `consumedAt`.
C. Baseline confirmation record did **not** persist `functionCallId` / Agent logical execution identity.
D. `sessionId` was server-derived in `/api/agent/chat` and propagated into `CapabilityToolAdapter`, but was not part of the confirmation record.
E. GĐ2 reload reconstruction (`reconstructPendingConfirmations`) rebuilds native `adk_request_confirmation` UI state from persisted ADK history. It does not itself execute a capability. Actual resume remains owned by native ADK when the reconstructed FunctionResponse is submitted.
F. There is no separate approval endpoint for Agent HITL. Client sends an ADK FunctionResponse (`adk_request_confirmation`) through the strict `/api/agent/chat` contract.
G. After ADK resumes the original FunctionTool, `CapabilityToolAdapter` calls `CapabilityExecutionService`; no frontend executor exists.
H. The FunctionTool return value is converted by native ADK into the correlated FunctionResponse and returned to the native reasoning loop.
I. Browser reload destroys browser-memory state, but persistent chats retain ADK events in `FirestoreSessionService`; temporary chats intentionally do not gain durable conversation history.
J. Reconstruction is data-driven: persisted ADK history + server session identity + native ADK Runner/session service. No closure/callback serialization exists or was added.
K. Baseline rejection returned a deterministic rejected tool result but did not terminally consume the server confirmation challenge.
L. Expiry/replay/user/capability/input mismatch were already fail-closed in confirmation policy; execution/session binding was the material missing protection.

## 3. Actual gap
The confirmation authority was strong for user/capability/input but was not bound to the Agent execution identity (`sessionId` + `functionCallId`). Rejection also left the server challenge reusable. Temporary-chat HITL safety persistence was implicit rather than explicitly marked. These gaps could permit a valid challenge to be presented against the wrong logical Agent execution even though mutation idempotency itself remained protected.

## 4. Architecture before
`FunctionCall -> CapabilityToolAdapter -> CapabilityExecutionService -> ConfirmationService(user/capability/input) -> ADK confirmation -> adapter -> gateway -> mutation idempotency -> handler -> FunctionResponse -> ADK`.

## 5. Architecture after
The same architecture is retained. Confirmation records now additionally bind server-owned execution data: source, sessionId, functionCallId, logical execution identity, and a temporary-mode marker. Approval/rejection/cancellation are validated transactionally against that binding. No registry, gateway, Runner, queue, or workflow engine was added.

## 6. Confirmation authority
`CapabilityConfirmationService` remains the sole confirmation authority. It still uses one Firestore collection and one random confirmation ID. Existing user/capability/input/TTL/single-use protections remain. New terminal decision semantics are stored on the same record (`pending|approved|rejected|cancelled`).

## 7. Pending execution context
Persisted safety context is intentionally bounded: authenticated user ID, capability ID, normalized input hash, source, server-owned sessionId, ADK functionCallId, derived logical execution identity, temporary-mode marker, timestamps/status. Raw arguments, credentials, API keys, model internals, callbacks and tool results are not persisted in the confirmation record.

## 8. Approval flow
ADK supplies the resumed original tool invocation. Adapter uses the trusted capability descriptor and server runtime metadata; client payload cannot replace capability/arguments/session/source. Gateway re-runs canonical preflight before confirmation consume, then `ConfirmationService.consume` validates exact binding transactionally, then mutation idempotency claims the original `agent:<sessionId>:<functionCallId>` identity, then handler runs. Approval success is never treated as execution success by itself.

## 9. Rejection flow
Rejection now requires the server confirmation identity and atomically terminally consumes that same challenge with decision `rejected` before returning `CONFIRMATION_REJECTED`. Missing/replayed/mismatched rejection fails closed. Handler is not invoked.

## 10. Reload recovery
Persistent-chat reload continues to use GĐ2 ADK history reconstruction. The reconstructed native confirmation FunctionResponse is submitted to the same server-owned session. When native ADK resumes the FunctionTool, the gateway validates the original challenge against sessionId/functionCallId/logical identity before execution. No browser-memory callback is required.

Runtime proof of the real installed ADK reload/resume behavior remains deferred because `npm ci` timed out and dependencies are absent. No native ADK capability is fabricated in this report.

## 11. Reload-after-success recovery
No new dedupe scheme was added. Lượt 2 execution records remain mutation truth. A retry with the same original sessionId/functionCallId reaches the same logical execution and reconciles `SUCCEEDED` instead of invoking the handler again. This layer was not runtime-regression-tested in this environment because Vitest dependencies could not be installed.

## 12. Stale/expired semantics
Expired, consumed, wrong-user, wrong-capability and wrong-input confirmations remain fail-closed. New execution mismatch fails closed when source/session/functionCall/logical identity differs. A challenge associated with an aborted pending Agent execution can be terminally marked `cancelled` and later approval is rejected.

## 13. Concurrent approval
`consume`, `reject`, and `cancel` use Firestore transactions. Only a transaction that observes a valid pending record can terminally update it; later concurrent/replay attempts observe terminal state and fail. Lượt 2 mutation idempotency remains defense-in-depth after approval.

## 14. Replay protection
Approval/rejection/cancellation are terminal on the same confirmation record. `consumedAt` continues to produce `CONFIRMATION_REPLAY`; cancellation has an explicit safe failure code.

## 15. Authorization re-check
`CapabilityExecutionService` still executes canonical registry preflight with `confirmed=false` before consuming approval. Module/permission/capability availability therefore must still pass at approval time. The adapter never treats confirmation payload as capability authority.

## 16. Idempotency interaction
Ordering remains: canonical preflight -> confirmation consume -> mutation execution claim -> handler. Agent identity remains `agent:<server sessionId>:<ADK functionCallId>`. No REST-style key is generated for Agent resume.

## 17. ADK continuation
Lượt 3 native FunctionTool architecture is unchanged. Successful approved execution returns through FunctionTool so native ADK can create the correlated FunctionResponse and continue reasoning. Rejection returns a deterministic non-success tool result. Full native continuation after a real reload requires runtime verification with installed `@google/adk`.

## 18. Tool lifecycle authority
ConfirmationService = confirmation truth. Capability execution record = mutation/idempotency truth. ADK/session history = conversation/tool-call truth. AuditService = security/observability truth. UI = projection only. No second persisted tool lifecycle state machine was added.

## 19. SSE/UI
No SSE redesign. Existing ADK event transport/reconstruction remains. Approval is not represented as tool success; the capability result still must pass through the gateway/FunctionTool. No second completion path was added.

## 20. Session/history
Persistent session/history design is unchanged. No new conversation DB. Confirmation records contain only bounded safety metadata; they are not conversation history.

## 21. Temporary Chat
Temporary Chat still selects the in-memory session service and does not gain durable normal conversation history. A confirmation may use the existing short-lived Firestore confirmation record for safety/TTL/replay protection; the record is explicitly marked `temporaryMode:true` and contains no raw conversation/tool arguments. This does not convert Temporary Chat into a persistent conversation.

## 22. Cancellation/timeout
Existing GĐ2 AbortSignal/deadline remains authoritative. Adapter registers cancellation of a created pending challenge against the same execution binding. No second timeout was introduced. Confirmation TTL remains the pending expiry mechanism. Ambiguous post-handler-start mutation semantics remain Lượt 2 authority.

## 23. Security
Hardened against capability substitution, argument substitution (hash + original ADK invocation), cross-user approval, execution/session/tool-call substitution, approval replay, rejection replay, cancellation replay, client-forged source/session authority, and approval-as-success. Confirmation payload remains bounded and excludes raw arguments. No credentials or tool results were added to confirmation persistence.

## 24. Files changed
Production: `server.ts`; `server/agent/adk/CapabilityToolAdapter.ts`; `server/core/capabilities/CapabilityExecutionService.ts`; `server/core/capabilities/CapabilityConfirmationService.ts`; `server/core/capabilities/CapabilityConfirmationPolicy.ts`; `PRODUCTION_SOURCE_MANIFEST.sha256`.

Tests added: `server/agent/adk/__tests__/hitlToolResume.test.ts`; `server/core/capabilities/__tests__/confirmationResumeContext.test.ts`.

## 25. Tests added/changed
32 new Lượt 4 targeted behavioral/policy tests were added: 20 adapter/HITL bridge tests + 12 confirmation binding-policy tests. They cover binding, substitution resistance, rejection terminality, cancellation marking, Temporary Chat marker, safe errors, gateway-only approval execution and server-owned identity. Existing Lượt 2/3 tests remain present.

## 26. Lượt 4 targeted results
**NOT RUN.** `npm ci --ignore-scripts` timed out; `node_modules` is absent. Do not infer PASS from source inspection.

## 27. Lượt 3 regression
`capabilityToolBridge.test.ts`, `toolDiscovery.test.ts`, `nativeToolLoop.test.ts`: **NOT RUN** because dependencies are unavailable.

## 28. Lượt 2 regression
`executionIdempotency.test.ts`, `restIdempotencyContract.test.ts`: **NOT RUN** because dependencies are unavailable. Therefore Lượt 2 runtime status remains deferred; no FINAL PASS claim.

## 29. Lượt 1 regression
`capabilityContract.test.ts`: **NOT RUN** because dependencies are unavailable.

## 30. Full Vitest
**NOT RUN** — dependencies unavailable after `npm ci` timeout.

## 31. QA
Canonical static/behavior QA scripts that run without installed npm dependencies: **238/238 PASS**.
- Stage 1: 22/22
- Stage 2: 22/22
- Stage 3A: 8/8
- Stage 3B: 9/9
- Stage 3C: 8/8
- Stage 4A: 20/20
- Stage 4B: 43/43
- Stage 4C: 42/42
- Stage 4D: 40/40
- Stage 5 static: 24/24

Direct invocation of `qa-stage4c-behavior.mjs` with plain Node initially failed because Node cannot load the imported `.ts` module in that invocation mode; canonical `qa-stage4c.mjs` runs its intended behavior/integration harness and passed 42/42.

## 32. TypeScript
**NOT RUN.** `npm run lint` requires dependencies. In particular, installed `@google/adk` v2 API compatibility and Lượt 3 `maxLlmCalls` remain runtime-verification items.

## 33. Build
**NOT RUN.** Dependencies unavailable; no Gemini API call was made.

## 34. Manifest
Existing coverage policy preserved. Old count: 131. New count: 131. Matched: 131. Mismatched: 0. Missing: 0. Hashes updated only for covered production files changed by this lượt.

## 35. Remaining risks
1. Real installed ADK behavior for confirmation resume across browser/process request boundaries is not runtime-proven here.
2. New 32 targeted tests have not executed; TypeScript/API shape errors remain possible until dependencies install.
3. Lượt 1/2/3 runtime regression and build remain deferred.
4. Cancellation marking is best-effort on the existing AbortSignal; Firestore unavailability during cancellation cannot be converted into a false safe-retry claim.

## 36. Explicit non-goals
No new registry, gateway, workflow engine, queue, auth/session/SSE redesign, task update/delete, file/workspace subsystem, connectors/plugins, generic HTTP fetch, real Gemini call, commit, push, deploy, AI Studio upload, or GĐ3 Lượt 5 work.

## 37. Final verdict
**IMPLEMENTATION COMPLETE — RUNTIME VERIFICATION REQUIRED**

The implementation/checkpoint is ready for checker source audit, but runtime gates are explicitly not claimed because npm dependencies could not be installed in this environment.
