# GĐ2 – LƯỢT 1: AGENT CHAT EXECUTION BASELINE / CONTRACT AUDIT

## 1. Source / baseline identity
- Checker baseline: `agent-webapp (10).zip`.
- Uploaded filename: `agent-webapp (10)(1).zip` (renamed copy).
- SHA-256 verified: `f2481a9a675a9b90cd34ebaec6c302fd92f8cde13d8925d88704294b0a718173` — exact match with locked GĐ1 FINAL PASS identity.
- ZIP integrity: PASS (`unzip -t`, no compressed-data errors).
- Production source was not modified in this audit. This report is the only added file.
- Note: `PRODUCTION_SOURCE_MANIFEST.sha256` is stale against 16 files in this exact locked ZIP. This is recorded as baseline metadata debt, not repaired because the locked ZIP hash is authoritative and GĐ1 is closed.

## 2. Current execution call graph

| Node | File / function | Input | Output | Async | State owner | Error behavior |
|---|---|---|---|---|---|---|
| User input | `src/agent/ui/AgentChatThread.tsx`, submit handler -> `sendMessage` | text | call runtime | yes | component input state | blocks empty/running/not-ready |
| Chat runtime | `src/agent/ui/AdkRuntimeProvider.tsx`, `sendMessage` / `sendPayloadToAgent` | text + app context | authenticated POST | yes | React provider | appends user message; catches errors into assistant error message |
| Auth transport | `src/lib/authFetch.ts`, `authFetch` | RequestInit | fetch Response | yes | Firebase client auth | token acquisition failure logs; protected server then returns 401 |
| Transport | `AdkRuntimeProvider.sendPayloadToAgent` | `message,stateDelta,aiConfig,sessionId,temporaryMode` | streamed response | yes | AbortController ref | non-2xx converted to Error; AbortError suppressed |
| Server endpoint | `server.ts`, `POST /api/agent/chat` | JSON | ADK event stream | yes | request | errors before headers -> JSON; cancellation -> 499 if possible |
| Authentication | `server.ts` `/api` middleware -> `ServerIdentityProvider.getIdentity` | Bearer token | trusted user | yes | request.user | 401/status from identity provider |
| Permissions | RootAgent/capability registry + `CapabilityExecutionService` | trusted user/context | allowed capabilities | yes | server | server-authoritative; tool execution rechecks policy |
| Request validation | `AIConfigSchema.safeParse`, `parseClientSessionId`, `parseAdkRequest` | client payload | validated config/content | mixed | request | aiConfig 400; session ID 400; ADK parse currently falls back to permissive message extraction |
| Model/config | `shared/contracts/ai.ts`; `RootAgent.buildAgent` | validated aiConfig | Google model config | yes | server | provider literal google; model syntax only `gemini-*`, not canonical allowlist |
| Credential | `RootAgent.buildAgent` -> `CredentialService.resolveCredential/getRotationCandidates` | trusted user + credentialId | decrypted key candidate(s) | yes | server | no eligible rotation -> 409; provider errors sanitized/rotation policy |
| Agent | `server/agent/adk/RootAgent.ts`, `buildAgent` | ExecutionContext | `LlmAgent` | yes | request | rejects guest/provider mismatch/credential failure |
| Model | `Gemini` or `RotatingGemini.generateContentAsync` | LlmRequest | model response generator | yes/stream | ADK/model | rotation only before first yield; post-yield error surfaced |
| Runner | `server.ts`, `InMemoryRunner.runAsync` | user/session/message/state/abortSignal | ADK async event stream | yes | ADK session service | propagated to route |
| Session | `FirestoreSessionService` or `InMemorySessionService` | ADK events/state | persistent/in-memory session | yes | server | Firestore service may pin active session to memory fallback |
| Stream adapter | `adkEventStream(stream)` | ADK events | Web `Response` SSE | yes | server | adapter semantics; route bridges body to Express |
| Express bridge | `server.ts`, Web Response -> Node `Readable` -> `res` | byte chunks | HTTP stream | yes | response | reader error destroys bridge; disconnect abort signal bound |
| Frontend event handling | `AdkRuntimeProvider.sendPayloadToAgent` | SSE `data:` JSON | accumulator events | yes | provider | malformed SSE JSON warns and skips event |
| Semantic accumulation | `AdkEventAccumulator.processEvent/getMessages/getToolConfirmations` | ADK semantic event | assistant-ui messages/confirmations | sync | accumulator per run | library-defined |
| Incremental render | provider `setMessages` -> `AgentChatThread` | mapped accumulated messages | rendered thread | sync/react | React state | partial UI updates per parsed SSE event |
| Finalization | stream EOF / `finally` | final accumulated state | running/loading false | yes | provider | no explicit final-message acknowledgement distinct from stream EOF |

