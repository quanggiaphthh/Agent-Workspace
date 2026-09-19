# GĐ2 – LƯỢT 3: END-TO-END CANCELLATION + TIMEOUT/ERROR RECOVERY

## 1. Baseline identity

Source of truth: `agent-workspace-gd2-luot2-final.zip`.

Checker SHA-256 and locally verified SHA-256: `1f8d50277706ab593bd161eb5b127ba44ea5cc7463da44492765ea268620a23f`.

Scope is limited to cancellation, stale-run isolation, execution timeout, error/recovery behavior, and targeted tests. Session/history reconciliation and Temporary Chat redesign are unchanged.

## 2. Cancellation call graph before this fix

| Layer | File/function | Primitive | Baseline behavior |
|---|---|---|---|
| Stop UI/runtime | `src/agent/ui/AdkRuntimeProvider.tsx` `cancelRun()` | `AbortController.abort()` | CANCELLED at browser fetch; immediately set running/loading false. |
| Browser transport | `sendPayloadToAgent()` -> `authFetch()` | `fetch(..., signal)` | SIGNAL PROPAGATED to fetch/ReadableStream. |
| Server HTTP | `server/core/runtime/requestCancellation.ts` `bindRequestCancellation()` | request `aborted`/`close`, response `close` | SIGNAL PROPAGATED to a server AbortController. |
| Agent route | `server.ts` POST `/api/agent/chat` | `abortSignal` in execution context and `runner.runAsync()` | SIGNAL PROPAGATED to project execution stack. |
| ADK runner | `InMemoryRunner.runAsync({... abortSignal })` | ADK 2.1.0 runtime input | Project passes signal; installed ADK source was unavailable in this environment, so deeper internal behavior is not claimed. |
| Root model | `server/agent/adk/RootAgent.ts` | `RotatingGemini.generateContentAsync(..., abortSignal)` | SIGNAL PROPAGATED for rotating path. Single-candidate path delegates to ADK `Gemini`. |
| Gemini | ADK `Gemini.generateContentAsync` | signal parameter as invoked by project/ADK | UNKNOWN at actual network socket because dependency source/install is unavailable. No claim that Gemini network execution is guaranteed cancelled. |
| SSE bridge | `server.ts` Web `ReadableStream` -> Node `Readable` -> Express | none explicit for reader | STREAM ONLY CLOSED/indirect; client abort signalled runner but the Web reader was not explicitly cancelled. |
| Late frontend async work | `sendPayloadToAgent()` `catch/finally` | no run identity | UNSAFE: old run `finally` could clear running/loading owned by a newer run; late old events could mutate transcript. |

## 3. Cancellation call graph after this fix

`Stop -> AgentRunGate.cancel() -> AbortController.abort() -> fetch abort -> HTTP disconnect -> bindRequestCancellation AbortSignal -> execution deadline composite signal -> Runner.runAsync abortSignal + ExecutionContext abortSignal -> RootAgent/tool context -> RotatingGemini abortSignal -> ADK Gemini call (network cancellation not independently proven)`.

Additionally, the server SSE bridge listens to the same execution signal and explicitly calls `reader.cancel()`; an intentional client disconnect destroys the bridge so no further SSE writes occur. Listener/timer resources are detached on normal close/finish.

Frontend `AgentRunGate` gives each run an identity. Only the current token may mutate streamed messages/tool confirmations, append a failure, or clear lifecycle state in `finally`.

## 4. ADK 2.1.0 cancellation evidence

`package-lock.json` resolves `@google/adk` to **2.1.0**. Project evidence:

- `server.ts` supplies `abortSignal` to `InMemoryRunner.runAsync`.
- `ExecutionContext.abortSignal` is supplied to capability/tool execution.
- `RootAgent.ts` implements `RotatingGemini.generateContentAsync(llmRequest, stream?, abortSignal?)` and forwards the signal to the delegated Gemini generator.
- Capability execution already checks/propagates abort state through `CapabilityExecutionService`, `serverCapabilityRegistry`, and `WebSearchService`.

