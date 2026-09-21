# GĐ4 — LƯỢT 1: SECURE FILE DOMAIN + STORAGE FOUNDATION

## 1. Baseline integrity
- Source: `agent-webapp (23).zip` transport received as `agent-webapp (23)(1).zip`.
- SHA-256: `a66000fb402a77f215e9fa3188ca8a34b6162fa287cdcc49fad45f91f43177f8` — MATCH.
- ZIP integrity: PASS.
- Entry count: 228.
- Baseline manifest: 131/131 matched, 0 mismatch, 0 missing.
- `GD3_FINAL_INTEGRATION_VERIFICATION.md`: present.

## 2. Firebase Storage audit
Source contained no `firebase.json`, no `.firebaserc`, and no `storage.rules`. `firestore.rules` exists but is not referenced by a repository `firebase.json`. `firebase-applet-config.json` contains `storageBucket=gen-lang-client-0054211080.firebasestorage.app`. Firebase Admin initialized ADC/projectId and Firestore, but did not initialize Storage. Browser Firebase initialized Auth + Firestore only; no browser Storage authority existed. No emulator/storage configuration was present.

The existing `firebase-admin` dependency provides Admin Storage; Lượt 1 now resolves the configured bucket with `getStorage(app).bucket(firebaseConfig.storageBucket)`. This requires the deployed runtime identity/ADC to have bucket IAM access; no live cloud probe was performed.

## 3. Upload architecture decision
**Canonical path selected: OPTION A — SERVER-MEDIATED.**

`browser -> authenticated Express API -> server MIME/size/content validation -> Firebase Storage -> Firestore metadata`.

Reasons: current application already centralizes identity and authorization on Express/Firebase Admin; browser Storage is not initialized; Storage Rules deployment is not configured in the repository; server-mediated upload gives one validation/ownership authority and is simplest for a private single-user V1. No direct browser Storage upload path or second canonical path was added.

Binary transport is a single raw request body (`POST /api/files`) with MIME in `Content-Type` and display filename in `X-File-Name`; base64-in-JSON and multipart dependencies were avoided.

## 4. Architecture before/after
Before: no file domain, binary store, metadata, file API or resolve primitive.
After: one `UserFileService` domain authority with injectable binary/metadata adapters; production adapters use Firebase Storage + Firestore. Agent registry/gateway/ADK/session/HITL/SSE remain unchanged.

## 5. File domain contract
Public record: `fileId`, `ownerId`, `originalName`, `mimeType`, `sizeBytes`, `status='ready'`, `createdAt`.
Internal metadata additionally stores `storageObject`. Only `ready` is persisted because server-mediated flow creates metadata only after the blob write succeeds. No uploading/pending state is needed in this slice.

## 6. MIME policy
Allowlist: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `text/plain`, `text/markdown`.
PDF/JPEG/PNG/WebP use lightweight signature checks. Text must be UTF-8 round-trippable and contain no NUL byte. Unsupported or declared/content mismatch fails deterministically.

## 7. Size policy
`MAX_FILE_BYTES = 20 * 1024 * 1024` (20 MiB). This is an **application policy**, not a claim about a provider maximum. It is enforced by Express raw-body limit and domain validation.

## 8. Storage identity/path
Server generates UUID file IDs. Object identity is `users/{encodedOwnerId}/files/{fileId}/blob`. User filename is display metadata only and is sanitized; it never forms object identity.

## 9. Metadata model
Firestore collection: `user_files`. Server controls owner, object path, status, verified size and timestamps. `firestore.rules` now explicitly denies browser read/write for this collection, consistent with the existing server-authoritative pattern.

## 10. Ownership/authorization
Firebase Admin verified identity remains authority. Added canonical owner permissions `files.read` and `files.write` to the existing permission catalog. Upload derives owner from `req.user.id`. Resolve maps foreign file IDs to `FILE_NOT_FOUND` (404) to avoid cross-user existence disclosure.

## 11. Consistency/compensation
Blob write occurs first. Metadata is created only after successful blob write, so READY never precedes durable binary write completion. Metadata failure triggers immediate blob deletion. Cleanup failure returns `ORPHAN_CLEANUP_FAILED`, explicitly exposing reconciliation need without claiming success. Metadata-with-missing-blob resolves as `FILE_BLOB_MISSING` (410). Cancellation before write fails; cancellation detected after Storage save deletes the just-written blob before failing.

