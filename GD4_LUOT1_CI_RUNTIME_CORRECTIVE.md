# GĐ4 LƯỢT 1 — CI/RUNTIME VERIFICATION CORRECTIVE

## Baseline

- Repository: `quanggiaphthh/Agent-Workspace`
- Branch: `main`
- HEAD investigated: `d47500b6e4bcff4ac12aaec7283d4ffdfd323955`
- Previous GĐ4 Lượt 1 implementation commit: `49c2838b1ca6da594d9b347a6b5e191209dbe772`
- GitHub Actions run: `35553136276`, job `verify` (`106191514198`)
- No commit/push/deploy was performed.

## Failure reproduction

The existing GitHub Actions run established:

- `npm ci`: PASS (742 packages)
- initial manifest: PASS
- TypeScript (`tsc --noEmit`): PASS
- targeted GĐ4 storage tests: 27/27 PASS
- full Vitest: FAIL — 23 files PASS, 6 FAIL; 223 tests PASS, 5 FAIL; 30 unhandled errors.

The log shows three root-cause families:

1. Client Firebase initialization throws when `VITE_FIREBASE_API_KEY` is absent, so four suites fail during import/collection.
2. `integration.test.ts` mocks the session persistence probe but `/api/health` also calls real `probeFirestoreAdmin()` and `AuditService.probeHealth()`. Those escape the test boundary and attempt Google ADC/Firestore on the GitHub runner.
3. `capabilityToolBridge.test.ts` mocks idempotency, audit, storage, confirmation consume/reject, but not `CapabilityConfirmationService.prepare()`. Required-confirmation tests therefore attempt a real Firestore write. Without ADC, the canonical gateway sanitizes that persistence failure to `EXECUTION_ERROR`, causing both HITL assertions to fail.

## Failure classification

| Failure | Classification | Finding |
|---|---|---|
| Firebase client API configuration unavailable | CI_ENVIRONMENT / TEST_HARNESS | CI did not provide the required client configuration value. |
| `/api/health` timeouts | TEST_HARNESS | Two real Firestore health collaborators were left live. |
| 30 ADC errors | CASCADE_FROM_ENVIRONMENT | Live Firestore calls escaped hermetic tests. |
| HITL `requiresConfirmation` undefined | CASCADE_FROM_ENVIRONMENT | Confirmation prepare failed before a challenge could be returned. |
| `CONFIRMATION_REQUIRED` became `EXECUTION_ERROR` | CASCADE_FROM_ENVIRONMENT | Same Firestore/ADC failure, safely sanitized by the gateway. |
| GĐ4 production file foundation | NO DEFECT PROVEN | Targeted suite remains 27/27 PASS in the failing CI run. |

## Corrective files

### `.github/workflows/gd4-luot1-verification.yml`

Adds CI-only `VITE_FIREBASE_API_KEY=ci-test-only-not-a-production-key`. This is not an Admin credential, service-account key, or production secret. It satisfies the existing client initialization precondition while tests remain hermetic.

Adds an explicit `capabilityToolBridge.test.ts` verification gate before full Vitest.

### `src/__tests__/integration.test.ts`

Extends the existing test harness to mock `probeFirestoreAdmin()` and stub `AuditService.probeHealth()`, while preserving the existing mocked `FirestoreSessionService` probe. Production `/api/health` is unchanged.

### `server/agent/adk/__tests__/capabilityToolBridge.test.ts`

Mocks `CapabilityConfirmationService.prepare()` alongside the existing confirmation/idempotency/audit/storage doubles. Production HITL and canonical authority paths are unchanged.

### `PRODUCTION_SOURCE_MANIFEST.sha256`

The existing manifest includes `src/__tests__/integration.test.ts`; its checksum was regenerated. Manifest count remains 134.

## Verification after corrective

Local final manifest check: **134/134 matched, 0 mismatch, 0 missing — PASS**.

A complete post-corrective TypeScript/Vitest/QA/build run could not be executed in this environment because the surfaced local dependency tree is incomplete and the execution environment cannot fetch a clean dependency tree. Therefore no post-corrective runtime PASS is claimed.

Required clean CI sequence remains:

1. `npm ci`
2. `sha256sum -c PRODUCTION_SOURCE_MANIFEST.sha256`
3. `npx tsc --noEmit`
4. `npx vitest run server/core/files/__tests__/fileStorageFoundation.test.ts`
5. `npx vitest run server/agent/adk/__tests__/capabilityToolBridge.test.ts`
6. `npm run test`
7. canonical QA Stage 1–5
8. `npm run build`
9. final manifest verification

Acceptance requires full Vitest 0 failed tests and 0 unhandled errors.

## Security / architecture invariants

Production implementation files changed: **0**.

The corrective does not change server-mediated upload, Firebase Storage/Firestore ownership, authorization, MIME/size/path validation, compensation, canonical capability count, CapabilityExecutionService, CapabilityConfirmationService, ADK/HITL resume, or Agent file capability scope. No secret or service-account private key is included. No GĐ4 Lượt 2 work is present.

## Changed-file set

1. `.github/workflows/gd4-luot1-verification.yml`
2. `src/__tests__/integration.test.ts`
3. `server/agent/adk/__tests__/capabilityToolBridge.test.ts`
4. `PRODUCTION_SOURCE_MANIFEST.sha256`
5. `GD4_LUOT1_CI_RUNTIME_CORRECTIVE.md`

Equivalent diff scope: 1 CI workflow, 2 test-harness files, 1 manifest checksum line, 1 report; 0 production implementation files.

## Final verdict

**NOT FINAL PASS — CORRECTIVE PREPARED, COMPLETE CI RE-VERIFICATION REQUIRED.**

The prior failures have a reproducible CI/test-harness root cause. FINAL PASS is only permitted after the complete post-corrective CI run passes full Vitest with 0 unhandled errors, canonical QA, build, and final manifest.