`npm ci` could not complete in the environment, so installed ADK 2.1.0 source/typings could not be independently inspected. Therefore internal runner/session cancellation beyond the project-visible signal contract remains **not proven** rather than invented.

## 5. Gemini cancellation evidence

For rotating Gemini, the project forwards the `AbortSignal` to `Gemini.generateContentAsync`. For the direct/single-credential Gemini path, ADK owns invocation. Because the installed dependency source is unavailable, actual cancellation of the underlying Gemini HTTP/network request is **UNKNOWN / NOT GUARANTEED** in this report.

The implemented guarantee is: UI transport, server execution signal, tools/capabilities, runner invocation, rotating model delegation, and SSE reader cleanup propagate cancellation as far as the available project/API surface demonstrates.

## 6. Stop UX contract

Intentional Stop now has these deterministic properties:

1. current browser request is aborted;
2. AbortError/intentional abort does not append a generic assistant error;
3. running/loading are cleared by Stop;
4. active run ownership is cleared;
5. partial assistant content already merged remains in transcript and is not promoted to successful completion;
6. UI can immediately start another request;
7. old completion/error/event cannot own or clear the new run;
8. no automatic retry/credential rotation is initiated by cancellation.

## 7. Stale-run isolation

New `src/agent/runtime/runLifecycle.ts` implements a minimal generation/token gate, not a new state-management framework.

Run A -> Stop/new Run B causes A's controller to abort. `isCurrent(A)` becomes false. All streamed transcript/tool-confirmation mutations are guarded. A's catch cannot append an error to B, and A's finally cannot clear B's running/loading state. Only `finish(B)` can release B's lifecycle ownership.

## 8. Timeout policy

The baseline had no bounded Agent execution timeout. Lượt 3 adds one server execution deadline, not separate connect/idle timers:

- default: **120,000 ms**;
- override: `AGENT_EXECUTION_TIMEOUT_MS`;
- accepted configured range: 1,000–900,000 ms;
- invalid configuration falls back to the bounded default.

Rationale: one two-minute execution ceiling is a minimal safety bound that allows normal agent/tool work while preventing an indefinitely retained HTTP/runner/SSE resource. It is not used to infer successful completion and does not implement retry. A timeout aborts the same execution signal. Before headers it maps to HTTP `504` + `AGENT_TIMEOUT`; after streaming starts it maps to the existing sanitized SSE error envelope with `AGENT_TIMEOUT` and closes cleanly.

## 9. Error normalization matrix

| Failure | Server/transport | Frontend/recovery |
|---|---|---|
| unauthenticated/token invalid | existing canonical 401/auth middleware | request fails; lifecycle cleans; user can resend after auth recovery |
| permission failure | existing server-authoritative status | safe HTTP failure; no Agent bypass |
| malformed request | existing `400 INVALID_CHAT_REQUEST` contract | non-retryable until request corrected |
| credential unavailable/inactive/decrypt failure | existing CredentialService status/code before stream | safe pre-stream failure; user action required |
| invalid/revoked provider credential | existing safe provider authentication classification | safe provider failure; rotation only under existing policy |
| quota/rate limit | existing `PROVIDER_QUOTA` classification | safe failure; retry may be appropriate; no new auto-retry UI |
| upstream transient | existing safe provider transient classification | safe failure; user may resend |
| execution timeout | `504 AGENT_TIMEOUT` pre-stream or SSE `AGENT_TIMEOUT` mid-stream | run=error, loading/running cleanup |
| mid-stream provider/ADK failure | existing sanitized SSE error envelope | partial content retained; run=error |
| incomplete EOF | existing `STREAM_INCOMPLETE` | run=error, never false success |
| malformed SSE/protocol | existing fatal `STREAM_PROTOCOL_ERROR` | partial retained; run=error |
| browser/user abort | no synthetic SSE error required; server signal/reader cleanup | no generic assistant error; immediately usable |

