# Stage 4C Report

## Scope

**GĐ4C – Runtime & Production Hardening** only.

No GĐ4D, GĐ5 or GĐ6 work was performed. No provider/model architecture redesign, credential Secret Manager/KMS migration, file-upload subsystem, or Chatbox redesign was introduced.

## Input checkpoint

- Input ZIP: `modular-agent-webapp-v14-stage4b-execution-audit(4).zip`
- Required SHA-256: `93524772fd702fd5857c3fc248cb7e6879066c1f18d9a0e6904d9b455a021bb6`
- Verified input SHA-256: `93524772fd702fd5857c3fc248cb7e6879066c1f18d9a0e6904d9b455a021bb6`
- Verification result: **PASS**


### Checker repair input for this revision

- Repair input ZIP: `modular-agent-webapp-v14-stage4c-runtime-hardening.zip`
- Repair input SHA-256: `d9f29f855289a6c504a2f0c5d448398880b56c0d3a0402fe104f07d1b7dc3758`
- SHA-256 verification: **MATCH**
- Repair scope: only the two checker-reported session-recovery integration regressions: hybrid History visibility and ADK append semantics, plus their regression evidence/report updates.

## Changes

### A. Health / readiness

- Replaced hard-coded `status: "ok"` health response with component-based runtime health aggregation.
- Added explicit `ok`, `degraded`, and `error` states.
- Health reports process liveness plus Firestore/Admin, session persistence mode, module persistence state, and durable audit persistence.
- Session health exposes `persistent`, `in-memory-fallback`, or `unavailable` modes.
- Error health returns HTTP 503; degraded health remains observable without pretending the system is fully healthy.
- Firestore, audit, and session readiness probes are observational/read-only with respect to execution mode; calling `/api/health` does not activate session fallback.
- Development fallback is activated only by a real session operation failure. Recovery is session-safe: a session created in fallback remains pinned to process memory for that session's lifetime, while new sessions may use Firestore again after persistence recovers.

### B. ADC / Firestore diagnostics

- Removed the misleading `envHasADC` / `hasADC` diagnostic meaning.
- Diagnostics now expose only `googleApplicationCredentialsEnvPresent` plus `credentialStrategy: application-default-credentials`.
- The environment-variable presence is explicitly not treated as proof that ADC is available.
- No Firestore Rules change was used to work around Admin IAM.

### C. Fatal process handling

- `uncaughtException` and `unhandledRejection` now log a redacted summary and terminate with exit code 1 outside test mode.
- No internal restart loop was added.

### D. Cancellation propagation

- Added HTTP request/connection cancellation binding using `AbortController`.
- Propagated `AbortSignal` from Agent chat HTTP boundary to ADK `Runner.runAsync` using the ADK 2.0.0 `abortSignal` contract.
- Propagated ADK `toolContext.abortSignal` through the capability adapter and central execution gateway.
- Added cancellation checkpoints before starting capability execution.
- Propagated cancellation to the dedicated Gemini web-search request through `GenerateContentConfig.abortSignal`.
- Capability audit distinguishes `cancelled` from success/execution error.
- Removed the unsafe post-execution abort check that could retroactively label an already committed atomic mutation as cancelled.
- REST capability execution also receives the request cancellation signal.

### E. CSP / Helmet

- Production no longer disables CSP unconditionally.
- Added a production CSP constrained to the app and known Google/Firebase origins needed by the existing runtime.
- Development keeps relaxed CSP for Vite/HMR only.

### F. `/api/log-error` hardening

- Added strict schema validation.
- Added a dedicated 32 KB body limit.
- Added bounded message/source/stack fields and sanitized metadata.
- Reused audit redaction for secret-bearing strings/objects.
- Added a dedicated public telemetry rate limiter.
- Responses do not echo the submitted payload.

### G. Expensive endpoint protection

- Retained a global IP limiter while increasing its ceiling to reduce shared-NAT contention.
- Added a verified-user keyed limiter for Agent chat, capability execution, model testing/listing, and key testing provider calls.
- Rate-limited responses use HTTP 429.
- No billing/subscription/quota accounting platform was added.

### H. Attachment false affordance

