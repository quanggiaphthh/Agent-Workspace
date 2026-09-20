# GĐ3 LƯỢT 3 — ADK TOOL EXECUTION BRIDGE + MULTI-STEP TOOL LOOP

## 1. Baseline
- Source of truth: `agent-workspace-gd3-luot2-execution-idempotency.zip`.
- Canonical SHA-256 verified: `1b1f5c9e27b90ca1ebf0321d0e5edeab19d2af6846631729ab3091c7068de0d9`.
- ZIP integrity: PASS; archive entries: 218.
- `GD3_LUOT1_CAPABILITY_CONTRACT.md`, `GD3_LUOT2_EXECUTION_IDEMPOTENCY.md`, `executionIdempotency.test.ts`, `restIdempotencyContract.test.ts`, and `capabilityContract.test.ts` all existed before modification.
- GĐ3 Lượt 2 was treated as IMPLEMENTATION/CHECKPOINT VERIFIED only; no FINAL PASS was assumed.

## 2. Pre-implementation ADK map
A. RootAgent is constructed in `server/agent/adk/RootAgent.ts::RootAgent.buildAgent`, invoked by `/api/agent/chat` in `server.ts`.

B. Tool definitions were built in `RootAgent.buildAgent`: `ServerCapabilityRegistry.listForContext(...)` → config filter → `CapabilityToolAdapter.createTool(...)`.

C. `CapabilityToolAdapter` exposed one native `@google/adk` `FunctionTool` per trusted capability descriptor. Its `execute` callback called `CapabilityExecutionService` rather than the capability handler directly.

D. Server filtering was split intentionally: `ServerCapabilityRegistry.listForContext` owns module availability + permission checks; `filterAgentCapabilitiesForConfig` owns server-parsed Agent settings (`memoryEnabled`, `webSearchEnabled`). No frontend list is authoritative.

E. Function declarations are native ADK `FunctionTool` declarations. The canonical Zod `inputSchema` is passed as `parameters`; ADK v2 supports Zod v3/v4. Runtime validation remains `ServerCapabilityRegistry.execute`.

F. FunctionCall events are consumed by the native ADK `LlmAgent`/`InMemoryRunner` loop created in `server.ts`; no application-side FunctionCall loop existed.

G. Baseline adapter attempted `context.toolCallId`; current ADK ToolContext contract exposes `functionCallId`. This was a concrete bridge gap for mutation identity.

H. FunctionResponse is created by native ADK from the `FunctionTool` return value. The application does not fabricate normal tool-response events.

I. Native ADK returns FunctionResponse events through the same `runner.runAsync` stream. The existing Firestore session service persists non-partial ADK events.

J. Native ADK is responsible for feeding FunctionResponse back to the model and continuing reasoning. A fake-model behavioral test was added to prove this without Gemini; execution of that test is deferred because dependencies could not be installed in this environment.

K. Sequential multi-tool reasoning is a native ADK mechanism, not a custom loop. A fake model now tests model → tool A → model → tool B → model final text.

L. Gemini/ADK may represent more than one FunctionCall in a model turn. No second scheduler was introduced. Exact parallel scheduling semantics were not runtime-verified here; see §13/§28.

M. ADK events are persisted by the existing session service. `server/agent/chat/sessionHistory.ts` already projects `functionCall.id/name/args` and `functionResponse.id/name/response`, preserving correlation in transcript views.

## 3. Existing gap
The baseline had a real native FunctionTool adapter, but mutation execution identity could be lost because it read `toolCallId` instead of ADK `functionCallId`, and session identity was not passed into the adapter as server-owned runtime metadata. Consequently an Agent mutation could reach the Lượt 2 gateway without the `(sessionId, toolCallId)` pair and fail `IDEMPOTENCY_KEY_REQUIRED`. Tool failures also returned gateway `error` text directly to ADK, allowing raw handler exception messages into FunctionResponse. Tool-name collision behavior was registration-order dependent. No explicit LLM-call defensive bound existed for an ADK hallucinated-tool loop.

## 4. Architecture before
`/api/agent/chat → RootAgent.buildAgent → listForContext → config filter → CapabilityToolAdapter(FunctionTool) → CapabilityExecutionService → ServerCapabilityRegistry → handler`, with native ADK responsible for FunctionCall/FunctionResponse/model continuation.

## 5. Architecture after
The same architecture is retained. Changes harden its trust/correlation boundaries: server derives session identity before agent construction; RootAgent passes `{sessionId, abortSignal}` to each adapter; adapter reads ADK `functionCallId`; gateway remains the sole execution path; tool failures are projected to bounded/sanitized error objects; server discovery policy is repeated at execution for Web Search/Memory settings; native ADK loop is bounded with `maxLlmCalls: 12`.

