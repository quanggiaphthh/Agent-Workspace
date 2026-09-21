# GĐ4 LƯỢT 3A — ATTACHMENT FOUNDATION

## Status
IMPLEMENTATION CANDIDATE COMPLETE; LOCAL VERIFICATION BLOCKED BY DEPENDENCY INSTALL ENVIRONMENT. NOT A FINAL PASS CHECKPOINT.

## Baseline and RED
- Canonical baseline: `2f45b997db25fd61736b239f71f6d3767aa4a508`.
- Externally verified VALID RED: `server/agent/chat/__tests__/attachmentFoundation.test.ts`, 5 tests.
- Initial production manifest: 138/138 matched, 0 mismatch, 0 missing.

## Production changes
- `server/agent/chat/chatRequestContract.ts`: optional strict `{fileId}` attachment refs; max 4; canonical UUID-shaped ID validation; duplicate rejection; attachments forbidden on HITL tool responses; no authority/data fields accepted.
- `server/agent/chat/attachmentPolicy.ts`: separate model-input count/per-file/aggregate policies and canonical model MIME allowlist.
- `server/core/files/UserFileService.ts`: owner-authorized bounded `readBytes`; metadata precheck plus actual bounded binary result; safe fail-closed errors; pre/post abort checks.
- `server/core/files/firebaseFileStores.ts`: streaming `readBounded` implementation with metadata defense-in-depth and actual streamed-byte ceiling; no successful partial-file result.
- `server/agent/chat/attachmentService.ts`: run-scoped authorized resolution; MIME/per-file/aggregate enforcement; safe metadata representation separated from bytes.

## Test changes
- Existing RED seed retained unchanged.
- Added `server/agent/chat/__tests__/attachmentBehavior.test.ts` covering strict contract, authority-field rejection, ownership, missing data, MIME policy, bounds, aggregate bound, safe errors, representation separation and cancellation.
- Existing in-memory BinaryStore test doubles were extended only to satisfy the canonical bounded-read interface.
- Prospective targeted matrix is 49 tests total (5 RED seed + 44 added behavioral cases, counting parameterized cases).

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
Updated to 141 entries. Local `sha256sum -c`: 141/141 matched, 0 mismatch, 0 missing.

## Verification blocker
The execution container could not complete `npm ci --no-audit --no-fund`: the process remained stalled after emitting an engine warning (`@mikro-orm/core@7.2.0` requires Node >=22.17.0; local runtime is Node 22.16.0) and dependencies never became runnable. Therefore targeted GREEN, TypeScript, full Vitest, acceptance, QA Stage 1–5 and production build are **not claimed** in this report. The externally reported clean AI Studio environment should run those gates on this candidate.

## L3B gate
REMAINS CLOSED. No L3B implementation was performed.
