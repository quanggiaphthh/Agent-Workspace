# GĐ4 LƯỢT 2B — END-USER FILE UPLOAD INTEGRATION

## 1. Baseline / source audit
- Canonical production baseline requested: `c9b62f2a918c159abb82c12d000d01ef81e927f2`.
- Canonical documentation HEAD requested: `85efb6c1e25f2cf4eb2ad4a1ec1b733ca2fc805f`.
- Working transport supplied for implementation: `agent-webapp (24).zip`.
- Transport SHA-256: `6f70c18ff7cec5405da0f039803495f70df4f48ed5989aa8a66e8ceae4ca1c6b`.
- ZIP integrity: PASS; input entries: 242.
- Input production manifest: 135/135 matched, 0 mismatch, 0 missing.
- `GD4_LUOT2_SECURE_FILE_INGESTION.md` present.
- The transport intentionally contains no `.git`, so branch/HEAD/git-status cannot be independently reconstructed from this ZIP. No source divergence was introduced before implementation.

## 2. UI entry point
`HomeModule` hosts one minimal `FileUploadCard`. No Files module, file library, listing, delete lifecycle, chat attachment, or GĐ4 Lượt 3 work was introduced.

## 3. Files changed
Production:
- `shared/contracts/fileUploadPolicy.ts` — public non-secret upload policy only.
- `server/core/files/filePolicy.ts` — reuses shared public size/MIME constants; server validation remains authoritative.
- `src/modules/home/fileUploadClient.ts` — precheck, canonical `/api/files` transport, public response projection, safe error mapping, reducer/state semantics.
- `src/modules/home/FileUploadCard.tsx` — minimal end-user upload UI.
- `src/modules/home/HomeModule.tsx` — mounts the upload card.
- `PRODUCTION_SOURCE_MANIFEST.sha256` — updated according to existing append/update convention.

Tests/report:
- `src/modules/home/__tests__/fileUploadClient.test.ts`.
- `GD4_LUOT2B_END_USER_UPLOAD.md`.

## 4. Public upload policy
Public shared contract exposes only supported MIME/extensions and the 20 MiB application limit. Supported types remain PDF, JPEG, PNG, WebP, TXT, Markdown. No storage/bucket/path/owner configuration is exposed.

## 5. Request flow / auth
`FileUploadCard` → `uploadUserFile` → existing `authFetch` → `POST /api/files`.
Body is the raw `File`. Headers are `Content-Type` and URI-encoded `X-File-Name`. No ownerId, fileId, storageObject, bucket, path, or client-authoritative metadata is sent.

## 6. UX state and race handling
Reducer states: idle / selected / uploading / success / error. Upload is disabled while pending. Selection change or Clear increments a request generation and aborts the active request. Late success/failure actions whose request ID no longer matches are ignored. Deliberate abort is classified separately and does not create a false network error. Retry after a server/network failure reuses the selected physical file but creates a new request; no idempotency claim is made.

## 7. Error mapping
Machine-readable codes are mapped to safe Vietnamese UX messages for size, unsupported/mismatched type, malformed/empty upload, authentication, binary storage failure, metadata persistence failure, orphan cleanup failure, network failure, and unknown failures. Raw provider/Firebase errors are never rendered.

## 8. Success projection
The client projects the server response to: opaque fileId, normalized display name, MIME, actual size, status, optional createdAt. `ownerId` and `storageObject` returned by the current backend record are intentionally discarded and never rendered.

## 9. Security audit
Static production-client search for `uploadBytes`, `uploadBytesResumable`, `ref(storage`, and `getStorage(` returned no matches. No browser Firebase Storage write path was added. `/api/files` remains the sole new upload transport used by L2B. No `/api/agent/chat`, Gemini/ADK file input, OCR, extraction, RAG, file Agent capability, file listing/delete, sharing, or project/workspace subsystem was added.

## 10. TDD / tests
Targeted behavioral test file was written before production implementation. Initial execution could not complete because the sandbox had no dependencies and dependency installation could not finish within the execution environment. The test source covers supported type selection, zero/oversize/unsupported precheck, exact canonical endpoint, `authFetch`, raw File body, absence of client authority fields, public response projection, safe error mapping, network recovery, pending duplicate prevention, retry, stale response invalidation, and abort semantics.

Verification attempts:
- `npx vitest run src/modules/home/__tests__/fileUploadClient.test.ts` before implementation: timed out while dependencies were absent.
- `npm ci --no-audit --no-fund`: environment transport timeout.
- `npm ci --no-audit --no-fund --prefer-offline`: environment transport timeout; cache was insufficient and no usable Vitest/TypeScript/React installation remained.

Therefore no runtime test gate is reported PASS.

## 11. Regression / build / QA
- Targeted L2B: NOT VERIFIED in this environment.
- L2A regression: NOT RUN.
- L1 27/27: NOT RUN.
- Capability Bridge 18/18: NOT RUN.
- TypeScript: NOT RUN (dependency installation unavailable).
- Full Vitest: NOT RUN.
- QA Stage 1–5: NOT RUN.
- Production build: NOT RUN.

These gates must be run by canonical GitHub CI / AI Studio before checker can lock L2B.

## 12. Manifest
Final local checksum verification after production changes: 138/138 matched, 0 mismatch, 0 missing.

## 13. Known limitations / deferred
- Runtime verification is externally required because this sandbox could not complete `npm ci`.
- No component-browser test library was added; state/transport behavior is covered at the pure client/reducer layer and UI must additionally be exercised by canonical runtime verification.
- Git branch/HEAD/status cannot be proven from the supplied export because `.git` is absent.
- Chat attachment, document understanding, Gemini input, extraction, file library/list/delete remain deferred exactly as required.

## 14. Final verdict
Implementation is packaged for checker/runtime verification, but **GĐ4 Lượt 2B is not FINAL PASS in this environment** because mandatory runtime gates could not be executed.
