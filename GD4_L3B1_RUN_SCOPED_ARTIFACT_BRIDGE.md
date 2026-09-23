# GĐ4 L3B-1 — RUN-SCOPED ARTIFACT BRIDGE

## Verdict

**BLOCKED — LOCAL DEPENDENCY INSTALLATION / VERIFICATION ENVIRONMENT.**

Implementation candidate is packaged for checker/AI Studio verification, but this report does **not** claim READY or FINAL PASS because `npm ci --no-audit --no-fund` timed out in the execution environment and the resulting partial `node_modules` cannot run the required Vitest/build verification. L3B-2 was not started.

## A. SOURCE AUDIT

- Fresh input: `agent-webapp (33)(2).zip` (uploaded copy of `agent-webapp (33).zip`).
- Received SHA-256: `4a0284af007819c6a5611886e92d8b6d0cbd62b901f2c9791fc0d7acabdb2f48` — exact MATCH with expected.
- ZIP integrity: PASS (`unzip -t`, no compressed-data errors).
- Planning files present: `PROJECT_MASTER_PLAN.md`, `docs/MVP_COMPLETION_PLAN_REUSE_FIRST.md`, `docs/MVP_IMPLEMENTATION_TRACKER.md`, `docs/MVP_EXECUTION_PHASES.md`.
- Exact lock dependency: `node_modules/@google/adk` lock entry = `2.1.0`.
- Original production manifest SHA-256: `17c033d28aa9bfd0178e02be842eee895f4e5a9325de030f8ac044a668270758`; baseline `sha256sum -c PRODUCTION_SOURCE_MANIFEST.sha256` = PASS before changes.
- L3A canonical binary read remains `UserFileService.readBytes(ownerId,fileId,maxBytes,signal)`, with owner fail-closed authorization, metadata size guard, `BinaryStore.readBounded`, and cancellation propagation.
- Existing `resolveAttachments()` remains eager binary materialization and therefore is intentionally not reused as the L3B materialization path.
- L3A canonical policy remains 4 attachments/turn, 20 MiB/file, 20 MiB aggregate, canonical MIME allow-list.
- No source drift found that invalidates L3B-0/L3B-1 assumptions.
- `npm ci --no-audit --no-fund` was attempted twice but the container transport timed out; no dependency/version changes were made.

## B. REUSE AUDIT

Reused approved L3B-0 CASE B: native Google ADK + a small app-owned adapter. Exact ADK v2.1.0 public `BaseArtifactService` interface is implemented structurally; no package patch/private API is used. Existing `UserFileService.resolve()` is reused for current-request authorization/metadata/blob-existence resolution without byte materialization; `UserFileService.readBytes()` is reused as the sole lazy bounded binary read. Existing attachment policy constants are reused; no duplicate limits are introduced.

## C. NEW-CODE NECESSITY PROOF

### `server/agent/adk/RunScopedArtifactService.ts` — new production file

Requirement: expose only current-request authorized attachments through the native ADK artifact contract while keeping `UserFileService` as file authority and binary reads lazy.

Existing source is insufficient because L3A `resolveAttachments()` eagerly reads bytes and ADK's generic artifact service cannot know Agent-Workspace's current-request attachment whitelist. Native ADK supplies the interface/lifecycle seam but cannot enforce the app's request-local authority by itself.

Smallest owned code: one invocation-local adapter plus one async factory. No registry, persistence, upload path, Runner, model loop, business capability, or second artifact framework was added.

### `server/agent/adk/__tests__/runScopedArtifactService.test.ts` — new targeted test

Covers only Agent-Workspace-owned authorization/lazy-read/read-only boundary. It does not retest generic Runner, LoadArtifactsTool, Gemini Part support, or generic ADK artifact behavior.

### `PRODUCTION_SOURCE_MANIFEST.sha256` — changed

Canonical guardrail requires legitimate production-source changes to be represented. No regeneration script exists in the repository. The new production file's SHA-256 was computed from its actual bytes and inserted alongside ADK production entries; `sha256sum -c PRODUCTION_SOURCE_MANIFEST.sha256` passes after the update. Existing entries were not recomputed or altered.

## D. IMPLEMENTATION SUMMARY

Changed/added:

- `server/agent/adk/RunScopedArtifactService.ts` — new read-only request-scoped ADK adapter.
- `server/agent/adk/__tests__/runScopedArtifactService.test.ts` — targeted boundary tests.
- `PRODUCTION_SOURCE_MANIFEST.sha256` — new production file entry only.

