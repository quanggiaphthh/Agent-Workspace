# GĐ3 LƯỢT 2 — EXECUTION IDEMPOTENCY + SIDE-EFFECT RECOVERY

## 1. Baseline
- Input checkpoint: `agent-webapp (19)(1).zip`.
- SHA-256 verified: `638d917fc3562a668bb4f318bcefd955724e39ed4e66288ac2f8a1e087086b31`.
- ZIP integrity: PASS.
- Entry count: 215.
- GĐ3 Lượt 1 implementation confirmed in source: canonical `ServerCapabilityRegistry`, central `CapabilityExecutionService`, Zod input/output contracts, independent `risk` / `sideEffect` / `confirmationPolicy`, output validation and 512 KiB bound, canonical 9 production capability IDs.

## 2. Pre-implementation audit
A. Execution identity before this lượt: Agent adapter forwarded `sessionId` and `toolCallId`; REST gateway did not expose an explicit retry/idempotency identity. Audit metadata also carried optional session/tool/request IDs but was not an execution authority.

B. ADK path: the existing adapter reads `toolContext.toolCallId` and `toolContext.sessionId` (or session state equivalent for session). This is the existing stable logical tool-call identity surface used by the application. The checkpoint intentionally excludes dependencies, so SDK internals were not treated as a second source of truth.

C. REST path: before this lượt there was no explicit idempotency contract. It now accepts a bounded `Idempotency-Key` header and passes it only as metadata into the canonical gateway.

D. `audit_logs` is observability/security truth, not an idempotency database: audit IDs are independently generated and audit finalization is not an atomic claim around the capability side effect.

E. Existing durable abstraction: Firebase Admin Firestore is already canonical durable server storage and existing code already uses `runTransaction`; it is reused for execution claims.

F. `system.tasks.create`: `UserDataService.createTask()` uses Firestore `.add()`, so a retry/reconnect could create a second document before this lượt.

G. `system.memory.add`: same mutation shape; it uses a new Firestore document per call and therefore had the same retry duplication risk.

H. Read-only capabilities (`system.memory.query`, `system.tasks.list`, `system.web.search`) do not need durable mutation dedupe. UI capabilities are `sideEffect: ui-local` and remain outside durable server-mutation dedupe.

## 3. Root cause/risk addressed
The central gateway had confirmation, permission, cancellation and audit controls, but no atomic durable execution claim for `sideEffect: mutation`. A client/Agent retry after a committed side effect could therefore invoke the handler again.

## 4. Execution identity design
- Agent: `agent:<sessionId>:<toolCallId>`.
- REST: `rest:<Idempotency-Key>`.
- Durable document ID: SHA-256 of the logical identity (not arguments).
- Durable binding: `userId + capabilityId + normalized inputHash + source + logical identity`.
- Same args with a different tool call/key are intentional independent executions.
- Reuse with changed user/capability/input/source fails closed with `EXECUTION_IDENTITY_MISMATCH`.
- Mutation without stable identity fails with `IDEMPOTENCY_KEY_REQUIRED`.

## 5. Durable execution state
Firestore collection: `capability_executions`.
Stored minimum: execution ID, user, capability, normalized input hash, source, logical ID, optional session/tool/request IDs, state, created/started/completed timestamps, bounded canonical success result, failure kind/error code.
States: `RUNNING`, `SUCCEEDED`, `FAILED`. No credentials or raw unbounded input are persisted.

## 6. Atomic claim semantics
A Firestore transaction performs read+create/binding validation atomically. New claim becomes `RUNNING`; `SUCCEEDED` reconciles prior result; active `RUNNING` returns `EXECUTION_IN_PROGRESS`; stale RUNNING fails closed as `EXECUTION_RECONCILIATION_REQUIRED`; mismatched binding is rejected. No check-then-act claim is used.

## 7. Retry/failure semantics
- Deterministic pre-handler failures are marked `FAILED/PRE_HANDLER` and may be re-claimed safely for the exact same bound execution.
- Once the capability handler has started, failure/cancellation is `FAILED/AMBIGUOUS_POST_START`; automatic retry is refused.
- Success is persisted as `SUCCEEDED` with the safe bounded result.
- If handler success occurs but execution-result persistence fails, the record remains `RUNNING`; retry fails closed rather than rerunning the mutation.
- No universal exactly-once claim is made; external side effects are not transactionally coupled to Firestore.

## 8. HITL interaction
Order remains: confirmation preflight → server confirmation consume → mutation execution claim → handler. Existing confirmation replay and exact argument binding remain independent protections. A consumed confirmation cannot be replayed; a fresh valid confirmation for the same logical execution can reach the execution layer and reconcile an already successful result.

## 9. Cancellation/timeout interaction
Existing AbortSignal/deadline architecture is unchanged. Cancellation before handler start is a pre-handler failure; cancellation after handler start is ambiguous and blocks automatic retry. A response disconnect/timeout after a possible side effect cannot cause a second handler invocation for the same logical execution.

