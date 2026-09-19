# GĐ2 – LƯỢT 5: TEMPORARY CHAT + RECONNECT/RECOVERY + HITL RELOAD BEHAVIOR

## 1. Baseline identity

Authoritative input: `agent-workspace-gd2-luot4-session-history.zip`.

SHA-256 verified before work: `185a0d35dd5ea3af9485dbe44e912e495d9a70a118818146b0117e00abd5c225`.

No repository state was substituted for the checkpoint.

## 2. Temporary authority contract

The existing server boundary is retained. `server.ts` owns two distinct ADK session services:

- persistent: `adkSessionService = new FirestoreSessionService()`;
- temporary: `temporarySessionService = new InMemorySessionService()`.

`POST /api/agent/chat` selects the service solely from the validated request's `temporaryMode === true` state and binds both services to the verified server user plus `serverSessionId(user.id, clientSessionId)`. Temporary sessions are therefore process-memory only and are not written through `FirestoreSessionService`.

Persistent list/get/delete endpoints continue to address only `adkSessionService`; temporary sessions cannot appear in `/api/agent/sessions`.

Frontend durable authority remains unchanged from Lượt 4: localStorage stores only `uid_<uid>_adk_active_session_id` for the persistent conversation. No temporary transcript, temporary mode flag, or temporary session ID is stored there.

## 3. Enter / exit behavior

### Enter temporary

`AdkRuntimeProvider.setTemporaryMode(true)` now forms an explicit mode boundary:

1. `cancelRun()` invalidates/aborts the current run using the Lượt 3 `AgentRunGate` primitive;
2. history error, rendered transcript and live confirmations are cleared;
3. a fresh `crypto.randomUUID()` temporary identity is assigned immediately;
4. `temporaryMode` is enabled;
5. localStorage write effect is gated by `temporaryMode`, so the persistent pointer is untouched.

The persistent server session is never deleted or copied into the temporary session.

### Exit temporary

`setTemporaryMode(false)` cancels any temporary run and clears ephemeral UI state. The existing persistent hydration effect then reads the preserved persistent pointer from localStorage and loads canonical history from `/api/agent/sessions/:sessionId`. It never uploads/merges temporary transcript.

The Lượt 4 missing-session policy remains: 404 creates one clean replacement identity; 500/network failure is a recoverable history error and is not treated as missing.

## 4. Refresh behavior

`temporaryMode` is React memory state initialized to `false`; it is intentionally not persisted. A browser refresh therefore cannot resurrect temporary mode, temporary session identity, transcript, or pending temporary HITL. Startup returns to persistent mode and hydrates the durable active session pointer.

Loss of a temporary session after browser/server restart is expected behavior.

## 5. Reconnect / interruption policy

No transparent resume/replay protocol was added. Existing Lượt 2/3 rules remain authoritative:

- success requires explicit SSE transport completion;
- EOF before completion is `STREAM_INCOMPLETE`, never success;
- malformed protocol is fatal;
- intentional abort is not rendered as generic failure;
- refresh hydrates persisted history but does not resend the original prompt;
- no automatic retry is performed for potentially side-effectful Agent runs.

Thus recovery cannot replay a user request merely because the browser missed the terminal transport envelope.

## 6. Duplicate-prevention policy

No text-based durable reconciliation was introduced. On persistent reload the server transcript replaces local durable state as established in Lượt 4. Repeated user text remains ordered by persisted event identity. Partial events are excluded from completed history by `sessionTranscript()`. Lượt 2 current-turn optimistic echo correspondence and assistant stable-ID merge remain unchanged.

## 7. HITL persistence evidence

The canonical persisted event reconstruction in `server/agent/chat/sessionHistory.ts` preserves `functionCall` as structured `tool-call` with `toolCallId`, `toolName`, and `args`, and preserves `functionResponse` as structured `tool-response` with the same stable call identity.

The live client contract already identifies ADK confirmation calls as `adk_request_confirmation`; `confirmTool()` sends a matching ADK FunctionResponse using the call ID. This is sufficient evidence for a conservative reload rule when the persisted confirmation call has a stable ID.

No undocumented ADK API or invented confirmation token was added.

## 8. HITL reload policy

New helper: `src/agent/runtime/temporaryRecoveryPolicy.ts`.

`reconstructPendingConfirmations()` makes a hydrated item actionable only when all of these are true:

1. durable structured history contains a `tool-call`;
2. `toolName === 'adk_request_confirmation'`;
3. a non-empty stable `toolCallId` exists;
4. there is no persisted `tool-response` with the same `toolCallId`.

If a matching response/result exists, the call is completed and is not restored as pending. A call without stable identity or with non-confirmation tool semantics remains structured historical content but is never made actionable. Hydration never sends a FunctionResponse and never executes a tool.

The same conservative reconstruction is applied when loading an existing persistent conversation through the current UI.

## 9. Temporary HITL policy