Canonical execution path is therefore:
`AgentChatThread -> AdkRuntimeProvider -> authFetch -> POST /api/agent/chat -> Firebase Admin identity -> server config/capability policy -> RootAgent -> CredentialService -> Gemini/RotatingGemini -> InMemoryRunner.runAsync + selected SessionService -> adkEventStream(SSE) -> AdkEventAccumulator -> React incremental render`.

## 3. Frontend Chat inventory
- Real chat surface: `src/agent/ui/AgentChatThread.tsx`, mounted by `src/agent/ui/AgentPanel.tsx` inside `AdkRuntimeProvider`.
- Runtime/store: `src/agent/ui/AdkRuntimeProvider.tsx`; it is custom React state, not assistant-ui's full thread runtime. `@assistant-ui/react-google-adk` is used for `AdkEventAccumulator`.
- Message model: local `ChatMessage` with roles `user|assistant|system`; parts include text, reasoning, tool-call, tool-response, sources, error.
- Send: WORKING baseline via `sendMessage` -> `sendPayloadToAgent`.
- Pending/running: `isLoading` and `isRunning`.
- Streaming: PARTIAL/WORKING baseline. Fetch body is read incrementally as SSE and accumulator output is re-rendered after each event.
- Partial assistant message: supplied indirectly by ADK accumulator; no explicit local partial-message state.
- Finalization: PARTIAL. EOF clears running state; no explicit durable frontend final-event contract.
- Error state: PARTIAL. HTTP/runtime errors become an assistant text error; semantic incomplete/error can map to `error` part, but recovery classification is absent.
- Retry: regeneration exists, but no typed automatic retry policy.
- Stop button: PRESENT (`AgentChatThread`, `cancelRun`).
- New Chat: PRESENT (`newConversation`) and creates a new client UUID; it does not delete old persistent session.
- Session ID: client UUID stored locally, server validates syntax then namespaces/binds it to authenticated user (`u_<uid>_s_<clientId>`).
- Temporary Chat: PRESENT; switches to fresh client UUID and server `InMemorySessionService`; local persistence disabled. Server restart loses it by design.
- Refresh: persistent mode reloads only one local transcript/session from localStorage; server history UI separately supports loading persistent sessions. This is PARTIAL recovery, not server-authoritative refresh reconciliation.
- Edit/regenerate: implemented through server-side branch endpoint and replay.
- Tool confirmation: UI `AdkConfirmation.tsx`, runtime `confirmTool`, and server `CapabilityToolAdapter.requestConfirmation` are wired. Lifecycle needs targeted validation in later GĐ2.

## 4. Server endpoint inventory

| Method/path | Auth | Permission/policy | Validation | Response | Credential/model | Session | Abort |
|---|---|---|---|---|---|---|---|
| POST `/api/agent/chat` | global Firebase Admin identity middleware | capability list/tool execution server-side | AIConfigSchema + session regex; ADK parser with fallback | SSE via `adkEventStream` | RootAgent -> CredentialService; google only | Firestore persistent or in-memory temporary | request/response close -> AbortSignal passed to runner |
| POST `/api/agent/sessions/branch` | global auth | owner isolation by server userId | source session ID regex, turn integer | JSON | none | copies events into new owner-bound session | no explicit cancellation binding |
| GET `/api/agent/sessions` | global auth | owner-scoped query | limit 1..100 | JSON | none | persistent only | none |
| GET `/api/agent/sessions/:sessionId` | global auth | owner-bound server ID | session ID regex | JSON | none | persistent | none |
| DELETE `/api/agent/sessions/:sessionId` | global auth | owner-bound server ID | session ID regex | JSON | none | persistent delete | none |
| POST `/api/capabilities/execute` | global auth | `CapabilityExecutionService` | capability ID/confirmation ID basic validation + capability schema downstream | JSON | n/a | execution metadata only | cancellation bound |