Retries are explicitly non-deduplicating in this upload foundation: each explicit upload request receives a fresh server UUID. No second idempotency ledger was created. Agent/capability mutation idempotency remains untouched.

## 12. API contract
- `POST /api/files`: authenticated + `files.write`; raw binary body; `Content-Type`; optional URL-encoded `X-File-Name`; returns safe public metadata only.
- `GET /api/files/:fileId`: authenticated + `files.read`; server-authorized resolve of safe metadata only.
No public/signed permanent URL, bucket path, credential or Firebase Admin internal is returned.

## 13. Audit behavior
Reuses `AuditService`. Upload audit metadata contains only fileId, MIME, size, actor and operation context; never file bytes/document text. Audit persistence failure is logged as an operational warning after a successfully durable upload and does not falsely roll back/deny an already-created file.

## 14. Security controls
Verified Firebase identity; existing permission resolver; server-derived owner; UUID object identity; filename sanitation; MIME allowlist; signature/content checks; 20 MiB server limit; no browser Storage authority; no public URL; foreign-ID fail-closed; binary excluded from Firestore/audit/chat; deterministic compensation. File content remains explicitly untrusted data for later Agent integration; no Agent prompt/model ingestion was added.

## 15. Files changed
Production changed: `server.ts`, `server/lib/firebaseAdmin.ts`, `shared/security/permissions.ts`, `firestore.rules`.
Production added: `server/core/files/filePolicy.ts`, `server/core/files/UserFileService.ts`, `server/core/files/firebaseFileStores.ts`.
Tests added: `server/core/files/__tests__/fileStorageFoundation.test.ts`.
Report added: this file.

## 16. Dependencies
No dependency added or upgraded. Existing `firebase-admin`, Express, Node Buffer/crypto and Zod-era architecture are reused. No parser/upload library was added.

## 17. Tests
Targeted behavioral suite added covering supported/unsupported MIME, normal/exact-max/over-max size, filename/path separation, owner derivation, foreign lookup, missing metadata/blob, blob failure, metadata compensation, orphan cleanup failure, durable round-trip, safe descriptor, audit metadata excluding binary, cancellation, retry semantics and signature mismatch.

Runtime execution is **not verified in this environment** because `npm ci` could not complete: the container package-install operation repeatedly timed out, leaving an incomplete `node_modules`. No test PASS is claimed.

## 18. TypeScript
NOT VERIFIED — dependency installation environment blocked. An attempted `tsc --noEmit` after the timed-out install failed because dependency/type packages were incomplete; this is not recorded as an application TypeScript PASS or FAIL.

## 19. Full Vitest
NOT RUN — blocked by incomplete dependency installation.

## 20. QA
NOT RUN — blocked by incomplete dependency installation.

## 21. Build
NOT RUN — blocked by incomplete dependency installation.

## 22. Manifest
Baseline policy covered production source and was extended for the three new production file-domain paths. Old count: 131. New count: 134. Verification after changes: 134 matched, 0 mismatch, 0 missing.

## 23. Remaining risks
1. Runtime Firebase Storage IAM/bucket access must be verified in AI Studio/deployed environment; repository config names a bucket but no live cloud call was permitted here.
2. Repository has no `firebase.json`/Storage Rules deployment configuration. This does not create a browser upload bypass because canonical V1 is server-mediated and browser Storage is not initialized, but deployment configuration should remain explicit if direct Storage access is ever introduced.
3. A rare metadata-write + blob-cleanup failure leaves an inaccessible orphan object and returns `ORPHAN_CLEANUP_FAILED`; no background workflow engine was introduced. Operational reconciliation/lifecycle cleanup can be added only if runtime evidence shows it is needed.
4. Runtime verification remains mandatory before checker acceptance.

## 24. Explicit non-goals
No Agent file capabilities; no Gemini/ADK file input; no chat attachment contract; no SSE/session/history change; no file list/delete; no folders/projects/workspace; no artifact model; no DOCX/XLSX/CSV/archive/remote URL; no direct browser Storage path; no new workflow/auth/registry/gateway/idempotency/audit system.

## 25. Final verdict
**IMPLEMENTATION COMPLETE — RUNTIME VERIFICATION REQUIRED**

The source implementation/checkpoint is prepared, but GĐ4 Lượt 1 is not claimed READY FOR CHECKER because TypeScript/tests/QA/build could not be executed after package installation timed out.