## 10. Agent path
`CapabilityToolAdapter` remains an adapter only. It forwards existing `sessionId` + `toolCallId` into `CapabilityExecutionService`; all claim/reconciliation authority remains in the gateway. No ADK-local dedupe subsystem was added.

## 11. REST path
`POST /api/capabilities/execute` now reads `Idempotency-Key`, validates `^[A-Za-z0-9._:-]{8,128}$`, and forwards it to the gateway. No client boolean/state can claim that an execution already happened. Read-only/UI capabilities do not require the header; mutation capabilities do.

## 12. Audit interaction
Audit remains separate durable observability/security truth. First execution, blocked duplicate and reconciliation attempts retain correlation through source/session/tool/request metadata and deterministic execution error dispositions. Audit is not used for atomic claiming and its schema was not redesigned.

## 13. Files changed
Production:
- `server/core/capabilities/CapabilityExecutionService.ts`
- `server/core/capabilities/serverCapabilityRegistry.ts`
- `server.ts`
- `PRODUCTION_SOURCE_MANIFEST.sha256`
- `SHA256SUMS.txt`

Tests/report:
- `server/core/capabilities/__tests__/executionIdempotency.test.ts` (new)
- `server/core/capabilities/__tests__/restIdempotencyContract.test.ts` (new)
- `GD3_LUOT2_EXECUTION_IDEMPOTENCY.md` (new)

## 14. Tests added/changed
Targeted tests cover first execution, exact retry, concurrent duplicate, distinct tool calls with same args, user/capability/input substitution, missing identity, read-only unaffected, ambiguous failure, stored-result revalidation, pre-handler failure, cancellation after handler start, HITL + dedupe, and REST header wiring.

## 15. TypeScript
BLOCKED BY ENVIRONMENT. `npm ci --ignore-scripts --no-audit --no-fund` could not complete in the sandbox; `node_modules` remained partial. `npm run lint` therefore failed before project typechecking with missing installed type definitions (including `node`, `express`, `react`, etc.). This is dependency-installation failure, not a claimed source PASS.

## 16. Targeted tests
NOT EXECUTED — Vitest/tsx installation is incomplete because `npm ci` did not complete. Tests were added but are not claimed PASS.

## 17. Full Vitest
NOT EXECUTED for the same environment/dependency reason. GĐ3 Lượt 1's previously locked 20/20 files and 127/127 tests are not re-labeled as current-run results.

## 18. QA
PASS: Stage 1 22/22; Stage 2 22/22; Stage 3A 8/8; Stage 3B 9/9; Stage 3C 8/8; Stage 4A 20/20; Stage 4B 43/43; Stage 4C 42/42; Stage 4D 40/40; Stage 5 static 24/24. Total: **238/238 PASS**. Nested behavior/integration checks invoked by the stage scripts also passed. A separate direct invocation of `qa-stage4b-behavior.mjs` was environment-blocked because the standalone runner could not load `.ts`; Stage 4B itself successfully ran that behavior suite as 18/18.

## 19. Build
NOT EXECUTED / BLOCKED BY INCOMPLETE DEPENDENCY INSTALLATION. No production build PASS is claimed.

## 20. Manifest
`PRODUCTION_SOURCE_MANIFEST.sha256`: 131 entries; `sha256sum -c` = 131 matched, 0 mismatched, 0 missing. Policy count remains exactly 131.

## 21. Security assessment
The implementation binds execution identity to authenticated user, capability and normalized input; rejects substitution; uses an atomic Firestore claim; does not persist credentials/raw input; stores only bounded successful gateway results; revalidates reconciled results through the current output schema and 512 KiB limit; leaves confirmation replay protection intact; and fails closed for stale/ambiguous executions.

## 22. Remaining risks
- Full TypeScript/Vitest/build gates require a complete dependency install in a normal project environment.
- Firestore execution state cannot provide universal exactly-once semantics for arbitrary external systems; ambiguous post-start outcomes intentionally require reconciliation rather than automatic retry.
- A stale RUNNING record is intentionally not auto-taken-over because its side-effect outcome may be unknown.

## 23. Explicit non-goals
No workflow engine, job queue, distributed lock framework, generic exactly-once claim, tasks.update/delete, files/workspace, connectors, generic HTTP fetch, registry/HITL/auth/session/SSE redesign, real Gemini call, commit, push, deploy, or GĐ3 Lượt 3 work.

## 24. Final verdict
**IMPLEMENTATION COMPLETE — RUNTIME VERIFICATION REQUIRED**

Not FINAL PASS and not READY FOR CHECKER under the strict acceptance gate because TypeScript, targeted/full Vitest and production build could not be executed in this sandbox after dependency installation failed.