Canonical Agent execution endpoint: **POST `/api/agent/chat`**. No second production Agent-chat endpoint was found. `AIProviderManager` and `WebSearchService` contain direct provider calls, but evidence shows they serve credential/model diagnostics/search capability rather than the canonical Agent Chat path; they must not be substituted for RootAgent chat execution.

## 5. Trust-boundary audit
- Owner identity: KEEP. Server obtains Firebase identity; client-supplied identity fields in `stateDelta` are deleted and trusted `user` is injected.
- Permissions: KEEP. Client cannot authoritatively grant permissions; capability exposure/execution is server-derived.
- Provider: KEEP. `AIConfigSchema` requires literal `google`, and RootAgent checks again.
- Credential availability/raw API key: KEEP. Client sends credential ID/config only; key resolution/decryption is server-side.
- Protected configuration: largely KEEP for GĐ1 invariants.
- Model: **PARTIAL / finding TB-01.** Client sends `agentModel`; server accepts any syntactically valid `gemini-*` via `isAgentModelId`. It does not force only `gemini-3.5-flash-lite` or verify the selected ID against a server-side discovered/allowed catalog at chat execution. This is not an identity/permission bypass, but model selection remains client-influenced. Preserve current GĐ1 behavior unless checker decides canonical model must be enforced in GĐ2.
- Session: KEEP for isolation. Client ID is validated and transformed with authenticated `user.id`, preventing cross-owner direct session lookup by client ID.
- Request content: **PARTIAL / finding TB-02.** Failure of `parseAdkRequest` silently falls back to ad-hoc body extraction and can default to `Xin chào`; malformed semantic requests are therefore not strictly rejected. This should be tightened as part of the Lượt 2 transport contract, not changed in audit-only Lượt 1.

## 6. Google ADK dependency / contract
Important dependency finding: the prompt names `@google/adk@2.0.0`, but the locked `package-lock.json` resolves `@google/adk` to **2.1.0** because `package.json` declares `^2.0.0`. Therefore it would be incorrect to claim the locked baseline is actually running 2.0.0.

Observed project primitives from source:
- Agent: `LlmAgent`.
- Model: `Gemini`; custom `RotatingGemini extends BaseLlm`.
- Runner: `InMemoryRunner`.
- Run/event API: `runner.runAsync(...)` async event stream.
- Session primitives: custom `FirestoreSessionService` implementing ADK session behavior; `InMemorySessionService` for temporary chat/fallback.
- Live/connect: `RotatingGemini.connect()` exists and delegates to primary Gemini, but canonical chat endpoint uses `runAsync`, not a live connection. Live Agent Chat is NOT ACTIVE.
- Tool primitive: `FunctionTool`; confirmation through tool context `requestConfirmation` / `toolConfirmation`.
- State delta: passed into `runAsync`; persistent session service extracts event `actions.stateDelta`; partial events are intentionally not persisted.
- Cancellation: AbortSignal passed route -> `runAsync`; RootAgent model implementation accepts/passes abort signal to Gemini `generateContentAsync`. Exact installed ADK internals could not be inspected because dependency installation was environment-blocked (see verification).
- Completion/error event details: project delegates semantic event encoding to `adkEventStream` and decoding to `AdkEventAccumulator`; installed source was unavailable after timed-out `npm ci`, so undocumented internal 2.1.0 event variants are not asserted here.

## 7. Streaming event contract
Transport is **SSE over fetch/ReadableStream**. Server converts ADK async events with `adkEventStream`; frontend parses newline-delimited SSE `data:` frames and JSON-decodes each frame.

| Semantic need | Baseline | Evidence |
|---|---|---|
| stream start | MISSING explicit semantic event | HTTP response/start + `isLoading`; no named start event handled |
| text delta | WORKING through ADK events/accumulator | accumulator is processed per SSE event and messages re-render incrementally |
| message final | PARTIAL | ADK may encode finality, but local contract does not explicitly branch on a final event; EOF is effective run finalization |
| tool call | WORKING baseline | accumulator `msg.tool_calls` -> local tool-call part |
| tool result | WORKING baseline | accumulator tool message -> tool-response part |
| confirmation | WORKING baseline / needs tests | accumulator confirmations + `AdkConfirmation`; server requestConfirmation |
| state update | ADK INTERNAL / PARTIAL | stateDelta persisted server-side; frontend has no explicit state-update event handling |
| error | PARTIAL | HTTP JSON before stream; accumulator incomplete/error; midstream taxonomy not normalized |
| completion | PARTIAL | stream EOF; `[DONE]` is ignored if received; no explicit completion state contract |
| cancellation | PARTIAL | AbortController + server signal; no semantic cancellation event persisted/rendered |