Whitelist design: factory receives verified owner + current request attachment refs, resolves each through canonical `UserFileService.resolve()`, validates returned owner/file identity, canonical MIME, per-file bound and aggregate metadata bound, then stores a private immutable metadata snapshot keyed directly by canonical opaque `fileId`. There is no user-library listing API.

Lazy path: list/version methods use only the private whitelist and never call `readBytes`. `loadArtifact()` is the only binary materialization boundary and calls canonical `readBytes(..., MAX_MODEL_INPUT_BYTES_PER_FILE, signal)`.

Cancellation: the request `AbortSignal` is retained invocation-locally and passed unchanged to `readBytes`; adapter does not catch/rewrite canonical cancellation errors.

Aggregate defense: factory enforces canonical aggregate metadata policy; load also tracks invocation-local unique materialized byte sizes and fails if actual unique materialization would exceed the same canonical aggregate constant.

MIME/key mapping: artifact key is canonical opaque `fileId`; `Part.inlineData.mimeType` comes from canonical server metadata and `data` is base64-created only at load boundary. Storage object/path/URL/internal owner metadata are not exposed. ADK Part has no filename field requiring a separate display-name channel.

Version semantics: current-request artifacts truthfully expose one invocation-local version (`0`). Unknown/unattached/stale/nonzero-version loads return `undefined`; version listings return empty. No fake version persistence exists.

Mutation: `saveArtifact` and `deleteArtifact` fail closed with `ARTIFACT_READ_ONLY`; nothing is forwarded to `UserFileService` mutation/storage paths.

Durability: adapter has no persistence dependency/API. Base64 exists only in the returned invocation-local Part; no Event/state/history/SSE/localStorage/audit write was added.

## E. TEST MINIMIZATION

Targeted tests cover: whitelist-only listing; LIST != READ; lazy authorized load; unknown/guessed key; same-owner unattached; foreign key and foreign current-request reference; stale prior-turn key; exact bounded read call; pre/in-flight cancellation propagation; canonical MIME; canonical key; no storage-path leak; read-only mutation failure; truthful version behavior; empty attachment scope; aggregate policy; no binary read during construction/listing.

Generic ADK Runner, LoadArtifactsTool behavior, BaseArtifactService implementation internals, and Gemini Part support are intentionally not duplicated.

## F. VERIFICATION

### Source/preconditions

- Input SHA exact match: PASS.
- ZIP integrity: PASS.
- Required planning files: PASS.
- `@google/adk` lock = 2.1.0: PASS.
- Baseline manifest verification before changes: PASS.
- Source drift gate: PASS.

### TDD / targeted / regressions

A targeted test was authored before production implementation. A behavioral RED run could not be obtained because dependency installation timed out and `node_modules/.bin/vitest` is absent after the failed clean install. Therefore TDD RED/GREEN, targeted suite, locked regressions and full Vitest are **NOT VERIFIED in this environment** and no PASS is claimed.

### TypeScript

`npm run lint` was attempted after the failed install. It cannot provide a valid project result because the partial dependency tree is missing type packages (examples: `tough-cookie`, `triple-beam`, `unist`). **NOT VERIFIED; environment-blocked.**

### Production build

`npm run build` was attempted; `vite` is absent from the partial dependency tree. **NOT VERIFIED; environment-blocked.**

### Manifest

Candidate `sha256sum -c PRODUCTION_SOURCE_MANIFEST.sha256`: PASS. Candidate manifest SHA-256: `00535e41f70c94201b45c073cb3f8323604a4f1b2ebdd080ae57e868a335b109`.

### Static security

Changed production file contains no Firebase/Storage authority, signed URL, storage path, localStorage, state/history persistence, ServerCapabilityRegistry registration, Runner construction, Gemini loop, or durable base64 serialization. No package/dependency files changed.

Static production registrations remain exactly 9: 4 UI + 5 system `ServerCapabilityRegistry.register(...)` sites. Artifact bridge is not registered as a business capability.

## G. DEVIATIONS

No architecture/scope deviation from L3B-0. Verification deviation only: required npm-based tests/typecheck/build cannot run because clean dependency installation timed out in this container. This is reported as a blocker rather than being hidden or replaced with invented PASS evidence.

## H. NEXT

**L3B-2 NOT STARTED.**

Required next action: run clean `npm ci --no-audit --no-fund`, targeted L3B-1 test, locked L3A/L2B/L2A/L1/capability/cancellation regressions, full Vitest if feasible, `npm run lint`, `npm run build`, and final manifest verification in AI Studio/checker environment. Do not start L3B-2 until checker accepts the verified candidate.
