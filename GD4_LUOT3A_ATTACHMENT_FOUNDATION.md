# GĐ4 LƯỢT 3A — ATTACHMENT FOUNDATION

## Status
GĐ4 LƯỢT 3A — FINAL PASS / LOCKED

- Canonical production checkpoint: `1ae1a7431b58d54b7996d3cded5093e26b534352`
- Canonical GitHub Actions: `35658931580`
- Result: **SUCCESS**

## Verified evidence
- TypeScript: PASS
- Foundation: 5/5 PASS
- Behavior: 43/43 PASS
- Total targeted L3A: 52/52 PASS
- L2B: 9/9 PASS
- L2A: 16/16 PASS
- L1: 27/27 PASS
- Capability Bridge: 18/18 PASS
- Full Vitest: 33/33 files, 347/347 tests PASS
- Acceptance: 13/13 PASS
- QA Stage 1–5: ALL PASS
- Production build: PASS
- Manifest: 141/141 PASS
- Capability count: 9
- Static security: PASS

## Production changes
- `server/agent/chat/chatRequestContract.ts`: optional strict `{fileId}` attachment refs; max 4; canonical UUID-shaped ID validation; duplicate rejection; attachments forbidden on HITL tool responses; no authority/data fields accepted.
- `server/agent/chat/attachmentPolicy.ts`: separate model-input count/per-file/aggregate policies and canonical model MIME allowlist.
- `server/core/files/UserFileService.ts`: owner-authorized bounded `readBytes`; metadata precheck plus actual bounded binary result; safe fail-closed errors; pre/post abort checks.
- `server/core/files/firebaseFileStores.ts`: streaming `readBounded` implementation with metadata defense-in-depth and actual streamed-byte ceiling; no successful partial-file result.
- `server/agent/chat/attachmentService.ts`: run-scoped authorized resolution; MIME/per-file/aggregate enforcement; safe metadata representation separated from bytes.

## Test changes
- Added `server/agent/chat/__tests__/attachmentFoundation.test.ts` (5 tests) as the foundation RED seed.
- Added `server/agent/chat/__tests__/attachmentBehavior.test.ts` covering strict contract, authority-field rejection, ownership, missing data, MIME policy, bounds, aggregate bound, safe errors, representation separation and cancellation.
- Existing in-memory BinaryStore test doubles were extended only to satisfy the canonical bounded-read interface.
- Final targeted L3A matrix: 52 tests total (Foundation 5 + Behavior 47).

## Security / history boundary
- No Gemini `inlineData`, `fileData`, Files API, base64 model payload, arbitrary URL, new Agent file capability, or parallel file/history authority was added.
- Resolver bytes are run-scoped and structurally separated from `SafeAttachmentReference`.
- L3A does not inject attachment bytes or metadata into ADK `newMessage`, Event, SSE, Firestore history, or logs.
- `/api/agent/chat` model invocation was not changed; carrying bytes into ADK remains L3B scope.
- Static production registration count remains 9 capabilities.

## Cancellation
Firebase Storage download is implemented as a bounded read stream. Abort is checked before read and wired to stream destruction; UserFileService also performs deterministic post-read abort handling. No separate cancellation subsystem was introduced.

## Errors
Foreign/missing metadata remains fail-closed as `FILE_NOT_FOUND`. Storage internals are mapped to safe `FILE_READ_FAILED`; size failures use deterministic model-input limit errors. Storage object/path is not included in public error messages.

## Manifest
141 entries. Canonical verification `sha256sum -c`: 141/141 matched, 0 mismatch, 0 missing.

## L3B status
READY FOR L3B IMPLEMENTATION subject to the approved L3B design/implementation gate.

## Historical pre-verification status
- Status: IMPLEMENTATION CANDIDATE COMPLETE; LOCAL VERIFICATION BLOCKED BY DEPENDENCY INSTALL ENVIRONMENT. NOT A FINAL PASS CHECKPOINT.
- Baseline: `2f45b997db25fd61736b239f71f6d3767aa4a508`.
- Verification blocker: The execution container could not complete `npm ci --no-audit --no-fund`: the process remained stalled after emitting an engine warning (`@mikro-orm/core@7.2.0` requires Node >=22.17.0; local runtime is Node 22.16.0) and dependencies never became runnable.