Transport event and ADK semantic event are not the same: SSE is the byte/frame transport; JSON payloads are ADK events interpreted by `AdkEventAccumulator`.

## 8. Session / history baseline
Persistence schema from `FirestoreSessionService`:
`apps/{appName}/users/{userId}/sessions/{sessionId}` with metadata (`id,appName,userId,state,lastUpdateTime,eventCount,title?`) and child `events` collection storing sequence/timestamp/sanitized event. Server session IDs are owner-prefixed. Partial events are not persisted.

Behavior classification:
1. First chat — WORKING baseline: get/create persistent session, or create temporary in memory.
2. Second message same chat — WORKING baseline: same client/session ID reused; ADK session events supply context.
3. New Chat — WORKING/PARTIAL: new UUID and empty UI; previous persistent session remains history.
4. Page refresh — PARTIAL: localStorage restores active transcript; persistent server session also exists, but no automatic reconciliation/load from server on provider initialization.
5. Browser reconnect — PARTIAL/MISSING: a new request can reuse session, but interrupted active stream has no resume cursor/event replay contract.
6. Server restart — persistent session WORKING if Firestore healthy; temporary session MISSING by design; pinned in-memory fallback sessions are lost.
7. Stale session — PARTIAL: persistent get-or-create can recreate missing session under same ID; frontend has no explicit stale-state UX.
8. Missing session — chat get-or-create handles persistent send; GET history returns 404.
9. Corrupted persistence — PARTIAL/UNSAFE operationally: fallback exists for certain Firestore failures, but corrupted event semantics/reconciliation are not explicitly handled.
10. Temporary Chat — WORKING baseline for ephemeral same-process conversation; intentionally absent from persistent history and lost on restart.

Risk SH-01: frontend localStorage transcript and server ADK session are two representations without a defined reconciliation authority on refresh. GĐ2 should make server persistent history authoritative for persistent chats while keeping local state as rendering/cache state.

## 9. Stop / cancel baseline
Path: `AgentChatThread` Stop -> `cancelRun` -> active `AbortController.abort()` -> fetch abort -> server request/response disconnect listeners -> server AbortController -> `runner.runAsync(...abortSignal)` -> model path accepts abort signal -> Gemini `generateContentAsync(...abortSignal)`.

Classification: **PARTIAL, structurally end-to-end but not fully verified against installed ADK 2.1.0 runtime**.
- Browser transport really aborts; it is not merely a render stop.
- Server binds request `aborted`/response `close` and propagates a signal.
- RotatingGemini passes signal into Gemini generation; single-candidate `Gemini` cancellation behavior depends on ADK Runner propagation.
- `FirestoreSessionService.appendEvent` explicitly ignores `partial` events, reducing risk of persisting partial assistant deltas.
- It is not proven in this environment that all ADK/model work terminates promptly after abort, because dependencies could not be installed/inspected/run.
- UI immediately sets running/loading false; no distinct “cancelled” assistant message/status.
- Cancellation after a non-partial event/tool side effect cannot roll that side effect back.

## 10. Error / recovery matrix

