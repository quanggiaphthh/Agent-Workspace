# Modular Agent Webapp v14 — Operations Runbook

This runbook covers operational behavior present in the locked v14 source. It does not replace cloud-provider IAM, Firebase, or incident-management procedures.

## 1. Health troubleshooting

Use `GET /api/health` as the first read-only readiness view.

### `status = ok`

Firestore Admin, session persistence, module persistence, and durable audit report healthy state.

### `status = degraded`

A component is operating in a degraded mode while no component reports hard error. The main implemented degraded session mode is process-local fallback in **non-production** runtime. Do not interpret degraded as full persistence assurance.

### `status = error`

At least one persistence component reports error; `/api/health` responds 503. Inspect component diagnostics and server logs. Error summaries are redacted and should be used with cloud logs/metrics, not replaced by logging secrets.

### Health probe rules

- Firestore/session/audit probes are read-only.
- Health must not trigger credential migration or writes.
- Health must not change session fallback mode.

## 2. Firestore `PERMISSION_DENIED`

For Admin SDK errors, check in this order:

1. Confirm the intended Firebase/Google Cloud project/database configuration.
2. Confirm ADC resolution for the backend runtime (attached service identity or configured ADC source).
3. Confirm the service identity has the required IAM access to the Firestore/Auth operations the backend performs.
4. Re-run a safe read-only staging preflight.

Do **not** open or weaken Firestore Security Rules to repair Admin SDK IAM. Admin SDK bypasses client Rules and is governed by IAM/ADC.

GĐ6 carries #17 Firestore IAM/ADC staging as **BLOCKED** because no live/staging preflight was available during GĐ5.

## 3. Session fallback and recovery

### Development/non-production permission failure

`FirestoreSessionService` may use process-local memory only when the in-memory fallback service exists (non-production). When a session falls back, its `(appName,userId,sessionId)` identity is pinned.

### After Firestore recovers

- An already-pinned fallback session continues on memory for that session lifetime so context is not replaced by an empty persistent session.
- New unpinned sessions can use Firestore again.
- History merges Firestore sessions with pinned in-memory sessions, deduplicates by identity, and sorts before pagination.
- Deleting a pinned session releases its pin.

### Production

Production does not instantiate the process-memory fallback. Firestore/session persistence failures are fail-closed/observable rather than silently becoming non-durable.

## 4. Credential decrypt / secret-backend failure

Typical safe error classes include secret-backend unavailable or decrypt failure.

Actions:

1. Verify `CREDENTIAL_ENCRYPTION_KEY` exists in the server environment and is the same master secret used to protect existing personal credentials.
2. Verify `CREDENTIAL_ENCRYPTION_KEY_ID` matches the expected current payload version identifier when explicitly configured.
3. Check deployment secret injection and service configuration without printing secret values.
4. Do not copy ciphertext/master keys into logs or tickets.
5. Do not fall back to plaintext storage.
6. Do not regenerate/replace the master key to “fix” decrypt errors; current design has no multi-key ring. A key change requires controlled migration.

Legacy plaintext/pre-GĐ4D AES records are migrated transactionally. If migration write fails, production must fail closed rather than continue using plaintext as normal storage.

## 5. Provider auth/quota errors and rotation

Provider failure classification uses explicit HTTP status before message heuristics:

- **401 → authentication**: eligible for personal credential rotation when `autoRotate` is enabled and response streaming has not started.
- **403 → authorization**: not a rotation trigger.
- **429 → quota/rate limit**: eligible for personal credential rotation before streaming.
- **5xx → transient provider failure**: not a credential rotation trigger.
- Other 4xx errors are treated as malformed/model errors according to message/model classification and are not rotated as credential failures.

Rotation rules:

- personal credential selection rotates only among active personal credentials for the same authenticated user and provider;
- ordering is deterministic by selected credential then durable priority/order;
- there is no silent personal→System Key crossover;
- once any response has been yielded/streamed, the request is not replayed with another credential.

## 6. Audit failure

`CapabilityExecutionService` writes a durable pending audit record before execution. If that pre-write fails, execution cannot proceed through the gateway normally.

After a side effect completes, audit finalization is attempted. If finalization fails, the source intentionally does **not** replay the side effect just to obtain a final audit update; the durable pre-record can remain pending for external inspection/reconciliation.

Module toggle is stronger: durable module-state change and audit entry are written in the same Firestore transaction, so the toggle must not report success if the transaction/audit staging fails.

## 7. Module persistence / scale-out

Module state is stored in Firestore `module_settings`. Each capability discovery/execution policy boundary refreshes durable module state. A disableable module whose shared state cannot be verified is treated as unavailable/fail-closed.

If module state differs across instances:

1. inspect Firestore `module_settings` and backend IAM;
2. inspect `/api/health` module component;
3. do not repair by reintroducing local filesystem state;
4. retry only after durable shared state is healthy.

## 8. Cancellation / Stop

The UI Stop action aborts the active browser request through `AbortController`. The server binds request cancellation and propagates the signal through Agent/Runner, capability/tool execution, Web Search, and provider calls where supported.

Operational semantics:

- cancellation is distinct from execution error;
- central capability cancellation is audited as cancelled;
- cancellation does not imply rollback of a mutation that already completed;
- the gateway must not replay a completed mutation after cancellation/audit-finalization failure.

## 9. Public client error endpoint

`POST /api/log-error` is intentionally public but bounded by:

- strict payload schema;
- 32 KB JSON limit;
- sanitization/redaction;
- dedicated rate limiting.

Do not expand this endpoint to accept arbitrary headers/tokens/raw request dumps.

## 10. Release verification blockers to keep visible

- #17 Firestore IAM/ADC staging — **BLOCKED**.
- #20 Full runtime/toolchain verification — **BLOCKED**.
- #53 Firestore Rules Emulator — **BLOCKED**.

These must remain visible in incident/release handoff until real environment evidence closes them.
