# GD3 LƯỢT 1 — CAPABILITY CONTRACT + REGISTRY HARDENING

## Baseline
- Canonical baseline: `7b2a4e9f3f6b87c96f726920612180afe8e84753`.
- Uploaded working source contained the expected Agent-Workspace architecture and the canonical 131-entry production manifest.
- Pre-change manifest verification: 131/131 matched, 0 missing, 0 mismatched.
- No Git metadata was present in the transport ZIP; baseline identity was therefore checked against the locked canonical source/manifest rather than by trusting ZIP metadata.

## Root-cause / gap addressed
The existing runtime already had the correct central registry (`ServerCapabilityRegistry`) and execution gateway (`CapabilityExecutionService`), but descriptor semantics were incomplete: side effects were not machine-readable, confirmation was inferred from `risk === high`, output schemas were not enforced, successful tool results had no canonical size bound, and registration silently overwrote duplicate IDs without validating descriptor permissions/modules/contracts.

## Architecture before / after
No parallel registry or gateway was introduced. The existing path remains:
`RootAgent -> CapabilityToolAdapter -> CapabilityExecutionService -> ServerCapabilityRegistry -> handler -> validated/bounded result -> ADK`.

After hardening, registration normalizes/validates descriptors before they enter the canonical registry. Execution validates input, policy, authorization, explicit confirmation policy, handler output schema, then serialized UTF-8 result size.

## Exact contract
- `sideEffect`: `none | mutation | ui-local`.
- `confirmationPolicy`: `none | required`.
- `risk`: remains independent `low | medium | high` metadata.
- Backward compatibility: a legacy descriptor that omits the two new fields is normalized so `risk: high` becomes `sideEffect: mutation` + `confirmationPolicy: required`; other legacy descriptors normalize to no side effect/no confirmation.
- Explicit metadata is authoritative after registration; confirmation is no longer inferred from risk at execution time.
- If `outputSchema` exists, handler output must pass runtime Zod validation or execution returns `INVALID_OUTPUT` without returning raw invalid handler data.
- Successful results are JSON-serialized and bounded at 524,288 UTF-8 bytes (512 KiB). Oversized output returns `RESULT_TOO_LARGE`; there is no silent truncation because truncation can change tool semantics.
- Non-serializable/undefined successful output returns `INVALID_OUTPUT`.

## Registry validation
Registration now rejects deterministic contract violations: duplicate ID, missing/non-function handler, malformed input/output schema, invalid risk, unknown canonical permission, missing/unknown module association, invalid side-effect value, invalid confirmation policy, and `confirmationPolicy: required` combined with `sideEffect: none`.

Canonical permissions are derived from the existing shared permission authority; no parallel permission list was created.

## Existing capability metadata
All 9 baseline capabilities remain registered with unchanged IDs:
- UI: `ui.openEntity`, `ui.openModule`, `ui.refresh`, `ui.showNotification` => `ui-local`, confirmation `none`.
- Read-only/data retrieval: `system.memory.query`, `system.tasks.list`, `system.web.search` => `none`, confirmation `none`.
- Mutations: `system.memory.add`, `system.tasks.create` => `mutation`, confirmation `none` (preserves current user-visible behavior).
- Output schemas were added to all 9 existing server capabilities.

No `tasks.update` or `tasks.delete` was added.

## Files changed
Production/contract:
- `shared/contracts/capability.ts`
- `shared/security/permissions.ts`
- `server/core/capabilities/serverCapabilityRegistry.ts`
- `server/core/capabilities/CapabilityExecutionService.ts`
- `server/core/capabilities/systemCapabilities.ts`
- `server/core/capabilities/uiCapabilities.ts`
- `server/agent/adk/CapabilityToolAdapter.ts`
- `server/agent/adk/RootAgent.ts`
- `src/core/capabilities/capabilityRegistry.ts`

Tests:
- added `server/core/capabilities/__tests__/capabilityContract.test.ts`
- adjusted `src/__tests__/acceptance.test.ts` and `src/__tests__/architecture.test.ts` to reset the canonical registry because duplicate registration is now intentionally rejected instead of silently overwriting an existing descriptor.

Manifest:
- `PRODUCTION_SOURCE_MANIFEST.sha256` hashes refreshed in-place; policy remains exactly 131 paths.

## Tests added / changed
Targeted tests cover: canonical nine-capability inventory, duplicate ID, malformed descriptor, unknown permission, side-effect/confirmation consistency, explicit confirmation independent of risk, legacy high-risk compatibility, output schema success/failure, normal/near-bound/oversized results, nested multibyte UTF-8 sizing, module filtering, permission filtering, Web Search disabled discovery filtering, and deterministic collision-safe tool-name mapping.

## Verification
### Dependency install
- `npm ci`: BLOCKED by execution environment/network timeout.
- `npm ci --offline`: BLOCKED because npm cache lacks `zwitch-2.0.4.tgz`.
- No `node_modules` was supplied in the baseline transport.

### TypeScript (`npm run lint`)
BLOCKED as a valid project gate because dependencies/type declarations are unavailable. A global `tsc --noEmit` probe was run only diagnostically and fails immediately on missing packages/types (`express`, `zod`, `@google/adk`, `vitest`, Node types, etc.); it is not reported as a product failure or PASS.

### Targeted Vitest
BLOCKED: Vitest dependency is unavailable because dependency installation is blocked.

### Full Vitest
BLOCKED for the same reason.

### QA scripts
BLOCKED because project dependencies are unavailable.

### Production build
BLOCKED because Vite/esbuild/project dependencies are unavailable.

No Gemini real-service call was made.

## Manifest status
- Old policy count: 131.
- New policy count: 131.
- Paths added/removed from policy: 0.
- Post-change manifest verification: 131/131 matched, 0 missing, 0 mismatched.
- The new audit report and new targeted test are not added to the manifest because they were outside the existing 131-path policy.

## Remaining risks
The implementation could not receive executable TypeScript/Vitest/build verification in this environment. It therefore requires checker/AI Studio to run the normal dependency-backed gates before acceptance. General idempotency/deduplication remains intentionally deferred to GĐ3 Lượt 2.

## Explicit non-goals
No new gateway/registry, no idempotency/dedupe, no task update/delete, no file/workspace or generic HTTP tool, no connector/plugin framework, no audit/session/SSE/auth redesign, no ADK replacement, no dependency upgrade, no Lượt 2 work.

## Final verdict
**IMPLEMENTATION COMPLETE, VERIFICATION ENVIRONMENT BLOCKED — NOT YET ELIGIBLE TO CLAIM `GĐ3 LƯỢT 1 — READY FOR CHECKER`.**

Reason: the acceptance gate explicitly requires targeted tests to PASS, and this environment cannot install/run Vitest. The checkpoint is suitable for dependency-backed verification by the checker/AI Studio; no PASS is fabricated.
