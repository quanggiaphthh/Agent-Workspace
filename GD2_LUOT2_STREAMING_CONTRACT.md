# GĐ2 – LƯỢT 2 — STRICT AGENT CHAT REQUEST CONTRACT + SSE STREAMING LIFECYCLE

## 1. Baseline identity

- Authoritative input: `agent-workspace-gd2-luot1-execution-baseline.zip`
- Baseline SHA-256: `43410166a144592e7b917cbbad3080a2066966612634462b9c002bf882094b33`
- Baseline identity re-verified before modification: PASS.
- Canonical endpoint remains `POST /api/agent/chat`.
- No second Agent execution runtime/path was introduced.

## 2. ADK resolved version

- `package.json`: `@google/adk: ^2.0.0`.
- `package-lock.json`: resolved `@google/adk` version is **2.1.0**.
- This implementation treats 2.1.0 as the locked runtime contract. No dependency manifest or lockfile change was made.

## 3. Old request contract

`server.ts` previously called `parseAdkRequest(reqWithJson)` and, on any parser failure, silently fell back to ad-hoc extraction from `body.message` / `body.messages`, finally defaulting to `"Xin chào"`. `toolResponse` bypassed that parser through a separate branch. This made malformed semantic requests executable and made request intent non-deterministic.

Production frontend variants actually evidenced in `src/agent/ui/AdkRuntimeProvider.tsx` were:

1. Normal message: `{ message, stateDelta, aiConfig, sessionId, temporaryMode }`.
2. HITL confirmation response: `{ toolResponse: { role:'user', parts:[{ functionResponse:{ id, name:'adk_request_confirmation', response:{ confirmed, payload }}}]}, stateDelta, aiConfig, sessionId, temporaryMode }`.

No other production request variant was evidenced and none was retained speculatively.

## 4. New strict request contract

New module: `server/agent/chat/chatRequestContract.ts`.

- Exactly one semantic variant is accepted: non-empty `message`, or the evidenced confirmation `toolResponse` FunctionResponse shape.
- Known transport/context fields are `stateDelta`, `aiConfig`, `sessionId`, `temporaryMode`.
- Top-level unknown legacy shapes such as `{ messages: [...] }` are rejected.
- Empty/malformed semantic request throws status 400 + code `INVALID_CHAT_REQUEST`.
- There is no parser catch/fallback and no default greeting.
- Normal text is converted directly to ADK content `{ role:'user', parts:[{ text }] }`.
- Confirmation FunctionResponse is preserved as ADK content.
- `AIConfigSchema` remains server-side authority for provider/model/credential config; its Google-only/model validation is unchanged.
- Identity fields in `stateDelta` continue to be stripped before `RootAgent.buildAgent`; GĐ1 server-authority behavior is unchanged.

## 5. SSE transport contract

Transport remains fetch + `ReadableStream` + SSE through the existing `adkEventStream` bridge.

ADK semantic events are still serialized by `adkEventStream` and passed unchanged to `AdkEventAccumulator`. Lượt 2 adds only a reserved transport envelope, distinguished by `__agentTransport`:

- Completion: `data: {"__agentTransport":{"type":"complete"}}`
- Mid-stream error: `data: {"__agentTransport":{"type":"error","code":"...","message":"..."}}`

Server serializers are centralized in `server/agent/chat/sseTransport.ts`. Both Web `ReadableStream.getReader()` and async-iterator bridge paths emit deterministic completion and cleanly end. A bridge/read failure after streaming starts emits a sanitized error envelope and then ends the stream. Abort does not emit false success/error completion.

## 6. Semantic lifecycle

Frontend lifecycle remains within existing state rather than adding a state-machine dependency:

`idle -> connecting/running (isRunning=true,isLoading=true) -> streaming (HTTP accepted; isLoading=false,isRunning=true) -> completed | error | aborted -> idle flags`

`processAgentSseData` separates transport envelopes from ADK semantic payloads. ADK events continue through `AdkEventAccumulator`; transport events never enter the accumulator.

## 7. Completion contract

EOF is no longer treated as success by itself. The server emits the explicit transport completion envelope after the ADK stream finishes normally. Frontend requires that envelope for a non-aborted successful run. EOF without completion becomes `STREAM_INCOMPLETE`, exits running/loading through the existing `finally`, and surfaces the existing safe UI error path.

The existing `[DONE]` marker, if emitted by the assistant-ui adapter, is ignored as a compatibility marker rather than used as the success authority.

## 8. Pre-stream error contract

Before stream headers begin, existing HTTP semantics remain:

- malformed semantic body: HTTP 400, `INVALID_CHAT_REQUEST`;
- invalid `aiConfig`: HTTP 400;
- unauthenticated: authentication middleware HTTP 401;
- permission/server policy remains server-authoritative;
- credential/provider failures retain existing status/code mapping from the GĐ1 architecture.