## 6. Tool discovery
- Authority remains `ServerCapabilityRegistry.listForContext` plus server-parsed AI config filtering.
- Permission-filtered and disabled-module capabilities are absent before declaration.
- `system.web.search` is absent when `webSearchEnabled=false`.
- `system.memory.*` is absent when `memoryEnabled=false`.
- Execution repeats Web Search/Memory config checks so stale calls fail closed with `CAPABILITY_DISABLED`.

## 7. Function declaration
`FunctionTool.parameters` receives the canonical Zod input schema. No JSON-schema registry or second schema authority was added. Current production capabilities use Zod constructs supported by ADK v2. Unsupported capability IDs that cannot fit the conservative 64-character ADK function-name boundary fail deterministically during tool construction rather than being silently weakened.

## 8. FunctionCall mapping
`CapabilityToolNameRegistry` now uses injective `cap_<utf8-hex>` names. Mapping is order-independent, reversible/lookup-safe, uses only `[A-Za-z0-9_]`, and has a defensive collision invariant. `RootAgent` additionally asserts uniqueness before constructing tools. Unknown/forged names do not resolve to capability IDs. The model never supplies a canonical capability ID to the gateway.

## 9. CapabilityExecutionService integration
All tool executions continue to call `CapabilityExecutionService.execute`. The adapter does not call `descriptor.execute`. Therefore Zod validation, permission/module checks, confirmation, mutation idempotency, output validation, result byte boundary, and audit remain centralized.

## 10. FunctionResponse
Native ADK converts FunctionTool return values into FunctionResponse. Successful gateway results are returned normally. Failures are converted to deterministic safe objects containing only safe code/message plus required confirmation metadata; raw stack/handler error/credential text and oversized result bodies are not returned.

## 11. Continued reasoning
A targeted fake-`BaseLlm` test (`nativeToolLoop.test.ts`) emits FunctionCall A, observes native ADK continuation, emits FunctionCall B, then emits final natural-language text. It asserts both FunctionResponse IDs/names and final text. No Gemini call is used. Runtime execution is pending dependency availability.

## 12. Sequential calls
The application does not hard-code one tool per run. Native ADK owns repeated model/tool turns. The new fake-model test covers two sequential tool calls and a third/final model response.

## 13. Parallel-call policy
No custom parallel scheduler was added. Current policy is: preserve native ADK behavior and preserve each call's provider `functionCallId`; mutation calls still pass independently through Lượt 2 atomic claim/idempotency. Exact ADK v2 same-turn parallel scheduling was not runtime-verified in this environment. No claim of new parallel safety is made.

## 14. HITL interaction
Existing `CapabilityConfirmationService` is reused. Pre-approval execution returns a canonical challenge and requests ADK confirmation. Mutation handler is not run. Approval passes the original capability/args/user/session/functionCallId plus confirmationId to the same gateway. Rejection records the decision and returns a safe cancellation result. No second HITL state machine was created.

## 15. Idempotency interaction
Agent mutation identity is now explicitly server session ID + ADK `functionCallId`. Same logical retry reconciles/deduplicates; same args with a distinct functionCallId remains an independent intentional execution. Model arguments cannot substitute session identity.

## 16. Cancellation/deadline
The existing request-scoped GĐ2 `executionDeadline.signal` is passed to RootAgent tools and then to `CapabilityExecutionService`/handler context. No tool-local timeout was added. A targeted test uses the existing `createExecutionDeadline` to assert deadline cancellation reaches the gateway path.

## 17. Session/history
No session redesign. ADK/session events remain conversation truth; Lượt 2 execution records remain mutation/idempotency truth; audit remains security/observability truth. Existing transcript projection preserves FunctionCall/FunctionResponse IDs.

## 18. SSE/UI interaction
No SSE redesign and no frontend executor. Existing ADK event stream continues through `adkEventStream`; transport complete/error remains the only outer terminal path. Tool events do not create a second completion path.

## 19. Files changed
Production: `server.ts`; `server/agent/adk/RootAgent.ts`; `server/agent/adk/CapabilityToolAdapter.ts`; `server/core/capabilities/capabilityToolNameRegistry.ts`; `server/core/capabilities/serverCapabilityRegistry.ts`; `PRODUCTION_SOURCE_MANIFEST.sha256`.

Tests: `server/agent/adk/__tests__/capabilityToolBridge.test.ts` (new); `server/agent/adk/__tests__/toolDiscovery.test.ts` (new); `server/agent/adk/__tests__/nativeToolLoop.test.ts` (new); plus existing RootAgent test call sites updated in `src/__tests__/acceptance.test.ts`, `src/__tests__/credential-workflow.test.ts`, `src/__tests__/model-regression.test.ts` for the new trusted runtime metadata parameter.

Documentation: this file.