| Case | Origin -> server representation | Transport | Frontend/user behavior | Recovery baseline |
|---|---|---|---|---|
| malformed request | parser/schema; aiConfig/session may 400, ADK parse may fallback | JSON 400 or stream | generic assistant error for non-2xx | PARTIAL; tighten request schema |
| unauthenticated | identity middleware 401 | JSON | generic assistant error | sign-in/retry manually |
| invalid/expired Firebase token | identity provider 401 | JSON | generic assistant error | Firebase refresh on later token fetch; no typed UX |
| permission failure | capability policy 403/error | ADK tool result or REST JSON | tool/error rendering varies | server-authoritative; UX PARTIAL |
| no Gemini credential | RootAgent 409 `NO_ROTATION_CANDIDATE` or resolver error | JSON | generic assistant error text | user fixes Settings; no guided typed recovery |
| invalid/revoked credential | Gemini/provider policy, sanitized | JSON pre-stream or stream error | generic/semantic error | rotation only if eligible and before first yield |
| quota | provider error | pre/mid stream | generic error | no typed backoff UX |
| rate limit | Express 429 or provider | JSON/stream | generic error | manual retry; no Retry-After UI |
| timeout | no explicit Agent request timeout found | eventual provider/network error | generic error | MISSING explicit timeout policy |
| upstream Gemini error | model/rotation policy | JSON if preheaders; semantic/stream termination after headers | generic/semantic error | partial |
| ADK error | runner/adapter | same | generic/semantic error | partial |
| tool error | CapabilityExecutionService/FunctionTool | ADK event | tool/error depending accumulator | partial |
| persistence error | FirestoreSessionService | may use pinned in-memory fallback; otherwise throw | generic error | fallback PARTIAL; durability warning not surfaced in Chat |
| stream interruption | network/server | stream EOF/error | finally clears running; may leave partial render | MISSING resumable recovery |
| browser disconnect | cancellation binding | connection closes | UI request abort/network | structural cancellation; no resume |
| server restart | process termination | connection closes | generic interruption | persistent next request can reload server session manually; no automatic resume |
| confirmation pending | ADK requestConfirmation | SSE event | confirmation UI | WORKING baseline; expiry/reconnect needs validation |
| cancellation | client/server AbortSignal | aborted fetch / possible 499 before headers | no error message, running false | PARTIAL; no semantic cancelled state |

## 11. Duplication / dead-path findings
- No duplicate production Agent Chat route found; `/api/agent/chat` is canonical.
- `server/core/ai/AIProviderManager.ts` contains direct provider HTTP calls. Evidence indicates credential/model management/diagnostics, not canonical Agent Chat. KEEP outside Agent execution path; do not route chat through it.
- `server/core/search/WebSearchService.ts` directly calls `@google/genai`; this is a search capability implementation, not chat orchestration. It must remain behind capability policy when invoked by RootAgent.
- Session implementations are intentionally dual-purpose: Firestore persistent + ADK in-memory temporary/fallback. Not dead code, but fallback pinning means persistence health can change the backend for an active session.
- Frontend history is duplicated in representation: localStorage active transcript plus server session history. This is not dead code; it is a reconciliation gap (SH-01).
- Legacy model constants exist in `aiKeysStore.ts` explicitly for migration. Evidence does not justify deletion.
- No production UI mock/placeholders were identified as the canonical chat execution path.

## 12. Architecture decision record

| Classification | Decision |
|---|---|
| KEEP | `AgentChatThread` + `AdkRuntimeProvider` as current UI/runtime surface; do not introduce a second chat framework |
| KEEP | `POST /api/agent/chat` as sole canonical execution endpoint |
| KEEP | Firebase Admin identity and server-authoritative capability/permission resolution |
| KEEP | `RootAgent -> CredentialService -> Gemini/RotatingGemini` |
| KEEP | `InMemoryRunner.runAsync` + ADK event stream architecture |
| KEEP | Firestore persistent sessions + explicit in-memory Temporary Chat |
| KEEP | owner-bound server session ID transformation |
| KEEP | SSE/fetch streaming transport unless Lượt 2 evidence requires a narrow adapter correction |
| MINIMAL FIX (defer to Lượt 2 contract work) | replace permissive ADK parse fallback with an explicit validated canonical chat request contract, while preserving tool-response support |
| GĐ2 LƯỢT 2 | formalize streaming event handling, explicit lifecycle/finalization/error envelope, incremental render correctness, targeted stream tests |
| GĐ2 LƯỢT 3 | prove and harden cancellation through ADK/Gemini; timeout/rate-limit/quota/credential recovery UX |
| GĐ2 LƯỢT 4 | make persistent server history authoritative on reload; reconciliation/load/history tests |
| GĐ2 LƯỢT 5 | Temporary Chat boundaries, reconnect/interruption recovery, stale/missing session handling, pending-confirmation recovery |
| OUT OF SCOPE | RBAC/multi-user/public deployment/provider expansion/ADK replacement |

No production blocker was sufficiently small and necessary to justify modifying source in Lượt 1. **Production files changed: NONE.**