- Removed the Chatbox file input/paperclip affordance and fake `[Đính kèm tệp: ...]` message injection.
- No file-upload subsystem was added.

### I. Session fallback visibility and recovery continuity

- Development-only in-memory fallback remains available for the existing permission-denied fallback case.
- Fallback state and sanitized failure reason are observable in session health/logging.
- Health probing remains observational and never changes the execution backend.
- Added per-session backend pinning: a session created while Firestore is unavailable remains routed to the same in-memory session even after Firestore recovers, preserving its prior state/events instead of creating an empty persistent session with the same ID.
- New sessions are not globally pinned and can return to Firestore after persistence recovery.
- Session pins are released when that fallback session is deleted/ended.
- Persistent `appendEvent` bookkeeping checks the current session's pin rather than the global degraded flag, so one pinned fallback session does not misclassify another persistent session.
- History/listing now uses hybrid semantics after recovery: Firestore sessions are merged with pinned in-memory sessions, deduplicated by session identity, sorted by `lastUpdateTime`, and only then paginated/limited.
- Local fallback `appendEvent()` now keeps the Runner-held `req.session` copy synchronized with the stored in-memory session exactly once; when both references are the same object it does not double-append.
- Production does not construct the in-memory fallback and therefore remains fail-closed.

### J. Module settings persistence

- Removed local `.data/db.json` filesystem persistence for module settings.
- Module enable/disable state is stored through Firebase Admin Firestore collection `module_settings`.
- Catalog metadata remains the source of truth; durable storage persists the mutable enabled state.
- Startup hydrates durable state before serving; failure is logged/surfaced instead of converted to success.
- Module read/toggle APIs return failure when durable persistence is unavailable.
- Capability discovery and execution perform a Firestore read-through refresh at the policy boundary, so another process instance cannot authorize execution from stale module cache.
- Capability discovery/execution fails closed for disable-able modules when shared durable module state cannot be verified.
- Module toggle reads the current durable enabled state and commits the module state change plus its durable audit entry in one Firestore transaction; audit failure therefore aborts the mutation instead of returning an error after a successful side effect.
- In-memory cache is updated only after the durable transaction/write succeeds.

### QA gate maintenance

- Added `scripts/qa-stage4c.mjs` and `scripts/qa-stage4c-behavior.mjs`.
- Added `scripts/qa-stage4c-session-integration.mjs`, which executes the real `FirestoreSessionService` source against an isolated Firestore stub to verify recovery/list/append semantics without external dependencies.
- Narrowed the existing GĐ4B tenant-isolation order assertion to the `AuditService.list()` method so the new read-only health probe `limit(1)` cannot create a false regression; the GĐ4B audit query contract itself is unchanged.

## Files changed / added

- `server.ts`
- `server/lib/firebaseAdmin.ts`
- `server/agent/adk/FirestoreSessionService.ts`
- `server/agent/adk/sessionBackendPinning.ts` (new in checker repair)
- `server/agent/adk/CapabilityToolAdapter.ts`
- `server/core/runtime/runtimeHealthPolicy.ts` (new)
- `server/core/runtime/requestCancellation.ts` (new)
- `server/core/audit/auditService.ts`
- `server/core/capabilities/CapabilityExecutionService.ts`
- `server/core/capabilities/serverCapabilityRegistry.ts`
- `server/core/capabilities/systemCapabilities.ts`
- `server/core/search/WebSearchService.ts`
- `server/infrastructure/storage.ts`
- `shared/contracts/capability.ts`
- `src/agent/ui/AgentChatThread.tsx`
- `src/__tests__/architecture.test.ts` (async capability-list callsite adjusted for fresh shared-state read)
- `scripts/qa-stage4b.mjs`
- `scripts/qa-stage4c.mjs` (new)
- `scripts/qa-stage4c-behavior.mjs` (new)
- `scripts/qa-stage4c-session-integration.mjs` (new in checker correction)
- `QA_STATUS.md`
- `STAGE4C_REPORT.md` (new)
- `SHA256SUMS.txt` (regenerated at packaging)

## QA

The table below distinguishes fresh evidence produced for this checker correction from evidence inherited from the immediately preceding GĐ4C ZIP. Per checker instruction, only GĐ3B and GĐ4C were rerun because this correction changes session-history/recovery semantics.