The route catch returns only redacted error strings and validated machine-readable codes; stack traces are not serialized.

## 9. Mid-stream error contract

After SSE starts, the server cannot rely on changing HTTP status. The bridge therefore emits a transport error envelope with:

- validated/safe error code (fallback `STREAM_ERROR`);
- fixed user-safe Vietnamese message;
- no stack, provider payload, API key, or credential plaintext;
- clean stream termination.

Frontend recognizes this envelope, does not send it to `AdkEventAccumulator`, exits running/loading in `finally`, and preserves already accumulated partial content without replaying chunks.

## 10. Incremental rendering rules

- `AdkEventAccumulator` remains the semantic accumulation authority; the frontend maps the accumulator's current message snapshots rather than concatenating raw text chunks.
- `mergeStreamingMessages` merges streamed snapshots against the exact optimistic transcript.
- A server/session echo of an optimistic user turn with the same text is suppressed, preventing duplicate user transcript entries.
- Stable streamed message IDs replace their earlier snapshots, so partial -> final does not create a second assistant message.
- `sendMessage` now passes the exact optimistic transcript into `sendPayloadToAgent`, avoiding reliance on React state batching to capture the just-added user turn.
- Tool content remains independent message parts and does not flatten/overwrite assistant text.

## 11. Tool/confirmation preservation

- ADK events are passed unchanged into `AdkEventAccumulator`.
- Existing mapping of AI `tool_calls`, tool responses, source metadata, and `getToolConfirmations()` remains intact.
- The production HITL confirmation request shape remains supported by the strict server contract.
- Transport completion/error envelopes are intercepted before the accumulator, so they cannot erase pending confirmation state.

## 12. Files changed

Production:

1. `server.ts`
2. `server/agent/chat/chatRequestContract.ts` (new)
3. `server/agent/chat/sseTransport.ts` (new)
4. `src/agent/ui/AdkRuntimeProvider.tsx`
5. `src/agent/runtime/sseLifecycle.ts` (new)
6. `src/agent/runtime/streamMessageMerge.ts` (new)

Tests:

7. `server/agent/chat/__tests__/chatRequestContract.test.ts` (new)
8. `server/agent/chat/__tests__/sseTransport.test.ts` (new)
9. `src/agent/runtime/__tests__/sseLifecycle.test.ts` (new)
10. `src/__tests__/integration.test.ts` (updated)

Documentation:

11. `GD2_LUOT2_STREAMING_CONTRACT.md` (new)

No package manifest/lockfile, Settings, credential architecture, permissions architecture, session persistence architecture, Tasks, Memory, or Web Search business logic was changed.

## 13. Tests added/updated

Targeted assertions cover:

- valid normal message;
- malformed body rejected / no default greeting;
- valid confirmation FunctionResponse;
- malformed confirmation rejected;
- explicit completion envelope;
- sanitized machine-readable mid-stream error envelope;
- multi-event ADK payload preservation;
- tool-call/tool-result/confirmation payload preservation;
- EOF without completion is not success;
- optimistic user echo de-duplication;
- assistant partial/final snapshot replacement by ID;
- malformed `/api/agent/chat` does not call `RootAgent`;
- unauthenticated request does not call `RootAgent`;
- deterministic pre-stream credential error code/status.

No test calls Gemini.

## 14. Verification results

Environment dependency installation was attempted twice:

- `npm ci --no-audit --no-fund`: **BLOCKED/TIMEOUT (120s)**.
- `npm ci --no-audit --no-fund --prefer-offline`: **BLOCKED/TIMEOUT (180s)**.

As a consequence, `node_modules` was unavailable for dependency-based commands.

Results:

- Baseline checkpoint SHA verification: **PASS**.
- Locked ADK version inspection: **PASS — 2.1.0**.
- TypeScript transpile/syntax check of all changed TS/TSX files using available global TypeScript: **PASS**.
- `npm run lint`: **BLOCKED by missing dependencies/types** (`express`, `@google/adk`, React, etc. not installed); not reported as PASS.
- `node scripts/qa-stage4a.mjs`: **PASS 20/20**.
- `node scripts/qa-stage4d.mjs`: **PASS 40/40** (including its behavior/integration sub-suites).
- Targeted Vitest: **BLOCKED** — `vitest: not found` because dependency install did not complete.
- `npm run build`: **BLOCKED** — `vite: not found` because dependency install did not complete.
- `package.json` unchanged.
- `package-lock.json` unchanged from the authoritative checkpoint (SHA-256 `7c4cf2250d09cad12cbad29fca186494492f71b337eb20e77712aafd39d61126`).

Therefore implementation is complete for the requested scope, but this environment cannot truthfully claim the dependency-backed acceptance gate is fully verified. Checker/AI Studio should run lint + targeted Vitest + build after successful `npm ci` before declaring Lượt 2 final PASS.