## 13. Exact proposed scope for GĐ2 Lượt 2
1. Preserve the canonical path and GĐ1 invariants.
2. Define one strict request schema for normal message vs tool-confirmation response; reject malformed bodies rather than silently defaulting to `Xin chào`.
3. Keep SSE + `adkEventStream`; document/normalize frontend lifecycle states: connecting/start, delta/event, final/completion, error.
4. Ensure incremental assistant text/tool events do not duplicate or overwrite the preceding local transcript.
5. Add targeted, provider-mocked integration tests for multi-chunk text streaming, tool-call/tool-result events, confirmation event, malformed request, pre-stream error, mid-stream interruption, and clean completion.
6. Do not implement persistence reconciliation, reconnect resume, or broad cancellation redesign yet; those remain Lượt 3–5.
7. Resolve the dependency-contract discrepancy before asserting ADK 2.0.0-specific behavior: either audit the locked 2.1.0 actually resolved by lockfile, or deliberately pin 2.0.0 only if separately approved. Do not silently downgrade/upgrade in Lượt 2.

## 14. Files changed
- Production source: **NONE**.
- Added deliverable only: `GD2_LUOT1_EXECUTION_BASELINE.md`.

## 15. Verification results
- Baseline ZIP SHA-256: PASS exact locked hash.
- ZIP integrity: PASS.
- `npm ci`: **BLOCKED/TIMEOUT** at 45 seconds in checker environment; installation did not complete.
- `npm run lint`: **BLOCKED as a consequence of incomplete dependency installation**; TypeScript reports missing packages/types (`express`, `@google/adk`, React, Node types, etc.). These are environment/dependency-absence errors, not a valid source regression verdict.
- `node scripts/qa-stage4a.mjs`: **BLOCKED** because dependencies were not successfully installed; not reported as PASS.
- `node scripts/qa-stage4d.mjs`: **BLOCKED** for same reason; not reported as PASS.
- Targeted Vitest Chat/ADK/session tests: **BLOCKED** for same reason. Existing relevant tests found: `src/__tests__/integration.test.ts`, credential tests, permissions test, model regression, and `server/agent/adk/__tests__/serialization.test.ts`.
- `npm run build`: **BLOCKED** for same dependency-install reason; not reported as PASS.
- No real Gemini call was made.
- Manifest check: `sha256sum -c PRODUCTION_SOURCE_MANIFEST.sha256` reports 16 mismatches in the exact locked ZIP. Treat manifest as stale relative to authoritative checkpoint hash; do not use it to rewrite GĐ1 in this turn.

## 16. Blockers / risks
1. **ADK version contract mismatch (high confidence):** package request is `^2.0.0`, lockfile resolves 2.1.0, while task text says 2.0.0. Exact installed internals cannot be truthfully described as 2.0.0.
2. **Dependency verification environment blocked:** no valid lint/test/build result can be claimed in this turn.
3. **Request parser fallback (medium):** malformed ADK request can be accepted through fallback extraction/default greeting; formalize in Lượt 2.
4. **Frontend/server history reconciliation (medium):** localStorage and Firestore can diverge after refresh/interruption; defer to Lượt 4.
5. **Cancellation proof gap (medium):** signal wiring is present end-to-end in project source, but actual ADK 2.1.0 runtime cancellation was not executable here; prove in Lượt 3.
6. **Error taxonomy/recovery (medium):** frontend collapses most HTTP/provider errors into generic assistant text; typed recovery remains GĐ2 work.
7. **No explicit Agent timeout (medium):** request may rely on upstream/network termination.
8. **Model selection trust boundary (low/medium):** server constrains provider and Gemini-shaped IDs but client can select a different syntactically valid Gemini model; decide policy without regressing locked Settings behavior.
9. **Stale production manifest (baseline debt):** 16 mismatches. Exact ZIP hash is nevertheless verified and matches the checker-locked source.

## Audit verdict
**PASS FOR GĐ2 LƯỢT 1 AUDIT BASELINE, WITH RECORDED RISKS; NO PRODUCTION FIX APPLIED.** The existing architecture already has a coherent canonical execution path and real streaming/session/cancellation scaffolding. Lượt 2 should harden the request + streaming lifecycle contract rather than create a parallel architecture.
