# GĐ2 – LƯỢT 4 — SESSION + HISTORY RECONCILIATION

## 1. Baseline
Source of truth: `agent-workspace-gd2-luot3-cancellation-error.zip`.
Checker SHA-256 and locally verified SHA-256: `0a8727ae98d47d534507c2899ee5d82ea6543eedd30ffa3c6836bd278606afda`.

## 2. Authority matrix — before
| State | Frontend local | Server | Authority before | Finding |
|---|---|---|---|---|
| session ID | localStorage active pointer | owner-bound ADK session ID | split | pointer useful, server binding authoritative |
| user/assistant transcript | full `adk_chat_history_v2` | persisted ADK events | dual durable truth | SH-01 conflict |
| tool events | local rendered messages | ADK events | split | server GET flattened history to text |
| confirmation | runtime state/local render | ADK events where persisted | runtime-heavy | actionable pending state not guaranteed after reload |
| partial message | React/localStorage could retain it | FirestoreSessionService intentionally does not persist `partial` events | local | could look durable after refresh |
| active conversation | localStorage pointer | session exists server-side | local pointer + server validation | acceptable with hydration |
| ADK state | none authoritative | SessionService | server | correct |

## 3. Authority matrix — after
| State | Canonical authority | Frontend policy |
|---|---|---|
| session ID binding/existence | server, owner-bound via `serverSessionId(user.id, clientId)` | localStorage stores only active client pointer |
| durable transcript | server persisted ADK events | hydrate from GET session; server wins |
| optimistic current turn | frontend transient | merge only during current run; never uploaded as history cache |
| tool call/result history | server events | reconstructed as structured `tool-call` / `tool-response` parts |
| partial events | not durable | persisted transcript reconstruction ignores `partial` events |
| ADK state | SessionService | never reconstructed from localStorage |
| temporary transcript | in-memory runtime only | no persistent history hydration/cache |

Legacy `adk_chat_history_v2` is removed on persistent initialization and is no longer written. It cannot override canonical server history.

## 4. Session ID contract
Client IDs remain 1–128 `[A-Za-z0-9_-]` on the server (`parseClientSessionId`). Durable server IDs remain `u_<verified-user-id>_s_<client-id>`, generated only after Firebase identity resolution. GET/DELETE/branch/chat all bind lookup to verified `user.id`; client cannot select another owner by embedding identity in a client ID. Client IDs contain random UUIDs and no required identity data.

Malformed IDs continue to fail deterministically with HTTP 400. No RBAC/multi-user redesign was introduced.

## 5. Session API contract
Reused existing endpoints only; no second conversation backend was created:
- `GET /api/agent/sessions` — persistent session summaries only.
- `GET /api/agent/sessions/:sessionId` — canonical hydrated transcript for verified owner.
- `DELETE /api/agent/sessions/:sessionId` — owner-bound delete.
- `POST /api/agent/sessions/branch` — existing branch semantics.
- `POST /api/agent/chat` — lazy persistent `getOrCreateSession` remains canonical execution path.

`sessionTranscript` was extracted to `server/agent/chat/sessionHistory.ts` so reconstruction is testable and preserves text plus tool call/result structure. Partial ADK events are explicitly excluded from durable transcript reconstruction; FirestoreSessionService already does not persist partial events.

## 6. Hydration algorithm
For persistent mode after authenticated user is ready:
1. Read only `uid_<uid>_adk_active_session_id`; create a random UUID pointer if absent.
2. Remove legacy full-transcript localStorage cache.
3. GET the owner-bound server session.
4. HTTP 200: server messages replace rendered durable transcript.
5. HTTP 404: treat pointer as stale/missing, create a fresh client session ID, clear rendered transcript, do not upload stale local data.
6. Other HTTP failures/network failure: retain current in-memory transcript, expose a recoverable history-load error, and do not manufacture a replacement session.
7. Disable send readiness while initial hydration is in flight, preventing a hydration response from racing a new turn.

The pure `decideSessionHydration` policy makes 404 distinct from persistence failure.

## 7. Refresh behavior
After a completed persistent turn, ADK events are durable on the selected SessionService. Browser refresh restores the active pointer, GETs the same owner-bound session, and replaces UI history from server events. No completed run is replayed and local transcript is not resent as a new request. Repeated user text is preserved by event identity/order rather than text uniqueness.

## 8. Multi-turn behavior
Chat requests continue to send only the new semantic message/HITL response plus the same client session ID. Server maps that ID to the same owner-bound ADK session; ADK session context remains server-side. No full local transcript is submitted as a new prompt. Existing current-turn optimistic echo de-dup remains unchanged and does not participate in durable hydration.

