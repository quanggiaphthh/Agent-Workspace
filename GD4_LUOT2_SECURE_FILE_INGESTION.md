# GĐ4 LƯỢT 2 — SECURE FILE INGESTION + VALIDATION PIPELINE

## 1. Baseline and environment

- Canonical baseline: `dd3c6ecc5a363a6cbf40710a73e6cd18203c02ea`.
- The initial local full-suite failure was an environment mismatch only. The canonical workflow `.github/workflows/gd4-luot1-verification.yml` supplies the test-only value `VITE_FIREBASE_API_KEY=ci-test-only-not-a-production-key`.
- With that exact process environment and no source change, baseline re-verification passed: Full Vitest 29/29 files and 271/271 tests, TypeScript, GĐ4 Lượt 1 27/27, and manifest 134/134.

## 2. Source audit and architecture reused

Lượt 1 already established one canonical file domain:

`authenticated Express request -> UserFileService -> Firebase Storage binary -> Firestore user_files record`.

`UserFileService` remains the sole storage/file-record authority. Its UUID file ID, server-generated `users/{owner}/files/{fileId}/blob` object identity, owner association, ready-state record creation, blob-first persistence ordering, and metadata-failure compensation are unchanged.

Lượt 2 adds `FileIngestionService` only as the server-side validation gateway before that authority. It neither writes Storage nor Firestore and introduces no parallel owner, metadata, authorization, rollback, or storage abstraction.

## 3. Ingestion flow

`POST /api/files` parses a bounded raw body, receives the verified request identity, and calls:

`FileIngestionService.ingest(verifiedOwnerId, request) -> UserFileService.store(...)`.

The route has no file type, filename, storage, record, or compensation business logic. The gateway accepts only the server-derived owner and transport fields needed for validation; arbitrary request headers such as owner ID, file ID, and storage key are not read or forwarded as authoritative metadata.

## 4. Validation policy

- Canonical maximum: `MAX_FILE_BYTES = 20 * 1024 * 1024` (20 MiB), reused from Lượt 1.
- Express raw-body parsing enforces the transport limit. The gateway additionally rejects an oversized declared `Content-Length` and independently rejects actual received bytes over the same canonical limit.
- Zero-byte input is `EMPTY_FILE` before filename processing.
- Allowlist remains deliberately narrow: PDF, JPEG, PNG, WebP, plain text, and Markdown.
- A normalized display filename must have an extension allowed for its declared allowlisted MIME type: `.pdf`; `.jpg`/`.jpeg`; `.png`; `.webp`; `.txt`; `.md`/`.markdown`.
- `UserFileService` retains Lượt 1 byte-content validation: lightweight signatures for PDF/JPEG/PNG/WebP; UTF-8/NUL validation for text. Extension never determines MIME or substitutes for byte verification.
- Filename display metadata strips path separators/control characters, trims whitespace, limits to 255 characters, and preserves a valid extension when truncating. It never participates in a storage key.

## 5. Ownership, storage, cleanup, and errors

- Missing verified owner returns `UNAUTHORIZED`; the client cannot select owner, file ID, or object identity.
- The route retains `files.write`; existing verified Firebase Admin identity and permission resolution are reused.
- `UserFileService` remains responsible for blob-write failure, metadata-write cleanup, and `ORPHAN_CLEANUP_FAILED`; Lượt 2 does not add a competing rollback path.
- Deterministic machine-readable error codes include `MALFORMED_UPLOAD`, `INVALID_FILE_BODY`, `UNSUPPORTED_FILE_TYPE`, `FILE_EXTENSION_MISMATCH`, `FILE_TOO_LARGE`, `EMPTY_FILE`, `FILE_TYPE_MISMATCH`, `UNAUTHORIZED`, and the existing storage/persistence codes.
- API responses preserve the existing safe error contract and do not expose Firebase internals, storage objects, absolute paths, or binary content.

## 6. Files changed

- Added `server/core/files/FileIngestionService.ts`.
- Added `server/core/files/__tests__/fileIngestion.test.ts`.
- Updated `server/core/files/filePolicy.ts`.
- Updated `server/core/files/firebaseFileStores.ts`.
- Updated `server.ts`.
- Updated `src/__tests__/integration.test.ts`.
- Updated `PRODUCTION_SOURCE_MANIFEST.sha256`.
- Added this report.

## 7. TDD and tests

RED was observed first for the absent `FileIngestionService`; then route tests failed because the route had no canonical gateway singleton. A later RED test exposed that truncation could discard a valid filename extension; normalization was corrected. A final RED test established that empty payload classification precedes an unusable display filename.

Final targeted evidence, using the canonical test-only environment:

- Ingestion gateway behavior: 16/16 PASS.
- Route behavior filtered to `GĐ4 LƯỢT 2`: 3/3 PASS.
- GĐ4 Lượt 2 behavioral total: 19/19 PASS.
- GĐ4 Lượt 1 foundation regression: 27/27 PASS.
- Capability Tool Bridge: 18/18 PASS.
- Full Vitest: 30/30 files, 290/290 tests PASS.
- TypeScript: `tsc --noEmit` PASS.

The new tests cover valid ingest/authoritative metadata, unsupported type, MIME-extension mismatch, empty file, declared and actual-size limits, hostile POSIX/Windows/absolute filenames, filename length normalization, duplicate filenames, missing owner, signature mismatch, multipart rejection, client metadata spoofing, route use of the canonical gateway, route raw-body limit, and deterministic empty-upload handling. Lượt 1 regression tests retain blob-write failure, metadata-failure cleanup, orphan cleanup failure, foreign-owner isolation, and canonical storage identity coverage.

## 8. Regression, build, and manifest

- QA Stage 1: 22/22 PASS.
- QA Stage 2: 22/22 PASS.
- QA Stage 3A: 8/8 PASS.
- QA Stage 3B: 9/9 PASS.
- QA Stage 3C: 8/8 PASS.
- QA Stage 4A: 20/20 PASS.
- QA Stage 4B: 43/43 PASS.
- QA Stage 4C: 42/42 PASS.
- QA Stage 4D: 40/40 PASS.
- QA Stage 5: 24/24 PASS.
- Production build: PASS. Vite reported pre-existing third-party Rollup comment warnings and a large-chunk advisory; no build error occurred.
- Production manifest: 135/135 matched, 0 mismatch, 0 missing.

## 9. Security audit

Source search confirms the only production Firebase Storage writes remain in `FirebaseBinaryStore`, reached through `UserFileService`; the new gateway calls only `UserFileService.store`. There is no new direct browser Storage path, no new direct Storage writer, no client-authoritative owner/storage identity, and no file content placed in audit metadata.

## 10. Known limitations and deferred work

- Signature checks are intentionally lightweight for the small allowlist; this is not antivirus or deep MIME/content inspection.
- Runtime Firebase bucket IAM access is deployment-dependent and was not probed against a live project.
- Lượt 1's rare cleanup failure remains an explicit `ORPHAN_CLEANUP_FAILED` operational reconciliation case; no background reconciler is introduced.
- OCR, extraction, indexing, embeddings, RAG, agent attachment processing, file list/delete, sharing, and multi-user collaboration remain deferred.

## 11. Final verdict

**FINAL PASS.** No commit, push, deploy, production credential, or GĐ4 Lượt 3 work was performed.