## 20. Tests
26 targeted Lượt 3 behavioral tests were added across the three new test files, covering discovery, permission/module/Web Search filtering, deterministic mapping/collision defense/unknown names, canonical gateway routing, malformed args, safe errors, invalid/oversized output, continued reasoning, two sequential tools, toolCallId preservation, mutation retry/distinct calls, HITL pending/approval/rejection, cancellation/deadline, trusted session identity, and event correlation.

Runtime status: NOT EXECUTED because `npm ci` could not complete in the environment (two attempts timed out; the second used `--prefer-offline --no-audit --no-fund`). `node_modules/.bin/vitest` was unavailable afterward. No test PASS is claimed.

## 21. Lượt 2 regression verification
Required files exist: `executionIdempotency.test.ts`, `restIdempotencyContract.test.ts`. Runtime regression could not be executed because dependency installation timed out. Therefore Lượt 2 remains not FINAL PASS in this checkpoint.

## 22. Lượt 1 regression verification
`capabilityContract.test.ts` exists. Runtime execution could not be performed for the same dependency reason. The source retains nine production capabilities, explicit semantics, legacy high-risk compatibility, output validation and 524,288-byte boundary.

## 23. Full Vitest
NOT RUN. Dependency installation blocked runtime verification; `vitest` binary was unavailable. No PASS is claimed.

## 24. QA
Dependency-free QA scripts executed successfully through Stage 4A:
- Stage 1: 22/22 PASS
- Stage 2: 22/22 PASS
- Stage 3A: 8/8 PASS
- Stage 3B: 9/9 PASS
- Stage 3C: 8/8 PASS
- Stage 4A: 20/20 PASS
Total executed static QA: 89/89 PASS.

`qa-stage4b-behavior.mjs` then stopped because the dependency-backed TypeScript loader was unavailable (`ERR_UNKNOWN_FILE_EXTENSION .ts` after the interrupted dependency install). Later dependency-backed QA stages were not claimed.

## 25. Build
NOT RUN successfully. `npm ci` timed out and dependencies were incomplete. A global `tsc --noEmit` probe failed immediately on missing type-definition packages from the incomplete install; this is environment/dependency incompleteness, not reported as source PASS or source FAIL. `npm run build` was therefore not falsely claimed.

## 26. Manifest
Existing coverage philosophy retained. Old count: 131. New count: 131. Manifest regenerated only for covered paths whose content changed. Verification: 131 matched, 0 mismatched, 0 missing.

## 27. Security
- Model cannot choose arbitrary canonical capability ID; it receives server-built FunctionTools only.
- Permission/module/config filtering remains server-owned and execution re-checks authority.
- Confirmation remains server-authoritative and precedes mutation claim/handler execution.
- Client/model cannot bypass `CapabilityExecutionService` through the adapter.
- Session identity is server-derived; model args cannot replace it.
- ADK `functionCallId` is preserved as Lượt 2 toolCallId.
- Safe FunctionResponse projection removes raw internal exception text and oversized raw output.
- 512 KiB successful result boundary remains canonical.
- Mutation retry remains protected by durable Lượt 2 identity/claim semantics.
- No credentials were added to source/checkpoint.
- No audit record is exposed as tool output.
- A minimal native ADK `maxLlmCalls: 12` bound was added to prevent unbounded/hallucinated tool loops without creating a second tool scheduler.

## 28. Remaining risks
1. Runtime dependencies could not be installed, so the 26 new behavioral tests, Lượt 1/Lượt 2 regression tests, full Vitest, lint and build still require execution in AI Studio or another dependency-complete environment.
2. Exact `@google/adk` v2 runtime behavior for same-turn parallel FunctionCalls is not certified by this environment. No custom scheduler was introduced; mutation safety still relies on per-call Lượt 2 identity.
3. Current ADK v2 has reported upstream behavior where hallucinated unknown tool names may abort/retry inside ADK before normal tool error callbacks. This checkpoint bounds LLM calls and returns safe outer transport errors; it does not patch/fork ADK.
4. The hex function-name mapping deliberately fails capability IDs that would exceed the conservative function-name limit. All current nine production IDs fit; future registrations must satisfy this constraint or adopt an explicitly reviewed mapping revision.

## 29. Explicit non-goals
No new registry, gateway, custom agent runtime, frontend executor, tasks update/delete, file/workspace subsystem, connectors/plugins, generic HTTP fetch, audit/auth/session/SSE/confirmation redesign, workflow engine, job queue, real Gemini call, commit, push, deploy, AI Studio upload, or GĐ3 Lượt 4 work was performed.

## 30. Final verdict
**IMPLEMENTATION COMPLETE — RUNTIME VERIFICATION REQUIRED**

Reason: implementation/checkpoint work is complete and dependency-free gates available here passed, but mandatory runtime lint/Vitest/Lượt 1/Lượt 2 regression/build gates could not be executed because `npm ci` did not complete in this environment. This is not FINAL PASS and not READY FOR CHECKER under the stricter all-available-runtime-gates condition.