Live temporary confirmations remain in React/runtime memory only. Temporary mode does not call persistent session history endpoints and does not store confirmations in localStorage. Refresh/mode exit clears them. No durable workaround was introduced.

## 10. New Chat / Clear History matrix

| Mode | New Chat | Clear History |
|---|---|---|
| Persistent | cancel active run; new client session identity; clear UI; old server session retained | delete active persistent server session, then create clean local identity |
| Temporary | cancel active run; fresh in-memory identity; clear ephemeral UI; persistent pointer untouched | discard/replace ephemeral identity/UI only; no persistent DELETE |

The pre-existing `resetLocalConversation()` localStorage guard (`if (temporaryMode) return`) remains the durable boundary.

## 11. Session-load recovery

Loading/continuing a persistent session now calls canonical `cancelRun()` before mutating active session/transcript. This extends Lượt 3 run-generation isolation to conversation switching: late events from the previous run cannot own lifecycle/UI state after the load.

The history panel fetches a session before calling `loadConversation`; a failed preview load therefore does not replace the active runtime transcript. Persistent 404/500 startup hydration behavior remains the Lượt 4 deterministic policy.

## 12. Cancellation isolation

Mode switch, New Chat, and loaded-conversation switch all use the existing Lượt 3 cancellation primitive. No cancellation architecture was replaced. The existing `AgentRunGate` still prevents a stale run from clearing lifecycle state or mutating a newer run.

## 13. Files changed

Production:

- `src/agent/ui/AdkRuntimeProvider.tsx`
- `src/agent/runtime/temporaryRecoveryPolicy.ts` (new)

Tests:

- `src/agent/runtime/__tests__/temporaryRecoveryPolicy.test.ts` (new)
- `server/agent/chat/__tests__/temporaryIsolation.test.ts` (new)

Documentation:

- `GD2_LUOT5_TEMPORARY_RECOVERY.md` (new)

No server route, credential architecture, permission architecture, Settings, Memory, Tasks, or unrelated business logic was changed.

## 14. Tests / coverage

New targeted Vitest specifications cover:

- stable persisted confirmation reconstruction;
- completed confirmation is not reconstructed pending;
- ambiguous/non-confirmation tool call is never actionable;
- ADK in-memory temporary service is process-local and user/session isolated.

Existing targeted suites retained for:

- explicit SSE completion/incomplete EOF/protocol failure;
- stale-run isolation/cancellation;
- server-authoritative session hydration and 404-vs-500 policy;
- structured tool history;
- strict request/HITL FunctionResponse contract.

Because dependencies could not be installed in this environment, Vitest execution was BLOCKED. As a secondary non-substitute check, direct Node assertions for the new pure HITL recovery helper passed, and source-contract assertions confirmed temporary service selection, persistent-only listing, mode-switch cancellation, localStorage pointer guard, temporary clear-history guard, New Chat cancellation, loaded-session cancellation, and hydration HITL reconstruction.

## 15. Verification

- Baseline SHA verification: **PASS**.
- `node scripts/qa-stage4a.mjs`: **PASS 20/20**.
- `node scripts/qa-stage4d.mjs`: **PASS 40/40**.
- Direct new HITL policy assertions: **PASS**.
- Direct temporary/recovery wiring assertions: **PASS**.
- `npm ci --no-audit --no-fund`: **BLOCKED — environment timeout at 120 seconds; node_modules not created**.
- `npm run lint`: **BLOCKED by missing installed dependencies/types** (module-resolution failures such as `express`, `@google/adk`, etc.; not reported as a source PASS).
- targeted Vitest: **BLOCKED — `vitest: not found`**.
- `npm run build`: **BLOCKED — `vite: not found`**.
- Real Gemini/provider calls: **NOT RUN**, as required.

## 16. Remaining limitations

1. A temporary process-memory session is intentionally lost on server restart/refresh; this is the product contract, not a recovery defect.
2. No transparent stream resume exists. Interrupted runs require user action; this avoids replaying side effects.
3. Actionable HITL reload is deliberately conservative. If persisted history lacks stable `toolCallId` or explicit `adk_request_confirmation` semantics, the call is not reconstructed as actionable.
4. Full dependency-backed React/Vitest/build verification remains required in an environment where `npm ci` completes.
5. No final integration/final-pass work was started.

## 17. Exact proposal for GĐ2 final integration gate

Only after checker PASS for Lượt 5:

1. install locked dependencies successfully;
2. run `npm run lint`;
3. run Stage4A 20/20 and Stage4D 40/40;
4. run all GĐ2 targeted suites for request/SSE, cancellation/error, session/history, temporary/recovery/HITL plus GĐ1 security/credential/integration suites;
5. run `npm run build`;
6. perform mocked end-to-end lifecycle checks across persistent chat, temporary chat, Stop, New Chat, refresh, session load and HITL reload without real Gemini calls;
7. audit only failures discovered by that gate; do not add new architecture/features;
8. package a final GĐ2 candidate for checker before any AI Studio/commit/deploy action.