## 9. New Chat
`newConversation()` now first invokes the canonical Lượt 3 `cancelRun()`, then clears rendered/tool-confirmation state and installs a new random client session pointer. It does not DELETE the old server session. The new server session remains lazily created by the first `/api/agent/chat` request. Late events from the cancelled old run remain protected by the existing run-generation gate.

`clearHistory()` remains the explicit destructive action: it deletes the active persistent server session then resets to a new identity.

## 10. Missing/corrupt persistence recovery
- Missing session (404): deterministic clean New Chat identity; no stale transcript migration.
- Persistence/backend error (non-404 or network): not treated as missing; no automatic session fan-out; UI shows `Không thể tải lịch sử hội thoại từ máy chủ. Vui lòng thử tải lại.` and send remains blocked only while the initial request itself is pending.
- Malformed session ID: server 400 remains distinct from 404.
- Legacy/corrupt local transcript: no longer parsed or authoritative; cache key is removed.

## 11. Partial/error history
`FirestoreSessionService.appendEvent` already ignores ADK `partial` events. Reconstruction additionally rejects any partial event defensively. Therefore Stop/timeout/provider/protocol partial UI content can remain visible for the live run but is not promoted to a completed durable assistant answer by refresh. Persisted non-partial error/tool events remain server-owned; no final-success state is invented.

## 12. Tool/HITL reconstruction
Persisted event parts now reconstruct text, `functionCall` as structured `tool-call`, and `functionResponse` as structured `tool-response`; they are not flattened into text. Existing live accumulator/HITL behavior is unchanged.

Known limitation: the baseline ADK persistence does not expose a separately durable UI `ToolConfirmationItem` lifecycle. A persisted `adk_request_confirmation` function call is preserved structurally in history, but this change does not invent actionable pending-confirmation state after reload. HITL redesign is deferred; live HITL remains unchanged.

## 13. localStorage policy
Persistent mode stores only the active session pointer. Full transcript key `adk_chat_history_v2` is deleted and never written by the reconciled runtime. Server hydration always wins. Temporary mode bypasses persistent hydration and pointer/history writes.

## 14. Temporary-mode isolation
No Temporary Chat architecture was redesigned. `temporaryMode` still selects the in-memory server SessionService and bypasses persistent localStorage history/pointer writes in the provider. Persistent session history APIs remain excluded from temporary mode behavior.

## 15. Files changed
Production:
- `server.ts`
- `server/agent/chat/sessionHistory.ts` (new)
- `src/agent/runtime/sessionHistoryPolicy.ts` (new)
- `src/agent/ui/AdkRuntimeProvider.tsx`
- `src/agent/ui/AgentChatThread.tsx`

Tests:
- `server/agent/chat/__tests__/sessionHistory.test.ts` (new)
- `src/agent/runtime/__tests__/sessionHistoryPolicy.test.ts` (new)

Documentation:
- `GD2_LUOT4_SESSION_HISTORY.md` (new)

No credential, permission, model, Settings, cancellation architecture, package manifest or lockfile changes.

## 16. Tests added
Targeted Vitest coverage added for:
- server history authority decision;
- 404 stale-pointer recovery;
- 500 persistence failure not treated as 404;
- repeated identical user turns preserved by event identity/order;
- partial persisted event excluded;
- structured tool call/result reconstruction.

Existing Lượt 2 tests retain optimistic current-turn echo and assistant stable-ID merge coverage. Existing Lượt 3 tests retain cancellation/run-isolation behavior. Existing server session code retains owner binding and lazy same-session multi-turn execution.

## 17. Verification
- Baseline ZIP SHA-256: PASS, exact checker value.
- `node scripts/qa-stage4a.mjs`: PASS 20/20.
- `node scripts/qa-stage4d.mjs`: PASS 40/40 (including 21/21 behavior + 17/17 credential integration sub-suites).
- Direct Node type-stripped session-history assertions: PASS.
- `npm ci --no-audit --no-fund`: BLOCKED — environment timeout at 120 seconds.
- Targeted Vitest: BLOCKED — `node_modules/.bin/vitest` unavailable after install timeout.
- `npm run lint`: BLOCKED — local TypeScript binary unavailable after install timeout.
- `npm run build`: BLOCKED — local Vite unavailable after install timeout.
- No real Gemini call was made.

## 18. Known limitations / deferred Lượt 5
- Actionable HITL confirmation restoration after browser reconnect is not guaranteed because baseline persistence does not expose a durable UI confirmation lifecycle separate from ADK events; structured event history is preserved without inventing state.
- Temporary Chat full contract/reconnect behavior remains Lượt 5.
- No conversation sidebar redesign was performed.
- No automatic retry/reconnect protocol was added.
- Dependency-environment gates (Vitest/lint/build) require checker execution where `npm ci` can complete.