Raw provider payloads, keys and stacks are not added to transport envelopes.

## 10. Pre-stream / mid-stream behavior

Lượt 2 contract is preserved. Before stream headers, HTTP status/error is authoritative. Once SSE starts, completion and failure remain transport envelopes. Intentional abort does not fabricate an error envelope on a closed client connection. Timeout is explicit and cannot become EOF-success. Existing explicit completion remains the only successful terminal signal.

## 11. Credential rotation behavior

`shouldRotateCredential()` now rejects `AbortError` and `EXECUTION_CANCELLED` **before** provider status classification. This prevents an abort object that happens to retain a 401/429-like upstream status from being interpreted as credential health and rotated. Existing rotation rules for genuine authentication/quota failures remain unchanged.

## 12. Partial-content policy

Stop: retain already-rendered partial content; do not append generic failure and do not mark success.

Provider/timeout/protocol failure: retain partial content already merged; terminal state is error. Lượt 2 stable-ID assistant merge and optimistic current-user echo de-dup remain unchanged.

## 13. Files changed

Production:

- `src/agent/ui/AdkRuntimeProvider.tsx`
- `src/agent/runtime/runLifecycle.ts` (new)
- `server.ts`
- `server/core/runtime/executionDeadline.ts` (new)
- `server/core/ai/credentialRotationPolicy.ts`

Tests:

- `src/agent/runtime/__tests__/runLifecycle.test.ts` (new)
- `server/core/runtime/__tests__/requestCancellation.test.ts` (new)
- `server/core/runtime/__tests__/executionDeadline.test.ts` (new)
- `src/__tests__/credential-workflow.test.ts` (cancellation/rotation regression)

Documentation:

- `GD2_LUOT3_CANCELLATION_ERROR_RECOVERY.md` (new)

No session/history authority, Temporary Chat architecture, package manifest/lockfile, permissions, Settings, or credential storage architecture was changed.

## 14. Targeted tests / coverage

Added tests cover run generation ownership/stale-finally isolation, current run cleanup, browser abort propagation, premature response close cleanup/listener detachment, normal response finish cleanup, bounded timeout signal, and cancellation-not-rotation even when AbortError carries status 429.

Existing Lượt 2 suites retained cover explicit completion, mid-stream error, incomplete EOF, malformed protocol, tool/result/confirmation preservation, strict request contract, optimistic user de-dup and assistant stable-ID partial/final behavior.

A direct Node type-stripping assertion run verified `AgentRunGate`, parent cancellation propagation, and no rotation on AbortError: **PASS**.

No real Gemini request was made.

## 15. Verification

- Baseline SHA: **PASS** (`1f8d5027...a23f`).
- `node scripts/qa-stage4a.mjs`: **PASS 20/20**.
- `node scripts/qa-stage4d.mjs`: **PASS 40/40**.
- Direct cancellation assertions: **PASS**.
- `npm ci --ignore-scripts`: **BLOCKED** — timed out after 120 seconds; dependency installation did not complete.
- `npm run lint`: **BLOCKED by missing dependencies/types**. Global TypeScript executed, but imports such as Express/React/ADK and Node type declarations were unavailable, producing dependency-resolution/type-environment errors; this is not reported as PASS.
- targeted Vitest: **BLOCKED** — local Vitest is unavailable because `npm ci` did not complete; `npx --no-install` could not provide a local runner.
- `npm run build`: **BLOCKED** — `vite: not found` because dependencies are not installed.

## 16. Known limitations / deferred scope

- Actual Gemini network/socket cancellation is not claimed because ADK/Gemini installed source was unavailable. The signal is propagated to the deepest project-visible API surface.
- Session/history reconciliation remains Lượt 4.
- Temporary Chat/reconnect/history recovery remains Lượt 5.
- No automatic retry framework or Retry UI was added.
- Existing stale production manifest debt is untouched.