## 15. Known risks deferred to Lượt 3–5

- **Lượt 3:** end-to-end cancellation proof/hardening remains deferred. Lượt 2 preserves current AbortController/request signal wiring and avoids emitting completion on abort, but does not redesign cancellation.
- **Lượt 4:** localStorage vs Firestore session/history authority and reconciliation remain unchanged.
- **Lượt 5:** Temporary Chat/reconnect/recovery expansion remains unchanged.
- The existing model trust boundary still accepts Google Gemini-shaped model IDs allowed by `AIConfigSchema`; it does not enable arbitrary providers. Settings/model policy redesign is deferred because it is not a Lượt 2 streaming blocker.
- `PRODUCTION_SOURCE_MANIFEST.sha256` remains intentionally stale baseline metadata debt and was not modified.

---

## Checker corrective fix — final

Baseline for this corrective pass remains checkpoint SHA-256 `833bd4df4722f9b10117a8d4aa2797a6b1815253594a49d58625bcb51ad4e85e`.

### Finding 1 — SSE parse/protocol errors no longer swallowed

Root cause: `AdkRuntimeProvider` wrapped both `processAgentSseData()` and `AdkEventAccumulator.processEvent()` in a catch that only warned and continued. A corrupt event could therefore be discarded and a later transport `complete` accepted as success.

Correction:
- blank lines and SSE comments remain ignorable;
- valid ADK payloads remain unchanged;
- valid `__agentTransport` complete/error envelopes retain their Lượt 2 behavior;
- malformed JSON and malformed reserved transport envelopes now throw sanitized `AgentSseProtocolError` (`STREAM_PROTOCOL_ERROR`);
- accumulator processing failures are converted to the same sanitized protocol error;
- the error escapes the per-event loop into the existing run-level error lifecycle, so later `complete` cannot turn the run into success;
- previously rendered partial content is not cleared;
- existing `finally` still clears `isRunning`, `isLoading`, and the active controller;
- no raw malformed payload/provider detail is included in the user-facing protocol error.

Targeted regression added: valid partial event → malformed data → complete must throw protocol failure, preserve the already-seen partial event, and never invoke completion.

### Finding 2 — current-turn-only optimistic user de-dup

Root cause: `mergeStreamingMessages()` built a set of text from every local user message and dropped every streamed user message whose text appeared in that set. This incorrectly treated text as transcript identity and made repeated legitimate turns unsafe.

Correction:
- removed transcript-wide text set;
- merge accepts an optional `optimisticUserMessageId` identifying the exact local optimistic turn for the current request;
- only one streamed user echo corresponding to that identified turn may be suppressed;
- historical repeated user turns remain untouched even when their text equals the current turn;
- edit/regenerate/send flows pass the exact optimistic/replayed user ID; HITL confirmation does not invent an optimistic user identity;
- stable-ID replacement for assistant partial/final messages remains unchanged;
- tool messages retain the existing ID-based merge behavior.

Targeted coverage includes: two historical identical user turns retained; current optimistic echo suppressed once; historical same-text turn retained; assistant stable-ID partial/final replacement retained.

### Corrective files changed

Production:
- `src/agent/ui/AdkRuntimeProvider.tsx`
- `src/agent/runtime/sseLifecycle.ts`
- `src/agent/runtime/streamMessageMerge.ts`

Tests:
- `src/agent/runtime/__tests__/sseLifecycle.test.ts`

Documentation:
- `GD2_LUOT2_STREAMING_CONTRACT.md`

No server request-contract/SSE-server source, package manifest/lockfile, credential architecture, permission architecture, or session persistence architecture was changed in this corrective pass.

### Corrective verification

- Checkpoint input SHA-256: PASS (`833bd4df4722f9b10117a8d4aa2797a6b1815253594a49d58625bcb51ad4e85e`).
- Stage4A: PASS 20/20.
- Stage4D: PASS 40/40.
- Direct Node runtime smoke assertions for malformed-stream failure, repeated historical user turns, current optimistic echo de-dup, and assistant stable-ID replacement: PASS.
- `npm ci --ignore-scripts --no-audit --no-fund`: BLOCKED — timed out after 45 seconds; dependency installation did not complete.
- `npm run lint`: BLOCKED because local dependencies/TypeScript executable were unavailable after the timed-out install.
- Targeted Vitest (SSE lifecycle / stream merge / Chat request / integration): BLOCKED because `vitest` was unavailable after dependency installation timed out. Test source was updated but is not reported as executed.
- `npm run build`: BLOCKED because dependency installation did not complete.

Deferred scope remains unchanged: cancellation hardening/proof is Lượt 3; session/history reconciliation is Lượt 4; Temporary Chat/reconnect/recovery is Lượt 5.