| Gate | Result | Evidence | Evidence status |
|---|---|---|---|
| Checker repair input SHA-256 | MATCH | `d9f29f855289a6c504a2f0c5d448398880b56c0d3a0402fe104f07d1b7dc3758` | **Fresh current** |
| GĐ1 regression | PASS | 22/22 | Inherited from repair input; not rerun |
| GĐ2 regression | PASS | 22/22 | Inherited from repair input; not rerun |
| GĐ3A regression | PASS | 8/8 | Inherited from repair input; not rerun in this checker-scoped correction |
| GĐ3B regression | PASS | 9/9 | **Fresh current** — history semantics directly affected |
| GĐ3C regression | PASS | 8/8 | Inherited from repair input; not rerun |
| GĐ4A regression | PASS | 19/19 | Inherited from repair input; not rerun |
| GĐ4B regression | PASS | 43/43 | Inherited from repair input; not rerun |
| GĐ4B behavior | PASS | 18/18 | Inherited from repair input; not rerun |
| GĐ4C behavior | PASS | 12/12 | **Fresh current**, invoked by GĐ4C gate |
| GĐ4C session integration | PASS | 5/5 | **Fresh current**; executes real `FirestoreSessionService` source with isolated Firestore stub |
| GĐ4C static/regression gate | PASS | 42/42 | **Fresh current** |
| Changed-file syntax parse | PASS | Node `--experimental-strip-types --check` on changed runtime TypeScript files | Fresh current |
| Diff whitespace diagnostics | PASS | `git diff --no-index --check` against exact repair input emitted no whitespace diagnostics | Fresh current |
| Conflict markers | PASS | none in repair scope | Fresh current |
| Added-line hard-coded secret scan | PASS | no private key/API-key/bearer/JWT/password/credential secret literal detected | Fresh current |
| TypeScript full typecheck | BLOCKED | dependency environment unchanged/unavailable; no PASS claimed | Not rerun |
| `npm test` | BLOCKED | dependency environment unchanged/unavailable; no PASS claimed | Not rerun |
| `npm run build` | BLOCKED | dependency environment unchanged/unavailable; no PASS claimed | Not rerun |
| Live Firestore/IAM integration | NOT EXECUTED | no live IAM claim | Not executed |

### Regression evidence for checker-reported session integration issues

- RED before production correction: `scripts/qa-stage4c-session-integration.mjs` = **1/4 PASS**. It failed Runner-session synchronization, hybrid `listSessions()`, and hybrid `listSessionSummaries()` while confirming that the original pin still preserved direct `getSession()` continuity.
- GREEN after production correction: integration suite = **4/4 PASS**.
- A fifth assertion then verified the checker-requested double-append guard when the Runner-held object is the same reference as the stored fallback session; final integration result = **5/5 PASS**.
- Final GĐ4C gate = **42/42 PASS**, including the integration suite.

## Decision

**GĐ4C SOURCE/STATIC/BEHAVIOR QA: PASS.**

**FULL TSC/TEST/BUILD: BLOCKED BY NETWORK / DEPENDENCY INSTALL.**

No known regression remains in the checker-reported session-recovery integration scope. GĐ3B and GĐ4C are fresh against the final source; unrelated gates are explicitly marked inherited rather than presented as fresh reruns.

## Known limitations

- Full dependency-based TypeScript/test/build verification could not be executed because dependency installation is blocked by the environment/network and the required npm cache is incomplete.
- Live Firestore Admin/IAM integration was not executed; no runtime IAM claim is made.
- Credential secret lifecycle hardening beyond the existing architecture remains outside this stage.
- Secret Manager/KMS migration, if selected for the project, remains GĐ4D work.
- Credential rotation/migration/release-boundary changes reserved for GĐ4D were not implemented.

## Out of scope / intentionally not performed

- **GĐ4D:** not performed.
- **GĐ5:** not performed.
- **GĐ6:** not performed.
- No Secret Manager/KMS implementation.
- No credential lifecycle redesign.
- No provider/model/default-model/search architecture redesign.
- No file upload implementation.
- No Chatbox UI redesign.
- No final project-wide release-ready declaration.
